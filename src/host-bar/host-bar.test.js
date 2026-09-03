import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadHostBar(hostContextMenu) {
  const listeners = new Map();
  const hosts = {
    textContent: "",
    append(button) {
      this.button = button;
    },
  };
  const elements = new Map([
    ["hosts", hosts],
    ["add", { addEventListener() {} }],
    ["port-entry", { addEventListener() {}, hidden: true }],
    ["port-input", { addEventListener() {}, classList: { add() {}, remove() {} } }],
    ["setup", { hidden: true }],
    ["setup-message", { textContent: "" }],
    ["retry-dsh", { addEventListener() {} }],
    ["pick-dsh", { addEventListener() {} }],
  ]);
  const context = {
    document: {
      getElementById(id) {
        return elements.get(id);
      },
      createElement() {
        return {
          className: "",
          append() {},
          addEventListener(type, listener) {
            listeners.set(type, listener);
          },
        };
      },
    },
    window: {
      dshDesktop: {
        getState: () => Promise.resolve({ hosts: [], setup: undefined }),
        selectHost: vi.fn(),
        hostContextMenu,
        plusMenu: vi.fn(),
        addHostAtPort: vi.fn(),
        retryDsh: vi.fn(),
        pickDsh: vi.fn(),
        onHostsChanged(callback) {
          callback({ hosts: [{ id: "host-1", label: "Host 1", status: "ready", active: true, port: 3080 }], setup: undefined });
        },
        onBeginPortEntry: vi.fn(),
      },
    },
    setTimeout,
  };
  vm.runInNewContext(readFileSync("src/host-bar/host-bar.js", "utf8"), context);
  return { button: hosts.button, listeners };
}

describe("Host bar context menu", () => {
  test("sends a serializable rectangle to the preload bridge", () => {
    const hostContextMenu = vi.fn();
    const { button, listeners } = loadHostBar(hostContextMenu);
    const domRect = {};
    Object.defineProperties(domRect, {
      x: { get: () => 8 },
      y: { get: () => 12 },
      width: { get: () => 48 },
      height: { get: () => 48 },
    });

    listeners.get("contextmenu")({
      preventDefault: vi.fn(),
      currentTarget: { getBoundingClientRect: () => domRect },
    });

    expect(structuredClone(hostContextMenu.mock.calls[0][1])).toEqual({ x: 8, y: 12, width: 48, height: 48 });
  });
});
