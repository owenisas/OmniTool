import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";
import {
  createGitHubClient,
  createLinearClient,
  getGitHubPR,
} from "@omnitool/integrations";

const LINEAR_URL_RE =
  /^https:\/\/linear\.app\/[^/]+\/issue\/([A-Z][A-Z0-9]+-\d+)/i;
const GITHUB_PR_URL_RE =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;

function parseLinearIdentifier(input: string): {
  teamKey: string;
  number: number;
  identifier: string;
} | null {
  const trimmed = input.trim();
  let identifier: string | undefined;
  const urlMatch = trimmed.match(LINEAR_URL_RE);
  if (urlMatch) {
    identifier = urlMatch[1];
  } else if (/^[A-Z][A-Z0-9]+-\d+$/i.test(trimmed)) {
    identifier = trimmed.toUpperCase();
  }
  if (!identifier) return null;
  const [teamKey, num] = identifier.split("-");
  const number = Number(num);
  if (!teamKey || !Number.isFinite(number)) return null;
  return { teamKey: teamKey.toUpperCase(), number, identifier };
}

function parseGitHubPrUrl(
  url: string,
): { owner: string; repo: string; number: number } | null {
  const match = url.trim().match(GITHUB_PR_URL_RE);
  if (!match) return null;
  return {
    owner: match[1]!,
    repo: match[2]!,
    number: Number(match[3]!),
  };
}

export const externalPreviewRouter = createTRPCRouter({
  /**
   * Fetch a Linear issue preview given a URL or identifier
   * (`https://linear.app/<workspace>/issue/<TEAM-NUMBER>` or `ENG-123`).
   * Uses the current user's connected Linear account.
   */
  linearIssue: protectedProcedure
    .input(z.object({ urlOrId: z.string().min(3).max(500) }))
    .query(async ({ ctx, input }) => {
      const parsed = parseLinearIdentifier(input.urlOrId);
      if (!parsed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not parse a Linear issue identifier from the input.",
        });
      }
      const client = await createLinearClient(ctx.userId);
      const result = await client.issues({
        filter: {
          team: { key: { eq: parsed.teamKey } },
          number: { eq: parsed.number },
        },
        first: 1,
      });
      const issue = result.nodes[0];
      if (!issue) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Linear issue ${parsed.identifier} not found in your workspace.`,
        });
      }
      const [state, assignee, team] = await Promise.all([
        issue.state,
        issue.assignee,
        issue.team,
      ]);
      return {
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        priority: issue.priority,
        state: state
          ? {
              name: state.name,
              type: state.type,
              color: state.color,
            }
          : null,
        assignee: assignee
          ? { name: assignee.name, email: assignee.email }
          : null,
        team: team ? { name: team.name, key: team.key } : null,
      };
    }),

  /**
   * Fetch a GitHub PR preview given the canonical web URL.
   * Uses the current user's connected GitHub account.
   */
  githubPr: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .query(async ({ ctx, input }) => {
      const parsed = parseGitHubPrUrl(input.url);
      if (!parsed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "URL is not a GitHub PR URL.",
        });
      }
      const octokit = await createGitHubClient(ctx.userId);
      const pr = await getGitHubPR(
        octokit,
        parsed.owner,
        parsed.repo,
        parsed.number,
      );
      return pr;
    }),
});
