import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export type CodingSessionSource =
  | "claude-code"
  | "codex"
  | "gemini-cli"
  | "vscode-copilot"
  | "aider"
  | "continue"
  | "cline"
  | "roo-code"
  | "cursor"
  | "windsurf"
  | "opencode";

export type CodingSessionRole =
  | "user"
  | "assistant"
  | "system"
  | "tool"
  | "info";

export interface CodingSessionMessage {
  role: CodingSessionRole;
  content: string;
  timestamp?: string;
  kind?: string;
}

export interface CodingSessionRecord {
  id: string;
  source: CodingSessionSource;
  sourceLabel: string;
  path: string;
  project?: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  byteSize: number;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolEventCount: number;
  status: "extractable" | "metadata-only" | "unsupported" | "error";
  statusDetail?: string;
}

export interface ExtractedCodingSession extends CodingSessionRecord {
  messages: CodingSessionMessage[];
  transcriptText: string;
  contentHash: string;
  rawEventCount: number;
}

export interface CodingSessionSummary {
  title: string;
  overview: string;
  participants: string[];
  keyTopics: string[];
  actionItems: string[];
  risks: string[];
  sourceMessageCount: number;
}

export interface ScanCodingSessionsOptions {
  cwd?: string;
  homeDir?: string;
  limitPerSource?: number;
  /** Only scan these integrations. Omit for all known sources. */
  sources?: CodingSessionSource[];
  /**
   * Per-source absolute directories to scan instead of built-in defaults.
   * Non-empty array replaces default roots for that source only.
   */
  rootOverrides?: Partial<Record<CodingSessionSource, string[]>>;
  /**
   * If non-empty, **only** these directories are walked (built-in roots and `rootOverrides` are ignored).
   * Session files are detected with the normal per-tool matchers.
   */
  scanRootsOnly?: string[];
}

interface SourceDefinition {
  source: CodingSessionSource;
  label: string;
  roots: (homeDir: string, cwd: string) => string[];
  match: (filePath: string) => boolean;
  projectFromPath?: (filePath: string, homeDir: string) => string | undefined;
  status?: CodingSessionRecord["status"];
  statusDetail?: string;
}

const textExtensions = new Set([".jsonl", ".json", ".md"]);

const OPENCODE_TOOL_SNIPPET_MAX = 3500;

function openCodeDataDir(homeDir: string): string {
  if (process.platform === "win32") {
    const base =
      process.env.LOCALAPPDATA ??
      process.env.APPDATA ??
      path.join(homeDir, "AppData", "Local");
    return path.join(base, "opencode");
  }
  const xdgData = process.env.XDG_DATA_HOME ?? path.join(homeDir, ".local", "share");
  return path.join(xdgData, "opencode");
}

/** OpenCode layout: `<dataDir>/storage/session/<project>/ses_<id>.json` */
function openCodeDirsFromSessionFile(sessionFilePath: string): { dataDir: string; sessionId: string } | null {
  const base = path.basename(sessionFilePath);
  if (!base.startsWith("ses_") || !base.endsWith(".json")) return null;
  const sessionId = base.replace(/\.json$/i, "");
  const dataDir = path.resolve(sessionFilePath, "..", "..", "..", "..");
  return { dataDir, sessionId };
}

