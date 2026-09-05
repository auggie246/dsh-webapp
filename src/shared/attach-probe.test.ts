import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { probeHost } from "./attach-probe.js";

const OK_BODY = JSON.stringify({
  type: "server-response",
  rpcId: "ignored",
  result: {
    ok: true,
    value: { version: "0.1.2-rc.1", home: "/Users/augustine/.dsh", attachedSessions: 2 },
  },
});

const UNAUTHORIZED_BODY = "dsh web authentication required; reopen the URL printed by dsh web.\n";
const SESSION_COOKIE = "dsh-auth-cerrt6fk2a=v1.cGF5bG9hZA.sig";

interface FakeRequest {
  method: string | undefined;
  url: string | null;
  cookie: string | null;
  body: string | null;
}

interface FakeHost {
  port: number;
  lastPath: string | null;
  lastBody: string | null;
  lastContentType: string | null;
  lastCookie: string | null;
  requests: FakeRequest[];
  close: () => Promise<void>;
}

interface FakeReply {
  status?: number;
  body?: string;
  hang?: boolean;
  auth?: { token: string };
  /** When set, the modern settings/describe endpoint answers (else 404). */
  modern?: { status?: number; body?: string };
}

async function startFakeHost(reply: FakeReply = {}): Promise<FakeHost> {
  const requests: FakeRequest[] = [];
  let lastPath: string | null = null;
  let lastBody: string | null = null;
  let lastContentType: string | null = null;
  let lastCookie: string | null = null;
  const httpServer: Server = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const cookie = req.headers["cookie"] ?? null;
      const path = req.url ?? "";
      requests.push({ method: req.method, url: req.url ?? null, cookie, body });
      lastPath = req.url ?? null;
      lastBody = body;
      lastContentType = req.headers["content-type"] ?? null;
      lastCookie = cookie;
      if (reply.hang) return; // never respond
      if (reply.auth && req.method === "GET" && path.startsWith("/?token=")) {
        // A 0.1.2-rc.1 Host: GET /?token=<t> mints the session cookie.
        if (path === `/?token=${encodeURIComponent(reply.auth.token)}`) {
          res.statusCode = 303;
          res.setHeader("location", "/");
          res.setHeader("set-cookie", `${SESSION_COOKIE}; Path=/; HttpOnly; SameSite=Strict`);
          res.end();
        } else {
          res.statusCode = 401;
          res.end(UNAUTHORIZED_BODY);
        }
        return;
      }
      // Every other request needs the session cookie on an auth Host; the
      // path dispatch is otherwise the same for both Host generations.
      if (reply.auth && req.headers["cookie"] !== SESSION_COOKIE) {
        res.statusCode = 401;
        res.setHeader("content-type", "application/json");
        res.end(UNAUTHORIZED_BODY);
        return;
      }
      if (path === "/api/settings/describe") {
        // A pre-auth Host does not know the modern endpoint at all.
        res.statusCode = reply.modern ? (reply.modern.status ?? 200) : 404;
        res.setHeader("content-type", "application/json");
        res.end(res.statusCode === 200 ? (reply.modern?.body ?? reply.body ?? OK_BODY) : "not found");
        return;
      }
      res.statusCode = reply.status ?? 200;
      res.setHeader("content-type", "application/json");
      res.end(reply.body ?? OK_BODY);
    });
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const port = (httpServer.address() as AddressInfo).port;
  let closed = false;
  return {
    port,
    get lastPath() {
      return lastPath;
    },
    get lastBody() {
      return lastBody;
    },
    get lastContentType() {
      return lastContentType;
    },
    get lastCookie() {
      return lastCookie;
    },
    get requests() {
      return requests;
    },
    close: () => {
      if (closed) return Promise.resolve();
      closed = true;
      return new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}

const fakeHosts: FakeHost[] = [];
async function started(reply?: FakeReply): Promise<FakeHost> {
  const fakeHost = await startFakeHost(reply);
  fakeHosts.push(fakeHost);
  return fakeHost;
}

afterAll(async () => {
  await Promise.all(fakeHosts.map((fake) => fake.close()));
});

describe("probeHost", () => {
  test("answers ok with the Host's version and home", async () => {
    const fakeHost = await started();
    const result = await probeHost(fakeHost.port, { timeoutMs: 2000 });
    expect(result).toEqual({
      ok: true,
      info: { version: "0.1.2-rc.1", home: "/Users/augustine/.dsh", attachedSessions: 2 },
    });
  });

  test("pings the modern endpoint first, then falls back to host.describe", async () => {
    const fakeHost = await started();
    await probeHost(fakeHost.port, { timeoutMs: 2000 });
    expect(fakeHost.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "POST /api/settings/describe",
      "POST /api/host.describe",
    ]);
  });

  test("sends the host.describe client-request envelope as JSON", async () => {
    const fakeHost = await started();
    await probeHost(fakeHost.port, { timeoutMs: 2000 });
    const describe = fakeHost.requests.find((request) => request.url === "/api/host.describe");
    const envelope = JSON.parse(describe?.body ?? "{}") as Record<string, unknown>;
    expect(envelope.type).toBe("client-request");
    expect(envelope.method).toBe("host.describe");
    expect(typeof envelope.rpcId).toBe("string");
    expect(fakeHost.lastContentType).toContain("application/json");
  });

  test("accepts a modern Host that answers the authenticated API (issue #8)", async () => {
    const fakeHost = await started({ modern: {} });
    const result = await probeHost(fakeHost.port, { timeoutMs: 2000 });
    expect(result).toEqual({ ok: true, info: { modern: true } });
    const ping = fakeHost.requests.find((request) => request.url === "/api/settings/describe");
    const envelope = JSON.parse(ping?.body ?? "{}") as Record<string, unknown>;
    expect(envelope.method).toBe("settings/describe");
    expect(envelope.payload).toEqual({ args: {} });
  });

  test("refuses a fake Host that answers not-ok", async () => {
    const fakeHost = await started({
      body: JSON.stringify({ type: "server-response", result: { ok: false } }),
    });
    const result = await probeHost(fakeHost.port, { timeoutMs: 2000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/host\.describe/);
  });

  test("refuses a non-200 answer", async () => {
    const fakeHost = await started({ status: 403, body: "{}" });
    const result = await probeHost(fakeHost.port, { timeoutMs: 2000 });
    expect(result).toEqual({ ok: false, reason: "HTTP 403" });
  });

  test("refuses when no Host is listening", async () => {
    const fakeHost = await started();
    const deadPort = fakeHost.port;
    await fakeHost.close();
    const result = await probeHost(deadPort, { timeoutMs: 2000 });
    expect(result.ok).toBe(false);
  });

  test("gives up after the timeout when the Host never answers", async () => {
    const fakeHost = await started({ hang: true });
    const startedAt = Date.now();
    const result = await probeHost(fakeHost.port, { timeoutMs: 150 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/150ms/);
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });
});

describe("probeHost against an authenticating Host (issue #8)", () => {
  test("exchanges the token for the session cookie, then pings with it", async () => {
    const fakeHost = await started({ auth: { token: "s3cret-token" }, modern: {} });
    const result = await probeHost(fakeHost.port, {
      token: "s3cret-token",
      timeoutMs: 2000,
    });
    expect(result).toEqual({ ok: true, info: { modern: true } });
    expect(fakeHost.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET /?token=s3cret-token",
      "POST /api/settings/describe",
    ]);
    expect(fakeHost.lastCookie).toBe(SESSION_COOKIE);
  });

  test("falls back to host.describe with the cookie on a legacy answer", async () => {
    const fakeHost = await started({ auth: { token: "s3cret-token" } });
    const result = await probeHost(fakeHost.port, {
      token: "s3cret-token",
      timeoutMs: 2000,
    });
    expect(result).toEqual({
      ok: true,
      info: { version: "0.1.2-rc.1", home: "/Users/augustine/.dsh", attachedSessions: 2 },
    });
    const describe = fakeHost.requests.find((request) => request.url === "/api/host.describe");
    expect(describe?.cookie).toBe(SESSION_COOKIE);
  });

  test("reports authRequired when no token is supplied", async () => {
    const fakeHost = await started({ auth: { token: "s3cret-token" } });
    const result = await probeHost(fakeHost.port, { timeoutMs: 2000 });
    expect(result).toEqual({
      ok: false,
      reason: "HTTP 401 (dsh web authentication required)",
      authRequired: true,
    });
  });

  test("reports authRequired when the Host rejects the token", async () => {
    const fakeHost = await started({ auth: { token: "s3cret-token" } });
    const result = await probeHost(fakeHost.port, {
      token: "stale-token",
      timeoutMs: 2000,
    });
    expect(result).toEqual({
      ok: false,
      reason: "HTTP 401 (dsh web authentication required)",
      authRequired: true,
    });
  });
});
