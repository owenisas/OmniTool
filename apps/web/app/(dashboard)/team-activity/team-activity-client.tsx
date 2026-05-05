"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@omnitool/ui/components/button";
import { Card, CardContent, CardHeader } from "@omnitool/ui/components/card";
import { Badge } from "@omnitool/ui/components/badge";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Sparkles,
  AlertTriangle,
  Users,
} from "lucide-react";
import { format, addDays, subDays, isToday } from "date-fns";

function getDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function TeamActivityClient() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const dateStr = getDateString(currentDate);

  const { data: activities, isLoading, error } =
    trpc.teamActivity.getByDate.useQuery({ date: dateStr });

  const goBack = () => setCurrentDate((d) => subDays(d, 1));
  const goForward = () => setCurrentDate((d) => addDays(d, 1));
  const goToday = () => setCurrentDate(new Date());

  return (
    <div className="space-y-6">
      {/* Date navigator */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={goBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 min-w-[180px] justify-center">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {format(currentDate, "EEEE, MMMM d, yyyy")}
          </span>
        </div>
        <Button variant="outline" size="icon" onClick={goForward}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isToday(currentDate) && (
          <Button variant="ghost" size="sm" onClick={goToday}>
            Today
          </Button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="animate-pulse text-sm">Loading team activity...</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            {error.message}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !error && activities?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Users className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm font-medium">No team activity for this day</p>
            {isToday(currentDate) && (
              <p className="text-xs mt-1">
                Use &quot;Summarize my day&quot; on the dashboard to share your
                coding activity.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Activity cards */}
      {!isLoading &&
        !error &&
        activities &&
        activities.length > 0 && (
          <div className="space-y-4">
            {activities.map((activity) => (
              <TeamMemberActivityCard key={activity.id} activity={activity} />
            ))}
          </div>
        )}
    </div>
  );
}

interface ActivityData {
  id: string;
  userId: string;
  date: string;
  sessionCount: number;
  totalMessages: number;
  sources: string[];
  title: string;
  overview: string;
  keyTopics: string[];
  actionItems: string[];
  risks: string[];
  perSessionMeta: Array<{
    id: string;
    source: string;
    title: string;
    messageCount: number;
    project?: string;
  }>;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

function TeamMemberActivityCard({ activity }: { activity: ActivityData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="transition-colors hover:bg-accent/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {activity.user.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold">{activity.user.name}</p>
              <p className="text-xs text-muted-foreground">
                {activity.sessionCount} session
                {activity.sessionCount !== 1 ? "s" : ""} &middot;{" "}
                {activity.totalMessages} messages &middot;{" "}
                {activity.sources.join(", ")}
              </p>
            </div>
          </div>
          <Sparkles className="h-4 w-4 text-muted-foreground/50" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Title */}
        <p className="text-sm font-medium">&ldquo;{activity.title}&rdquo;</p>

        {/* Overview */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {activity.overview}
        </p>

        {/* Topics */}
        {activity.keyTopics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activity.keyTopics.slice(0, 6).map((topic) => (
              <Badge key={topic} variant="secondary" className="text-xs">
                {topic}
              </Badge>
            ))}
            {activity.keyTopics.length > 6 && (
              <Badge variant="outline" className="text-xs">
                +{activity.keyTopics.length - 6}
              </Badge>
            )}
          </div>
        )}

        {/* Expandable details */}
        {(activity.actionItems.length > 0 || activity.risks.length > 0) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary hover:underline"
          >
            {expanded ? "Hide details" : "Show details"}
            {!expanded &&
              ` (${activity.actionItems.length} action items${activity.risks.length > 0 ? `, ${activity.risks.length} risks` : ""})`}
          </button>
        )}

        {expanded && (
          <div className="space-y-3 pt-2 border-t">
            {activity.actionItems.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Action Items
                </h5>
                <ul className="space-y-1">
                  {activity.actionItems.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-foreground"
                    >
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {activity.risks.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-1.5">
                  Risks
                </h5>
                <ul className="space-y-1">
                  {activity.risks.map((risk, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-foreground"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