const sourceDefinitions: SourceDefinition[] = [
  {
    source: "claude-code",
    label: "Claude Code",
    roots: (homeDir) => [path.join(homeDir, ".claude", "projects")],
    match: (filePath) => filePath.endsWith(".jsonl"),
    projectFromPath: (filePath, homeDir) => {
      const relative = path.relative(path.join(homeDir, ".claude", "projects"), filePath);
      return relative.split(path.sep)[0]?.replace(/^-/, "/").replaceAll("-", "/");
    },
  },
  {
    source: "codex",
    label: "Codex",
    roots: (homeDir) => [path.join(process.env.CODEX_HOME ?? path.join(homeDir, ".codex"), "sessions")],
    match: (filePath) => filePath.endsWith(".jsonl"),
    projectFromPath: (filePath) => filePath.split(`${path.sep}sessions${path.sep}`)[1]?.split(path.sep).slice(0, 3).join("-"),
  },
  {
    source: "gemini-cli",
    label: "Gemini CLI",
    roots: (homeDir) => [path.join(homeDir, ".gemini", "tmp")],
    match: (filePath) =>
      filePath.includes(`${path.sep}chats${path.sep}`) &&
      (filePath.endsWith(".jsonl") || filePath.endsWith(".json")),
    projectFromPath: (filePath, homeDir) => {
      const relative = path.relative(path.join(homeDir, ".gemini", "tmp"), filePath);
      return relative.split(path.sep)[0];
    },
  },
  {
    source: "vscode-copilot",
    label: "VS Code / Copilot Chat",
    roots: (homeDir) => [
      path.join(homeDir, "Library", "Application Support", "Code", "User", "workspaceStorage"),
      path.join(homeDir, "Library", "Application Support", "Code - Insiders", "User", "workspaceStorage"),
    ],
    match: (filePath) =>
      filePath.includes(`${path.sep}chatSessions${path.sep}`) &&
      (filePath.endsWith(".jsonl") || filePath.endsWith(".json")),
    projectFromPath: (filePath) => filePath.split(`${path.sep}workspaceStorage${path.sep}`)[1]?.split(path.sep)[0],
  },
  {
    source: "aider",
    label: "Aider",
    roots: (_homeDir, cwd) => [cwd],
    match: (filePath) =>
      filePath.endsWith(`${path.sep}.aider.chat.history.md`) ||
      (filePath.includes(`${path.sep}.aider${path.sep}sessions${path.sep}`) && textExtensions.has(path.extname(filePath))),
    projectFromPath: (_filePath, _homeDir) => "Current workspace",
  },
  {
    source: "continue",
    label: "Continue",
    roots: (homeDir) => [path.join(homeDir, ".continue", "sessions")],
    match: (filePath) => filePath.endsWith(".json"),
  },
  {
    source: "cline",
    label: "Cline",
    roots: (homeDir) => [
      path.join(homeDir, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "tasks"),
      path.join(homeDir, "Library", "Application Support", "Cursor", "User", "globalStorage", "saoudrizwan.claude-dev", "tasks"),
    ],
    match: (filePath) =>
      filePath.endsWith(`${path.sep}api_conversation_history.json`) ||
      filePath.endsWith(`${path.sep}ui_messages.json`),
    projectFromPath: (filePath) => filePath.split(`${path.sep}tasks${path.sep}`)[1]?.split(path.sep)[0],
  },
  {
    source: "roo-code",
    label: "Roo Code",
    roots: (homeDir) => [
      path.join(homeDir, "Library", "Application Support", "Code", "User", "globalStorage"),
      path.join(homeDir, "Library", "Application Support", "Cursor", "User", "globalStorage"),
    ],
    match: (filePath) => filePath.endsWith(`${path.sep}history_item.json`) && filePath.includes(`${path.sep}tasks${path.sep}`),
    projectFromPath: (filePath) => filePath.split(`${path.sep}tasks${path.sep}`)[1]?.split(path.sep)[0],
  },
  {
    source: "cursor",
    label: "Cursor",
    roots: (homeDir) => [
      path.join(homeDir, "Library", "Application Support", "Cursor", "User", "globalStorage"),
      path.join(homeDir, "Library", "Application Support", "Cursor", "User", "workspaceStorage"),
    ],
    match: (filePath) => filePath.endsWith("state.vscdb"),
    status: "metadata-only",
    statusDetail: "Cursor stores chats in SQLite. Detection is implemented; transcript extraction needs a SQLite adapter.",
  },
  {
    source: "windsurf",
    label: "Windsurf",
    roots: (homeDir) => [
      path.join(homeDir, "Library", "Application Support", "Windsurf", "User", "globalStorage"),
      path.join(homeDir, "Library", "Application Support", "Windsurf - Next", "User", "globalStorage"),
      path.join(homeDir, ".codeium", "windsurf", "memories"),
    ],
    match: (filePath) => filePath.endsWith("state.vscdb") || textExtensions.has(path.extname(filePath)),
    status: "metadata-only",
    statusDetail: "Windsurf chats are stored in encoded app state. Memories can be indexed; chat extraction needs a decoder.",
  },
  {
    source: "opencode",
    label: "OpenCode",
    roots: (homeDir) => [path.join(openCodeDataDir(homeDir), "storage", "session")],
    match: (filePath) =>
      path.basename(filePath).startsWith("ses_") &&
      filePath.endsWith(".json") &&
      filePath.includes(`${path.sep}storage${path.sep}session${path.sep}`),
    projectFromPath: (filePath) => {
      const projectDir = path.basename(path.dirname(filePath));
      return projectDir !== "session" ? projectDir : undefined;
    },
  },
];

