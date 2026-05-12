# Coding agents (Cursor, Claude Code, Codex), Slack / Linear / Jira integrations, automation planes, and Notion productivity patterns

**Document purpose.** Consolidate how major coding agents are implemented and wired into Slack, Linear, and Jira; summarize native automation for Slack, Linear, and Jira at comparable depth; explain Slack×Notion and Linear×Notion productivity patterns.

**Audience.** Architecture and integration procurement memo.

**Methodology limits.** Claims map to URLs in §15 unless marked as inference. No independent entitlement testing of paid workspaces was performed in authoring this memo; procurement and security review still requires tenant-specific verification.

---

## §1 Scope

This memo synthesizes vendor-documented integration surfaces (Slack apps, MCP endpoints, OAuth connectors, REST APIs), execution models (cloud sandbox vs local/CLI vs CI), and workflow automation planes (Slack Workflow Builder; Linear Git/notification automation; Jira Automation rules, webhooks, Forge extensions).

Plan tiers, feature flags, compliance posture, and regional availability change frequently — confirm against §15 sources before contractual commitments.

---

## §2 Shared implementation pattern for coding agents

Across Cursor, Claude Code, and OpenAI Codex the architectural pattern is stable:

| Layer        | Role |
|-------------|------|
| Ingress     | Slack `@mention`, Linear assign/comment, IDE chat, webhook, REST API |
| Orchestration | Planning, routing among models/tools, enterprise policy envelopes |
| Sandbox     | Cloud VM/workspace, local repo checkout, CI runner executing agent CLI |
| Tools       | Git provider API, shell/build, HTTP, MCP-backed tool servers |
| Egress      | Pull request, issue comment/status transitions, Slack thread updates, logs |

**Model Context Protocol (MCP).** MCP standardizes host/client/server roles so assistants discover tools dynamically instead of bespoke per-UI integrations. Slack documents its MCP server and security model publicly (see §7, §15).

---

## §3 Cursor — Slack, Linear, Jira

### Slack

Official path: install the Cursor Slack app, connect GitHub and repository defaults from the Cursor dashboard, then invoke **`@Cursor`** with a prompt in channels or threads. Documented commands include plain prompts, **`@Cursor settings`**, **`@Cursor list my agents`**, and inline hints such as repository or model selection. Agents consume **the full Slack thread** as context, run as background/cloud-style work, and return **status updates** with links to Cursor and **GitHub pull requests** when work completes — matching a “delegate in chat, verify in Git” loop.

### Linear

Two documented tracks:

1. **Cloud-agent delegation.** Connect Linear from Cursor integrations UI; assign an issue to Cursor or mention **`@Cursor`** in Linear comments; work product centers on PR output and synced progress.
2. **Linear MCP.** Remote MCP endpoint for issue operations from inside Cursor (see Linear integration listing in §15).

### Jira

Compared with Slack and Linear, public first-party “@Cursor inside Jira” UX is not the dominant narrative in Cursor’s primary integration docs checked for this memo. Typical patterns mirror other MCP hosts: configure an Atlassian/Jira-capable MCP server, enforce credentials and scopes via your identity stack, and optionally bridge with Jira Automation (§9).

---

## §4 Claude Code — Slack, Linear, Jira

### Surfaces

- Interactive agent loop in terminal and editor contexts.
- **Programmatic automation:** Agent SDK and headless flows (`-p`, tool allowlists, JSON output) suit CI, cron, and custom bridges from webhooks.
- **Slack — two different products:** **Claude Code** (`code.claude.com`) is primarily **CLI/SDK/MCP**-driven; **Claude for Work** documents **Slack connectors** on `claude.com` for chat experiences that may differ from Code’s terminal agent. Teams implementing “Slack thread → code change” often bridge **Slack → webhook → runner with `claude` CLI** or use **Slack MCP** from a supported MCP host.
- **Slack MCP (platform):** Slack’s hosted MCP endpoint exposes search, read, and write paths subject to OAuth and admin controls for MCP-capable clients (see §7).

### Linear and Jira

