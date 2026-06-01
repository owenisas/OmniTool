import { describe, expect, it } from "vitest";
import {
  WIP_STATUSES,
  shouldStampCycleStart,
  computeCycleTimeStats,
  computeWeeklyThroughput,
  getWeekStart,
} from "./performance-flow";

/**
 * Cycle-time stamping rule — the core invariant: `firstStartedAt` is recorded
 * exactly once, on the first move into IN_PROGRESS, and is never overwritten.
 *
 * `shouldStampCycleStart` is the pure decision used by both `task.update` and
 * `task.move`; testing it here covers the stamping behavior for both paths.
 */
describe("shouldStampCycleStart", () => {
  it("stamps on the first transition into IN_PROGRESS", () => {
    expect(shouldStampCycleStart("IN_PROGRESS", null)).toBe(true);
    expect(shouldStampCycleStart("IN_PROGRESS", undefined)).toBe(true);
  });

  it("does NOT overwrite an already-recorded firstStartedAt", () => {
    const already = new Date("2026-01-01T09:00:00Z");
    // Re-entering IN_PROGRESS after a review bounce must keep the original.
    expect(shouldStampCycleStart("IN_PROGRESS", already)).toBe(false);
  });

  it("does not stamp for non-IN_PROGRESS transitions", () => {
    for (const status of ["TODO", "IN_REVIEW", "DONE", "CANCELLED"]) {
      expect(shouldStampCycleStart(status, null)).toBe(false);
    }
  });

  it("does not stamp when status is unchanged (partial update)", () => {
    // e.g. updating only the title/assignee — status is undefined.
    expect(shouldStampCycleStart(undefined, null)).toBe(false);
  });

  it("is stamped exactly once across a full lifecycle", () => {
    // Simulate the sequence of moves a task goes through. `firstStartedAt`
    // is the persisted timestamp; once set it stays set.
    let firstStartedAt: Date | null = null;
    const moves: Array<string> = [
      "TODO",
      "IN_PROGRESS", // <- first start: should stamp
      "IN_REVIEW",
      "IN_PROGRESS", // <- bounced back: must NOT re-stamp
      "DONE",
    ];

    let stampCount = 0;
    for (const status of moves) {
      if (shouldStampCycleStart(status, firstStartedAt)) {
        stampCount += 1;
        firstStartedAt = new Date();
      }
    }

    expect(stampCount).toBe(1);
    expect(firstStartedAt).not.toBeNull();
  });
});

describe("computeCycleTimeStats", () => {
  // Helper: build a task with a cycle of `seconds`.
  function task(seconds: number, start = "2026-01-01T00:00:00Z") {
    const firstStartedAt = new Date(start);
    const completedAt = new Date(firstStartedAt.getTime() + seconds * 1000);
    return { firstStartedAt, completedAt };
  }

  it("returns zeros and empty sample for no tasks", () => {
    expect(computeCycleTimeStats([])).toEqual({
      avgCycleTime: 0,
      medianCycleTime: 0,
      cycleTimeSampleSize: 0,
    });
  });

  it("computes avg + median for an odd-sized sample", () => {
    const stats = computeCycleTimeStats([task(100), task(200), task(300)]);
    expect(stats.cycleTimeSampleSize).toBe(3);
    expect(stats.avgCycleTime).toBe(200); // (100+200+300)/3
    expect(stats.medianCycleTime).toBe(200); // middle value
  });

  it("computes median as the mean of the two middle values for an even-sized sample", () => {
    const stats = computeCycleTimeStats([
      task(100),
      task(200),
      task(300),
      task(500),
    ]);
    expect(stats.cycleTimeSampleSize).toBe(4);
    expect(stats.avgCycleTime).toBe(275); // (100+200+300+500)/4
    expect(stats.medianCycleTime).toBe(250); // (200+300)/2
  });

  it("sorts before taking the median (input order independent)", () => {
    const stats = computeCycleTimeStats([task(300), task(100), task(200)]);
    expect(stats.medianCycleTime).toBe(200);
  });

  it("drops tasks missing either timestamp", () => {
    const stats = computeCycleTimeStats([
      task(100),
      { firstStartedAt: null, completedAt: new Date("2026-01-02T00:00:00Z") },
      { firstStartedAt: new Date("2026-01-02T00:00:00Z"), completedAt: null },
    ]);
    expect(stats.cycleTimeSampleSize).toBe(1);
    expect(stats.avgCycleTime).toBe(100);
  });

  it("drops negative spans (clock skew / data repair)", () => {
    const skewed = {
      firstStartedAt: new Date("2026-01-01T10:00:00Z"),
      completedAt: new Date("2026-01-01T09:00:00Z"), // before start
    };
    const stats = computeCycleTimeStats([task(120), skewed]);
    expect(stats.cycleTimeSampleSize).toBe(1);
    expect(stats.avgCycleTime).toBe(120);
  });
});

describe("getWeekStart", () => {
  it("normalizes to the local Sunday at midnight", () => {
    // 2026-01-01 is a Thursday; the prior Sunday is 2025-12-28.
    const ws = getWeekStart(new Date(2026, 0, 1, 15, 30, 0));
    expect(ws.getDay()).toBe(0); // Sunday
    expect(ws.getHours()).toBe(0);
    expect(ws.getMinutes()).toBe(0);
    expect(ws.getDate()).toBe(28);
    expect(ws.getMonth()).toBe(11); // December
  });

  it("returns the same week for two days in the same week", () => {
    const a = getWeekStart(new Date(2026, 0, 1)); // Thu
    const b = getWeekStart(new Date(2026, 0, 3)); // Sat
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe("computeWeeklyThroughput", () => {
  it("returns an empty series for no tasks", () => {
    expect(computeWeeklyThroughput([])).toEqual([]);
  });

  it("buckets DONE tasks by completion week and counts them", () => {
    const series = computeWeeklyThroughput([
      { completedAt: new Date(2026, 0, 1) }, // week of Dec 28
      { completedAt: new Date(2026, 0, 2) }, // same week
      { completedAt: new Date(2026, 0, 8) }, // week of Jan 4
    ]);
    expect(series).toHaveLength(2);
    expect(series.map((p) => p.count)).toEqual([2, 1]);
  });

  it("ignores tasks without a completedAt", () => {
    const series = computeWeeklyThroughput([
      { completedAt: new Date(2026, 0, 1) },
      { completedAt: null },
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].count).toBe(1);
  });

  it("returns points sorted ascending by week", () => {
    const series = computeWeeklyThroughput([
      { completedAt: new Date(2026, 0, 15) },
      { completedAt: new Date(2026, 0, 1) },
      { completedAt: new Date(2026, 0, 8) },
    ]);
    const weeks = series.map((p) => p.weekStart);
    expect(weeks).toEqual([...weeks].sort((a, b) => a.localeCompare(b)));
  });
});

describe("WIP_STATUSES", () => {
  it("counts only in-flight statuses", () => {
    // Guards against accidentally including TODO/DONE in the WIP definition.
    expect([...WIP_STATUSES]).toEqual(["IN_PROGRESS", "IN_REVIEW"]);
  });
});
