"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@omnitool/ui/components/card";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import { Label } from "@omnitool/ui/components/label";
import { Loader2, Shield, CheckCircle } from "lucide-react";

export default function SecuritySettingsPage() {
  const { data: user, isLoading } = trpc.user.me.useQuery();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const changePassword = trpc.user.changePassword.useMutation({
    onSuccess: () => {
      setShowSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setShowSuccess(false), 4000);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    changePassword.mutate({
      currentPassword,
      newPassword,
      confirmPassword,
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Security</h1>
        <Card>
          <CardContent className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Security</h1>
        <p className="mt-2 text-muted-foreground">
          Protect your account when signing in with email and password.
        </p>
      </div>

      {!user?.hasPassword ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Password sign-in</CardTitle>
            </div>
            <CardDescription>
              This account does not use a password managed by OmniTool (for
              example, it may use SSO only or has no password on file). There is
              nothing to change here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              After updating, existing sessions stay signed in until they expire
              or you sign out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current">Current password</Label>
                <Input
                  id="current"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new">New password</Label>
                <Input
                  id="new"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                />
              </div>

              {changePassword.isError && (
                <p className="text-sm text-destructive">
                  {changePassword.error.message}
                </p>
              )}
              {showSuccess && (
                <p className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Password updated
                </p>
              )}

              <Button
                type="submit"
                disabled={
                  changePassword.isPending ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
              >
                {changePassword.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating…
                  </>
                ) : (
                  "Update password"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
