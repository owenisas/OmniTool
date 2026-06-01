/**
 * OpenTelemetry registration for the Next.js server / sidecar runtime.
 *
 * This is the single insertion point for distributed tracing. It is invoked
 * once from `instrumentation.ts` `register()` (Node.js runtime only — see the
 * `NEXT_RUNTIME` guard there). It wires:
 *
 *   - `@vercel/otel` `registerOTel` — emits spans for routes, RSC requests,
 *     `fetch`, and middleware out of the box, vendor-neutral.
 *   - Prisma's `PrismaInstrumentation` — passed into `registerOTel`'s
 *     `instrumentations` array so DB queries appear as child spans under the
 *     request trace. Requires `previewFeatures = ["tracing"]` on the Prisma
 *     `generator client` block (set in `packages/database/prisma/schema.prisma`).
 *   - The per-procedure tRPC span middleware (`tracedProcedure` in
 *     `apps/web/trpc/init.ts`) reads the active tracer registered here.
 *
 * Design goals (match the structured logger's posture):
 * - Additive + no-op-safe: if the OTel deps aren't installed yet, or the SDK
 *   throws during init, we log and continue — tracing must never break the app.
 *   (Deps are installed centrally; until then this is a soft no-op.)
 * - No exporter is configured here. `@vercel/otel` auto-detects a Vercel /
 *   OTLP collector from the standard `OTEL_EXPORTER_*` env vars; with none set
 *   it is effectively inert. A later step (PostHog / OTLP backend) plugs in via
 *   env, not code.
 *
 * @see https://nextjs.org/docs/app/guides/open-telemetry
 * @see https://www.prisma.io/docs/orm/prisma-client/observability-and-logging/opentelemetry-tracing
 */

import { createLogger } from "./logger";

const log = createLogger("otel");

/**
 * Service name reported on every span. Kept stable so traces from the hosted
 * Vercel deployment and the desktop sidecar are attributed to the same service.
 */
const SERVICE_NAME = "omnitool-web";

/**
 * Register OpenTelemetry. Safe to call once at server boot. Swallows missing
 * deps / init errors so observability wiring can never take down the runtime.
 */
export async function registerObservabilityOTel(): Promise<void> {
  try {
    // Dynamic imports: keep these out of the module graph for the edge runtime
    // and tolerate the deps not being installed yet (central install happens
    // afterward). A failed import is a soft no-op, logged at warn level.
    const [{ registerOTel }, { PrismaInstrumentation }] = await Promise.all([
      import("@vercel/otel"),
      import("@prisma/instrumentation"),
    ]);

    registerOTel({
      serviceName: SERVICE_NAME,
      // Prisma DB spans nest under the request/procedure spans. `@vercel/otel`
      // keeps its built-in fetch/route instrumentation and merges these in.
      instrumentations: [new PrismaInstrumentation()],
    });

    log.info("OpenTelemetry registered", { serviceName: SERVICE_NAME });
  } catch (err) {
    // Most commonly: deps not yet installed. Never throw from boot.
    log.warn("OpenTelemetry registration skipped (deps unavailable)", {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
