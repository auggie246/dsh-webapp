import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadHostBar, saveHostBar } from "./host-bar-store.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "dsh-desktop-bar-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

const ENTRY = { id: "h-1", kind: "spawn", port: 4123, label: "Host 1" } as const;

describe("Host bar store", () => {
  test("roundtrips bar entries through a file", () => {
    const file = join(tempDir(), "host-bar.json");
    saveHostBar(file, [ENTRY]);
    expect(loadHostBar(file)).toEqual([ENTRY]);
  });

  test("creates missing parent directories on save", () => {
    const file = join(tempDir(), "deep", "nested", "host-bar.json");
    saveHostBar(file, [ENTRY]);
    expect(loadHostBar(file)).toEqual([ENTRY]);
  });

  test("returns an empty bar when no file exists yet", () => {
    expect(loadHostBar(join(tempDir(), "host-bar.json"))).toEqual([]);
  });

  test("returns an empty bar when the file is corrupt", () => {
    const file = join(tempDir(), "host-bar.json");
    writeFileSync(file, "{ not json");
    expect(loadHostBar(file)).toEqual([]);
  });

  test("returns an empty bar when the file holds something else", () => {
    const file = join(tempDir(), "host-bar.json");
    writeFileSync(file, JSON.stringify({ kind: "not-an-array" }));
    expect(loadHostBar(file)).toEqual([]);
  });

  test("drops invalid entries and keeps valid ones", () => {
    const file = join(tempDir(), "host-bar.json");
    writeFileSync(
      file,
      JSON.stringify([
        ENTRY,
        { id: "x", kind: "mystery", port: 80, label: "Bad" },
        { id: "y", kind: "attach", port: 0, label: "Port zero" },
        { id: "z", kind: "attach", port: 70000, label: "Port too big" },
        { kind: "attach", port: 3080, label: "No id" },
        { id: "w", kind: "attach", port: 3080, label: "" },
        "just a string",
      ])
    );
    expect(loadHostBar(file)).toEqual([ENTRY]);
  });

  test("an empty bar persists and loads as an empty bar", () => {
    const file = join(tempDir(), "host-bar.json");
    saveHostBar(file, []);
    expect(loadHostBar(file)).toEqual([]);
  });

  test("save overwrites the previous bar", () => {
    const file = join(tempDir(), "host-bar.json");
    saveHostBar(file, [ENTRY]);
    const second = { id: "h-2", kind: "attach", port: 3080, label: "Host 2" } as const;
    saveHostBar(file, [second]);
    expect(loadHostBar(file)).toEqual([second]);
  });
});
