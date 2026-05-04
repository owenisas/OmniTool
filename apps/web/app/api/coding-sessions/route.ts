import { auth } from "@/lib/auth";
import {
  getCodingSessionsScanCache,
  setCodingSessionsScanCache,
} from "@/lib/coding-sessions-scan-cache";
import {
  codingSessionsScanProfileKey,
  resolveCodingSessionsScanOptionsFromUrl,
} from "@/lib/coding-sessions-scan-options";
import { scanCodingSessions } from "@omnitool/coding-sessions";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const forceRefresh =
    url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";

  const scanOptions = resolveCodingSessionsScanOptionsFromUrl(url);
  const profileKey = codingSessionsScanProfileKey(scanOptions);

  try {
    if (!forceRefresh) {
      const cached = getCodingSessionsScanCache(profileKey);
      if (cached) {
        return NextResponse.json({
          ...cached,
          cached: true,
        });
      }
    }

    const sessions = await scanCodingSessions(scanOptions);

    const sourceCounts = sessions.reduce<Record<string, number>>((acc, item) => {
      acc[item.source] = (acc[item.source] ?? 0) + 1;
      return acc;
    }, {});

    const scanRootsOnlyResolved = scanOptions.scanRootsOnly?.length
      ? [...new Set(scanOptions.scanRootsOnly.map((p) => path.resolve(p)))].sort()
      : null;

    const payload = {
      scannedAt: new Date().toISOString(),
      totalSessions: sessions.length,
      sourceCounts,
      sourcesFilter: scanOptions.sources ?? null,
      customRootSources:
        scanOptions.rootOverrides && Object.keys(scanOptions.rootOverrides).length > 0
          ? Object.keys(scanOptions.rootOverrides)
          : null,
      scanRootsOnly: scanRootsOnlyResolved,
    };

    setCodingSessionsScanCache(profileKey, payload);

    return NextResponse.json({
      ...payload,
      cached: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to scan coding sessions",
      },
      { status: 500 }
    );
  }
}
