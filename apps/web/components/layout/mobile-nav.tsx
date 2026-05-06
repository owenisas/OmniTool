"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Inbox as InboxIcon,
  CheckSquare,
  Bug,
  StickyNote,
  Menu,
} from "lucide-react";
import { trpc } from "@/trpc/client";
import { navigationActive } from "./sidebar";
import { useSidebar } from "./sidebar-context";

const tabs = [
  { name: "Inbox", href: "/inbox", icon: InboxIcon },
  { name: "Tasks", href: "/tasks", icon: CheckSquare },
  { name: "Issues", href: "/issues", icon: Bug },
  { name: "Notes", href: "/notes", icon: StickyNote },
] as const;

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { open } = useSidebar();

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
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t bg-card/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      role="navigation"
      aria-label="Mobile navigation"
    >
      {tabs.map((tab) => {
        const isActive = navigationActive(pathname, tab.href);
        return (
          <Link
            key={tab.name}
            href={tab.href}
            prefetch={true}
            onClick={(e) => {
              e.preventDefault();
              navigate(tab.href);
            }}
            className={cn(
              "relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-all duration-150",
              "active:scale-95 active:opacity-70",
              isActive
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            {/* Active indicator dot */}
            {isActive && (
              <span className="absolute top-1 h-1 w-1 rounded-full bg-primary" />
            )}
            {/* Inbox unread badge */}
            {tab.href === "/inbox" && inboxUnread > 0 && (
              <span className="absolute right-1/4 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
            )}
            <tab.icon
              className={cn(
                "h-5 w-5 transition-transform duration-150",
                isActive && "scale-110"
              )}
            />
            <span>{tab.name}</span>
          </Link>
        );
      })}

      {/* More button opens the full navigation drawer */}
      <button
        type="button"
        onClick={open}
        className={cn(
          "relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-all duration-150",
          "active:scale-95 active:opacity-70"
        )}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
        <span>More</span>
      </button>
    </nav>
  );
}
