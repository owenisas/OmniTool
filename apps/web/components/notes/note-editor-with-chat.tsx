"use client";

import { useState, useCallback } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Button } from "@omnitool/ui/components/button";
import { Sparkles, PanelRightClose } from "lucide-react";
import { NoteBlockEditor } from "./note-block-editor";
import { NoteChatPanel } from "./note-chat-panel";
import { NoteEditorProvider } from "./note-editor-context";
import type { AppRouter } from "@/trpc/routers/_app";
import type { inferRouterOutputs } from "@trpc/server";

type NoteDetail = inferRouterOutputs<AppRouter>["note"]["getById"];

const PANEL_STORAGE_KEY = "omnitool:notes-chat-layout";
const CHAT_VISIBLE_KEY = "omnitool:notes-chat-visible";

function getInitialChatVisible(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(CHAT_VISIBLE_KEY);
  return stored === "true";
}

export function NoteEditorWithChat({ note }: { note: NoteDetail }) {
  const [chatVisible, setChatVisible] = useState(getInitialChatVisible);

  const toggleChat = useCallback(() => {
    setChatVisible((prev) => {
      const next = !prev;
      localStorage.setItem(CHAT_VISIBLE_KEY, String(next));
      return next;
    });
  }, []);

  const toggleButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleChat}
      className="gap-1.5 whitespace-nowrap shrink-0"
      title={chatVisible ? "Hide AI chat" : "Show AI chat"}
    >
      {chatVisible ? (
        <PanelRightClose className="h-4 w-4" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      <span className="text-xs hidden sm:inline">
        {chatVisible ? "Hide AI" : "AI"}
      </span>
    </Button>
  );

  return (
    <NoteEditorProvider noteId={note.id}>
      <div className="relative h-[calc(100vh-8rem)]">
        {chatVisible ? (
          <Group
            orientation="horizontal"
            id={PANEL_STORAGE_KEY}
            className="h-full rounded-lg"
          >
            <Panel id="editor" defaultSize={65} minSize={40}>
              <div className="h-full overflow-y-auto pr-2">
                <NoteBlockEditor key={note.id} note={note} />
              </div>
            </Panel>
            <Separator className="mx-1 w-1.5 rounded-full bg-border hover:bg-ring transition-colors" />
            <Panel id="chat" defaultSize={35} minSize={25}>
              <div className="h-full rounded-r-lg border-l bg-background">
                <NoteChatPanel toggleButton={toggleButton} />
              </div>
            </Panel>
          </Group>
        ) : (
          <>
            {/* Toggle floats top-right when chat is hidden */}
            <div className="absolute right-3 top-0 z-10">
              {toggleButton}
            </div>
            <div className="h-full overflow-y-auto">
              <NoteBlockEditor key={note.id} note={note} />
            </div>
          </>
        )}
      </div>
    </NoteEditorProvider>
  );
}
