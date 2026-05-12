"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MutableRefObject,
} from "react";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import { Bot, Send, Sparkles, Trash2, X } from "lucide-react";
import { ChatMessage, type NoteChatMessage } from "./chat-message";
import { useNoteEditor } from "./note-editor-context";

interface NoteChatBodyProps {
  noteId: string;
  onClose?: () => void;
  onClearMessages?: () => void;
  prefillRef?: MutableRefObject<((text: string) => void) | null>;
  /** Header trailing slot (close button, etc). */
  trailingHeader?: React.ReactNode;
}

export function NoteChatBody({
  noteId,
  onClose,
  prefillRef,
  trailingHeader,
}: NoteChatBodyProps) {
  const { refreshNote } = useNoteEditor();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<NoteChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Expose prefill setter via ref for parent (floating card) to push selection text in
  useEffect(() => {
    if (!prefillRef) return;
    prefillRef.current = (text: string) => {
      setInput(text);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    return () => {
      if (prefillRef) prefillRef.current = null;
    };
  }, [prefillRef, setInput]);

  const suggestedPrompts = [
    "Organize this note with clear headings",
    "Add a summary section at the top",
    "Research and add more details about this topic",
  ];

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isLoading) return;

    const userMessage: NoteChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantMessage: NoteChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };
    const requestMessages = [...messages, userMessage].map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/notes-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: requestMessages, noteId }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : `Request failed with ${response.status}`,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: assistantText }
              : message,
          ),
        );
      }

      if (!assistantText.trim()) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  content:
                    "I executed the requested tools. Ask if you need more details.",
                }
              : message,
          ),
        );
      }

      setTimeout(() => refreshNote(), 500);
    } catch (err) {
      const nextError =
        err instanceof Error ? err : new Error("Failed to send message");
      setError(nextError);
      setMessages((prev) =>
        prev.filter((message) => message.id !== assistantMessage.id),
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2 gap-1 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Notes AI</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setMessages([])}
              title="Clear chat"
              aria-label="Clear chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {trailingHeader}
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onClose}
              title="Close"
              aria-label="Close AI assistant"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Bot className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Notes Assistant</p>
              <p className="text-xs text-muted-foreground">
                I can edit, organize, and research for your notes.
              </p>
            </div>
            <div className="w-full space-y-2">
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full rounded-md border px-3 py-2 text-left text-xs hover:bg-muted transition-colors"
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
        )}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-2">
            <p className="text-sm text-destructive">
              {error.message.includes("503") ||
              error.message.includes("not configured")
                ? "AI is not configured. Set NVIDIA_API_KEY or ANTHROPIC_API_KEY in the server environment."
                : `Error: ${error.message}`}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setError(null)}
            >
              Dismiss
            </Button>
          </div>
        )}
        {isLoading &&
          messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="h-4 w-4 animate-pulse" />
              <span>Thinking...</span>
            </div>
          )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t p-3 shrink-0">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask AI to help with this note..."
            className="flex-1 text-sm"
            disabled={isLoading}
            aria-label="Message"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isLoading || !input.trim()}
            className="shrink-0"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
