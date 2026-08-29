// Quit kills every spawned Host (issue #1, item 6; prototype issue #4). The
// app SIGTERMs every live child; dsh exits cleanly on SIGTERM. A child that
// ignores SIGTERM meets SIGKILL after the grace period. The promise resolves
// when every child is gone — or after a final fail-safe, so quit itself can
// never hang on a misbehaving child.
export interface Killable {
  pid?: number;
  kill(signal: string): boolean;
  exitCode: number | null;
  signalCode: string | null;
  once(event: "close", listener: () => void): unknown;
}

export interface TerminateOptions {
  /** Milliseconds of SIGTERM grace before SIGKILL. Default 5000. */
  graceMs?: number;
}

function alive(child: Killable): boolean {
  return child.exitCode === null && child.signalCode === null;
}

export function terminateAll(
  children: Killable[],
  options: TerminateOptions = {}
): Promise<void> {
  const graceMs = options.graceMs ?? 5000;
  const live = children.filter(alive);
  if (live.length === 0) return Promise.resolve();

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
