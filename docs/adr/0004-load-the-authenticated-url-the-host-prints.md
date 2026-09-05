# Load the authenticated URL the Host prints

DSH 0.1.2-rc.1 authenticated the `dsh web` server: the URL it prints now carries the Host's per-process launch token (`http://127.0.0.1:<port>/?token=<t>`), a `GET /?token=<t>` mints the session cookie, and every other request — API POSTs and WebSocket upgrades alike — requires that cookie. The token exists only in the Host process's memory. We decided the shell treats the full printed URL as the spawn contract: the Host's view loads the authenticated URL and Electron's session performs the token→cookie exchange exactly like a browser, and the main-process probe mints its own cookie through the same `GET /?token=<t>` exchange before calling `host.describe`. No shell code ever mints, stores, or forges Host credentials.

## Consequences

- The stdout contract grew a token (`url-line.ts` returns `{ url, port, token? }`); a tokenless line still means a pre-authentication Host, so old Hosts keep working unchanged.
- Attaching to an already-running Host needs the token only its process knows, so "Add Host at port or URL…" accepts the pasted authenticated URL (or the whole `dsh web:` line), and the bar entry persists that token. A probe answered with 401 is a distinct `authRequired` result — a Host is there, it needs its URL.
- A Spawned Host mints a fresh token every launch, so spawn entries never persist one.
- The probe authenticates first (token → cookie via the browser's `GET /?token=…` exchange), then pings the modern remote API (`settings/describe`; any `server-response` envelope proves a Host) and falls back to the pre-auth `host.describe`, whose answer still reports a version. A modern Host therefore reports no version: serving the authenticated 0.1.2-class API is itself the compatibility proof (`assessHostCompatibility(version, modern)`).
- The 0.1.2 API surface also moved the forwarded events onto `/api/remote.mux` with a new wire protocol, so the event watches stay off for modern Hosts (logged once) until that port lands; legacy Hosts keep the old downlinks.
- An offline Host explains itself: the bar summary carries a note (e.g. "needs its authenticated URL …") shown in the button tooltip.
- The shell's coupling to DSH remains the stdout contract plus the loopback API (ADR-0002), now including the authentication exchange a browser already performs.
