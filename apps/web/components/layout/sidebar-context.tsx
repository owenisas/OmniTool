"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SidebarContextValue {
  /** Whether the mobile drawer is open */
  isOpen: boolean;
  /** Whether the sidebar is collapsed to an icon rail. Combines auto-rule + user override. */
  isCollapsed: boolean;
  /** Toggle mobile drawer open/closed */
  toggle: () => void;
  /** Open mobile drawer */
  open: () => void;
  /** Close mobile drawer */
  close: () => void;
  /**
   * Manually set collapsed state. Acts as a temporary override:
   * persists until the next pathname change, then auto-rule resumes.
   */
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

/**
 * Returns true if the given pathname should auto-collapse the sidebar
 * (focus mode). Currently triggers on note detail pages so the BlockNote
 * editor and floating AI chat have maximum horizontal space.
 *
 * Extend the regex to add more focus routes (e.g. `/agents/chat`, `/work`).
 */
function shouldAutoCollapse(pathname: string): boolean {
  return /^\/notes(\/.*)?$/.test(pathname);
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  // null = no override, use auto-rule. true/false = pin until next route change.
  const [userOverride, setUserOverride] = useState<boolean | null>(null);

  // Clear the manual override whenever the route changes — auto-rule wins
  // on the next page so the sidebar matches the new context.
  useEffect(() => {
    setUserOverride(null);
  }, [pathname]);

  const isCollapsed = useMemo(() => {
    if (userOverride !== null) return userOverride;
    return shouldAutoCollapse(pathname);
  }, [pathname, userOverride]);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setUserOverride(collapsed);
  }, []);

  const value = useMemo<SidebarContextValue>(
    () => ({ isOpen, isCollapsed, toggle, open, close, setCollapsed }),
    [isOpen, isCollapsed, toggle, open, close, setCollapsed],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return ctx;
}
