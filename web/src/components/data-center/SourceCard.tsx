"use client";

import { FileText, Database, Globe, Trash2, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DataSource } from "@/types/source";
import { formatRelativeTime } from "@/lib/utils";

const TYPE_CONFIG = {
  file: { icon: FileText, label: "文件", color: "text-blue-500" },
  database: { icon: Database, label: "数据库", color: "text-emerald-500" },
  api: { icon: Globe, label: "API", color: "text-amber-500" },
} as const;

const STATUS_VARIANT = {
  active: "success" as const,
  error: "destructive" as const,
  testing: "secondary" as const,
};

const STATUS_LABEL = {
  active: "在线",
  error: "异常",
  testing: "测试中",
};

interface SourceCardProps {
  source: DataSource;
  onSelect: () => void;
  onDelete: () => void;
  onAnalyze: () => void;
}

export function SourceCard({ source, onSelect, onDelete, onAnalyze }: SourceCardProps) {
  const typeConfig = TYPE_CONFIG[source.source_type];
  const Icon = typeConfig.icon;

  const summary = getSummary(source);

  return (
    <div
      className="group rounded-[var(--radius-inner)] bg-background shadow-[var(--shadow-minimal)] p-4 hover:shadow-[var(--shadow-modal-small)] transition-shadow duration-200 cursor-pointer"
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`flex items-center justify-center w-10 h-10 rounded-inner bg-foreground-3 ${typeConfig.color} flex-shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {source.name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-foreground-50">{typeConfig.label}</span>
            <Badge variant={STATUS_VARIANT[source.status]} className="text-[10px] px-1.5 py-0">
              {STATUS_LABEL[source.status]}
            </Badge>
          </div>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-foreground-50 mb-3 line-clamp-1">{summary}</p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-foreground-30">
          {source.created_at ? formatRelativeTime(source.created_at) : ""}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => { e.stopPropagation(); onAnalyze(); }}
            title="发起分析"
          >
            <BarChart3 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="删除"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function getSummary(source: DataSource): string {
  if (source.source_type === "file") {
    const parts: string[] = [];
    if (source.row_count != null) parts.push(`${source.row_count} 行`);
    if (source.column_count != null) parts.push(`${source.column_count} 列`);
    if (source.file_name) parts.push(source.file_name);
    return parts.join(" / ") || "文件数据源";
  }
  if (source.source_type === "database") {
    const cfg = source.connection_config;
    const parts: string[] = [];
    if (cfg) parts.push(`${cfg.db_type} @ ${cfg.host}`);
    const selTables = source.selected_tables || (source.selected_table ? [source.selected_table] : []);
    if (selTables.length > 0) {
      parts.push(`已选 ${selTables.length} 张表`);
    } else if (source.available_tables) {
      parts.push(`${source.available_tables.length} 个表`);
    }
    return parts.join(" / ") || "数据库数据源";
  }
  if (source.source_type === "api") {
    const cfg = source.api_config;
    if (cfg) return `${cfg.method} ${cfg.base_url}${cfg.endpoint ? "/" + cfg.endpoint : ""}`;
    return "API 数据源";
  }
  return "";
}
