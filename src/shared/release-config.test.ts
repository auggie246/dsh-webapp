import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(__dirname, "..", "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  packageManager?: string;
};
const builder = readFileSync(join(root, "electron-builder.yml"), "utf8");
const workflow = readFileSync(join(root, ".github", "workflows", "native-packages.yml"), "utf8");

describe("release configuration", () => {
  test("pins Electron and packages Apple silicon macOS plus x64 Windows and Linux", () => {
    expect(packageJson.devDependencies.electron).toBe("44.1.0");
    expect(builder).toContain("electronVersion: 44.1.0");
    expect(packageJson.devDependencies["@electron/packager"]).toBeUndefined();
    for (const script of ["package:mac", "package:win", "package:linux"]) {
      expect(packageJson.scripts[script]).toContain("electron-builder");
      expect(packageJson.scripts[script]).toContain("--publish never");
    }
    expect(builder).toContain("target: dmg");
    expect(builder).toContain("target: nsis");
    expect(builder).toContain("target: zip");
    expect(builder).toContain("target: AppImage");
    expect(builder).toContain("target: deb");
    expect(builder).toContain("target: pacman");
    expect(builder).toContain("artifactName: dsh-desktop-${version}-${arch}.pkg.tar.zst");
    expect(builder).toContain("compression: zstd");
    expect(builder).toContain("    - gtk3");
    expect(builder).toContain("    - nss");
    expect(builder).not.toContain("http-parser");
    expect(builder).not.toContain("libappindicator-gtk3");
    expect(builder).toContain("arch: [arm64]");
    expect(packageJson.scripts["package:mac"]).toContain("--arm64");
    expect(packageJson.scripts["package:win"]).toContain("--x64");
    expect(packageJson.scripts["package:linux"]).toContain("--x64");
    expect(packageJson.scripts["smoke:native"]).toBe("node scripts/native-package-smoke.js");
    expect(packageJson.packageManager).toBe("pnpm@11.7.0");
  });

  test("gates tagged publishing on tested native packages", () => {
    expect(workflow).toContain("macos-15");
    expect(workflow).toContain("arch: arm64");
    expect(workflow).toContain("windows-2022");
    expect(workflow).toContain("ubuntu-22.04");
    expect(workflow).toContain("release/*.pkg.tar.zst");
    expect(workflow).toContain("needs: [prepare, build-smoke]");
    expect(workflow).not.toContain("\n  compatibility:");
    expect(workflow).toContain("SHA256SUMS");
    expect(workflow).toContain("actions/upload-artifact@v7");
    expect(workflow).toContain("actions/download-artifact@v8");
    expect(workflow).toContain("pattern: package-*");
    expect(workflow).not.toContain("pattern: package-*-x64");
    expect(workflow).toContain("actions/attest-build-provenance@v3");
    expect(workflow).toContain("GH_REPO: ${{ github.repository }}");
    expect(workflow).toContain("gh release create");
    expect(workflow).toContain("gh release edit");
    expect(workflow).toContain("Smoke every native package with latest dsh");
    expect(workflow).toContain("Smoke every native package with minimum supported dsh");
    expect(workflow).toContain("--host-version 0.1.1-rc.2");
  });
});
