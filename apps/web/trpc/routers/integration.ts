import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";
import {
  executeGitHubImportSchema,
  disconnectIntegrationSchema,
} from "@omnitool/shared/validators";
import {
  createGitHubClient,
  getGitHubProfile,
  listUserOrgs,
  listUserRepos,
  getOrgDetails,
  listOrgRepos,
  listOrgMembers,
} from "@omnitool/integrations";

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

    // Include personal account as first option
    const personalEntry = {
      id: 0, // sentinel
      login: profile.login,
      description: "Your personal repositories",
      avatarUrl: profile.avatarUrl ?? null,
      isPersonal: true as const,
      alreadyImported: false,
      existingTeam: null as { id: string; name: string } | null,
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
      const existingTeam = await ctx.prisma.team.findFirst({
        where: { githubOrgId: orgDetails.id },
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
      let team = !input.isPersonal
        ? await ctx.prisma.team.findFirst({
            where: { githubOrgId: orgId },
          })
        : await ctx.prisma.team.findFirst({
            where: { githubOrgLogin: input.orgLogin, githubOrgId: 0 },
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
            githubOrgId: orgId,
            githubOrgLogin: input.orgLogin,
            githubImportedAt: new Date(),
          },
        });
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

        for (const repo of selectedRepos) {
          // Skip if already imported
          const existing = await ctx.prisma.project.findFirst({
            where: { githubRepoId: repo.id },
          });
          if (existing) continue;

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

      // 4. Import members (skip for personal repos)
      if (input.importMembers && !input.isPersonal) {
        const orgMembers = await listOrgMembers(octokit, input.orgLogin);

        for (const member of orgMembers) {
          // Try to find existing user
          let user = await ctx.prisma.user.findFirst({
            where: {
              OR: [
                { githubUserId: member.id },
                { githubLogin: member.login },
              ],
            },
          });

          if (!user) {
            // Create placeholder user
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
          } else {
            // Update github info if needed
            if (!user.githubUserId || !user.githubLogin) {
              await ctx.prisma.user.update({
                where: { id: user.id },
                data: {
                  githubUserId: member.id,
                  githubLogin: member.login,
                  ...(user.avatarUrl ? {} : { avatarUrl: member.avatarUrl }),
                },
              });
            }
          }

          // Add to team if not already a member
          const existingTeamMember =
            await ctx.prisma.teamMember.findUnique({
              where: {
                userId_teamId: { userId: user.id, teamId: team.id },
              },
            });

          if (!existingTeamMember) {
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
});
