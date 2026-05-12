export interface ProviderConfig {
  name: string;
  slug: string;
  icon: string;
  description: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

const providers: Record<string, ProviderConfig> = {
  GITHUB: {
    name: "GitHub",
    slug: "github",
    icon: "github",
    description: "Connect your GitHub account to sync repos, PRs, and contribution data.",
    scopes: ["read:user", "user:email", "repo", "read:org"],
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
  NOTION: {
    name: "Notion",
    slug: "notion",
    icon: "book-open",
    description: "Connect Notion to sync pages, databases, and notes.",
    scopes: [],
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    clientIdEnv: "NOTION_CLIENT_ID",
    clientSecretEnv: "NOTION_CLIENT_SECRET",
  },
  SLACK: {
    name: "Slack",
    slug: "slack",
    icon: "message-square",
    description: "Connect Slack to send notifications and create tasks from messages.",
    // app_mentions:read + im:* added in Phase 3 (interactive @OmniTool):
    //  - app_mentions:read: receive `app_mention` events when users @-mention
    //    the bot in any channel.
    //  - im:history / im:read / im:write: send and receive direct messages
    //    so the bot can respond in DMs.
    scopes: [
      "chat:write",
      "channels:read",
      "commands",
      "users:read",
      "app_mentions:read",
      "im:history",
      "im:read",
      "im:write",
    ],
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
  },
  LINEAR: {
    name: "Linear",
    slug: "linear",
    icon: "layers",
    description: "Connect Linear to sync issues and track velocity.",
    scopes: ["read", "write", "issues:create"],
    authUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    clientIdEnv: "LINEAR_CLIENT_ID",
    clientSecretEnv: "LINEAR_CLIENT_SECRET",
  },
};

/**
 * Apply env-based base-URL overrides to a provider config so OAuth tests
 * can route github.com / api.notion.com / etc. through a local mock server.
 *
 * Recognized env vars (set on the server process; default = upstream URLs):
 *   GITHUB_OAUTH_BASE_URL — overrides https://github.com in authUrl/tokenUrl
 *   GITHUB_API_BASE_URL   — overrides https://api.github.com (consumed by callers
 *                           that fetch the user profile after exchange)
 *   NOTION_API_BASE_URL   — overrides https://api.notion.com
 *   SLACK_OAUTH_BASE_URL  — overrides https://slack.com
 *   SLACK_API_BASE_URL    — overrides https://slack.com/api
 *   LINEAR_OAUTH_BASE_URL — overrides https://linear.app
 *   LINEAR_API_BASE_URL   — overrides https://api.linear.app
 *
 * Production must leave these unset.
 */
function applyBaseUrlOverrides(p: ProviderConfig): ProviderConfig {
  const swap = (url: string, from: string, to?: string) =>
    to && url.startsWith(from) ? to + url.slice(from.length) : url;

  switch (p.name) {
    case "GitHub": {
      const base = process.env.GITHUB_OAUTH_BASE_URL;
      return {
        ...p,
        authUrl: swap(p.authUrl, "https://github.com", base),
        tokenUrl: swap(p.tokenUrl, "https://github.com", base),
      };
    }
    case "Notion": {
      const base = process.env.NOTION_API_BASE_URL;
      return {
        ...p,
        authUrl: swap(p.authUrl, "https://api.notion.com", base),
        tokenUrl: swap(p.tokenUrl, "https://api.notion.com", base),
      };
    }
    case "Slack": {
      const oauthBase = process.env.SLACK_OAUTH_BASE_URL;
      const apiBase = process.env.SLACK_API_BASE_URL;
      return {
        ...p,
        authUrl: swap(p.authUrl, "https://slack.com", oauthBase),
        tokenUrl: swap(p.tokenUrl, "https://slack.com", apiBase ?? oauthBase),
      };
    }
    case "Linear": {
      const oauthBase = process.env.LINEAR_OAUTH_BASE_URL;
      const apiBase = process.env.LINEAR_API_BASE_URL;
      return {
        ...p,
        authUrl: swap(p.authUrl, "https://linear.app", oauthBase),
        tokenUrl: swap(p.tokenUrl, "https://api.linear.app", apiBase),
      };
    }
    default:
      return p;
  }
}

export const providerRegistry = {
  get: (provider: string) => {
    const p = providers[provider];
    return p ? applyBaseUrlOverrides(p) : undefined;
  },
  getAll: () => Object.values(providers).map(applyBaseUrlOverrides),
  getAllKeys: () => Object.keys(providers),
};
