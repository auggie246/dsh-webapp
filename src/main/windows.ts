// The one app window (item 1) and the per-Host views (ADR-0003). The Host bar
// page paints the left bar; each Host renders in its own WebContentsView so
// its page state survives switching. Views load the Host's localhost URL
// (ADR-0002) — the app talks to the Host exactly like a browser does.
import { BrowserWindow, WebContentsView } from "electron";
import path from "node:path";

export const HOST_BAR_WIDTH = 68;

export class HostViews {
  private views = new Map<string, WebContentsView>();

  constructor(private readonly win: BrowserWindow) {
    win.on("resize", () => this.layout());
  }

  /** Add (or replace) the view of a Host; only the active one is visible. */
  put(id: string, view: WebContentsView, visible: boolean): void {
    const existing = this.views.get(id);
    if (existing) this.win.contentView.removeChildView(existing);
    this.views.set(id, view);
    this.win.contentView.addChildView(view);
    this.place(view);
    view.setVisible(visible);
  }

  show(id: string | null): void {
    for (const [viewId, view] of this.views) {
      view.setVisible(viewId === id);
    }
  }

  /** Drop a Host's view (Remove); its page state is discarded. */
  remove(id: string): void {
    const view = this.views.get(id);
    if (!view) return;
    this.views.delete(id);
    this.win.contentView.removeChildView(view);
  }

  layout(): void {
    for (const view of this.views.values()) this.place(view);
  }

  private place(view: WebContentsView): void {
    const { width, height } = this.win.getContentBounds();
    view.setBounds({
      x: HOST_BAR_WIDTH,
      y: 0,
      width: Math.max(0, width - HOST_BAR_WIDTH),
      height,
    });
  }
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 820,
    minHeight: 560,
    title: "DSH Desktop",
    show: false,
    backgroundColor: "#1e1f22",
    // The menu row (Global Hotkey, Edit, View, …) stays out of the way until
    // Alt calls it up. macOS is unaffected: its menu bar is the system's.
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "host-bar-preload.js"),
    },
  });
  void win.loadFile(path.join(__dirname, "..", "host-bar", "host-bar.html"));
  win.once("ready-to-show", () => win.show());
  return win;
}
