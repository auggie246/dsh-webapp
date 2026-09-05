// One event downlink pair per ready Host (issue #2): a WebSocket to
// /api/events.mux and one to /api/events.host, opened by the app itself so
// notifications fire even when no Host page is focused — or loaded at all.
// Reconnects run on exponential backoff (500 ms doubling to 8 s, reset on
// open). Router state lives per Host and survives reconnects, so the mux's
// reconnect replay of pending approval/question frames does not re-notify.
//
// Since DSH 0.1.2-rc.1 (issue #8) the upgrade handshake needs the Host's
// session cookie: each connect first mints it by trading the Host's launch
// token for the cookie (the same exchange the page performs), then opens the
// socket with that Cookie header — Node's own WebSocket cannot send one, so
// the opener uses `ws`. Legacy tokenless Hosts connect exactly as before.
import { WebSocket as NodeWebSocket } from "ws";
import { frameStream, type EventStream } from "../shared/event-frame.js";
import { parseEventEnvelope } from "../shared/event-frame.js";
import { sessionCookieForToken } from "../shared/attach-probe.js";
import {
  HostEventRouter,
  type NotificationIntent,
} from "../shared/host-event-router.js";
import type { HostBarState } from "../shared/host-bar-protocol.js";

const EVENT_PATHS: { path: string; stream: EventStream }[] = [
  { path: "/api/events.mux", stream: "mux" },
  { path: "/api/events.host", stream: "host" },
];
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 8000;

/** The one slice of a WebSocket client this module drives. */
export interface EventSocket {
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close" | "error", listener: () => void): void;
  close(): void;
}

/** Opens one socket; `cookie` carries the Host's minted session. */
export type SocketOpener = (url: string, cookie?: string) => EventSocket;

function wsSocketOpener(url: string, cookie?: string): EventSocket {
  return new NodeWebSocket(url, {
    ...(cookie === undefined ? {} : { headers: { cookie } }),
  });
}

export interface HostEventWatchesDeps {
  log?(...parts: unknown[]): void;
  onIntent(hostId: string, intent: NotificationIntent): void;
  /** The Host's launch token, when the app knows one (issue #8). */
  tokenFor?(hostId: string): string | undefined;
  /** Whether the Host serves the authenticated 0.1.2-class API (issue #8). */
  modernFor?(hostId: string): boolean;
  /** Socket construction; defaults to `ws` with the session cookie header. */
  openSocket?: SocketOpener;
}

interface Link {
  hostId: string;
  label: string;
  port: number;
  token?: string;
  router: HostEventRouter;
  sockets: EventSocket[];
  retryTimer: NodeJS.Timeout | null;
  retryDelay: number;
  stopped: boolean;
}

export class HostEventWatches {
  private links = new Map<string, Link>();
  /** Hosts already told about the deferred modern-event port (issue #8). */
  private readonly modernNoticed = new Set<string>();

  constructor(private readonly deps: HostEventWatchesDeps) {}

  /**
   * Reconciles links with the bar state: open for every ready Host, close
   * for everything else. Idempotent — ready Hosts re-emit their state often.
   */
  sync(state: HostBarState): void {
    const live = new Set<string>();
    for (const host of state.hosts) {
      if (host.status !== "ready" || host.port === 0) continue;
      // A 0.1.2-class Host no longer serves /api/events.*: its forwarded
      // events moved to the remote.mux protocol (issue #8). Opening the old
      // paths would only spam retries, so modern Hosts get no link until
      // that port lands — logged once so the silence is explained.
      if (this.deps.modernFor?.(host.id) === true) {
        const existing = this.links.get(host.id);
        if (existing) {
          this.closeLink(existing);
          this.links.delete(host.id);
        }
        if (!this.modernNoticed.has(host.id)) {
          this.modernNoticed.add(host.id);
          this.deps.log?.(
            `events: ${host.label} speaks the 0.1.2 remote API; notifications wait for the remote.mux port (issue #8)`
          );
        }
        continue;
      }
      live.add(host.id);
      const existing = this.links.get(host.id);
      if (existing) {
        if (existing.port === host.port && existing.label === host.label) continue;
        this.closeLink(existing);
      }
      this.openLink(host.id, host.label, host.port, this.deps.tokenFor?.(host.id));
    }
    for (const [id, link] of this.links) {
      if (!live.has(id)) {
        this.closeLink(link);
        this.links.delete(id);
      }
    }
  }

