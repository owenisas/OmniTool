"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Bug,
  StickyNote,
  BarChart3,
  Bot,
  History,
  Settings,
  UserCircle,
  ClipboardList,
  CheckSquare,
} from "lucide-react";
import { TeamSwitcher } from "./team-switcher";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "My Work", href: "/work", icon: ClipboardList },
  { name: "My Tasks", href: "/tasks", icon: CheckSquare },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Issues", href: "/issues", icon: Bug },
  { name: "Notes", href: "/notes", icon: StickyNote },
  { name: "Performance", href: "/performance", icon: BarChart3 },
  { name: "AI Agents", href: "/agents", icon: Bot },
  { name: "Coding Sessions", href: "/agents/sessions", icon: History },
];

const bottomNav = [
  { name: "Profile", href: "/profile", icon: UserCircle },
  { name: "Settings", href: "/settings", icon: Settings },
];

function navigationActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/agents/sessions") {
    return (
      pathname === "/agents/sessions" ||
      pathname.startsWith("/agents/sessions/")
    );
  }
  if (href === "/agents") {
    if (pathname.startsWith("/agents/sessions")) return false;
    return pathname === "/agents" || pathname.startsWith("/agents/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col border-r bg-card">
      <TeamSwitcher />

      <nav className="flex-1 space-y-1 p-3">
        {navigation.map((item) => {
          const isActive = navigationActive(pathname, item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3 space-y-1">
        {bottomNav.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
