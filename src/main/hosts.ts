// The Host registry (issue #1): every Host the bar lists, its live state, its
// child process when Spawned, and its WebContentsView when ready. Startup
// follows the bar file; an empty bar follows attach-or-spawn on the default
// port. Persistence (item 4), retry-on-click, and the quit-kill inventory
// (item 6) all read from this one place.
import { randomUUID } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import type { WebContentsView } from "electron";
import { probeHost } from "../shared/attach-probe";
import { assessHostCompatibility } from "../shared/host-compatibility";
import { augmentChildPath, resolveDshBinary } from "../shared/dsh-binary";
import {
  loadHostBar,
  saveHostBar,
  type BarEntry,
} from "../shared/host-bar-store";
import type { HostBarState, HostStatus } from "../shared/host-bar-protocol";
import { spawnHostUntilUrl } from "../shared/spawn-host";
import { terminateAll } from "../shared/terminate-all";
import { hostWebUrl } from "../shared/url-line";

export const DEFAULT_ATTACH_PORT = 3080;

function incompatibleHostMessage(actual: string | undefined, minimum: string): string {
  const received = actual ?? "an unknown version";
  return `Host compatibility version ${received} is incompatible. DSH Desktop requires ${minimum} or later.`;
}

export interface HostViewsSink {
  put(id: string, view: WebContentsView, visible: boolean): void;
  show(id: string | null): void;
  remove(id: string): void;
}

export interface HostManagerDeps {
  barFile: string;
  onChanged(state: HostBarState): void;
  createView(url: string): WebContentsView;
  views: HostViewsSink;
  log?(...parts: unknown[]): void;
}

interface HostRecord {
  entry: BarEntry;
  status: HostStatus;
  child?: ChildProcess;
  url?: string;
  view?: WebContentsView;
  /** The Host's launch token (issue #8); never exposed to the renderer. */
  token?: string;
  /** Whether the Host serves the authenticated 0.1.2-class API (issue #8). */
  modern?: boolean;
  /** Why a Host is offline; surfaced as its bar note (issue #8). */
  note?: string;
}

export class HostManager {
  private records = new Map<string, HostRecord>();
  private activeId: string | null = null;
  private setupMessage: string | null = null;
  private setupId: string | null = null;
  /** Records whose start flow is in flight; guards double-starts. */
  private starting = new Set<string>();

  constructor(private readonly deps: HostManagerDeps) {}

  hostBarState(): HostBarState {
    return {
      hosts: [...this.records.values()].map((record) => ({
        id: record.entry.id,
        label: record.entry.label,
        kind: record.entry.kind,
        port: record.entry.port,
        status: record.status,
        active: record.entry.id === this.activeId,
        ...(record.status === "offline" && record.note !== undefined
          ? { note: record.note }
          : {}),
      })),
      setup: this.setupMessage && this.setupId === this.activeId
        ? { message: this.setupMessage }
        : undefined,
    };
  }

  /** Live Spawned children, for the quit-kill ladder. */
  children(): ChildProcess[] {
    return [...this.records.values()]
      .map((record) => record.child)
      .filter(
        (child): child is ChildProcess =>
          child !== undefined &&
          child.exitCode === null &&
          child.signalCode === null
      );
  }

  /** Re-attach and re-spawn every bar entry (item 4); empty bar → attach-or-spawn (item 2). */
  async bootstrap(): Promise<void> {
    let entries = loadHostBar(this.deps.barFile);
    if (entries.length === 0) {
      entries = [await this.firstEntry()];
    }
    for (const entry of entries) {
      this.records.set(entry.id, { entry, status: "starting" });
    }
    this.activeId = entries[0]?.id ?? null;
    this.persist();
    this.emit();
    await Promise.all(entries.map((entry) => this.startRecord(entry.id)));
  }

  /** "+" → New Host: Spawn on a random port. */
  async newSpawn(): Promise<void> {
    const entry: BarEntry = {
      id: randomUUID(),
      kind: "spawn",
      port: 0,
      label: this.nextLabel(),
    };
    this.records.set(entry.id, { entry, status: "starting" });
    this.persist();
    this.emit();
    this.select(entry.id);
    await this.startRecord(entry.id);
  }

