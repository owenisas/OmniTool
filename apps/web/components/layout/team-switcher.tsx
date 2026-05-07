"use client";

import { useState } from "react";
import { useTeam } from "@/components/providers/team-provider";
import { CreateTeamDialog } from "./create-team-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@omnitool/ui/components/popover";
import { Separator } from "@omnitool/ui/components/separator";
import { cn } from "@/lib/utils";
import { ChevronsUpDown, Check, Plus } from "lucide-react";
import { GitHubIcon } from "@/components/icons/brand-icons";

// Stable color per team name
const teamColors = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-violet-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-indigo-600",
  "bg-pink-600",
];

function getTeamColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return teamColors[Math.abs(hash) % teamColors.length];
}

function TeamAvatar({
  team,
  size,
}: {
  team: { name: string; avatarUrl: string | null };
  size: "sm" | "md";
}) {
  const dim = size === "md" ? "h-7 w-7 text-xs" : "h-6 w-6 text-[10px]";
  if (team.avatarUrl) {
    return (
      <img
        src={team.avatarUrl}
        alt=""
        className={cn("rounded-md object-cover shrink-0 bg-muted", dim)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md text-white font-bold shrink-0",
        getTeamColor(team.name),
        dim,
      )}
    >
      {team.name.charAt(0).toUpperCase()}
    </div>
  );
}

export function TeamSwitcher() {
  const { activeTeam, teams, switchTeam, isLoading } = useTeam();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  if (isLoading || !activeTeam) {
    return (
      <div className="flex h-12 items-center px-4">
        <div className="h-7 w-7 animate-pulse rounded-md bg-muted" />
        <div className="ml-2 h-4 w-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex h-12 w-full items-center gap-2 px-4 text-left hover:bg-accent/50 transition-colors">
            <TeamAvatar team={activeTeam} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {activeTeam.name}
              </p>
            </div>
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-64 p-1"
          align="start"
          side="right"
          sideOffset={4}
        >
          <div className="px-2 py-1.5">
            <p className="text-xs font-medium text-muted-foreground">Teams</p>
          </div>

          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => {
                switchTeam(team.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
                team.id === activeTeam.id && "bg-accent"
              )}
            >
              <TeamAvatar team={team} size="sm" />
              <span className="flex-1 truncate text-left">{team.name}</span>
              {team.id === activeTeam.id && (
                <Check className="h-4 w-4 text-primary shrink-0" />
              )}
            </button>
          ))}

          <Separator className="my-1" />

          <button
            onClick={() => {
              setOpen(false);
              setCreateOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create team
          </button>

          <button
            onClick={() => {
              setOpen(false);
              window.location.href = "/settings/integrations";
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <GitHubIcon className="h-4 w-4" />
            Import from GitHub
          </button>
        </PopoverContent>
      </Popover>

      <CreateTeamDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(teamId) => switchTeam(teamId)}
      />
    </>
  );
}