const allowedSources = new Set(sourceDefinitions.map((d) => d.source));

/** Stable list of scanner source ids (for validation). */
export const CODING_SESSION_SCAN_SOURCES = sourceDefinitions.map((d) => d.source) as readonly CodingSessionSource[];

/**
 * Parse a comma-separated list of source ids (e.g. `"opencode,claude-code"`).
 * Unknown tokens are skipped. Returns `undefined` if nothing valid remains (use all sources).
 */
export function parseCodingSessionSourcesList(raw: string | undefined | null): CodingSessionSource[] | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  const seen = new Set<CodingSessionSource>();
  for (const part of String(raw).split(",")) {
    const id = part.trim() as CodingSessionSource;
    if (id && allowedSources.has(id)) seen.add(id);
  }
  return seen.size > 0 ? [...seen] : undefined;
}

export async function scanCodingSessions(
  options: ScanCodingSessionsOptions = {}
): Promise<CodingSessionRecord[]> {
  const homeDir = options.homeDir ?? os.homedir();
  const cwd = options.cwd ?? process.cwd();
  const limitPerSource = options.limitPerSource ?? 250;
  const sessions: CodingSessionRecord[] = [];

  const definitions = options.sources?.length
    ? sourceDefinitions.filter((d) => options.sources!.includes(d.source))
    : sourceDefinitions;

  const scanRootsRaw = options.scanRootsOnly?.map((r) => r.trim()).filter((r) => r.length > 0);
  const scanRootsOnly = scanRootsRaw?.length ? [...new Set(scanRootsRaw.map((r) => path.resolve(r)))] : null;

  if (scanRootsOnly?.length) {
    const seenPaths = new Set<string>();
    const matchAny = (filePath: string) => definitions.some((d) => d.match(filePath));

    for (const root of scanRootsOnly) {
      let foundHere = 0;
      const files = await listFiles(root, limitPerSource, matchAny);
      for (const filePath of files) {
        if (seenPaths.has(filePath)) continue;
        const definition = definitions.find((d) => d.match(filePath));
        if (!definition) continue;
        seenPaths.add(filePath);
        const record = await createSessionRecord(filePath, definition, homeDir);
        sessions.push(record);
        foundHere += 1;
        if (foundHere >= limitPerSource) break;
      }
    }

    return sessions.sort((a, b) => {
      const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? "1970-01-01T00:00:00.000Z");
      const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? "1970-01-01T00:00:00.000Z");
      return bTime - aTime;
    });
  }

  for (const definition of definitions) {
    const customRoots = options.rootOverrides?.[definition.source]?.filter((r) => r.trim().length > 0);
    const roots =
      customRoots && customRoots.length > 0
        ? [...new Set(customRoots.map((r) => path.resolve(r)))]
        : definition.roots(homeDir, cwd);
    let foundForSource = 0;

    for (const root of roots) {
      if (foundForSource >= limitPerSource) break;
      const files = await listFiles(root, limitPerSource - foundForSource, definition.match);
      for (const filePath of files) {
        const record = await createSessionRecord(filePath, definition, homeDir);
        sessions.push(record);
        foundForSource += 1;
        if (foundForSource >= limitPerSource) break;
      }
    }
  }

  return sessions.sort((a, b) => {
    const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? "1970-01-01T00:00:00.000Z");
    const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? "1970-01-01T00:00:00.000Z");
    return bTime - aTime;
  });
}

export async function extractCodingSessionById(
  id: string,
  options: ScanCodingSessionsOptions = {}
): Promise<ExtractedCodingSession | null> {
  const sessions = await scanCodingSessions(options);
  const session = sessions.find((candidate) => candidate.id === id);
  if (!session || session.status !== "extractable") return null;
  return extractCodingSession(session);
}

export async function extractCodingSession(
  record: CodingSessionRecord
): Promise<ExtractedCodingSession> {
  if (record.source === "opencode") {
    return extractOpenCodeSession(record);
  }

  const raw = await fs.readFile(record.path, "utf8");
  const messages = parseMessages(record.source, raw, record.path);
  const transcriptText = messagesToTranscript(messages);
  const counts = countMessages(messages);

  return {
    ...record,
    ...counts,
    messages,
    title: record.title ?? inferTitle(messages),
    transcriptText,
    contentHash: createHash("sha256").update(raw).digest("hex"),
    rawEventCount: parseRawEvents(raw, record.path).length,
  };
}

