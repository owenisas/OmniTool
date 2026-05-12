"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Card, CardContent } from "@omnitool/ui/components/card";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import { Label } from "@omnitool/ui/components/label";
import { toast } from "sonner";

/**
 * Settings → Integrations → Slack. Two controls:
 *  - Reply mode: full text vs task-link-only (per-team).
 *  - Slack identity link: edit the user's slackUserId to ensure inbound
 *    `app_mention` events resolve to this OmniTool account.
 */
export default function SlackSettingsPage() {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.slackSettings.getActiveTeamSettings.useQuery();
  const meQuery = trpc.user.me.useQuery();

  const setReplyMode = trpc.slackSettings.setReplyMode.useMutation({
    onSuccess: async () => {
      await utils.slackSettings.getActiveTeamSettings.invalidate();
      toast.success("Reply mode updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const setSlackUser = trpc.slackSettings.setSlackUserId.useMutation({
    onSuccess: async () => {
      await utils.user.me.invalidate();
      toast.success("Slack identity updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const replyMode = settingsQuery.data?.team.slackReplyMode ?? "full";
  const install = settingsQuery.data?.install ?? null;
  const meSlackId = (meQuery.data as { slackUserId?: string | null } | undefined)?.slackUserId ?? "";
  const [slackIdInput, setSlackIdInput] = useState(meSlackId);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Slack</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control how OmniTool replies in Slack and which OmniTool account
          your Slack identity maps to.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="text-sm font-medium">Workspace install</h2>
            {install ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Connected to <span className="font-medium">{install.teamName}</span> ({install.teamId})
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                No workspace linked yet. Install the Slack app from Settings → Integrations.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="text-sm font-medium">Reply mode</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose whether OmniTool's threaded replies include the full
              issue / note details or only a deep link.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={replyMode === "full" ? "default" : "outline"}
              size="sm"
              disabled={setReplyMode.isPending}
              onClick={() => setReplyMode.mutate({ mode: "full" })}
            >
              Full content
            </Button>
            <Button
              type="button"
              variant={replyMode === "task-link-only" ? "default" : "outline"}
              size="sm"
              disabled={setReplyMode.isPending}
              onClick={() => setReplyMode.mutate({ mode: "task-link-only" })}
            >
              Task link only
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="text-sm font-medium">Your Slack identity</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Slack user id (e.g. <code className="rounded bg-muted px-1">U01ABC...</code>) used to
              recognize you when you @-mention OmniTool. Auto-set when you
              install the workspace; edit here if it gets out of sync.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="slack-id">Slack user ID</Label>
              <Input
                id="slack-id"
                placeholder="U01ABC..."
                value={slackIdInput}
                onChange={(e) => setSlackIdInput(e.target.value)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={setSlackUser.isPending}
              onClick={() =>
                setSlackUser.mutate({
                  slackUserId: slackIdInput.trim() || null,
                })
              }
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
