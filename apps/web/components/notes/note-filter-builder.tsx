"use client";

import { useCallback, useId } from "react";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@omnitool/ui/components/select";
import { Plus, Trash2, X } from "lucide-react";
import type { NoteFilterCondition, NoteFilter } from "@omnitool/shared/validators";
import { cn } from "@/lib/utils";

// ─── Field definitions ─────────────────────────────────────

type FieldKey = NoteFilterCondition["field"];
type OperatorKey = NoteFilterCondition["operator"];

interface FieldDef {
  key: FieldKey;
  label: string;
  type: "string" | "date" | "boolean" | "id";
  operators: { key: OperatorKey; label: string }[];
}

const FIELDS: FieldDef[] = [
  {
    key: "title",
    label: "Title",
    type: "string",
    operators: [
      { key: "equals", label: "equals" },
      { key: "notEquals", label: "does not equal" },
      { key: "contains", label: "contains" },
    ],
  },
  {
    key: "tag",
    label: "Tag",
    type: "string",
    operators: [
      { key: "equals", label: "equals" },
      { key: "contains", label: "contains" },
    ],
  },
  {
    key: "teamId",
    label: "Teamspace",
    type: "id",
    operators: [
      { key: "equals", label: "equals" },
      { key: "notEquals", label: "does not equal" },
      { key: "isSet", label: "is set" },
      { key: "isNotSet", label: "is not set" },
    ],
  },
  {
    key: "authorId",
    label: "Author",
    type: "id",
    operators: [
      { key: "equals", label: "equals" },
      { key: "notEquals", label: "does not equal" },
      { key: "isSet", label: "is set" },
      { key: "isNotSet", label: "is not set" },
    ],
  },
  {
    key: "linkedProjectId",
    label: "Linked Project",
    type: "id",
    operators: [
      { key: "equals", label: "equals" },
      { key: "notEquals", label: "does not equal" },
      { key: "isSet", label: "is set" },
      { key: "isNotSet", label: "is not set" },
    ],
  },
  {
    key: "createdAt",
    label: "Created",
    type: "date",
    operators: [
      { key: "before", label: "before" },
      { key: "after", label: "after" },
    ],
  },
  {
    key: "updatedAt",
    label: "Updated",
    type: "date",
    operators: [
      { key: "before", label: "before" },
      { key: "after", label: "after" },
    ],
  },
  {
    key: "isPinned",
    label: "Pinned",
    type: "boolean",
    operators: [{ key: "equals", label: "equals" }],
  },
  {
    key: "hasChildren",
    label: "Has children",
    type: "boolean",
    operators: [{ key: "equals", label: "equals" }],
  },
];

const FIELD_MAP = new Map(FIELDS.map((f) => [f.key, f]));

function getFieldDef(key: FieldKey): FieldDef {
  return FIELD_MAP.get(key) ?? FIELDS[0]!;
}

// Does this operator need a value input?
function operatorNeedsValue(op: OperatorKey): boolean {
  return op !== "isSet" && op !== "isNotSet";
}

// ─── Types ─────────────────────────────────────────────────

export interface FilterConditionRow {
  /** Stable client-side key for React list rendering. */
  _key: string;
  field: FieldKey;
  operator: OperatorKey;
  value: string | boolean | number | undefined;
}

export interface FilterBuilderState {
  conditions: FilterConditionRow[];
  combinator: "and" | "or";
}

export const EMPTY_FILTER: FilterBuilderState = {
  conditions: [],
  combinator: "and",
};

/** Convert builder state to the shape the tRPC `listFiltered` input expects. */
export function toNoteFilter(state: FilterBuilderState): NoteFilter | null {
  const valid = state.conditions.filter((c) => {
    if (!operatorNeedsValue(c.operator)) return true;
    if (c.value === undefined || c.value === "") return false;
    return true;
  });
  if (valid.length === 0) return null;
  return {
    conditions: valid.map(({ field, operator, value }) => ({
      field,
      operator,
      value,
    })),
    combinator: state.combinator,
  };
}

// ─── Component ─────────────────────────────────────────────

interface NoteFilterBuilderProps {
  value: FilterBuilderState;
  onChange: (next: FilterBuilderState) => void;
  className?: string;
}

let _rowKey = 0;
function nextRowKey(): string {
  _rowKey += 1;
  return `fk_${_rowKey}`;
}

