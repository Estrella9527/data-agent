"use client";

import { useEffect, useCallback } from "react";
import { LeftSidebar } from "./LeftSidebar";
import { SessionList } from "./SessionList";
import { ResizeHandle } from "./ResizeHandle";
import { useSettingsStore } from "@/stores/settings-store";
import { useSessionStore } from "@/stores/session-store";
import { useLayoutStore } from "@/stores/layout-store";

interface AppShellProps {
  children: React.ReactNode;
}

const SIDEBAR_EXPANDED = 220;
const SIDEBAR_COLLAPSED = 52;

export function AppShell({ children }: AppShellProps) {
  const getActiveConnection = useSettingsStore((s) => s.getActiveConnection);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const refreshOAuthToken = useSettingsStore((s) => s.refreshOAuthToken);

  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const sessionListWidth = useLayoutStore((s) => s.sessionListWidth);
  const setSessionListWidth = useLayoutStore((s) => s.setSessionListWidth);

  // On mount: sync active LLM connection to backend + load sessions
  useEffect(() => {
    fetchSessions();

    const conn = getActiveConnection();
    if (conn) {
      if (
        conn.authType === "oauth_token" &&
        conn.tokenExpiresAt
      ) {
        const expiresAt = new Date(conn.tokenExpiresAt).getTime();
        const now = Date.now();
        if (expiresAt - now < 10 * 60 * 1000) {
          refreshOAuthToken(conn.id).catch(() => {});
          return;
        }
      }

      fetch("/api/settings/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: conn.provider,
          apiKey: conn.apiKey,
          baseUrl: conn.baseUrl,
          model: conn.model,
          authType: conn.authType || "api_key",
        }),
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSessionResize = useCallback(
    (delta: number) => {
      setSessionListWidth(sessionListWidth + delta);
    },
    [sessionListWidth, setSessionListWidth]
  );

  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background p-panel-padding">
      {/* Left Sidebar — Navigation */}
      <div
        className="panel-surface flex-shrink-0 flex flex-col overflow-hidden transition-[width] duration-300 ease-spring"
        style={{ width: sidebarWidth }}
      >
        <LeftSidebar />
      </div>

      <div className="w-[6px] flex-shrink-0" />

      {/* Middle — Session List */}
      <div
        className="panel-surface flex-shrink-0 flex flex-col overflow-hidden"
        style={{ width: sessionListWidth }}
      >
        <SessionList />
      </div>

      {/* Resize Handle */}
      <ResizeHandle onResize={handleSessionResize} />

      {/* Right — Main Content */}
      <div className="panel-surface flex-1 flex flex-col overflow-hidden min-w-0">
        {children}
      </div>
    </div>
  );
}
