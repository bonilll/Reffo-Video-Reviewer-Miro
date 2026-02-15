"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import {
  Calendar,
  Check,
  ChevronDown,
  GripVertical,
  Hash,
  Image as ImageIcon,
  List,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
  Type,
  User,
  X,
} from "lucide-react";
import { shallow } from "@liveblocks/client";

import { useMutation, useOthersMapped, useSelf } from "@/liveblocks.config";
import {
  TableCell,
  TableColumn,
  TableColumnType,
  TableLayer,
  TableRow,
  TableSelectOption,
} from "@/types/canvas";
import { colorToCSS } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface TableProps {
  id: string;
  layer: TableLayer;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  selectionColor?: string;
  isSelected?: boolean;
}

type ColumnResizeState = {
  columnId: string;
  startX: number;
  startWidth: number;
};

type ColumnDragState = {
  draggingId: string | null;
  overId: string | null;
};

type PersonOption = {
  id: string;
  name: string;
  picture?: string;
};

const TABLE_TITLE_HEIGHT = 44;
const TABLE_HEADER_HEIGHT = 46;
const TABLE_FOOTER_HEIGHT = 40;
const TABLE_ACTION_COLUMN_WIDTH = 64;
const TABLE_ROW_NUMBER_WIDTH = 56;
const TABLE_MIN_COLUMN_WIDTH = 190;
const TABLE_MAX_COLUMN_WIDTH = 760;
const TABLE_DEFAULT_COLUMN_WIDTH = 260;
const TABLE_BASE_ROW_HEIGHT = 46;
const TABLE_IMAGE_ROW_HEIGHT = 96;
const TABLE_MENU_CONTENT_CLASS =
  "z-[320] rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl shadow-slate-900/10";
const TABLE_MENU_ITEM_CLASS = "cursor-pointer rounded-lg px-2.5 py-2 text-sm text-slate-700 focus:bg-slate-100 focus:text-slate-900";

const TABLE_FONT = "14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
const TABLE_FONT_SEMIBOLD = "600 14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
const TABLE_FONT_BADGE = "600 12px Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

let measureCanvas: HTMLCanvasElement | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getMeasureContext() {
  if (typeof document === "undefined") return null;
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
  }
  return measureCanvas.getContext("2d");
}

function measureText(text: string, font: string) {
  const context = getMeasureContext();
  if (!context) return Math.max(8, text.length * 8);
  context.font = font;
  return Math.ceil(context.measureText(text).width);
}

