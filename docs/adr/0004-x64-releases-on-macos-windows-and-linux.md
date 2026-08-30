# x64 releases on macOS, Windows, and Linux

DSH Desktop will publish native x64 packages for macOS, Windows, and Linux. We chose one three-platform release instead of source compatibility or build-only claims because support must include native package smoke tests. ARM and 32-bit x86 remain out of scope.

## Consequences

- DSH Desktop follows the current stable Electron operating-system support matrix and upgrades from end-of-life Electron 38.
- `electron-builder` creates an unsigned macOS DMG, an unsigned per-user Windows NSIS installer, a Windows portable ZIP, a Linux AppImage, and a Linux DEB.
- Updates remain manual. Releases include SHA-256 checksums and GitHub artifact attestations.
- Pull requests, `main`, and semantic version tags run native x64 jobs for all three platforms.
- Package smoke tests cover launch, Spawn, Attach, and Spawned Host cleanup. One platform failure prevents the whole release.
- Prerelease tags create GitHub prereleases.
- Users install `dsh` separately. Missing `dsh` opens setup guidance, retry, and an explicit path picker.
- DSH Desktop rejects Hosts older than its recorded minimum. The first minimum is `0.1.1-rc.2`; CI tests that minimum and the latest published `dsh`.
- Window close hides to the Tray. On Linux, it quits when DSH Desktop cannot provide a usable Tray.
- Signing and automatic updates move to an undecided v0.4 milestone.

## Considered Options

- Bundling `dsh` was rejected because DSH Desktop would then own a second Node.js runtime and native dependency packaging.
- Separate installer tools around `@electron/packager` were rejected because `electron-builder` produces every selected artifact through one release path.
- Build-only and source-compatibility claims were rejected because they do not verify native runtime behavior.
