import { prisma } from "@omnitool/database";
import {
  createSlackClientFromToken,
  decrypt,
  sendSlackMessage,
} from "@omnitool/integrations";
import { emitActivityEvent } from "@/lib/activity/emit";

const ISSUE_INTENT_RE =
  /^create\s+issue\s+["“]([^"”]+)["”](?:\s+in\s+(\S+))?\s*$/i;
const NOTE_INTENT_RE =
  /^note\s+["“]([^"”]+)["”](?:\s+in\s+(\S+))?\s*$/i;

export interface ParsedSlackIntent {
  kind: "create_issue" | "create_note" | "freeform";
  title?: string;
  projectSlug?: string;
  teamSlug?: string;
  rawText: string;
}

/**
 * Tiny deterministic parser for Slack `@OmniTool` mentions.
 *
 *  `@OmniTool create issue "title" in project-slug`
 *  `@OmniTool note "title" in team-slug`
 *  anything else → freeform (emits a `slack.app_mention` event so users
 *  can wire workflow templates against arbitrary text)
 *
 * Strips a leading `<@BOTID>` mention before matching.
 */
export function parseSlackIntent(
  rawText: string,
  botUserId: string,
): ParsedSlackIntent {
  const stripped = rawText
    .replace(new RegExp(`<@${botUserId}>`, "g"), "")
    .trim();

  const issueMatch = stripped.match(ISSUE_INTENT_RE);
  if (issueMatch) {
    return {
      kind: "create_issue",
      title: issueMatch[1] ?? "",
      projectSlug: issueMatch[2],
      rawText: stripped,
    };
  }

  const noteMatch = stripped.match(NOTE_INTENT_RE);
  if (noteMatch) {
    return {
      kind: "create_note",
      title: noteMatch[1] ?? "",
      teamSlug: noteMatch[2],
      rawText: stripped,
    };
  }

  return { kind: "freeform", rawText: stripped };
}

interface HandleArgs {
  rawText: string;
  channel: string;
  threadTs: string;
  slackUserId: string;
  slackTeamId: string;
}

/**
 * Resolve the Slack mention to a concrete OmniTool action and post a
 * threaded reply. Falls back to a freeform `slack.app_mention` activity
 * event for any text the parser doesn't recognize, so workflow templates
 * can react to arbitrary mentions.
 */
export async function handleSlackMention(args: HandleArgs): Promise<void> {
  const { rawText, channel, threadTs, slackUserId, slackTeamId } = args;

  const install = await prisma.slackTeamInstall.findUnique({
    where: { teamId: slackTeamId },
  });
  if (!install) {
    console.warn(
      `[slack-mention] No SlackTeamInstall for team_id=${slackTeamId}; ignoring.`,
    );
    return;
  }

  const botToken = decrypt(install.encryptedBotToken);
  const client = createSlackClientFromToken(botToken);

  const omniUser = await prisma.user.findUnique({
    where: { slackUserId },
  });

  if (!omniUser) {
    await sendSlackMessage(
      client,
      channel,
      `Hi <@${slackUserId}> — link your OmniTool account to use this bot. Open OmniTool → Settings → Integrations → Slack.`,
    );
    return;
  }

  const intent = parseSlackIntent(rawText, install.botUserId);

  let team: Awaited<ReturnType<typeof prisma.team.findFirst>> = null;
  if (install.workspaceId) {
    team = await prisma.team.findFirst({
      where: {
        id: install.workspaceId,
        members: { some: { userId: omniUser.id } },
      },
    });
    if (!team) {
      await client.chat.postMessage({
        channel,
        text: "Your OmniTool account is not a member of the team connected to this Slack workspace.",
        thread_ts: threadTs,
      });
      return;
    }
  } else {
    // Legacy installs may not have an OmniTool team association. Default to
    // the user's first team membership while still checking project access.
    const membership = await prisma.teamMember.findFirst({
      where: { userId: omniUser.id },
      orderBy: { joinedAt: "asc" },
      include: { team: true },
    });
    team = membership?.team ?? null;
  }

  const replyMode = team?.slackReplyMode ?? "full";
  const baseUrl = process.env.AUTH_URL ?? "https://omnitool.reunifylabs.com";

  switch (intent.kind) {
    case "create_issue": {
      // Resolve project: explicit slug from the mention, otherwise the
      // user's first project.
      let projectId: string | null = null;
      if (intent.projectSlug) {
        const project = await prisma.project.findFirst({
          where: {
            slug: intent.projectSlug,
            team: {
              ...(team?.id ? { id: team.id } : {}),
              members: { some: { userId: omniUser.id } },
            },
          },
        });
        projectId = project?.id ?? null;
      }
      if (!projectId) {
        const project = await prisma.project.findFirst({
          where: {
            team: {
              ...(team?.id ? { id: team.id } : {}),
              members: { some: { userId: omniUser.id } },
            },
          },
          orderBy: { createdAt: "asc" },
        });
        projectId = project?.id ?? null;
      }
      if (!projectId) {
        await sendSlackMessage(
          client,
          channel,
          "Couldn't create an issue — you don't have any projects yet. Create one in OmniTool first.",
        );
        return;
      }

      const issue = await prisma.issue.create({
        data: {
          title: intent.title || "Untitled",
          identifier: `SLACK-${Date.now()}`,
          projectId,
          reporterId: omniUser.id,
          priority: "MEDIUM",
        },
      });

      await emitActivityEvent({
        type: "issue.created",
        actorType: "integration",
        actorId: omniUser.id,
        subjectType: "issue",
        subjectId: issue.id,
        payload: { source: "slack", channel, threadTs },
      });

      const link = `${baseUrl}/issues/${issue.identifier}`;
      const replyText =
        replyMode === "task-link-only"
          ? `Issue created: <${link}|${issue.identifier}>`
          : `Created issue *${issue.identifier}*: ${issue.title}\n${link}`;
      await client.chat.postMessage({
        channel,
        text: replyText,
        thread_ts: threadTs,
      });
      return;
    }

    case "create_note": {
      let targetTeam = team;
      if (intent.teamSlug) {
        targetTeam = await prisma.team.findFirst({
          where: {
            slug: intent.teamSlug,
            ...(install.workspaceId ? { id: install.workspaceId } : {}),
            members: { some: { userId: omniUser.id } },
          },
        });
        if (!targetTeam) {
          await client.chat.postMessage({
            channel,
            text: `Couldn't create a note — you do not have access to team '${intent.teamSlug}'.`,
            thread_ts: threadTs,
          });
          return;
        }
      }

      const note = await prisma.note.create({
        data: {
          title: intent.title || "Slack note",
          authorId: omniUser.id,
          teamId: targetTeam?.id ?? null,
          contentText: "",
        },
      });

      await emitActivityEvent({
        type: "note.created",
        actorType: "integration",
        actorId: omniUser.id,
        subjectType: "note",
        subjectId: note.id,
        payload: { source: "slack", channel, threadTs },
      });

      const link = `${baseUrl}/notes/${note.id}`;
      const replyText =
        replyMode === "task-link-only"
          ? `Note created: <${link}|${note.title}>`
          : `Created note *${note.title}*\n${link}`;
      await client.chat.postMessage({
        channel,
        text: replyText,
        thread_ts: threadTs,
      });
      return;
    }

    case "freeform":
    default: {
      // Emit an activity event so workflow templates can match against
      // `slack.app_mention` and decide what to do with the text.
      await emitActivityEvent({
        type: "slack.app_mention",
        actorType: "integration",
        actorId: omniUser.id,
        teamId: team?.id ?? undefined,
        subjectType: "note",
        subjectId: omniUser.id,
        payload: {
          text: intent.rawText,
          channel,
          threadTs,
          slackUserId,
          slackTeamId,
        },
      });
      await client.chat.postMessage({
        channel,
        text: "Got it — running any matching workflows. Try `create issue \"title\"` or `note \"title\"` for direct actions.",
        thread_ts: threadTs,
      });
      return;
    }
  }
}
