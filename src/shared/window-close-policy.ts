export type WindowCloseAction = "hide" | "quit";

export function windowCloseAction(trayUsable: boolean): WindowCloseAction {
  return trayUsable ? "hide" : "quit";
}
