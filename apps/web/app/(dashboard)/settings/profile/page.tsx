"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
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
import { Badge } from "@omnitool/ui/components/badge";
import { Separator } from "@omnitool/ui/components/separator";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@omnitool/ui/components/avatar";
import { Save, CheckCircle, Loader2, Users } from "lucide-react";

export default function ProfileSettingsPage() {
  const { data: user, isLoading } = trpc.user.me.useQuery();

  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setAvatarUrl(user.avatarUrl ?? "");
    }
  }, [user]);

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
  });

  function handleSave() {
    const data: { name?: string; avatarUrl?: string } = {};
    if (name.trim()) data.name = name.trim();
    if (avatarUrl.trim()) data.avatarUrl = avatarUrl.trim();
    updateProfile.mutate(data);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-2">
          Manage your personal information and account settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>
            Update your name and avatar to personalize your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={name || "Avatar"} />
              ) : null}
              <AvatarFallback className="text-xl font-bold">
                {name ? name.charAt(0).toUpperCase() : "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user?.email}</p>
              <p className="text-sm text-muted-foreground">
                Member since{" "}
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })
                  : ""}
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your display name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatarUrl">Avatar URL</Label>
              <Input
                id="avatarUrl"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
                type="url"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleSave}
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
              {showSuccess && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Profile updated
                </span>
              )}
              {updateProfile.isError && (
                <span className="text-sm text-destructive">
                  {updateProfile.error.message}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Your Teams</CardTitle>
          </div>
          <CardDescription>
            Teams you belong to and your role in each.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user?.teamMembers && user.teamMembers.length > 0 ? (
            <div className="space-y-3">
              {user.teamMembers.map((membership) => (
                <div
                  key={membership.team.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{membership.team.name}</p>
                    {membership.team.description && (
                      <p className="text-sm text-muted-foreground">
                        {membership.team.description}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={
                      membership.role === "OWNER"
                        ? "default"
                        : membership.role === "ADMIN"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {membership.role}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">
              You are not a member of any team yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
