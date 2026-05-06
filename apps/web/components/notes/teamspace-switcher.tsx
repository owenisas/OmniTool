"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@omnitool/ui/components/popover";
import { Button } from "@omnitool/ui/components/button";
import {
  Check,
  ChevronsUpDown,
  Globe,
  Settings,
  User as UserIcon,
  Users,
} from "lucide-react";
import { trpc } from "@/trpc/client";
import { cn } from "@/lib/utils";

interface TeamspaceSwitcherProps {
  /** `null` = "All teamspaces" lens. Otherwise the active teamspace id. */
  value: string | null;
  onChange: (next: string | null) => void;
  /** Disables interaction during a parent mutation. */
  disabled?: boolean;
}

/**
 * Popover-style switcher for the user's teamspaces. Shows the user's
 * personal teamspace first, then their team teamspaces. The "All
 * teamspaces" entry sets the lens to `null` so the notes page renders
 * notes from every teamspace at once.
 *
 * Modeled on the existing `TeamSwitcher` (`apps/web/components/layout/team-switcher.tsx`)
 * but specific to the notes page — the global active-team cookie is left alone.
 */
export function TeamspaceSwitcher({
  value,
  onChange,
  disabled,
}: TeamspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const { data: teamspaces, isLoading } = trpc.team.listMyTeamspaces.useQuery();

  const active = value
    ? (teamspaces ?? []).find((t) => t.id === value) ?? null
    : null;

  const personal = (teamspaces ?? []).filter((t) => t.kind === "PERSONAL");
  const teams = (teamspaces ?? []).filter((t) => t.kind === "TEAM");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || isLoading}
          className="h-8 w-full justify-between gap-2 px-2 text-left"
          aria-label="Switch teamspace"
        >
          <span className="flex min-w-0 items-center gap-2">
            {value === null ? (
              <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : active?.kind === "PERSONAL" ? (
              <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-sm font-semibold">
              {value === null
                ? "All teamspaces"
                : active?.name ?? "Teamspace"}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/60",
            value === null && "bg-accent/40",
          )}
        >
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1 text-left">All teamspaces</span>
          {value === null && <Check className="h-3.5 w-3.5" />}
        </button>

        {personal.length > 0 && (
          <>
            <div className="mt-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Personal
            </div>
            {personal.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/60",
                  value === t.id && "bg-accent/40",
                )}
              >
                <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate text-left">{t.name}</span>
                {value === t.id && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </>
        )}

        {teams.length > 0 && (
          <>
            <div className="mt-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Teams
            </div>
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent/60",
                  value === t.id && "bg-accent/40",
                )}
              >
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 truncate text-left">{t.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {t.role.toLowerCase()}
                </span>
                {value === t.id && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </>
        )}

        <div className="mt-1 border-t pt-1">
          <Link
            href="/settings/team"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <Settings className="h-3 w-3" />
            Manage teams
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
