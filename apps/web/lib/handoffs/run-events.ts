/**
 * Agent-run observability for handoffs.
 *
 * Records structured per-step events emitted while a headless agent run is
 * executing (tool starts/finishes, run stop). These come from the Claude Agent
 * SDK lifecycle hooks (PreToolUse / PostToolUse / Stop) wired in
 * `providers/claude-code.ts`.
 *
 * Two sinks, both intentionally reusing existing plumbing rather than inventing
 * a parallel system:
 *
 *  1. Durable activity stream — every run event is forwarded to
 *     `emitActivityEvent` (the same `ActivityEvent` table + workflow-trigger
 *     matching used everywhere else). The closed `ActivityEventType` union does
 *     not have a per-tool member, so run steps ride on the existing
 *     `handoff.submitted` event type and carry the structured detail in the
 *     payload (`runEvent`, `tool`, `phase`, …). Consumers filter on
 *     `payload.runEvent` to isolate run telemetry.
 *
 *  2. In-process ring buffer — a bounded, per-task event log read back by the
 *     poll route / cron poller so a run's recent steps can be surfaced without
 *     a DB round-trip. Mirrors the in-memory tradeoff of the background-tasks
 *     store and the claude-code `runStore`: lost on restart, never load-bearing
 *     for correctness.
 *
 * Resilience contract: NOTHING in this module throws. Every public function is
 * wrapped so a logging/telemetry failure can never abort an agent run or a
 * hook callback.
 */

import { emitActivityEvent, getProjectTeamId } from "@/lib/activity/emit";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("handoff-run");

/** Lifecycle phase a run event represents. Mirrors the SDK hook names. */
export type RunEventPhase =
  | "submitted"
  | "tool_started"
  | "tool_finished"
  | "stopped"
  | "failed";

export interface RunEvent {
  /** Handoff id the run belongs to. */
  handoffId: string;
  /** Headless task id (claude-code-<handoffId>). */
  taskId: string;
  phase: RunEventPhase;
  /** Tool name for tool_started / tool_finished phases. */
  tool?: string;
  /** PostToolUse duration in milliseconds, when reported by the SDK. */
  durationMs?: number;
  /** SDK tool_use_id, for correlating start/finish pairs. */
  toolUseId?: string;
  /** Optional free-form detail (truncated final message, error text, …). */
  detail?: string;
  /** Epoch ms the event was recorded. */
  at: number;
}

/** Per-task bounded event log. Most-recent-last. */
const MAX_EVENTS_PER_TASK = 200;
const eventStore = new Map<string, RunEvent[]>();

/** Total tasks tracked before the oldest is evicted (matches runStore scale). */
const MAX_TASKS = 100;

function pushToStore(event: RunEvent): void {
  let events = eventStore.get(event.taskId);
  if (!events) {
    // Evict the oldest task buffer if we are at capacity.
    if (eventStore.size >= MAX_TASKS) {
      const oldestKey = eventStore.keys().next().value;
      if (oldestKey !== undefined) eventStore.delete(oldestKey);
    }
    events = [];
    eventStore.set(event.taskId, events);
  }
  events.push(event);
  // Keep the buffer bounded — drop the oldest events past the cap.
  if (events.length > MAX_EVENTS_PER_TASK) {
    events.splice(0, events.length - MAX_EVENTS_PER_TASK);
  }
}

/**
 * Read the recorded run events for a task (chronological). Returns an empty
 * array for unknown tasks (e.g. lost to a restart). Never throws.
 */
export function getRunEvents(taskId: string): RunEvent[] {
  try {
    return eventStore.get(taskId)?.slice() ?? [];
  } catch {
    return [];
  }
}

/** Drop the buffered events for a task once it is fully consumed. */
export function clearRunEvents(taskId: string): void {
  try {
    eventStore.delete(taskId);
  } catch {
    // ignore — best-effort cleanup
  }
}

/**
 * Record a single run event: append to the in-process buffer and forward to
 * the durable activity stream. Fully resilient — any failure is swallowed and
 * logged so a hook callback never throws out.
 */
export async function recordRunEvent(opts: {
  handoffId: string;
  taskId: string;
  projectId?: string | null;
  phase: RunEventPhase;
  tool?: string;
  durationMs?: number;
  toolUseId?: string;
  detail?: string;
}): Promise<void> {
  const event: RunEvent = {
    handoffId: opts.handoffId,
    taskId: opts.taskId,
    phase: opts.phase,
    tool: opts.tool,
    durationMs: opts.durationMs,
    toolUseId: opts.toolUseId,
    detail: opts.detail?.slice(0, 1000),
    at: Date.now(),
  };

  pushToStore(event);

  try {
    // Forward to the existing activity-event plumbing. We ride on the
    // `handoff.submitted` event type (the closest existing member of the
    // closed union) and disambiguate via `payload.runEvent`.
    const teamId = opts.projectId
      ? await getProjectTeamId(opts.projectId)
      : null;
    await emitActivityEvent({
      type: "handoff.submitted",
      actorType: "system",
      teamId: teamId ?? undefined,
      projectId: opts.projectId ?? undefined,
      subjectType: "handoff",
      subjectId: opts.handoffId,
      payload: {
        runEvent: true,
        phase: event.phase,
        tool: event.tool,
        durationMs: event.durationMs,
        toolUseId: event.toolUseId,
        detail: event.detail,
        taskId: event.taskId,
      },
    });
  } catch (err) {
    // Telemetry must never break a run. Log and move on.
    log.error("Failed to record handoff run event", err, {
      handoffId: opts.handoffId,
      taskId: opts.taskId,
      phase: opts.phase,
    });
  }
}
