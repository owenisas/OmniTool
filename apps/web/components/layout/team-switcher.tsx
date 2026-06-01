"use client";

import { useState, type CSSProperties } from "react";
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

const teamLetterSprite = "/brand/team-letter-sprite.png";
const teamLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function getTeamInitial(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^A-Za-z]/g, "")
    .charAt(0)
    .toUpperCase() || "T";
}

function getTeamLetterMark(name: string) {
  const initial = getTeamInitial(name);
  const index = Math.max(teamLetters.indexOf(initial), 0);
  const col = index % 13;
  const row = Math.floor(index / 13);

  return {
    backgroundPosition: `${(col / 12) * 100}% ${row * 100}%`,
    initial,
  };
}

function TeamAvatar({
  team,
  size,
}: {
  team: { name: string; avatarUrl: string | null };
  size: "sm" | "md";
}) {
  const dim = size === "md" ? "h-7 w-7" : "h-6 w-6";
  const mark = getTeamLetterMark(team.name);
  const markStyle = {
    backgroundImage: `url(${teamLetterSprite})`,
    backgroundPosition: mark.backgroundPosition,
  } as CSSProperties;

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
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm",
        "dark:border-white/10 dark:bg-neutral-950",
        dim,
      )}
      aria-label={`${mark.initial} team avatar`}
    >
      <span
        className="block h-[86%] w-[86%] bg-no-repeat"
        aria-hidden="true"
        style={{
          ...markStyle,
          backgroundSize: "1300% 200%",
        }}
      />
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
