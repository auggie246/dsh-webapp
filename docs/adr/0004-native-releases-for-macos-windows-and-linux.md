# Native releases for macOS arm64, Windows x64, and Linux x64

DSH Desktop will publish native packages for macOS arm64, Windows x64, and Linux x64. We chose one three-platform release instead of source compatibility or build-only claims because support must include native package smoke tests. Other architectures, universal macOS packages, and 32-bit x86 remain out of scope.

## Consequences

- DSH Desktop follows the Electron 44.1.0 operating-system support matrix and upgrades from end-of-life Electron 38.
- `electron-builder` creates an unsigned macOS arm64 DMG, an unsigned per-user Windows x64 NSIS installer, a Windows x64 portable ZIP, a Linux x64 AppImage, and a Linux x64 DEB.
- Updates remain manual. Releases include SHA-256 checksums and GitHub artifact attestations.
- Pull requests, `main`, and semantic version tags run native jobs for the selected platform architectures.
- Package smoke tests cover launch, Spawn, Attach, and Spawned Host cleanup. One platform failure prevents the whole release.
- Prerelease tags create GitHub prereleases.
- Users install `dsh` separately. Missing `dsh` opens setup guidance, retry, and an explicit path picker.
- DSH Desktop rejects Host compatibility versions older than `0.0.1`. CI separately tests `dsh` package version `0.1.1-rc.2` and latest.
- Window close hides to the Tray. On Linux, it quits when DSH Desktop cannot provide a usable Tray.
- Signing and automatic updates move to an undecided v0.4 milestone.

## Considered Options

- macOS arm64 was selected because v0.3 supports Apple silicon and can smoke-test it natively on `macos-15`.
- macOS x64 and universal packages were rejected because v0.3 does not claim Intel Mac support.
- Bundling `dsh` was rejected because DSH Desktop would then own a second Node.js runtime and native dependency packaging.
- Separate installer tools around `@electron/packager` were rejected because `electron-builder` produces every selected artifact through one release path.
- Build-only and source-compatibility claims were rejected because they do not verify native runtime behavior.