export function createExtractiveSummary(session: ExtractedCodingSession): CodingSessionSummary {
  const userMessages = session.messages.filter((message) => message.role === "user");
  const assistantMessages = session.messages.filter((message) => message.role === "assistant");
  const firstUserMessage = userMessages[0]?.content ?? session.title ?? "Coding session";
  const joined = session.messages.map((message) => message.content).join("\n");
  const keyTopics = pickKeywords(joined);
  const actionItems = pickSentences(joined, /\b(todo|next|fix|add|implement|refactor|test|debug|follow up|ship)\b/i, 5);
  const risks = pickSentences(joined, /\b(error|failed|bug|risk|warning|blocked|missing|regression|unsafe)\b/i, 4);

  return {
    title: truncate(cleanWhitespace(firstUserMessage), 80),
    overview: buildOverview(session, userMessages.length, assistantMessages.length, keyTopics),
    participants: ["User", session.sourceLabel],
    keyTopics,
    actionItems,
    risks,
    sourceMessageCount: session.messageCount,
  };
}

export function buildSummaryPrompt(session: ExtractedCodingSession): string {
  const transcript = truncate(session.transcriptText, 24000);
  return `Summarize this coding-agent session for an engineering activity tracker.

Return concise JSON with keys: title, overview, keyTopics, actionItems, risks.
Rules:
- Do not include secrets, tokens, or full file contents.
- Keep overview to 2-4 sentences.
- keyTopics, actionItems, and risks must be arrays of short strings.
- Mention concrete implementation or debugging outcomes when present.

Tool: ${session.sourceLabel}
Project: ${session.project ?? "Unknown"}
Transcript:
${transcript}`;
}

function parseMessages(
  source: CodingSessionSource,
  raw: string,
  filePath: string
): CodingSessionMessage[] {
  if (filePath.endsWith(".md")) {
    return [{ role: "info", content: raw, kind: "markdown-history" }];
  }

  const events = parseRawEvents(raw, filePath);
  const messages: CodingSessionMessage[] = [];

  for (const event of events) {
    const extracted = extractMessageFromEvent(source, event);
    if (extracted?.content) messages.push(extracted);
  }

  return messages;
}

function extractMessageFromEvent(
  source: CodingSessionSource,
  event: unknown
): CodingSessionMessage | null {
  if (!isObject(event)) return null;

  if (source === "claude-code") {
    const type = stringValue(event.type);
    if (type === "queue-operation" || type === "attachment") return null;
    const message = isObject(event.message) ? event.message : event;
    const role = normalizeRole(stringValue(message.role) ?? type);
    const content = extractContent(message.content ?? event.content);
    return content ? { role, content, timestamp: stringValue(event.timestamp), kind: type } : null;
  }

  if (source === "codex") {
    const payload = isObject(event.payload) ? event.payload : event;
    const item = isObject(payload.item) ? payload.item : payload;
    const role = normalizeRole(stringValue(item.role) ?? stringValue(payload.role) ?? stringValue(payload.type));
    const content = extractContent(item.content ?? payload.content ?? payload.message ?? payload.text);
    return content ? { role, content, timestamp: stringValue(event.timestamp), kind: stringValue(payload.type) } : null;
  }

  if (source === "gemini-cli") {
    const type = stringValue(event.type);
    if (type === "info" && stringValue(event.content)?.includes("new version")) return null;
    const role = normalizeRole(stringValue(event.role) ?? type);
    const content = extractContent(event.content ?? event.message ?? event.text);
    return content ? { role, content, timestamp: stringValue(event.timestamp), kind: type } : null;
  }

  if (source === "vscode-copilot") {
    return extractCopilotMessage(event);
  }

  if (source === "opencode") {
    return null;
  }

  const role = normalizeRole(stringValue(event.role) ?? stringValue(event.type));
  const content = extractContent(event.content ?? event.message ?? event.text ?? event.messages ?? event.history);
  return content ? { role, content, timestamp: stringValue(event.timestamp), kind: stringValue(event.type) } : null;
}

