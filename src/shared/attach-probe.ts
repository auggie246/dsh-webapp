// The Attach half of attach-or-spawn (issue #1): ask a loopback port whether
// a Host answers there, with the same POST the web GUI itself sends. The
// prototype (issue #4) confirmed this envelope and the ok shape.
import { randomUUID } from "node:crypto";

export interface HostInfo {
  version?: string;
  home?: string;
  attachedSessions?: number;
}

export type ProbeResult =
  | { ok: true; info: HostInfo }
  | { ok: false; reason: string };

export interface ProbeOptions {
  timeoutMs?: number;
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

export async function probeHost(
  port: number,
  options: ProbeOptions = {}
): Promise<ProbeResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(`http://127.0.0.1:${port}/api/host.describe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: hostDescribeEnvelope(randomUUID()),
      signal: controller.signal,
    });
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
