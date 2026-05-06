import { beforeEach, describe, expect, it } from "vitest";
import { useBackgroundTasks } from "./store";

/**
 * Pure-state tests for the Zustand background-task store. No React, no
 * timers (we manipulate `completedAt` directly to assert auto-prune).
 */
describe("useBackgroundTasks", () => {
  beforeEach(() => {
    // Reset between tests — Zustand stores leak across `it` blocks.
    useBackgroundTasks.setState({ tasks: [] });
  });

  it("starts a task in 'running' status with a startedAt", () => {
    useBackgroundTasks
      .getState()
      .start({ id: "t1", label: "Test task" });
    const tasks = useBackgroundTasks.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.status).toBe("running");
    expect(tasks[0]!.label).toBe("Test task");
    expect(tasks[0]!.startedAt).toBeGreaterThan(0);
    expect(tasks[0]!.completedAt).toBeUndefined();
  });

  it("finish() flips status to success and stores result + completedAt", () => {
    const s = useBackgroundTasks.getState();
    s.start({ id: "t1", label: "x" });
    s.finish("t1", { ok: true });
    const t = useBackgroundTasks.getState().tasks[0]!;
    expect(t.status).toBe("success");
    expect(t.result).toEqual({ ok: true });
    expect(t.completedAt).toBeGreaterThan(0);
  });

  it("fail() captures the error message and flips status", () => {
    const s = useBackgroundTasks.getState();
    s.start({ id: "t1", label: "x" });
    s.fail("t1", "boom");
    const t = useBackgroundTasks.getState().tasks[0]!;
    expect(t.status).toBe("error");
    expect(t.error).toBe("boom");
    expect(t.completedAt).toBeGreaterThan(0);
  });

  it("dismiss() removes a task by id", () => {
    const s = useBackgroundTasks.getState();
    s.start({ id: "a", label: "a" });
    s.start({ id: "b", label: "b" });
    s.dismiss("a");
    const ids = useBackgroundTasks.getState().tasks.map((t) => t.id);
    expect(ids).toEqual(["b"]);
  });

  it("clearCompleted() keeps only running tasks", () => {
    const s = useBackgroundTasks.getState();
    s.start({ id: "a", label: "running" });
    s.start({ id: "b", label: "done" });
    s.finish("b");
    s.start({ id: "c", label: "failed" });
    s.fail("c", "err");
    s.clearCompleted();
    const ids = useBackgroundTasks.getState().tasks.map((t) => t.id);
    expect(ids).toEqual(["a"]);
  });

  it("auto-prunes completed tasks older than 5 minutes on next mutation", () => {
    const s = useBackgroundTasks.getState();
    s.start({ id: "old", label: "stale" });
    s.finish("old");
    // Backdate completedAt to 6 minutes ago
    useBackgroundTasks.setState((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === "old"
          ? { ...t, completedAt: Date.now() - 6 * 60 * 1000 }
          : t,
      ),
    }));
    // Trigger a mutation that runs `prune()`
    s.start({ id: "new", label: "fresh" });
    const ids = useBackgroundTasks.getState().tasks.map((t) => t.id);
    expect(ids).toEqual(["new"]);
  });

  it("retains at most 50 tasks", () => {
    const s = useBackgroundTasks.getState();
    for (let i = 0; i < 60; i += 1) {
      s.start({ id: `t${i}`, label: `task ${i}` });
    }
    expect(useBackgroundTasks.getState().tasks.length).toBe(50);
    // Most recent retained
    const lastId =
      useBackgroundTasks.getState().tasks[
        useBackgroundTasks.getState().tasks.length - 1
      ]!.id;
    expect(lastId).toBe("t59");
  });

  it("update() patches an existing task without touching others", () => {
    const s = useBackgroundTasks.getState();
    s.start({ id: "a", label: "a" });
    s.start({ id: "b", label: "b" });
    s.update("a", { label: "renamed", progress: 0.5 });
    const a = useBackgroundTasks.getState().tasks.find((t) => t.id === "a")!;
    const b = useBackgroundTasks.getState().tasks.find((t) => t.id === "b")!;
    expect(a.label).toBe("renamed");
    expect(a.progress).toBe(0.5);
    expect(b.label).toBe("b");
  });
});
