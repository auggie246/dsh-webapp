// DSH Desktop entry point (issue #1). Wiring only; the logic lives in the
// Host manager and the shared modules. Lifecycle rules, in one place:
// - Close hides to the menu bar (item 5); the app keeps running.
// - Quit kills every Spawned Host first (item 6), then exits.
// - A second launch focuses the running app instead of doubling Hosts.
import { app, BrowserWindow, ipcMain, Menu, nativeImage, WebContentsView } from "electron";
import path from "node:path";
import { HostManager } from "./hosts";
import { createMainWindow, HostViews } from "./windows";
import { createTray } from "./tray";
import { terminateAll } from "../shared/terminate-all";
import { parsePortText } from "../shared/port";

const isMac = process.platform === "darwin";

let win: BrowserWindow | null = null;
let manager: HostManager | null = null;
let isQuitting = false;

function log(...parts: unknown[]): void {
  console.log("[dsh-desktop]", ...parts);
}

function showWindow(): void {
  if (!win) return;
  win.show();
  win.focus();
}

function createHostView(url: string): WebContentsView {
  const view = new WebContentsView({ webPreferences: { sandbox: true } });
  view.setBackgroundColor("#1e1f22");
  void view.webContents.loadURL(url).catch((error: unknown) => {
    log("Host page failed to load:", url, error);
  });
  return view;
}

function installAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = isMac
    ? [{ role: "appMenu" }, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }]
    : [{ role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function wireIpc(): void {
  ipcMain.handle("host-bar:get-state", () => manager?.hostBarState() ?? { hosts: [] });

  ipcMain.on("host-bar:select", (_event, id: unknown) => {
    if (typeof id === "string") manager?.select(id);
  });

  ipcMain.on("host-bar:new-host", () => {
    void manager?.newSpawn();
  });

  ipcMain.on("host-bar:add-attach", (_event, portText: unknown) => {
    if (typeof portText !== "string") {
      log("ignored an invalid port:", portText);
      return;
    }
    const port = parsePortText(portText);
    if (port === null) {
      log("ignored an invalid port:", portText);
      return;
    }
    void manager?.addAttach(port);
  });

  ipcMain.on("host-bar:plus-menu", (_event, rect: unknown) => {
    if (!win || win.isDestroyed()) return;
    const plusRect = rect as { x: number; y: number; width: number; height: number };
    const menu = Menu.buildFromTemplate([
      { label: "New Host", click: () => void manager?.newSpawn() },
      {
        label: "Add Host at port…",
        click: () => win?.webContents.send("host-bar:begin-port-entry"),
      },
    ]);
    menu.popup({
      window: win,
      x: Math.round(plusRect.x),
      y: Math.round(plusRect.y + plusRect.height + 4),
    });
  });
}

function onReady(): void {
  if (isMac) {
    app.dock?.setIcon(
      nativeImage.createFromPath(path.join(app.getAppPath(), "assets", "icon.png"))
    );
  }

  win = createMainWindow();
  const views = new HostViews(win);
  manager = new HostManager({
    barFile: path.join(app.getPath("userData"), "host-bar.json"),
    onChanged: (state) => {
      if (win && !win.isDestroyed()) win.webContents.send("host-bar:changed", state);
    },
    createView: createHostView,
    views,
    log,
  });

  installAppMenu();
  createTray({ onShow: showWindow, onQuit: () => app.quit() });
  wireIpc();

  // Close = hide (item 5). Real exits go through Cmd+Q / the tray / app.quit().
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win?.hide();
    }
  });

  app.on("activate", () => showWindow());
  app.on("window-all-closed", () => {
    // Stay in the menu bar; closing the window is not quitting.
  });

  // Quit kills every Spawned Host (item 6). The children are visible here the
  // moment they exist (spawnHostUntilUrl.onChild), so a quit during the URL
  // wait still kills them (prototype issue #4). The SIGTERM grace default
  // (5000 ms, then SIGKILL) lives in terminateAll.
  app.on("before-quit", (event) => {
    isQuitting = true;
    const children = manager?.children() ?? [];
    if (children.length === 0) return;
    event.preventDefault();
    log(`quitting: terminating ${children.length} spawned Host(s)`);
    void terminateAll(children).finally(() => app.exit(0));
  });

  void manager.bootstrap();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setName("DSH Desktop");
  app.on("second-instance", () => showWindow());
  void app.whenReady().then(onReady);
}
