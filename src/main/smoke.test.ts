import { afterEach, describe, expect, test, vi } from "vitest";
import type { HostBarState } from "../shared/host-bar-protocol";

const readyState: HostBarState = {
  hosts: [{ id: "host-1", label: "Host 1", kind: "spawn", port: 3080, status: "ready", active: true }],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("smoke page readiness", () => {
  test("does not quit before the Host page finishes loading", async () => {
    vi.stubEnv("DSH_DESKTOP_SMOKE_FILE", "/tmp/dsh-desktop-smoke-test.jsonl");
    vi.stubEnv("DSH_DESKTOP_SMOKE_AUTO_QUIT", "1");
    const { smoke } = await import("./smoke.js");
    const write = vi.spyOn(smoke, "write").mockImplementation(() => {});
    const quit = vi.fn();

    smoke.recordReady(readyState, [], quit);
    await Promise.resolve();

    expect(write).toHaveBeenCalledWith({ event: "host-ready", kind: "spawn", port: 3080, pid: undefined });
    expect(quit).not.toHaveBeenCalled();

    smoke.recordHostPageLoaded(quit);
    await Promise.resolve();

    expect(write).toHaveBeenCalledWith({ event: "host-page-loaded" });
    expect(quit).toHaveBeenCalledOnce();
  });
});
