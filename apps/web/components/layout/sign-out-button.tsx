"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@omnitool/ui/components/tooltip";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Variant = "rail" | "expanded" | "drawer";

export function SignOutButton({ variant }: { variant: Variant }) {
  const [busy, setBusy] = useState(false);

  async function handle() {
    if (busy) return;
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // Mobile drawer keeps its own taller layout (no animation needed — drawer is
  // always expanded).
  if (variant === "drawer") {
    return (
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className={cn(
          "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-150",
          "active:scale-[0.98] text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <LogOut className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate">{busy ? "Signing out…" : "Sign out"}</span>
      </button>
    );
  }

  // Rail + expanded share a single render path that animates between the two
  // states (matches NavRow). Tooltip only fires when collapsed.
  const collapsed = variant === "rail";

  const button = (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      aria-label={collapsed ? "Sign out" : undefined}
      className={cn(
        "flex h-10 w-full items-center overflow-hidden rounded-lg transition-all duration-300 ease-in-out",
        "active:scale-[0.98] text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
      )}
    >
      <LogOut className="h-[18px] w-[18px] shrink-0" />
      <span
        className={cn(
          "truncate text-sm font-medium transition-[max-width,opacity] duration-300 ease-in-out",
          collapsed
            ? "pointer-events-none max-w-0 opacity-0"
            : "max-w-[180px] opacity-100",
        )}
      >
        {busy ? "Signing out…" : "Sign out"}
      </span>
    </button>
  );

  if (!collapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        Sign out
      </TooltipContent>
    </Tooltip>
  );
}
