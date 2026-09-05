// The only bridge into the Host bar page. The Host views get no bridge at all
// (ADR-0002): the app talks to a Host exactly like a browser does.
import { contextBridge, ipcRenderer } from "electron";
import type { HostBarState } from "../shared/host-bar-protocol";

export interface RailRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const api = {
  getState: (): Promise<HostBarState> => ipcRenderer.invoke("host-bar:get-state"),
  selectHost: (id: string): void => ipcRenderer.send("host-bar:select", id),
  hostContextMenu: (id: string, rect: RailRect): void =>
    ipcRenderer.send("host-bar:host-context-menu", { id, rect }),
  plusMenu: (rect: RailRect): void => ipcRenderer.send("host-bar:plus-menu", rect),
  /** A bare port, the Host's authenticated URL, or its whole `dsh web:` line. */
  addAttach: (text: string): void => ipcRenderer.send("host-bar:add-attach", text),
  retryDsh: (): void => ipcRenderer.send("host-bar:retry-dsh"),
  pickDsh: (): Promise<boolean> => ipcRenderer.invoke("host-bar:pick-dsh"),
  onHostsChanged: (callback: (state: HostBarState) => void): void => {
    ipcRenderer.on("host-bar:changed", (_event, state: HostBarState) => callback(state));
  },
  onBeginPortEntry: (callback: () => void): void => {
    ipcRenderer.on("host-bar:begin-port-entry", () => callback());
  },
};

contextBridge.exposeInMainWorld("dshDesktop", api);
