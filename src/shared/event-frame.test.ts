import { describe, expect, test } from "vitest";
import { frameStream, parseEventEnvelope } from "./event-frame.js";

/** Wraps a frame payload in the Host's ServerRequest full form. */
function envelope(rpcId: string, payload: unknown): string {
  return JSON.stringify({ type: "server-request", rpcId, method: "events", payload });
}

describe("Event frame parser", () => {
  const APPROVAL_FRAME = {
    type: "approval/requested",
    sessionId: "s-1",
    approvalId: "a-1",
    toolName: "bash",
  } as const;

  test("parses an approval/requested frame", () => {
    expect(
      parseEventEnvelope(
        envelope("rpc-1", {
          type: "approval/requested",
          sessionId: "s-1",
          approvalId: "a-1",
          toolName: "bash",
          reason: "runs rm -rf",
        })
      )
    ).toEqual({
      rpcId: "rpc-1",
      frame: {
        type: "approval/requested",
        sessionId: "s-1",
        approvalId: "a-1",
        toolName: "bash",
        reason: "runs rm -rf",
      },
    });
  });

  test("parses an approval/requested frame without a reason", () => {
    const parsed = parseEventEnvelope(
      envelope("rpc-1", {
        type: "approval/requested",
        sessionId: "s-1",
        approvalId: "a-1",
        toolName: "bash",
      })
    );
    expect(parsed?.frame).toEqual({
      type: "approval/requested",
      sessionId: "s-1",
      approvalId: "a-1",
      toolName: "bash",
    });
  });

  test("parses approval/resolved and question frames", () => {
    expect(
      parseEventEnvelope(
        envelope("rpc-2", {
          type: "approval/resolved",
          sessionId: "s-1",
          approvalId: "a-1",
          outcome: "allowed-once",
        })
      )?.frame
    ).toEqual({ type: "approval/resolved", sessionId: "s-1", approvalId: "a-1" });

    expect(
      parseEventEnvelope(
        envelope("rpc-3", {
          type: "question/requested",
          sessionId: "s-1",
          questions: [{ id: "q-1", question: "Proceed?", header: "Confirm" }],
        })
      )?.frame
    ).toEqual({
      type: "question/requested",
      sessionId: "s-1",
      questions: [{ id: "q-1", question: "Proceed?", header: "Confirm" }],
    });

    expect(
      parseEventEnvelope(
        envelope("rpc-4", {
          type: "question/resolved",
          sessionId: "s-1",
          questionRpcId: "rpc-3",
          outcome: "answered",
        })
      )?.frame
    ).toEqual({ type: "question/resolved", sessionId: "s-1", questionRpcId: "rpc-3" });
  });

  test("parses host/session-status and host/agent-error frames", () => {
    expect(
      parseEventEnvelope(
        envelope("rpc-5", { type: "host/session-status", sessionId: "s-1", running: false })
      )?.frame
    ).toEqual({ type: "host/session-status", sessionId: "s-1", running: false });

    expect(
      parseEventEnvelope(
        envelope("rpc-6", {
          type: "host/agent-error",
          sessionId: "s-1",
          message: "boom",
        })
      )?.frame
    ).toEqual({ type: "host/agent-error", sessionId: "s-1", message: "boom" });
  });

  test("parses a session/jobs snapshot", () => {
    expect(
      parseEventEnvelope(
        envelope("rpc-7", {
          type: "session/jobs",
          sessionId: "s-1",
          jobs: [
            { id: "j-1", kind: "subagent", label: "Research", status: "completed" },
            { id: "j-2", kind: "subagent", label: "Build", status: "running" },
          ],
        })
      )?.frame
    ).toEqual({
      type: "session/jobs",
      sessionId: "s-1",
      jobs: [
        { id: "j-1", label: "Research", status: "completed" },
        { id: "j-2", label: "Build", status: "running" },
      ],
    });
  });

  test("drops frames the app does not act on", () => {
    expect(
      parseEventEnvelope(
        envelope("rpc-8", { type: "session/event", sessionId: "s-1", event: {} })
      )
    ).toBeNull();
  });

  test("routes host/ frames to the host stream and everything else to mux", () => {
    expect(frameStream({ type: "host/session-status", sessionId: "s-1", running: true })).toBe("host");
    expect(frameStream({ type: "host/agent-error", sessionId: "s-1", message: "x" })).toBe("host");
    expect(frameStream(APPROVAL_FRAME)).toBe("mux");
    expect(
      frameStream({
        type: "session/jobs",
        sessionId: "s-1",
        jobs: [{ id: "j-1", label: "L", status: "running" }],
      })
    ).toBe("mux");
  });

  test("drops malformed envelopes: bad JSON, wrong type, missing fields", () => {
    expect(parseEventEnvelope("{ not json")).toBeNull();
    expect(parseEventEnvelope(JSON.stringify({ type: "client-request" }))).toBeNull();
    expect(parseEventEnvelope(envelope("", { type: "host/agent-error" }))).toBeNull();
    expect(
      parseEventEnvelope(envelope("rpc-9", { type: "host/agent-error", sessionId: "" }))
    ).toBeNull();
    expect(
      parseEventEnvelope(
        envelope("rpc-10", { type: "host/session-status", sessionId: "s-1", running: "yes" })
      )
    ).toBeNull();
  });
});
