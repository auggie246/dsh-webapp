import { afterEach, describe, expect, test } from "vitest";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { augmentChildPath, dshExecutableNames, resolveDshBinary } from "./dsh-binary.js";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "dsh-desktop-bin-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

interface NvmOptions {
  versions?: string[];
  withExecutableDsh?: string[];
  defaultAlias?: string;
}

// Builds a real ~/.nvm shaped tree under the temp root.
function makeNvm(root: string, options: NvmOptions = {}): string {
  const nvm = join(root, ".nvm");
  const versions = options.versions ?? [];
  const executable = new Set(options.withExecutableDsh ?? versions);
  for (const version of versions) {
    const bin = join(nvm, "versions", "node", version, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "dsh"), "#!/bin/sh\n");
    chmodSync(join(bin, "dsh"), executable.has(version) ? 0o755 : 0o644);
  }
  if (options.defaultAlias !== undefined) {
    mkdirSync(join(nvm, "alias"), { recursive: true });
    writeFileSync(join(nvm, "alias", "default"), options.defaultAlias);
  }
  return nvm;
}

describe("dshExecutableNames", () => {
  test("tries npm and native Windows executables before the bare name", () => {
    expect(dshExecutableNames("win32", ".COM;.EXE;.BAT;.CMD")).toEqual([
      "dsh.cmd",
      "dsh.exe",
      "dsh.bat",
      "dsh.com",
      "dsh",
    ]);
  });

  test("uses only the POSIX executable name on Unix", () => {
    expect(dshExecutableNames("linux")).toEqual(["dsh"]);
  });
});

describe("augmentChildPath", () => {
  test("uses the Windows PATH delimiter and default PATH", () => {
    expect(augmentChildPath("C:\\npm\\dsh.cmd", {}, "win32").PATH).toBe(
      "C:\\npm;C:\\Windows\\System32;C:\\Windows"
    );
  });
});

describe("resolveDshBinary", () => {
  test("a configured DSH_BIN wins over everything", () => {
    const root = tempRoot();
    makeNvm(root, { versions: ["v22.22.2"] });
    expect(
      resolveDshBinary({
        env: { DSH_BIN: "/custom/dsh" },
        home: root,
        platform: "linux",
      })
    ).toBe("/custom/dsh");
  });

  test("an executable dsh on PATH beats the nvm tree", () => {
    const root = tempRoot();
    makeNvm(root, { versions: ["v22.22.2"] });
    const binDir = join(root, "pathbin");
    mkdirSync(binDir);
    writeFileSync(join(binDir, "dsh"), "#!/bin/sh\n");
    chmodSync(join(binDir, "dsh"), 0o755);
    expect(
      resolveDshBinary({ env: { PATH: `${binDir}:/usr/bin` }, home: root, platform: "linux" })
    ).toBe(join(binDir, "dsh"));
  });

  // POSIX-only: chmod exec bits are not observable on Windows, where
  // accessSync(X_OK) degrades to an existence check.
  test.skipIf(process.platform === "win32")("a non-executable PATH candidate is skipped", () => {
    const root = tempRoot();
    const weakDir = join(root, "weak");
    const goodDir = join(root, "good");
    mkdirSync(weakDir);
    mkdirSync(goodDir);
    writeFileSync(join(weakDir, "dsh"), "#!/bin/sh\n");
    chmodSync(join(weakDir, "dsh"), 0o644);
    writeFileSync(join(goodDir, "dsh"), "#!/bin/sh\n");
    chmodSync(join(goodDir, "dsh"), 0o755);
    expect(
      resolveDshBinary({
        env: { PATH: `${weakDir}:${goodDir}` },
        home: join(root, "no-nvm"),
      })
    ).toBe(join(goodDir, "dsh"));
  });

  test("the nvm default alias picks the matching version", () => {
    const root = tempRoot();
    makeNvm(root, {
      versions: ["v20.19.4", "v22.22.2"],
      defaultAlias: "22",
    });
    expect(resolveDshBinary({ env: {}, home: root, platform: "linux" })).toBe(
      join(root, ".nvm", "versions", "node", "v22.22.2", "bin", "dsh")
    );
  });

  test("an exact or v-prefixed alias matches exactly", () => {
    const root = tempRoot();
    makeNvm(root, {
      versions: ["v20.19.4", "v22.22.2", "v22.9.0"],
      defaultAlias: "v22.9.0",
    });
    expect(resolveDshBinary({ env: {}, home: root, platform: "linux" })).toBe(
      join(root, ".nvm", "versions", "node", "v22.9.0", "bin", "dsh")
    );
  });

  test("a partial alias like 22.22 matches the major-minor prefix", () => {
    const root = tempRoot();
    makeNvm(root, {
      versions: ["v20.19.4", "v22.22.2", "v22.9.0"],
      defaultAlias: "22.22",
    });
    expect(resolveDshBinary({ env: {}, home: root, platform: "linux" })).toBe(
      join(root, ".nvm", "versions", "node", "v22.22.2", "bin", "dsh")
    );
  });

  test("an alias pointing nowhere falls back to the highest version", () => {
    const root = tempRoot();
    makeNvm(root, {
      versions: ["v20.19.4", "v22.22.2"],
      defaultAlias: "99",
    });
    expect(resolveDshBinary({ env: {}, home: root, platform: "linux" })).toBe(
      join(root, ".nvm", "versions", "node", "v22.22.2", "bin", "dsh")
    );
  });

  test("no alias falls back to the highest version", () => {
    const root = tempRoot();
    makeNvm(root, { versions: ["v20.19.4", "v22.22.2"] });
    expect(resolveDshBinary({ env: {}, home: root, platform: "linux" })).toBe(
      join(root, ".nvm", "versions", "node", "v22.22.2", "bin", "dsh")
    );
  });

  // POSIX-only: same chmod exec-bit limitation as above.
  test.skipIf(process.platform === "win32")("versions without an executable dsh are not candidates", () => {
    const root = tempRoot();
    makeNvm(root, {
      versions: ["v20.19.4", "v22.22.2"],
      withExecutableDsh: ["v20.19.4"],
    });
    expect(resolveDshBinary({ env: {}, home: root, platform: "linux" })).toBe(
      join(root, ".nvm", "versions", "node", "v20.19.4", "bin", "dsh")
    );
  });

  test("returns null when nothing resolves", () => {
    const root = tempRoot();
    expect(resolveDshBinary({ env: { PATH: "/usr/bin" }, home: root, platform: "linux" })).toBeNull();
  });
});
