import { describe, expect, test, vi } from "vitest";

const { expandZipWithPowerShell } = require("../../scripts/windows-archive.js");

describe("expandZipWithPowerShell", () => {
  test("passes ZIP paths through environment variables instead of PowerShell positional arguments", () => {
    const execFileSync = vi.fn();
    expandZipWithPowerShell("D:\\release files\\desktop.zip", "C:\\smoke files\\unpacked", {
      execFileSync,
      env: { PATH: "C:\\Windows" },
    });

    expect(execFileSync).toHaveBeenCalledWith(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive -LiteralPath $env:DSH_DESKTOP_SMOKE_ZIP -DestinationPath $env:DSH_DESKTOP_SMOKE_UNPACK -Force",
      ],
      {
        env: {
          PATH: "C:\\Windows",
          DSH_DESKTOP_SMOKE_ZIP: "D:\\release files\\desktop.zip",
          DSH_DESKTOP_SMOKE_UNPACK: "C:\\smoke files\\unpacked",
        },
        stdio: "inherit",
        windowsHide: true,
      }
    );
  });
});
