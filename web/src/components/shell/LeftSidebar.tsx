"use client";

import {
  Plus,
  MessageSquare,
  Database,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Image from "next/image";
import { SidebarItem } from "./SidebarItem";
import { useSessionStore } from "@/stores/session-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function LeftSidebar() {
  const createSession = useSessionStore((s) => s.createSession);
  const router = useRouter();
  const pathname = usePathname();
  const collapsed = useLayoutStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);

  const handleNewSession = async () => {
    try {
      await createSession();
      router.push("/app");
    } catch {
      // handled by store
    }
  };

  return (
    <div className="flex flex-col h-full px-2 py-3">
      {/* Logo / Brand */}
      <div className={cn("flex items-center gap-2.5 px-2 mb-4", collapsed && "justify-center px-0")}>
        <div className="flex items-center justify-center w-8 h-8 flex-shrink-0">
          <Image src="/logo.png" alt="重明" width={28} height={28} className="select-none" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground leading-tight">
              重明
            </span>
            <span className="text-[11px] text-foreground-50 leading-tight">
              Data Agent
            </span>
          </div>
        )}
      </div>

      {/* New Session Button */}
      {collapsed ? (
        <button
          onClick={handleNewSession}
          title="新建会话"
          className="flex items-center justify-center mx-auto mb-3 w-9 h-9 rounded-inner bg-accent text-accent-foreground hover:bg-accent-hover transition-all duration-spring ease-spring"
        >
          <Plus className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={handleNewSession}
          className="flex items-center gap-2 mx-1 mb-3 px-3 py-2 rounded-inner bg-accent text-accent-foreground text-sm font-medium hover:bg-accent-hover transition-all duration-spring ease-spring"
        >
          <Plus className="w-4 h-4" />
          新建会话
        </button>
      )}

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 flex-1">
        <SidebarItem
          icon={<MessageSquare className="w-4 h-4" />}
          label="所有会话"
          active={pathname === "/app"}
          onClick={() => router.push("/app")}
          collapsed={collapsed}
        />
        <SidebarItem
          icon={<Database className="w-4 h-4" />}
          label="数据中心"
          active={pathname === "/app/data-center"}
          onClick={() => router.push("/app/data-center")}
          collapsed={collapsed}
        />
      </nav>

      {/* Footer */}
      <div className="mt-auto pt-2 border-t border-foreground-5 flex flex-col gap-0.5">
        <SidebarItem
          icon={<Settings className="w-4 h-4" />}
          label="设置"
          active={pathname === "/app/settings"}
          onClick={() => router.push("/app/settings")}
          collapsed={collapsed}
        />
        {/* Collapse toggle */}
        <SidebarItem
          icon={
            collapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )
          }
          label={collapsed ? "展开" : "收起"}
          onClick={toggleSidebar}
          collapsed={collapsed}
        />
      </div>
    </div>
  );
}
