"use client";

import { useState, useRef, useEffect } from "react";
import { X, RefreshCw, Trash2, Loader2, ChevronDown, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSourceStore } from "@/stores/source-store";
import { TableMultiSelect } from "./TableMultiSelect";
import type { DataSource } from "@/types/source";

interface SourceDetailDrawerProps {
  source: DataSource;
  onClose: () => void;
}

export function SourceDetailDrawer({ source, onClose }: SourceDetailDrawerProps) {
  const [sampleData, setSampleData] = useState<Record<string, unknown>[]>([]);
  const [loadingSample, setLoadingSample] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [activeViewTable, setActiveViewTable] = useState<string | null>(null);
  const [selectorCollapsed, setSelectorCollapsed] = useState(true);
  const [profilingTable, setProfilingTable] = useState<string | null>(null);

  const getSample = useSourceStore((s) => s.getSample);
  const refreshProfile = useSourceStore((s) => s.refreshProfile);
  const deleteSource = useSourceStore((s) => s.deleteSource);
  const updateSelectedTables = useSourceStore((s) => s.updateSelectedTables);
  const profileTable = useSourceStore((s) => s.profileTable);
  const sources = useSourceStore((s) => s.sources);

  // Get latest source data from store
  const currentSource = sources.find((s) => s.id === source.id) || source;

  const isDatabase = currentSource.source_type === "database";
  const availableTables = currentSource.available_tables || [];
  const selectedTables = currentSource.selected_tables || (currentSource.selected_table ? [currentSource.selected_table] : []);
  const tableProfiles = currentSource.table_profiles;
  const needsTableSelection = isDatabase && availableTables.length > 0;

  // Determine which table to view details for
  const viewTable = activeViewTable && selectedTables.includes(activeViewTable)
    ? activeViewTable
    : selectedTables[0] || null;

  // Get columns/profile for the active view table
  const viewTableProfile = viewTable ? tableProfiles?.[viewTable] : undefined;
  const columns = viewTableProfile?.schema_info || currentSource.schema_info || [];
  const profile = viewTableProfile?.profile || currentSource.profile;

  const issues = profile?.quality_issues || [];

  const totalRows = tableProfiles
    ? Object.values(tableProfiles).reduce((sum, tp) => sum + (tp.row_count || 0), 0)
    : currentSource.row_count || 0;

  const loadSample = async () => {
    setLoadingSample(true);
    try {
      const data = await getSample(currentSource.id, 10);
      setSampleData(data);
    } finally {
      setLoadingSample(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshProfile(currentSource.id);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    await deleteSource(currentSource.id);
    onClose();
  };

  const handleAddTables = async (tables: string[]) => {
    setTableError(null);
    const merged = Array.from(new Set([...selectedTables, ...tables]));
    try {
      await updateSelectedTables(currentSource.id, merged);
    } catch (err) {
      setTableError(err instanceof Error ? err.message : "添加表失败");
    }
  };

  const handleRemoveTables = async (tables: string[]) => {
    setTableError(null);
    const removeSet = new Set(tables);
    const remaining = selectedTables.filter((t) => !removeSet.has(t));
    try {
      await updateSelectedTables(currentSource.id, remaining);
      if (tables.includes(viewTable || "")) {
        setActiveViewTable(null);
      }
    } catch (err) {
      setTableError(err instanceof Error ? err.message : "移除表失败");
    }
  };

  // Auto-profile when viewTable changes and hasn't been profiled yet
  useEffect(() => {
    if (!viewTable) return;
    const hasProfile = (tableProfiles?.[viewTable]?.schema_info?.length ?? 0) > 0;
    if (hasProfile) return;
    if (profilingTable === viewTable) return;

    let cancelled = false;
    setProfilingTable(viewTable);
    profileTable(currentSource.id, viewTable)
      .catch((err) => {
        if (!cancelled) {
          setTableError(err instanceof Error ? err.message : "分析表失败");
        }
      })
      .finally(() => {
        if (!cancelled) setProfilingTable(null);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewTable]);

  return (
    <div className="fixed inset-y-0 right-0 z-[var(--z-panel)] w-[480px] bg-background shadow-[var(--shadow-modal-small)] flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header — fixed */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-foreground-5 flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold">{currentSource.name}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-foreground-50">{currentSource.source_type}</span>
            <Badge variant="success" className="text-[10px] px-1.5 py-0">
              {currentSource.status}
            </Badge>
            {selectedTables.length > 0 && (
              <span className="text-xs text-foreground-30">
                已选 {selectedTables.length} 张表
                {totalRows > 0 && ` · ${totalRows.toLocaleString()} 行`}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-inner hover:bg-foreground-5 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Database multi-table selector — fixed height area, collapsed by default */}
      {needsTableSelection && (
        <div className="px-5 py-3 border-b border-foreground-5 bg-foreground-2/50 flex-shrink-0">
          <TableMultiSelect
            tables={availableTables}
            selectedTables={selectedTables}
            tableProfiles={tableProfiles as Record<string, { row_count: number | null }> | undefined}
            collapsed={selectorCollapsed}
            onCollapsedChange={setSelectorCollapsed}
            onAdd={handleAddTables}
            onRemove={handleRemoveTables}
          />
          {tableError && (
            <p className="text-xs text-red-500 mt-1">{tableError}</p>
          )}
        </div>
      )}

      {/* Tabs — fills remaining space */}
      <div className="flex-1 flex flex-col min-h-0">
        <Tabs defaultValue="schema" className="flex-1 flex flex-col min-h-0">
          <div className="px-5 pt-3 flex-shrink-0">
            <TabsList className="w-full">
              <TabsTrigger value="schema" className="flex-1">表结构</TabsTrigger>
              <TabsTrigger value="profile" className="flex-1">数据画像</TabsTrigger>
              <TabsTrigger value="sample" className="flex-1">样本数据</TabsTrigger>
            </TabsList>
          </div>

          {/* Table switcher dropdown — inside tab area, only when multiple tables */}
          {selectedTables.length > 1 && (
            <div className="px-5 pt-3 flex-shrink-0">
              <SearchableTableDropdown
                tables={selectedTables}
                value={viewTable}
                tableProfiles={tableProfiles}
                onChange={setActiveViewTable}
              />
            </div>
          )}

          {/* Tab content — scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-3">
            <TabsContent value="schema" className="mt-0">
              {profilingTable === viewTable ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-foreground-30" />
                  <span className="text-xs text-foreground-30">正在分析表 {viewTable}...</span>
                </div>
              ) : columns.length === 0 ? (
                <EmptyState
                  text={needsTableSelection && selectedTables.length === 0 ? "请先选择要分析的表" : "暂无表结构信息"}
                />
              ) : (
                <div className="rounded-inner border border-foreground-5 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-foreground-2">
                        <th className="text-left px-3 py-2 font-medium text-foreground-50">字段</th>
                        <th className="text-left px-3 py-2 font-medium text-foreground-50">类型</th>
                        <th className="text-left px-3 py-2 font-medium text-foreground-50">示例值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((col) => (
                        <tr key={col.name} className="border-t border-foreground-5">
                          <td className="px-3 py-2 font-mono text-foreground">{col.name}</td>
                          <td className="px-3 py-2 text-foreground-50">{col.dtype}</td>
                          <td className="px-3 py-2 text-foreground-30 truncate max-w-[160px]">
                            {col.sample_values?.slice(0, 3).join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="profile" className="mt-0">
              {profilingTable === viewTable ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-foreground-30" />
                  <span className="text-xs text-foreground-30">正在分析表 {viewTable}...</span>
                </div>
              ) : !profile ? (
                <EmptyState
                  text={needsTableSelection && selectedTables.length === 0 ? "请先选择要分析的表" : "暂无数据画像"}
                />
              ) : (
                <div className="space-y-4">
                  {/* Overview */}
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="总行数" value={profile.row_count?.toLocaleString() ?? "-"} />
                    <StatCard label="总列数" value={profile.column_count?.toString() ?? "-"} />
                  </div>

                  {/* Quality issues */}
                  {issues.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-foreground-50 mb-2">数据质量</h4>
                      <div className="space-y-1.5">
                        {issues.map((issue, i) => (
                          <div
                            key={i}
                            className={`text-xs px-3 py-2 rounded-inner ${
                              issue.severity === "warning"
                                ? "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                                : "bg-foreground-2 text-foreground-50"
                            }`}
                          >
                            {issue.description}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Per-column stats */}
                  <div>
                    <h4 className="text-xs font-medium text-foreground-50 mb-2">列详情</h4>
                    <div className="space-y-2">
                      {columns.map((col) => (
                        <div key={col.name} className="p-3 rounded-inner bg-foreground-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono font-medium">{col.name}</span>
                            <span className="text-[10px] text-foreground-30">{col.dtype}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[10px] text-foreground-50">
                            <div>唯一值: {col.unique_count}</div>
                            <div>缺失: {(col.missing_rate * 100).toFixed(1)}%</div>
                            {col.mean_value != null && (
                              <div>均值: {col.mean_value.toFixed(2)}</div>
                            )}
                            {col.min_value != null && (
                              <div>最小: {String(col.min_value)}</div>
                            )}
                            {col.max_value != null && (
                              <div>最大: {String(col.max_value)}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="sample" className="mt-0">
              {loadingSample ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-foreground-30" />
                </div>
              ) : sampleData.length === 0 ? (
                needsTableSelection && selectedTables.length === 0 ? (
                  <EmptyState text="请先选择要分析的表" />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <span className="text-sm text-foreground-30">暂无样本数据</span>
                    <Button variant="outline" size="sm" onClick={loadSample}>
                      加载样本数据
                    </Button>
                  </div>
                )
              ) : (
                <div className="rounded-inner border border-foreground-5 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-foreground-2">
                        {Object.keys(sampleData[0]).map((key) => (
                          <th key={key} className="text-left px-3 py-2 font-medium text-foreground-50 whitespace-nowrap">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sampleData.map((row, i) => (
                        <tr key={i} className="border-t border-foreground-5">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-3 py-2 text-foreground-70 whitespace-nowrap max-w-[200px] truncate">
                              {val == null ? "" : typeof val === "object" ? JSON.stringify(val) : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Footer actions — fixed */}
      <div className="flex items-center gap-2 px-5 py-3 border-t border-foreground-5 flex-shrink-0">
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || (selectedTables.length === 0 && isDatabase)}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          刷新画像
        </Button>
        <div className="flex-1" />
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          删除
        </Button>
      </div>
    </div>
  );
}

function SearchableTableDropdown({
  tables,
  value,
  tableProfiles,
  onChange,
}: {
  tables: string[];
  value: string | null;
  tableProfiles?: Record<string, { row_count: number | null }> | null;
  onChange: (table: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const query = search.trim().toLowerCase();
  const filteredTables = query
    ? tables.filter((t) => t.toLowerCase().includes(query))
    : tables;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-foreground-40">当前查看:</span>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-mono bg-foreground-2 border border-foreground-10 rounded-md pl-2.5 pr-7 py-1.5 text-foreground hover:border-foreground-20 focus:border-accent transition-colors cursor-pointer relative"
        >
          {value || "—"}
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground-30" />
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1 z-50 w-[260px] bg-background border border-foreground-10 rounded-md shadow-lg overflow-hidden">
            <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-foreground-5">
              <Search className="w-3 h-3 text-foreground-30 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索表..."
                className="flex-1 text-xs bg-transparent outline-none placeholder:text-foreground-30"
              />
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {filteredTables.length === 0 && (
                <div className="py-4 text-center text-[11px] text-foreground-30">无匹配</div>
              )}
              {filteredTables.map((t) => {
                const rc = tableProfiles?.[t]?.row_count;
                const isCurrent = t === value;
                return (
                  <button
                    key={t}
                    onClick={() => {
                      onChange(t);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left hover:bg-foreground-5 transition-colors ${
                      isCurrent ? "bg-accent/10 text-accent" : "text-foreground"
                    }`}
                  >
                    <span className="font-mono truncate">{t}</span>
                    {rc != null && (
                      <span className="text-[10px] text-foreground-30 flex-shrink-0 ml-2">
                        {rc.toLocaleString()}行
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-inner bg-foreground-2">
      <div className="text-[10px] text-foreground-30 mb-0.5">{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-foreground-30">
      {text}
    </div>
  );
}
