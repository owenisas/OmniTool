import { createHash } from "node:crypto";
import path from "node:path";
import {
  CODING_SESSION_SCAN_SOURCES,
  parseCodingSessionSourcesList,
  type CodingSessionSource,
  type ScanCodingSessionsOptions,
} from "@omnitool/coding-sessions";

const allowedSourceSet = new Set<string>(CODING_SESSION_SCAN_SOURCES);

export function codingSessionsScanProfileKey(options: ScanCodingSessionsOptions): string {
  const rootOverrides = options.rootOverrides;
  const normalizedRoots =
    rootOverrides &&
    Object.fromEntries(
      Object.entries(rootOverrides)
        .filter(([, v]) => Array.isArray(v) && v.some((p) => String(p).trim().length > 0))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [
          k,
          [...new Set(v!.map((p) => path.resolve(String(p))))].sort(),
        ])
    );
  const scanOnly = options.scanRootsOnly
    ?.map((p) => path.resolve(String(p).trim()))
    .filter((p) => p.length > 0);
  const payload = {
    sources: options.sources?.slice().sort() ?? null,
    rootOverrides:
      normalizedRoots && Object.keys(normalizedRoots).length > 0 ? normalizedRoots : null,
    scanRootsOnly: scanOnly?.length ? [...new Set(scanOnly)].sort() : null,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function parseRootOverridesFromEnv(): ScanCodingSessionsOptions["rootOverrides"] | undefined {
  const raw = process.env.CODING_SESSIONS_ROOT_OVERRIDES?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return undefined;
    const out: Partial<Record<CodingSessionSource, string[]>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!allowedSourceSet.has(key)) continue;
      if (!Array.isArray(value)) continue;
      const roots = value.map((v) => String(v)).filter((v) => v.trim().length > 0);
      if (roots.length > 0) out[key as CodingSessionSource] = roots;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

function parseScanPathsList(raw: string | undefined | null): string[] | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  const parts = String(raw)
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.length ? parts : undefined;
}

function parseScanPathsFromUrl(url: URL): string[] | undefined {
  const repeated = url.searchParams.getAll("paths").flatMap((segment) => segment.split(","));
  const parts = repeated.map((p) => p.trim()).filter((p) => p.length > 0);
  return parts.length ? parts : undefined;
}

export function resolveCodingSessionsScanOptionsFromEnv(): ScanCodingSessionsOptions {
  const sources = parseCodingSessionSourcesList(process.env.CODING_SESSIONS_SCAN_SOURCES);
  const rootOverrides = parseRootOverridesFromEnv();
  const scanRootsOnly =
    parseScanPathsList(process.env.CODING_SESSIONS_SCAN_PATHS) ??
    parseScanPathsList(process.env.CODING_SESSIONS_SCAN_ROOTS);

  return {
    cwd: process.cwd(),
    limitPerSource: 300,
    ...(sources?.length ? { sources } : {}),
    ...(rootOverrides && Object.keys(rootOverrides).length ? { rootOverrides } : {}),
    ...(scanRootsOnly?.length ? { scanRootsOnly } : {}),
  };
}

/** Query overrides: `sources`, `paths` / repeated `paths`, comma-separated. */
export function resolveCodingSessionsScanOptionsFromUrl(url: URL): ScanCodingSessionsOptions {
  const base = resolveCodingSessionsScanOptionsFromEnv();
  const sourcesFromQuery = parseCodingSessionSourcesList(url.searchParams.get("sources"));
  const pathsFromQuery = parseScanPathsFromUrl(url);

  return {
    ...base,
    ...(sourcesFromQuery?.length ? { sources: sourcesFromQuery } : {}),
    ...(pathsFromQuery?.length ? { scanRootsOnly: pathsFromQuery } : {}),
    ...(pathsFromQuery?.length ? { rootOverrides: undefined } : {}),
  };
}
