import { appendFileSync } from "node:fs";
import type { ChildProcess } from "node:child_process";
import type { HostBarState } from "../shared/host-bar-protocol";

export interface SmokeEvent {
  event: "app-ready" | "host-ready" | "quit-started" | "quit-complete";
  kind?: "spawn" | "attach";
  port?: number;
  pid?: number;
  spawnedPids?: number[];
}

const file = process.env.DSH_DESKTOP_SMOKE_FILE;
let hostReadyRecorded = false;

export const smoke = {
  active: file !== undefined,
  autoQuit: process.env.DSH_DESKTOP_SMOKE_AUTO_QUIT === "1",
  userData: process.env.DSH_DESKTOP_SMOKE_USER_DATA,
  write(event: SmokeEvent): void {
    if (!file) return;
    appendFileSync(file, `${JSON.stringify(event)}\n`);
  },
  recordReady(state: HostBarState, children: ChildProcess[], quit: () => void): void {
    if (!this.active || hostReadyRecorded) return;
    const ready = state.hosts.find((host) => host.status === "ready");
    if (!ready) return;
    hostReadyRecorded = true;
    const child = ready.kind === "spawn" ? children[0] : undefined;
    this.write({ event: "host-ready", kind: ready.kind, port: ready.port, pid: child?.pid });
    if (this.autoQuit) queueMicrotask(quit);
  },
};
