/**
 * `/api/livez` — k8s-conventional liveness alias.
 *
 * Liveness = "is the process up?" with no downstream dependency check. This is
 * a thin alias that delegates to the existing `/api/ready` handler so there is
 * exactly one implementation of the liveness logic (no copy-paste drift). The
 * conventional `/livez` name exists for standard tooling / load balancers.
 *
 * @see ../ready/route.ts
 */
export { GET, dynamic } from "../ready/route";
