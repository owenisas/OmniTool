/**
 * Structured server-side logger.
 *
 * A tiny, dependency-free JSON logger for the Next.js server / sidecar
 * runtime. It is the single insertion point for server-side observability:
 * the `instrumentation.ts` `onRequestError` hook and the fire-and-forget
 * paths in `lib/activity/emit.ts` and `lib/workflows/engine.ts` all route
 * through it instead of bare `console.error`.
 *
 * Design goals:
 * - Additive: no behavior change. Output still lands on the same stdout/stderr
 *   streams the sidecar already captures; only the shape becomes structured.
 * - Vendor-neutral: emits a stable JSON envelope so a later step (PostHog
 *   forwarding, OpenTelemetry) can plug in by extending `forward()` without
 *   touching call sites.
 * - Safe: never throws. Logging must not break the flow it instruments.
 *
 * In development (NODE_ENV !== "production") logs are pretty-printed for
 * readability; in production they are single-line JSON for log collectors.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Structured context attached to a log line. Values must be JSON-serializable. */
export type LogContext = Record<string, unknown>;

interface LogEntry {
  level: LogLevel;
  /** Logical subsystem, e.g. "activity", "workflow", "request". */
  scope: string;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const minLevel = resolveMinLevel();
const isProd = process.env.NODE_ENV === "production";

/** Normalize an unknown thrown value into a serializable error shape. */
function serializeError(err: unknown): LogEntry["error"] | undefined {
  if (err === undefined || err === null) return undefined;
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { name: "NonError", message: String(err) };
}

/**
 * Emit a log entry. Override / extend this to forward to an external sink
 * (PostHog, OTel, etc.) in a later observability step — every logger call
 * already funnels through here.
 */
function forward(entry: LogEntry): void {
  try {
    const stream = entry.level === "error" || entry.level === "warn"
      ? console.error
      : console.log;

    if (isProd) {
      stream(JSON.stringify(entry));
      return;
    }

    // Dev: human-readable, with the structured envelope appended when present.
    const prefix = `[${entry.scope}] ${entry.level.toUpperCase()}`;
    const extra: unknown[] = [];
    if (entry.context && Object.keys(entry.context).length > 0) {
      extra.push(entry.context);
    }
    if (entry.error) {
      extra.push(entry.error.stack ?? `${entry.error.name}: ${entry.error.message}`);
    }
    stream(`${prefix} ${entry.message}`, ...extra);
  } catch {
    // Logging must never throw.
  }
}

function emit(
  level: LogLevel,
  scope: string,
  message: string,
  context?: LogContext,
  err?: unknown
): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  forward({
    level,
    scope,
    message,
    timestamp: new Date().toISOString(),
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
    ...(serializeError(err) ? { error: serializeError(err) } : {}),
  });
}

export interface ScopedLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  /** Log an error. Pass the thrown value as `err` to capture name/stack. */
  error(message: string, err?: unknown, context?: LogContext): void;
  /** Derive a child logger with a sub-scope (e.g. "workflow:run"). */
  child(subScope: string): ScopedLogger;
}

/**
 * Create a logger bound to a subsystem scope.
 *
 * @example
 *   const log = createLogger("activity");
 *   log.error("Failed to emit", err, { type });
 */
export function createLogger(scope: string): ScopedLogger {
  return {
    debug: (message, context) => emit("debug", scope, message, context),
    info: (message, context) => emit("info", scope, message, context),
    warn: (message, context) => emit("warn", scope, message, context),
    error: (message, err, context) => emit("error", scope, message, context, err),
    child: (subScope) => createLogger(`${scope}:${subScope}`),
  };
}

/** Default app-wide logger. Prefer a scoped logger via `createLogger`. */
export const logger = createLogger("app");
