"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@omnitool/ui/components/sheet";
import { ChevronRight, Sparkles, Users } from "lucide-react";

function todayLocalIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60_000).toISOString().slice(0, 10);
}

type Summary = {
  id: string;
  userId: string;
  date: string;
  title: string;
  overview: string;
  keyTopics: string[];
  actionItems: string[];
  risks: string[];
  user: { id: string; name: string | null; avatarUrl: string | null };
};

export function TeamDailySection() {
  const [date, setDate] = useState(todayLocalIso());
  const [active, setActive] = useState<Summary | null>(null);

  const { data, isLoading } = trpc.teamActivity.getByDate.useQuery({ date });

  return (
    <section className="space-y-2 rounded-md border bg-card/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="h-3 w-3" />
          Team Daily
        </h3>
      </div>

      <Input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="h-7 text-xs"
      />

      {isLoading ? (
        <div className="space-y-1">
          <div className="h-7 animate-pulse rounded bg-muted/40" />
          <div className="h-7 animate-pulse rounded bg-muted/40" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No summaries on this date.</p>
      ) : (
        <ul className="space-y-1">
          {data!.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-sm px-1 py-1 text-[11px] hover:bg-accent"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                {s.user.avatarUrl ? (
                  <img src={s.user.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
                ) : (
                  (s.user.name || "?").charAt(0).toUpperCase()
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">
                  {s.user.name || "Member"}
                </span>
                <span className="block truncate text-muted-foreground">
                  {s.keyTopics[0] || s.title}
                </span>
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => setActive(s as Summary)}
                title="View summary"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {(data ?? []).length > 0 ? (
        <p className="text-[10px] text-muted-foreground">
          Click a row to preview. Use{" "}
          <kbd className="rounded border px-1 text-[10px]">/daily</kbd> inside any
          note to embed a summary.
        </p>
      ) : null}

      <Sheet open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {active?.user.avatarUrl ? (
                  <img
                    src={active.user.avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-full"
                  />
                ) : (
                  (active?.user.name || "?").charAt(0).toUpperCase()
                )}
              </span>
              {active?.user.name || "Member"} · {active?.date}
            </SheetTitle>
            <SheetDescription>{active?.title}</SheetDescription>
          </SheetHeader>

          {active ? (
            <div className="mt-4 space-y-4 pr-2 text-sm">
              <section>
                <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  Overview
                </h4>
                <p className="whitespace-pre-wrap text-sm">{active.overview}</p>
              </section>

              {active.keyTopics.length > 0 ? (
                <section>
                  <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Key topics
                  </h4>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">
                    {active.keyTopics.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {active.actionItems.length > 0 ? (
                <section>
                  <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Action items
                  </h4>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">
                    {active.actionItems.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {active.risks.length > 0 ? (
                <section>
                  <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Risks
                  </h4>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">
                    {active.risks.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <p className="text-[11px] text-muted-foreground">
                Open any note and type{" "}
                <kbd className="rounded border px-1 text-[10px]">/daily</kbd>
                {" "}to embed this summary live.
              </p>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
