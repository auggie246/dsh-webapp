import { afterEach, describe, expect, test } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { terminateAll } from "./terminate-all.js";

const children: ChildProcess[] = [];

// The child prints "ready" once its signal handlers are installed; without
// the handshake a SIGTERM can outrun Node's startup and kill the child by
// default action, making "ignores SIGTERM" unreliable.
function waitForReady(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.stdout?.setEncoding("utf8");
    child.stdout?.once("data", (chunk: string) => {
      if (chunk.includes("ready")) resolve();
      else reject(new Error(`unexpected first stdout: ${chunk}`));
    });
    child.once("error", reject);
  });
}

function stubbornChild(): Promise<ChildProcess> {
  // Ignores SIGTERM; only SIGKILL can end it.
  const child = spawn(
    process.execPath,
    [
      "-e",
      `process.on("SIGTERM", () => {});
       console.log("ready");
       setInterval(() => {}, 1000);`,
    ],
    { stdio: ["ignore", "pipe", "ignore"] }
  );
  children.push(child);
  return waitForReady(child).then(() => child);
}

function politeChild(): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    ["-e", `console.log("ready"); setInterval(() => {}, 1000);`],
    { stdio: ["ignore", "pipe", "ignore"] }
  );
  children.push(child);
  return waitForReady(child).then(() => child);
}

afterEach(async () => {
  // Safety net for anything a failed test left behind.
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve();
          child.once("close", () => resolve());
          try {
            child.kill("SIGKILL");
          } catch {
            resolve();
          }
        })
    )
  );
  children.length = 0;
});

function alive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

async function closed(child: ChildProcess): Promise<void> {
  if (!alive(child)) return;
  return new Promise((resolve) => child.once("close", () => resolve()));
}

describe("terminateAll", () => {
  test("SIGTERM is enough for children that take it", async () => {
    const child = await politeChild();
    await terminateAll([child], { graceMs: 5000 });
    expect(alive(child)).toBe(false);
    expect(child.signalCode).toBe("SIGTERM");
  });

  test("escalates to SIGKILL when a child ignores SIGTERM", async () => {
    const child = await stubbornChild();
    await terminateAll([child], { graceMs: 200 });
    await closed(child);
    expect(alive(child)).toBe(false);
    expect(child.signalCode).toBe("SIGKILL");
  });

  test("resolves immediately when nothing is alive", async () => {
    const startedAt = Date.now();
    await terminateAll([], { graceMs: 5000 });
    expect(Date.now() - startedAt).toBeLessThan(100);
  });

  test("leaves already-dead children alone and still handles the live ones", async () => {
    const dead = spawn(process.execPath, ["-e", "process.exit(0);"]);
    await closed(dead);
    const child = await politeChild();
    await terminateAll([dead, child], { graceMs: 5000 });
    expect(dead.exitCode).toBe(0);
    expect(alive(child)).toBe(false);
  });

  test("terminates many children at once", { timeout: 10_000 }, async () => {
    const many = await Promise.all([
      stubbornChild(),
      politeChild(),
      stubbornChild(),
      politeChild(),
    ]);
    const startedAt = Date.now();
    await terminateAll(many, { graceMs: 200 });
    for (const child of many) await closed(child);
    expect(many.every((child) => !alive(child))).toBe(true);
    // SIGKILL lands after the 200ms grace, not at once.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(150);
  });

  test("still resolves if SIGKILL itself never reports a close", { timeout: 10_000 }, async () => {
    const neverClosing = {
      pid: -1,
      kill: () => true,
      exitCode: null,
      signalCode: null,
      once: () => neverClosing, // never fires its close event
    };
    const startedAt = Date.now();
    await terminateAll([neverClosing], { graceMs: 100 });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(100);
  });
});
