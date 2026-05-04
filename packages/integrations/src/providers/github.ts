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