export function NoteFilterBuilder({
  value,
  onChange,
  className,
}: NoteFilterBuilderProps) {
  const uid = useId();

  const addCondition = useCallback(() => {
    const defaultField = FIELDS[0]!;
    onChange({
      ...value,
      conditions: [
        ...value.conditions,
        {
          _key: nextRowKey(),
          field: defaultField.key,
          operator: defaultField.operators[0]!.key,
          value: undefined,
        },
      ],
    });
  }, [value, onChange]);

  const removeCondition = useCallback(
    (key: string) => {
      onChange({
        ...value,
        conditions: value.conditions.filter((c) => c._key !== key),
      });
    },
    [value, onChange],
  );

  const updateCondition = useCallback(
    (key: string, patch: Partial<FilterConditionRow>) => {
      onChange({
        ...value,
        conditions: value.conditions.map((c) =>
          c._key === key ? { ...c, ...patch } : c,
        ),
      });
    },
    [value, onChange],
  );

  const setCombinator = useCallback(
    (comb: "and" | "or") => {
      onChange({ ...value, combinator: comb });
    },
    [value, onChange],
  );

  const clearAll = useCallback(() => {
    onChange(EMPTY_FILTER);
  }, [onChange]);

  if (value.conditions.length === 0) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={addCondition}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add filter
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border bg-card p-3",
        className,
      )}
    >
      {/* Header row: combinator toggle + clear */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Where</span>
          {value.conditions.length > 1 && (
            <div
              role="group"
              aria-label="Filter combinator"
              className="ml-1 inline-flex items-center rounded-md border bg-background p-0.5"
            >
              <button
                type="button"
                onClick={() => setCombinator("and")}
                className={cn(
                  "rounded-sm px-2 py-0.5 text-xs font-medium transition-colors",
                  value.combinator === "and"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                AND
              </button>
              <button
                type="button"
                onClick={() => setCombinator("or")}
                className={cn(
                  "rounded-sm px-2 py-0.5 text-xs font-medium transition-colors",
                  value.combinator === "or"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                OR
              </button>
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={clearAll}
        >
          <X className="mr-1 h-3 w-3" />
          Clear all
        </Button>
      </div>

      {/* Condition rows */}
      <div className="space-y-1.5">
        {value.conditions.map((cond, idx) => (
          <ConditionRow
            key={cond._key}
            condition={cond}
            index={idx}
            uid={uid}
            onUpdate={(patch) => updateCondition(cond._key, patch)}
            onRemove={() => removeCondition(cond._key)}
          />
        ))}
      </div>

      {/* Add condition */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-muted-foreground"
        onClick={addCondition}
      >
        <Plus className="mr-1 h-3 w-3" />
        Add condition
      </Button>
    </div>
  );
}

// ─── Condition row ─────────────────────────────────────────

function ConditionRow({
  condition,
  index,
  uid,
  onUpdate,
  onRemove,
}: {
  condition: FilterConditionRow;
  index: number;
  uid: string;
  onUpdate: (patch: Partial<FilterConditionRow>) => void;
  onRemove: () => void;
}) {
  const fieldDef = getFieldDef(condition.field);
  const needsValue = operatorNeedsValue(condition.operator);

  function handleFieldChange(nextField: string) {
    const def = getFieldDef(nextField as FieldKey);
    onUpdate({
      field: nextField as FieldKey,
      operator: def.operators[0]!.key,
      value: undefined,
    });
  }

  function handleOperatorChange(nextOp: string) {
    const op = nextOp as OperatorKey;
    onUpdate({
      operator: op,
      // Clear value when switching to isSet/isNotSet
      ...(!operatorNeedsValue(op) ? { value: undefined } : {}),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Field selector */}
      <Select value={condition.field} onValueChange={handleFieldChange}>
        <SelectTrigger
          className="h-7 w-[130px] text-xs"
          aria-label={`Filter field ${index + 1}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FIELDS.map((f) => (
            <SelectItem key={f.key} value={f.key}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator selector */}
      <Select value={condition.operator} onValueChange={handleOperatorChange}>
        <SelectTrigger
          className="h-7 w-[130px] text-xs"
          aria-label={`Filter operator ${index + 1}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fieldDef.operators.map((op) => (
            <SelectItem key={op.key} value={op.key}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value input — varies by field type */}
      {needsValue && (
        <FilterValueInput
          fieldDef={fieldDef}
          value={condition.value}
          onChange={(v) => onUpdate({ value: v })}
          uid={`${uid}-${index}`}
        />
      )}

      {/* Remove button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label={`Remove filter ${index + 1}`}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ─── Value input ───────────────────────────────────────────

function FilterValueInput({
  fieldDef,
  value,
  onChange,
  uid,
}: {
  fieldDef: FieldDef;
  value: string | boolean | number | undefined;
  onChange: (v: string | boolean | number | undefined) => void;
  uid: string;
}) {
  switch (fieldDef.type) {
    case "boolean":
      return (
        <Select
          value={value === true ? "true" : value === false ? "false" : ""}
          onValueChange={(v) => onChange(v === "true")}
        >
          <SelectTrigger
            className="h-7 w-[100px] text-xs"
            aria-label="Boolean value"
          >
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      );

    case "date":
      return (
        <Input
          type="date"
          className="h-7 w-[150px] text-xs"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          aria-label="Date value"
        />
      );

    case "id":
      return (
        <Input
          type="text"
          className="h-7 w-[180px] text-xs"
          placeholder="Enter ID..."
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          aria-label="ID value"
        />
      );

    case "string":
    default:
      return (
        <Input
          type="text"
          className="h-7 w-[180px] text-xs"
          placeholder="Enter value..."
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          aria-label="Text value"
        />
      );
  }
}
