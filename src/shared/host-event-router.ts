// Notification decisions for one Host (issue #2). Pure state machine: it eats
// parsed frames and answers with notification intents, applying the dedup and
// edge rules the ticket's research facts require:
// - The mux replays still-pending approval/question frames on reconnect with
//   the rpcId reused verbatim, so approvals dedup by approvalId and questions
//   by the envelope rpcId.
// - There is no waiting-for-user event; `host/session-status` running:false
//   only counts after an observed running:true (the turn finished).
// - `session/jobs` is a full snapshot per session, so job completion is the
//   diff: a job seen running that next appears completed/killed/failed.
// State lives per Host link and survives socket reconnects — that is what
// replay dedup needs. When the Host leaves the ready set, the link (and its
// router) is discarded whole: a respawned Host is a new world, its ids are
// stale.
import {
  ACTIVE_JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  type EventFrame,
  type JobStatus,
} from "./event-frame.js";

export type IntentKind =
  | "approval"
  | "question"
  | "turn-finished"
  | "agent-error"
  | "job-finished";

export interface NotificationIntent {
  kind: IntentKind;
  title: string;
  body: string;
  sessionId: string;
}

export interface HostEventRouterDeps {
  hostLabel: string;
}

export class HostEventRouter {
  private readonly pendingApprovals = new Set<string>();
  private readonly pendingQuestions = new Set<string>();
  private readonly running = new Map<string, boolean>();
  /** Last seen job status per session, for the completion diff. */
  private readonly jobStatus = new Map<string, Map<string, JobStatus>>();
  private readonly label: string;

  constructor(deps: HostEventRouterDeps) {
    this.label = deps.hostLabel;
  }

  ingest(rpcId: string, frame: EventFrame): NotificationIntent[] {
    switch (frame.type) {
      case "approval/requested": {
        if (this.pendingApprovals.has(frame.approvalId)) return [];
        this.pendingApprovals.add(frame.approvalId);
        const reason = frame.reason ? ` — ${frame.reason}` : "";
        return [
          {
            kind: "approval",
            title: "Approval needed",
            body: `${this.label} · ${frame.toolName} wants your yes/no${reason}`,
            sessionId: frame.sessionId,
          },
        ];
      }
      case "approval/resolved": {
        this.pendingApprovals.delete(frame.approvalId);
        return [];
      }
      case "question/requested": {
        if (this.pendingQuestions.has(rpcId)) return [];
        this.pendingQuestions.add(rpcId);
        const question = frame.questions[0]?.question ?? "The agent asked a question";
        return [
          {
            kind: "question",
            title: "Question from agent",
            body: `${this.label} · ${question}`,
            sessionId: frame.sessionId,
          },
        ];
      }
      case "question/resolved": {
        this.pendingQuestions.delete(frame.questionRpcId);
        return [];
      }
      case "host/session-status": {
        const wasRunning = this.running.get(frame.sessionId) === true;
        this.running.set(frame.sessionId, frame.running);
        if (frame.running || !wasRunning) return [];
        return [
          {
            kind: "turn-finished",
            title: "Turn finished",
            body: `${this.label} · session waiting for you`,
            sessionId: frame.sessionId,
          },
        ];
      }
      case "host/agent-error": {
        return [
          {
            kind: "agent-error",
            title: "Agent error",
            body: `${this.label} · ${frame.message}`,
            sessionId: frame.sessionId,
          },
        ];
      }
      case "session/jobs": {
        return this.diffJobs(frame.sessionId, frame.jobs);
      }
    }
  }

  private diffJobs(
    sessionId: string,
    jobs: { id: string; label: string; status: JobStatus }[]
  ): NotificationIntent[] {
    const previous = this.jobStatus.get(sessionId) ?? new Map<string, JobStatus>();
    const next = new Map<string, JobStatus>();
    const intents: NotificationIntent[] = [];
    for (const job of jobs) {
      next.set(job.id, job.status);
      const before = previous.get(job.id);
      const finished =
        before !== undefined && ACTIVE_JOB_STATUSES.includes(before)
          ? TERMINAL_JOB_STATUSES.includes(job.status)
          : false;
      if (finished) {
        intents.push({
          kind: "job-finished",
          title: "Background job finished",
          body: `${this.label} · ${job.label} (${job.status})`,
          sessionId,
        });
      }
    }
    this.jobStatus.set(sessionId, next);
    return intents;
  }
}
