"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import { SessionItem } from "./SessionItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSessionStore } from "@/stores/session-store";
import { useRouter, usePathname } from "next/navigation";
import { groupByDate } from "@/lib/utils";

export function SessionList() {
  const {
    sessions,
    activeSessionId,
    isLoading,
    fetchSessions,
    setActiveSession,
    deleteSession,
    pinSession,
    unpinSession,
    updateSessionTitle,
  } = useSessionStore();

  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Filter by search
  const filtered = searchQuery.trim()
    ? sessions.filter((s) =>
        (s.title || "新会话").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sessions;

  // Split pinned vs unpinned
  const pinned = filtered
    .filter((s) => !!s.pinnedAt)
    .sort(
      (a, b) =>
        new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime()
    );

  const unpinned = filtered.filter((s) => !s.pinnedAt);

  const groups = groupByDate(
    [...unpinned].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  );

  const renderItem = (session: (typeof sessions)[0]) => (
    <SessionItem
      key={session.id}
      session={session}
      isActive={session.id === activeSessionId}
      onClick={() => { setActiveSession(session.id); if (pathname !== "/app") router.push("/app"); }}
      onDelete={deleteSession}
      onPin={pinSession}
      onUnpin={unpinSession}
      onRename={updateSessionTitle}
    />
  );

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="会话" />

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-inner bg-foreground-3">
          <Search className="w-3.5 h-3.5 text-foreground-40" />
          <input
            type="text"
            placeholder="搜索会话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-30 outline-none"
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {isLoading && sessions.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-foreground-40">
              加载中...
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-foreground-40 gap-1">
              <span>暂无会话</span>
              <span className="text-xs">点击左侧&ldquo;新建会话&rdquo;开始</span>
            </div>
          ) : (
            <>
              {/* Pinned section */}
              {pinned.length > 0 && (
                <div className="mb-3">
                  <div className="px-2 py-1 text-[11px] font-medium text-foreground-40 uppercase tracking-wide">
                    已置顶
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {pinned.map(renderItem)}
                  </div>
                </div>
              )}

              {/* Date-grouped unpinned sessions */}
              {groups.map((group) => (
                <div key={group.label} className="mb-3">
                  <div className="px-2 py-1 text-[11px] font-medium text-foreground-40 uppercase tracking-wide">
                    {group.label}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map(renderItem)}
                  </div>
                </div>
              ))}

              {/* No results for search */}
              {filtered.length === 0 && searchQuery && (
                <div className="flex items-center justify-center py-8 text-sm text-foreground-40">
                  无匹配会话
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
