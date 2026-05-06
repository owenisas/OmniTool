"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Badge } from "@omnitool/ui/components/badge";
import { Separator } from "@omnitool/ui/components/separator";
import { Input } from "@omnitool/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@omnitool/ui/components/select";
import { cn } from "@/lib/utils";
import {
  Loader2,
  AlertCircle,
  FileText,
  Search,
  BookOpen,
  User as UserIcon,
  Users,
} from "lucide-react";
import { runBackgroundTask } from "@/lib/background-tasks/run";

interface NotionImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface NotionPage {
  id: string;
  title: string;
  icon: string | null;
  lastEditedTime: string;
  url: string;
  parentType: string;
  alreadyImported: boolean;
}

export function NotionImportDialog({
  open,
  onOpenChange,
}: NotionImportDialogProps) {
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(
    new Set(),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [targetTeamId, setTargetTeamId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const importMutation = trpc.integration.notion.importPages.useMutation();
  const updatePref = trpc.userNotePreference.update.useMutation();

  // Teamspaces the user can import into (PERSONAL first, then TEAM teams).
  const teamspacesQuery = trpc.team.listMyTeamspaces.useQuery(undefined, {
    enabled: open,
  });
  const teamspaces = teamspacesQuery.data ?? [];

  // Default the target teamspace to the user's active notes-page lens, then
  // their personal teamspace, then the first available.
  const prefQuery = trpc.userNotePreference.get.useQuery(undefined, {
    enabled: open,
  });
  useEffect(() => {
    if (!open) return;
    if (targetTeamId) return;
    const fromPref = prefQuery.data?.activeTeamspaceId;
    if (fromPref && teamspaces.some((t) => t.id === fromPref)) {
      setTargetTeamId(fromPref);
      return;
    }
    const personal = teamspaces.find((t) => t.kind === "PERSONAL");
    if (personal) {
      setTargetTeamId(personal.id);
      return;
    }
    if (teamspaces[0]) setTargetTeamId(teamspaces[0].id);
  }, [open, targetTeamId, prefQuery.data, teamspaces]);

  // Reset all state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedPageIds(new Set());
      setSearchTerm("");
      setDebouncedSearch("");
      setTargetTeamId(null);
    }
  }, [open]);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // List pages (no search)
  const listPagesQuery = trpc.integration.notion.listPages.useQuery(
    undefined,
    { enabled: open && debouncedSearch === "" },
  );

  // Search pages
  const searchPagesQuery = trpc.integration.notion.searchPages.useQuery(
    { query: debouncedSearch },
    { enabled: open && debouncedSearch !== "" },
  );

  const isSearching = debouncedSearch !== "";
  const activeQuery = isSearching ? searchPagesQuery : listPagesQuery;
  const pages: NotionPage[] = activeQuery.data?.pages ?? [];

  // Pre-select all non-imported pages when data loads
  useEffect(() => {
    if (activeQuery.data && !isSearching) {
      const selectableIds = activeQuery.data.pages
        .filter((p: NotionPage) => !p.alreadyImported)
        .map((p: NotionPage) => p.id);
      setSelectedPageIds(new Set(selectableIds));
    }
  }, [activeQuery.data, isSearching]);

  const selectablePages = useMemo(
    () => pages.filter((p) => !p.alreadyImported),
    [pages],
  );

  const handleTogglePage = useCallback((pageId: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedPageIds(new Set(selectablePages.map((p) => p.id)));
  }, [selectablePages]);

  const handleDeselectAll = useCallback(() => {
    setSelectedPageIds(new Set());
  }, []);

  const allSelected =
    selectablePages.length > 0 &&
    selectablePages.every((p) => selectedPageIds.has(p.id));

  /**
   * Queue the import as a background task and close the dialog immediately.
   * The topbar indicator + sonner toast handle progress and completion;
   * `onSuccess` invalidates the notes list so the sidebar tree refreshes
   * once the server is done.
   */
  const handleStartImport = useCallback(() => {
    const ids = Array.from(selectedPageIds);
    if (ids.length === 0) return;
    if (!targetTeamId) return;
    void runBackgroundTask({
      id: `notion-import-${Date.now()}`,
      kind: "notion-import",
      label: `Importing ${ids.length} Notion ${ids.length === 1 ? "page" : "pages"}`,
      href: "/notes",
      successToast: (r: { imported: number; skipped: number }) =>
        `Notion import complete — ${r.imported} imported, ${r.skipped} skipped`,
      work: () =>
        importMutation.mutateAsync({
          selectedPageIds: ids,
          teamId: targetTeamId,
        }),
      onSuccess: () => {
        void utils.note.list.invalidate();
        // Switch the user's active teamspace lens to the import target so
        // they land on their imports without an extra click.
        if (targetTeamId) {
          updatePref.mutate({ activeTeamspaceId: targetTeamId });
        }
        void utils.userNotePreference.get.invalidate();
      },
    });
    onOpenChange(false);
  }, [
    selectedPageIds,
    targetTeamId,
    importMutation,
    updatePref,
    utils,
    onOpenChange,
  ]);

  const selectedCount = selectedPageIds.size;

  function formatRelativeTime(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function renderPageIcon(icon: string | null): React.ReactNode {
    if (icon) {
      return <span className="text-base leading-none">{icon}</span>;
    }
    return <FileText className="h-4 w-4 text-muted-foreground" />;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import from Notion</DialogTitle>
          <DialogDescription>
            Select pages to import as notes. The import runs in the background —
            you can keep using OmniTool while it finishes.
          </DialogDescription>
        </DialogHeader>

        {/* Teamspace target picker */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Import into
          </label>
          <Select
            value={targetTeamId ?? ""}
            onValueChange={(v) => setTargetTeamId(v)}
            disabled={teamspacesQuery.isLoading || teamspaces.length === 0}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select a teamspace…" />
            </SelectTrigger>
            <SelectContent>
              {teamspaces.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="inline-flex items-center gap-2">
                    {t.kind === "PERSONAL" ? (
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span>{t.name}</span>
                    {t.kind === "PERSONAL" && (
                      <span className="text-[10px] text-muted-foreground">
                        Personal
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Imported pages stay inside this teamspace. Move them later via the
            row menu if you change your mind.
          </p>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search pages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          {activeQuery.isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                {isSearching ? "Searching pages..." : "Loading pages..."}
              </span>
            </div>
          )}

          {activeQuery.isError && (
            <div className="flex items-center justify-center py-12 text-destructive">
              <AlertCircle className="h-5 w-5 mr-2" />
              <span className="text-sm">
                Failed to load pages. Please try again.
              </span>
            </div>
          )}

          {activeQuery.isSuccess && pages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <BookOpen className="h-8 w-8 mb-3" />
              <p className="text-sm">
                {isSearching
                  ? "No pages found matching your search."
                  : "No pages found in your Notion workspace."}
              </p>
            </div>
          )}

          {activeQuery.isSuccess && pages.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Pages ({pages.length})
                </h4>
                {selectablePages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={
                      allSelected ? handleDeselectAll : handleSelectAll
                    }
                  >
                    {allSelected ? "Deselect All" : "Select All"}
                  </Button>
                )}
              </div>

              <div className="space-y-1 max-h-[340px] overflow-y-auto rounded-md border p-1">
                {pages.map((page) => {
                  const isImported = page.alreadyImported;
                  const isChecked =
                    isImported || selectedPageIds.has(page.id);

                  return (
                    <label
                      key={page.id}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        isImported
                          ? "opacity-60 cursor-not-allowed"
                          : "cursor-pointer hover:bg-accent",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isImported}
                        onChange={() => handleTogglePage(page.id)}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                        {renderPageIcon(page.icon)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {page.title || "Untitled"}
                          </span>
                          {isImported && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              Already imported
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Edited {formatRelativeTime(page.lastEditedTime)}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {activeQuery.isSuccess && pages.length > 0 && (
          <>
            <Separator />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleStartImport}
                disabled={selectedCount === 0 || !targetTeamId}
                title={
                  !targetTeamId
                    ? "Pick a teamspace to import into first"
                    : undefined
                }
              >
                Import {selectedCount}{" "}
                {selectedCount === 1 ? "page" : "pages"} in background
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
