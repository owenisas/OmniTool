# Project Management (Issues, Tasks, Performance)

> Research report for OmniTool. Topic: project management surface — projects, tasks, issues, time tracking, and performance metrics.
> Date: 2026-05-28.

## 1. Summary

OmniTool already ships a coherent, type-safe project-management core: `Project → Task / Issue`, with subtask hierarchy (`Task.parentId`), polymorphic `Comment` and `Label`, `TimeEntry` start/stop timers, a `PerformanceMetric` store, and an immutable `ActivityEvent` audit log that also drives the workflow engine. The tRPC layer (`project`, `task`, `issue`, `performance`, `timeEntry`, `dashboard`) is clean and consistently guards access via `assertTeamMembership`.

The biggest gaps relative to current (2025–2026) practice are: (1) the dashboard/performance endpoints surface mostly raw counts rather than **flow metrics** (cycle time, throughput, WIP, work-item age), which are now the headline agile signals; (2) `PerformanceMetric` is a passive store with no writer — nothing populates `VELOCITY`/`CYCLE_TIME`/`THROUGHPUT` rows, so metrics are computed ad-hoc per query; (3) external sync (GitHub/Linear) is **outbound and fire-and-forget only** — there is no inbound webhook to reflect PR/commit/issue state back into OmniTool; and (4) GitHub/Linear sync logic lives inline in `issue.ts` rather than in a service module, which the tRPC docs recommend extracting.

The single best near-term win is **cycle-time tracking**: stamp a `firstStartedAt` timestamp when a task first enters `IN_PROGRESS`, then expose cycle time (completed − firstStarted) on the dashboard. It is low-risk, additive, and unlocks the most-recommended modern metric with minimal surface change.

## 2. Current State in OmniTool

### Data models — `packages/database/prisma/schema.prisma`

- **Project** (lines 136–161): `name`, `slug` (unique), `status` (string default `ACTIVE`), `teamId`, GitHub link fields (`githubRepoId`, `githubRepoFullName`, `githubImportedAt`), `startDate`/`targetDate`, and relations to `tasks`, `issues`, `metrics`, `linkedNote`, `githubPullRequests`, `githubCommits`, `agentHandoffs`.
- **Task** (lines 163–193): `status` (`TODO/IN_PROGRESS/IN_REVIEW/DONE/CANCELLED`), `priority` (`URGENT/HIGH/MEDIUM/LOW`), `storyPoints`, `assigneeId`, `creatorId`, self-referencing `parentId` → `subtasks` (relation `"TaskSubtasks"`), `dueDate`, `completedAt`, `position` (Kanban ordering). Indexed on `projectId`, `assigneeId`, `creatorId`. **No `startedAt`/cycle-time field.**
- **Issue** (lines 197–230): unique `identifier` (e.g. `PREFIX-N`), `status` (`OPEN/TRIAGED/IN_PROGRESS/RESOLVED/CLOSED/WONT_FIX`), `priority`, `severity`, `reporterId`, `resolvedAt`, GitHub sync (`githubIssueNumber`, `githubRepoFullName`), Linear sync (`linearIssueId` unique, `linearTeamKey`, `linearIdentifier`, `linearSyncedAt`). Indexed including `(githubRepoFullName, githubIssueNumber)`.
- **TimeEntry** (lines 395–413): `userId`, optional `taskId`, `startTime`, nullable `endTime`, `duration` (seconds), `billable` (default true).
- **PerformanceMetric** (lines 415–430): `projectId`, `metricType` (string), `value` (Float), `periodStart`/`periodEnd`, optional `metadata`. Indexed on `(projectId, metricType, periodStart)`. **Note: there is no code that writes rows into this table** — see below.
- **Label** (lines 490–499) and **Comment** (lines 501–518, polymorphic via nullable `taskId`/`issueId`) are shared across tasks and issues.
- **ActivityEvent** (lines 572–589): `type`, `actorId`, `actorType` (`user/system/integration`), `teamId`, `projectId`, `subjectType`, `subjectId`, `payload` (JSON), `createdAt`. Indexed on `(teamId, createdAt)`, `(projectId, createdAt)`, `(subjectType, subjectId)`, `(actorId, createdAt)`.

### tRPC routers — `apps/web/trpc/routers/`

