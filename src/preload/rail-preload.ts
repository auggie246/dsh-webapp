// The only bridge into the rail page. The Host views get no bridge at all
// (ADR-0002): the app talks to a Host exactly like a browser does.
import { contextBridge, ipcRenderer } from "electron";
import type { RailState } from "../shared/rail-protocol";

export interface RailRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const api = {
  getState: (): Promise<RailState> => ipcRenderer.invoke("rail:get-state"),
  selectHost: (id: string): void => ipcRenderer.send("rail:select", id),
  plusMenu: (rect: RailRect): void => ipcRenderer.send("rail:plus-menu", rect),
  addHostAtPort: (port: string): void => ipcRenderer.send("rail:add-attach", port),
  onHostsChanged: (callback: (state: RailState) => void): void => {
    ipcRenderer.on("rail:changed", (_event, state: RailState) => callback(state));
  },
  onBeginPortEntry: (callback: () => void): void => {
    ipcRenderer.on("rail:begin-port-entry", () => callback());
  },
};

contextBridge.exposeInMainWorld("dshDesktop", api);
