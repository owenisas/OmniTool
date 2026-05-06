"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

/**
 * Map raw URL segments to friendlier labels. Unknown segments fall back to
 * a Title-Cased version of the segment with dashes/underscores converted to
 * spaces. Dynamic IDs (cuid/uuid-shaped) render as a short hash placeholder
 * unless we can resolve them (currently only `/notes/[id]`).
 */
const LABELS: Record<string, string> = {
  "": "Dashboard",
  work: "My Work",
  tasks: "Tasks",
  projects: "Projects",
  issues: "Issues",
  notes: "Notes",
  trash: "Trash",
  history: "History",
  inbox: "Inbox",
  performance: "Performance",
  "team-activity": "Team Activity",
  agents: "AI Agents",
  alerts: "Alerts",
  chat: "Chat",
  insights: "Insights",
  sessions: "Sessions",
  triage: "Triage",
  profile: "Profile",
  settings: "Settings",
  about: "About",
  appearance: "Appearance",
  "coding-sessions": "Coding Sessions",
  integrations: "Integrations",
  notifications: "Notifications",
  security: "Security",
  team: "Team",
  new: "New",
};

function looksLikeId(segment: string): boolean {
  return /^[a-z0-9]{16,}$/i.test(segment) || /^c[a-z0-9]{20,}$/i.test(segment);
}

function prettify(segment: string): string {
  if (segment in LABELS) return LABELS[segment]!;
  if (looksLikeId(segment)) return `#${segment.slice(0, 6)}`;
  return segment
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Detect /notes/[id] — fetch ancestor chain so we can render real titles
  // for the deep route. Skip when the id segment is "new" or "trash".
  const isNoteRoute =
    segments[0] === "notes" &&
    segments.length >= 2 &&
    looksLikeId(segments[1]!);

  const noteId = isNoteRoute ? segments[1] : null;
  const ancestorQuery = trpc.note.getAncestorChain.useQuery(
    { noteId: noteId ?? "" },
    { enabled: Boolean(noteId), staleTime: 30_000 },
  );
  const teamspaceQuery = trpc.note.getTeamspaceForNote.useQuery(
    { noteId: noteId ?? "" },
    { enabled: Boolean(noteId), staleTime: 60_000 },
  );
  const titleById = new Map<string, string>();
  for (const a of ancestorQuery.data ?? []) {
    titleById.set(a.id, a.title || "Untitled");
  }

  const crumbs: { label: string; href: string }[] = [
    { label: "Dashboard", href: "/" },
  ];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!;
    const href = "/" + segments.slice(0, i + 1).join("/");

    if (isNoteRoute && i === 0) {
      // "Notes" crumb itself.
      crumbs.push({ label: "Notes", href });
      // Append the teamspace name immediately after Notes so a glance shows
      // which teamspace the user is in.
      const ts = teamspaceQuery.data;
      if (ts) {
        crumbs.push({
          label: ts.kind === "PERSONAL" ? `${ts.name} (Personal)` : ts.name,
          href: "/notes",
        });
      }
      continue;
    }

    if (isNoteRoute && i === 1) {
      // Inject the ancestor chain (excluding the leaf, which is appended below).
      const chain = ancestorQuery.data ?? [];
      for (let j = 0; j < chain.length - 1; j += 1) {
        const a = chain[j]!;
        crumbs.push({
          label: a.title || "Untitled",
          href: `/notes/${a.id}`,
        });
      }
      const leaf = chain[chain.length - 1];
      crumbs.push({
        label: leaf?.title || (titleById.get(seg) ?? prettify(seg)),
        href,
      });
      continue;
    }

    crumbs.push({ label: prettify(seg), href });
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1 text-sm"
    >
      <ol className="flex min-w-0 items-center gap-1">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li
              key={`${c.href}-${i}`}
              className="flex min-w-0 items-center gap-1"
            >
              {i > 0 && (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                  aria-hidden
                />
              )}
              {isLast ? (
                <span
                  className="truncate font-medium text-foreground"
                  aria-current="page"
                >
                  {c.label}
                </span>
              ) : (
                <Link
                  href={c.href}
                  className={cn(
                    "truncate text-muted-foreground transition-colors hover:text-foreground",
                  )}
                >
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