Configure **Linear MCP** and **Atlassian MCP** endpoints per provider documentation (Linear listing; OpenAI Codex plugin docs reference Atlassian MCP URLs and illustrate MCP packaging patterns reusable across MCP-capable hosts).

**Trade-off.** Maximum control and private glue; higher integration engineering burden than native `@` bots.

---

## §5 OpenAI Codex — Slack, Linear, Jira

### Slack and Linear (product connectors)

- **`@Codex`** in Slack on eligible ChatGPT/Codex SKUs; thread history supplies implicit context; prompts may pin **repository/environment** hints. **Enterprise admins** can suppress **inline completion posts** so Slack only receives a **task link** — a privacy-and-noise control mirroring how mature orgs treat CI bots.
- **Linear:** Assign Codex or mention **`@Codex`** in comments; cloud tasks consume configured GitHub environments per OpenAI’s integration documentation.

### Jira

Two public lanes:

1. **Plugins / MCP connectors** bundled or configured through Codex’s plugin mechanism (skills, MCP servers).
2. **Automation-heavy lane:** explicit **Jira → GitHub Actions → `codex-cli`** recipes for PR creation and reciprocal issue updates — suited to regulated change management.

---

## §6 Side-by-side comparison (Slack / Linear / Jira entry points)

| Dimension | Cursor | Claude Code | OpenAI Codex |
|-----------|--------|-------------|----------------|
| Primary triggers | `@Cursor` in Slack/Linear; IDE | MCP + CLI/SDK + IDE | `@Codex` in Slack/Linear; IDE/cloud tasks |
| Slack | First-party Slack app | Slack MCP / plugin wiring | First-party Slack connector docs |
| Linear | Assign/`@Cursor` + Linear MCP | Linear MCP server | Assign/`@Codex` connector docs |
| Jira emphasis | MCP-style composition | MCP Atlassian/community | Plugins/MCP + Jira Automation ↔ Actions cookbook |
| Execution venue | Cursor cloud agents + GitHub API | Customer-operated runners | Hosted Codex tasks + GitHub per docs |

This matrix is illustrative; authoritative entitlements appear in workspace admin consoles.

---

## §7 Slack automation

**Workflow Builder** targets repeatable flows (forms, approvals, branching). Paid tiers add connectors and platform features described on Slack’s product and developer pages.

**Developer extensions.** Custom workflow steps integrate app logic via **Bolt** (self-hosted JS/Python/Java) or **Deno Slack SDK** (Slack-hosted patterns).

**AI-oriented access.** Slack’s **MCP server** exposes machine-discoverable tools over OAuth for compatible AI hosts — search, histories, messaging, canvases per Slack’s MCP documentation.

**Interpretation.** Slack excels at coordinating humans; deterministic systems-of-record syncing usually pairs Slack with Linear, Jira, or Notion through workflows, MCP callers, or iPaaS.

---

## §8 Linear automation

**Git/GitHub/GitLab automation.** Issues link to pull requests via branch names, titles, commits, or PR descriptions; workflow automation advances statuses on PR events such as opened, ready-for-merge, and merged depending on team settings.

**Slack-plane automation.** Personal DMs, team channels, project notifications, and alerts for saved/custom views propagate issue changes to Slack in real time. Linear’s Slack app also supports an **agentic `@Linear`** experience (natural-language issue ops, configurable **team guidance**, thread sync, and rich unfurls) documented in Linear’s Slack help.

**Interpretation.** Linear binds **delivery state** tightly to **version control events**; Slack binds **attention** to those transitions.

---

## §9 Jira automation patterns

Jira complements chat-first and Git-first tools with ITSM-grade policy envelopes: **Automation rules**, **webhooks**, and **Forge** (modern app platform) extensions.

### Built-in Automation (rules / flows)

Rules compose **triggers**, optional conditions/branches, and **actions**. Triggers cover field transitions, schedules, and **incoming webhooks** that let external systems start a rule without polling. Actions include comments, linkage, edits, assignments, outbound **web requests**, and other operations documented in Atlassian Help.

### Webhooks

Jira emits HTTPS callbacks when subscribed events occur; consumers implement verification, backoff, and idempotent handlers. Registration is documented for Cloud via admin surfaces and REST where auth models permit.

### Forge extensibility