function extractCopilotMessage(event: Record<string, unknown>): CodingSessionMessage | null {
  const value = isObject(event.v) ? event.v : event;
  const requests = Array.isArray(value.requests) ? value.requests : [];
  if (requests.length > 0) {
    const content = requests.map((request) => extractContent(request)).filter(Boolean).join("\n\n");
    return content ? { role: "info", content, kind: "requests" } : null;
  }

  const inputText = isObject(value.inputState) ? stringValue(value.inputState.inputText) : undefined;
  const content = inputText || extractContent(value.message ?? value.response ?? value.content);
  return content ? { role: "info", content, kind: stringValue(event.kind) } : null;
}

function msToIso(ms: unknown): string | undefined {
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function redactOpenCodeToolSnippet(snippet: string): string {
  return snippet.replace(/\bBearer\s+\S+/gi, "Bearer [redacted]").replace(/\bsk-[a-zA-Z0-9]{16,}\b/g, "[redacted]");
}

function summarizeOpenCodeToolInput(input: unknown): string {
  if (!isObject(input)) return truncate(redactOpenCodeToolSnippet(JSON.stringify(input)), OPENCODE_TOOL_SNIPPET_MAX);
  const patchText = stringValue(input.patchText);
  if (patchText) {
    return truncate(redactOpenCodeToolSnippet(`patchText:\n${patchText}`), OPENCODE_TOOL_SNIPPET_MAX);
  }
  return truncate(redactOpenCodeToolSnippet(JSON.stringify(input)), OPENCODE_TOOL_SNIPPET_MAX);
}

function openCodePartLines(part: Record<string, unknown>): string[] {
  const kind = stringValue(part.type) ?? "part";
  if (kind === "step-start" || kind === "step-finish" || kind === "compaction") return [];

  if (kind === "text" || kind === "reasoning") {
    const text = extractContent(part.text);
    if (!text) return [];
    return kind === "reasoning" ? [`[reasoning]\n${text}`] : [text];
  }

  if (kind === "file") {
    const name = stringValue(part.filename) ?? stringValue(part.url) ?? "file";
    return [`[file] ${name}`];
  }

  if (kind === "tool") {
    const tool = stringValue(part.tool) ?? "tool";
    const state = isObject(part.state) ? part.state : undefined;
    const status = state ? stringValue(state.status) : undefined;
    const title = state && stringValue(state.title);
    const output =
      state && state.output !== undefined
        ? typeof state.output === "string"
          ? state.output
          : truncate(redactOpenCodeToolSnippet(JSON.stringify(state.output)), OPENCODE_TOOL_SNIPPET_MAX)
        : "";
    const inputObj = state && state.input;
    const inputSummary =
      inputObj !== undefined ? summarizeOpenCodeToolInput(inputObj) : "";

    const lines = [`[tool:${tool}]${status ? ` (${status})` : ""}`];
    if (title) lines.push(title);
    if (inputSummary) lines.push(`Input:\n${inputSummary}`);
    if (output) lines.push(`Output:\n${truncate(output, OPENCODE_TOOL_SNIPPET_MAX)}`);
    return [lines.join("\n")];
  }

  const fallback = extractContent(part.text ?? part.message ?? part.body);
  return fallback ? [`[${kind}]\n${truncate(fallback, OPENCODE_TOOL_SNIPPET_MAX)}`] : [];
}

async function readOpenCodeMessageParts(dataDir: string, messageId: string): Promise<string[]> {
  const partDir = path.join(dataDir, "storage", "part", messageId);
  let entries: string[];
  try {
    entries = await fs.readdir(partDir);
  } catch {
    return [];
  }

  const parts: { order: number; id: string; json: Record<string, unknown> }[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(partDir, name), "utf8");
    const parsed = safeJsonParse(raw);
    if (!isObject(parsed)) continue;
    const time = isObject(parsed.time) ? parsed.time : undefined;
    const start = time && typeof time.start === "number" ? time.start : 0;
    parts.push({ order: start, id: stringValue(parsed.id) ?? name, json: parsed });
  }

  parts.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)));

  const lines: string[] = [];
  for (const { json } of parts) {
    lines.push(...openCodePartLines(json));
  }
  return lines;
}

