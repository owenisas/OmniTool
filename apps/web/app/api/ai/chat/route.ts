import { auth } from "@/lib/auth";
import { getOmniLanguageModel } from "@/lib/ai/language-model";
import { chatAgentConfig } from "@omnitool/ai/agents";
import { chatSystemPrompt } from "@omnitool/ai/prompts";
import { createChatTools } from "@omnitool/ai";
import { prisma } from "@omnitool/database";
import { generateText, stepCountIs } from "ai";
import { apiLimiter } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GenerateTextModel = Parameters<typeof generateText>[0]["model"];

type IncomingMessage = {
  role?: string;
  content?: unknown;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 100 req/min per user
  if (apiLimiter) {
    const { success } = await apiLimiter.limit(`ai-chat:${session.user.id}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Try again shortly." },
        { status: 429 },
      );
    }
  }

  const resolved = getOmniLanguageModel();
  if (!resolved) {
    return NextResponse.json(
      {
        error:
          "AI is not configured. Set NVIDIA_API_KEY (NVIDIA NIM) or ANTHROPIC_API_KEY in the server environment.",
      },
      { status: 503 }
    );
  }

  try {
    const body = (await req.json()) as {
      messages?: IncomingMessage[];
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
        { error: "Missing user or assistant messages" },
        { status: 400 }
      );
    }

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
      // Auto-generate title from the first user message
      const firstUserMsg = messages.find((m) => m.role === "user");
      const autoTitle = firstUserMsg
        ? firstUserMsg.content.slice(0, 100) +
          (firstUserMsg.content.length > 100 ? "..." : "")
        : "New conversation";

      const conversation = await prisma.aIConversation.create({
        data: {
          userId: session.user.id,
          title: autoTitle,
          agentType: "chat",
        },
      });
      conversationId = conversation.id;
    }

    // Save the incoming user message (only the last one to avoid duplicating history)
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

    const tools = createChatTools({ userId: session.user.id });

    const result = await generateText({
      model: resolved.model as GenerateTextModel,
      system: chatSystemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(chatAgentConfig.maxSteps),
      temperature: 0.2,
    });

    const content =
      result.text?.trim() ||
      "I ran the requested tools but did not produce a text reply. Ask again with more detail.";

    await prisma.aIMessage.create({
      data: {
        conversationId: conversationId!,
        role: "assistant",
        content,
        toolCalls: result.toolCalls.length
          ? JSON.stringify(result.toolCalls)
          : null,
        toolResults: result.toolResults.length
          ? JSON.stringify(result.toolResults)
          : null,
        tokenCount: result.totalUsage.totalTokens ?? null,
      },
    });

    await prisma.aIConversation.update({
      where: { id: conversationId! },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(
      { content },
      {
      headers: {
        "X-Conversation-Id": conversationId,
      },
      },
    );
  } catch (error) {
    console.error("[api/ai/chat]", error);
    const message =
      error instanceof Error ? error.message : "Failed to process request";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
