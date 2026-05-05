"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Loader2 } from "lucide-react";

export default function NewNotePage() {
  const router = useRouter();
  const createdRef = useRef(false);

  const createNote = trpc.note.create.useMutation({
    onSuccess: (note) => {
      router.replace(`/notes/${note.id}`);
    },
  });

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;

    createNote.mutate({
      title: "Untitled",
      blocks: [
        {
          type: "paragraph",
          props: {
            textColor: "default",
            textAlignment: "left",
            backgroundColor: "default",
          },
          content: [],
        },
      ],
      contentText: "",
    });
  }, []);

  return (
    <div className="flex justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
