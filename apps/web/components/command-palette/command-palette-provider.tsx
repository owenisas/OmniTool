"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CommandPalette } from "./command-palette";

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
);

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be inside CommandPaletteProvider");
  }
  return ctx;
}

/**
 * Mounts the global command palette and its Cmd/Ctrl+K shortcut.
 *
 * Selection in "embed mode" (Cmd+Shift+Enter) dispatches an
 * `omnitool:insert-embed` event with `kind: "noteEmbed"` and the note id, so
 * the active note editor can insert the block. This piggybacks on the
 * existing embed-picker bridge.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const setOpen = useCallback((next: boolean) => setOpenState(next), []);
  const toggle = useCallback(() => setOpenState((p) => !p), []);
  const lastOpenedRef = useRef(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isToggle =
        (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey);
      if (!isToggle) return;
      // Avoid firing when user is in a contenteditable / textarea / input
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable) &&
        // …unless they're already in an open dialog with our palette
        !target.closest("[role='dialog'][data-cmdk-root]")
      ) {
        // Allow Cmd+K from anywhere — even inputs.
      }
      e.preventDefault();
      // Debounce repeated key events.
      const now = Date.now();
      if (now - lastOpenedRef.current < 150) return;
      lastOpenedRef.current = now;
      toggle();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen, toggle }}>
      {children}
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        onSelectEmbedNote={(noteId, title) => {
          window.dispatchEvent(
            new CustomEvent("omnitool:insert-embed", {
              detail: {
                kind: "noteEmbed",
                props: { noteId, title },
              },
            }),
          );
        }}
      />
    </CommandPaletteContext.Provider>
  );
}
