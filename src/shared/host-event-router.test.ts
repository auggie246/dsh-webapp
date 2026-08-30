import { describe, expect, test } from "vitest";
import type { EventFrame } from "./event-frame.js";
import { HostEventRouter, type NotificationIntent } from "./host-event-router.js";

const APPROVAL: EventFrame = {
  type: "approval/requested",
  sessionId: "s-1",
  approvalId: "a-1",
  toolName: "bash",
  reason: "runs the test suite",
};

function approval(approvalId: string): EventFrame {
  return {
    type: "approval/requested",
    sessionId: "s-1",
    approvalId,
    toolName: "bash",
    reason: "runs the test suite",
  };
}

function question(): EventFrame {
  return {
    type: "question/requested",
    sessionId: "s-1",
    questions: [{ id: "q-1", question: "Which database?", header: "Choose" }],
  };
}

function jobs(status: "running" | "completed" | "killed" | "failed"): EventFrame {
  return {
    type: "session/jobs",
    sessionId: "s-1",
    jobs: [{ id: "j-1", label: "Research", status }],
  };
}

describe("Host event router", () => {
  test("notifies on approval/requested with tool name and reason", () => {
    const router = new HostEventRouter({ hostLabel: "Host 1" });
    expect(router.ingest("rpc-1", APPROVAL)).toEqual([
      {
        kind: "approval",
        title: "Approval needed",
        body: "Host 1 · bash wants your yes/no — runs the test suite",
        sessionId: "s-1",
      },
    ]);
  });

  test("does not re-notify when the mux replays the same approval", () => {
    const router = new HostEventRouter({ hostLabel: "Host 1" });
    router.ingest("rpc-1", approval("a-1"));
    // Reconnect replay: same approvalId, fresh envelope rpcId.
    expect(router.ingest("rpc-2", approval("a-1"))).toEqual([]);
  });

  test("re-notifies a different approval and stops after approval/resolved", () => {
    const router = new HostEventRouter({ hostLabel: "Host 1" });
    router.ingest("rpc-1", approval("a-1"));
    router.ingest("rpc-2", { type: "approval/resolved", sessionId: "s-1", approvalId: "a-1" });
    expect(router.ingest("rpc-3", approval("a-1")).map((intent) => intent.kind)).toEqual([
      "approval",
    ]);
  });

  test("deduplicates question/requested by the envelope rpcId", () => {
    const router = new HostEventRouter({ hostLabel: "Host 2" });
    const first = router.ingest("rpc-9", question());
    expect(first).toEqual([
      {
        kind: "question",
        title: "Question from agent",
        body: "Host 2 · Which database?",
        sessionId: "s-1",
      },
    ]);
    // Reconnect replay reuses the rpcId verbatim.
    expect(router.ingest("rpc-9", question())).toEqual([]);
    router.ingest("rpc-10", { type: "question/resolved", sessionId: "s-1", questionRpcId: "rpc-9" });
    expect(router.ingest("rpc-9", question())).toEqual(first);
  });

  test("notifies turn-finished only on an observed running → stopped edge", () => {
    const router = new HostEventRouter({ hostLabel: "Host 1" });
    const status = (running: boolean): EventFrame => ({
      type: "host/session-status",
      sessionId: "s-1",
      running,
    });
    // Idle session reported at connect: no notification.
    expect(router.ingest("rpc-1", status(false))).toEqual([]);
    expect(router.ingest("rpc-2", status(true))).toEqual([]);
    expect(router.ingest("rpc-3", status(false)).map((intent) => intent.kind)).toEqual([
      "turn-finished",
    ]);
    // A second running: false without a running: true between: silent.
    expect(router.ingest("rpc-4", status(false))).toEqual([]);
  });

  test("notifies on host/agent-error", () => {
    const router = new HostEventRouter({ hostLabel: "Host 1" });
    expect(
      router.ingest("rpc-1", { type: "host/agent-error", sessionId: "s-1", message: "boom" })
    ).toEqual([
      {
        kind: "agent-error",
        title: "Agent error",
        body: "Host 1 · boom",
        sessionId: "s-1",
      },
    ]);
  });

  test("notifies job-finished only when a seen job reaches a terminal status", () => {
    const router = new HostEventRouter({ hostLabel: "Host 1" });
    // First snapshot already completed: old news, silent.
    expect(router.ingest("rpc-1", jobs("completed"))).toEqual([]);
    // Running then completed: one notification.
    router.ingest("rpc-2", jobs("running"));
    expect(router.ingest("rpc-3", jobs("completed"))).toEqual([
      {
        kind: "job-finished",
        title: "Background job finished",
        body: "Host 1 · Research (completed)",
        sessionId: "s-1",
      },
    ]);
    // Still terminal: silent.
    expect(router.ingest("rpc-4", jobs("completed"))).toEqual([]);
  });

  test("notifies killed and failed job outcomes once", () => {
    const router = new HostEventRouter({ hostLabel: "Host 1" });
    router.ingest("rpc-1", jobs("running"));
    expect(router.ingest("rpc-2", jobs("killed")).map((intent) => intent.kind)).toEqual([
      "job-finished",
    ]);
    router.ingest("rpc-3", jobs("running"));
    expect(router.ingest("rpc-4", jobs("failed")).map((intent) => intent.kind)).toEqual([
      "job-finished",
    ]);
  });
});

describe("Intent shape", () => {
  test("every intent carries kind, title, body, sessionId", () => {
    const router = new HostEventRouter({ hostLabel: "Host 1" });
    const intents: NotificationIntent[] = [
      ...router.ingest("rpc-1", APPROVAL),
      ...router.ingest("rpc-2", question()),
      ...router.ingest("rpc-3", {
        type: "host/session-status",
        sessionId: "s-1",
        running: false,
      }),
    ];
    for (const intent of intents) {
      expect(typeof intent.kind).toBe("string");
      expect(intent.title.length).toBeGreaterThan(0);
      expect(intent.body.length).toBeGreaterThan(0);
      expect(typeof intent.sessionId).toBe("string");
    }
  });
});