- **`task.ts`** — `listMineForTeam`, `listByProject` (ordered by status then `position`), `getById`, `create` (emits `task.created`), `update` (sets `completedAt` when status becomes `DONE`, emits `task.completed`/`task.updated`), `move` (Kanban drag — sets/clears `completedAt`, emits event), `delete`. Every procedure guards via `assertTeamMembership`.
- **`issue.ts`** — `listByTeam` (filters: status, assignee, unassignedOnly, search, projectId; `take: 200`), `listByProject`, `getById`, `create` (generates `identifier` from `slug.toUpperCase().slice(0,4)` + count, then **fire-and-forget** push to GitHub via `pushNewIssueToGitHub`), `update` (sets `resolvedAt`, fire-and-forget GitHub update), `linkToGitHub` (manual link + `EntityLink` cross-reference). The GitHub mapping helpers (`omniStatusToGitHubState`, `findGitHubUserId`, `pushNewIssueToGitHub`, `pushIssueUpdateToGitHub`) are defined **inline in the router file**.
- **`performance.ts`** — `getProjectMetrics` (reads `PerformanceMetric` rows), `getDashboardStats` (parallel counts: total/completed tasks, completion rate %, open issues, summed time), `getWeeklyTimeLogged`, `getVelocity` (sums `storyPoints` of `DONE` tasks by `completedAt` week). Velocity/time-logged are **computed on read from raw tables**, not from `PerformanceMetric`. Access guarded by a local `assertProjectTeamMembership` helper (duplicated from the shared one in `init.ts`).
- **`timeEntry.ts`** — `start` (auto-stops previous), `stop`, `getRunning`, `createManual`, `list`.
- **`dashboard.ts`** — `overview` (myOpenTasks, openIssues, myAssignedIssues, recentNotes, upcomingDue) and `myWork` (assigned tasks/issues/notes). Aggregate counts only; **no velocity/cycle-time/throughput trends**.

### Supporting pieces

- **Activity emit** — `apps/web/lib/activity/emit.ts`: `emitActivityEvent` writes an `ActivityEvent` row and fire-and-forget-matches active event-triggered workflows (`matchAndTriggerWorkflows`). Failures are swallowed so they never break the primary mutation.
- **Validators** — `packages/shared/src/validators/task.ts` (`createTaskSchema`, `updateTaskSchema`, `moveTaskSchema`) and `validators/issue.ts`. Input is Zod-validated; **outputs are not** schema-validated.
- **Access middleware** — `apps/web/trpc/init.ts` defines `protectedProcedure`, `teamProtectedProcedure`, and the shared `assertTeamMembership`. There is **no `projectProtectedProcedure`**; each router re-derives `teamId` from the project and calls `assertTeamMembership` manually (and `performance.ts` duplicates the helper).

## 3. Findings & Best Practices

### Confirmed and applicable

