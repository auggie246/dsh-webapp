// Menu-bar presence (item 5): the icon shows the window on click; a
// right-click menu offers Show and Quit. Template image so macOS tints it.
import { app, Menu, nativeImage, Tray } from "electron";
import path from "node:path";

export function createTray(opts: {
  onShow: () => void;
  onQuit: () => void;
}): Tray {
  const icon = nativeImage.createFromPath(
    path.join(app.getAppPath(), "assets", "trayTemplate.png")
  );
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip("DSH Desktop");
  tray.on("click", opts.onShow);
  const menu = Menu.buildFromTemplate([
    { label: "Show DSH Desktop", click: opts.onShow },
    { type: "separator" },
    { label: "Quit DSH Desktop", click: opts.onQuit },
  ]);
  tray.on("right-click", () => tray.popUpContextMenu(menu));
  return tray;
}
