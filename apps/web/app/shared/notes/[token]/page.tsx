import { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@omnitool/database";
import { SharedNoteContent } from "./shared-note-content";

interface PageProps {
  params: Promise<{ token: string }>;
}

async function getSharedNote(token: string) {
  const share = await prisma.noteShare.findUnique({
    where: { token },
    include: {
      note: {
        include: {
          author: { select: { name: true, avatarUrl: true } },
          tags: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });

  if (!share) return null;

  // Check expiration
  if (share.expiresAt && share.expiresAt < new Date()) return null;

  // Check the note is not deleted
  if (share.note.deletedAt) return null;

  return {
    id: share.note.id,
    title: share.note.title,
    emoji: share.note.emoji,
    blocks: share.note.blocks,
    contentText: share.note.contentText,
    createdAt: share.note.createdAt,
    updatedAt: share.note.updatedAt,
    author: share.note.author,
    tags: share.note.tags,
  };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const note = await getSharedNote(token);
  if (!note) {
    return { title: "Note not found - OmniTool" };
  }
  const description = note.contentText
    ? note.contentText.slice(0, 200)
    : "Shared note from OmniTool";
  return {
    title: `${note.title} - Shared from OmniTool`,
    description,
    openGraph: {
      title: note.title,
      description,
      type: "article",
    },
  };
}

export default async function SharedNotePage({ params }: PageProps) {
  const { token } = await params;
  const note = await getSharedNote(token);

  if (!note) {
    notFound();
  }

  return <SharedNoteContent note={note} />;
}
