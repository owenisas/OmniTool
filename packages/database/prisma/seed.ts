import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Ensure DATABASE_URL is set for local PostgreSQL development.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:5432/omnitool?schema=public";
}

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create sample admin user. Password hashes are opt-in for local seeds only.
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;
  const hashedPassword = seedAdminPassword
    ? await bcrypt.hash(seedAdminPassword, 12)
    : null;
  const admin = await prisma.user.upsert({
    where: { email: "admin@omnitool.dev" },
    update: {},
    create: {
      email: "admin@omnitool.dev",
      name: "Admin User",
      passwordHash: hashedPassword,
      role: "ADMIN",
    },
  });
  console.log("Created admin user:", admin.email);

  // Create a demo team
  const team = await prisma.team.upsert({
    where: { slug: "engineering" },
    update: {},
    create: {
      name: "Engineering",
      slug: "engineering",
      description: "Core engineering team",
    },
  });
  console.log("Created team:", team.name);

  // Add admin to team
  await prisma.teamMember.upsert({
    where: { userId_teamId: { userId: admin.id, teamId: team.id } },
    update: {},
    create: {
      userId: admin.id,
      teamId: team.id,
      role: "OWNER",
    },
  });

  // Create a demo project
  const project = await prisma.project.upsert({
    where: { slug: "omnitool-mvp" },
    update: {},
    create: {
      name: "OmniTool MVP",
      slug: "omnitool-mvp",
      description: "Building the OmniTool application",
      teamId: team.id,
      status: "ACTIVE",
    },
  });
  console.log("Created project:", project.name);

  // Create sample tasks
  const taskTitles = [
    { title: "Set up authentication", status: "DONE" as const, points: 5 },
    { title: "Build dashboard layout", status: "DONE" as const, points: 3 },
    { title: "Create project CRUD", status: "IN_PROGRESS" as const, points: 8 },
    { title: "Implement kanban board", status: "IN_PROGRESS" as const, points: 13 },
    { title: "Add time tracking", status: "TODO" as const, points: 8 },
    { title: "Build performance charts", status: "TODO" as const, points: 5 },
    { title: "Integrate AI chat", status: "TODO" as const, points: 13 },
  ];

  for (let i = 0; i < taskTitles.length; i++) {
    await prisma.task.create({
      data: {
        title: taskTitles[i].title,
        status: taskTitles[i].status,
        storyPoints: taskTitles[i].points,
        priority: "MEDIUM",
        projectId: project.id,
        creatorId: admin.id,
        assigneeId: admin.id,
        position: i,
        completedAt: taskTitles[i].status === "DONE" ? new Date() : null,
      },
    });
  }
  console.log("Created sample tasks");

  // Create a second team for testing the team switcher
  const designTeam = await prisma.team.upsert({
    where: { slug: "design" },
    update: {},
    create: {
      name: "Design",
      slug: "design",
      description: "Product design team",
    },
  });
  console.log("Created team:", designTeam.name);

  // Add admin to design team
  await prisma.teamMember.upsert({
    where: { userId_teamId: { userId: admin.id, teamId: designTeam.id } },
    update: {},
    create: {
      userId: admin.id,
      teamId: designTeam.id,
      role: "OWNER",
    },
  });

  // Create a project under design team
  await prisma.project.upsert({
    where: { slug: "brand-refresh" },
    update: {},
    create: {
      name: "Brand Refresh",
      slug: "brand-refresh",
      description: "Company brand refresh project",
      teamId: designTeam.id,
      status: "ACTIVE",
    },
  });
  console.log("Created design project: Brand Refresh");

  // Create sample labels
  const labels = [
    { name: "bug", color: "#ef4444" },
    { name: "feature", color: "#3b82f6" },
    { name: "improvement", color: "#8b5cf6" },
    { name: "documentation", color: "#10b981" },
    { name: "urgent", color: "#f59e0b" },
  ];

  for (const label of labels) {
    await prisma.label.upsert({
      where: { name: label.name },
      update: {},
      create: label,
    });
  }
  console.log("Created labels");

  // Seed built-in note templates
  const builtInTemplates = [
    { title: "Meeting Notes", emoji: "📋", description: "Structured meeting notes with attendees, agenda, and action items", category: "meetings" },
    { title: "Weekly Review", emoji: "📊", description: "Weekly progress review with wins, challenges, and next week plans", category: "reviews" },
    { title: "Design Document", emoji: "🎨", description: "Technical design doc with problem, proposal, alternatives, and timeline", category: "engineering" },
    { title: "Bug Triage", emoji: "🐛", description: "Bug report template with repro steps, expected/actual behavior, and severity", category: "engineering" },
    { title: "Sprint Retrospective", emoji: "🔄", description: "Sprint retro with what went well, what didn't, and improvements", category: "agile" },
  ];

  for (const tmpl of builtInTemplates) {
    await prisma.noteTemplate.upsert({
      where: { id: `builtin-${tmpl.category}-${tmpl.title.toLowerCase().replace(/\s+/g, "-")}` },
      update: {},
      create: {
        id: `builtin-${tmpl.category}-${tmpl.title.toLowerCase().replace(/\s+/g, "-")}`,
        title: tmpl.title,
        emoji: tmpl.emoji,
        description: tmpl.description,
        category: tmpl.category,
        isBuiltIn: true,
        blocks: [],
        authorId: admin.id,
      },
    });
  }
  console.log("Created built-in note templates");

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
