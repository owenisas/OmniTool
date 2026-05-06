import { prisma } from "@omnitool/database";

export interface HandoffContext {
  title: string;
  description: string;
  project: {
    name: string;
    githubRepo: string | null;
  };
  relatedTasks: Array<{
    id: string;
    title: string;
    status: string;
    description: string | null;
  }>;
  relatedIssues: Array<{
    id: string;
    identifier: string;
    title: string;
    description: string | null;
  }>;
  relevantNotes: Array<{
    title: string;
    contentText: string;
  }>;
  recentCommits: Array<{
    sha: string;
    message: string;
    author: string | null;
  }>;
}

/**
 * Assemble context for an agent handoff from OmniTool data.
 * Gathers related tasks, issues, notes, and recent commits.
 */
export async function assembleHandoffContext(opts: {
  projectId: string;
  taskIds?: string[];
  issueIds?: string[];
  noteIds?: string[];
}): Promise<HandoffContext> {
  const project = await prisma.project.findUnique({
    where: { id: opts.projectId },
    select: { name: true, githubRepoFullName: true, description: true },
  });

  if (!project) throw new Error("Project not found");

  // Gather related tasks (directly specified + linked via EntityLinks)
  const tasks = opts.taskIds?.length
    ? await prisma.task.findMany({
        where: { id: { in: opts.taskIds } },
        select: { id: true, title: true, status: true, description: true },
      })
    : [];

  // Gather related issues
  const issues = opts.issueIds?.length
    ? await prisma.issue.findMany({
        where: { id: { in: opts.issueIds } },
        select: { id: true, identifier: true, title: true, description: true },
      })
    : [];

  // Gather relevant notes
  const notes = opts.noteIds?.length
    ? await prisma.note.findMany({
        where: { id: { in: opts.noteIds }, deletedAt: null },
        select: { title: true, contentText: true },
      })
    : [];

  // Get recent commits for this project (last 10)
  const commits = await prisma.gitHubCommit.findMany({
    where: { projectId: opts.projectId },
    orderBy: { timestamp: "desc" },
    take: 10,
    select: { sha: true, message: true, authorGithubLogin: true },
  });

  return {
    title: "",
    description: "",
    project: {
      name: project.name,
      githubRepo: project.githubRepoFullName,
    },
    relatedTasks: tasks,
    relatedIssues: issues,
    relevantNotes: notes.map((n) => ({
      title: n.title,
      contentText: n.contentText.slice(0, 2000),
    })),
    recentCommits: commits.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.message.split("\n")[0] ?? "",
      author: c.authorGithubLogin,
    })),
  };
}

/**
 * Format handoff context into a structured prompt for an AI agent.
 */
export function formatContextForAgent(
  context: HandoffContext,
  provider: "codex" | "claude-code"
): string {
  const sections: string[] = [];

  sections.push(`# Task: ${context.title}`);
  sections.push(context.description);

  if (context.project.githubRepo) {
    sections.push(`\n## Repository\n${context.project.githubRepo}`);
  }

  if (context.relatedTasks.length > 0) {
    sections.push(
      `\n## Related Tasks\n${context.relatedTasks.map((t) => `- [${t.status}] ${t.title}: ${t.description ?? "no description"}`).join("\n")}`
    );
  }

  if (context.relatedIssues.length > 0) {
    sections.push(
      `\n## Related Issues\n${context.relatedIssues.map((i) => `- ${i.identifier}: ${i.title} — ${i.description ?? ""}`).join("\n")}`
    );
  }

  if (context.relevantNotes.length > 0) {
    sections.push(
      `\n## Context Notes\n${context.relevantNotes.map((n) => `### ${n.title}\n${n.contentText}`).join("\n\n")}`
    );
  }

  if (context.recentCommits.length > 0) {
    sections.push(
      `\n## Recent Commits\n${context.recentCommits.map((c) => `- ${c.sha} ${c.message} (${c.author})`).join("\n")}`
    );
  }

  if (provider === "claude-code") {
    sections.push(
      "\n## Instructions\nPlease implement the task described above. Create a new branch, make the changes, and submit a PR."
    );
  }

  return sections.join("\n\n");
}
