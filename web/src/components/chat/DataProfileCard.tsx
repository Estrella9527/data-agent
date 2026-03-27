"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Database,
} from "lucide-react";
import type { ProfileTable, ProfileColumn } from "@/types/events";

interface DataProfileCardProps {
  tables: ProfileTable[];
}

export function DataProfileCard({ tables }: DataProfileCardProps) {
  if (!tables.length) return null;

  return (
    <div className="space-y-2">
      {tables.map((table) => (
        <TableProfile key={table.sourceId || table.name} table={table} />
      ))}
    </div>
  );
}

/** Health dot: green (0 issues), yellow (info only), red (has warnings). */
function HealthDot({ issues }: { issues: ProfileTable["qualityIssues"] }) {
  const warnings = issues.filter((i) => i.severity === "warning").length;
  if (warnings > 0)
    return <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />;
  if (issues.length > 0)
    return <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />;
}

const DEFAULT_VISIBLE = 10;

function TableProfile({ table }: { table: ProfileTable }) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const issues = table.qualityIssues || [];
  const allColumns = table.columns || [];
  const hasMore = allColumns.length > DEFAULT_VISIBLE;
  const columns = showAll ? allColumns : allColumns.slice(0, DEFAULT_VISIBLE);

  return (
    <div className="border border-foreground-10 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-foreground-3 transition-colors"
      >
        <Database className="w-4 h-4 text-foreground-40 shrink-0" />
        <span className="text-sm font-medium text-foreground-70 truncate">
          {table.name}
        </span>
        <span className="text-xs text-foreground-40 shrink-0">
          {table.rowCount.toLocaleString()} 行 × {table.columnCount} 列
        </span>
        <HealthDot issues={issues} />
        <span className="ml-auto shrink-0">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-foreground-30" />
          ) : (
            <ChevronRight className="w-4 h-4 text-foreground-30" />
          )}
        </span>
      </button>

      {/* Expanded: column table */}
      {expanded && (
        <div className="border-t border-foreground-10">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-foreground-5 bg-foreground-3">
                  <th className="text-left px-3 py-1.5 font-medium text-foreground-50">
                    字段
                  </th>
                  <th className="text-left px-3 py-1.5 font-medium text-foreground-50">
                    类型
                  </th>
                  <th className="text-right px-3 py-1.5 font-medium text-foreground-50">
                    唯一率
                  </th>
                  <th className="text-right px-3 py-1.5 font-medium text-foreground-50">
                    缺失率
                  </th>
                  <th className="text-left px-3 py-1.5 font-medium text-foreground-50">
                    统计
                  </th>
                  <th className="text-left px-3 py-1.5 font-medium text-foreground-50">
                    样本值
                  </th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col) => (
                  <tr
                    key={col.name}
                    className="border-b border-foreground-5 last:border-0"
                  >
                    <td className="px-3 py-1.5 font-mono text-foreground-70">
                      {col.name}
                    </td>
                    <td className="px-3 py-1.5 text-foreground-50">
                      {col.dtype}
                    </td>
                    <td className="px-3 py-1.5 text-right text-foreground-50">
                      <UniqueRate col={col} rowCount={table.rowCount} />
                    </td>
                    <td className="px-3 py-1.5 text-right text-foreground-50">
                      {col.missing_rate != null
                        ? `${(col.missing_rate * 100).toFixed(0)}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-foreground-50 whitespace-nowrap">
                      <StatsSummary col={col} />
                    </td>
                    <td className="px-3 py-1.5 text-foreground-40 truncate max-w-[200px]">
                      {col.sample_values?.slice(0, 3).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Expand / collapse remaining columns */}
          {hasMore && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-center text-xs text-blue-600 hover:text-blue-700 py-1.5 border-t border-foreground-5 hover:bg-foreground-3 transition-colors"
            >
              {showAll
                ? "收起"
                : `展开剩余 ${allColumns.length - DEFAULT_VISIBLE} 列`}
            </button>
          )}

          {/* Quality issues */}
          {issues.length > 0 && (
            <div className="border-t border-foreground-10 px-3 py-2 space-y-1">
              {issues.map((issue, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 text-xs ${
                    issue.severity === "warning"
                      ? "text-amber-600"
                      : "text-foreground-40"
                  }`}
                >
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>{issue.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Display unique_count / rowCount as a percentage. */
function UniqueRate({
  col,
  rowCount,
}: {
  col: ProfileColumn;
  rowCount: number;
}) {
  if (col.unique_count == null || !rowCount) return <span>—</span>;
  const rate = col.unique_count / rowCount;
  return <span>{(rate * 100).toFixed(0)}%</span>;
}

/** Display stats based on column dtype. */
function StatsSummary({ col }: { col: ProfileColumn }) {
  const isNumeric =
    col.dtype &&
    /^(int|float|double|decimal|numeric|number|bigint|smallint|real)/i.test(
      col.dtype
    );
  const isDate =
    col.dtype &&
    /^(date|time|datetime|timestamp)/i.test(col.dtype);

  if (isNumeric && col.min_value != null && col.max_value != null) {
    const min = formatNum(col.min_value);
    const max = formatNum(col.max_value);
    const mean =
      col.mean_value != null ? ` (avg: ${formatNum(col.mean_value)})` : "";
    return (
      <span>
        {min} ~ {max}
        {mean}
      </span>
    );
  }

  if (isDate && col.min_value != null && col.max_value != null) {
    return (
      <span>
        {String(col.min_value)} ~ {String(col.max_value)}
      </span>
    );
  }

  return <span>—</span>;
}

function formatNum(v: unknown): string {
  if (typeof v === "number") {
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(v);
}
