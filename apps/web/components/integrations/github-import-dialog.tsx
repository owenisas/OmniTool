"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { useTeam } from "@/components/providers/team-provider";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@omnitool/ui/components/dialog";
import { Button } from "@omnitool/ui/components/button";
import { Badge } from "@omnitool/ui/components/badge";
import { Separator } from "@omnitool/ui/components/separator";
import { Card, CardContent } from "@omnitool/ui/components/card";
import {
  Loader2,
  ArrowLeft,
  Lock,
  CheckCircle2,
  Users,
  FolderGit2,
  Building2,
  AlertCircle,
} from "lucide-react";

interface GitHubImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 1 | 2 | 3;

export function GitHubImportDialog({
  open,
  onOpenChange,
}: GitHubImportDialogProps) {
  const router = useRouter();
  const { switchTeam } = useTeam();

  const [step, setStep] = useState<Step>(1);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [isPersonal, setIsPersonal] = useState(false);
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<number>>(
    new Set()
  );
  const [importMembers, setImportMembers] = useState(true);
  const [importTriggered, setImportTriggered] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedOrg(null);
      setIsPersonal(false);
      setSelectedRepoIds(new Set());
      setImportMembers(true);
      setImportTriggered(false);
    }
  }, [open]);

  // -- Step 1: List orgs --
  const orgsQuery = trpc.integration.github.listOrgs.useQuery(undefined, {
    enabled: open && step === 1,
  });

  // -- Step 2: Preview import --
  const previewQuery = trpc.integration.github.previewImport.useQuery(
    { orgLogin: selectedOrg!, isPersonal },
    { enabled: open && step === 2 && !!selectedOrg }
  );

  // Initialize selected repos when preview data loads
  useEffect(() => {
    if (previewQuery.data) {
      const selectableIds = previewQuery.data.repos
        .filter((r) => !r.alreadyImported)
        .map((r) => r.id);
      setSelectedRepoIds(new Set(selectableIds));
    }
  }, [previewQuery.data]);

  // -- Step 3: Execute import --
  const importMutation = trpc.integration.github.executeImport.useMutation();

  useEffect(() => {
    if (step === 3 && selectedOrg && !importTriggered) {
      setImportTriggered(true);
      importMutation.mutate({
        orgLogin: selectedOrg,
        selectedRepoIds: Array.from(selectedRepoIds),
        importMembers: isPersonal ? false : importMembers,
        isPersonal,
      });
    }
  }, [step, selectedOrg, importTriggered, selectedRepoIds, importMembers, importMutation]);

  // -- Handlers --
  const handleSelectOrg = useCallback((login: string, personal: boolean) => {
    setSelectedOrg(login);
    setIsPersonal(personal);
    setStep(2);
  }, []);

  const handleToggleRepo = useCallback((repoId: number) => {
    setSelectedRepoIds((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  }, []);

  const selectableRepos = useMemo(
    () => previewQuery.data?.repos.filter((r) => !r.alreadyImported) ?? [],
    [previewQuery.data]
  );

  const handleSelectAll = useCallback(() => {
    setSelectedRepoIds(new Set(selectableRepos.map((r) => r.id)));
  }, [selectableRepos]);

  const handleDeselectAll = useCallback(() => {
    setSelectedRepoIds(new Set());
  }, []);

  const allSelected =
    selectableRepos.length > 0 &&
    selectableRepos.every((r) => selectedRepoIds.has(r.id));

  const handleBack = useCallback(() => {
    setStep(1);
    setSelectedOrg(null);
    setIsPersonal(false);
    setSelectedRepoIds(new Set());
  }, []);

  const handleStartImport = useCallback(() => {
    setStep(3);
  }, []);

  const handleGoToTeam = useCallback(() => {
    if (importMutation.data) {
      switchTeam(importMutation.data.teamId);
      onOpenChange(false);
      router.push("/projects");
    }
  }, [importMutation.data, switchTeam, onOpenChange, router]);

  // -- Summary counts for step 2 --
  const newRepoCount = selectedRepoIds.size;
  const memberCount = previewQuery.data?.members.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        {/* Step 1: Select Organization */}
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>Import from GitHub</DialogTitle>
              <DialogDescription>
                Import your personal repositories or select an organization.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-2 py-2">
              {orgsQuery.isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Loading organizations...
                  </span>
                </div>
              )}

              {orgsQuery.isError && (
                <div className="flex items-center justify-center py-12 text-destructive">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  <span className="text-sm">
                    Failed to load organizations. Please try again.
                  </span>
                </div>
              )}

              {orgsQuery.data?.map((org) => (
                <button
                  key={org.isPersonal ? "personal" : org.id}
                  type="button"
                  onClick={() => handleSelectOrg(org.login, org.isPersonal)}
                  className={cn(
                    "w-full flex items-center gap-4 rounded-lg border p-4 text-left transition-colors",
                    "hover:bg-accent hover:border-accent-foreground/20",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  {org.avatarUrl ? (
                    <img
                      src={org.avatarUrl}
                      alt={org.login}
                      className="h-10 w-10 rounded-md"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{org.login}</span>
                      {org.alreadyImported && (
                        <Badge variant="secondary" className="text-xs">
                          Already imported
                        </Badge>
                      )}
                    </div>
                    {org.description && (
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {org.description}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 2: Preview & Select */}
        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={handleBack}
                  aria-label="Go back to organization list"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                Import {selectedOrg}
              </DialogTitle>
              <DialogDescription>
                Choose which repositories and members to import.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              {previewQuery.isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Loading preview...
                  </span>
                </div>
              )}

              {previewQuery.isError && (
                <div className="flex items-center justify-center py-12 text-destructive">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  <span className="text-sm">
                    Failed to load import preview. Please try again.
                  </span>
                </div>
              )}

              {previewQuery.data && (
                <>
                  {/* Repos Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <FolderGit2 className="h-4 w-4" />
                        Repositories ({previewQuery.data.repos.length})
                      </h4>
                      {selectableRepos.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={allSelected ? handleDeselectAll : handleSelectAll}
                        >
                          {allSelected ? "Deselect All" : "Select All"}
                        </Button>
                      )}
                    </div>

                    <div className="space-y-1 max-h-[240px] overflow-y-auto rounded-md border p-1">
                      {previewQuery.data.repos.map((repo) => {
                        const isImported = repo.alreadyImported;
                        const isChecked = isImported || selectedRepoIds.has(repo.id);

                        return (
                          <label
                            key={repo.id}
                            className={cn(
                              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                              isImported
                                ? "opacity-60 cursor-not-allowed"
                                : "cursor-pointer hover:bg-accent"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isImported}
                              onChange={() => handleToggleRepo(repo.id)}
                              className="h-4 w-4 rounded border-input accent-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {repo.isPrivate && (
                                  <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                )}
                                <span className="font-medium truncate">
                                  {repo.name}
                                </span>
                                {repo.language && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {repo.language}
                                  </Badge>
                                )}
                                {isImported && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    Already imported
                                  </Badge>
                                )}
                              </div>
                              {repo.description && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                  {repo.description}
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {!isPersonal && <Separator />}

                  {/* Members Section — only for org imports */}
                  {!isPersonal && <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Members ({previewQuery.data.members.length})
                      </h4>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importMembers}
                          onChange={(e) => setImportMembers(e.target.checked)}
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                        Import members
                      </label>
                    </div>

                    {importMembers && (
                      <div className="space-y-1 max-h-[180px] overflow-y-auto rounded-md border p-1">
                        {previewQuery.data.members.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm"
                          >
                            {member.avatarUrl ? (
                              <img
                                src={member.avatarUrl}
                                alt={member.login}
                                className="h-6 w-6 rounded-full"
                              />
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                                <Users className="h-3 w-3 text-muted-foreground" />
                              </div>
                            )}
                            <span className="font-medium">{member.login}</span>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {member.matchedUser
                                ? `Will match to: ${member.matchedUser.name || member.matchedUser.email}`
                                : "Will create placeholder"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>}

                  <Separator />

                  {/* Summary */}
                  <p className="text-sm text-muted-foreground text-center">
                    Will create{" "}
                    <span className="font-medium text-foreground">
                      {newRepoCount} project{newRepoCount !== 1 ? "s" : ""}
                    </span>
                    {importMembers && !isPersonal && (
                      <>
                        {" "}
                        and import{" "}
                        <span className="font-medium text-foreground">
                          {memberCount} user{memberCount !== 1 ? "s" : ""}
                        </span>
                      </>
                    )}
                  </p>
                </>
              )}
            </div>

            {previewQuery.data && (
              <DialogFooter>
                <Button variant="outline" onClick={handleBack}>
                  Back
                </Button>
                <Button
                  onClick={handleStartImport}
                  disabled={newRepoCount === 0 && !importMembers}
                >
                  Import
                </Button>
              </DialogFooter>
            )}
          </>
        )}

        {/* Step 3: Results */}
        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle>
                {importMutation.isPending
                  ? "Importing..."
                  : importMutation.isError
                    ? "Import Failed"
                    : "Import Complete"}
              </DialogTitle>
              <DialogDescription>
                {importMutation.isPending
                  ? "Please wait while we import your data from GitHub."
                  : importMutation.isError
                    ? "Something went wrong during the import."
                    : "Your GitHub organization has been imported successfully."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 flex items-center justify-center py-6">
              {importMutation.isPending && (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Importing repositories and members...
                  </p>
                </div>
              )}

              {importMutation.isError && (
                <div className="flex flex-col items-center gap-3 text-destructive">
                  <AlertCircle className="h-10 w-10" />
                  <p className="text-sm">
                    {importMutation.error.message ||
                      "An unexpected error occurred."}
                  </p>
                </div>
              )}

              {importMutation.isSuccess && importMutation.data && (
                <Card className="w-full">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-8 w-8 text-green-500 flex-shrink-0" />
                      <div>
                        <h3 className="font-semibold text-lg">
                          {importMutation.data.teamName}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Team created successfully
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold">
                          {importMutation.data.projectsCreated}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Projects Created
                        </p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {importMutation.data.membersImported}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Members Imported
                        </p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {importMutation.data.membersSkipped}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Members Skipped
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              {importMutation.isSuccess && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Close
                  </Button>
                  <Button onClick={handleGoToTeam}>Go to Team</Button>
                </>
              )}
              {importMutation.isError && (
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
