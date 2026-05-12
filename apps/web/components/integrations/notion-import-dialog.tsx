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

interface NotionImportResult {
  imported: number;
  skipped: number;
  failed: number;
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
  const [listCursor, setListCursor] = useState<string | undefined>(undefined);
  const [loadedPages, setLoadedPages] = useState<NotionPage[]>([]);

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
      setListCursor(undefined);
      setLoadedPages([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoadedPages([]);
    setListCursor(undefined);
  }, [open, targetTeamId, debouncedSearch]);

  useEffect(() => {
    if (!open) return;
    setSelectedPageIds(new Set());
  }, [open, targetTeamId]);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // List pages (no search)
  const listPagesQuery = trpc.integration.notion.listPages.useQuery(
    { cursor: listCursor, teamId: targetTeamId ?? undefined },
    { enabled: open && debouncedSearch === "" && !!targetTeamId },
  );

  // Search pages
  const searchPagesQuery = trpc.integration.notion.searchPages.useQuery(
    { query: debouncedSearch, teamId: targetTeamId ?? undefined },
    { enabled: open && debouncedSearch !== "" && !!targetTeamId },
  );

  const isSearching = debouncedSearch !== "";
  const activeQuery = isSearching ? searchPagesQuery : listPagesQuery;
  const pages: NotionPage[] = isSearching
    ? (searchPagesQuery.data?.pages ?? [])
    : loadedPages;
  const isPageLoading =
    activeQuery.isLoading ||
    (open && !targetTeamId && teamspacesQuery.isLoading);

  // Accumulate list pages as the user paginates. New, non-imported pages are
  // selected by default; existing user choices are preserved on later pages.
  useEffect(() => {
    if (!open || isSearching || !listPagesQuery.data) return;

    const incoming = listPagesQuery.data.pages;
    setLoadedPages((prev) => {
      if (!listCursor) return incoming;
      const byId = new Map(prev.map((page) => [page.id, page]));
      for (const page of incoming) byId.set(page.id, page);
      return Array.from(byId.values());
    });

    setSelectedPageIds((prev) => {
      const next = listCursor ? new Set(prev) : new Set<string>();
      for (const page of incoming) {
        if (!page.alreadyImported) next.add(page.id);
      }
      return next;
    });
  }, [open, isSearching, listCursor, listPagesQuery.data]);

  useEffect(() => {
    if (!open || !isSearching || !searchPagesQuery.data) return;
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      for (const page of searchPagesQuery.data.pages) {
        if (
          !page.alreadyImported &&
          !loadedPages.some((p) => p.id === page.id)
        ) {
          next.add(page.id);
        }
      }
      return next;
    });
  }, [open, isSearching, searchPagesQuery.data, loadedPages]);

  const handleLoadMore = useCallback(() => {
    const nextCursor = listPagesQuery.data?.nextCursor ?? undefined;
    if (!nextCursor || listPagesQuery.isFetching) return;
    setListCursor(nextCursor);
  }, [listPagesQuery.data?.nextCursor, listPagesQuery.isFetching]);

  const hasMorePages =
    !isSearching &&
    Boolean(listPagesQuery.data?.hasMore && listPagesQuery.data.nextCursor);

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
      successToast: (r: NotionImportResult) =>
        `Notion import complete — ${r.imported} imported, ${r.skipped} skipped${
          r.failed > 0 ? `, ${r.failed} failed` : ""
        }`,
      work: () =>
        importMutation.mutateAsync({
          selectedPageIds: ids,
          teamId: targetTeamId,
        }),
      onSuccess: () => {
        void utils.note.list.invalidate();
        void utils.integration.notion.listPages.invalidate();
        void utils.integration.notion.searchPages.invalidate();
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
          {isPageLoading && (
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

          {activeQuery.isSuccess && pages.length === 0 && !isPageLoading && (
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
                  Pages ({pages.length}
                  {hasMorePages ? "+" : ""})
                </h4>
                {selectablePages.length > 0 && (
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

              <div className="space-y-1 max-h-[340px] overflow-y-auto rounded-md border p-1">
                {pages.map((page) => {
                  const isImported = page.alreadyImported;
                  const isChecked = isImported || selectedPageIds.has(page.id);

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
              {hasMorePages && (
                <div className="flex justify-center pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={listPagesQuery.isFetching}
                  >
                    {listPagesQuery.isFetching ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Load more"
                    )}
                  </Button>
                </div>
              )}
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
                Import {selectedCount} {selectedCount === 1 ? "page" : "pages"}{" "}
                in background
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
