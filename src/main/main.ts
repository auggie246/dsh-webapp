// DSH Desktop entry point (issue #1). Wiring only; the logic lives in the
// Host manager and the shared modules. Lifecycle rules, in one place:
// - Close hides to the menu bar (item 5); the app keeps running.
// - Quit kills every Spawned Host first (item 6), then exits.
// - A second launch focuses the running app instead of doubling Hosts.
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, WebContentsView } from "electron";
import path from "node:path";
import { HostManager } from "./hosts";
import { createMainWindow, HostViews } from "./windows";
import { createTray } from "./tray";
import { HostEventWatches } from "./host-event-links";
import { showNotification, showWarning } from "./notifications";
import { terminateAll } from "../shared/terminate-all";
import { windowCloseAction } from "../shared/window-close-policy";
import { smoke } from "./smoke";
import { parsePortText } from "../shared/port";
import {
  DEFAULT_HOTKEY,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "../shared/settings";

const isMac = process.platform === "darwin";
const defaultHotkeyLabel = isMac ? "Cmd+Shift+D (default)" : "Ctrl+Shift+D (default)";

let win: BrowserWindow | null = null;
let manager: HostManager | null = null;
let watches: HostEventWatches | null = null;
let settings: AppSettings = { hotkey: DEFAULT_HOTKEY };
let settingsFile = "";
let isQuitting = false;
let tray: Electron.Tray | null = null;
let trayUsable = false;

function log(...parts: unknown[]): void {
  console.log("[dsh-desktop]", ...parts);
}

function showWindow(): void {
  if (!win) return;
  win.show();
  win.focus();
}

/** Re-registers the global hotkey from the current setting (issue #2, item 1). */
function registerHotkey(): void {
  globalShortcut.unregisterAll();
  if (!settings.hotkey) {
    log("global hotkey disabled");
    return;
  }
  const ok = globalShortcut.register(settings.hotkey, showWindow);
  if (!ok) {
    log(`global hotkey ${settings.hotkey} is taken by another app`);
    // The shortcut is dead; silence would look like a broken app.
    showWarning(
      "Global hotkey not registered",
      `${settings.hotkey} is taken by another app. Pick another in the menu.`
    );
  } else {
    log(`global hotkey registered: ${settings.hotkey}`);
  }
}

function createHostView(url: string): WebContentsView {
  const view = new WebContentsView({ webPreferences: { sandbox: true } });
  view.setBackgroundColor("#1e1f22");
  void view.webContents.loadURL(url).catch((error: unknown) => {
    log("Host page failed to load:", url, error);
  });
  return view;
}

function setHotkey(hotkey: string | null): void {
  settings = { hotkey };
  try {
    saveSettings(settingsFile, settings);
  } catch (error) {
    log("settings save failed:", error);
  }
  registerHotkey();
  installAppMenu();
}

/** The hotkey picker: the ticket's proposal plus two alternatives. */
const HOTKEY_CHOICES: { label: string; value: string | null }[] = [
  { label: defaultHotkeyLabel, value: DEFAULT_HOTKEY },
  { label: "Ctrl+Alt+D", value: "Control+Alt+D" },
  { label: "None", value: null },
];

function installAppMenu(): void {
  const hotkeyMenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Global Hotkey",
      submenu: HOTKEY_CHOICES.map((choice) => ({
        label: choice.label,
        type: "radio" as const,
        checked: settings.hotkey === choice.value,
        click: () => setHotkey(choice.value),
      })),
    },
  ];
  const template: Electron.MenuItemConstructorOptions[] = isMac
    ? [{ role: "appMenu" }, ...hotkeyMenu, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }]
    : [...hotkeyMenu, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function wireIpc(): void {
  ipcMain.handle("host-bar:get-state", () => manager?.hostBarState() ?? { hosts: [] });

  ipcMain.on("host-bar:select", (_event, id: unknown) => {
    if (typeof id === "string") manager?.select(id);
  });

  ipcMain.on("host-bar:host-context-menu", (_event, payload: unknown) => {
    if (!win || win.isDestroyed()) return;
    if (typeof payload !== "object" || payload === null) return;
    const id = (payload as { id?: unknown }).id;
    const rect = (payload as { rect?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } }).rect;
    if (typeof id !== "string" || !rect) return;
    const host = manager?.describe(id);
    if (!host) return;
    const menu = Menu.buildFromTemplate([
      { label: host.label, enabled: false },
      { type: "separator" },
      {
        // Say what Remove does: Spawned means this app stops the process,
        // attached means the external Host simply keeps running.
        label:
          host.kind === "spawn"
            ? `Remove ${host.label} (stops its dsh)`
            : `Remove ${host.label} (detaches)`,
        click: () => manager?.remove(id),
      },
    ]);
    menu.popup({
      window: win,
      x: Math.round(Number(rect.x)),
      y: Math.round(Number(rect.y) + Number(rect.height) + 4),
    });
  });

  ipcMain.on("host-bar:new-host", () => {
    void manager?.newSpawn();
  });

  ipcMain.on("host-bar:retry-dsh", () => manager?.retryOffline());

  ipcMain.handle("host-bar:pick-dsh", async () => {
    const options: Electron.OpenDialogOptions = { title: "Choose the dsh executable", properties: ["openFile"] };
    const picked = await (win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options));
    const binary = picked.filePaths[0];
    if (!picked.canceled && binary) {
      process.env.DSH_BIN = binary;
      manager?.retryOffline();
      return true;
    }
    return false;
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
  smoke.write({ event: "app-ready" });
  if (isMac) {
    app.dock?.setIcon(
      nativeImage.createFromPath(path.join(app.getAppPath(), "assets", "icon.png"))
    );
  }

  win = createMainWindow();
  const views = new HostViews(win);
  settingsFile = path.join(app.getPath("userData"), "settings.json");
  settings = loadSettings(settingsFile);
  watches = new HostEventWatches({
    log,
    // Clicking a notification shows the window and switches the Host bar to
    // the owning Host (issue #2, research facts).
    onIntent: (hostId, intent) => {
      showNotification(intent, () => {
        showWindow();
        manager?.select(hostId);
      });
    },
  });
  manager = new HostManager({
    barFile: path.join(app.getPath("userData"), "host-bar.json"),
    onChanged: (state) => {
      if (win && !win.isDestroyed()) win.webContents.send("host-bar:changed", state);
      watches?.sync(state);
      smoke.recordReady(state, manager?.children() ?? [], () => app.quit());
    },
    createView: createHostView,
    views,
    log,
  });

  installAppMenu();
  registerHotkey();
  const trayResult = createTray({ onShow: showWindow, onQuit: () => app.quit() });
  tray = trayResult.tray;
  trayUsable = trayResult.usable;
  wireIpc();

  // Close = hide (item 5). Real exits go through Cmd+Q / the tray / app.quit().
  win.on("close", (event) => {
    if (isQuitting) return;
    if (windowCloseAction(trayUsable) === "hide") {
      event.preventDefault();
      win?.hide();
      return;
    }
    event.preventDefault();
    app.quit();
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
    watches?.dispose();
    globalShortcut.unregisterAll();
    const children = manager?.children() ?? [];
    smoke.write({ event: "quit-started", spawnedPids: children.flatMap((child) => child.pid === undefined ? [] : [child.pid]) });
    if (children.length === 0) {
      smoke.write({ event: "quit-complete", spawnedPids: [] });
      return;
    }
    event.preventDefault();
    log(`quitting: terminating ${children.length} spawned Host(s)`);
    void terminateAll(children).finally(() => {
      smoke.write({ event: "quit-complete", spawnedPids: children.flatMap((child) => child.pid === undefined ? [] : [child.pid]) });
      app.exit(0);
    });
  });

  void manager.bootstrap();
}

if (smoke.userData) app.setPath("userData", smoke.userData);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setName("DSH Desktop");
  app.on("second-instance", () => showWindow());
  void app.whenReady().then(onReady);
}
