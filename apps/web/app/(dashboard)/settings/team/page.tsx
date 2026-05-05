"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import { useTeam } from "@/components/providers/team-provider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@omnitool/ui/components/card";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import { Label } from "@omnitool/ui/components/label";
import { Textarea } from "@omnitool/ui/components/textarea";
import { Badge } from "@omnitool/ui/components/badge";
import { Separator } from "@omnitool/ui/components/separator";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@omnitool/ui/components/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@omnitool/ui/components/select";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@omnitool/ui/components/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@omnitool/ui/components/dialog";
import {
  Save,
  CheckCircle,
  Loader2,
  X,
  UserPlus,
  Github,
} from "lucide-react";
import { AddMemberDialog } from "./add-member-dialog";
import { PendingInvitations } from "./pending-invitations";

export default function TeamSettingsPage() {
  const { activeTeam, teams } = useTeam();
  const currentTeamEntry = teams.find((t) => t.id === activeTeam?.id);
  const myRole = currentTeamEntry?.role ?? "MEMBER";
  const isAdminOrOwner = myRole === "OWNER" || myRole === "ADMIN";
  const isOwner = myRole === "OWNER";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your team configuration and members.
        </p>
      </div>

      {!activeTeam ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">
              No active team selected. Please select a team first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-6">
            <GeneralTab
              team={activeTeam}
              isAdminOrOwner={isAdminOrOwner}
            />
          </TabsContent>

          <TabsContent value="members" className="mt-6">
            <MembersTab
              isAdminOrOwner={isAdminOrOwner}
              isOwner={isOwner}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// General Tab
// ---------------------------------------------------------------------------

interface GeneralTabProps {
  team: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    githubOrgLogin: string | null;
  };
  isAdminOrOwner: boolean;
}

function GeneralTab({ team, isAdminOrOwner }: GeneralTabProps) {
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");
  const [showSuccess, setShowSuccess] = useState(false);

  const utils = trpc.useUtils();

  useEffect(() => {
    setName(team.name);
    setDescription(team.description ?? "");
  }, [team.name, team.description]);

  const updateTeam = trpc.team.update.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
  });

  function handleSave() {
    const data: { name?: string; description?: string } = {};
    if (name.trim() && name.trim() !== team.name) data.name = name.trim();
    if (description !== (team.description ?? ""))
      data.description = description;

    if (Object.keys(data).length === 0) return;
    updateTeam.mutate(data);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>General Settings</CardTitle>
        <CardDescription>
          {isAdminOrOwner
            ? "Update your team name and description."
            : "View your team details. Only admins and owners can edit."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 max-w-lg">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team Name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdminOrOwner}
              placeholder="Team name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-description">Description</Label>
            <Textarea
              id="team-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!isAdminOrOwner}
              placeholder="A short description of your team"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-slug">Slug</Label>
            <Input
              id="team-slug"
              value={team.slug}
              disabled
              readOnly
              className="text-muted-foreground"
            />
          </div>

          {team.githubOrgLogin && (
            <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted/50">
              <Github className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Linked to GitHub:{" "}
                <span className="font-medium">@{team.githubOrgLogin}</span>
              </span>
            </div>
          )}

          {isAdminOrOwner && (
            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleSave}
                disabled={updateTeam.isPending}
              >
                {updateTeam.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
              {showSuccess && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Team updated
                </span>
              )}
              {updateTeam.isError && (
                <span className="text-sm text-destructive">
                  {updateTeam.error.message}
                </span>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Members Tab
// ---------------------------------------------------------------------------

interface MembersTabProps {
  isAdminOrOwner: boolean;
  isOwner: boolean;
}

function MembersTab({ isAdminOrOwner, isOwner }: MembersTabProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  const utils = trpc.useUtils();
  const { data: members, isLoading } = trpc.team.getMembers.useQuery();

  const updateRole = trpc.team.updateMemberRole.useMutation({
    onSuccess: () => {
      utils.team.getMembers.invalidate();
    },
  });

  const removeMember = trpc.team.removeMember.useMutation({
    onSuccess: () => {
      utils.team.getMembers.invalidate();
      setConfirmRemove(null);
    },
  });

  function handleRoleChange(userId: string, role: string) {
    updateRole.mutate({
      userId,
      role: role as "OWNER" | "ADMIN" | "MEMBER",
    });
  }

  function handleRemove() {
    if (!confirmRemove) return;
    removeMember.mutate({ userId: confirmRemove.userId });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription className="mt-1">
                {members
                  ? `${members.length} member${members.length !== 1 ? "s" : ""}`
                  : "Loading members..."}
              </CardDescription>
            </div>
            {isAdminOrOwner && (
              <Button onClick={() => setAddDialogOpen(true)} size="sm">
                <UserPlus className="mr-2 h-4 w-4" />
                Add Member
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : members && members.length > 0 ? (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.user.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      {member.user.avatarUrl ? (
                        <AvatarImage
                          src={member.user.avatarUrl}
                          alt={member.user.name ?? ""}
                        />
                      ) : null}
                      <AvatarFallback>
                        {member.user.name
                          ? member.user.name.charAt(0).toUpperCase()
                          : "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {member.user.name ?? "Unnamed"}
                        </p>
                        {member.user.githubLogin && (
                          <span className="text-sm text-muted-foreground">
                            @{member.user.githubLogin}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {member.user.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isOwner ? (
                      <Select
                        value={member.role}
                        onValueChange={(value) =>
                          handleRoleChange(member.user.id, value)
                        }
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OWNER">Owner</SelectItem>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="MEMBER">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant={
                          member.role === "OWNER"
                            ? "default"
                            : member.role === "ADMIN"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {member.role}
                      </Badge>
                    )}

                    {isAdminOrOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setConfirmRemove({
                            userId: member.user.id,
                            name: member.user.name ?? member.user.email,
                          })
                        }
                        aria-label={`Remove ${member.user.name ?? member.user.email}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-4">No members found.</p>
          )}
        </CardContent>
      </Card>

      {isAdminOrOwner && <PendingInvitations />}

      <AddMemberDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />

      {/* Confirm Remove Dialog */}
      <Dialog
        open={!!confirmRemove}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium">{confirmRemove?.name}</span> from
              this team? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmRemove(null)}
              disabled={removeMember.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
