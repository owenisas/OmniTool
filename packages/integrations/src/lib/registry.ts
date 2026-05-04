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
    scopes: ["chat:write", "channels:read", "commands", "users:read"],
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
    scopes: ["read", "write"],
    authUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    clientIdEnv: "LINEAR_CLIENT_ID",
    clientSecretEnv: "LINEAR_CLIENT_SECRET",
  },
};

export const providerRegistry = {
  get: (provider: string) => providers[provider],
  getAll: () => Object.values(providers),
  getAllKeys: () => Object.keys(providers),
};
