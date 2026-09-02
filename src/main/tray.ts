// Menu-bar presence (item 5): the icon shows the window on click; a
// right-click menu offers Show, the Global Hotkey picker, and Quit. Template
// image so macOS tints it.
import { app, Menu, nativeImage, Tray } from "electron";
import path from "node:path";

export interface TrayResult {
  tray: Tray | null;
  usable: boolean;
}

export function createTray(opts: {
  onShow: () => void;
  /** Built fresh on every open, so radio state (e.g. the hotkey) is current. */
  buildMenu: () => Electron.Menu;
}): TrayResult {
  try {
    const icon = nativeImage.createFromPath(
      path.join(app.getAppPath(), "assets", "trayTemplate.png")
    );
    icon.setTemplateImage(process.platform === "darwin");
    const tray = new Tray(icon);
    tray.setToolTip("DSH Desktop");
    if (process.platform === "darwin") {
      // A set context menu would swallow left-click; keep click = show.
      tray.on("click", opts.onShow);
      tray.on("right-click", () => tray.popUpContextMenu(opts.buildMenu()));
    } else {
      // On Linux and Windows the menu is the only reliable tray interaction.
      tray.setContextMenu(opts.buildMenu());
    }
    return { tray, usable: true };
  } catch {
    return { tray: null, usable: false };
  }
}
