"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface SidebarContextValue {
  /** Whether the mobile drawer is open */
  isOpen: boolean;
  /** Whether the sidebar is collapsed to an icon rail (tablet) */
  isCollapsed: boolean;
  /** Toggle mobile drawer open/closed */
  toggle: () => void;
  /** Open mobile drawer */
  open: () => void;
  /** Close mobile drawer */
  close: () => void;
  /** Set collapsed state (persists to localStorage) */
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const COLLAPSED_STORAGE_KEY = "omnitool-sidebar-collapsed";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsedState] = useState(false);

  // Read persisted collapsed state on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (stored === "true") {
        setIsCollapsedState(true);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsedState(collapsed);
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      // localStorage unavailable
    }
  }, []);

  return (
    <SidebarContext.Provider
      value={{ isOpen, isCollapsed, toggle, open, close, setCollapsed }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return ctx;
}
