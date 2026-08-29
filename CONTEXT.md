# DSH Desktop

The desktop shell app for the DeepSeek Harness (DSH) web GUI. It gives the GUI its own window, dock icon, menu-bar presence, and OS notifications, instead of a browser tab on localhost.

## Language

**Host**:
One running `dsh` process that serves the web GUI and its API on a loopback port.
_Avoid_: Server, backend, daemon, instance

**Host bar**:
The Discord-style rail in DSH Desktop that lists every Host the app manages. A "+" control adds a Host.
_Avoid_: Server bar, session switcher, instance switcher

**Attach**:
Connect DSH Desktop to a Host the user started outside the app.
_Avoid_: Connect, bind

**Spawn**:
Start a new Host as a child process of DSH Desktop.
_Avoid_: Launch (reserved for starting the app itself), run

**Attach-or-spawn**:
The startup rule of DSH Desktop: Attach when a Host is found; Spawn otherwise.
_Avoid_: Find-or-launch, auto-discovery
