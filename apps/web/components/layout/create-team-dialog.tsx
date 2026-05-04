"use client";

import { useState } from "react";
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
import { Textarea } from "@omnitool/ui/components/textarea";
import { trpc } from "@/trpc/client";

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (teamId: string) => void;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export function CreateTeamDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTeamDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const utils = trpc.useUtils();

  const createTeam = trpc.team.create.useMutation({
    onSuccess: (team) => {
      utils.user.me.invalidate();
      utils.team.list.invalidate();
      onCreated?.(team.id);
      onOpenChange(false);
      setName("");
      setDescription("");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createTeam.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
    });
  }

  const slug = slugify(name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>
              Teams are workspaces for your projects and members.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="team-name">Name</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Engineering"
                autoFocus
              />
              {name && (
                <p className="text-xs text-muted-foreground">
                  Slug:{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    {slug || "..."}
                  </code>
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="team-desc">Description</Label>
              <Textarea
                id="team-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this team work on?"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createTeam.isPending}
            >
              {createTeam.isPending ? "Creating..." : "Create Team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
