import type { CodingSessionRecord } from "@omnitool/coding-sessions";

/**
 * Format a Date as "YYYY-MM-DD" in the given IANA timezone.
 */
export function getLocalDateString(timezone: string, date?: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date ?? new Date());
}

/**
 * Filter coding sessions to those active on a given local calendar day.
 *
 * A session is "active today" if:
 * - createdAt falls on the target date, OR
 * - updatedAt falls on the target date (handles sessions started yesterday but continued today)
 */
export function filterSessionsByLocalDate(
  sessions: CodingSessionRecord[],
  timezone: string,
  targetDate?: Date
): CodingSessionRecord[] {
  const todayStr = getLocalDateString(timezone, targetDate);

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return sessions.filter((session) => {
    const created = session.createdAt ? new Date(session.createdAt) : null;
    const updated = session.updatedAt ? new Date(session.updatedAt) : null;

    const createdDay = created ? formatter.format(created) : null;
    const updatedDay = updated ? formatter.format(updated) : null;

    return createdDay === todayStr || updatedDay === todayStr;
  });
}
