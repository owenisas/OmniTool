"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface RecentCapture {
  noteId: string;
  noteTitle: string;
  sectionTitle: string;
  lowConfidence: boolean;
}

interface RecentCapturesValue {
  recents: RecentCapture[];
  pushRecent: (c: RecentCapture) => void;
}

const RecentCapturesContext = createContext<RecentCapturesValue | null>(null);

const MAX_RECENTS = 8;

/**
 * Lifts the "recent captures" list so the quick-capture box, the global
 * capture dialog, and the recent-captures list all share one in-memory log
 * (last ~8). Intentionally NOT persisted — it's a session affordance, the
 * canonical record is the note itself.
 */
export function RecentCapturesProvider({ children }: { children: ReactNode }) {
  const [recents, setRecents] = useState<RecentCapture[]>([]);

  const pushRecent = useCallback((c: RecentCapture) => {
    setRecents((prev) => {
      const deduped = prev.filter((r) => r.noteId !== c.noteId);
      return [c, ...deduped].slice(0, MAX_RECENTS);
    });
  }, []);

  const value = useMemo(() => ({ recents, pushRecent }), [recents, pushRecent]);

  return (
    <RecentCapturesContext.Provider value={value}>
      {children}
    </RecentCapturesContext.Provider>
  );
}

/**
 * Read the recent-captures log. Falls back to a no-op store when no provider
 * is mounted (e.g. the global capture dialog firing from a route that doesn't
 * render the recents list) so callers never need to null-check.
 */
export function useRecentCaptures(): RecentCapturesValue {
  const ctx = useContext(RecentCapturesContext);
  // Local fallback store so the hook is always safe to call. The captured
  // closure is stable per render; callers that need a shared list must mount
  // the provider.
  const fallback = useFallbackStore(ctx === null);
  return ctx ?? fallback;
}

function useFallbackStore(enabled: boolean): RecentCapturesValue {
  const [recents, setRecents] = useState<RecentCapture[]>([]);
  const pushRecent = useCallback((c: RecentCapture) => {
    if (!enabled) return;
    setRecents((prev) =>
      [c, ...prev.filter((r) => r.noteId !== c.noteId)].slice(0, MAX_RECENTS),
    );
  }, [enabled]);
  return useMemo(() => ({ recents, pushRecent }), [recents, pushRecent]);
}
