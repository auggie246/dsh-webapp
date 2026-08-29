# Electron for the desktop shell

DSH Desktop must own a window and dock icon, sit in the menu bar, send OS notifications, hold a global hotkey, and supervise `dsh web` — a Node.js program — as a child process. We chose Electron over Tauri 2 because Electron ships a full Node.js runtime, so spawning and supervising the Host is plain JavaScript, and its auto-update path (Squirrel.Mac) fits our GitHub Releases channel; Tauri's smaller install did not justify a Rust toolchain plus shell-side process plumbing.

## Consequences

- Install size around 100 MB, versus around 10 MB for Tauri.
- macOS only for now; the shell code stays cross-platform so Windows and Linux can follow.

## Considered Options

- **Tauri 2** — smaller, but no Node runtime: process management moves to Rust or shell plugins.
- **Installable PWA** — DSH's manifest is install-hint only (no service worker); no control over the Host.
- **Browser app-mode shortcut** — zero code, but no menu bar, notifications, hotkey, or Host management.
