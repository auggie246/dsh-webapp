# Load the localhost URL, not the __DSH_TRANSPORT__ IPC seam

DSH ships an explicit desktop-shell seam — load the frontend dist over `file://` and carry fetch over IPC via `globalThis.__DSH_TRANSPORT__` — but nothing uses it today, and the host half of that bridge would be new code this repo owns forever. We decided each Host renders by loading its `http://127.0.0.1:<port>` URL in the app window, so the app talks to the Host exactly like a browser does: same-origin HTTP POST plus the downlink WebSockets, and the loopback trust fence passes unchanged.

## Consequences

- The app's only coupling to DSH is the stdout contract `dsh web: http://127.0.0.1:<port>` and the loopback API; DSH upgrades cannot break the shell.
- A localhost HTTP server runs while the app is open, exactly as it does today.
- Revisit this ADR if DSH ever removes the HTTP server or ships a finished desktop transport.
