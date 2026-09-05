import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadHostBar(hostContextMenu) {
  const listeners = new Map();
  const formListeners = new Map();
  const hosts = {
    textContent: "",
    append(button) {
      this.button = button;
    },
  };
  const inputEl = {
    value: "",
    classList: { add() {}, remove() {} },
    addEventListener() {},
  };
  const formEl = {
    hidden: true,
    addEventListener(type, listener) {
      formListeners.set(type, listener);
    },
  };
  const elements = new Map([
    ["hosts", hosts],
    ["add", { addEventListener() {} }],
    ["port-entry", formEl],
    ["port-input", inputEl],
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
        addAttach: vi.fn(),
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
  return { button: hosts.button, listeners, formListeners, inputEl, context };
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

describe("Host bar attach entry", () => {
  function submittedWith(value, addAttach) {
    const loaded = loadHostBar(vi.fn());
    loaded.context.window.dshDesktop.addAttach = addAttach;
    loaded.inputEl.value = value;
    loaded.formListeners.get("submit")({ preventDefault: vi.fn() });
    return addAttach;
  }

  test("sends a pasted authenticated URL to main (issue #8)", () => {
    const addAttach = vi.fn();
    submittedWith("http://127.0.0.1:4123/?token=s3cret", addAttach);
    expect(addAttach).toHaveBeenCalledWith("http://127.0.0.1:4123/?token=s3cret");
  });

  test("sends the whole pasted `dsh web:` line untouched", () => {
    const addAttach = vi.fn();
    const line = "dsh web: http://127.0.0.1:4123/?token=s3cret (LAN: http://192.168.1.4:4123/?token=s3cret)";
    submittedWith(line, addAttach);
    expect(addAttach).toHaveBeenCalledWith(line);
  });

  test("still sends a bare port", () => {
    const addAttach = vi.fn();
    submittedWith("3080", addAttach);
    expect(addAttach).toHaveBeenCalledWith("3080");
  });

  test("flashes a non-loopback paste instead of sending it", () => {
    const addAttach = vi.fn();
    const loaded = loadHostBar(vi.fn());
    loaded.context.window.dshDesktop.addAttach = addAttach;
    loaded.inputEl.value = "http://192.168.1.4:4123/?token=s3cret";
    const flashCalls = [];
    loaded.inputEl.classList.add = (name) => flashCalls.push(name);
    loaded.formListeners.get("submit")({ preventDefault: vi.fn() });
    expect(addAttach).not.toHaveBeenCalled();
    expect(flashCalls).toEqual(["invalid"]);
  });
});
