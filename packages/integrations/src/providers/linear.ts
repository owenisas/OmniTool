import { LinearClient } from "@linear/sdk";
import { createHmac, timingSafeEqual } from "node:crypto";
import { refreshTokenIfNeeded } from "../lib/token-refresh";

export async function createLinearClient(userId: string): Promise<LinearClient> {
  const token = await refreshTokenIfNeeded(userId, "LINEAR");
  return new LinearClient({ accessToken: token });
}

export async function getLinearIssues(client: LinearClient, teamKey?: string) {
  const issues = await client.issues({
    filter: teamKey ? { team: { key: { eq: teamKey } } } : undefined,
    first: 50,
    orderBy: LinearClient.name as any,
  });
  return issues.nodes;
}

/**
 * Fetch all Linear teams (workspaces) the authenticated user has access to.
 */
export async function listLinearTeams(userId: string) {
  const client = await createLinearClient(userId);
  const teams = await client.teams();
  return teams.nodes.map((team) => ({
    id: team.id,
    name: team.name,
    key: team.key,
    description: team.description ?? null,
    color: team.color ?? null,
    icon: team.icon ?? null,
  }));
}

/**
 * Fetch projects within a specific Linear team.
 */
export async function listLinearProjects(userId: string, teamId: string) {
  const client = await createLinearClient(userId);
  const team = await client.team(teamId);
  const projects = await team.projects();
  return projects.nodes.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    state: project.state,
    startDate: project.startDate ?? null,
    targetDate: project.targetDate ?? null,
    color: project.color ?? null,
    icon: project.icon ?? null,
    slugId: project.slugId,
  }));
}

/**
 * Create a new issue in a Linear team.
 */
export async function createLinearIssue(
  userId: string,
  teamId: string,
  title: string,
  description?: string,
  priority?: number,
  assigneeId?: string,
) {
  const client = await createLinearClient(userId);
  const issuePayload = await client.createIssue({
    teamId,
    title,
    description: description ?? undefined,
    priority: priority ?? undefined,
    assigneeId: assigneeId ?? undefined,
  });

  const issue = await issuePayload.issue;
  if (!issue) {
    throw new Error("Failed to create Linear issue: no issue returned");
  }

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    priority: issue.priority,
    url: issue.url,
  };
}

/**
 * Update an existing Linear issue.
 */
export async function updateLinearIssue(
  userId: string,
  issueId: string,
  updates: {
    title?: string;
    description?: string;
    priority?: number;
    assigneeId?: string | null;
    stateId?: string;
  },
) {
  const client = await createLinearClient(userId);
  const issuePayload = await client.updateIssue(issueId, {
    title: updates.title,
    description: updates.description,
    priority: updates.priority,
    assigneeId: updates.assigneeId ?? undefined,
    stateId: updates.stateId,
  });

  const issue = await issuePayload.issue;
  if (!issue) {
    throw new Error("Failed to update Linear issue: no issue returned");
  }

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    priority: issue.priority,
    url: issue.url,
  };
}

/**
 * Get a single Linear issue by ID.
 */
export async function getLinearIssue(userId: string, issueId: string) {
  const client = await createLinearClient(userId);
  const issue = await client.issue(issueId);

  const state = await issue.state;
  const assignee = await issue.assignee;
  const team = await issue.team;

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    priority: issue.priority,
    url: issue.url,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    state: state
      ? { id: state.id, name: state.name, type: state.type, color: state.color }
      : null,
    assignee: assignee
      ? { id: assignee.id, name: assignee.name, email: assignee.email }
      : null,
    team: team
      ? { id: team.id, name: team.name, key: team.key }
      : null,
  };
}

/**
 * Verify a Linear webhook signature.
 *
 * Linear signs webhooks with HMAC-SHA256 using the webhook's signing secret.
 * The signature is sent in the `Linear-Signature` header as a raw hex digest.
 */
export function verifyLinearWebhook(
  body: string,
  signature: string,
  signingSecret: string,
): boolean {
  const expectedSignature = createHmac("sha256", signingSecret)
    .update(body)
    .digest("hex");

  const expectedBuf = Buffer.from(expectedSignature, "utf-8");
  const receivedBuf = Buffer.from(signature, "utf-8");

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, receivedBuf);
}
