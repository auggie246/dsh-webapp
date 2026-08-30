import { execFile } from "node:child_process";

// Quit kills every spawned Host (issue #1, item 6; prototype issue #4). The
// app SIGTERMs every live child; dsh exits cleanly on SIGTERM. A child that
// ignores SIGTERM meets SIGKILL after the grace period. The promise resolves
// when every child is gone — or after a final fail-safe, so quit itself can
// never hang on a misbehaving child.
export interface Killable {
  pid?: number;
  kill(signal?: NodeJS.Signals | number): boolean;
  exitCode: number | null;
  signalCode: string | null;
  once(event: "close", listener: () => void): unknown;
}

export interface TerminateOptions {
  /** Milliseconds of SIGTERM grace before SIGKILL. Default 5000. */
  graceMs?: number;
  platform?: NodeJS.Platform;
  terminateWindowsTree?: (pid: number) => Promise<void>;
}

function alive(child: Killable): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function taskkillTree(pid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function terminateWindows(
  live: Killable[],
  graceMs: number,
  terminateTree: (pid: number) => Promise<void>
): Promise<void> {
  return new Promise((resolve) => {
    let remaining = live.length;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(failSafe);
      resolve();
    };
    const failSafe = setTimeout(finish, graceMs + 2000);
    for (const child of live) {
      child.once("close", () => {
        remaining -= 1;
        if (remaining <= 0) finish();
      });
    }
    for (const child of live) {
      if (child.pid === undefined) {
        try {
          child.kill();
        } catch {
          remaining -= 1;
          if (remaining <= 0) finish();
        }
        continue;
      }
      void terminateTree(child.pid).catch(() => undefined);
    }
  });
}

export function terminateAll(
  children: Killable[],
  options: TerminateOptions = {}
): Promise<void> {
  const graceMs = options.graceMs ?? 5000;
  const live = children.filter(alive);
  if (live.length === 0) return Promise.resolve();
  if ((options.platform ?? process.platform) === "win32") {
    return terminateWindows(live, graceMs, options.terminateWindowsTree ?? taskkillTree);
  }

  return new Promise<void>((resolve) => {
    let remaining = live.length;
    let done = false;

    const hard = setTimeout(() => {
      for (const child of live) {
        if (alive(child)) {
          try {
            child.kill("SIGKILL");
          } catch {
            // already gone
          }
        }
      }
    }, graceMs);

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(hard);
      clearTimeout(failSafe);
      resolve();
    };

    // Even SIGKILL can, in principle, go unreported; quit must not hang.
    const failSafe = setTimeout(finish, graceMs + 2000);

    for (const child of live) {
      child.once("close", () => {
        remaining -= 1;
        if (remaining <= 0) finish();
      });
    }

    for (const child of live) {
      try {
        child.kill("SIGTERM");
      } catch {
        remaining -= 1;
        if (remaining <= 0) finish();
      }
    }
  });
}