**Forge Automation Actions** add custom actions inside the Automation rule builder UI. Forge **trigger** modules subscribe to product events so apps react without forcing all logic through the Automation UI-only palette. Patterns are documented under Forge → building automations and Jira Automation Action tutorials.

### Typical coding-agent bridges

Examples used in enterprise designs:

1. **Rule trigger:** Label added or transition to “Ready for Agent” → **Send web request** to orchestrator endpoint.
2. **Orchestrator:** Validates payload, respects CODEOWNERS/branch protections, invokes `codex-cli`, headless Claude Code, or Cursor Cloud Agents API.
3. **Return path:** Automation **comment** / **transition** Issue with PR URL; optional Git webhook closes loop.

OpenAI publishes a cookbook pattern for **Jira ↔ GitHub Actions ↔ Codex** explicitly (§15).

---

## §10 Slack × Notion productivity patterns

Native integration emphasizes **capturing Slack messages into Notion** (slash commands / save-to-database flows in Notion Help), **replying to Notion comments from Slack**, and **surfacing Notion changes in Slack** via database automations. Pasted Notion links can **unfurl** with previews; newer product storytelling describes **@mentioning Notion in Slack** for summaries and Q&A against workspace content, and **custom agents** that learn from team feedback over time — a chat-native layer on top of static sync.

**UX takeaway.** The productivity win is **bidirectional surface area without duplicate typing**: discussion happens in Slack; durable specs and databases live in Notion; the integration keeps **tabs and copy-paste** off the critical path.

Teams needing conditional multi-step synchronization (field-level sync across many databases) commonly add middleware (Zapier, Make, enterprise automation) atop these primitives.

---

## §11 Linear × Notion productivity patterns

**Embeds and previews.** Pasting Linear issue, project, or view URLs into Notion can render **live previews** (title, status, assignee, updated-at semantics per Linear’s integration page); each viewer must authorize Linear individually.

**Notion AI connector (premium).** Notion documents an **AI connector for Linear** on eligible plans: workspace admins connect Linear so Notion AI can reason over issue data on a scheduled sync boundary (vendor-documented latency on order of tens of minutes for some refresh paths — plan for **eventual consistency** in UX copy).

**Beyond previews.** Roadmaps, OKR rollups, or customer-facing lists often use **iPaaS** (Zapier/Make templates) to mirror selected fields while keeping **Linear authoritative for delivery state**.

**UX pairing with Slack.** Teams often use **Linear → Slack notifications** for “what changed,” **Notion embeds** for “why / spec / decision log,” and **Slack threads** for “debate.” The three surfaces stay coherent when each has a clear job: **attention** (Slack), **shippable work** (Linear), **narrative truth** (Notion).

---

## §12 UI/UX design patterns (productivity + automation)

This section distills **what users actually experience** across the products above — useful when designing OmniTool surfaces that compete with “just use Slack + Linear + Notion.”

### 12.1 Chat-native delegation (`@bot`)

**Pattern.** A single **@mention** is the discoverable entrypoint: `@Cursor`, `@Codex`, `@Linear`, Notion-flavored @-agents in Slack. Users do not open a separate “automation console” for the first 80% of tasks.

**Design implications.**

- **Teach once in-channel:** onboarding copy and `/help` or `@Bot settings` should live where work already happens.
- **Thread = context bundle:** threading is load-bearing; the agent’s first pass should summarize “what I read from this thread” only when it reduces anxiety (optional verbose mode vs quiet mode).
- **Progressive disclosure:** power users pass `repo`, `model`, `environment`, or labels; novices send plain language.

### 12.2 Status, trust, and enterprise controls

**Pattern.** Long-running agents post **incremental status** and end with **links to authoritative artifacts** (PR URL, task deep link, dashboard). OpenAI’s Codex documentation calls out an enterprise control where admins can **post only a task link** instead of full inline answers — a deliberate **least-exposure / least-noise** UX knob.

**Design implications.**

- Default to **structured updates** (what shipped, what’s blocked, what’s next) over raw model prose.
- Offer **admin toggles** for channel noise, retention, and whether full transcripts appear in Slack vs only in-app.

