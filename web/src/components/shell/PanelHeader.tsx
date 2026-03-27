"use client";

import { cn } from "@/lib/utils";

interface PanelHeaderProps {
  title: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PanelHeader({ title, actions, className }: PanelHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between h-[42px] px-4 flex-shrink-0 border-b border-foreground-5",
        className
      )}
    >
      <h2 className="text-sm font-medium text-foreground-80 truncate">
        {title}
      </h2>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}