async function loadOpenCodeMessages(sessionFilePath: string): Promise<CodingSessionMessage[]> {
  const layout = openCodeDirsFromSessionFile(sessionFilePath);
  if (!layout) return [];

  const sessionRaw = await fs.readFile(sessionFilePath, "utf8");
  const sessionParsed = safeJsonParse(sessionRaw);
  const sessionId =
    (isObject(sessionParsed) ? stringValue(sessionParsed.id) : undefined) ?? layout.sessionId;

  const messagesDir = path.join(layout.dataDir, "storage", "message", sessionId);
  let filenames: string[];
  try {
    filenames = await fs.readdir(messagesDir);
  } catch {
    return [];
  }

  const msgFiles = filenames.filter((f) => f.startsWith("msg_") && f.endsWith(".json")).sort();

  const parsedMessages: {
    sortKey: number;
    msg: Record<string, unknown>;
  }[] = [];

  for (const file of msgFiles) {
    const raw = await fs.readFile(path.join(messagesDir, file), "utf8");
    const msg = safeJsonParse(raw);
    if (!isObject(msg)) continue;
    const time = isObject(msg.time) ? msg.time : undefined;
    const created = time && typeof time.created === "number" ? time.created : 0;
    parsedMessages.push({ sortKey: created, msg });
  }

  parsedMessages.sort((a, b) => a.sortKey - b.sortKey);

  const result: CodingSessionMessage[] = [];
  for (const { msg } of parsedMessages) {
    const role = normalizeRole(stringValue(msg.role));
    const msgId = stringValue(msg.id);
    const time = isObject(msg.time) ? msg.time : undefined;
    const completed = time && typeof time.completed === "number" ? time.completed : undefined;
    const created = time && typeof time.created === "number" ? time.created : undefined;
    const timestamp = msToIso(completed ?? created);

    let bodyParts = msgId ? await readOpenCodeMessageParts(layout.dataDir, msgId) : [];
    let content = bodyParts.filter(Boolean).join("\n\n");

    if (!content && role === "user") {
      const summary = isObject(msg.summary) ? msg.summary : undefined;
      const title = summary && stringValue(summary.title);
      content = title ? cleanWhitespace(title) : "";
    }

    if (!content) continue;

    result.push({
      role,
      content,
      timestamp,
      kind: stringValue(msg.finish) ?? stringValue(msg.agent),
    });
  }

  return result;
}

async function createOpenCodeSessionRecord(
  filePath: string,
  definition: SourceDefinition,
  homeDir: string
): Promise<CodingSessionRecord> {
  const stats = await fs.stat(filePath);
  const layout = openCodeDirsFromSessionFile(filePath);

  const base: CodingSessionRecord = {
    id: createSessionId(definition.source, filePath),
    source: definition.source,
    sourceLabel: definition.label,
    path: filePath,
    project: definition.projectFromPath?.(filePath, homeDir),
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString(),
    byteSize: stats.size,
    messageCount: 0,
    userMessageCount: 0,
    assistantMessageCount: 0,
    toolEventCount: 0,
    status: "extractable",
  };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    return {
      ...base,
      status: "error",
      statusDetail: error instanceof Error ? error.message : "Invalid OpenCode session JSON",
    };
  }

  const sessionId = stringValue(parsed.id) ?? layout?.sessionId;
  const title = stringValue(parsed.title);
  const directory = stringValue(parsed.directory);
  const time = isObject(parsed.time) ? parsed.time : undefined;
  const createdMs = time && typeof time.created === "number" ? time.created : undefined;
  const updatedMs = time && typeof time.updated === "number" ? time.updated : undefined;

  const record: CodingSessionRecord = {
    ...base,
    title: title ?? base.title,
    project: directory ?? base.project,
    createdAt: msToIso(createdMs) ?? base.createdAt,
    updatedAt: msToIso(updatedMs) ?? base.updatedAt,
  };

  if (!sessionId || !layout) {
    return {
      ...record,
      status: "error",
      statusDetail: "Could not resolve OpenCode session layout",
    };
  }

  try {
    const messages = await loadOpenCodeMessages(filePath);
    return {
      ...record,
      ...countMessages(messages),
      title: record.title ?? inferTitle(messages),
    };
  } catch (error) {
    return {
      ...record,
      status: "error",
      statusDetail: error instanceof Error ? error.message : "Could not index OpenCode messages",
    };
  }
}