- **Real-time, transparent, data-driven status is the core 2025–2026 principle.** Making project status visible in real time means less time reporting, more executing; AI-driven forecasting/risk detection is displacing gut-feel. ([monday.com — PM best practices](https://monday.com/blog/project-management/project-management-best-practices/), [Planfix — PM trends](https://planfix.com/blog/industry-insights/project-management-trends/)) — *Applies to OmniTool:* `dashboard.overview` and `performance.getDashboardStats` should surface live aggregates and trends, not just snapshot counts.

- **tRPC best practice: keep routers thin; extract business logic into service/repository modules; use middleware for cross-cutting access control; validate inputs (and optionally outputs) with Zod.** ([tRPC middlewares](https://trpc.io/docs/server/middlewares), [tRPC validators](https://trpc.io/docs/server/validators), [tRPC context](https://trpc.io/docs/server/context)) — *Applies to OmniTool:* extract the GitHub/Linear sync helpers out of `issue.ts` into a service module; introduce a single `projectProtectedProcedure` middleware so `performance.ts` stops duplicating `assertProjectTeamMembership`; consider output validation on metric/count queries. (Caveat from verification: output validation is *recommended, not required*, and Zod is the default but not the only supported validator.)

- **Event-driven audit logging is the right shape: immutable events with actor, type, resource, payload, timestamp; supports transparency and reconstruction; many compliance frameworks expect ≥90-day retention.** ([Event-driven audit logging](https://medium.com/@kharavela.jain/event-driven-audit-logging-in-net-8-ffe8892f06c6)) — *Applies to OmniTool:* `ActivityEvent` already matches this shape and is emitted on task/issue mutations. Gaps: it's not yet emitted on **time-entry** or **project** mutations, and there is no retention/archival policy.

- **Prisma self-referencing `parentId` is the correct pattern for single-parent subtask hierarchies; use an explicit junction table only for multi-parent/epic or dynamically reordered hierarchies.** ([Prisma schema patterns](https://github.com/prisma/prisma)) — *Applies to OmniTool:* the current `Task.parentId` design is correct; no change needed unless multi-parent epics become a requirement.

- **Linear↔GitHub-style sync uses webhooks and identifier parsing (e.g. `[TEAM_KEY]-[NUMBER]` in branch/PR titles, `fixes OT-123` in commit bodies) for bidirectional, real-time status updates.** ([Linear webhooks](https://linear.app/developers/webhooks)) — *Applies to OmniTool:* OmniTool only pushes **outbound** to GitHub today. Inbound webhook handling (PR opened/merged → issue status; commit-message identifier linking) is the missing half. The `EntityLink` table and `ActivityEvent` types (`github.pr.merged`, `github.push`) already anticipate this.

- **CRDT/Yjs real-time co-editing is the emerging standard for collaborative text, but comment threads + an audit log are sufficient for small teams.** ([CRDTs and real-time collaboration](https://blog.weskill.org/2026/04/multi-user-collaboration-crdts-and-real.html)) — *Applies to OmniTool:* not warranted for task/issue descriptions now; revisit only if simultaneous co-editing becomes a need. (The Notes surface already has its own editor stack.)

### Refuted / caveated — do NOT act on these as stated

- **"Height uses AI-native task creation; both Height and Linear avoid manual filtering via smart views."** — **Refuted (confidence 0.95).** Height shut down on **September 24, 2025** and no longer exists, so it cannot be cited as a live example. Linear's keyboard-first UX is real, but its views require manual filter setup initially (the resulting views are dynamic); manual filtering remains primary, with optional AI natural-language filtering layered on top. ([Height shutdown](https://www.creativerly.com/height-app-is-shutting-down/), [Linear filters](https://linear.app/docs/filters), [Linear custom views](https://linear.app/docs/custom-views)) — *Takeaway:* the **keyboard-first, fast-status-move** idea is still worth borrowing; the "Height AI subtask generation" framing should be dropped as a precedent.

- **"Velocity and burndown are the core 2025–2026 agile metrics; keep team stable for velocity trending; WIP limits and Scrumban are trending core methodology."** — **Refuted (confidence 0.78).** Authoritative sources say velocity/burndown are **legacy and being superseded**: flow metrics (cycle time, throughput, WIP, work-item age) are now the primary signals, and DORA metrics (deployment frequency, lead time for changes, change failure rate) lead delivery measurement. Burndown is "the most commonly misused metric in Agile." Scrumban adoption is ~27%, not a dominant trend. ([Atlassian DORA](https://www.atlassian.com/devops/frameworks/dora-metrics), [LinearB on burndown](https://linearb.io/blog/burndown-charts), [Sourcegraph 2026 agile metrics](https://sourcegraph.com/blog/agile-metrics-what-to-track-and-why-they-matter-2026), [GetDX burndown](https://getdx.com/blog/burndown-chart)) — *Takeaway:* OmniTool's existing `getVelocity` is fine to keep, but **prioritize flow metrics (cycle time, throughput, WIP) over expanding velocity/burndown.** Do not invest in burndown charts as a headline feature.

- **Automated time tracking captures 15–40% more billable hours / improves estimation ~25%.** — *Caveated:* the qualitative direction (real-time start/stop beats manual entry for short tasks) is reasonable and OmniTool already has start/stop timers; treat the specific percentages as vendor-marketing figures, not validated benchmarks.

## 4. Recommendations Mapped to OmniTool

1. **Track cycle time (flow metric #1).** Add `firstStartedAt DateTime?` to `Task`; stamp it the first time a task moves into `IN_PROGRESS` (in `task.move` / `task.update`). Cycle time = `completedAt − firstStartedAt`. Surface average/median cycle time in `performance.getDashboardStats`. This is the highest-value, lowest-risk change and directly addresses the "flow over velocity" finding.

2. **Add throughput + WIP to the dashboard.** Throughput = count of tasks reaching `DONE` per week (reuse the `getWeekStart` helper). WIP = current count of `IN_PROGRESS` + `IN_REVIEW` tasks per project (and optionally per assignee). Both are pure read-side aggregations — no schema change.

3. **Extract GitHub/Linear sync into a service module.** Move `omniStatusToGitHubState`, `findGitHubUserId`, `pushNewIssueToGitHub`, `pushIssueUpdateToGitHub` out of `issue.ts` into e.g. `packages/integrations/src/lib/issue-sync.ts` (or `apps/web/lib/integrations/issue-sync.ts`). Keeps the router thin per tRPC guidance and makes the logic reusable by an inbound webhook handler.

4. **Introduce a `projectProtectedProcedure` middleware.** Resolve `teamId` from `projectId` and run `assertTeamMembership` once in middleware, exposing `ctx.project`. Replaces the duplicated `assertProjectTeamMembership` in `performance.ts` and the repeated find-project-then-assert blocks in `task.ts`/`issue.ts`.

5. **Inbound GitHub webhook for issue/PR status sync.** Add a webhook route that maps GitHub issue `closed`/`reopened` and PR `merged` back to OmniTool issue status, parsing `OT-123`/`PREFIX-N` identifiers from PR titles, branches, and commit messages. Records `EntityLink` rows and emits the already-defined `github.*` `ActivityEvent` types. This completes the half-built sync.

6. **Populate `PerformanceMetric` instead of computing only on read.** Add a scheduled job (the repo already runs a daily Vercel cron) that snapshots weekly `VELOCITY`, `CYCLE_TIME`, `THROUGHPUT`, and `TIME_LOGGED` rows so historical trends survive and `getProjectMetrics` returns real data. (Respect the Hobby-plan 1-cron/day limit noted in CLAUDE.md.)

7. **Emit `ActivityEvent` on time-entry and project mutations + define a retention policy.** Round out the audit log (currently task/issue/note/github/linear/handoff only) and add a ≥90-day archival/prune policy.

8. **Borrow Linear's keyboard-first status moves (not Height's AI framing).** Add keybindings for status transitions on the task board. Pure client-side; defer until the board UI is the focus.

## 5. Prioritized Implementation Plan

| Item | Files | Risk | Effort | Rationale |
|------|-------|------|--------|-----------|
| **Cycle-time tracking (`firstStartedAt`)** | `packages/database/prisma/schema.prisma`, `apps/web/trpc/routers/task.ts`, `apps/web/trpc/routers/performance.ts` | low | S | Additive nullable column + one stamp-on-first-IN_PROGRESS rule. Unlocks the most-recommended modern flow metric with no behavior change to existing rows. |
| **Throughput + WIP on dashboard** | `apps/web/trpc/routers/performance.ts`, `apps/web/trpc/routers/dashboard.ts` | low | S | Pure read-side aggregation reusing `getWeekStart`. Directly addresses "flow over velocity." No schema change. |
| **`projectProtectedProcedure` middleware** | `apps/web/trpc/init.ts`, `apps/web/trpc/routers/performance.ts`, `task.ts`, `issue.ts` | low | M | Removes duplicated access checks; aligns with tRPC middleware guidance. Touch-many but mechanical. |
| **Extract issue-sync service module** | `apps/web/trpc/routers/issue.ts`, new `packages/integrations/src/lib/issue-sync.ts` | low | M | Thins the router, makes sync reusable for inbound webhooks. Logic moves unchanged. |
| **Populate `PerformanceMetric` via daily cron** | new cron route under `apps/web/app/api/...`, `apps/web/trpc/routers/performance.ts`, `vercel.json` | medium | M | Gives historical trend data; passive table finally gets a writer. Constrained by Hobby 1-cron/day limit. |
| **Inbound GitHub webhook (PR/issue/commit → status)** | new webhook route, `packages/integrations`, `apps/web/lib/activity/emit.ts` | medium | L | Completes bidirectional sync; needs signature verification, identifier parsing, idempotency, and avoiding push/pull loops with the existing outbound sync. |
| **Activity events on time-entry/project + retention policy** | `apps/web/trpc/routers/timeEntry.ts`, `project.ts`, prune job | low | M | Fills audit-log gaps; supports compliance-grade transparency. |
| **Keyboard-first status moves on board** | task board components under `apps/web/components/**`, `apps/web/app/(dashboard)/**` | low | M | Borrows Linear's confirmed speed UX. UI-only; defer to a board-focused pass. |

## Top Pick

**Cycle-time tracking via `firstStartedAt`.** Low risk, small effort, fully additive (nullable column + a single stamp-on-first-`IN_PROGRESS` rule in `task.move`/`task.update`, plus an avg/median read in `performance.getDashboardStats`). It directly implements the verification-backed "flow metrics over velocity/burndown" guidance and is the most useful single metric to add, without disturbing existing tasks or queries.
