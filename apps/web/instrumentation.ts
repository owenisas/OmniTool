/**
 * Next.js instrumentation file.
 *
 * `register()` runs once when the server (or sidecar) process boots, and
 * `onRequestError` is Next.js 15's native hook for *every* uncaught
 * server-side error (App Router server components, route handlers, server
 * actions, middleware). It is the single consolidation point for server
 * error observability — previously these errors were handled ad-hoc per
 * route or swallowed to `console.error`.
 *
 * This implementation is purely additive: it forwards through the structured
 * logger (`lib/observability/logger.ts`) and, in the Node.js runtime, registers
 * OpenTelemetry (`lib/observability/otel.ts`) for distributed tracing. Both are
 * no-op-safe — a later observability step (PostHog forwarding, an OTLP backend)
 * plugs in here without touching any call sites.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 * @see https://nextjs.org/docs/app/guides/open-telemetry
 */

import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  const { logger } = await import("./lib/observability/logger");
  logger.info("Server instrumentation registered", {
    runtime: process.env.NEXT_RUNTIME ?? "unknown",
    nodeEnv: process.env.NODE_ENV ?? "unknown",
  });

  // OpenTelemetry (and Prisma's instrumentation) rely on Node.js APIs
  // (AsyncLocalStorage, native instrumentation hooks) that aren't available in
  // the edge runtime. Only register in the Node.js server / sidecar runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerObservabilityOTel } = await import(
      "./lib/observability/otel"
    );
    await registerObservabilityOTel();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  // Edge runtime cannot pull in the Node logger transitively — keep this
  // hook resilient by falling back to console if the import fails.
  try {
    const { createLogger } = await import("./lib/observability/logger");
    const log = createLogger("request");
    log.error("Unhandled server request error", err, {
      path: request.path,
      method: request.method,
      // `routerKind` / `routePath` / `routeType` describe where the error
      // originated (App Router vs Pages, the matched route, render phase).
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    });
  } catch (loggerErr) {
    console.error("[request] Unhandled server request error", err);
    console.error("[instrumentation] logger unavailable", loggerErr);
  }
};
