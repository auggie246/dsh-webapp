import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_HOTKEY,
  loadSettings,
  saveSettings,
  validateAccelerator,
} from "./settings.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "dsh-desktop-settings-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

describe("Accelerator validation", () => {
  test("accepts the default hotkey", () => {
    expect(validateAccelerator(DEFAULT_HOTKEY)).toBe("CommandOrControl+Shift+D");
  });

  test("normalizes case and canonicalises modifier and key names", () => {
    expect(validateAccelerator("cmd+shift+d")).toBe("CommandOrControl+Shift+D");
    expect(validateAccelerator("ctrl+alt+f5")).toBe("Control+Alt+F5");
    expect(validateAccelerator("shift+space")).toBe("Shift+Space");
  });

  test("rejects a bare key with no modifier", () => {
    expect(validateAccelerator("D")).toBeNull();
  });

  test("rejects a lone modifier with no key", () => {
    expect(validateAccelerator("CommandOrControl+Shift")).toBeNull();
  });

  test("rejects unknown parts", () => {
    expect(validateAccelerator("CommandOrControl+Shift+Bogus")).toBeNull();
    expect(validateAccelerator("")).toBeNull();
  });
});

describe("Settings store", () => {
  test("roundtrips settings through a file", () => {
    const file = join(tempDir(), "settings.json");
    saveSettings(file, { hotkey: "Control+Alt+D" });
    expect(loadSettings(file)).toEqual({ hotkey: "Control+Alt+D" });
  });

  test("returns the default hotkey when no file exists yet", () => {
    expect(loadSettings(join(tempDir(), "settings.json"))).toEqual({
      hotkey: DEFAULT_HOTKEY,
    });
  });

  test("returns the default hotkey when the file is corrupt", () => {
    const file = join(tempDir(), "settings.json");
    writeFileSync(file, "{ not json");
    expect(loadSettings(file)).toEqual({ hotkey: DEFAULT_HOTKEY });
  });

  test("returns the default hotkey when the stored accelerator is invalid", () => {
    const file = join(tempDir(), "settings.json");
    writeFileSync(file, JSON.stringify({ hotkey: "Bogus" }));
    expect(loadSettings(file)).toEqual({ hotkey: DEFAULT_HOTKEY });
  });

  test("keeps an explicitly disabled hotkey (null)", () => {
    const file = join(tempDir(), "settings.json");
    saveSettings(file, { hotkey: null });
    expect(loadSettings(file)).toEqual({ hotkey: null });
  });

  test("drops unrelated fields from the file", () => {
    const file = join(tempDir(), "settings.json");
    writeFileSync(file, JSON.stringify({ hotkey: "Control+Alt+D", extra: true }));
    expect(loadSettings(file)).toEqual({ hotkey: "Control+Alt+D" });
  });
});
