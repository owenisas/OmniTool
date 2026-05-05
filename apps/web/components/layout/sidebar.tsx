"use client";

import { useTransition } from "react";
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
  UserCircle,
  ClipboardList,
  CheckSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@omnitool/ui/components/tooltip";
import { TeamSwitcher } from "./team-switcher";
import { useSidebar } from "./sidebar-context";
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
      { name: "My Tasks", href: "/tasks", icon: CheckSquare },
      { name: "Projects", href: "/projects", icon: FolderKanban },
      { name: "Issues", href: "/issues", icon: Bug },
      { name: "Notes", href: "/notes", icon: StickyNote },
    ],
  },
  {
    label: "Insights",
    items: [
      { name: "Performance", href: "/performance", icon: BarChart3 },
      { name: "Team Activity", href: "/team-activity", icon: Users },
    ],
  },
  {
    label: "AI",
    items: [
      { name: "AI Agents", href: "/agents", icon: Bot },
    ],
  },
];

// Flat navigation array for backward-compat (mobile-drawer, mobile-nav imports)
export const navigation: NavItem[] = navSections.flatMap((s) => s.items);

export const bottomNav: NavItem[] = [
  { name: "Profile", href: "/profile", icon: UserCircle },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function navigationActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/agents") {
    return pathname === "/agents" || pathname.startsWith("/agents/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { isCollapsed, setCollapsed } = useSidebar();

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <aside
      className={cn(
        "hidden flex-col border-r bg-card transition-[width] duration-200 md:flex",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* App branding + team switcher */}
      {!isCollapsed ? (
        <div className="flex flex-col">
          {/* App logo bar */}
          <div className="flex h-14 items-center gap-2.5 border-b px-4">
            <OmniToolLogo className="h-7 w-7 shrink-0" />
            <span className="text-sm font-bold tracking-tight">OmniTool</span>
          </div>
          {/* Team switcher below logo */}
          <TeamSwitcher />
        </div>
      ) : (
        <div className="flex flex-col items-center">
          {/* Collapsed: app icon */}
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/"
                  className="flex h-14 w-full items-center justify-center border-b transition-colors hover:bg-accent/50"
                >
                  <OmniToolMark className="h-6 w-6" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                OmniTool
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      <TooltipProvider delayDuration={0}>
        <nav
          className={cn(
            "flex-1 overflow-y-auto",
            isCollapsed ? "p-2 space-y-1" : "p-3 space-y-4"
          )}
        >
          {navSections.map((section) => (
            <div key={section.label}>
              {/* Section label (only when expanded) */}
              {!isCollapsed && (
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = navigationActive(pathname, item.href);

                  if (isCollapsed) {
                    return (
                      <Tooltip key={item.name}>
                        <TooltipTrigger asChild>
                          <Link
                            href={item.href}
                            prefetch={true}
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(item.href);
                            }}
                            className={cn(
                              "flex h-10 w-full items-center justify-center rounded-lg transition-all duration-150",
                              "active:scale-95",
                              isActive
                                ? "bg-accent text-accent-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80"
                            )}
                          >
                            <item.icon className="h-[18px] w-[18px]" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8}>
                          {item.name}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      prefetch={true}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(item.href);
                      }}
                      className={cn(
                        "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-150",
                        "active:scale-[0.98]",
                        isActive
                          ? "bg-accent text-accent-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={cn(
            "border-t space-y-0.5",
            isCollapsed ? "p-2" : "p-3"
          )}
        >
          {bottomNav.map((item) => {
            const isActive = pathname.startsWith(item.href);

            if (isCollapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      prefetch={true}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(item.href);
                      }}
                      className={cn(
                        "flex h-10 w-full items-center justify-center rounded-lg transition-all duration-150",
                        "active:scale-95",
                        isActive
                          ? "bg-accent text-accent-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80"
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px]" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.name}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={true}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(item.href);
                }}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-150",
                  "active:scale-[0.98]",
                  isActive
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}

          {/* Collapse toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(!isCollapsed)}
                className={cn(
                  "flex w-full items-center rounded-lg text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-accent-foreground active:scale-[0.98] active:bg-accent/80",
                  isCollapsed
                    ? "h-10 justify-center"
                    : "h-9 gap-3 px-3"
                )}
              >
                {isCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <>
                    <PanelLeftClose className="h-4 w-4 shrink-0" />
                    <span>Collapse</span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Expand sidebar
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </TooltipProvider>
    </aside>
  );
}
