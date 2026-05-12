"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { trpc } from "@/trpc/client";
import { setActiveTeamCookie, TEAM_COOKIE_NAME } from "@/lib/team-cookie";

interface TeamInfo {
  id: string;
  name: string;
  slug: string;
  kind: string;
  description: string | null;
  avatarUrl: string | null;
  githubOrgLogin: string | null;
}

interface TeamContextValue {
  activeTeamId: string | null;
  activeTeam: TeamInfo | null;
  teams: Array<TeamInfo & { role: string }>;
  switchTeam: (teamId: string) => void;
  isLoading: boolean;
}

const TeamContext = createContext<TeamContextValue>({
  activeTeamId: null,
  activeTeam: null,
  teams: [],
  switchTeam: () => {},
  isLoading: true,
});

export function TeamProvider({
  children,
  initialTeams = [],
}: {
  children: React.ReactNode;
  initialTeams?: Array<TeamInfo & { role: string }>;
}) {
  const [activeTeamId, setActiveTeamId] = useState<string | null>(() => {
    if (typeof document === "undefined") return null;
    const match = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${TEAM_COOKIE_NAME}=`));
    return match ? match.split("=")[1] : null;
  });

  const utils = trpc.useUtils();
  const { data: fetchedTeams, isLoading: isTeamsLoading } =
    trpc.team.list.useQuery(undefined, {
      refetchOnMount: "always",
      staleTime: 60_000,
    });
  const workspaceTeams = fetchedTeams ?? initialTeams;
  const isLoading = isTeamsLoading && workspaceTeams.length === 0;

  const teams = (workspaceTeams ?? [])
    .map((team) => ({
      id: team.id,
      name: team.name,
      slug: team.slug,
      kind: team.kind,
      description: team.description,
      avatarUrl: team.avatarUrl ?? null,
      githubOrgLogin: team.githubOrgLogin,
      role: team.role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const activeTeam =
    teams.find((t) => t.id === activeTeamId) ?? teams[0] ?? null;
  const effectiveActiveTeamId = activeTeam?.id ?? null;

  useEffect(() => {
    if (isLoading || !activeTeam || activeTeam.id === activeTeamId) return;

    setActiveTeamCookie(activeTeam.id);
  }, [isLoading, activeTeam, activeTeamId]);

  const switchTeam = useCallback(
    (teamId: string) => {
      setActiveTeamId(teamId);
      setActiveTeamCookie(teamId);
      // Invalidate all team-scoped queries
      utils.invalidate();
    },
    [utils]
  );

  return (
    <TeamContext.Provider
      value={{
        activeTeamId: effectiveActiveTeamId,
        activeTeam,
        teams,
        switchTeam,
        isLoading,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  return useContext(TeamContext);
}
