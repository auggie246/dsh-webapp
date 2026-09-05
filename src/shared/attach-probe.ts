// The Attach half of attach-or-spawn (issue #1): ask a loopback port whether
// a Host answers there, with the same POST the web GUI itself sends. The
// prototype (issue #4) confirmed this envelope and the ok shape.
//
// Since DSH 0.1.2-rc.1 (issue #8) the Host authenticates every request: the
// launch token printed in its URL line is only honored on `GET /?token=…`,
// which mints the session cookie the API then requires. When the caller has
// the token, this probe does the same exchange a browser does before its
// POST. A 401 without (or with a rejected) token is not "not a Host" — it is
// the Host announcing that it needs its authenticated URL.
//
// The API surface also moved: the modern probe pings `settings/describe` on
// the remote API (any server-response envelope proves a Host; it carries no
// version), and a 404 falls back to the pre-auth `host.describe`, whose
// answer still reports the version.
import { randomUUID } from "node:crypto";

export interface HostInfo {
  version?: string;
  home?: string;
  attachedSessions?: number;
  /** Set when the Host answered the authenticated 0.1.2-class API (issue #8). */
  modern?: true;
}

export type ProbeResult =
  | { ok: true; info: HostInfo }
  | { ok: false; reason: string; /** True when the Host answers but demands its authenticated URL. */ authRequired?: true };

export interface ProbeOptions {
  timeoutMs?: number;
  /** The Host's launch token (from its `dsh web:` line); mints the probe's session cookie. */
  token?: string;
  fetchImpl?: typeof fetch;
}

export function hostDescribeEnvelope(rpcId: string): string {
  return JSON.stringify({
    type: "client-request",
    rpcId,
    method: "host.describe",
    payload: {},
  });
}

/** The client-request envelope the modern remote API expects (`args` wrapper). */
export function remotePingEnvelope(rpcId: string, endpoint: string): string {
  return JSON.stringify({
    type: "client-request",
    rpcId,
    method: endpoint,
    payload: { args: {} },
  });
}

/** Any `server-response` envelope proves a modern Host, even a failure result. */
function isServerResponse(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as DescribeBody).type === "server-response";
}

interface DescribeBody {
  type?: unknown;
  result?: unknown;
}

/** Narrows the describe answer to a `server-response` with `ok: true`. */
function okValue(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null) return null;
  if ((body as DescribeBody).type !== "server-response") return null;
  const result = (body as DescribeBody).result;
  if (typeof result !== "object" || result === null) return null;
  if ((result as { ok?: unknown }).ok !== true) return null;
  const value = (result as { value?: unknown }).value;
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Trade the launch token for the session cookie, exactly the exchange the
 * browser performs when it opens the Host's authenticated URL: a GET of `/`
 * with the token, answered by a 303 whose `Set-Cookie` carries the
 * authority-bound session. Returns the bare cookie pairs, or
 * `unauthorized` when the Host rejects the token. Shared by the probe and
 * the main-process event sockets (issue #8).
 */
export async function sessionCookieForToken(
  port: number,
  token: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}
): Promise<{ cookie?: string; unauthorized?: true }> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(
    `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`,
    { method: "GET", redirect: "manual", signal: options.signal }
  );
  if (response.status === 401) return { unauthorized: true };
  const cookies = response.headers.getSetCookie();
  const cookie = cookies
    .map((pair) => pair.split(";")[0]?.trim() ?? "")
    .filter((pair) => pair !== "")
    .join("; ");
  return cookie === "" ? { unauthorized: true } : { cookie };
}

const AUTH_REQUIRED: ProbeResult = {
  ok: false,
  reason: "HTTP 401 (dsh web authentication required)",
  authRequired: true,
};

const MODERN_PING_ENDPOINT = "settings/describe";

/** The modern remote API: any `server-response` envelope proves a Host. */
async function probeModern(
  port: number,
  cookie: string | undefined,
  doFetch: typeof fetch,
  signal: AbortSignal
): Promise<ProbeResult | null> {
  const response = await doFetch(`http://127.0.0.1:${port}/api/${MODERN_PING_ENDPOINT}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: remotePingEnvelope(randomUUID(), MODERN_PING_ENDPOINT),
    signal,
  });
  if (response.status === 401) return AUTH_REQUIRED;
  if (response.status !== 200) return null;
  const body = (await response.json().catch(() => null)) as unknown;
  if (!isServerResponse(body)) return null;
  return { ok: true, info: { modern: true } };
}

/** The pre-authentication API: `host.describe` reports the Host's version. */
async function probeLegacy(
  port: number,
  cookie: string | undefined,
  doFetch: typeof fetch,
  signal: AbortSignal
): Promise<ProbeResult> {
  const response = await doFetch(`http://127.0.0.1:${port}/api/host.describe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: hostDescribeEnvelope(randomUUID()),
    signal,
  });
  if (response.status === 401) return AUTH_REQUIRED;
  if (response.status !== 200) {
    return { ok: false, reason: `HTTP ${response.status}` };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  const value = okValue(body);
  if (!value) {
    return { ok: false, reason: "port answered but not as a Host (host.describe not ok)" };
  }
  return {
    ok: true,
    info: {
      version: textOf(value.version),
      home: textOf(value.home),
      attachedSessions:
        typeof value.attachedSessions === "number" ? value.attachedSessions : undefined,
    },
  };
}

export async function probeHost(
  port: number,
  options: ProbeOptions = {}
): Promise<ProbeResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let cookie: string | undefined;
    if (options.token !== undefined) {
      const exchange = await sessionCookieForToken(port, options.token, {
        fetchImpl: doFetch,
        signal: controller.signal,
      });
      // A rejected token (or a pre-auth Host that never mints one) is not
      // fatal here: the probes below decide with a real request.
      if (!exchange.unauthorized) cookie = exchange.cookie;
    }
    const modern = await probeModern(port, cookie, doFetch, controller.signal);
    if (modern !== null) return modern;
    return await probeLegacy(port, cookie, doFetch, controller.signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const aborted = message.toLowerCase().includes("abort");
    return {
      ok: false,
      reason: aborted ? `no answer within ${timeoutMs}ms` : message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function textOf(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
