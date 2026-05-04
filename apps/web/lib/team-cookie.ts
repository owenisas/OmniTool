export const TEAM_COOKIE_NAME = "omnitool-active-team";

export function getActiveTeamFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith(`${TEAM_COOKIE_NAME}=`));
  return match ? match.split("=")[1] : null;
}

export function setActiveTeamCookie(teamId: string): void {
  document.cookie = `${TEAM_COOKIE_NAME}=${teamId}; path=/; max-age=31536000; SameSite=Lax`;
}

export function clearActiveTeamCookie(): void {
  document.cookie = `${TEAM_COOKIE_NAME}=; path=/; max-age=0`;
}
