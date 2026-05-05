"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@omnitool/ui/components/button";
import { Badge } from "@omnitool/ui/components/badge";
import { Loader2, X, Clock } from "lucide-react";

export function PendingInvitations() {
  const utils = trpc.useUtils();
  const { data: invitations, isLoading } =
    trpc.team.listInvitations.useQuery();

  const cancelInvitation = trpc.team.cancelInvitation.useMutation({
    onSuccess: () => {
      utils.team.listInvitations.invalidate();
    },
  });

  if (isLoading || !invitations || invitations.length === 0) return null;

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium text-muted-foreground">
          Pending Invitations ({invitations.length})
        </h4>
      </div>

      {invitations.map((invitation) => {
        const expiresIn = Math.ceil(
          (new Date(invitation.expiresAt).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        );

        return (
          <div
            key={invitation.id}
            className="flex items-center justify-between rounded-lg border border-dashed p-4"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                <span className="text-sm text-muted-foreground">?</span>
              </div>
              <div>
                <p className="text-sm font-medium">{invitation.email}</p>
                <p className="text-xs text-muted-foreground">
                  Invited by {invitation.inviter.name ?? invitation.inviter.email}{" "}
                  &middot; Expires in {expiresIn}d
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline">{invitation.role}</Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  cancelInvitation.mutate({ invitationId: invitation.id })
                }
                disabled={cancelInvitation.isPending}
                aria-label={`Cancel invitation for ${invitation.email}`}
              >
                {cancelInvitation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