  /** "+" → Add Host at port… (or paste the Host's authenticated URL): Attach. */
  async addAttach(port: number, token?: string): Promise<void> {
    const entry: BarEntry = {
      id: randomUUID(),
      kind: "attach",
      port,
      label: this.nextLabel(),
      ...(token === undefined ? {} : { token }),
    };
    this.records.set(entry.id, { entry, status: "starting" });
    this.persist();
    this.emit();
    this.select(entry.id);
    await this.startRecord(entry.id);
  }

  /** Right-click → Remove: forget a Host; a Spawned Host's process is stopped. */
  remove(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    // Gone from the registry first, so a start still in flight aborts (the
    // gone() guards) instead of reinstalling a view for a removed Host.
    this.records.delete(id);
    this.deps.views.remove(id);
    if (this.setupId === id) {
      this.setupMessage = null;
      this.setupId = null;
    }
    if (this.activeId === id) {
      this.activeId = null;
      const nextId = [...this.records.keys()][0] ?? null;
      if (nextId !== null) {
        this.select(nextId);
      } else {
        this.deps.views.show(null);
      }
    }
    this.persist();
    this.emit();
    const child = record.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      // A Spawned Host belongs to this app; Remove stops it with the same
      // SIGTERM ladder quit uses. An attached Host keeps running.
      this.log(`removing ${record.entry.label}: stopping its dsh process`);
      void terminateAll([child]);
    }
  }

  /** The registry's view of one Host, for main to build menus from. */
  describe(id: string): { label: string; kind: BarEntry["kind"] } | null {
    const record = this.records.get(id);
    if (!record) return null;
    return { label: record.entry.label, kind: record.entry.kind };
  }

  /**
   * The Host's launch token, for the main-process event sockets (issue #8);
   * undefined for a legacy tokenless Host. Never leaves the main process.
   */
  tokenOf(id: string): string | undefined {
    return this.records.get(id)?.token;
  }

  /** Whether the Host serves the authenticated 0.1.2-class API (issue #8). */
  isModern(id: string): boolean {
    return this.records.get(id)?.modern === true;
  }

  retryOffline(): void {
    for (const record of this.records.values()) {
      if (record.status === "offline") void this.startRecord(record.entry.id);
    }
  }

  select(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    this.activeId = id;
    if (record.status === "offline") {
      // Clicking an offline Host retries it.
      void this.startRecord(id);
    } else {
      this.deps.views.show(id);
    }
    this.emit();
  }

  private async startRecord(id: string): Promise<void> {
    const record = this.records.get(id);
    // Status "starting" is display state (bootstrap sets it before the rail
    // paints); re-entrancy is tracked separately, or the initial start would
    // refuse itself.
    if (!record || this.starting.has(id)) return;
    this.starting.add(id);
    record.status = "starting";
    this.emit();
    try {
      if (record.entry.kind === "spawn") await this.spawnRecord(record);
      else await this.attachRecord(record);
    } finally {
      this.starting.delete(id);
    }
  }

  /** True once the record left the registry (Remove) — a start must abort. */
  private gone(record: HostRecord): boolean {
    return this.records.get(record.entry.id) !== record;
  }

  private async spawnRecord(record: HostRecord): Promise<void> {
    const binary = resolveDshBinary();
    if (!binary) {
      record.status = "offline";
      this.setupMessage = "DSH Desktop needs dsh. Install it with npm install -g @deepseek-ai/dsh, then retry or choose its path.";
      this.setupId = record.entry.id;
      this.log("no dsh binary found; set DSH_BIN to an absolute path");
      this.emit();
      return;
    }
    try {
      const host = await spawnHostUntilUrl(
        binary,
        ["web", "--no-open", "--port", "0"],
        {
          env: augmentChildPath(binary),
          // The child must be visible to the quit handler the moment it
          // exists, not when the URL line settles (prototype issue #4).
          onChild: (child) => {
            record.child = child;
          },
        }
      );
      record.child = host.child;
      if (this.gone(record)) {
        host.child.kill();
        return;
      }
      this.setupMessage = null;
      this.setupId = null;
      const probe = await probeHost(host.port, { token: host.token });
      if (this.gone(record)) {
        host.child.kill();
        return;
      }
      if (!probe.ok) {
        host.child.kill();
        throw new Error(`Spawned Host did not answer host.describe: ${probe.reason}`);
      }
      const compatibility = assessHostCompatibility(probe.info.version, probe.info.modern === true);
      if (!compatibility.compatible) {
        host.child.kill();
        this.setupMessage = incompatibleHostMessage(compatibility.actual, compatibility.minimum);
        this.setupId = record.entry.id;
        throw new Error(this.setupMessage);
      }
      record.url = host.url;
      record.entry.port = host.port;
      record.token = host.token;
      record.modern = probe.info.modern === true;
      record.status = "ready";
      record.note = undefined;
      this.persist();
      this.installView(record, host.url);
      this.emit();
      this.watchChild(record, host.child);
    } catch (error) {
      record.status = "offline";
      record.note = error instanceof Error ? error.message : String(error);
      this.log("spawn failed:", record.note);
      this.emit();
    }
  }

  private async attachRecord(record: HostRecord): Promise<void> {
    const probe = await probeHost(record.entry.port, { token: record.entry.token });
    if (this.gone(record)) return;
    if (probe.ok) {
      const compatibility = assessHostCompatibility(probe.info.version, probe.info.modern === true);
      if (!compatibility.compatible) {
        record.status = "offline";
        record.note = incompatibleHostMessage(compatibility.actual, compatibility.minimum);
        this.setupMessage = record.note;
        this.setupId = record.entry.id;
        this.log(record.note);
      } else {
        record.status = "ready";
        record.note = undefined;
        record.token = record.entry.token;
        record.modern = probe.info.modern === true;
        record.url = hostWebUrl(record.entry.port, record.entry.token);
        this.installView(record, record.url);
      }
    } else if (probe.authRequired) {
      // The Host answers but guards its API with the launch token printed in
      // its `dsh web:` line (issue #8). Without that URL there is nothing to
      // attach with; the user re-adds the Host from the printed URL.
      record.status = "offline";
      record.note = `needs its authenticated URL: the Host on port ${record.entry.port} requires the token printed by dsh web`;
      this.log(`Host on port ${record.entry.port} requires authentication; re-add it with the URL printed by dsh web`);
    } else {
      record.status = "offline";
      record.note = probe.reason;
      this.log(`no Host on port ${record.entry.port}: ${probe.reason}`);
    }
    this.emit();
  }

  private watchChild(record: HostRecord, child: ChildProcess): void {
    child.once("close", () => {
      // Only the current child of this record may mark it offline; a stale
      // child from a previous retry must not, nor may a removed record.
      if (!this.gone(record) && record.child === child && record.status === "ready") {
        record.status = "offline";
        record.note = "its dsh process exited";
        this.emit();
      }
    });
  }

  private installView(record: HostRecord, url: string): void {
    const view = this.deps.createView(url);
    record.view = view;
    this.deps.views.put(record.entry.id, view, record.entry.id === this.activeId);
  }

  /** Item 2: Attach when a Host already answers on the default port; Spawn otherwise. */
  private async firstEntry(): Promise<BarEntry> {
    const label = this.nextLabelFrom([]);
    const probe = await probeHost(DEFAULT_ATTACH_PORT);
    if (probe.ok) {
      return { id: randomUUID(), kind: "attach", port: DEFAULT_ATTACH_PORT, label };
    }
    // An authenticating Host is not attachable without the launch token only
    // its own process knows (issue #8) — Spawn gives the app its own URL line.
    if (!probe.authRequired) {
      this.log(`no Host on port ${DEFAULT_ATTACH_PORT}: ${probe.reason}`);
    }
    return { id: randomUUID(), kind: "spawn", port: 0, label };
  }

  private nextLabel(): string {
    return this.nextLabelFrom(
      [...this.records.values()].map((record) => record.entry.label)
    );
  }

  private nextLabelFrom(labels: string[]): string {
    let highest = 0;
    for (const label of labels) {
      const match = /^Host (\d+)$/.exec(label);
      if (match?.[1]) highest = Math.max(highest, Number.parseInt(match[1], 10));
    }
    return `Host ${highest + 1}`;
  }

  private persist(): void {
    try {
      saveHostBar(
        this.deps.barFile,
        [...this.records.values()].map((record) => record.entry)
      );
    } catch (error) {
      this.log("bar save failed:", error);
    }
  }

  private emit(): void {
    this.deps.onChanged(this.hostBarState());
  }

  private log(...parts: unknown[]): void {
    this.deps.log?.(...parts);
  }
}
