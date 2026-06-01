# Automation with AI Agents (Claude Code / Codex)

> Per-topic research report for OmniTool. Verified against the codebase on 2026-05-28.

## 1. Summary

OmniTool already has an unusually broad AI-agent surface for an internal tool: a tool-calling chat backend, a 2-tier tool ecosystem (general + notes), an MCP server that exposes OmniTool to external agents (Claude Code, Cursor, Codex), a local coding-session scanner across 11 tools, a daily-summary pipeline, and an `AgentHandoff` model with Codex + Claude Code adapters polled by a cron job.

The strongest, most differentiated assets are the **MCP server** (turns OmniTool into a tool provider for the user's own coding agents) and the **coding-session scanner + daily-summary pipeline** (passive observability of agent work). The weakest link is the **handoff execution layer**: the Codex adapter makes a real OpenAI Responses API call, but the **Claude Code adapter is a stub** — it never submits anything, and its poll function unconditionally returns `running`, so a Claude Code handoff can never auto-advance past `SUBMITTED`. Polling runs only once per day (Vercel Hobby cron limit), so even the working Codex path has up to 24h of status lag.

The most impactful, well-scoped next step is to replace the Claude Code stub with a real headless execution path using the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`), which is purpose-built for exactly this "automation without a terminal" need and maps cleanly onto the existing handoff lifecycle. Industry research (Vercel Workflows, Trigger.dev, Inngest, event-sourcing patterns) points to **durable execution** as the eventual right substrate for long-running agent runs, but those are larger bets; the Agent SDK closes the concrete functional gap now.

## 2. Current State in OmniTool — with concrete file references

### 2.1 Chat & tool invocation
- `apps/web/app/api/ai/chat/route.ts` — POST handler. Uses Vercel AI SDK `generateText` (note: **non-streaming**, not `streamText`), `stopWhen: stepCountIs(chatAgentConfig.maxSteps)`, `temperature: 0.2`. Rate-limited 100 req/min/user via `apiLimiter` (`@/lib/rate-limit`). Persists `AIConversation` / `AIMessage`, auto-titles from the first user message (first 100 chars), and stores `toolCalls` / `toolResults` as JSON plus `tokenCount` from `result.totalUsage.totalTokens`.
- `apps/web/lib/ai/language-model.ts` — `getOmniLanguageModel()`. Prefers NVIDIA NIM (OpenAI-compatible, default model `google/gemma-4-31b-it`, overridable via `NVIDIA_NIM_MODEL` / `NVIDIA_NIM_BASE_URL`) when `NVIDIA_API_KEY` is set; otherwise Anthropic via `@ai-sdk/anthropic`.
- `apps/web/app/api/ai/notes-chat/route.ts`, `apps/web/app/api/ai/notes-inline/route.ts` — notes-scoped chat + inline editing routes.

### 2.2 Tool ecosystem (`packages/ai/src/tools/`)
- `create-chat-tools.ts` plus `query-tasks.ts`, `query-issues.ts`, `query-metrics.ts`, `search-notes.ts`, `create-issue.ts`, `update-task.ts` — general data tools.
- `create-notes-chat-tools.ts` + `packages/ai/src/tools/notes/` (`create-note`, `read-note`, `append-to-note`, `edit-note-section`, `organize-note`, `remove-blocks`, `list-notes`, `search-web`, `fetch-web-page`) — notes CRUD + web research.
- All tools use Vercel AI SDK `tool()` with Zod schemas and call Prisma directly, scoped to `userId`.

### 2.3 System prompts & agent configs
- `packages/ai/src/prompts/` — `system-prompts.ts` (`chatSystemPrompt`), `notes-system-prompt.ts`, plus `triage-system-prompt.ts`, `insight-system-prompt.ts`, `report-system-prompt.ts` that are **defined but not wired** to active routes.
- `packages/ai/src/agents/` — `chat-assistant.ts` (`chatAgentConfig`, supplies `maxSteps`), `notes-assistant.ts`.

### 2.4 Coding-session integration
- `packages/coding-sessions/src/index.ts` (~1,039 lines) — scans for traces from 11 tools (Claude Code, Codex, Gemini CLI, VS Code Copilot, Aider, Continue, Cline, Roo Code, Cursor, Windsurf, OpenCode). Normalizes JSONL/JSON/Markdown into `CodingSessionMessage[]` (roles user/assistant/system/tool/info), resolves per-tool paths (e.g. Claude Code `~/.claude/projects/*/`), returns extractable / metadata-only / unsupported status. Scan roots overridable via env (`CLAUDE_CODE_HOME`, `CODEX_HOME`, etc.).
- `apps/web/app/api/coding-sessions/route.ts`, `.../summarize/route.ts`.

### 2.5 Daily summary pipeline
- `apps/web/app/api/coding-sessions/daily-summary/route.ts` — filters local sessions by user timezone, extracts up to ~30, generates per-session digests, synthesizes an aggregate (title, overview, keyTopics, actionItems, risks) via Anthropic/NVIDIA, caches in `DailyCodingSummary` (`packages/database/prisma/schema.prisma:543`) for 2h per user-date-timezone. Rendered as a live BlockNote `<DailySummaryBlock>`.

### 2.6 MCP server
- `apps/web/app/api/mcp/route.ts` — Streamable HTTP transport for external agents.
- `apps/web/lib/mcp/tools.ts` (**~495 lines, ~11 tools**: `searchIssues`, `getIssue`, `searchNotes`, `getNote`, `listProjects`, `listTasks`/`updateTask`, `createIssue`, `commentOnIssue`, `createNote`, `appendNote`). *(Correction to intake brief: it is not ~3,900 lines / 22 tools.)*
- `apps/web/lib/mcp/token.ts` + `token.test.ts` — bearer PAT auth, tokens matched to users by SHA-256 hash; read/write scope enforcement; emits `mcp.tool.invoked` activity events. Plaintext query-param token allowed in dev only.

### 2.7 Handoff system
- `packages/database/prisma/schema.prisma:674` — `AgentHandoff` model. Lifecycle string: `DRAFT | SUBMITTED | IN_PROGRESS | AWAITING_REVIEW | APPROVED | REJECTED`. Fields: `contextPayload`, `agentProvider`, `externalRunId`, `externalUrl`, `resultSummary`, `resultArtifacts`, review fields. Indexed on `(userId,status)` and `(projectId,status)`.
- `apps/web/lib/handoffs/context-assembler.ts` (~150 lines) — gathers related tasks/issues/notes/commits per project.
- `apps/web/lib/handoffs/providers/codex.ts` — **real** call to `POST https://api.openai.com/v1/responses` (`model: codex-mini-latest`, `tools: [{ type: "codex", container: ... }]`); `pollCodexTask` maps OpenAI status to internal status.
- `apps/web/lib/handoffs/providers/claude-code.ts` — **stub**. `submitToClaudeCode` returns `{ taskId: local-<id>, status: "awaiting_local_execution" }` and never calls any API (despite the file comment claiming "(when available) submits via the Anthropic agent API"). `pollClaudeCodeTask` returns `status: "running"` for any `local-` task, so it can never reach `completed` → `AWAITING_REVIEW`. The cron handler only advances claude-code handoffs on a `completed` status that this stub never emits.
- `apps/web/app/api/cron/handoff-poll/route.ts` — polls handoffs in `SUBMITTED`/`IN_PROGRESS` with a non-null `externalRunId`, caps at 20/invocation. Schedule in `apps/web/vercel.json` is `0 8 * * *` (daily 8am UTC) due to Hobby's 1-cron/day limit.

### 2.8 Background task management
- `apps/web/lib/background-tasks/store.ts` (Zustand, auto-prune 5min, cap 50) + `run.ts` (`runBackgroundTask`) + `store.test.ts`.
- `apps/web/components/layout/background-tasks-indicator.tsx` — topbar pill with running count + elapsed time. UI-only feedback; not durable across refresh.

### 2.9 Notable gaps
- No streaming chat UI in the repo; chat route returns a single JSON body.
- `triage`/`insight`/`report` prompts exist but no routes consume them.
- No OpenTelemetry / structured agent-run tracing on any AI route.
- Handoff durability is "best effort": the work happens in an external API or a human's terminal, with daily polling and no replay/audit log.

## 3. Findings & Best Practices

### 3.1 Claude Agent SDK — confirmed, the direct fit for the handoff gap
The **Claude Agent SDK** gives programmatic, headless access to Claude Code's agentic loop (tool use, multi-turn, session management) in Python and TypeScript — exactly "automation without terminal interaction." It ships built-in tools (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, AskUserQuestion, etc.), lifecycle hooks (PreToolUse, PostToolUse, Stop, SessionStart, SessionEnd), subagents, MCP-server support, and permission controls; the same query loop runs identically via CLI, headless mode, SDK, or IDE. [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)

Verification caveats to honor:
- `SessionStart` / `SessionEnd` are TypeScript-only as programmatic callbacks; in Python they're shell-command hooks from settings. The docs list ~20 hook types and additional tools (NotebookEdit, Agent, etc.) beyond the 5–10 commonly cited — the SDK is broader than the headline list. [hooks](https://code.claude.com/docs/en/agent-sdk/overview)
- **Sessions persist the conversation, not the filesystem.** File checkpointing is a *separate* feature (`enable_file_checkpointing`) that snapshots and can rewind file edits — but only changes made through Write/Edit/NotebookEdit, **not** Bash. Treat session resume and file checkpoint as two distinct mechanisms. [sessions](https://code.claude.com/docs/en/agent-sdk/sessions)

### 3.2 Agent SDK OpenTelemetry observability — REFUTED as "fully working", use with caution
The verdicts mark the claim that the Agent SDK emits a full span set (`claude_code.interaction`, `claude_code.tool`, `claude_code.hook`, etc.) to any OTLP backend as **refuted (conf. 0.87)**. When Claude Code is launched via the SDK's `query()`, the exporter in practice only emits `claude_code.llm_request` spans; the interaction/tool/hook spans are documented but **not produced** in that path ([anthropics/claude-code#53954](https://github.com/anthropics/claude-code/issues/53954)), and detailed hook tracing needs extra beta flags. **Do not** design OmniTool's agent-run observability around SDK-emitted OTEL spans. Instead, capture observability ourselves via the SDK's PreToolUse/PostToolUse/Stop **hooks** (which do fire) and write structured events to our own store — which also dovetails with the existing `mcp.tool.invoked` activity-event pattern.

### 3.3 Durable execution platforms — confirmed direction, larger bets
For long-running agent runs that must survive deploys/crashes, the field has converged on **durable execution**:
- **Vercel Workflows** (GA 2026): durable execution for AI agents with tool calling, resumable streams, external-event handling; integrates AI SDK v7's `WorkflowAgent`; survives deploys via deterministic replay. [Vercel: durable execution](https://vercel.com/blog/a-new-programming-model-for-durable-execution)
- **Trigger.dev**: open-source durable agents/workflows in TS (Python extension), queues/retries/observability without serverless timeouts. [Trigger.dev AI agents](https://trigger.dev/product/ai-agents)
- **Inngest**: event-driven background functions for Next.js with step-based retries, `sleep`, `step.ai.*`. [Inngest background jobs](https://www.inngest.com/docs/guides/background-jobs)

These are the right substrate to *eventually* replace the daily cron + in-memory `runBackgroundTask` store. They are infrastructure changes (new dependency, deploy model, and — for OmniTool's Tauri sidecar — careful thought about where the durable runtime lives), so they're medium/large efforts, not the immediate move.

### 3.4 Multi-agent orchestration & event sourcing — confirmed as patterns, not yet needed
- Practical orchestration converges on graph-based (LangGraph), role-based (CrewAI), swarm; practical team size 3–4 agents; state patterns are checkpointed / ephemeral / event-sourced. [Multi-agent frameworks 2026](https://gurusup.com/blog/best-multi-agent-frameworks-2026)
- **Event Sourcing for Autonomous Agents (ESAA)**: append-only event logs (`activity.jsonl`), deterministic orchestration, replay/audit verification. This maps conceptually onto OmniTool's existing activity-event stream and is a useful lens for making handoffs auditable. *Caveat:* the cited arXiv id could not be independently confirmed in the provided verdicts (the verdict text is truncated), so treat ESAA as an **architectural pattern to borrow**, not a citable benchmark. ([arxiv reference, unverified](https://arxiv.org/abs/2602.23193))

### 3.5 Claude Code GitHub Actions — confirmed, adjacent automation channel
Claude Code GitHub Actions (GA 2025) automates CI/CD via `@claude` mentions in PRs/issues, auto-detecting interactive vs automation mode, with `claude_args` passthrough and `--max-turns` cost control. [GitHub Actions docs](https://code.claude.com/docs/en/github-actions). Relevant because OmniTool's Claude Code handoff could *alternatively* be realized by opening a GitHub issue/PR comment in the linked repo rather than (or in addition to) running the Agent SDK in-process.

## 4. Recommendations mapped to OmniTool

1. **Replace the Claude Code handoff stub with a real headless Agent SDK run** (`apps/web/lib/handoffs/providers/claude-code.ts`). Use `@anthropic-ai/claude-agent-sdk` `query()` to execute the assembled `contextPayload` prompt against the project's repo, capture the result summary + artifacts, and feed status back through the existing lifecycle so a claude-code handoff can actually reach `AWAITING_REVIEW`. This is the single change that makes the dormant half of the handoff system functional. *(Top pick — see §6.)*

2. **Add our own agent-run observability via SDK hooks, not SDK OTEL.** Wire PreToolUse/PostToolUse/Stop hooks to emit structured `handoff.*` / `agent.tool.*` activity events (reuse `@/lib/activity/emit`), persisting per-step records. Avoids the refuted OTEL span path (§3.2) while giving real run visibility.

3. **Tighten handoff polling latency.** The daily cron is a Hobby-plan artifact. Short term: trigger an on-demand poll from the handoff detail UI (button → re-poll route) so users aren't blocked 24h. Long term: move execution to a durable runner (§3.3) and drop polling entirely in favor of completion callbacks.

4. **Adopt durable execution for long agent runs (medium-term).** Evaluate Inngest (cleanest Next.js fit, event-driven, `sleep`) or Vercel Workflows (native to current hosting). Migrate `runBackgroundTask` + handoff polling onto it so runs survive refresh/deploy/crash. Pick one; don't run two job systems.

5. **Wire the dormant prompts** (`triage`, `insight`, `report`) into routes or delete them, so the prompt package reflects reality.

6. **Expose handoff creation as an MCP tool.** OmniTool already is an MCP provider; adding a `createHandoff` tool lets a user's own Claude Code/Cursor session queue OmniTool handoffs, closing the loop between the two agent surfaces.

## 5. Prioritized Implementation Plan

| Item | Files | Risk | Effort | Rationale |
|------|-------|------|--------|-----------|
| 1. Real Claude Code handoff via Agent SDK | `apps/web/lib/handoffs/providers/claude-code.ts`, `apps/web/app/api/cron/handoff-poll/route.ts`, package.json (`@anthropic-ai/claude-agent-sdk`) | medium | M | Stub never advances past `SUBMITTED`; SDK is the documented headless fit. Confined to one provider file + its poll branch. |
| 2. Agent-run observability via SDK hooks | `apps/web/lib/handoffs/providers/claude-code.ts`, `apps/web/lib/activity/emit.ts`, new `apps/web/lib/handoffs/run-events.ts` | low | M | Real run visibility without depending on the refuted SDK OTEL spans; reuses existing activity-event plumbing. |
| 3. On-demand handoff re-poll button | handoff detail component, new `apps/web/app/api/handoffs/[id]/poll/route.ts` | low | S | Removes up-to-24h status lag from the Hobby daily cron without infra change. |
| 4. Durable execution runtime (Inngest or Vercel Workflows) | new `apps/web/lib/jobs/**`, `apps/web/lib/background-tasks/run.ts`, handoff submit/poll routes, deploy config | high | L | Right long-term substrate; survives deploy/crash. Larger blast radius (new dep + deploy model + Tauri sidecar considerations). |
| 5. Wire or remove dormant prompts | `packages/ai/src/prompts/{triage,insight,report}-system-prompt.ts`, new routes | low | S | Keeps the prompt package honest; small. |
| 6. `createHandoff` MCP tool | `apps/web/lib/mcp/tools.ts`, `apps/web/app/api/mcp/route.ts` | low | M | Lets external agents queue OmniTool handoffs; leverages existing MCP provider. |

## 6. Top Pick

**Item 1 — Replace the Claude Code handoff stub with a real Agent SDK headless run.** It is medium-risk and tightly scoped (one provider file + the claude-code branch of the existing cron poller; the lifecycle, schema, context assembler, and Codex path stay untouched). It fixes a concrete, verified defect — claude-code handoffs currently can never complete — using `@anthropic-ai/claude-agent-sdk`, the documented, purpose-built mechanism for exactly this "automation without a terminal" use case (§3.1). Items 2 and 3 layer naturally on top once it lands.
