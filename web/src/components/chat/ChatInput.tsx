"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Square, Database, X, Plus } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useSourceStore } from "@/stores/source-store";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (content: string) => void;
  isStreaming: boolean;
}

export function ChatInput({ onSend, isStreaming }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const activeConnection = useSettingsStore((s) => s.getActiveConnection());

  const sessionDataSourceIds = useChatStore((s) => s.sessionDataSourceIds);
  const setSessionDataSourceIds = useChatStore(
    (s) => s.setSessionDataSourceIds
  );
  const sources = useSourceStore((s) => s.sources);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  // Close picker on outside click
  useEffect(() => {
    if (!showSourcePicker) return;
    const handler = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node)
      ) {
        setShowSourcePicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSourcePicker]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, isStreaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const toggleSource = async (sourceId: string) => {
    const isAdding = !sessionDataSourceIds.includes(sourceId);
    const newIds = isAdding
      ? [...sessionDataSourceIds, sourceId]
      : sessionDataSourceIds.filter((id) => id !== sourceId);

    setSessionDataSourceIds(newIds);

    // Persist to backend
    if (activeSessionId) {
      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isAdding
            ? { addDataSourceIds: [sourceId] }
            : { removeDataSourceIds: [sourceId] }
        ),
      }).catch(() => {});
    }
  };

  const boundSources = sources.filter((s) =>
    sessionDataSourceIds.includes(s.id)
  );

  return (
    <div className="flex-shrink-0 border-t border-foreground-5 px-5 py-3">
      <div className="max-w-[840px] mx-auto">
        {/* Active badges row */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {activeConnection && (
            <div className="flex items-center gap-1 text-[11px] text-foreground-50 bg-foreground-3 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {activeConnection.model}
            </div>
          )}
          {/* Data source badges */}
          {boundSources.map((src) => (
            <div
              key={src.id}
              className="flex items-center gap-1 text-[11px] text-accent bg-accent/8 px-2 py-0.5 rounded-full"
            >
              <Database className="w-3 h-3" />
              {src.name}
              <button
                onClick={() => toggleSource(src.id)}
                className="ml-0.5 hover:text-accent-hover"
                title="移除数据源"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {/* Add data source button */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setShowSourcePicker(!showSourcePicker)}
              className="flex items-center gap-1 text-[11px] text-foreground-40 hover:text-foreground-60 bg-foreground-3 hover:bg-foreground-5 px-2 py-0.5 rounded-full transition-colors"
              title="添加数据源"
            >
              <Plus className="w-3 h-3" />
              数据源
            </button>
            {/* Source picker dropdown */}
            {showSourcePicker && (
              <div className="absolute bottom-full left-0 mb-1 w-64 bg-white rounded-lg border border-foreground-10 shadow-lg z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-foreground-5">
                  <p className="text-xs font-medium text-foreground-60">
                    选择数据源
                  </p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {sources.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-foreground-30 text-center">
                      暂无数据源，请先在数据中心添加
                    </div>
                  ) : (
                    sources.map((src) => {
                      const isBound = sessionDataSourceIds.includes(src.id);
                      return (
                        <button
                          key={src.id}
                          onClick={() => {
                            toggleSource(src.id);
                            if (!isBound) setShowSourcePicker(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-foreground-3 transition-colors",
                            isBound && "bg-accent/5"
                          )}
                        >
                          <Database
                            className={cn(
                              "w-3.5 h-3.5 shrink-0",
                              isBound
                                ? "text-accent"
                                : "text-foreground-30"
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground-70 truncate">
                              {src.name}
                            </p>
                            <p className="text-[10px] text-foreground-30">
                              {src.row_count ?? "?"} 行 ·{" "}
                              {src.column_count ?? "?"} 列
                            </p>
                          </div>
                          {isBound && (
                            <span className="text-[10px] text-accent">
                              已选
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="flex items-end gap-2 bg-foreground-2 rounded-xl border border-foreground-5 px-3 py-2 focus-within:border-foreground-15 transition-colors">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              boundSources.length > 0
                ? `分析 ${boundSources.map((s) => s.name).join("、")} 的数据...`
                : "发送消息给重明..."
            }
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-30 outline-none resize-none min-h-[24px] max-h-[200px] py-0.5 leading-relaxed"
          />

          {/* Toolbar */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {isStreaming ? (
              <button
                onClick={stopStreaming}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive-hover transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!value.trim()}
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
                  value.trim()
                    ? "bg-accent text-accent-foreground hover:bg-accent-hover"
                    : "bg-foreground-5 text-foreground-30"
                )}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] text-foreground-30 mt-1.5 text-center">
          重明可能会犯错，请核实重要信息
        </p>
      </div>
    </div>
  );
}
