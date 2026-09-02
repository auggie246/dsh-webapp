// Remove (Host bar right-click): a Spawned Host's process is stopped with the
// quit ladder, an attached Host is merely detached, and a start still in
// flight when the Host is removed may not resurrect it.
import { afterEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import type { WebContentsView } from "electron";

const mocks = vi.hoisted(() => ({
  probeHost: vi.fn(),
  resolveDshBinary: vi.fn(),
  spawnHostUntilUrl: vi.fn(),
  terminateAll: vi.fn(),
}));

vi.mock("../shared/attach-probe", () => ({ probeHost: mocks.probeHost }));
vi.mock("../shared/dsh-binary", () => ({
  resolveDshBinary: mocks.resolveDshBinary,
  augmentChildPath: () => "/usr/bin:/bin",
}));
vi.mock("../shared/spawn-host", () => ({ spawnHostUntilUrl: mocks.spawnHostUntilUrl }));
vi.mock("../shared/terminate-all", () => ({ terminateAll: mocks.terminateAll }));

import { HostManager } from "./hosts.js";
import { loadHostBar } from "../shared/host-bar-store.js";
import type { HostBarState } from "../shared/host-bar-protocol.js";

const dirs: string[] = [];
function tempBarFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "dsh-desktop-hosts-"));
  dirs.push(dir);
  return join(dir, "host-bar.json");
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
  vi.resetAllMocks();
});

/** A child that dies the moment it is signalled, like a well-behaved dsh. */
function makeChild(pid: number): ChildProcess & { killCalls: (string | undefined)[] } {
  const closeListeners: (() => void)[] = [];
  const killCalls: (string | undefined)[] = [];
  const child = {
    pid,
    exitCode: null as number | null,
    signalCode: null as string | null,
    once(event: string, listener: () => void) {
      if (event === "close") closeListeners.push(listener);
    },
    kill(signal?: string) {
      killCalls.push(signal);
      child.exitCode = 0;
      child.signalCode = (signal ?? "SIGTERM") as string | null;
      for (const listener of [...closeListeners]) listener();
      return true;
    },
  };
  return Object.assign(child, { killCalls }) as ChildProcess & {
    killCalls: (string | undefined)[];
  };
}

interface Harness {
  manager: HostManager;
  emitted: HostBarState[];
  views: { put: ReturnType<typeof vi.fn>; show: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  createdUrls: string[];
  barFile: string;
}

function makeManager(): Harness {
  const emitted: HostBarState[] = [];
  const views = { put: vi.fn(), show: vi.fn(), remove: vi.fn() };
  const createdUrls: string[] = [];
  const barFile = tempBarFile();
  const manager = new HostManager({
    barFile,
    onChanged: (state) => emitted.push(state),
    createView: (url) => {
      createdUrls.push(url);
      return {} as WebContentsView;
    },
    views,
  });
  return { manager, emitted, views, createdUrls, barFile };
}

function latestId(harness: Harness): string {
  return latest(harness).hosts[0]?.id ?? "";
}

function latest(harness: Harness): HostBarState {
  const state = harness.emitted[harness.emitted.length - 1];
  if (!state) throw new Error("no bar state was emitted");
  return state;
}

function spawnAnswers(child: ChildProcess, port: number): void {
  mocks.resolveDshBinary.mockReturnValue("/usr/bin/dsh");
  mocks.spawnHostUntilUrl.mockImplementation(
    (_command: string, _args: string[], options?: { onChild?: (child: ChildProcess) => void }) => {
      options?.onChild?.(child);
      return Promise.resolve({ child, url: `http://127.0.0.1:${port}`, port });
    }
  );
  mocks.probeHost.mockResolvedValue({ ok: true, info: { version: "1.2.3" } });
}

describe("HostManager remove", () => {
  test("forgetting a Spawned Host stops its process, drops its view, and empties the bar", async () => {
    const harness = makeManager();
    const child = makeChild(4242);
    spawnAnswers(child, 4123);
    await harness.manager.newSpawn();
    const id = latestId(harness);
    expect(harness.createdUrls).toEqual(["http://127.0.0.1:4123"]);

    harness.manager.remove(id);
    expect(harness.views.remove).toHaveBeenCalledWith(id);
    // How the process is stopped is the ladder's business (terminate-all
    // tests, platform-specific); here we assert Remove hands it the child.
    expect(mocks.terminateAll).toHaveBeenCalledWith([child]);
    expect(latest(harness).hosts).toEqual([]);
    expect(loadHostBar(harness.barFile)).toEqual([]);
  });

  test("forgetting an attached Host detaches without killing anything", async () => {
    const harness = makeManager();
    const child = makeChild(4243);
    mocks.probeHost.mockResolvedValue({ ok: true, info: { version: "1.2.3" } });
    await harness.manager.addAttach(4077);
    const id = latestId(harness);

    harness.manager.remove(id);
    expect(harness.views.remove).toHaveBeenCalledWith(id);
    expect(mocks.terminateAll).not.toHaveBeenCalled();
    expect(child.killCalls).toEqual([]);
    expect(latest(harness).hosts).toEqual([]);
  });

  test("removing the active Host activates the next one and shows its view", async () => {
    const harness = makeManager();
    spawnAnswers(makeChild(4244), 4124);
    await harness.manager.newSpawn();
    spawnAnswers(makeChild(4245), 4125);
    await harness.manager.newSpawn();
    const removedId = latestId(harness);

    harness.manager.remove(removedId);

    const state = latest(harness);
    expect(state.hosts).toHaveLength(1);
    expect(state.hosts[0]?.active).toBe(true);
    expect(harness.views.show).toHaveBeenCalledWith(state.hosts[0]?.id);
    expect(harness.views.remove).toHaveBeenCalledWith(removedId);
  });

  test("a start still in flight when removed never installs its view", async () => {
    const harness = makeManager();
    const child = makeChild(4246);
    mocks.resolveDshBinary.mockReturnValue("/usr/bin/dsh");
    const spawnGate: { release?: (value: { child: ChildProcess; url: string; port: number }) => void } = {};
    mocks.spawnHostUntilUrl.mockImplementation(
      (_command: string, _args: string[], options?: { onChild?: (child: ChildProcess) => void }) => {
        options?.onChild?.(child);
        return new Promise((resolve) => {
          spawnGate.release = resolve;
        });
      }
    );
    const spawning = harness.manager.newSpawn();
    const id = latestId(harness);

    harness.manager.remove(id);
    spawnGate.release?.({ child, url: "http://127.0.0.1:4126", port: 4126 });
    await spawning;

    expect(harness.createdUrls).toEqual([]);
    expect(harness.views.put).not.toHaveBeenCalled();
    expect(child.killCalls.length).toBeGreaterThan(0);
    expect(latest(harness).hosts).toEqual([]);
  });

  test("removing an unknown id is a no-op", () => {
    const harness = makeManager();
    const before = harness.emitted.length;

    harness.manager.remove("no-such-host");

    expect(harness.views.remove).not.toHaveBeenCalled();
    expect(harness.emitted.length).toBe(before);
  });
});
