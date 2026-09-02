<p align="center">
  <img src="assets/icon.png" alt="DSH Desktop" width="128">
</p>

# DSH Desktop

DSH Desktop puts the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI in a native desktop window.

It manages several Hosts through one Host bar, stays available from the Tray, and shows operating-system notifications.

> [!NOTE]
> DSH Desktop is prerelease software. The v0.3 packages are unsigned and use manual updates.

## Install

### 1. Install `dsh`

DSH Desktop uses the separately published [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh) package.

```sh
npm install -g @deepseek-ai/dsh
```

### 2. Download DSH Desktop

Download the package for your platform from [GitHub Releases](https://github.com/auggie246/dsh-webapp/releases).

| Platform | Package |
| --- | --- |
| macOS 14 or later on Apple silicon | DMG |
| Windows x64 | Installer (`.exe`) or portable ZIP |
| Linux x64 | AppImage or Debian package (`.deb`) |

### 3. Open DSH Desktop

DSH Desktop uses Attach-or-spawn. It Attaches to an existing Host, or Spawns one with the installed `dsh`.

If DSH Desktop cannot find `dsh`, its setup screen can retry detection or use an explicit path.

## Features

- Manage several Hosts from one Host bar; right-click a Host to Remove it (a Spawned Host's process is stopped).
- Open the window with `Cmd+Shift+D` on macOS or `Ctrl+Shift+D` elsewhere by default.
- Keep DSH Desktop available after closing its window when the operating system provides a usable Tray.
- Receive notifications for Host events.
- Terminate every Spawned Host when DSH Desktop quits.

## Unsigned package warnings

macOS Gatekeeper and Windows SmartScreen can warn about the unsigned packages.

Follow the [safe installation and checksum instructions](docs/release-install.md) before you override either warning.

## Support

[Report problems through GitHub Issues](https://github.com/auggie246/dsh-webapp/issues).

Include your platform, downloaded package name, and `dsh --version` output.

## Develop

Development requires Node.js 22 and pnpm 11.7.0.

```sh
pnpm install --frozen-lockfile
pnpm start
```

Run the checks before you submit a change:

```sh
pnpm test
pnpm typecheck
```

## License

[MIT](LICENSE)
