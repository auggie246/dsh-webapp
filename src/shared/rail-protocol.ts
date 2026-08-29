// What the rail (Host bar) is told over IPC. The rail is plain JS; this file
// is the contract between main and rail, shared with the preload bridge.
export type HostStatus = "starting" | "ready" | "offline";

export interface RailHost {
  id: string;
  label: string;
  kind: "spawn" | "attach";
  port: number;
  status: HostStatus;
  active: boolean;
}

export interface RailState {
  hosts: RailHost[];
}
