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

export const DEFAULT_ATTACH_PORT = 3080;

function incompatibleHostMessage(actual: string | undefined, minimum: string): string {
  const received = actual ?? "an unknown version";
  return `Host compatibility version ${received} is incompatible. DSH Desktop requires ${minimum} or later.`;
}

export interface HostViewsSink {
  put(id: string, view: WebContentsView, visible: boolean): void;
  show(id: string | null): void;
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

  /** "+" → Add Host at port…: Attach to a user-typed port. */
  async addAttach(port: number): Promise<void> {
    const entry: BarEntry = {
      id: randomUUID(),
      kind: "attach",
      port,
      label: this.nextLabel(),
    };
    this.records.set(entry.id, { entry, status: "starting" });
    this.persist();
    this.emit();
    this.select(entry.id);
    await this.startRecord(entry.id);
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
      this.setupMessage = null;
      this.setupId = null;
      const probe = await probeHost(host.port);
      if (!probe.ok) {
        host.child.kill();
        throw new Error(`Spawned Host did not answer host.describe: ${probe.reason}`);
      }
      const compatibility = assessHostCompatibility(probe.info.version);
      if (!compatibility.compatible) {
        host.child.kill();
        this.setupMessage = incompatibleHostMessage(compatibility.actual, compatibility.minimum);
        this.setupId = record.entry.id;
        throw new Error(this.setupMessage);
      }
      record.url = host.url;
      record.entry.port = host.port;
      record.status = "ready";
      this.persist();
      this.installView(record, host.url);
      this.emit();
      this.watchChild(record, host.child);
    } catch (error) {
      record.status = "offline";
      this.log("spawn failed:", error instanceof Error ? error.message : error);
      this.emit();
    }
  }

  private async attachRecord(record: HostRecord): Promise<void> {
    const probe = await probeHost(record.entry.port);
    if (probe.ok) {
      const compatibility = assessHostCompatibility(probe.info.version);
      if (!compatibility.compatible) {
        record.status = "offline";
        this.setupMessage = incompatibleHostMessage(compatibility.actual, compatibility.minimum);
        this.setupId = record.entry.id;
        this.log(this.setupMessage);
      } else {
        record.status = "ready";
        record.url = `http://127.0.0.1:${record.entry.port}`;
        this.installView(record, record.url);
      }
    } else {
      record.status = "offline";
      this.log(`no Host on port ${record.entry.port}: ${probe.reason}`);
    }
    this.emit();
  }

  private watchChild(record: HostRecord, child: ChildProcess): void {
    child.once("close", () => {
      // Only the current child of this record may mark it offline; a stale
      // child from a previous retry must not.
      if (record.child === child && record.status === "ready") {
        record.status = "offline";
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
