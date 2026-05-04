import type { CodingSessionSource } from "@omnitool/coding-sessions";

export interface CodingSessionsScanPayload {
  scannedAt: string;
  totalSessions: number;
  sourceCounts: Record<string, number>;
  cached?: boolean;
  sourcesFilter?: CodingSessionSource[] | null;
  customRootSources?: string[] | null;
  scanRootsOnly?: string[] | null;
}

const DEFAULT_CACHE_MS = 15 * 60 * 1000;

function cacheMs(): number {
  const raw = process.env.CODING_SESSIONS_SCAN_CACHE_MS;
  if (!raw) return DEFAULT_CACHE_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CACHE_MS;
}

let entry: { expiresAt: number; profileKey: string; payload: CodingSessionsScanPayload } | null = null;

export function getCodingSessionsScanCache(profileKey: string): CodingSessionsScanPayload | null {
  if (!entry || entry.profileKey !== profileKey || entry.expiresAt <= Date.now()) return null;
  return entry.payload;
}

export function setCodingSessionsScanCache(profileKey: string, payload: CodingSessionsScanPayload): void {
  entry = { expiresAt: Date.now() + cacheMs(), profileKey, payload };
}

export function clearCodingSessionsScanCache(): void {
  entry = null;
}