  dispose(): void {
    for (const link of this.links.values()) this.closeLink(link);
    this.links.clear();
  }

  private openLink(hostId: string, label: string, port: number, token?: string): void {
    const link: Link = {
      hostId,
      label,
      port,
      ...(token === undefined ? {} : { token }),
      router: new HostEventRouter({ hostLabel: label }),
      sockets: [],
      retryTimer: null,
      retryDelay: RETRY_BASE_MS,
      stopped: false,
    };
    this.links.set(hostId, link);
    this.deps.log?.(`events: watching ${label} on port ${port}`);
    for (const eventPath of EVENT_PATHS) this.connect(link, eventPath);
  }

  private connect(link: Link, eventPath: { path: string; stream: EventStream }): void {
    if (link.stopped) return;
    void this.openSocket(link, eventPath);
  }

  private async openSocket(
    link: Link,
    eventPath: { path: string; stream: EventStream }
  ): Promise<void> {
    let cookie: string | undefined;
    if (link.token !== undefined) {
      try {
        const minted = await sessionCookieForToken(link.port, link.token);
        if (minted.unauthorized || minted.cookie === undefined) {
          this.deps.log?.(`events: ${link.label} did not accept its token`);
          this.scheduleRetry(link, eventPath);
          return;
        }
        cookie = minted.cookie;
      } catch (error) {
        this.deps.log?.("events: session exchange failed:", error);
        this.scheduleRetry(link, eventPath);
        return;
      }
    }
    if (link.stopped) return;
    let socket: EventSocket;
    try {
      socket = (this.deps.openSocket ?? wsSocketOpener)(
        `ws://127.0.0.1:${link.port}${eventPath.path}`,
        cookie
      );
    } catch (error) {
      this.deps.log?.("events: socket construction failed:", error);
      this.scheduleRetry(link, eventPath);
      return;
    }
    link.sockets.push(socket);
    socket.addEventListener("open", () => {
      link.retryDelay = RETRY_BASE_MS;
      this.deps.log?.(`events: connected ${link.label} ${eventPath.path}`);
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      const envelope = parseEventEnvelope(event.data);
      // Each frame type belongs to one downlink (mirroring the Host's own
      // client); the same frame on both sockets must not notify twice.
      if (!envelope || frameStream(envelope.frame) !== eventPath.stream) return;
      for (const intent of link.router.ingest(envelope.rpcId, envelope.frame)) {
        this.deps.onIntent(link.hostId, intent);
      }
    });
    const goodbye = () => {
      link.sockets = link.sockets.filter((open) => open !== socket);
      if (!link.stopped) this.scheduleRetry(link, eventPath);
    };
    socket.addEventListener("close", goodbye);
    socket.addEventListener("error", goodbye);
  }

  private scheduleRetry(
    link: Link,
    eventPath: { path: string; stream: EventStream }
  ): void {
    if (link.stopped || link.retryTimer) return;
    const delay = link.retryDelay;
    link.retryDelay = Math.min(RETRY_MAX_MS, link.retryDelay * 2);
    const timer = setTimeout(() => {
      link.retryTimer = null;
      this.connect(link, eventPath);
    }, delay);
    timer.unref?.();
    link.retryTimer = timer;
  }

  private closeLink(link: Link): void {
    link.stopped = true;
    if (link.retryTimer) {
      clearTimeout(link.retryTimer);
      link.retryTimer = null;
    }
    for (const socket of link.sockets) {
      try {
        socket.close();
      } catch {
        // Already closed; nothing to tear down.
      }
    }
    link.sockets = [];
  }
}
