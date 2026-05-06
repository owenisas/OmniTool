"use client";

import {
  Image as ImageIcon,
  LayoutGrid,
  List as ListIcon,
  Network,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@omnitool/ui/components/select";
import { Button } from "@omnitool/ui/components/button";
import type {
  GroupBy,
  SortBy,
  ViewMode,
} from "@/lib/notes/view-prefs";
import { cn } from "@/lib/utils";

interface NotesViewControlsProps {
  viewMode: ViewMode;
  sortBy: SortBy;
  groupBy: GroupBy;
  onViewModeChange: (next: ViewMode) => void;
  onSortByChange: (next: SortBy) => void;
  onGroupByChange: (next: GroupBy) => void;
}

const VIEW_MODE_BUTTONS: {
  value: ViewMode;
  label: string;
  icon: typeof ListIcon;
}[] = [
  { value: "cards", label: "Cards", icon: LayoutGrid },
  { value: "list", label: "List", icon: ListIcon },
  { value: "gallery", label: "Gallery", icon: ImageIcon },
  { value: "tree", label: "Tree", icon: Network },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "updatedDesc", label: "Last updated" },
  { value: "updatedAsc", label: "Oldest edited first" },
  { value: "createdDesc", label: "Newest first" },
  { value: "createdAsc", label: "Oldest first" },
  { value: "titleAsc", label: "Title A → Z" },
  { value: "titleDesc", label: "Title Z → A" },
];

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "pinned", label: "Pinned status" },
  { value: "tag", label: "Tag" },
  { value: "linkedProject", label: "Project" },
  { value: "teamspace", label: "Teamspace" },
];

export function NotesViewControls({
  viewMode,
  sortBy,
  groupBy,
  onViewModeChange,
  onSortByChange,
  onGroupByChange,
}: NotesViewControlsProps) {
  const isTreeView = viewMode === "tree";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="View mode"
        className="inline-flex items-center rounded-md border bg-card p-0.5"
      >
        {VIEW_MODE_BUTTONS.map(({ value, label, icon: Icon }) => {
          const active = viewMode === value;
          return (
            <Button
              key={value}
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onViewModeChange(value)}
              aria-pressed={active}
              title={label}
              className={cn(
                "h-7 px-2 text-xs",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          );
        })}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select
          value={sortBy}
          onValueChange={(v) => onSortByChange(v as SortBy)}
          disabled={isTreeView}
        >
          <SelectTrigger
            className="h-8 w-[160px] text-xs"
            aria-label="Sort notes"
          >
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={groupBy}
          onValueChange={(v) => onGroupByChange(v as GroupBy)}
          disabled={isTreeView}
        >
          <SelectTrigger
            className="h-8 w-[150px] text-xs"
            aria-label="Group notes"
          >
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            {GROUP_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
