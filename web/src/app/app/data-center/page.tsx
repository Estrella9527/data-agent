"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText, Database, Globe, Loader2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceCard } from "@/components/data-center/SourceCard";
import { AddSourceDialog } from "@/components/data-center/AddSourceDialog";
import { SourceDetailDrawer } from "@/components/data-center/SourceDetailDrawer";
import { useSourceStore } from "@/stores/source-store";
import { useSessionStore } from "@/stores/session-store";
import { useChatStore } from "@/stores/chat-store";

const FILTERS: { value: string; label: string; icon: React.ReactNode }[] = [
  { value: "all", label: "全部", icon: null },
  { value: "file", label: "文件", icon: <FileText className="w-3.5 h-3.5" /> },
  { value: "database", label: "数据库", icon: <Database className="w-3.5 h-3.5" /> },
  { value: "api", label: "API", icon: <Globe className="w-3.5 h-3.5" /> },
];

export default function DataCenterPage() {
  const router = useRouter();
  const { sources, isLoading, fetchSources } = useSourceStore();
  const createSession = useSessionStore((s) => s.createSession);
  const setSessionDataSourceIds = useChatStore(
    (s) => s.setSessionDataSourceIds
  );
  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  const handleAnalyze = async (sourceId: string) => {
    const source = sources.find((s) => s.id === sourceId);
    const title = source ? `分析 ${source.name}` : undefined;
    await createSession(title, [sourceId]);
    setSessionDataSourceIds([sourceId]);
    router.push("/app");
  };

  useEffect(() => {
    fetchSources();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filter === "all"
    ? sources
    : sources.filter((s) => s.source_type === filter);

  const selected = selectedSource
    ? sources.find((s) => s.id === selectedSource) ?? null
    : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">数据中心</h1>
            <p className="text-sm text-foreground-50 mt-0.5">
              管理所有数据源，支持文件、数据库和 API
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            添加数据源
          </Button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-1.5 mb-5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors ${
                filter === f.value
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-foreground-10 text-foreground-50 hover:bg-foreground-3"
              }`}
            >
              {f.icon}
              {f.label}
              {f.value === "all" ? ` (${sources.length})` : ` (${sources.filter((s) => s.source_type === f.value).length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-foreground-30" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onAdd={() => setDialogOpen(true)} hasAny={sources.length > 0} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                onSelect={() => setSelectedSource(source.id)}
                onDelete={() => {
                  useSourceStore.getState().deleteSource(source.id);
                }}
                onAnalyze={() => handleAnalyze(source.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add dialog */}
      <AddSourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => fetchSources()}
      />

      {/* Detail drawer */}
      {selected && (
        <SourceDetailDrawer
          source={selected}
          onClose={() => setSelectedSource(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ onAdd, hasAny }: { onAdd: () => void; hasAny: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-foreground-3 mb-4">
        <FolderOpen className="w-7 h-7 text-foreground-30" />
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">
        {hasAny ? "没有匹配的数据源" : "还没有数据源"}
      </h3>
      <p className="text-xs text-foreground-30 mb-4 max-w-xs">
        {hasAny
          ? "尝试切换筛选条件"
          : "添加你的第一个数据源 — 上传文件、连接数据库或配置 API"}
      </p>
      {!hasAny && (
        <Button size="sm" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          添加数据源
        </Button>
      )}
    </div>
  );
}
