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
  description: string | null;
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

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const [activeTeamId, setActiveTeamId] = useState<string | null>(() => {
    if (typeof document === "undefined") return null;
    const match = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${TEAM_COOKIE_NAME}=`));
    return match ? match.split("=")[1] : null;
  });

  const utils = trpc.useUtils();
  const { data: user, isLoading } = trpc.user.me.useQuery(undefined, {
    staleTime: 60_000,
  });

  const teams = (user?.teamMembers ?? []).map((m) => ({
    id: m.team.id,
    name: m.team.name,
    slug: m.team.slug,
    description: m.team.description,
    githubOrgLogin: m.team.githubOrgLogin,
    role: m.role,
  }));

  // Auto-select first team if none set
  useEffect(() => {
    if (!isLoading && teams.length > 0 && !activeTeamId) {
      const firstId = teams[0].id;
      setActiveTeamId(firstId);
      setActiveTeamCookie(firstId);
    }
  }, [isLoading, teams, activeTeamId]);

  // If current activeTeamId not in teams list, reset
  useEffect(() => {
    if (!isLoading && teams.length > 0 && activeTeamId) {
      if (!teams.find((t) => t.id === activeTeamId)) {
        const firstId = teams[0].id;
        setActiveTeamId(firstId);
        setActiveTeamCookie(firstId);
      }
    }
  }, [isLoading, teams, activeTeamId]);

  const switchTeam = useCallback(
    (teamId: string) => {
      setActiveTeamId(teamId);
      setActiveTeamCookie(teamId);
      // Invalidate all team-scoped queries
      utils.invalidate();
    },
    [utils]
  );

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? null;

  return (
    <TeamContext.Provider
      value={{ activeTeamId, activeTeam, teams, switchTeam, isLoading }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  return useContext(TeamContext);
}
