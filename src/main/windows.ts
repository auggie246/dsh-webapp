// The one app window (item 1) and the per-Host views (ADR-0003). The rail
// page paints the left rail; each Host renders in its own WebContentsView so
// its page state survives switching. Views load the Host's localhost URL
// (ADR-0002) — the app talks to the Host exactly like a browser does.
import { BrowserWindow, WebContentsView } from "electron";
import path from "node:path";

export const RAIL_WIDTH = 68;

export class HostViews {
  private views = new Map<string, WebContentsView>();

  constructor(
    private readonly win: BrowserWindow,
    private readonly railWidth: number = RAIL_WIDTH
  ) {
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

  layout(): void {
    for (const view of this.views.values()) this.place(view);
  }

  private place(view: WebContentsView): void {
    const { width, height } = this.win.getContentBounds();
    view.setBounds({
      x: this.railWidth,
      y: 0,
      width: Math.max(0, width - this.railWidth),
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
    webPreferences: {
      preload: path.join(__dirname, "rail-preload.js"),
    },
  });
  void win.loadFile(path.join(__dirname, "..", "rail", "rail.html"));
  win.once("ready-to-show", () => win.show());
  return win;
}
