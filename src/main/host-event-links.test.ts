// The event sockets must authenticate like the page does (issue #8): mint a
// session cookie from the Host's launch token, then open with that Cookie
// header. Legacy tokenless Hosts open exactly as before.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HostEventWatches, type EventSocket, type SocketOpener } from "./host-event-links.js";
import type { HostBarState } from "../shared/host-bar-protocol.js";

function readyState(host: { id: string; port: number }): HostBarState {
  return {
    hosts: [{ id: host.id, label: "Host 1", kind: "spawn", port: host.port, status: "ready", active: true }],
  };
}

interface FakeSocket {
  addEventListener(type: string, listener: (event?: { data?: unknown }) => void): void;
  emit(type: "open" | "close" | "error" | "message", event?: { data?: unknown }): void;
  close(): void;
  closeCalls: number;
}

function makeFakeSocket(): FakeSocket {
  const listeners = new Map<string, ((event?: { data?: unknown }) => void)[]>();
  const socket: FakeSocket = {
    closeCalls: 0,
    addEventListener(type, listener) {
      const bucket = listeners.get(type) ?? [];
      bucket.push(listener);
      listeners.set(type, bucket);
    },
    emit(type, event) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
    },
    close() {
      socket.closeCalls += 1;
    },
  };
  return socket;
}

interface Harness {
  watches: HostEventWatches;
  opened: { url: string; cookie?: string }[];
  sockets: FakeSocket[];
  fetchCalls: { url: string }[];
  close(): void;
}

function makeHarness(options: { token?: string; fetchStatus?: number } = {}): Harness {
  const opened: { url: string; cookie?: string }[] = [];
  const sockets: FakeSocket[] = [];
  const fetchCalls: { url: string }[] = [];
  const openSocket: SocketOpener = (url, cookie) => {
    opened.push({ url, cookie });
    const socket = makeFakeSocket();
    sockets.push(socket);
    return socket as unknown as EventSocket;
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      fetchCalls.push({ url });
      const response = new Response(options.fetchStatus === 401 ? "unauthorized" : null, {
        status: options.fetchStatus ?? 303,
        headers:
          options.fetchStatus === 401
            ? {}
            : { "set-cookie": "dsh-auth-abc=v1.cGF5bG9hZA.sig; Path=/; HttpOnly" },
      });
      Object.defineProperty(response, "url", { value: url });
      return response;
    })
  );
  const watches = new HostEventWatches({
    onIntent: vi.fn(),
    ...(options.token === undefined ? {} : { tokenFor: () => options.token }),
    openSocket,
  });
  return {
    watches,
    opened,
    sockets,
    fetchCalls,
    close: () => vi.unstubAllGlobals(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("HostEventWatches with an authenticating Host (issue #8)", () => {
  test("mints the session cookie from the token and opens both sockets with it", async () => {
    const harness = makeHarness({ token: "s3cret-token" });
    harness.watches.sync(readyState({ id: "h-1", port: 4123 }));
    await vi.waitFor(() => {
      expect(harness.opened).toHaveLength(2);
    });

    expect(harness.fetchCalls).toHaveLength(2);
    expect(harness.fetchCalls[0]?.url).toBe("http://127.0.0.1:4123/?token=s3cret-token");
    expect(harness.opened.map((open) => open.url)).toEqual([
      "ws://127.0.0.1:4123/api/events.mux",
      "ws://127.0.0.1:4123/api/events.host",
    ]);
    expect(harness.opened.every((open) => open.cookie === "dsh-auth-abc=v1.cGF5bG9hZA.sig")).toBe(true);
    harness.close();
  });

  test("retries through the backoff when the Host rejects the token", async () => {
    const harness = makeHarness({ token: "stale-token", fetchStatus: 401 });
    harness.watches.sync(readyState({ id: "h-1", port: 4124 }));
    await vi.waitFor(() => {
      expect(harness.fetchCalls).toHaveLength(2);
    });
    expect(harness.opened).toEqual([]);

    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => {
      expect(harness.fetchCalls.length).toBe(4);
    });
    expect(harness.opened).toEqual([]);
    harness.close();
  });

  test("a closed socket reconnects and mints a fresh cookie", async () => {
    const harness = makeHarness({ token: "s3cret-token" });
    harness.watches.sync(readyState({ id: "h-1", port: 4125 }));
    await vi.waitFor(() => {
      expect(harness.opened).toHaveLength(2);
    });

    harness.sockets[0]?.emit("close");
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => {
      expect(harness.opened).toHaveLength(3);
    });
    expect(harness.opened[2]?.cookie).toBe("dsh-auth-abc=v1.cGF5bG9hZA.sig");
    harness.close();
  });
});

describe("HostEventWatches with a legacy tokenless Host", () => {
  test("opens both sockets without a cookie and without a token exchange", async () => {
    const harness = makeHarness();
    harness.watches.sync(readyState({ id: "h-1", port: 4126 }));
    await vi.waitFor(() => {
      expect(harness.opened).toHaveLength(2);
    });

    expect(harness.fetchCalls).toEqual([]);
    expect(harness.opened.every((open) => open.cookie === undefined)).toBe(true);
    harness.close();
  });
});

describe("HostEventWatches with a modern remote-API Host (issue #8)", () => {
  test("opens no sockets — the old event paths are gone; logged once", async () => {
    const log = vi.fn();
    const harness = makeHarness({ token: "s3cret-token" });
    harness.watches = new HostEventWatches({
      onIntent: vi.fn(),
      tokenFor: () => "s3cret-token",
      modernFor: () => true,
      openSocket: () => {
        throw new Error("must not open sockets for a modern Host");
      },
      log,
    });
    harness.watches.sync(readyState({ id: "h-1", port: 4127 }));
    harness.watches.sync(readyState({ id: "h-1", port: 4127 }));

    expect(harness.opened).toEqual([]);
    expect(harness.fetchCalls).toEqual([]);
    expect(log.mock.calls.filter((call) => String(call[0]).includes("remote API"))).toHaveLength(1);
    harness.close();
  });
});
