"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, EyeOff, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { ProviderChoice } from "./ProviderSelect";

interface ApiKeyInputProps {
  provider: ProviderChoice;
  onBack: () => void;
  onComplete: (config: {
    provider: "anthropic" | "openai_compatible" | "local";
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
  }) => void;
}

const PROVIDER_CONFIGS: Record<
  string,
  {
    name: string;
    baseUrl: string;
    model: string;
    showBaseUrl: boolean;
    showApiKey: boolean;
    placeholder: string;
    providerType: "anthropic" | "openai_compatible" | "local";
  }
> = {
  anthropic_api_key: {
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-20250514",
    showBaseUrl: false,
    showApiKey: true,
    placeholder: "sk-ant-...",
    providerType: "anthropic",
  },
  openai_compatible: {
    name: "OpenAI 兼容",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    showBaseUrl: true,
    showApiKey: true,
    placeholder: "sk-...",
    providerType: "openai_compatible",
  },
  local: {
    name: "本地模型 (Ollama)",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5:14b",
    showBaseUrl: true,
    showApiKey: false,
    placeholder: "",
    providerType: "local",
  },
};

type TestStatus = "idle" | "testing" | "success" | "error";

export function ApiKeyInput({ provider, onBack, onComplete }: ApiKeyInputProps) {
  const config = PROVIDER_CONFIGS[provider];

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? "");
  const [model, setModel] = useState(config?.model ?? "");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState("");

  if (!config) return null;

  const canTest = config.showApiKey ? !!apiKey && !!model : !!model;
  const canSubmit = canTest && testStatus === "success";

  const handleTest = async () => {
    setTestStatus("testing");
    setTestError("");
    try {
      const res = await fetch("/api/settings/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.providerType,
          apiKey,
          baseUrl,
          model,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus("success");
      } else {
        setTestStatus("error");
        setTestError(data.error || "连接失败");
      }
    } catch (e) {
      setTestStatus("error");
      setTestError(e instanceof Error ? e.message : "网络错误");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onComplete({
      provider: config.providerType,
      name: config.name,
      apiKey,
      baseUrl,
      model,
    });
  };

  // Reset test status when inputs change
  const handleInputChange = (setter: (v: string) => void) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setter(e.target.value);
    if (testStatus !== "idle" && testStatus !== "testing") {
      setTestStatus("idle");
      setTestError("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-foreground-50 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        返回
      </button>

      <h3 className="text-base font-semibold text-foreground">
        配置 {config.name}
      </h3>

      {config.showApiKey && (
        <div className="space-y-1.5">
          <label className="text-sm text-foreground-70">API Key</label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={handleInputChange(setApiKey)}
              placeholder={config.placeholder}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground-40 hover:text-foreground-60"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {config.showBaseUrl && (
        <div className="space-y-1.5">
          <label className="text-sm text-foreground-70">Base URL</label>
          <Input
            value={baseUrl}
            onChange={handleInputChange(setBaseUrl)}
            placeholder="https://api.example.com/v1"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-sm text-foreground-70">模型</label>
        <Input
          value={model}
          onChange={handleInputChange(setModel)}
          placeholder="模型名称"
        />
        {provider === "anthropic_api_key" && (
          <p className="text-[11px] text-foreground-40">
            推荐: claude-sonnet-4-20250514, claude-haiku-4-5-20251001
          </p>
        )}
      </div>

      {/* Test result feedback */}
      {testStatus === "success" && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="w-4 h-4" />
          连接成功
        </div>
      )}
      {testStatus === "error" && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <XCircle className="w-4 h-4" />
          {testError || "连接失败"}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleTest}
          disabled={!canTest || testStatus === "testing"}
          className="flex-1"
        >
          {testStatus === "testing" ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              测试中...
            </>
          ) : (
            "测试连接"
          )}
        </Button>
        <Button type="submit" disabled={!canSubmit} className="flex-1">
          完成配置
        </Button>
      </div>
    </form>
  );
}