function initialsFromName(name: string) {
  const tokens = name
    .split(" ")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (tokens.length === 0) return "?";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0] ?? ""}${tokens[1][0] ?? ""}`.toUpperCase();
}

function defaultOptions(): TableSelectOption[] {
  return [
    { id: `opt_${nanoid()}`, label: "Option 1", color: { r: 59, g: 130, b: 246 } },
    { id: `opt_${nanoid()}`, label: "Option 2", color: { r: 34, g: 197, b: 94 } },
  ];
}

function defaultValueForType(type: TableColumnType) {
  switch (type) {
    case TableColumnType.Number:
      return 0;
    case TableColumnType.MultiSelect:
      return [];
    default:
      return "";
  }
}

function normalizeColumns(columns: TableColumn[]) {
  let changed = false;

  const normalized = columns.map((column, index) => {
    const needsOptions = column.type === TableColumnType.Select || column.type === TableColumnType.MultiSelect;
    const options = needsOptions ? (column.options?.length ? column.options : defaultOptions()) : undefined;
    const width = clamp(Math.round(column.width || TABLE_DEFAULT_COLUMN_WIDTH), TABLE_MIN_COLUMN_WIDTH, TABLE_MAX_COLUMN_WIDTH);
    const name = (column.name || "").trim() || `Column ${index + 1}`;

    if (name !== column.name || width !== column.width || (needsOptions && !column.options?.length)) {
      changed = true;
    }

    return {
      ...column,
      id: column.id || `col_${nanoid()}`,
      name,
      width,
      options,
    };
  });

  return { columns: normalized, changed };
}

function normalizeRows(rows: TableRow[], columns: TableColumn[]) {
  let changed = false;
  const columnIds = new Set(columns.map((column) => column.id));

  const normalized = rows.map((row) => {
    const filteredCells = row.cells.filter((cell) => columnIds.has(cell.columnId));
    if (filteredCells.length !== row.cells.length) {
      changed = true;
    }

    const ensuredCells = columns.map((column) => {
      const existing = filteredCells.find((cell) => cell.columnId === column.id);
      if (existing) return existing;
      changed = true;
      return {
        columnId: column.id,
        value: defaultValueForType(column.type),
      };
    });

    return {
      ...row,
      id: row.id || `row_${nanoid()}`,
      cells: ensuredCells,
      createdAt: row.createdAt || new Date().toISOString(),
      updatedAt: row.updatedAt || new Date().toISOString(),
    };
  });

  return { rows: normalized, changed };
}

function badgeWidth(option: TableSelectOption) {
  return measureText(option.label, TABLE_FONT_BADGE) + 20;
}

function estimateCellWidth(column: TableColumn, value: unknown) {
  if (value === null || value === undefined || value === "") {
    switch (column.type) {
      case TableColumnType.Date:
        return measureText("Select date", TABLE_FONT) + 24;
      case TableColumnType.Select:
        return measureText("Select option", TABLE_FONT);
      case TableColumnType.MultiSelect:
        return measureText("Select options", TABLE_FONT);
      case TableColumnType.Image:
        return 190;
      case TableColumnType.Person:
        return 230;
      default:
        return 80;
    }
  }

  switch (column.type) {
    case TableColumnType.Number:
      return measureText(String(value), TABLE_FONT) + 12;
    case TableColumnType.Date: {
      const label = new Date(String(value)).toLocaleDateString("en-GB");
      return measureText(label, TABLE_FONT) + 24;
    }
    case TableColumnType.Select: {
      const option = column.options?.find((entry) => entry.id === value);
      return option ? badgeWidth(option) : measureText(String(value), TABLE_FONT);
    }
    case TableColumnType.MultiSelect: {
      const selected = Array.isArray(value) ? value : [];
      if (selected.length === 0) {
        return measureText("Select options", TABLE_FONT);
      }
      const widths = selected.map((optionId) => {
        const option = column.options?.find((entry) => entry.id === optionId);
        return option ? badgeWidth(option) : 44;
      });
      const max = widths.length ? Math.max(...widths) : 44;
      return max * Math.min(3, widths.length);
    }
    case TableColumnType.Image:
      return 210;
    case TableColumnType.Person:
      return 230;
    default:
      return measureText(String(value), TABLE_FONT);
  }
}

function estimateColumnWidth(column: TableColumn, rows: TableRow[]) {
  const headerWidth = measureText(column.name, TABLE_FONT_SEMIBOLD) + 112;
  let contentWidth = 0;

  rows.forEach((row) => {
    const cell = row.cells.find((entry) => entry.columnId === column.id);
    contentWidth = Math.max(contentWidth, estimateCellWidth(column, cell?.value));
  });

  return clamp(Math.max(headerWidth, contentWidth + 24), TABLE_MIN_COLUMN_WIDTH, TABLE_MAX_COLUMN_WIDTH);
}

function estimateRowHeight(row: TableRow, columns: TableColumn[]) {
  let maxHeight = TABLE_BASE_ROW_HEIGHT;

  columns.forEach((column) => {
    const cell = row.cells.find((entry) => entry.columnId === column.id);
    const value = cell?.value;

    if (column.type === TableColumnType.Image && value) {
      maxHeight = Math.max(maxHeight, TABLE_IMAGE_ROW_HEIGHT);
      return;
    }

    if (column.type === TableColumnType.MultiSelect && Array.isArray(value) && value.length > 0) {
      const lines = Math.ceil(value.length / 3);
      maxHeight = Math.max(maxHeight, TABLE_BASE_ROW_HEIGHT + Math.max(0, lines - 1) * 20);
      return;
    }

    if (column.type === TableColumnType.Text && typeof value === "string" && value.trim().length > 0) {
      const width = Math.max(column.width - 24, 60);
      const lines = Math.max(1, Math.ceil(measureText(value, TABLE_FONT) / width));
      maxHeight = Math.max(maxHeight, 18 * lines + 20);
    }
  });

  return maxHeight;
}

function reorderColumnsAndRows(columns: TableColumn[], rows: TableRow[], draggingId: string, targetId: string) {
  const from = columns.findIndex((column) => column.id === draggingId);
  const to = columns.findIndex((column) => column.id === targetId);
  if (from < 0 || to < 0 || from === to) {
    return { columns, rows, changed: false };
  }

  const nextColumns = [...columns];
  const [moved] = nextColumns.splice(from, 1);
  nextColumns.splice(to, 0, moved);

  const order = nextColumns.map((column) => column.id);
  const nextRows = rows.map((row) => {
    const map = new Map(row.cells.map((cell) => [cell.columnId, cell]));
    return {
      ...row,
      cells: order.map((columnId) => map.get(columnId)).filter((cell): cell is TableCell => Boolean(cell)),
    };
  });

  return { columns: nextColumns, rows: nextRows, changed: true };
}

const useUpdateTable = () =>
  useMutation(({ storage }, layerId: string, updates: Partial<TableLayer>) => {
    const liveLayers = storage.get("layers");
    const layer = liveLayers.get(layerId);
    if (!layer) return;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        (layer as any).set(key, value);
      }
    });
  }, []);

const ColumnSettingsDialog = ({
  open,
  column,
  onClose,
  onSave,
}: {
  open: boolean;
  column: TableColumn;
  onClose: () => void;
  onSave: (column: TableColumn) => void;
}) => {
  const [draft, setDraft] = useState<TableColumn>(column);
  const [newOptionLabel, setNewOptionLabel] = useState("");

  useEffect(() => {
    setDraft(column);
  }, [column]);

  if (!open) return null;

  const addOption = () => {
    const label = newOptionLabel.trim();
    if (!label) return;
    setDraft((prev) => ({
      ...prev,
      options: [
        ...(prev.options || []),
        {
          id: `opt_${nanoid()}`,
          label,
          color: { r: 59, g: 130, b: 246 },
        },
      ],
    }));
    setNewOptionLabel("");
  };

  return (
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-slate-900/35 backdrop-blur-[2px]" onClick={onClose}>
      <div className="mx-4 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/20" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Column settings</h3>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Name</label>
            <Input
              value={draft.name}
              className="border-slate-200 bg-white text-slate-800 focus-visible:ring-slate-300"
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="table-col-required"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={Boolean(draft.required)}
              onChange={(e) => setDraft((prev) => ({ ...prev, required: e.target.checked }))}
            />
            <label htmlFor="table-col-required" className="text-sm text-slate-700">
              Required field
            </label>
          </div>

          {(draft.type === TableColumnType.Select || draft.type === TableColumnType.MultiSelect) && (
            <div className="space-y-3">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Options</label>
              {(draft.options || []).map((option) => (
                <div key={option.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2">
                  <input
                    type="color"
                    className="h-8 w-8 rounded border border-slate-300"
                    value={colorToCSS(option.color)}
                    onChange={(e) => {
                      const hex = e.target.value;
                      const color = {
                        r: parseInt(hex.slice(1, 3), 16),
                        g: parseInt(hex.slice(3, 5), 16),
                        b: parseInt(hex.slice(5, 7), 16),
                      };
                      setDraft((prev) => ({
                        ...prev,
                        options: (prev.options || []).map((entry) => (entry.id === option.id ? { ...entry, color } : entry)),
                      }));
                    }}
                  />
                  <Input
                    value={option.label}
                    className="border-slate-200 bg-white text-slate-800"
                    onChange={(e) => {
                      const label = e.target.value;
                      setDraft((prev) => ({
                        ...prev,
                        options: (prev.options || []).map((entry) => (entry.id === option.id ? { ...entry, label } : entry)),
                      }));
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => {
                      setDraft((prev) => ({
                        ...prev,
                        options: (prev.options || []).filter((entry) => entry.id !== option.id),
                      }));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 p-2">
                <div className="h-8 w-8 rounded bg-blue-500/70" />
                <Input
                  value={newOptionLabel}
                  className="border-slate-200 bg-white text-slate-800"
                  onChange={(e) => setNewOptionLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      addOption();
                    }
                  }}
                  placeholder="New option"
                />
                <Button variant="outline" size="sm" className="h-8 px-3" onClick={addOption}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

function getColumnIcon(type: TableColumnType) {
  switch (type) {
    case TableColumnType.Number:
      return Hash;
    case TableColumnType.Date:
      return Calendar;
    case TableColumnType.Select:
      return ChevronDown;
    case TableColumnType.MultiSelect:
      return List;
    case TableColumnType.Image:
      return ImageIcon;
    case TableColumnType.Person:
      return User;
    default:
      return Type;
  }
}

const CellEditor = ({
  rowId,
  column,
  cell,
  people,
  onChange,
}: {
  rowId: string;
  column: TableColumn;
  cell: TableCell;
  people: PersonOption[];
  onChange: (rowId: string, columnId: string, value: unknown) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(cell.value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(String(cell.value ?? ""));
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing, cell.value]);

  const commitTextLike = useCallback(() => {
    if (column.type === TableColumnType.Number) {
      const parsed = Number(draft);
      onChange(rowId, column.id, Number.isFinite(parsed) ? parsed : 0);
    } else {
      onChange(rowId, column.id, draft);
    }
    setEditing(false);
  }, [column.type, column.id, draft, onChange, rowId]);

  const value = cell.value;

  if (column.type === TableColumnType.Text || column.type === TableColumnType.Number || column.type === TableColumnType.Date) {
    if (editing) {
      return (
        <Input
          ref={inputRef}
          value={draft}
          type={column.type === TableColumnType.Number ? "number" : column.type === TableColumnType.Date ? "date" : "text"}
          className="h-9 border border-slate-200 bg-white p-2 text-slate-800 shadow-none focus-visible:ring-1 focus-visible:ring-slate-300"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitTextLike}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitTextLike();
            }
            if (e.key === "Escape") {
              setEditing(false);
              setDraft(String(cell.value ?? ""));
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      );
    }

    if (column.type === TableColumnType.Date) {
      return (
        <button
          type="button"
          data-table-interactive="true"
          className="flex h-full w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-slate-50"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
          <span className={`text-sm ${value ? "text-slate-800" : "italic text-slate-400"}`}>
            {value ? new Date(String(value)).toLocaleDateString("en-GB") : "Select date"}
          </span>
        </button>
      );
    }

    return (
      <button
        type="button"
        data-table-interactive="true"
        className="h-full w-full rounded-md px-2 py-1 text-left hover:bg-slate-50"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span
          className={`text-sm ${
            value === "" || value === null || value === undefined ? "italic text-slate-400" : "text-slate-800"
          } ${column.type === TableColumnType.Number ? "font-mono tabular-nums" : "whitespace-pre-wrap break-words"}`}
        >
          {value === "" || value === null || value === undefined
            ? column.type === TableColumnType.Number
              ? "0"
              : "Enter text"
            : String(value)}
        </span>
      </button>
    );
  }

  if (column.type === TableColumnType.Select) {
    const selected = column.options?.find((entry) => entry.id === value);

    return (
      <div data-table-interactive="true" className="w-full" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 w-full justify-start rounded-lg border border-slate-200/80 bg-white px-2 shadow-none hover:border-slate-300 hover:bg-slate-50"
            >
              {selected ? (
                <Badge
                  variant="secondary"
                  className="border text-xs"
                  style={{
                    backgroundColor: `${colorToCSS(selected.color)}20`,
                    color: colorToCSS(selected.color),
                    borderColor: `${colorToCSS(selected.color)}55`,
                  }}
                >
                  {selected.label}
                </Badge>
              ) : (
                <span className="text-sm italic text-slate-400">Select option</span>
              )}
              <ChevronDown className="ml-auto h-3 w-3 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={`${TABLE_MENU_CONTENT_CLASS} min-w-[220px] max-h-[240px] overflow-y-auto`}>
            {(column.options || []).map((option) => (
              <DropdownMenuItem
                key={option.id}
                className={TABLE_MENU_ITEM_CLASS}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(rowId, column.id, option.id);
                }}
              >
                <Badge
                  variant="secondary"
                  className="border text-xs"
                  style={{
                    backgroundColor: `${colorToCSS(option.color)}20`,
                    color: colorToCSS(option.color),
                    borderColor: `${colorToCSS(option.color)}55`,
                  }}
                >
                  {option.label}
                </Badge>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(rowId, column.id, "");
              }}
              className={`${TABLE_MENU_ITEM_CLASS} text-slate-500`}
            >
              Clear
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  if (column.type === TableColumnType.MultiSelect) {
    const selectedIds = Array.isArray(value) ? value : [];

    return (
      <div data-table-interactive="true" className="w-full" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto min-h-9 w-full justify-start rounded-lg border border-slate-200/80 bg-white px-2 py-1 shadow-none hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex w-full flex-wrap items-center gap-1">
                {selectedIds.length === 0 && <span className="text-sm italic text-slate-400">Select options</span>}
                {selectedIds.slice(0, 3).map((optionId) => {
                  const option = column.options?.find((entry) => entry.id === optionId);
                  if (!option) return null;
                  return (
                    <Badge
                      key={optionId}
                      variant="secondary"
                      className="border text-xs"
                      style={{
                        backgroundColor: `${colorToCSS(option.color)}20`,
                        color: colorToCSS(option.color),
                        borderColor: `${colorToCSS(option.color)}55`,
                      }}
                    >
                      {option.label}
                    </Badge>
                  );
                })}
                {selectedIds.length > 3 && <Badge variant="outline">+{selectedIds.length - 3}</Badge>}
              </div>
              <ChevronDown className="ml-auto h-3 w-3 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={`${TABLE_MENU_CONTENT_CLASS} min-w-[240px] max-h-[250px] overflow-y-auto`}>
            {(column.options || []).map((option) => {
              const active = selectedIds.includes(option.id);
              return (
                <DropdownMenuItem
                  key={option.id}
                  className={TABLE_MENU_ITEM_CLASS}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const next = active
                      ? selectedIds.filter((entry) => entry !== option.id)
                      : [...selectedIds, option.id];
                    onChange(rowId, column.id, next);
                  }}
                >
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      active ? "border-blue-600 bg-blue-600" : "border-slate-300"
                    }`}
                  >
                    {active && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <Badge
                    variant="secondary"
                    className="border text-xs"
                    style={{
                      backgroundColor: `${colorToCSS(option.color)}20`,
                      color: colorToCSS(option.color),
                      borderColor: `${colorToCSS(option.color)}55`,
                    }}
                  >
                    {option.label}
                  </Badge>
                </DropdownMenuItem>
              );
            })}
            {selectedIds.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(rowId, column.id, []);
                  }}
                  className={`${TABLE_MENU_ITEM_CLASS} text-slate-500`}
                >
                  Clear all
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  if (column.type === TableColumnType.Person) {
    const selectedId = typeof value === "string" ? value : "";
    const selectedPerson = people.find((entry) => entry.id === selectedId) || null;

    return (
      <div data-table-interactive="true" className="w-full" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 w-full justify-start rounded-lg border border-slate-200/80 bg-white px-2 shadow-none hover:border-slate-300 hover:bg-slate-50"
            >
              {selectedPerson ? (
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-[10px] font-semibold text-slate-600">
                    {selectedPerson.picture ? (
                      <img src={selectedPerson.picture} alt={selectedPerson.name} className="h-full w-full object-cover" />
                    ) : (
                      initialsFromName(selectedPerson.name)
                    )}
                  </div>
                  <span className="max-w-[140px] truncate text-sm text-slate-800">{selectedPerson.name}</span>
                </div>
              ) : (
                <span className="text-sm italic text-slate-400">Assign person</span>
              )}
              <ChevronDown className="ml-auto h-3 w-3 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={`${TABLE_MENU_CONTENT_CLASS} min-w-[240px] max-h-[250px] overflow-y-auto`}>
            {people.map((person) => (
              <DropdownMenuItem
                key={person.id}
                className={TABLE_MENU_ITEM_CLASS}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange(rowId, column.id, person.id);
                }}
              >
                <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-[10px] font-semibold text-slate-600">
                  {person.picture ? (
                    <img src={person.picture} alt={person.name} className="h-full w-full object-cover" />
                  ) : (
                    initialsFromName(person.name)
                  )}
                </div>
                <span className="max-w-[150px] truncate">{person.name}</span>
                {selectedId === person.id && <Check className="ml-auto h-3.5 w-3.5 text-blue-600" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange(rowId, column.id, "");
              }}
              className={`${TABLE_MENU_ITEM_CLASS} text-slate-500`}
            >
              Clear
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  if (column.type === TableColumnType.Image) {
    const url = typeof value === "string" ? value : "";

    return (
      <div data-table-interactive="true" className="group relative flex h-full w-full items-center justify-center">
        {url ? (
          <>
            {url.match(/\.(mp4|webm|ogg|mov)$/i) ? (
              <video src={url} preload="metadata" muted playsInline className="max-h-[84px] max-w-full rounded object-contain" />
            ) : (
              <img src={url} alt="Table media" loading="lazy" className="max-h-[84px] max-w-full rounded object-contain" />
            )}
            <button
              type="button"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
              onClick={(e) => {
                e.stopPropagation();
                onChange(rowId, column.id, "");
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Remove media"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 text-slate-400">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
      </div>
    );
  }

  return <span className="text-sm text-slate-700">{String(value || "")}</span>;
};

export const Table = memo(({ id, layer, onPointerDown, selectionColor, isSelected = false }: TableProps) => {
  const {
    x,
    y,
    width,
    height,
    fill,
    title,
    columns,
    rows,
    borderColor,
    headerColor,
    alternateRowColors,
    showRowNumbers,
  } = layer;

  const updateTable = useUpdateTable();
  const manualWidthColumnsRef = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const me = useSelf(
    (self) => {
      const selfId = typeof self.id === "string" ? self.id : "me";
      const profile = self.info || {};
      return {
        id: selfId,
        name: profile.name || "You",
        picture: profile.picture,
      } as PersonOption;
    },
    shallow,
  ) as PersonOption | null;
  const others = useOthersMapped(
    (other) => {
      const profile = other.info || {};
      return {
        id: `${other.connectionId}`,
        name: profile.name || "Collaborator",
        picture: profile.picture,
      } as PersonOption;
    },
    shallow,
  ) as Array<[number, PersonOption]>;

  const [columnResize, setColumnResize] = useState<ColumnResizeState | null>(null);
  const [resizePreviewWidth, setResizePreviewWidth] = useState<number | null>(null);
  const [columnDrag, setColumnDrag] = useState<ColumnDragState>({ draggingId: null, overId: null });
  const [settingsColumnId, setSettingsColumnId] = useState<string | null>(null);
  const [dropCell, setDropCell] = useState<string | null>(null);

  const normalizedColumnsResult = useMemo(() => normalizeColumns(columns), [columns]);
  const normalizedColumns = normalizedColumnsResult.columns;

  const normalizedRowsResult = useMemo(() => normalizeRows(rows, normalizedColumns), [rows, normalizedColumns]);
  const normalizedRows = normalizedRowsResult.rows;

  const people = useMemo(() => {
    const map = new Map<string, PersonOption>();
    if (me?.id) {
      map.set(me.id, me);
    }
    others.forEach(([, entry]) => {
      const person = entry as PersonOption | null | undefined;
      if (!person?.id) return;
      map.set(person.id, person);
    });
    return Array.from(map.values());
  }, [me, others]);

  const rowNumberWidth = showRowNumbers ? TABLE_ROW_NUMBER_WIDTH : 0;

  const widthMap = useMemo(() => {
    const map = new Map<string, number>();
    normalizedColumns.forEach((column) => map.set(column.id, column.width));
    if (columnResize?.columnId && resizePreviewWidth !== null) {
      map.set(columnResize.columnId, resizePreviewWidth);
    }
    return map;
  }, [normalizedColumns, columnResize, resizePreviewWidth]);

  const renderedColumns = useMemo(
    () => normalizedColumns.map((column) => ({ ...column, width: widthMap.get(column.id) || column.width })),
    [normalizedColumns, widthMap],
  );

  const rowHeights = useMemo(() => normalizedRows.map((row) => estimateRowHeight(row, renderedColumns)), [normalizedRows, renderedColumns]);

  const titleHeight = title ? TABLE_TITLE_HEIGHT : 0;
  const minimumTableHeight = titleHeight + TABLE_HEADER_HEIGHT + TABLE_FOOTER_HEIGHT + TABLE_BASE_ROW_HEIGHT;

  const minimumCommittedWidth = useMemo(() => {
    const columnsWidth = normalizedColumns.reduce((sum, column) => sum + column.width, 0);
    return columnsWidth + rowNumberWidth + TABLE_ACTION_COLUMN_WIDTH;
  }, [normalizedColumns, rowNumberWidth]);

  const minimumRenderWidth = useMemo(() => {
    const columnsWidth = renderedColumns.reduce((sum, column) => sum + column.width, 0);
    return columnsWidth + rowNumberWidth + TABLE_ACTION_COLUMN_WIDTH;
  }, [renderedColumns, rowNumberWidth]);

  const settingsColumn = useMemo(
    () => normalizedColumns.find((column) => column.id === settingsColumnId) || null,
    [normalizedColumns, settingsColumnId],
  );

  const patch = useCallback(
    (updates: Partial<TableLayer>) => {
      updateTable(id, updates);
    },
    [updateTable, id],
  );

  useEffect(() => {
    const shouldPatchColumns = normalizedColumnsResult.changed;
    const shouldPatchRows = normalizedRowsResult.changed;
    if (!shouldPatchColumns && !shouldPatchRows) return;

    const updates: Partial<TableLayer> = {};
    if (shouldPatchColumns) updates.columns = normalizedColumns;
    if (shouldPatchRows) updates.rows = normalizedRows;
    if (width < minimumCommittedWidth) {
      updates.width = minimumCommittedWidth;
    }

    patch(updates);
  }, [
    normalizedColumnsResult.changed,
    normalizedRowsResult.changed,
    normalizedColumns,
    normalizedRows,
    width,
    minimumCommittedWidth,
    patch,
  ]);

  useEffect(() => {
    if (columnResize) return;
    if (width >= minimumCommittedWidth) return;
    patch({ width: minimumCommittedWidth });
  }, [width, minimumCommittedWidth, patch, columnResize]);

  useEffect(() => {
    if (height >= minimumTableHeight) return;
    patch({ height: minimumTableHeight });
  }, [height, minimumTableHeight, patch]);

  useEffect(() => {
    const autoResizableColumns = normalizedColumns.filter((column) => !manualWidthColumnsRef.current.has(column.id));
    if (autoResizableColumns.length === 0) return;

    let changed = false;
    const nextColumns = normalizedColumns.map((column) => {
      if (manualWidthColumnsRef.current.has(column.id)) {
        return column;
      }
      const suggested = estimateColumnWidth(column, normalizedRows);
      if (Math.abs(suggested - column.width) <= 1) {
        return column;
      }
      changed = true;
      return {
        ...column,
        width: suggested,
      };
    });

    if (!changed) return;

    const nextWidth = nextColumns.reduce((sum, column) => sum + column.width, 0) + rowNumberWidth + TABLE_ACTION_COLUMN_WIDTH;
    const updates: Partial<TableLayer> = { columns: nextColumns };
    if (width < nextWidth) {
      updates.width = nextWidth;
    }
    patch(updates);
  }, [normalizedColumns, normalizedRows, patch, width, rowNumberWidth]);

  useEffect(() => {
    if (!columnResize) return;

    const onMove = (event: PointerEvent) => {
      const nextWidth = clamp(
        columnResize.startWidth + (event.clientX - columnResize.startX),
        TABLE_MIN_COLUMN_WIDTH,
        TABLE_MAX_COLUMN_WIDTH,
      );
      setResizePreviewWidth(nextWidth);
    };

    const onUp = () => {
      const committedWidth = resizePreviewWidth ?? columnResize.startWidth;
      const nextColumns = normalizedColumns.map((column) =>
        column.id === columnResize.columnId
          ? {
              ...column,
              width: committedWidth,
            }
          : column,
      );

      manualWidthColumnsRef.current.add(columnResize.columnId);

      const nextMinWidth = nextColumns.reduce((sum, column) => sum + column.width, 0) + rowNumberWidth + TABLE_ACTION_COLUMN_WIDTH;
      const updates: Partial<TableLayer> = { columns: nextColumns };
      if (width < nextMinWidth) {
        updates.width = nextMinWidth;
      }
      patch(updates);

      setColumnResize(null);
      setResizePreviewWidth(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerup", onUp, { once: true });

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [columnResize, resizePreviewWidth, normalizedColumns, patch, width, rowNumberWidth]);

  const updateCell = useCallback(
    (rowId: string, columnId: string, value: unknown) => {
      const nextRows = normalizedRows.map((row) => {
        if (row.id !== rowId) return row;

        const nextCells = row.cells.map((cell) =>
          cell.columnId === columnId
            ? {
                ...cell,
                value,
              }
            : cell,
        );

        if (!nextCells.some((cell) => cell.columnId === columnId)) {
          nextCells.push({ columnId, value });
        }

        return {
          ...row,
          cells: nextCells,
          updatedAt: new Date().toISOString(),
        };
      });

      let nextColumns = normalizedColumns;
      if (!manualWidthColumnsRef.current.has(columnId)) {
        const targetColumn = normalizedColumns.find((column) => column.id === columnId);
        if (targetColumn) {
          const suggested = estimateColumnWidth(targetColumn, nextRows);
          if (Math.abs(suggested - targetColumn.width) > 1) {
            nextColumns = normalizedColumns.map((column) =>
              column.id === columnId
                ? {
                    ...column,
                    width: suggested,
                  }
                : column,
            );
          }
        }
      }

      const updates: Partial<TableLayer> = { rows: nextRows };
      if (nextColumns !== normalizedColumns) {
        updates.columns = nextColumns;
      }

      const nextMinWidth = nextColumns.reduce((sum, column) => sum + column.width, 0) + rowNumberWidth + TABLE_ACTION_COLUMN_WIDTH;
      if (width < nextMinWidth) {
        updates.width = nextMinWidth;
      }

      patch(updates);
    },
    [normalizedRows, normalizedColumns, patch, width, rowNumberWidth],
  );

  // Support media drop dispatched by layer-preview while dragging board image/video layers.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleBoardDrop = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      if (!detail) return;
      const { rowId, columnId, layerData } = detail;
      if (!rowId || !columnId) return;

      const targetColumn = normalizedColumns.find((column) => column.id === columnId);
      if (!targetColumn || targetColumn.type !== TableColumnType.Image) return;

      const mediaUrl = typeof layerData?.url === "string" ? layerData.url : "";
      if (!mediaUrl) return;

      updateCell(rowId, columnId, mediaUrl);
      toast.success("Media added to cell");
    };

    container.addEventListener("boardElementDrop", handleBoardDrop as EventListener);
    return () => container.removeEventListener("boardElementDrop", handleBoardDrop as EventListener);
  }, [normalizedColumns, updateCell]);

  const addRow = useCallback(() => {
    const now = new Date().toISOString();
    const newRow: TableRow = {
      id: `row_${nanoid()}`,
      createdAt: now,
      updatedAt: now,
      cells: normalizedColumns.map((column) => ({
        columnId: column.id,
        value: defaultValueForType(column.type),
      })),
    };

    patch({ rows: [...normalizedRows, newRow] });
  }, [normalizedColumns, normalizedRows, patch]);

  const removeRow = useCallback(
    (rowId: string) => {
      if (normalizedRows.length <= 1) {
        toast.error("Cannot remove the last row");
        return;
      }
      patch({ rows: normalizedRows.filter((row) => row.id !== rowId) });
    },
    [normalizedRows, patch],
  );

  const addColumn = useCallback(
    (type: TableColumnType) => {
      const newColumn: TableColumn = {
        id: `col_${nanoid()}`,
        name: `Column ${normalizedColumns.length + 1}`,
        type,
        width: TABLE_DEFAULT_COLUMN_WIDTH,
        options: type === TableColumnType.Select || type === TableColumnType.MultiSelect ? defaultOptions() : undefined,
      };

      const nextColumns = [...normalizedColumns, newColumn].map((column) => ({
        ...column,
        width: estimateColumnWidth(column, normalizedRows),
      }));

      const nextRows = normalizedRows.map((row) => ({
        ...row,
        cells: [...row.cells, { columnId: newColumn.id, value: defaultValueForType(type) }],
      }));

      const nextMinWidth = nextColumns.reduce((sum, column) => sum + column.width, 0) + rowNumberWidth + TABLE_ACTION_COLUMN_WIDTH;

      patch({
        columns: nextColumns,
        rows: nextRows,
        width: Math.max(width, nextMinWidth),
      });
    },
    [normalizedColumns, normalizedRows, patch, width, rowNumberWidth],
  );

  const updateColumn = useCallback(
    (columnId: string, updates: Partial<TableColumn>) => {
      const nextColumns = normalizedColumns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              ...updates,
            }
          : column,
      );
      patch({ columns: nextColumns });
    },
    [normalizedColumns, patch],
  );

  const removeColumn = useCallback(
    (columnId: string) => {
      if (normalizedColumns.length <= 1) {
        toast.error("Cannot remove the last column");
        return;
      }

      const nextColumns = normalizedColumns.filter((column) => column.id !== columnId);
      const nextRows = normalizedRows.map((row) => ({
        ...row,
        cells: row.cells.filter((cell) => cell.columnId !== columnId),
      }));

      manualWidthColumnsRef.current.delete(columnId);

      const nextMinWidth = nextColumns.reduce((sum, column) => sum + column.width, 0) + rowNumberWidth + TABLE_ACTION_COLUMN_WIDTH;
      patch({
        columns: nextColumns,
        rows: nextRows,
        width: Math.max(nextMinWidth, TABLE_MIN_COLUMN_WIDTH + TABLE_ACTION_COLUMN_WIDTH),
      });
    },
    [normalizedColumns, normalizedRows, patch, rowNumberWidth],
  );

  const handleColumnReorder = useCallback(
    (targetId: string) => {
      if (!columnDrag.draggingId) {
        setColumnDrag({ draggingId: null, overId: null });
        return;
      }

      const reordered = reorderColumnsAndRows(normalizedColumns, normalizedRows, columnDrag.draggingId, targetId);
      if (!reordered.changed) {
        setColumnDrag({ draggingId: null, overId: null });
        return;
      }

      patch({
        columns: reordered.columns,
        rows: reordered.rows,
      });

      setColumnDrag({ draggingId: null, overId: null });
    },
    [columnDrag.draggingId, normalizedColumns, normalizedRows, patch],
  );

  const handleMediaDrop = useCallback(
    (event: React.DragEvent, rowId: string, columnId: string) => {
      event.preventDefault();
      event.stopPropagation();
      setDropCell(null);

      const payload = event.dataTransfer.getData("application/board-layer");
      if (!payload) return;

      try {
        const data = JSON.parse(payload);
        if ((data?.type === "image" || data?.type === "video") && typeof data?.url === "string") {
          updateCell(rowId, columnId, data.url);
          toast.success("Media added to cell");
        }
      } catch {
        // Ignore malformed payload.
      }
    },
    [updateCell],
  );

  const tableHeight = Math.max(height, minimumTableHeight);
  const bodyViewportHeight = Math.max(0, tableHeight - titleHeight - TABLE_HEADER_HEIGHT - TABLE_FOOTER_HEIGHT);

  return (
    <foreignObject
      id={id}
      data-layer-id={id}
      x={x}
      y={y}
      width={Math.max(width, minimumRenderWidth)}
      height={tableHeight}
      className="drop-shadow-md"
      style={{
        outline: isSelected ? `2px solid ${selectionColor}` : "none",
        outlineOffset: isSelected ? "2px" : "0",
      }}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;

        if (target.closest("[data-table-drag-handle='true']")) {
          onPointerDown(event, id);
          return;
        }

        if (target.closest("[data-table-interactive='true']")) {
          event.stopPropagation();
          return;
        }

        onPointerDown(event, id);
      }}
    >
      <div
        ref={containerRef}
        data-table-container="true"
        className="relative h-full w-full overflow-hidden rounded-2xl border bg-white/95 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)]"
        style={{
          borderColor: borderColor ? colorToCSS(borderColor) : "#e2e8f0",
          backgroundColor: colorToCSS(fill),
        }}
      >
        {title && (
          <div
            className="flex h-[44px] items-center justify-between border-b bg-gradient-to-r from-white to-slate-50/60 px-3.5"
            style={{ borderBottomColor: borderColor ? colorToCSS(borderColor) : "#e2e8f0" }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                data-table-drag-handle="true"
                data-table-interactive="true"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Drag table"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onPointerDown(event, id);
                }}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <span className="truncate text-sm font-semibold text-slate-900">{title}</span>
              <Badge variant="outline" className="border-slate-300 bg-white text-[11px] text-slate-600">
                {normalizedRows.length}
              </Badge>
            </div>

            <Button
              variant="outline"
              size="sm"
              data-table-interactive="true"
              className="h-8 border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50"
              onClick={(event) => {
                event.stopPropagation();
                addRow();
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Row
            </Button>
          </div>
        )}

        <div
          className="flex h-[46px] border-b bg-gradient-to-b from-slate-50 to-slate-100/80"
          style={{
            borderBottomColor: borderColor ? colorToCSS(borderColor) : "#e2e8f0",
            backgroundColor: headerColor ? colorToCSS(headerColor) : undefined,
          }}
        >
          {showRowNumbers && (
            <div
              className="flex items-center justify-center border-r text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              style={{ width: rowNumberWidth, borderRightColor: borderColor ? colorToCSS(borderColor) : "#e2e8f0" }}
            >
              #
            </div>
          )}

          {renderedColumns.map((column, index) => {
            const Icon = getColumnIcon(column.type);
            const isDragging = columnDrag.draggingId === column.id;
            const isDragOver = columnDrag.overId === column.id;

            return (
              <div
                key={column.id}
                data-table-interactive="true"
                draggable={column.type !== TableColumnType.Image}
                onDragStart={(event) => {
                  if (column.type === TableColumnType.Image) return;
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = "move";
                  setColumnDrag((prev) => ({ ...prev, draggingId: column.id }));
                }}
                onDragOver={(event) => {
                  if (column.type === TableColumnType.Image) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setColumnDrag((prev) => ({ ...prev, overId: column.id }));
                }}
                onDrop={(event) => {
                  if (column.type === TableColumnType.Image) return;
                  event.preventDefault();
                  event.stopPropagation();
                  handleColumnReorder(column.id);
                }}
                onDragEnd={() => setColumnDrag({ draggingId: null, overId: null })}
                className={`group relative flex items-center gap-2.5 border-r px-3 ${
                  column.type !== TableColumnType.Image ? "cursor-move" : "cursor-default"
                } ${isDragging ? "opacity-45" : ""} ${isDragOver ? "bg-blue-100/80" : ""}`}
                style={{
                  width: column.width,
                  borderRightColor: borderColor ? colorToCSS(borderColor) : "#e2e8f0",
                }}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                <span className="truncate text-sm font-medium text-slate-700">{column.name}</span>
                {column.required && <span className="text-xs text-rose-500">*</span>}

                <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-slate-500 hover:bg-slate-200/70 hover:text-slate-700"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSettingsColumnId(column.id);
                    }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-slate-500 hover:bg-slate-200/70 hover:text-slate-700"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className={TABLE_MENU_CONTENT_CLASS}>
                      <DropdownMenuLabel>Column</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className={TABLE_MENU_ITEM_CLASS}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          manualWidthColumnsRef.current.delete(column.id);
                          const auto = estimateColumnWidth(column, normalizedRows);
                          updateColumn(column.id, { width: auto });
                        }}
                      >
                        Fit to content
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={`${TABLE_MENU_ITEM_CLASS} text-rose-600 focus:text-rose-600`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          removeColumn(column.id);
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete column
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {index < renderedColumns.length - 1 && (
                  <div
                    className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize"
                    title="Drag to resize"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      setColumnResize({
                        columnId: column.id,
                        startX: event.clientX,
                        startWidth: column.width,
                      });
                      setResizePreviewWidth(column.width);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      manualWidthColumnsRef.current.delete(column.id);
                      const auto = estimateColumnWidth(column, normalizedRows);
                      updateColumn(column.id, { width: auto });
                    }}
                  >
                    <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-blue-400" />
                  </div>
                )}
              </div>
            );
          })}

          <div data-table-interactive="true" className="flex items-center justify-center" style={{ width: TABLE_ACTION_COLUMN_WIDTH }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50">
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Col
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className={`${TABLE_MENU_CONTENT_CLASS} min-w-[200px]`}>
                <DropdownMenuItem className={TABLE_MENU_ITEM_CLASS} onClick={() => addColumn(TableColumnType.Text)}>
                  <Type className="mr-2 h-3.5 w-3.5" />
                  Text
                </DropdownMenuItem>
                <DropdownMenuItem className={TABLE_MENU_ITEM_CLASS} onClick={() => addColumn(TableColumnType.Number)}>
                  <Hash className="mr-2 h-3.5 w-3.5" />
                  Number
                </DropdownMenuItem>
                <DropdownMenuItem className={TABLE_MENU_ITEM_CLASS} onClick={() => addColumn(TableColumnType.Date)}>
                  <Calendar className="mr-2 h-3.5 w-3.5" />
                  Date
                </DropdownMenuItem>
                <DropdownMenuItem className={TABLE_MENU_ITEM_CLASS} onClick={() => addColumn(TableColumnType.Select)}>
                  <ChevronDown className="mr-2 h-3.5 w-3.5" />
                  Select
                </DropdownMenuItem>
                <DropdownMenuItem className={TABLE_MENU_ITEM_CLASS} onClick={() => addColumn(TableColumnType.MultiSelect)}>
                  <List className="mr-2 h-3.5 w-3.5" />
                  Multi-select
                </DropdownMenuItem>
                <DropdownMenuItem className={TABLE_MENU_ITEM_CLASS} onClick={() => addColumn(TableColumnType.Person)}>
                  <User className="mr-2 h-3.5 w-3.5" />
                  Person
                </DropdownMenuItem>
                <DropdownMenuItem className={TABLE_MENU_ITEM_CLASS} onClick={() => addColumn(TableColumnType.Image)}>
                  <ImageIcon className="mr-2 h-3.5 w-3.5" />
                  Image / Video
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="overflow-auto bg-white/80" style={{ maxHeight: bodyViewportHeight }}>
          {normalizedRows.map((row, rowIndex) => {
            const rowHeight = rowHeights[rowIndex] || TABLE_BASE_ROW_HEIGHT;

            return (
              <div
                key={row.id}
                data-row-id={row.id}
                className={`group flex border-b transition-colors ${alternateRowColors && rowIndex % 2 === 1 ? "bg-slate-50/60" : "bg-white"} hover:bg-slate-50/80`}
                style={{
                  minHeight: rowHeight,
                  borderBottomColor: borderColor ? colorToCSS(borderColor) : "#f1f5f9",
                }}
              >
                {showRowNumbers && (
                  <div
                    data-table-interactive="true"
                    className="flex items-center justify-center border-r text-xs font-medium text-slate-500"
                    style={{ width: rowNumberWidth, borderRightColor: borderColor ? colorToCSS(borderColor) : "#f1f5f9" }}
                  >
                    {rowIndex + 1}
                  </div>
                )}

                {renderedColumns.map((column) => {
                  const cell = row.cells.find((entry) => entry.columnId === column.id) || {
                    columnId: column.id,
                    value: defaultValueForType(column.type),
                  };

                  const cellKey = `${row.id}:${column.id}`;
                  const isDropTarget = dropCell === cellKey;
                  const isMediaColumn = column.type === TableColumnType.Image;

                  return (
                    <div
                      key={cellKey}
                      data-table-interactive="true"
                      data-column-id={column.id}
                      data-column-type={column.type}
                      className={`relative border-r px-3 py-1.5 ${isMediaColumn ? "flex items-center justify-center" : "flex items-start"} ${
                        isDropTarget ? "bg-blue-100/70" : ""
                      }`}
                      style={{
                        width: column.width,
                        minHeight: rowHeight,
                        borderRightColor: borderColor ? colorToCSS(borderColor) : "#f1f5f9",
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onDragOver={
                        isMediaColumn
                          ? (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (dropCell !== cellKey) {
                                setDropCell(cellKey);
                              }
                            }
                          : undefined
                      }
                      onDragLeave={
                        isMediaColumn
                          ? (event) => {
                              event.stopPropagation();
                              const nextTarget = event.relatedTarget as Node | null;
                              if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                                setDropCell((current) => (current === cellKey ? null : current));
                              }
                            }
                          : undefined
                      }
                      onDrop={
                        isMediaColumn
                          ? (event) => {
                              handleMediaDrop(event, row.id, column.id);
                            }
                          : undefined
                      }
                    >
                      <CellEditor rowId={row.id} column={column} cell={cell} people={people} onChange={updateCell} />

                      {isMediaColumn && isDropTarget && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded border-2 border-dashed border-blue-400 bg-blue-100/40 text-xs font-medium text-blue-700">
                          Drop media here
                        </div>
                      )}
                    </div>
                  );
                })}

                <div data-table-interactive="true" className="flex items-center justify-center" style={{ width: TABLE_ACTION_COLUMN_WIDTH }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeRow(row.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          data-table-interactive="true"
          className="flex h-[40px] w-full items-center gap-2 border-t border-dashed bg-slate-50/50 px-3.5 text-sm text-slate-700 hover:bg-slate-100"
          style={{ borderTopColor: borderColor ? colorToCSS(borderColor) : "#e2e8f0" }}
          onClick={(event) => {
            event.stopPropagation();
            addRow();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Plus className="h-4 w-4" />
          Add row
        </button>
      </div>

      {settingsColumn && (
        <ColumnSettingsDialog
          open={Boolean(settingsColumn)}
          column={settingsColumn}
          onClose={() => setSettingsColumnId(null)}
          onSave={(nextColumn) => updateColumn(nextColumn.id, nextColumn)}
        />
      )}
    </foreignObject>
  );
});

Table.displayName = "Table";
