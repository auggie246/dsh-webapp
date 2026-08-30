# Electron for the desktop shell

DSH Desktop must own a window, app icon, and Tray presence; send OS notifications; hold a global hotkey; and supervise `dsh web` as a child process. We chose Electron over Tauri 2 because Electron ships a full Node.js runtime, so supervising the Host is plain JavaScript; Tauri's smaller install did not justify a Rust toolchain plus shell-side process plumbing.

## Consequences

- Install size around 100 MB, versus around 10 MB for Tauri.
- Release targets follow ADR-0004; the shell supports macOS, Windows, and Linux on x64.

## Considered Options

- **Tauri 2** — smaller, but no Node runtime: process management moves to Rust or shell plugins.
- **Installable PWA** — DSH's manifest is install-hint only (no service worker); no control over the Host.
- **Browser app-mode shortcut** — zero code, but no Tray, notifications, hotkey, or Host management.
