import { PrismaClient } from "../src/generated/client";
import bcrypt from "bcryptjs";

// Ensure DATABASE_URL is set for local PostgreSQL development.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    ***REMOVED***;
}

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create admin user
  const hashedPassword = await bcrypt.hash("admin123!", 12);
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
