"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@omnitool/ui/components/dialog";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import { Label } from "@omnitool/ui/components/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@omnitool/ui/components/select";
import { Loader2, CheckCircle, Mail } from "lucide-react";

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMemberDialog({ open, onOpenChange }: AddMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    type: "added" | "invited";
    email?: string;
  } | null>(null);

  const utils = trpc.useUtils();

  const addMember = trpc.team.addMember.useMutation({
    onSuccess: (data) => {
      if (data.type === "added") {
        utils.team.getMembers.invalidate();
        setResult({ type: "added" });
      } else {
        utils.team.listInvitations.invalidate();
        setResult({ type: "invited", email: data.email });
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function resetAndClose() {
    setEmail("");
    setRole("MEMBER");
    setError(null);
    setResult(null);
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    addMember.mutate({ email: email.trim(), role });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setError(null);
          setResult(null);
        }
        onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>
            Add an existing user or invite someone new by email.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/50">
              {result.type === "added" ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                  <p className="text-sm">
                    User added to the team successfully.
                  </p>
                </>
              ) : (
                <>
                  <Mail className="h-5 w-5 text-blue-600 shrink-0" />
                  <p className="text-sm">
                    Invitation created for{" "}
                    <span className="font-medium">{result.email}</span>.
                    They&apos;ll be added automatically when they sign up.
                  </p>
                </>
              )}
            </div>
            <DialogFooter>
              <Button onClick={resetAndClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="user@example.com"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-role">Role</Label>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as "MEMBER" | "ADMIN")}
              >
                <SelectTrigger id="member-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={resetAndClose}
                disabled={addMember.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addMember.isPending}>
                {addMember.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Add Member
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
