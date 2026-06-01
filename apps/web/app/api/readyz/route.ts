/**
 * `/api/readyz` — k8s-conventional readiness alias.
 *
 * Readiness = "can the process serve traffic?" including the DB `SELECT 1`
 * downstream check (returns 503 when the database is unreachable). This is a
 * thin alias that delegates to the existing `/api/health` handler so there is
 * exactly one implementation of the readiness logic (no copy-paste drift). The
 * conventional `/readyz` name exists for standard tooling / load balancers.
 *
 * @see ../health/route.ts
 */
export { GET, dynamic } from "../health/route";
