"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-foreground-40">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50">
        <AlertTriangle className="w-7 h-7 text-amber-500" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-foreground-60">出现了意外错误</p>
        <p className="text-xs text-foreground-30 max-w-sm">{error.message}</p>
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        重试
      </button>
    </div>
  );
}
