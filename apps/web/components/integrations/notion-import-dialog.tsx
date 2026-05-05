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
import { Card, CardContent } from "@omnitool/ui/components/card";
import { Input } from "@omnitool/ui/components/input";
import { cn } from "@/lib/utils";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Search,
  BookOpen,
} from "lucide-react";

interface NotionImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 1 | 2;

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
  const [step, setStep] = useState<Step>(1);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(
    new Set()
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [importTriggered, setImportTriggered] = useState(false);

  // Reset all state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedPageIds(new Set());
      setSearchTerm("");
      setDebouncedSearch("");
      setImportTriggered(false);
    }
  }, [open]);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // -- Step 1: List pages (no search) --
  const listPagesQuery = trpc.integration.notion.listPages.useQuery(
    undefined,
    {
      enabled: open && step === 1 && debouncedSearch === "",
    }
  );

  // -- Step 1: Search pages (when search term present) --
  const searchPagesQuery = trpc.integration.notion.searchPages.useQuery(
    { query: debouncedSearch },
    {
      enabled: open && step === 1 && debouncedSearch !== "",
    }
  );

  // Resolve which data source to use
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

  // -- Step 2: Execute import --
  const importMutation = trpc.integration.notion.importPages.useMutation();

  useEffect(() => {
    if (step === 2 && !importTriggered) {
      setImportTriggered(true);
      importMutation.mutate({
        selectedPageIds: Array.from(selectedPageIds),
      });
    }
  }, [step, importTriggered, selectedPageIds, importMutation]);

  // -- Handlers --
  const selectablePages = useMemo(
    () => pages.filter((p) => !p.alreadyImported),
    [pages]
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

  const handleStartImport = useCallback(() => {
    setStep(2);
  }, []);

  const selectedCount = selectedPageIds.size;

  // -- Render helpers --
  function formatRelativeTime(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function renderPageIcon(icon: string | null): React.ReactNode {
    if (icon) {
      // Notion icons are typically emoji strings
      return <span className="text-base leading-none">{icon}</span>;
    }
    return <FileText className="h-4 w-4 text-muted-foreground" />;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        {/* Step 1: Browse and Select Pages */}
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>Import from Notion</DialogTitle>
              <DialogDescription>
                Select pages to import as notes.
              </DialogDescription>
            </DialogHeader>

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
              {/* Loading state */}
              {activeQuery.isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    {isSearching
                      ? "Searching pages..."
                      : "Loading pages..."}
                  </span>
                </div>
              )}

              {/* Error state */}
              {activeQuery.isError && (
                <div className="flex items-center justify-center py-12 text-destructive">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  <span className="text-sm">
                    Failed to load pages. Please try again.
                  </span>
                </div>
              )}

              {/* Empty state */}
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

              {/* Page list */}
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
                              : "cursor-pointer hover:bg-accent"
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

            {/* Footer */}
            {activeQuery.isSuccess && pages.length > 0 && (
              <>
                <Separator />
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleStartImport}
                    disabled={selectedCount === 0}
                  >
                    Import {selectedCount}{" "}
                    {selectedCount === 1 ? "page" : "pages"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </>
        )}

        {/* Step 2: Import Progress and Results */}
        {step === 2 && (
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
                  ? "Please wait while we import your pages from Notion."
                  : importMutation.isError
                    ? "Something went wrong during the import."
                    : "Your Notion pages have been imported successfully."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 flex items-center justify-center py-6">
              {importMutation.isPending && (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Importing {selectedCount}{" "}
                    {selectedCount === 1 ? "page" : "pages"}...
                  </p>
                </div>
              )}

              {importMutation.isError && (
                <div className="flex flex-col items-center gap-3 text-destructive">
                  <AlertCircle className="h-10 w-10" />
                  <p className="text-sm text-center">
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
                          Import Successful
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Your Notion pages have been imported as notes.
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold">
                          {importMutation.data.imported}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Pages Imported
                        </p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {importMutation.data.skipped}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Pages Skipped
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              {(importMutation.isSuccess || importMutation.isError) && (
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
