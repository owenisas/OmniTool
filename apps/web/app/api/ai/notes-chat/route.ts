import { auth } from "@/lib/auth";
import { getOmniLanguageModel } from "@/lib/ai/language-model";
import { notesAgentConfig } from "@omnitool/ai/agents";
import { notesChatSystemPrompt } from "@omnitool/ai/prompts";
import { createNotesChatTools } from "@omnitool/ai";
import { prisma } from "@omnitool/database";
import { streamText } from "ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type StreamTextModel = Parameters<typeof streamText>[0]["model"];

type IncomingMessage = {
  role?: string;
  content?: unknown;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = getOmniLanguageModel();
  if (!resolved) {
    return NextResponse.json(
      {
        error:
          "AI is not configured. Set NVIDIA_API_KEY or ANTHROPIC_API_KEY in the server environment.",
      },
      { status: 503 }
    );
  }

  try {
    const body = (await req.json()) as {
      messages?: IncomingMessage[];
      noteId?: string;
      conversationId?: string;
    };

    const raw = Array.isArray(body.messages) ? body.messages : [];
    const messages = raw
      .filter(
        (m): m is { role: string; content: string } =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string"
      )
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "Missing messages" },
        { status: 400 }
      );
    }

    const noteId = body.noteId || undefined;

    // Build note context for the system prompt
    let noteContext = "";
    if (noteId) {
      const activeNote = await prisma.note.findFirst({
        where: { id: noteId, authorId: session.user.id },
        select: { id: true, title: true, contentText: true },
      });
      if (activeNote) {
        const truncatedContent = activeNote.contentText.slice(0, 8000);
        noteContext = `\n\n---\nCurrently open note:\nTitle: "${activeNote.title}" (ID: ${activeNote.id})\nContent:\n${truncatedContent}${activeNote.contentText.length > 8000 ? "\n[...truncated, use readNote for full content]" : ""}`;
      }
    }

    const system = notesChatSystemPrompt + noteContext;

    // Resolve or create conversation
    let conversationId = body.conversationId;

    if (conversationId) {
      const existing = await prisma.aIConversation.findFirst({
        where: { id: conversationId, userId: session.user.id },
      });
      if (!existing) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }
    } else {
      const firstUserMsg = messages.find((m) => m.role === "user");
      const autoTitle = firstUserMsg
        ? firstUserMsg.content.slice(0, 100) +
          (firstUserMsg.content.length > 100 ? "..." : "")
        : "Notes conversation";

      const conversation = await prisma.aIConversation.create({
        data: {
          userId: session.user.id,
          title: autoTitle,
          agentType: notesAgentConfig.agentType,
          noteId: noteId || null,
        },
      });
      conversationId = conversation.id;
    }

    // Save incoming user message
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    if (lastUserMessage) {
      await prisma.aIMessage.create({
        data: {
          conversationId,
          role: "user",
          content: lastUserMessage.content,
        },
      });
    }

    const tools = createNotesChatTools({
      userId: session.user.id,
      noteId,
    });

    const result = streamText({
      model: resolved.model as StreamTextModel,
      system,
      messages,
      tools,
      maxSteps: notesAgentConfig.maxSteps,
      temperature: 0.3,
      onFinish: async ({ text, toolCalls, toolResults, usage }) => {
        const content =
          text?.trim() ||
          "I executed the requested tools. Ask if you need more details.";

        const toolCallsJson =
          toolCalls && toolCalls.length > 0
            ? JSON.stringify(toolCalls)
            : null;
        const toolResultsJson =
          toolResults && toolResults.length > 0
            ? JSON.stringify(toolResults)
            : null;

        await prisma.aIMessage.create({
          data: {
            conversationId: conversationId!,
            role: "assistant",
            content,
            toolCalls: toolCallsJson,
            toolResults: toolResultsJson,
            tokenCount: usage?.totalTokens ?? null,
          },
        });

        await prisma.aIConversation.update({
          where: { id: conversationId! },
          data: { updatedAt: new Date() },
        });
      },
    });

    return result.toDataStreamResponse({
      headers: {
        "X-Conversation-Id": conversationId,
      },
    });
  } catch (error) {
    console.error("[api/ai/notes-chat]", error);
    const message =
      error instanceof Error ? error.message : "Failed to process request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
