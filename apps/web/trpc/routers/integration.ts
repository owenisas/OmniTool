import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";
import {
  executeGitHubImportSchema,
  disconnectIntegrationSchema,
  importNotionPagesSchema,
} from "@omnitool/shared/validators";
import {
  createGitHubClient,
  getGitHubProfile,
  listUserOrgs,
  listUserRepos,
  getOrgDetails,
  listOrgRepos,
  listOrgMembers,
  createRepoWebhook,
  createNotionClient,
  searchNotionPages,
  listNotionPages,
  getNotionPageMeta,
  notionBlocksToMarkdown,
  getNotionParentPageId,
} from "@omnitool/integrations";
import { markdownToNoteBlocks, blocksToPlainText } from "@omnitool/ai/utils";

/**
 * Walk a BlockNote document and replace every `link` href that points at a
 * Notion page (either `notion://page/{id}` or `https://www.notion.so/...{id}`)
 * with the corresponding internal `/notes/{omniId}` href — but only when the
 * target page is present in `idMap`. Unknown links stay untouched.
 *
 * Returns a deep-cloned blocks array along with a `changed` flag so the
 * caller can skip the DB write when nothing was rewritten.
 */
function rewriteNotionLinks(
  blocks: unknown,
  idMap: Map<string, string>,
): { blocks: unknown; changed: boolean } {
  if (!Array.isArray(blocks)) return { blocks, changed: false };
  let changed = false;

  const NOTION_URL_RE =
    /https?:\/\/(?:www\.)?notion\.so\/(?:[^/?#]+\/)*([0-9a-f]{32}|[0-9a-f-]{36})(?:[?#].*)?$/i;
  const NOTION_PROTO_RE = /^notion:\/\/page\/([0-9a-f-]{36}|[0-9a-f]{32})$/i;

  function rewriteHref(href: string): string {
    const proto = href.match(NOTION_PROTO_RE);
    if (proto) {
      const target = idMap.get(proto[1]!.toLowerCase());
      if (target) {
        changed = true;
        return `/notes/${target}`;
      }
      return href;
    }
    const url = href.match(NOTION_URL_RE);
    if (url) {
      const raw = url[1]!.toLowerCase();
      const target =
        idMap.get(raw) ?? idMap.get(raw.replace(/-/g, ""));
      if (target) {
        changed = true;
        return `/notes/${target}`;
      }
    }
    return href;
  }

  function walkInline(arr: unknown[]): unknown[] {
    return arr.map((node) => {
      if (!node || typeof node !== "object") return node;
      const n = node as Record<string, unknown>;
      if (n.type === "link" && typeof n.href === "string") {
        const newHref = rewriteHref(n.href);
        if (newHref !== n.href) {
          return { ...n, href: newHref };
        }
      }
      return n;
    });
  }

  function walkBlocks(arr: unknown[]): unknown[] {
    return arr.map((b) => {
      if (!b || typeof b !== "object") return b;
      const block = b as Record<string, unknown>;
      let next = block;
      if (Array.isArray(block.content)) {
        const newContent = walkInline(block.content);
        next = { ...next, content: newContent };
      }
      if (Array.isArray(block.children)) {
        next = { ...next, children: walkBlocks(block.children) };
      }
      return next;
    });
  }

  const out = walkBlocks(blocks);
  return { blocks: out, changed };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

async function generateUniqueSlug(
  prisma: any,
  base: string,
  model: "team" | "project"
): Promise<string> {
  let slug = slugify(base);
  let suffix = 1;
  const m = model === "team" ? prisma.team : prisma.project;
  while (await m.findUnique({ where: { slug } })) {
    slug = `${slugify(base)}-${++suffix}`;
  }
  return slug;
}

const githubRouter = createTRPCRouter({
  listOrgs: protectedProcedure.query(async ({ ctx }) => {
    // Check if user has GitHub connected
    const account = await ctx.prisma.connectedAccount.findUnique({
      where: {
        userId_provider: { userId: ctx.userId, provider: "GITHUB" },
      },
    });
    if (!account) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "GitHub account not connected",
      });
    }

    const octokit = await createGitHubClient(ctx.userId);
    const [orgs, profile] = await Promise.all([
      listUserOrgs(octokit),
      getGitHubProfile(octokit),
    ]);

    // Annotate with "already imported" status
    const importedOrgIds = await ctx.prisma.team.findMany({
      where: {
        githubOrgId: { not: null },
      },
      select: { githubOrgId: true, id: true, name: true },
    });

    const importedMap = new Map(
      importedOrgIds.map((t: any) => [t.githubOrgId, { id: t.id, name: t.name }])
    );

    const personalTeam = await ctx.prisma.team.findUnique({
      where: { githubOrgLogin: `~${profile.login}` },
      select: { id: true, name: true },
    });

    // Include personal account as first option
    const personalEntry = {
      id: 0, // sentinel
      login: profile.login,
      description: "Your personal repositories",
      avatarUrl: profile.avatarUrl ?? null,
      isPersonal: true as const,
      alreadyImported: !!personalTeam,
      existingTeam: personalTeam ?? null,
    };

    const orgEntries = orgs.map((org) => ({
      ...org,
      isPersonal: false as const,
      alreadyImported: importedMap.has(org.id),
      existingTeam: importedMap.get(org.id) || null,
    }));

    return [personalEntry, ...orgEntries];
  }),

  previewImport: protectedProcedure
    .input(z.object({ orgLogin: z.string(), isPersonal: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const octokit = await createGitHubClient(ctx.userId);

      let orgDetails: { id: number; login: string; name: string; description: string | null; avatarUrl: string; publicRepos: number };
      let repos: Awaited<ReturnType<typeof listOrgRepos>>;
      let members: Awaited<ReturnType<typeof listOrgMembers>>;

      if (input.isPersonal) {
        const profile = await getGitHubProfile(octokit);
        orgDetails = {
          id: 0,
          login: profile.login,
          name: profile.name || profile.login,
          description: "Personal repositories",
          avatarUrl: profile.avatarUrl ?? "",
          publicRepos: profile.publicRepos,
        };
        repos = await listUserRepos(octokit);
        members = []; // No members for personal account
      } else {
        [orgDetails, repos, members] = await Promise.all([
          getOrgDetails(octokit, input.orgLogin),
          listOrgRepos(octokit, input.orgLogin),
          listOrgMembers(octokit, input.orgLogin),
        ]);
      }

      // Check existing team
      const existingTeam = !input.isPersonal
        ? await ctx.prisma.team.findUnique({
            where: { githubOrgId: orgDetails.id },
            select: { id: true, name: true, slug: true },
          })
        : await ctx.prisma.team.findUnique({
            where: { githubOrgLogin: `~${input.orgLogin}` },
            select: { id: true, name: true, slug: true },
          });

      // Check which repos are already imported
      const existingProjects = await ctx.prisma.project.findMany({
        where: {
          githubRepoId: { not: null },
        },
        select: { githubRepoId: true },
      });
      const importedRepoIds = new Set(
        existingProjects.map((p: any) => p.githubRepoId)
      );

      // Check which members match existing users
      const existingUsers = await ctx.prisma.user.findMany({
        where: {
          OR: [
            {
              githubUserId: {
                in: members.map((m) => m.id),
              },
            },
            {
              githubLogin: {
                in: members.map((m) => m.login),
              },
            },
          ],
        },
        select: {
          id: true,
          githubUserId: true,
          githubLogin: true,
          name: true,
          email: true,
        },
      });

      const userByGhId = new Map(
        existingUsers
          .filter((u: any) => u.githubUserId)
          .map((u: any) => [u.githubUserId, u])
      );
      const userByLogin = new Map(
        existingUsers
          .filter((u: any) => u.githubLogin)
          .map((u: any) => [u.githubLogin, u])
      );

      const annotatedMembers = members.map((m) => {
        const matchById = userByGhId.get(m.id);
        const matchByLogin = userByLogin.get(m.login);
        const matched = matchById || matchByLogin || null;
        return {
          ...m,
          matchedUser: matched
            ? { id: matched.id, name: matched.name, email: matched.email }
            : null,
          matchType: matchById
            ? ("github_id" as const)
            : matchByLogin
              ? ("login" as const)
              : ("none" as const),
        };
      });

      return {
        org: orgDetails,
        repos: repos
          .filter((r) => !r.archived)
          .map((r) => ({
            ...r,
            alreadyImported: importedRepoIds.has(r.id),
          })),
        members: annotatedMembers,
        existingTeam,
      };
    }),

  executeImport: protectedProcedure
    .input(executeGitHubImportSchema)
    .mutation(async ({ ctx, input }) => {
      const octokit = await createGitHubClient(ctx.userId);

      let orgName: string;
      let orgDescription: string | null;
      let orgId: number;

      if (input.isPersonal) {
        const profile = await getGitHubProfile(octokit);
        orgName = profile.name || profile.login;
        orgDescription = `${profile.login}'s repositories`;
        orgId = 0;
      } else {
        const orgDetails = await getOrgDetails(octokit, input.orgLogin);
        orgName = orgDetails.name;
        orgDescription = orgDetails.description;
        orgId = orgDetails.id;
      }

      let projectsCreated = 0;
      let membersImported = 0;
      let membersSkipped = 0;

      // 1. Upsert team from org/personal
      let team: any;
      if (!input.isPersonal) {
        // Org import — githubOrgId is unique, safe to upsert
        const slug = await generateUniqueSlug(
          ctx.prisma,
          input.orgLogin,
          "team"
        );
        team = await ctx.prisma.team.upsert({
          where: { githubOrgId: orgId },
          update: {
            name: orgName,
            description: orgDescription,
          },
          create: {
            name: orgName,
            slug,
            description: orgDescription,
            githubOrgId: orgId,
            githubOrgLogin: input.orgLogin,
            githubImportedAt: new Date(),
          },
        });
      } else {
        // Personal import — use ~login prefix to differentiate from org logins
        const personalOrgLogin = `~${input.orgLogin}`;
        team = await ctx.prisma.team.findUnique({
          where: { githubOrgLogin: personalOrgLogin },
        });

        if (team) {
          team = await ctx.prisma.team.update({
            where: { id: team.id },
            data: {
              name: orgName,
              description: orgDescription,
            },
          });
        } else {
          const slug = await generateUniqueSlug(
            ctx.prisma,
            input.orgLogin,
            "team"
          );
          team = await ctx.prisma.team.create({
            data: {
              name: orgName,
              slug,
              description: orgDescription,
              githubOrgId: null,
              githubOrgLogin: personalOrgLogin,
              githubImportedAt: new Date(),
            },
          });
        }
      }

      // 2. Ensure importing user is OWNER
      const existingMembership = await ctx.prisma.teamMember.findUnique({
        where: {
          userId_teamId: { userId: ctx.userId, teamId: team.id },
        },
      });
      if (!existingMembership) {
        await ctx.prisma.teamMember.create({
          data: { userId: ctx.userId, teamId: team.id, role: "OWNER" },
        });
      }

      // 3. Import selected repos as projects
      if (input.selectedRepoIds.length > 0) {
        const allRepos = input.isPersonal
          ? await listUserRepos(octokit)
          : await listOrgRepos(octokit, input.orgLogin);
        const selectedRepos = allRepos.filter((r) =>
          input.selectedRepoIds.includes(r.id)
        );

        // Batch-check which repos are already imported (single query)
        const existingProjects = await ctx.prisma.project.findMany({
          where: {
            githubRepoId: { in: selectedRepos.map((r) => r.id) },
          },
          select: { githubRepoId: true },
        });
        const alreadyImportedIds = new Set(
          existingProjects.map((p) => p.githubRepoId),
        );

        const reposToImport = selectedRepos.filter(
          (r) => !alreadyImportedIds.has(r.id),
        );

        for (const repo of reposToImport) {
          const projectSlug = await generateUniqueSlug(
            ctx.prisma,
            repo.name,
            "project"
          );
          await ctx.prisma.project.create({
            data: {
              name: repo.name,
              slug: projectSlug,
              description: repo.description,
              teamId: team.id,
              status: repo.archived ? "ARCHIVED" : "ACTIVE",
              githubRepoId: repo.id,
              githubRepoFullName: repo.fullName,
              githubImportedAt: new Date(),
            },
          });
          projectsCreated++;
        }
      }

      // 3b. Auto-register webhooks on imported repos (parallelized)
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
      const appUrl = process.env.AUTH_URL || process.env.NEXT_PUBLIC_OMNITOOL_WEB_URL;
      if (webhookSecret && appUrl && input.selectedRepoIds.length > 0) {
        const webhookUrl = `${appUrl}/api/webhooks/github`;
        const allReposForHooks = input.isPersonal
          ? await listUserRepos(octokit)
          : await listOrgRepos(octokit, input.orgLogin);
        const selectedForHooks = allReposForHooks.filter((r) =>
          input.selectedRepoIds.includes(r.id)
        );

        // Register webhooks in parallel (GitHub API calls are independent)
        await Promise.allSettled(
          selectedForHooks.map(async (repo) => {
            try {
              const [owner, repoName] = repo.fullName.split("/");
              if (owner && repoName) {
                await createRepoWebhook(
                  octokit,
                  owner,
                  repoName,
                  webhookUrl,
                  webhookSecret
                );
              }
            } catch (err: any) {
              // 422 = webhook already exists on this repo — that's fine
              if (err.status !== 422) {
                console.error(
                  `[GitHub Import] Failed to register webhook for ${repo.fullName}:`,
                  err.message
                );
              }
            }
          }),
        );
      }

      // 4. Import members (skip for personal repos)
      if (input.importMembers && !input.isPersonal) {
        const orgMembers = await listOrgMembers(octokit, input.orgLogin);

        // Batch-resolve existing users by GitHub ID/login (single query)
        const existingUsers = await ctx.prisma.user.findMany({
          where: {
            OR: [
              { githubUserId: { in: orgMembers.map((m) => m.id) } },
              { githubLogin: { in: orgMembers.map((m) => m.login) } },
            ],
          },
        });
        const userByGithubId = new Map(
          existingUsers
            .filter((u) => u.githubUserId)
            .map((u) => [u.githubUserId!, u]),
        );
        const userByLogin = new Map(
          existingUsers
            .filter((u) => u.githubLogin)
            .map((u) => [u.githubLogin!, u]),
        );

        // Batch-check existing team memberships
        const existingMemberships = await ctx.prisma.teamMember.findMany({
          where: {
            teamId: team.id,
            userId: { in: existingUsers.map((u) => u.id) },
          },
          select: { userId: true },
        });
        const alreadyMembers = new Set(existingMemberships.map((m) => m.userId));

        for (const member of orgMembers) {
          let user =
            userByGithubId.get(member.id) ?? userByLogin.get(member.login) ?? null;

          if (!user) {
            // Create placeholder user
            try {
              user = await ctx.prisma.user.create({
                data: {
                  email: `github+${member.login}@placeholder.omnitool.dev`,
                  name: member.login,
                  avatarUrl: member.avatarUrl,
                  githubUserId: member.id,
                  githubLogin: member.login,
                  role: "MEMBER",
                },
              });
            } catch (e: any) {
              if (e.code === "P2002") {
                // Unique constraint violation — another import created this user concurrently
                user = await ctx.prisma.user.findFirst({
                  where: {
                    OR: [
                      { githubUserId: member.id },
                      { githubLogin: member.login },
                    ],
                  },
                });
                if (!user) throw e; // shouldn't happen, but safety
              } else {
                throw e;
              }
            }
          } else {
            // Update github info if needed
            if (!user.githubUserId || !user.githubLogin) {
              try {
                await ctx.prisma.user.update({
                  where: { id: user.id },
                  data: {
                    githubUserId: user.githubUserId ?? member.id,
                    githubLogin: user.githubLogin ?? member.login,
                    ...(user.avatarUrl ? {} : { avatarUrl: member.avatarUrl }),
                  },
                });
              } catch (e: any) {
                // Ignore unique constraint violations — another user may have claimed these
                if (e.code !== "P2002") throw e;
              }
            }
          }

          // Add to team if not already a member
          if (!alreadyMembers.has(user.id)) {
            await ctx.prisma.teamMember.create({
              data: {
                userId: user.id,
                teamId: team.id,
                role: "MEMBER",
              },
            });
            membersImported++;
          } else {
            membersSkipped++;
          }
        }
      }

      // 5. Create import log
      await ctx.prisma.gitHubImportLog.create({
        data: {
          userId: ctx.userId,
          githubOrgId: orgId,
          githubOrgLogin: input.orgLogin,
          teamId: team.id,
          projectsImported: projectsCreated,
          membersImported,
          membersSkipped,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      return {
        teamId: team.id,
        teamSlug: team.slug,
        teamName: team.name,
        projectsCreated,
        membersImported,
        membersSkipped,
      };
    }),
});

const notionRouter = createTRPCRouter({
  // List pages available for import
  listPages: protectedProcedure
    .input(z.object({ cursor: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const account = await ctx.prisma.connectedAccount.findUnique({
        where: { userId_provider: { userId: ctx.userId, provider: "NOTION" } },
      });
      if (!account) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Notion account not connected",
        });
      }

      const client = await createNotionClient(ctx.userId);
      const result = await listNotionPages(client, input?.cursor ?? undefined);

      // Check which pages are already imported
      const existingNotes = await ctx.prisma.note.findMany({
        where: { notionPageId: { in: result.pages.map((p) => p.id) } },
        select: { notionPageId: true },
      });
      const importedIds = new Set(existingNotes.map((n) => n.notionPageId));

      return {
        pages: result.pages.map((p) => ({
          ...p,
          alreadyImported: importedIds.has(p.id),
        })),
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      };
    }),

  // Search pages by query
  searchPages: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const account = await ctx.prisma.connectedAccount.findUnique({
        where: { userId_provider: { userId: ctx.userId, provider: "NOTION" } },
      });
      if (!account) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Notion account not connected",
        });
      }

      const client = await createNotionClient(ctx.userId);
      const results = await searchNotionPages(client, input.query);

      const pages = results.map((page: any) => {
        let title = "Untitled";
        if (page.properties) {
          const titleProp = Object.values(page.properties).find(
            (p: any) => p.type === "title"
          ) as any;
          if (titleProp?.title?.[0]?.plain_text) {
            title = titleProp.title.map((t: any) => t.plain_text).join("");
          }
        }
        return {
          id: page.id,
          title,
          icon: page.icon?.emoji || page.icon?.external?.url || null,
          lastEditedTime: page.last_edited_time,
          url: page.url,
          parentType: page.parent?.type || null,
        };
      });

      // Check which already imported
      const existingNotes = await ctx.prisma.note.findMany({
        where: { notionPageId: { in: pages.map((p: any) => p.id) } },
        select: { notionPageId: true },
      });
      const importedIds = new Set(existingNotes.map((n: any) => n.notionPageId));

      return {
        pages: pages.map((p: any) => ({
          ...p,
          alreadyImported: importedIds.has(p.id),
        })),
      };
    }),

  // Import selected pages as notes
  importPages: protectedProcedure
    .input(importNotionPagesSchema)
    .mutation(async ({ ctx, input }) => {
      const client = await createNotionClient(ctx.userId);
      let imported = 0;
      let skipped = 0;

      // Resolve target teamspace. If not specified, default to the caller's
      // PERSONAL teamspace (provisioned by `auth()`). Validate membership.
      let targetTeamId = input.teamId ?? null;
      if (!targetTeamId) {
        const me = await ctx.prisma.user.findUnique({
          where: { id: ctx.userId },
          select: { personalTeamId: true },
        });
        targetTeamId = me?.personalTeamId ?? null;
      }
      if (!targetTeamId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No personal teamspace — please re-sign-in to provision one before importing.",
        });
      }
      const membership = await ctx.prisma.teamMember.findUnique({
        where: {
          userId_teamId: { userId: ctx.userId, teamId: targetTeamId },
        },
        select: { teamId: true },
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of the destination teamspace",
        });
      }

      // Optional parent note must live inside the destination teamspace.
      let rootParentId: string | null = input.parentId ?? null;
      if (rootParentId) {
        const parent = await ctx.prisma.note.findFirst({
          where: { id: rootParentId, teamId: targetTeamId },
          select: { id: true },
        });
        if (!parent) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Parent note must be in the destination teamspace",
          });
        }
      }

      // Map of Notion page id (with and without dashes) → Omnitool note id.
      // Pre-populated from any existing imports so we can re-link to them.
      // Notion page ids appear in URLs both with dashes (`a8e1...-...`) and
      // without (raw 32 hex chars), so we register both forms.
      const idMap = new Map<string, string>();

      function registerId(notionId: string, noteId: string) {
        const lower = notionId.toLowerCase();
        idMap.set(lower, noteId);
        idMap.set(lower.replace(/-/g, ""), noteId);
      }

      // Seed map with previously-imported pages so cross-references resolve.
      // We look across the destination teamspace so a teammate's imports are
      // also reused as link targets.
      const existingAll = await ctx.prisma.note.findMany({
        where: { teamId: targetTeamId, notionPageId: { not: null } },
        select: { id: true, notionPageId: true },
      });
      for (const e of existingAll) {
        if (e.notionPageId) registerId(e.notionPageId, e.id);
      }

      // Phase 1: import each selected page (markdown + blocks). Tree linkage
      // and link rewriting happen in phase 2 once every id is in the map.
      type ImportedRecord = {
        notionPageId: string;
        noteId: string;
        markdown: string;
        blocks: unknown[];
      };
      const importedRecords: ImportedRecord[] = [];

      for (const pageId of input.selectedPageIds) {
        try {
          const existing = await ctx.prisma.note.findFirst({
            where: { notionPageId: pageId, teamId: targetTeamId },
            select: { id: true },
          });
          if (existing) {
            skipped++;
            registerId(pageId, existing.id);
            continue;
          }

          const meta = await getNotionPageMeta(client, pageId);

          let markdown = "";
          try {
            markdown = await notionBlocksToMarkdown(client, pageId);
          } catch (err) {
            console.error(
              "[notion.importPages] notionBlocksToMarkdown failed",
              { pageId, err },
            );
            throw err;
          }

          let blocknoteBlocks: unknown[] = [];
          try {
            blocknoteBlocks = await markdownToNoteBlocks(markdown);
          } catch (err) {
            console.error(
              "[notion.importPages] markdownToNoteBlocks failed",
              { pageId, mdLen: markdown.length, err },
            );
            throw err;
          }

          const contentText = blocksToPlainText(blocknoteBlocks);

          const created = await ctx.prisma.note.create({
            data: {
              title: meta.title || "Untitled",
              content: markdown,
              contentText: contentText || markdown,
              blocks: blocknoteBlocks as any,
              authorId: ctx.userId,
              teamId: targetTeamId,
              parentId: rootParentId,
              notionPageId: pageId,
              notionUrl: meta.url,
            },
            select: { id: true },
          });

          registerId(pageId, created.id);
          importedRecords.push({
            notionPageId: pageId,
            noteId: created.id,
            markdown,
            blocks: blocknoteBlocks,
          });
          imported++;
        } catch (err) {
          console.error("[notion.importPages] page failed", {
            pageId,
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
          throw err;
        }
      }

      // Phase 2a: parent/child tree.
      // For every imported page whose Notion parent is also in our id map,
      // set the Omnitool note's `parentId` so the hierarchy survives import.
      for (const rec of importedRecords) {
        try {
          const notionParent = await getNotionParentPageId(
            client,
            rec.notionPageId,
          );
          if (!notionParent) continue;
          const omniParent = idMap.get(notionParent.toLowerCase());
          if (!omniParent || omniParent === rec.noteId) continue;
          await ctx.prisma.note.update({
            where: { id: rec.noteId },
            data: { parentId: omniParent },
          });
        } catch (err) {
          // Non-fatal — log + keep going.
          console.error("[notion.importPages] tree link failed", {
            pageId: rec.notionPageId,
            err,
          });
        }
      }

      // Phase 2b: rewrite Notion links in each imported note's blocks JSON
      // to point at the corresponding Omnitool note. Works for:
      //   - `notion://page/{id}` (emitted by our custom child_page transformer)
      //   - `https://www.notion.so/...{id-with-or-without-dashes}` (regular
      //      page URLs Notion includes in links between pages)
      for (const rec of importedRecords) {
        try {
          const rewritten = rewriteNotionLinks(rec.blocks, idMap);
          if (rewritten.changed) {
            await ctx.prisma.note.update({
              where: { id: rec.noteId },
              data: { blocks: rewritten.blocks as any },
            });
          }
        } catch (err) {
          console.error("[notion.importPages] link rewrite failed", {
            pageId: rec.notionPageId,
            err,
          });
        }
      }

      return { imported, skipped };
    }),

  /**
   * Re-process every previously-imported Notion note for the current user
   * by running its stored markdown (`note.content`) through the latest
   * markdown→blocks converter. Use this to clean up notes that were
   * imported before HTML-toggle stripping / image / table support was
   * added — the original markdown survives untouched in `note.content`,
   * so we can rebuild `blocks` + `contentText` losslessly.
   *
   * Returns counts so the UI can show "Cleaned N notes" in the toast.
   */
  recleanImported: protectedProcedure.mutation(async ({ ctx }) => {
    const notes = await ctx.prisma.note.findMany({
      where: {
        authorId: ctx.userId,
        notionPageId: { not: null },
        deletedAt: null,
        content: { not: null },
      },
      select: { id: true, content: true, notionPageId: true },
    });

    let cleaned = 0;
    let skipped = 0;
    let failed = 0;

    // Re-seed the id map with all known Notion → Omnitool note ids so the
    // re-clean also picks up any cross-page links we couldn't resolve at
    // first import time (e.g. when child was imported before parent).
    const idMap = new Map<string, string>();
    const allLinked = await ctx.prisma.note.findMany({
      where: { authorId: ctx.userId, notionPageId: { not: null } },
      select: { id: true, notionPageId: true },
    });
    for (const n of allLinked) {
      if (n.notionPageId) {
        const lower = n.notionPageId.toLowerCase();
        idMap.set(lower, n.id);
        idMap.set(lower.replace(/-/g, ""), n.id);
      }
    }

    for (const n of notes) {
      const md = n.content ?? "";
      if (!md.trim()) {
        skipped++;
        continue;
      }
      try {
        const blocks = await markdownToNoteBlocks(md);
        const rewritten = rewriteNotionLinks(blocks, idMap);
        const finalBlocks = rewritten.blocks as unknown[];
        const contentText = blocksToPlainText(finalBlocks);
        await ctx.prisma.note.update({
          where: { id: n.id },
          data: {
            blocks: finalBlocks as any,
            contentText: contentText || md,
          },
        });
        cleaned++;
      } catch (err) {
        console.error("[notion.recleanImported] failed", {
          noteId: n.id,
          err,
        });
        failed++;
      }
    }

    return { cleaned, skipped, failed, total: notes.length };
  }),
});

export const integrationRouter = createTRPCRouter({
  listConnected: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.connectedAccount.findMany({
      where: { userId: ctx.userId },
      select: {
        provider: true,
        providerAccountId: true,
        metadata: true,
        scopes: true,
        createdAt: true,
      },
    });
  }),

  disconnect: protectedProcedure
    .input(disconnectIntegrationSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.connectedAccount.delete({
        where: {
          userId_provider: {
            userId: ctx.userId,
            provider: input.provider,
          },
        },
      });

      // Clear GitHub-specific fields
      if (input.provider === "GITHUB") {
        await ctx.prisma.user.update({
          where: { id: ctx.userId },
          data: { githubUserId: null, githubLogin: null },
        });
      }

      return { success: true };
    }),

  github: githubRouter,
  notion: notionRouter,
});
