import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { probeHost } from "./attach-probe.js";

const OK_BODY = JSON.stringify({
  type: "server-response",
  rpcId: "ignored",
  result: {
    ok: true,
    value: { version: "0.1.1-rc.2", home: "/Users/augustine/.dsh", attachedSessions: 2 },
  },
});

interface TestHostServer {
  port: number;
  lastBody: string | null;
  lastContentType: string | null;
  close: () => Promise<void>;
}

async function startHostServer(
  reply: { status?: number; body?: string; hang?: boolean } = {}
): Promise<TestHostServer> {
  let lastBody: string | null = null;
  let lastContentType: string | null = null;
  const server: Server = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      lastBody = body;
      lastContentType = req.headers["content-type"] ?? null;
      if (reply.hang) return; // never respond
      res.statusCode = reply.status ?? 200;
      res.setHeader("content-type", "application/json");
      res.end(reply.body ?? OK_BODY);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  let closed = false;
  return {
    port,
    get lastBody() {
      return lastBody;
    },
    get lastContentType() {
      return lastContentType;
    },
    close: () => {
      if (closed) return Promise.resolve();
      closed = true;
      return new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
}

const servers: TestHostServer[] = [];
async function started(
  reply?: Parameters<typeof startHostServer>[0]
): Promise<TestHostServer> {
  const server = await startHostServer(reply);
  servers.push(server);
  return server;
}

afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

describe("probeHost", () => {
  test("answers ok with the Host's version and home", async () => {
    const server = await started();
    const result = await probeHost(server.port, { timeoutMs: 2000 });
    expect(result).toEqual({
      ok: true,
      info: { version: "0.1.1-rc.2", home: "/Users/augustine/.dsh", attachedSessions: 2 },
    });
  });

  test("sends the host.describe client-request envelope as JSON", async () => {
    const server = await started();
    await probeHost(server.port, { timeoutMs: 2000 });
    const envelope = JSON.parse(server.lastBody ?? "{}") as Record<string, unknown>;
    expect(envelope.type).toBe("client-request");
    expect(envelope.method).toBe("host.describe");
    expect(typeof envelope.rpcId).toBe("string");
    expect(server.lastContentType).toContain("application/json");
  });

  test("refuses a server that answers not-ok", async () => {
    const server = await started({
      body: JSON.stringify({ type: "server-response", result: { ok: false } }),
    });
    const result = await probeHost(server.port, { timeoutMs: 2000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/host\.describe/);
  });

  test("refuses a non-200 answer", async () => {
    const server = await started({ status: 403, body: "{}" });
    const result = await probeHost(server.port, { timeoutMs: 2000 });
    expect(result).toEqual({ ok: false, reason: "HTTP 403" });
  });

  test("refuses when no Host is listening", async () => {
    const server = await started();
    const deadPort = server.port;
    await server.close();
    const result = await probeHost(deadPort, { timeoutMs: 2000 });
    expect(result.ok).toBe(false);
  });

  test("gives up after the timeout when the Host never answers", async () => {
    const server = await started({ hang: true });
    const startedAt = Date.now();
    const result = await probeHost(server.port, { timeoutMs: 150 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/150ms/);
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });
});