async function extractOpenCodeSession(record: CodingSessionRecord): Promise<ExtractedCodingSession> {
  const raw = await fs.readFile(record.path, "utf8");
  const messages = await loadOpenCodeMessages(record.path);
  const transcriptText = messagesToTranscript(messages);
  const counts = countMessages(messages);
  const hashPayload = `${raw}\n---\n${transcriptText}`;

  return {
    ...record,
    ...counts,
    messages,
    title: record.title ?? inferTitle(messages),
    transcriptText,
    contentHash: createHash("sha256").update(hashPayload).digest("hex"),
    rawEventCount: messages.length,
  };
}

function statDerivedTimes(stats: import("node:fs").Stats): { createdAt: string; updatedAt: string } {
  const mtimeIso = dateToIso(stats.mtime);
  const ctimeIso = dateToIso(stats.ctime);
  const birthIso = dateToIso(stats.birthtime);
  const birthMs = stats.birthtimeMs ?? stats.birthtime.getTime();
  const birthUsable = birthIso && Number.isFinite(birthMs) && birthMs > 86_400_000;
  return {
    createdAt: birthUsable ? birthIso : (ctimeIso ?? mtimeIso ?? new Date().toISOString()),
    updatedAt: mtimeIso ?? new Date().toISOString(),
  };
}

function dateToIso(d: Date): string | undefined {
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return undefined;
  return d.toISOString();
}

function jsonlConversationTimeRange(
  raw: string,
  source: CodingSessionSource
): { first?: string; last?: string } {
  let first: string | undefined;
  let last: string | undefined;
  for (const line of raw.split(/\r?\n/)) {
    const ts = extractJsonlLineTime(line, source);
    if (ts) {
      first ??= ts;
      last = ts;
    }
  }
  return { first, last };
}

function extractJsonlLineTime(line: string, source: CodingSessionSource): string | undefined {
  const trimmed = line.trim();
  if (!trimmed) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (!isObject(parsed)) return;

  if (source === "gemini-cli") {
    const t =
      stringValue(parsed.timestamp) ??
      stringValue(parsed.lastUpdated) ??
      stringValue(parsed.startTime);
    return isValidIsoString(t) ? t : undefined;
  }

  if (source === "codex" && stringValue(parsed.type) === "session_meta" && isObject(parsed.payload)) {
    const nested = stringValue(parsed.payload.timestamp);
    if (isValidIsoString(nested)) return nested;
  }

  const top = stringValue(parsed.timestamp);
  return isValidIsoString(top) ? top : undefined;
}

function isValidIsoString(value: string | undefined): value is string {
  if (!value) return false;
  return Number.isFinite(Date.parse(value));
}

function mergeLogTimes(
  base: { createdAt?: string; updatedAt?: string },
  source: CodingSessionSource,
  raw: string,
  filePath: string
): { createdAt: string; updatedAt: string } {
  let createdAt = base.createdAt ?? new Date().toISOString();
  let updatedAt = base.updatedAt ?? createdAt;

  if (filePath.endsWith(".jsonl") && (source === "claude-code" || source === "codex" || source === "gemini-cli")) {
    const range = jsonlConversationTimeRange(raw, source);
    if (range.first) createdAt = range.first;
    if (range.last) updatedAt = range.last;
  }

  return { createdAt, updatedAt };
}

async function createSessionRecord(
  filePath: string,
  definition: SourceDefinition,
  homeDir: string
): Promise<CodingSessionRecord> {
  if (definition.source === "opencode") {
    return createOpenCodeSessionRecord(filePath, definition, homeDir);
  }

  const stats = await fs.stat(filePath);
  const times = statDerivedTimes(stats);
  const base: CodingSessionRecord = {
    id: createSessionId(definition.source, filePath),
    source: definition.source,
    sourceLabel: definition.label,
    path: filePath,
    project: definition.projectFromPath?.(filePath, homeDir),
    createdAt: times.createdAt,
    updatedAt: times.updatedAt,
    byteSize: stats.size,
    messageCount: 0,
    userMessageCount: 0,
    assistantMessageCount: 0,
    toolEventCount: 0,
    status: definition.status ?? "extractable",
    statusDetail: definition.statusDetail,
  };

  if (base.status !== "extractable") return base;

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const messages = parseMessages(definition.source, truncate(raw, 750_000), filePath);
    const logTimes = mergeLogTimes(
      { createdAt: base.createdAt, updatedAt: base.updatedAt },
      definition.source,
      raw,
      filePath
    );
    return {
      ...base,
      createdAt: logTimes.createdAt,
      updatedAt: logTimes.updatedAt,
      ...countMessages(messages),
      title: inferTitle(messages) ?? path.basename(filePath),
    };
  } catch (error) {
    return {
      ...base,
      status: "error",
      statusDetail: error instanceof Error ? error.message : "Could not parse session",
    };
  }
}

