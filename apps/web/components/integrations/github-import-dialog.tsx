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
import {
  Loader2,
  ArrowLeft,
  Lock,
  Users,
  FolderGit2,
  Building2,
  AlertCircle,
} from "lucide-react";
import { runBackgroundTask } from "@/lib/background-tasks/run";

interface GitHubImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 1 | 2;

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

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedOrg(null);
      setIsPersonal(false);
      setSelectedRepoIds(new Set());
      setImportMembers(true);
    }
  }, [open]);

  const utils = trpc.useUtils();

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

  // -- Background import --
  const importMutation = trpc.integration.github.executeImport.useMutation();

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

  /**
   * Queue the import as a background task and close the dialog. Toast
   * "View" calls onViewResult to switch the active team + jump to /projects.
   */
  const handleStartImport = useCallback(() => {
    if (!selectedOrg) return;
    const orgLogin = selectedOrg;
    void runBackgroundTask({
      id: `github-import-${Date.now()}`,
      kind: "github-import",
      label: `Importing ${orgLogin} from GitHub`,
      successToast: (r: {
        teamName: string;
        teamId: string;
        projectsCreated: number;
        membersImported: number;
        membersSkipped: number;
      }) =>
        `Imported ${r.teamName} — ${r.projectsCreated} projects, ${r.membersImported} members`,
      onViewResult: (r) => {
        switchTeam(r.teamId);
        router.push("/projects");
      },
      work: () =>
        importMutation.mutateAsync({
          orgLogin,
          selectedRepoIds: Array.from(selectedRepoIds),
          importMembers: isPersonal ? false : importMembers,
          isPersonal,
        }),
      onSuccess: () => {
        void utils.team.list.invalidate?.();
        void utils.integration.github.listOrgs.invalidate();
      },
    });
    onOpenChange(false);
  }, [
    selectedOrg,
    selectedRepoIds,
    importMembers,
    isPersonal,
    importMutation,
    switchTeam,
    router,
    utils,
    onOpenChange,
  ]);

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
                  Import in background
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
