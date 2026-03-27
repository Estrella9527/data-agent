"use client";

import { cn } from "@/lib/utils";

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: string | number;
  collapsed?: boolean;
  onClick?: () => void;
}

export function SidebarItem({
  icon,
  label,
  active,
  badge,
  collapsed,
  onClick,
}: SidebarItemProps) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        title={label}
        className={cn(
          "flex items-center justify-center w-9 h-9 mx-auto rounded-inner transition-all duration-spring ease-spring",
          active
            ? "bg-foreground-7 text-foreground"
            : "text-foreground-60 hover:bg-foreground-3 hover:text-foreground-80"
        )}
      >
        <span className="opacity-75">{icon}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-inner text-sm transition-all duration-spring ease-spring text-left",
        active
          ? "bg-foreground-7 text-foreground font-medium"
          : "text-foreground-60 hover:bg-foreground-3 hover:text-foreground-80"
      )}
    >
      <span className="flex-shrink-0 opacity-75">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span className="flex-shrink-0 text-[11px] text-foreground-40 bg-foreground-5 px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}