### 12.3 Rich unfurls and “paste URL, get truth”

**Pattern.** Linear and Notion invest in **link previews** so documents and chat hold **live handles** into records rather than stale screenshots.

**Design implications.**

- In-app editors (notes, issues) should **paste-detect** URLs and render compact **preview cards** with explicit **last synced** or **refresh** affordances when data is not realtime.

### 12.4 Automation that stays invisible until it fails

**Pattern.** Linear’s Git automation advances issues on PR events without users clicking “run workflow.” Slack Workflow Builder shows **explicit steps** (forms, approvals). **Good automation UX:** silent success, loud structured failure (DM + remediation link).

### 12.5 Cognitive-load reducers that recur in customer stories

| Technique | Example |
|-----------|---------|
| **Capture at source** | Save Slack message → Notion database row |
| **Single system of record** | Status in Linear; prose in Notion; Slack not authoritative |
| **Attention routing** | Channel-per-team or digest settings vs firehose |
| **Human-in-the-loop** | Jira transitions, approval workflow steps before agent runs |

---

## §13 Conclusions

1. **Coding agents share one architecture** — LLM-orchestrated tool loops in sandboxes — and differ by **ingress ergonomics** (native `@` bots vs DIY MCP) and **policy packaging**.

2. **Cursor and Codex** optimize low-friction delegation from **Slack and Linear** into **GitHub PR outcomes**; **Claude Code** optimizes **explicit MCP + programmatic** control for operators who own runners and CI glue.

3. **Anthropic’s product surface is split:** **Claude (claude.com)** ships **Slack connectors** for chat; **Claude Code** (`code.claude.com`) emphasizes **CLI, SDK, headless**, and **MCP-wired** tool access — teams often chain **Slack → webhook → runner** if they want Code-style execution without the consumer Slack bot.

4. **Jira’s strength is policy and ITSM gravity**; pair **Automation + webhooks + Forge** with branch protections for auditable agent execution.

5. **Automation planes are complementary:** Slack routes **attention**; Linear binds **work to VCS**; Jira binds **work to approval and operational controls**.

6. **Notion** strengthens **documentation and comprehension** beside Slack and Linear via capture, notifications, embeds, and (on higher tiers) **AI connectors**; **deep bidirectional databases** still tend to need middleware.

7. **Residual completeness gap.** Runtime proof of gated features across specific tenant SKUs requires hands-on entitlement tests not performed here; supplement this memo with internal pilot artifacts when “complete research” must include empirical verification.

---

## §14 Applying this research to OmniTool

OmniTool already centralizes **auth**, **tRPC APIs**, **Notes** (Notion-like), **issues/tasks**, **AI agents**, **connected accounts**, and a **workflow engine** with triggers, agent steps, and actions such as **Slack** and **issue create**. The integration registry includes **GitHub**, **Notion**, **Slack**, and **Linear** (`packages/integrations` provider registry), with **Slack** and **Linear webhooks** present under `apps/web/app/api/webhooks/`. Below is a concise **implementation map** from the UX patterns in §12 to concrete lanes in this codebase.

### 14.1 Near-term (high leverage, fits current architecture)

1. **Workflow templates as “OmniTool automations”** — `apps/web/lib/workflows/templates.ts` already encodes patterns (e.g. triage → Slack; standup → Slack + note). Extend templates with **Linear-triggered** paths mirroring Linear’s “notify + contextual message” UX, and add **Notion** actions where the notes stack should receive durable output (specs, standups, incident logs).

2. **Background tasks UX parity** — Long agent runs should continue to use the **topbar background task indicator** pattern (documented in repo conventions) so Slack is not the only place users see progress; link from toast/task detail to the **note, issue, or PR** that was created.

3. **Rich context in Notes** — Align with §12.3: when pasting **Linear issue URLs** (and eventually **GitHub PR URLs**), offer **preview blocks** similar to Linear×Notion embeds, using existing Linear/Github tokens from `ConnectedAccount`.

4. **Slack ingress (read-only → interactive)** — Today’s engine can **send** Slack messages. A fuller “@OmniTool” experience requires a **Slack app** with Events API / interactivity that posts into OmniTool (create issue, append note, kick workflow). Route events through the same **workflow engine** so Slack is just another **trigger kind**.

