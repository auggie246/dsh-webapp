// The slice of the Host event protocol DSH Desktop acts on (issue #2). Both
// downlinks — /api/events.mux and /api/events.host — carry ServerRequest
// envelopes whose payload is a frame; the frame shapes here mirror the Host's
// schema, narrowed to what notifications need. Everything the app does not
// act on parses to null and is dropped.
export interface QuestionItem {
  id: string;
  question: string;
  header?: string;
}

export type JobStatus = "running" | "stopping" | "completed" | "killed" | "failed";

/** Statuses that keep a job going. */
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ["running", "stopping"];

/** Statuses that end a job; a job reaching one of these has finished. */
export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ["completed", "killed", "failed"];

export interface JobView {
  id: string;
  label: string;
  status: JobStatus;
}

export type EventFrame =
  | {
      type: "approval/requested";
      sessionId: string;
      approvalId: string;
      toolName: string;
      reason?: string;
    }
  | { type: "approval/resolved"; sessionId: string; approvalId: string }
  | { type: "question/requested"; sessionId: string; questions: QuestionItem[] }
  | { type: "question/resolved"; sessionId: string; questionRpcId: string }
  | { type: "session/jobs"; sessionId: string; jobs: JobView[] }
  | { type: "host/session-status"; sessionId: string; running: boolean }
  | { type: "host/agent-error"; sessionId: string; message: string };

export interface EventEnvelope {
  rpcId: string;
  frame: EventFrame;
}

export type EventStream = "mux" | "host";

/**
 * Which downlink a frame type belongs to, mirroring the Host's own client:
 * the mux socket parses MuxFrames, the host socket parses HostFrames. A
 * frame arriving on the other socket is a protocol violation, not a second
 * delivery.
 */
export function frameStream(frame: EventFrame): EventStream {
  return frame.type.startsWith("host/") ? "host" : "mux";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function asOptionalText(value: unknown): string | undefined {
  return asText(value) ?? undefined;
}

function parseQuestion(raw: unknown): QuestionItem | null {
  if (!isRecord(raw)) return null;
  const id = asText(raw.id);
  const question = asText(raw.question);
  if (id === null || question === null) return null;
  return { id, question, header: asOptionalText(raw.header) };
}

function parseJobStatus(value: unknown): JobStatus | null {
  return value === "running" ||
    value === "stopping" ||
    value === "completed" ||
    value === "killed" ||
    value === "failed"
    ? value
    : null;
}

function parseFrame(payload: unknown): EventFrame | null {
  if (!isRecord(payload)) return null;
  const sessionId = asText(payload.sessionId);
  if (sessionId === null) return null;
  switch (payload.type) {
    case "approval/requested": {
      const approvalId = asText(payload.approvalId);
      const toolName = asText(payload.toolName);
      if (approvalId === null || toolName === null) return null;
      return {
        type: "approval/requested",
        sessionId,
        approvalId,
        toolName,
        reason: asOptionalText(payload.reason),
      };
    }
    case "approval/resolved": {
      const approvalId = asText(payload.approvalId);
      if (approvalId === null) return null;
      return { type: "approval/resolved", sessionId, approvalId };
    }
    case "question/requested": {
      if (!Array.isArray(payload.questions) || payload.questions.length === 0) return null;
      const questions = payload.questions
        .map(parseQuestion)
        .filter((question): question is QuestionItem => question !== null);
      if (questions.length === 0) return null;
      return { type: "question/requested", sessionId, questions };
    }
    case "question/resolved": {
      const questionRpcId = asText(payload.questionRpcId);
      if (questionRpcId === null) return null;
      return { type: "question/resolved", sessionId, questionRpcId };
    }
    case "session/jobs": {
      if (!Array.isArray(payload.jobs)) return null;
      const jobs: JobView[] = [];
      for (const raw of payload.jobs) {
        if (!isRecord(raw)) continue;
        const id = asText(raw.id);
        const label = asText(raw.label);
        const status = parseJobStatus(raw.status);
        if (id === null || label === null || status === null) continue;
        jobs.push({ id, label, status });
      }
      // A jobs frame is a snapshot; an unparsable snapshot is not acted on.
      if (payload.jobs.length > 0 && jobs.length === 0) return null;
      return { type: "session/jobs", sessionId, jobs };
    }
    case "host/session-status": {
      if (typeof payload.running !== "boolean") return null;
      return { type: "host/session-status", sessionId, running: payload.running };
    }
    case "host/agent-error": {
      const message = asText(payload.message);
      if (message === null) return null;
      return { type: "host/agent-error", sessionId, message };
    }
    default:
      return null;
  }
}

/**
 * Parses one WebSocket message into an envelope the app acts on. Returns
 * null for anything else: bad JSON, not a server-request, or a frame type
 * this app has no notification for.
 */
export function parseEventEnvelope(text: string): EventEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.type !== "server-request") return null;
  const rpcId = asText(parsed.rpcId);
  if (rpcId === null) return null;
  const frame = parseFrame(parsed.payload);
  return frame === null ? null : { rpcId, frame };
}
