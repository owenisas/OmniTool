import notices from "./release-notices.json";

export interface ReleaseNotice {
  version: string;
  tag: string;
  date: string;
  title: string;
  summary: string;
  highlights: string[];
}

const DEFAULT_GITHUB_REPOSITORY = "owenisas/OmniTool";

export const releaseNotices = notices as ReleaseNotice[];

export function getAppVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "development";
}

export function getGitHubRepository(): string {
  return (
    process.env.NEXT_PUBLIC_GITHUB_REPOSITORY?.trim() ||
    DEFAULT_GITHUB_REPOSITORY
  );
}

export function normalizeVersionTag(versionOrTag: string): string {
  const value = versionOrTag.trim();
  if (!value) return "";
  return value.startsWith("v") ? value : `v${value}`;
}

export function getReleaseUrl(
  versionOrTag: string,
  repository = getGitHubRepository(),
): string {
  const tag = normalizeVersionTag(versionOrTag);
  return `https://github.com/${repository}/releases/tag/${tag}`;
}

export function getSourceTagUrl(
  versionOrTag: string,
  repository = getGitHubRepository(),
): string {
  const tag = normalizeVersionTag(versionOrTag);
  return `https://github.com/${repository}/tree/${tag}`;
}

export function getLatestReleaseNotice(): ReleaseNotice | null {
  return releaseNotices[0] ?? null;
}

export function getReleaseNotice(versionOrTag: string): ReleaseNotice | null {
  const tag = normalizeVersionTag(versionOrTag);
  return (
    releaseNotices.find(
      (notice) =>
        notice.tag === tag || normalizeVersionTag(notice.version) === tag,
    ) ?? null
  );
}