### 14.2 Medium-term (MCP + external agents)

1. **MCP server exposing guarded tools** — Mirror Slack’s MCP model: expose **read/search** (issues, notes, tasks) and **write** tools (create issue, append note) backed by **tRPC or internal services**, with per-user OAuth and auditing. That lets **Cursor / Claude Code / Codex** call OmniTool as a **system of record** while the LLM runs elsewhere.

2. **Webhook bridges** — **Jira** is not yet a first-class provider in the registry; **Jira Cloud** can follow the same pattern as **Linear** (OAuth app + inbound webhooks + workflow triggers) if enterprise customers require ITSM parity.

### 14.3 UX principles to keep OmniTool cohesive

- **One @mention mental model inside OmniTool:** whether the user starts in **Agents chat**, **Notes**, or **Issues**, the same **“delegate → background run → link to artifact”** loop should apply (§12.1–12.2).
- **Slack is notification + capture, not source of truth** — mirror the Notion/Linear split: **OmniTool issues/tasks** or **Notes** hold canonical state; Slack confirms and alerts.
- **Admin settings** for integration noise and data exposure (Codex-style enterprise toggles) belong in **Settings → Integrations / Notifications**, next to token health.

---

## §15 Consolidated references (complete bibliography)

All URLs below appear as `https://` or `http://` URI lines — one canonical URL per line for easy diffing and copy/paste.

```
https://cursor.com/docs/integrations/slack
https://cursor.com/changelog/1-1
https://cursor.com/docs/integrations/linear
https://cursor.com/docs/background-agent/api/overview
https://docs.anthropic.com/en/docs/claude-code/mcp/
https://docs.anthropic.com/en/docs/claude-code/sdk
https://code.claude.com/docs/en/headless.md
https://developers.openai.com/codex/integrations/slack
https://developers.openai.com/codex/integrations/linear
https://developers.openai.com/codex/plugins
https://developers.openai.com/cookbook/examples/codex/jira-github
https://chat.openai.com/features/codex
https://linear.app/integrations/cursor
https://linear.app/integrations/cursor-mcp
https://linear.app/integrations/codex
https://linear.app/docs/github
https://linear.app/docs/slack
https://linear.app/changelog/2023-11-15-github-workflow-updates
https://linear.app/changelog/2024-08-23-slack-channel-notifications-for-custom-views
https://linear.app/integrations/notion
https://slack.com/workflow-builder
https://api.slack.com/automation/workflows
https://api.slack.com/automation/functions/custom-bolt
http://docs.slack.dev/workflows/workflow-builder
https://docs.slack.dev/ai/mcp-server/
https://slack.com/help/articles/48855576908307-Guide-to-the-Slack-MCP-server
https://support.atlassian.com/cloud-automation/docs/what-are-automation-rules
https://support.atlassian.com/cloud-automation/docs/jira-automation-triggers
https://support.atlassian.com/jira-core-cloud/docs/automation-actions/
https://developer.atlassian.com/cloud/jira/platform/webhooks/
https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-webhooks/
https://developer.atlassian.com/platform/forge/building-automations/
https://developer.atlassian.com/platform/forge/build-a-jira-automation-action/
https://developer.atlassian.com/platform/forge/manifest-reference/modules/trigger/
https://www.atlassian.com/blog/development/automate-more-in-jira-a-guide-to-forge-automation-actions
https://www.notion.so/help/slack
https://www.notion.so/help/guides/unleashing-productivity-with-notions-slack-integration
https://zapier.com/apps/linear/integrations/notion
https://code.claude.com/docs/en/platforms
https://claude.com/docs/connectors/slack
https://www.notion.so/help/notion-ai-connector-for-linear
https://slack.com/customer-stories/notion-story
https://slack.com/marketplace/A08SKDT6QUW-cursor
https://slack.com/marketplace/A09F5C369E3-openai-codex
```

**End of §15 bibliography** — extend the block above as new sources are verified; update the count when editing.

---

**Repository path.** `docs/research/coding-agents-slack-linear-jira-notion.md`
