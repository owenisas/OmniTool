"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@omnitool/ui/components/sheet";
import { navigation, bottomNav, navigationActive } from "./sidebar";
import { TeamSwitcher } from "./team-switcher";
import { useSidebar } from "./sidebar-context";
import { SidebarNoteTree } from "./sidebar-note-tree";
import { OmniToolLogo } from "@/components/icons/brand-icons";

export function MobileDrawer() {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();

  // Close drawer on route change
  useEffect(() => {
    close();
  }, [pathname, close]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>

        {/* App branding */}
        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <OmniToolLogo className="h-7 w-7 shrink-0" />
          <span className="text-sm font-bold tracking-tight">OmniTool</span>
        </div>

        {/* Team switcher */}
        <TeamSwitcher />

        {/* Main navigation */}
        <nav
          className="flex-1 space-y-0.5 overflow-y-auto p-3"
          aria-label="Main navigation"
        >
          {navigation.map((item) => {
            const isActive = navigationActive(pathname, item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-150",
                  "active:scale-[0.98] active:bg-accent/80",
                  isActive
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
          <div className="pt-3">
            <SidebarNoteTree onAfterNavigate={close} />
          </div>
        </nav>

        {/* Bottom navigation */}
        <div className="border-t p-3 space-y-0.5">
          {bottomNav.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-150",
                  "active:scale-[0.98] active:bg-accent/80",
                  isActive
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
