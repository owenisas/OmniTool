/**
 * Pure, side-effect-free helpers for project-management flow metrics.
 *
 * Extracted from `performance.ts` / `task.ts` so the cycle-time stamping rule
 * and the avg/median/throughput/WIP math can be unit-tested in isolation
 * (the router procedures that call these are thin wrappers around Prisma I/O).
 *
 * Keep these behavior-preserving: the routers import them, so any change here
 * changes runtime behavior.
 */

/** A task statuses that count as in-flight (work in progress). */
export const WIP_STATUSES = ["IN_PROGRESS", "IN_REVIEW"] as const;

/**
 * Decide whether a status transition should stamp `firstStartedAt`.
 *
 * Cycle-time start is recorded exactly once — on the FIRST transition into
 * `IN_PROGRESS`. It is never overwritten on subsequent moves (e.g. bouncing
 * back to IN_PROGRESS after a review), so an already-stamped task returns
 * `false`.
 *
 * @param nextStatus      the status the task is moving to (may be undefined on
 *                        a partial update that doesn't touch status)
 * @param existingFirstStartedAt  the task's current `firstStartedAt` (null/undefined
 *                        when never started)
 */
export function shouldStampCycleStart(
  nextStatus: string | undefined,
  existingFirstStartedAt: Date | null | undefined
): boolean {
  return nextStatus === "IN_PROGRESS" && !existingFirstStartedAt;
}

export interface CycleTimeStats {
  /** mean cycle time across the sample, in seconds (0 when empty) */
  avgCycleTime: number;
  /** median cycle time, in seconds (0 when empty) */
  medianCycleTime: number;
  /** number of completed tasks that contributed a valid cycle time */
  cycleTimeSampleSize: number;
}

/**
 * Compute avg + median cycle time (seconds) from DONE tasks that recorded both
 * a `firstStartedAt` and a `completedAt`.
 *
 * Negative spans (completedAt before firstStartedAt — clock skew / data repair)
 * and tasks missing either timestamp are dropped from the sample.
 */
export function computeCycleTimeStats(
  tasks: Array<{ firstStartedAt: Date | null; completedAt: Date | null }>
): CycleTimeStats {
  const cycleTimes = tasks
    .map((t) =>
      t.firstStartedAt && t.completedAt
        ? (t.completedAt.getTime() - t.firstStartedAt.getTime()) / 1000
        : null
    )
    .filter((s): s is number => s != null && s >= 0)
    .sort((a, b) => a - b);

  const avgCycleTime =
    cycleTimes.length > 0
      ? cycleTimes.reduce((sum, s) => sum + s, 0) / cycleTimes.length
      : 0;

  const medianCycleTime =
    cycleTimes.length > 0
      ? cycleTimes.length % 2 === 1
        ? cycleTimes[(cycleTimes.length - 1) / 2]
        : (cycleTimes[cycleTimes.length / 2 - 1] +
            cycleTimes[cycleTimes.length / 2]) /
          2
      : 0;

  return {
    avgCycleTime,
    medianCycleTime,
    cycleTimeSampleSize: cycleTimes.length,
  };
}

/**
 * Normalize a date to the start of its week (local Sunday 00:00:00).
 * Mirrors the `getWeekStart` used for time-logged/velocity bucketing so all
 * weekly flow charts share one week boundary.
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface ThroughputPoint {
  /** ISO date (YYYY-MM-DD) of the week's Sunday */
  weekStart: string;
  /** count of tasks that reached DONE in that week */
  count: number;
}

/**
 * Throughput = number of tasks completed (reached DONE) per week.
 *
 * Buckets DONE tasks by the week of their `completedAt`. Tasks without a
 * `completedAt` are ignored (defensive — DONE tasks should always have one).
 * Returns points sorted ascending by week.
 */
export function computeWeeklyThroughput(
  tasks: Array<{ completedAt: Date | null }>
): ThroughputPoint[] {
  const byWeek: Record<string, number> = {};
  for (const t of tasks) {
    if (!t.completedAt) continue;
    const key = getWeekStart(t.completedAt).toISOString().split("T")[0];
    byWeek[key] = (byWeek[key] ?? 0) + 1;
  }

  return Object.entries(byWeek)
    .map(([weekStart, count]) => ({ weekStart, count }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
