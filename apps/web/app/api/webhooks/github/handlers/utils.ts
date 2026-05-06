import { prisma } from "@omnitool/database";

/**
 * Find the OmniTool project that corresponds to a GitHub repo.
 */
export async function resolveProjectByRepo(
  repoFullName: string
): Promise<{ id: string; teamId: string } | null> {
  const project = await prisma.project.findFirst({
    where: { githubRepoFullName: repoFullName },
    select: { id: true, teamId: true },
  });
  return project;
}

/**
 * Resolve a GitHub login to an OmniTool user ID.
 * Returns null if the user hasn't linked their GitHub account.
 */
export async function resolveUserByGithubLogin(
  login: string
): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { githubLogin: login },
    select: { id: true },
  });
  return user?.id ?? null;
}

/**
 * Parse task references from text (branch names, commit messages, PR bodies).
 *
 * Recognizes patterns like:
 * - `PROJ-123` (issue identifier style — resolves to issue, but we check tasks too)
 * - `task/clxxxxxx` (cuid-based task ID in branch name)
 * - `#clxxxxxx` (cuid reference)
 *
 * Returns an array of valid task IDs that exist in the database.
 */
export async function parseTaskReferences(text: string): Promise<string[]> {
  const refs = new Set<string>();

  // Match cuid patterns (25-char alphanumeric starting with 'cl' or 'cm')
  const cuidPattern = /\b(c[lm][a-z0-9]{23,25})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = cuidPattern.exec(text)) !== null) {
    refs.add(match[1]!);
  }

  // Match issue identifiers like PROJ-123 → resolve to issue and then link
  const identifierPattern = /\b([A-Z]{2,6}-\d+)\b/g;
  while ((match = identifierPattern.exec(text)) !== null) {
    const issue = await prisma.issue.findFirst({
      where: { identifier: match[1]! },
      select: { id: true },
    });
    if (issue) {
      refs.add(issue.id);
    }
  }

  if (refs.size === 0) return [];

  // Validate that referenced IDs exist as tasks or issues
  const ids = Array.from(refs);
  const [existingTasks, existingIssues] = await Promise.all([
    prisma.task.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    }),
    prisma.issue.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    }),
  ]);

  return [
    ...existingTasks.map((t) => t.id),
    ...existingIssues.map((i) => i.id),
  ];
}
