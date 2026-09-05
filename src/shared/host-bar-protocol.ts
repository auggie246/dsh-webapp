// What the Host bar is told over IPC. The Host bar page is plain JS; this
// file is the contract between main and the Host bar, shared with the
// preload bridge.
export type HostStatus = "starting" | "ready" | "offline";

export interface HostSummary {
  id: string;
  label: string;
  kind: "spawn" | "attach";
  port: number;
  status: HostStatus;
  active: boolean;
  /** Why an offline Host is offline (issue #8), e.g. it needs its authenticated URL. */
  note?: string;
}

export interface HostSetupState {
  message: string;
}

export interface HostBarState {
  hosts: HostSummary[];
  setup?: HostSetupState;
}
