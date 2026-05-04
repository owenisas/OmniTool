import { LinearClient } from "@linear/sdk";
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
