import { serverTrpc } from "@/trpc/server";
import { notFound } from "next/navigation";
import { ProjectBoardClient } from "./project-board-client";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trpc = await serverTrpc();
  const project = await trpc.project.getBySlug({ slug });

  if (!project) notFound();

  return (
    <ProjectBoardClient
      project={{
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        status: project.status,
        teamName: project.team.name,
        taskCount: project._count.tasks,
        issueCount: project._count.issues,
      }}
    />
  );
}
