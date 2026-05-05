"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@omnitool/ui/components/button";
import { Card, CardContent } from "@omnitool/ui/components/card";
import { Loader2, Users, X } from "lucide-react";
import { useTeam } from "@/components/providers/team-provider";

export function InvitationBanner() {
  const utils = trpc.useUtils();
  const { switchTeam } = useTeam();
  const { data: invitations, isLoading } =
    trpc.team.myInvitations.useQuery();

  const acceptInvitation = trpc.team.acceptInvitation.useMutation({
    onSuccess: (data) => {
      utils.team.myInvitations.invalidate();
      utils.team.list.invalidate();
      utils.user.me.invalidate();
      if (!data.alreadyMember) {
        switchTeam(data.teamId);
      }
    },
  });

  if (isLoading || !invitations || invitations.length === 0) return null;

  return (
    <div className="space-y-2">
      {invitations.map((invitation) => (
        <Card key={invitation.id} className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm font-medium">
                  You&apos;ve been invited to join{" "}
                  <span className="font-semibold">{invitation.team.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Invited by {invitation.inviter.name ?? invitation.inviter.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() =>
                  acceptInvitation.mutate({ token: invitation.token })
                }
                disabled={acceptInvitation.isPending}
              >
                {acceptInvitation.isPending ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : null}
                Accept
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
