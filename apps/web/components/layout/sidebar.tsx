"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Bug,
  StickyNote,
  BarChart3,
  Bot,
  Settings,
  ClipboardList,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Inbox as InboxIcon,
  Star,
  Users,
  Workflow,
} from "lucide-react";
import { trpc } from "@/trpc/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@omnitool/ui/components/tooltip";
import { TeamSwitcher } from "./team-switcher";
import { useSidebar } from "./sidebar-context";
import { SidebarNoteTree } from "./sidebar-note-tree";
import { OmniToolLogo, OmniToolMark } from "@/components/icons/brand-icons";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "My Work", href: "/work", icon: ClipboardList },
    ],
  },
  {
    label: "Workspace",
    items: [
      { name: "Inbox", href: "/inbox", icon: InboxIcon },
      { name: "My Tasks", href: "/tasks", icon: CheckSquare },
      { name: "Projects", href: "/projects", icon: FolderKanban },
      { name: "Issues", href: "/issues", icon: Bug },
      { name: "Notes", href: "/notes", icon: StickyNote },
      { name: "AI Agents", href: "/agents", icon: Bot },
      { name: "Workflows", href: "/workflows", icon: Workflow },
      { name: "Performance", href: "/performance", icon: BarChart3 },
      { name: "Team Activity", href: "/team-activity", icon: Users },
    ],
  },
];

// Flat navigation array for backward-compat (mobile-drawer, mobile-nav imports)
export const navigation: NavItem[] = navSections.flatMap((s) => s.items);

export const bottomNav: NavItem[] = [
  { name: "Settings", href: "/settings", icon: Settings },
];

