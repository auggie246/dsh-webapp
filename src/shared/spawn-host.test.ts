import { afterEach, describe, expect, test, vi } from "vitest";
import { spawnHostUntilUrl } from "./spawn-host.js";
import type { ChildProcess } from "node:child_process";

const children: ChildProcess[] = [];

function track(child: ChildProcess): ChildProcess {
  children.push(child);
  return child;
}

afterEach(() => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill("SIGKILL");
      } catch {
        // already gone
      }
    }
  }
  children.length = 0;
});

describe("spawnHostUntilUrl", () => {
  test("resolves with the child, URL, and port from the stdout contract", async () => {
    const host = await spawnHostUntilUrl(process.execPath, [
      "-e",
      `console.log("noise before");
       console.log("dsh web: http://127.0.0.1:4123 (LAN: http://10.0.0.2:4123)");`,
    ]);
    track(host.child);
    expect(host.url).toBe("http://127.0.0.1:4123");
    expect(host.port).toBe(4123);
  });

  test("hands the child to onChild the moment it exists, before the URL line", async () => {
    let seenPid: number | undefined;
    let sawChildBeforeSettle = false;
    const host = await spawnHostUntilUrl(
      process.execPath,
      [
        "-e",
        `setTimeout(() => console.log("dsh web: http://127.0.0.1:4124"), 150);`,
      ],
      {
        onChild: (child) => {
          seenPid = child.pid;
          sawChildBeforeSettle = true;
        },
      }
    );
    track(host.child);
    expect(sawChildBeforeSettle).toBe(true);
    expect(seenPid).toBe(host.child.pid);
  });

  test("rejects when the child exits before printing the URL line", async () => {
    await expect(
      spawnHostUntilUrl(process.execPath, ["-e", `process.exit(3);`], {
        timeoutMs: 5000,
      })
    ).rejects.toThrow(/code=3/);
  });

  test("rejects on timeout and kills the child so nothing is orphaned", async () => {
    const promise = spawnHostUntilUrl(
      process.execPath,
      ["-e", `setInterval(() => {}, 1000);`],
      { timeoutMs: 200 }
    );
    await expect(promise).rejects.toThrow(/no URL line within 200ms/);
    // The rejected promise cannot hand us the child; prove the kill through a
    // fresh run with the same shape and onChild.
    let child: ChildProcess | undefined;
    await expect(
      spawnHostUntilUrl(
        process.execPath,
        ["-e", `setInterval(() => {}, 1000);`],
        { timeoutMs: 200, onChild: (c) => (child = c) }
      )
    ).rejects.toThrow(/no URL line/);
    await vi.waitFor(() => {
      expect(child?.signalCode).toBe("SIGKILL");
    });
  });
});
