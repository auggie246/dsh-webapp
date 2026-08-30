// One event downlink pair per ready Host (issue #2): a WebSocket to
// /api/events.mux and one to /api/events.host, opened by the app itself so
// notifications fire even when no Host page is focused — or loaded at all.
// Reconnects run on exponential backoff (500 ms doubling to 8 s, reset on
// open). Router state lives per Host and survives reconnects, so the mux's
// reconnect replay of pending approval/question frames does not re-notify.
import { frameStream, type EventStream } from "../shared/event-frame.js";
import { parseEventEnvelope } from "../shared/event-frame.js";
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

export interface HostEventWatchesDeps {
  log?(...parts: unknown[]): void;
  onIntent(hostId: string, intent: NotificationIntent): void;
}

interface Link {
  hostId: string;
  label: string;
  port: number;
  router: HostEventRouter;
  sockets: WebSocket[];
  retryTimer: NodeJS.Timeout | null;
  retryDelay: number;
  stopped: boolean;
}

export class HostEventWatches {
  private links = new Map<string, Link>();

  constructor(private readonly deps: HostEventWatchesDeps) {}

  /**
   * Reconciles links with the bar state: open for every ready Host, close
   * for everything else. Idempotent — ready Hosts re-emit their state often.
   */
  sync(state: HostBarState): void {
    const live = new Set<string>();
    for (const host of state.hosts) {
      if (host.status !== "ready" || host.port === 0) continue;
      live.add(host.id);
      const existing = this.links.get(host.id);
      if (existing) {
        if (existing.port === host.port && existing.label === host.label) continue;
        this.closeLink(existing);
      }
      this.openLink(host.id, host.label, host.port);
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

  private openLink(hostId: string, label: string, port: number): void {
    const link: Link = {
      hostId,
      label,
      port,
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
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://127.0.0.1:${link.port}${eventPath.path}`);
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
