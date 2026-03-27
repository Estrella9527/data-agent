"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

interface SetupCompleteProps {
  providerName: string;
  model: string;
  onContinue: () => void;
}

export function SetupComplete({
  providerName,
  model,
  onContinue,
}: SetupCompleteProps) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-success-subtle">
        <CheckCircle className="w-7 h-7 text-success" />
      </div>

      <div>
        <h3 className="text-base font-semibold text-foreground">配置完成</h3>
        <p className="text-sm text-foreground-50 mt-1">
          已连接 {providerName} — {model}
        </p>
      </div>

      <Button onClick={onContinue} className="w-full">
        开始使用重明
      </Button>
    </div>
  );
}
