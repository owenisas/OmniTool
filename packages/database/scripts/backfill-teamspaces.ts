/**
 * One-time backfill: gives every user a PERSONAL teamspace, then assigns
 * every existing Note to its author's personal teamspace.
 *
 * Idempotent — safe to run multiple times. Run with:
 *
 *   pnpm --filter @omnitool/database exec tsx scripts/backfill-teamspaces.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

function personalSlug(userId: string): string {
  return `personal-${userId}`.slice(0, 191);
}

function personalName(displayName: string | null | undefined): string {
  const base = (displayName ?? "").trim();
  return base ? `${base}'s notes` : "Personal notes";
}

async function backfillPersonalTeams(): Promise<Map<string, string>> {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, personalTeamId: true },
  });

  const personalByUser = new Map<string, string>();
  let created = 0;
  let linked = 0;
  let alreadyOk = 0;

  for (const user of users) {
    if (user.personalTeamId) {
      personalByUser.set(user.id, user.personalTeamId);
      alreadyOk += 1;
      continue;
    }

    // Re-use an existing personal team for this user if one exists (idempotency).
    const existing = await prisma.team.findFirst({
      where: { kind: "PERSONAL", ownerId: user.id },
      select: { id: true },
    });

    let teamId: string;
    if (existing) {
      teamId = existing.id;
    } else {
      const team = await prisma.team.create({
        data: {
          name: personalName(user.name),
          slug: personalSlug(user.id),
          kind: "PERSONAL",
          ownerId: user.id,
          members: {
            create: { userId: user.id, role: "OWNER" },
          },
        },
        select: { id: true },
      });
      teamId = team.id;
      created += 1;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { personalTeamId: teamId },
    });
    linked += 1;

    personalByUser.set(user.id, teamId);
  }

  console.log(
    `[teamspaces] users: ${users.length} (already-linked: ${alreadyOk}, new personal teams created: ${created}, back-pointer linked: ${linked})`,
  );
  return personalByUser;
}

async function backfillNoteTeamIds(personalByUser: Map<string, string>): Promise<void> {
  // Notes that still don't have a teamId.
  const orphan = await prisma.note.findMany({
    where: { teamId: null },
    select: { id: true, authorId: true, linkedProjectId: true },
  });

  if (orphan.length === 0) {
    console.log("[teamspaces] all notes already have teamId — nothing to backfill.");
    return;
  }

  // For notes linked to a Project, prefer the project's teamId; otherwise fall
  // back to the author's personal teamspace.
  const projectTeamCache = new Map<string, string>();

  let assigned = 0;
  let projectScoped = 0;

  for (const note of orphan) {
    let teamId: string | undefined;

    if (note.linkedProjectId) {
      let projTeam = projectTeamCache.get(note.linkedProjectId);
      if (projTeam === undefined) {
        const proj = await prisma.project.findUnique({
          where: { id: note.linkedProjectId },
          select: { teamId: true },
        });
        projTeam = proj?.teamId ?? "";
        projectTeamCache.set(note.linkedProjectId, projTeam);
      }
      if (projTeam) {
        teamId = projTeam;
        projectScoped += 1;
      }
    }

    if (!teamId) {
      teamId = personalByUser.get(note.authorId);
    }

    if (!teamId) {
      console.warn(
        `[teamspaces] skipping note ${note.id} — no personal teamspace for author ${note.authorId}`,
      );
      continue;
    }

    await prisma.note.update({
      where: { id: note.id },
      data: { teamId },
    });
    assigned += 1;
  }

  console.log(
    `[teamspaces] notes: ${orphan.length} pending (assigned: ${assigned}, project-scoped: ${projectScoped})`,
  );
}

async function main(): Promise<void> {
  console.log("[teamspaces] backfill starting…");
  const personalByUser = await backfillPersonalTeams();
  await backfillNoteTeamIds(personalByUser);
  console.log("[teamspaces] backfill done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
