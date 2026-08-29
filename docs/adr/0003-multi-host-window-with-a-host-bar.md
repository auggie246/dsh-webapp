# Multi-Host window with a Host bar

One Host already serves every session, and the web GUI already lists and switches sessions, so a second Host adds no session access — it duplicates the same session list. We decided DSH Desktop still manages several Hosts at once, Discord-server-bar style, because the user wants process-level separation (separate `dsh` processes on separate ports, e.g. 3080 and 3081) and the Discord metaphor is the product's identity. The Host bar lists every Host; "+" offers New Host (Spawn on a random port) or Add Host at port… (Attach); the bar persists ports and labels and re-attaches or re-spawns on launch.

## Consequences

- Every Host shows the same session list; the Host bar separates processes, not sessions.
- Session switching inside one Host stays in the web GUI; the app never builds its own.
- Each Host needs its own view in the window so page state survives switching.
