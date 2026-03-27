"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  Database,
  Minus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 20;

interface TableMultiSelectProps {
  tables: string[];
  selectedTables: string[];
  tableProfiles?: Record<string, { row_count: number | null }>;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onAdd: (tables: string[]) => void;
  onRemove: (tables: string[]) => void;
}

export function TableMultiSelect({
  tables,
  selectedTables,
  tableProfiles,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  onAdd,
  onRemove,
}: TableMultiSelectProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const collapsed = controlledCollapsed ?? internalCollapsed;
  const setCollapsed = onCollapsedChange ?? setInternalCollapsed;

  const query = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!query) return tables;
    return tables.filter((t) => t.toLowerCase().includes(query));
  }, [tables, query]);

  const selectedSet = useMemo(() => new Set(selectedTables), [selectedTables]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedTables = filtered.slice(
    safePage * pageSize,
    (safePage + 1) * pageSize
  );

  // Page selection state
  const pageSelectedCount = pagedTables.filter((t) => selectedSet.has(t)).length;
  const allPageSelected = pagedTables.length > 0 && pageSelectedCount === pagedTables.length;
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected;

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    setPage(0);
  }, []);

  const toggle = useCallback(
    (table: string) => {
      if (selectedSet.has(table)) {
        onRemove([table]);
      } else {
        onAdd([table]);
      }
    },
    [selectedSet, onAdd, onRemove]
  );

  // Checkbox toggle: select/deselect current page
  const handleTogglePage = useCallback(() => {
    if (allPageSelected) {
      const toRemove = pagedTables.filter((t) => selectedSet.has(t));
      if (toRemove.length > 0) onRemove(toRemove);
    } else {
      const toAdd = pagedTables.filter((t) => !selectedSet.has(t));
      if (toAdd.length > 0) onAdd(toAdd);
    }
  }, [pagedTables, selectedSet, allPageSelected, onAdd, onRemove]);

  const handleSelectAll = useCallback(() => {
    const toAdd = filtered.filter((t) => !selectedSet.has(t));
    if (toAdd.length > 0) onAdd(toAdd);
  }, [filtered, selectedSet, onAdd]);

  const handleDeselectAll = useCallback(() => {
    if (selectedTables.length > 0) onRemove([...selectedTables]);
  }, [selectedTables, onRemove]);

  const rowCount = (table: string) => {
    const tp = tableProfiles?.[table];
    if (!tp || tp.row_count == null) return null;
    return tp.row_count;
  };

  // Collapsed summary bar
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-foreground-10 bg-background hover:bg-foreground-2 transition-colors text-left"
      >
        <Database className="w-3.5 h-3.5 text-foreground-30 flex-shrink-0" />
        <span className="flex-1 text-xs text-foreground-50">
          选择要分析的表
        </span>
        <span className="text-[11px] text-foreground-30">
          已选 {selectedTables.length}/{tables.length}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-foreground-30 flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex flex-col rounded-lg border border-foreground-10 bg-background overflow-hidden">
      {/* Search header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-foreground-5">
        <Search className="w-3.5 h-3.5 text-foreground-30 flex-shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="搜索表名..."
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-foreground-30"
        />
        <button
          onClick={() => setCollapsed(true)}
          className="p-0.5 rounded hover:bg-foreground-5 transition-colors flex-shrink-0"
        >
          <ChevronUp className="w-3.5 h-3.5 text-foreground-30" />
        </button>
      </div>

      {/* Toolbar row: checkbox + dropdown + count */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-foreground-5 bg-foreground-2/30">
        <div className="flex items-center gap-1">
          {/* Page select checkbox */}
          <button
            onClick={handleTogglePage}
            className={`flex items-center justify-center w-4 h-4 rounded border flex-shrink-0 transition-colors mr-1 ${
              allPageSelected
                ? "bg-accent border-accent text-white"
                : somePageSelected
                ? "border-accent bg-transparent text-accent"
                : "border-foreground-20 bg-transparent"
            }`}
          >
            {allPageSelected ? (
              <Check className="w-3 h-3" />
            ) : somePageSelected ? (
              <Minus className="w-3 h-3" />
            ) : null}
          </button>
          <span
            onClick={handleTogglePage}
            className="text-[11px] text-foreground-50 cursor-pointer select-none hover:text-foreground-70 transition-colors"
          >
            选择本页
          </span>

          {/* Dropdown for bulk actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-0.5 rounded hover:bg-foreground-5 transition-colors ml-0.5">
                <ChevronDown className="w-3 h-3 text-foreground-40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleSelectAll}>
                全部选择
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDeselectAll}>
                全部取消
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <span className="text-[11px] text-foreground-30">
          已选 {selectedTables.length}/{filtered.length}
        </span>
      </div>

      {/* List */}
      <div className="max-h-[280px] overflow-y-auto">
        {pagedTables.map((t) => (
          <TableRow
            key={t}
            table={t}
            selected={selectedSet.has(t)}
            rowCount={rowCount(t)}
            onToggle={() => toggle(t)}
          />
        ))}

        {filtered.length === 0 && (
          <div className="flex items-center justify-center py-6 text-xs text-foreground-30">
            没有匹配的表
          </div>
        )}
      </div>

      {/* Pagination: left=count, right=pageSize+pager */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-foreground-5 text-xs text-foreground-50">
          <span className="text-[11px] text-foreground-30">
            已选 {selectedTables.length}/{filtered.length}
          </span>
          <div className="flex items-center gap-3">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="text-[11px] bg-transparent border border-foreground-10 rounded px-1.5 py-0.5 text-foreground-50 outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}/页
                </option>
              ))}
            </select>
            <button
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="p-0.5 rounded hover:bg-foreground-5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span>
              {safePage + 1}/{totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
              disabled={safePage >= totalPages - 1}
              className="p-0.5 rounded hover:bg-foreground-5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TableRow({
  table,
  selected,
  rowCount,
  onToggle,
}: {
  table: string;
  selected: boolean;
  rowCount: number | null;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-foreground-3 transition-colors"
    >
      <div
        className={`flex items-center justify-center w-4 h-4 rounded border flex-shrink-0 transition-colors ${
          selected
            ? "bg-accent border-accent text-white"
            : "border-foreground-20 bg-transparent"
        }`}
      >
        {selected ? <Check className="w-3 h-3" /> : null}
      </div>
      <span className="flex-1 text-xs font-mono text-foreground truncate">
        {table}
      </span>
      {rowCount != null && (
        <span className="text-[10px] text-foreground-30 flex-shrink-0">
          {rowCount.toLocaleString()}行
        </span>
      )}
    </button>
  );
}
