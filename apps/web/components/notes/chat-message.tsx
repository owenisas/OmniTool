"use client";

import { Bot, User } from "lucide-react";
import type { Message } from "ai";

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {message.toolInvocations && message.toolInvocations.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolInvocations.map((invocation, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-xs opacity-70"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                <span>
                  {invocation.state === "result"
                    ? `Used ${invocation.toolName}`
                    : `Running ${invocation.toolName}...`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