async function listFiles(
  root: string,
  limit: number,
  match: (filePath: string) => boolean
): Promise<string[]> {
  const files: string[] = [];
  const queue = [root];

  while (queue.length > 0 && files.length < limit) {
    const current = queue.shift()!;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "target", ".next"].includes(entry.name)) queue.push(entryPath);
      } else if (entry.isFile()) {
        if (match(entryPath)) {
          files.push(entryPath);
          if (files.length >= limit) break;
        }
      }
    }
  }

  return files;
}

function parseRawEvents(raw: string, filePath: string): unknown[] {
  if (filePath.endsWith(".jsonl")) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => safeJsonParse(line))
      .filter((event): event is unknown => event !== null);
  }

  const parsed = safeJsonParse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (isObject(parsed)) return [parsed];
  return [];
}

function messagesToTranscript(messages: CodingSessionMessage[]): string {
  return messages
    .map((message) => {
      const label = message.role.toUpperCase();
      const timestamp = message.timestamp ? ` ${message.timestamp}` : "";
      return `[${label}${timestamp}]\n${message.content}`;
    })
    .join("\n\n");
}

function countMessages(messages: CodingSessionMessage[]) {
  return {
    messageCount: messages.length,
    userMessageCount: messages.filter((message) => message.role === "user").length,
    assistantMessageCount: messages.filter((message) => message.role === "assistant").length,
    toolEventCount: messages.filter((message) => message.role === "tool").length,
  };
}

function inferTitle(messages: CodingSessionMessage[]): string | undefined {
  const userMessage = messages.find((message) => message.role === "user" && message.content.length > 0);
  const firstMessage = userMessage ?? messages.find((message) => message.content.length > 0);
  return firstMessage ? truncate(cleanWhitespace(firstMessage.content), 90) : undefined;
}

function buildOverview(
  session: ExtractedCodingSession,
  userCount: number,
  assistantCount: number,
  keyTopics: string[]
): string {
  const project = session.project ? ` for ${session.project}` : "";
  const topics = keyTopics.length > 0 ? ` Main topics: ${keyTopics.slice(0, 4).join(", ")}.` : "";
  return `${session.sourceLabel} session${project} with ${userCount} user messages and ${assistantCount} assistant messages.${topics}`;
}

function pickKeywords(text: string): string[] {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "also",
    "because",
    "before",
    "could",
    "from",
    "have",
    "into",
    "that",
    "their",
    "there",
    "these",
    "this",
    "with",
    "would",
    "your",
  ]);
  const counts = new Map<string, number>();
  for (const match of text.toLowerCase().matchAll(/\b[a-z][a-z0-9_-]{3,}\b/g)) {
    const word = match[0];
    if (stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function pickSentences(text: string, pattern: RegExp, limit: number): string[] {
  return text
    .split(/\n|(?<=[.!?])\s+/)
    .map(cleanWhitespace)
    .filter((sentence) => sentence.length > 12 && pattern.test(sentence))
    .slice(0, limit)
    .map((sentence) => truncate(sentence, 160));
}

function extractContent(value: unknown): string {
  if (typeof value === "string") return cleanWhitespace(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (!isObject(item)) return "";
        return extractContent(item.text ?? item.content ?? item.input_text ?? item.output_text ?? item.message);
      })
      .filter(Boolean)
      .join("\n");
  }
  if (isObject(value)) {
    return extractContent(value.text ?? value.content ?? value.value ?? value.message);
  }
  return "";
}

function normalizeRole(role?: string): CodingSessionRole {
  if (!role) return "info";
  const normalized = role.toLowerCase();
  if (normalized.includes("user")) return "user";
  if (normalized.includes("assistant") || normalized.includes("agent")) return "assistant";
  if (normalized.includes("system")) return "system";
  if (normalized.includes("tool") || normalized.includes("function")) return "tool";
  return "info";
}

function createSessionId(source: CodingSessionSource, filePath: string): string {
  return createHash("sha256").update(`${source}:${filePath}`).digest("hex").slice(0, 24);
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
