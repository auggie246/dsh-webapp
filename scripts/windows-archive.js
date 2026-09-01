"use strict";

const { execFileSync } = require("node:child_process");

const expandArchiveScript = "Expand-Archive -LiteralPath $env:DSH_DESKTOP_SMOKE_ZIP -DestinationPath $env:DSH_DESKTOP_SMOKE_UNPACK -Force";

function expandZipWithPowerShell(archive, destination, dependencies = {}) {
  const run = dependencies.execFileSync ?? execFileSync;
  const env = dependencies.env ?? process.env;
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", expandArchiveScript], {
    env: {
      ...env,
      DSH_DESKTOP_SMOKE_ZIP: archive,
      DSH_DESKTOP_SMOKE_UNPACK: destination,
    },
    stdio: "inherit",
    windowsHide: true,
  });
}

module.exports = { expandZipWithPowerShell };
