import { Octokit } from "octokit";
import { refreshTokenIfNeeded } from "../lib/token-refresh";

export async function createGitHubClient(userId: string): Promise<Octokit> {
  const token = await refreshTokenIfNeeded(userId, "GITHUB");
  return new Octokit({ auth: token });
}

export async function getGitHubProfile(octokit: Octokit) {
  const { data } = await octokit.rest.users.getAuthenticated();
  return {
    login: data.login,
    name: data.name,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    publicRepos: data.public_repos,
    followers: data.followers,
  };
}

export async function getGitHubContributions(octokit: Octokit, login: string) {
  const { user } = await octokit.graphql<{
    user: {
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: number;
          weeks: Array<{
            contributionDays: Array<{
              contributionCount: number;
              date: string;
            }>;
          }>;
        };
      };
    };
  }>(`query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }`, { login });

  return user.contributionsCollection.contributionCalendar;
}

export async function getRecentPRs(octokit: Octokit, login: string, limit = 10) {
  const { data } = await octokit.rest.search.issuesAndPullRequests({
    q: `author:${login} type:pr sort:updated`,
    per_page: limit,
  });
  return data.items;
}

// ─── Personal repo functions ────────────────────────────────

export async function listUserRepos(octokit: Octokit) {
  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: "updated",
    affiliation: "owner",
  });
  return repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description ?? null,
    isPrivate: repo.private,
    language: repo.language ?? null,
    archived: !!repo.archived,
    updatedAt: repo.updated_at,
  }));
}

// ─── Organization functions ─────────────────────────────────

export async function listUserOrgs(octokit: Octokit) {
  const { data } = await octokit.rest.orgs.listForAuthenticatedUser({
    per_page: 100,
  });
  return data.map((org) => ({
    id: org.id,
    login: org.login,
    description: org.description ?? null,
    avatarUrl: org.avatar_url,
  }));
}

export async function getOrgDetails(octokit: Octokit, org: string) {
  const { data } = await octokit.rest.orgs.get({ org });
  return {
    id: data.id,
    login: data.login,
    name: data.name || data.login,
    description: data.description ?? null,
    avatarUrl: data.avatar_url,
    publicRepos: data.public_repos,
  };
}

export async function listOrgRepos(octokit: Octokit, org: string) {
  const repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
    org,
    per_page: 100,
    sort: "updated",
    type: "all",
  });
  return repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description ?? null,
    isPrivate: repo.private,
    language: repo.language ?? null,
    archived: !!repo.archived,
    updatedAt: repo.updated_at,
  }));
}

export async function listOrgMembers(octokit: Octokit, org: string) {
  const members = await octokit.paginate(octokit.rest.orgs.listMembers, {
    org,
    per_page: 100,
  });
  return members.map((member) => ({
    id: member.id,
    login: member.login,
    avatarUrl: member.avatar_url,
  }));
}

// ─── Webhook management ────────────────────────────────────

/**
 * Register a webhook on a GitHub repository for push, PR, and issue events.
 * Returns the webhook ID for future management (update/delete).
 */
export async function createRepoWebhook(
  octokit: Octokit,
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string
): Promise<{ id: number; active: boolean }> {
  const { data } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: "json",
      secret,
      insecure_ssl: "0",
    },
    events: ["push", "pull_request", "issues", "issue_comment"],
    active: true,
  });
  return { id: data.id, active: data.active };
}

/**
 * Delete a webhook from a GitHub repository.
 */
export async function deleteRepoWebhook(
  octokit: Octokit,
  owner: string,
  repo: string,
  hookId: number
): Promise<void> {
  await octokit.rest.repos.deleteWebhook({ owner, repo, hook_id: hookId });
}

// ─── GitHub Issue operations (outbound) ────────────────────

/**
 * Create an issue on a GitHub repository.
 */
export async function createGitHubIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  opts: { title: string; body?: string; labels?: string[] }
): Promise<{ number: number; id: number; htmlUrl: string }> {
  const { data } = await octokit.rest.issues.create({
    owner,
    repo,
    title: opts.title,
    body: opts.body,
    labels: opts.labels,
  });
  return { number: data.number, id: data.id, htmlUrl: data.html_url };
}

/**
 * Update an existing GitHub issue (title, body, state, labels).
 */
export async function updateGitHubIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  opts: { title?: string; body?: string; state?: "open" | "closed"; labels?: string[] }
): Promise<void> {
  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    ...opts,
  });
}

/**
 * Fetch a single PR plus a compact review summary. Used by note URL
 * preview blocks to render `https://github.com/<owner>/<repo>/pull/<n>`
 * pastes as live cards.
 */
export async function getGitHubPR(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<{
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  author: { login: string; avatarUrl: string } | null;
  htmlUrl: string;
  additions: number;
  deletions: number;
  reviews: Array<{ user: string; state: string }>;
}> {
  const [pr, reviews] = await Promise.all([
    octokit.rest.pulls.get({ owner, repo, pull_number: number }),
    octokit.rest.pulls.listReviews({ owner, repo, pull_number: number, per_page: 30 }),
  ]);
  const data = pr.data;
  return {
    number: data.number,
    title: data.title,
    state: data.state as "open" | "closed",
    draft: data.draft ?? false,
    merged: !!data.merged,
    mergeable: data.mergeable ?? null,
    author: data.user
      ? { login: data.user.login, avatarUrl: data.user.avatar_url }
      : null,
    htmlUrl: data.html_url,
    additions: data.additions ?? 0,
    deletions: data.deletions ?? 0,
    reviews: reviews.data.map((r) => ({
      user: r.user?.login ?? "",
      state: r.state ?? "",
    })),
  };
}

/**
 * Add a comment to a GitHub issue or PR.
 */
export async function addGitHubComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<{ id: number }> {
  const { data } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
  return { id: data.id };
}