export function navigationActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/agents") {
    return pathname === "/agents" || pathname.startsWith("/agents/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Returns true on devices that support hover and have a fine pointer
 * (i.e. mouse). Disables hover-expand on touch devices where the gesture
 * would feel broken.
 */
function useCanHover(): boolean {
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setCanHover(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCanHover(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return canHover;
}

const HOVER_ENTER_DELAY_MS = 80;

/**
 * A single nav row that renders the same DOM in collapsed and expanded
 * modes — the label uses max-width + opacity transitions to slide in/out,
 * keeping the icon stable. Tooltip only fires when collapsed.
 */
function NavRow({
  item,
  isActive,
  collapsed,
  onNavigate,
  badge,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onNavigate: (href: string) => void;
  badge?: number | null;
}) {
  const showBadge = typeof badge === "number" && badge > 0;
  const link = (
    <Link
      href={item.href}
      prefetch={true}
      onClick={(e) => {
        e.preventDefault();
        onNavigate(item.href);
      }}
      className={cn(
        "group/navrow relative flex h-10 items-center overflow-hidden rounded-lg transition-all duration-300 ease-in-out",
        "active:scale-[0.98]",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        isActive
          ? "bg-accent text-accent-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
      )}
    >
      <span className="relative shrink-0">
        <item.icon className="h-[18px] w-[18px]" />
        {showBadge && collapsed ? (
          <span
            className="absolute -right-1 -top-1 inline-block h-2 w-2 rounded-full bg-primary ring-2 ring-background"
            aria-hidden
          />
        ) : null}
      </span>
      <span
        className={cn(
          "truncate text-sm font-medium transition-[max-width,opacity,margin] duration-300 ease-in-out",
          collapsed
            ? "pointer-events-none ml-0 max-w-0 opacity-0"
            : "ml-0 max-w-[180px] opacity-100",
        )}
      >
        {item.name}
      </span>
      {showBadge && !collapsed ? (
        <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.name}
      </TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { isCollapsed, setCollapsed } = useSidebar();

  const canHover = useCanHover();
  const [isHoverExpanded, setIsHoverExpanded] = useState(false);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset hover state on route change so we don't stay expanded after nav.
  useEffect(() => {
    setIsHoverExpanded(false);
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
  }, [pathname]);

  function handleMouseEnter() {
    if (!canHover || !isCollapsed) return;
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    enterTimerRef.current = setTimeout(() => {
      setIsHoverExpanded(true);
    }, HOVER_ENTER_DELAY_MS);
  }

  function handleMouseLeave() {
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    setIsHoverExpanded(false);
  }

  const showOverlay = isCollapsed && isHoverExpanded && canHover;
  // Effective collapsed state for inner content (overlay shows expanded layout
  // while keeping the outer rail width reserved).
  const collapsed = isCollapsed && !showOverlay;

  // Inbox unread count for the badge. Cheap query — keep stale long enough
  // that we don't refetch on every nav, but realtime invalidation will push
  // updates promptly when a new mention arrives.
  const inboxUnreadQuery = trpc.noteMention.unreadCount.useQuery(undefined, {
    staleTime: 30_000,
  });
  const inboxUnread = inboxUnreadQuery.data ?? 0;

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <aside
      className={cn(
        "group/sidebar relative hidden flex-col md:flex transition-[width] duration-300 ease-in-out",
        // Outer always reserves the rail/full width — overlay doesn't push content.
        isCollapsed ? "w-16" : "w-64",
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Inner panel: fills outer normally, becomes an absolute overlay when hovering the rail. */}
      <div
        className={cn(
          "flex h-full flex-col border-r bg-card transition-[width] duration-300 ease-in-out",
          showOverlay
            ? "absolute inset-y-0 left-0 z-30 w-64 shadow-xl"
            : "w-full",
        )}
      >
        {/* Floating edge collapse toggle — appears on sidebar hover */}
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(!isCollapsed)}
                className={cn(
                  "absolute -right-3 top-5 z-20",
                  "flex h-6 w-6 items-center justify-center rounded-full",
                  "border bg-background shadow-sm",
                  "text-muted-foreground",
                  "opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100",
                  "hover:border-foreground/20 hover:text-foreground hover:shadow-md",
                  "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronLeft className="h-3 w-3" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={12}>
              {isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* App branding row — single layout that animates between rail (icon-only)
            and expanded (icon + wordmark). Wordmark fades + width-collapses. */}
        <div className="flex h-14 shrink-0 items-center border-b">
          <Link
            href="/"
            aria-label="OmniTool home"
            className={cn(
              "flex h-14 w-full items-center overflow-hidden transition-[gap,padding] duration-300 ease-in-out hover:bg-accent/30",
              collapsed ? "justify-center px-0" : "gap-2.5 px-4",
            )}
          >
            {collapsed ? (
              <OmniToolMark className="h-6 w-6 shrink-0" />
            ) : (
              <OmniToolLogo className="h-7 w-7 shrink-0" />
            )}
            <span
              className={cn(
                "truncate text-sm font-bold tracking-tight transition-[max-width,opacity] duration-300 ease-in-out",
                collapsed
                  ? "pointer-events-none max-w-0 opacity-0"
                  : "max-w-[180px] opacity-100",
              )}
            >
              OmniTool
            </span>
          </Link>
        </div>

        {/* TeamSwitcher — collapses to height 0 with fade when in rail mode */}
        <div
          className={cn(
            "shrink-0 overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out",
            collapsed ? "max-h-0 opacity-0" : "max-h-20 opacity-100",
          )}
        >
          <TeamSwitcher />
        </div>

        <TooltipProvider delayDuration={0}>
          <nav
            className={cn(
              "flex-1 space-y-4 overflow-y-auto transition-[padding] duration-300 ease-in-out",
              collapsed ? "p-2" : "p-3",
            )}
          >
            {navSections.map((section) => (
              <div key={section.label}>
                {/* Section label — animates max-height + opacity, no DOM swap */}
                <p
                  className={cn(
                    "px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-[max-height,opacity,margin] duration-300 ease-in-out",
                    collapsed
                      ? "pointer-events-none mb-0 max-h-0 overflow-hidden opacity-0"
                      : "mb-1 max-h-6 opacity-100",
                  )}
                >
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavRow
                      key={item.name}
                      item={item}
                      isActive={navigationActive(pathname, item.href)}
                      collapsed={collapsed}
                      onNavigate={navigate}
                      badge={item.href === "/inbox" ? inboxUnread : undefined}
                    />
                  ))}
                </div>
                {section.label === "Workspace" && (
                  <>
                    <SidebarFavorites collapsed={collapsed} />
                    <div
                      className={cn(
                        "mt-1 overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out",
                        collapsed
                          ? "pointer-events-none max-h-0 opacity-0"
                          : "max-h-[40vh] opacity-100",
                      )}
                    >
                      <SidebarNoteTree collapsed={collapsed} />
                    </div>
                  </>
                )}
              </div>
            ))}
          </nav>

          <div
            className={cn(
              "shrink-0 space-y-0.5 border-t transition-[padding] duration-300 ease-in-out",
              collapsed ? "p-2" : "p-3",
            )}
          >
            {bottomNav.map((item) => (
              <NavRow
                key={item.name}
                item={item}
                isActive={pathname.startsWith(item.href)}
                collapsed={collapsed}
                onNavigate={navigate}
              />
            ))}
          </div>
        </TooltipProvider>
      </div>
    </aside>
  );
}

// ─── Favorites Section ─────────────────────────────────────

function SidebarFavorites({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { data: pinned } = trpc.note.listPinned.useQuery(undefined, {
    staleTime: 30_000,
  });

  if (collapsed || !pinned || pinned.length === 0) return null;

  return (
    <div
      className={cn(
        "mt-1 overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out",
        "max-h-[30vh] opacity-100",
      )}
    >
      <div className="space-y-1 px-1">
        <div className="flex items-center gap-1.5 px-2">
          <Star className="h-3 w-3 text-amber-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Favorites
          </span>
        </div>
        <ul className="space-y-0.5">
          {pinned.map((note) => {
            const isActive =
              pathname === `/notes/${note.id}`;
            return (
              <li key={note.id}>
                <Link
                  href={`/notes/${note.id}`}
                  prefetch={false}
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs",
                    isActive
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60",
                  )}
                  title={note.title || "Untitled"}
                >
                  {note.emoji ? (
                    <span className="shrink-0 text-xs leading-none" aria-hidden>
                      {note.emoji}
                    </span>
                  ) : (
                    <StickyNote className="h-3 w-3 shrink-0 opacity-60" />
                  )}
                  <span className="truncate">{note.title || "Untitled"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
