"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PanelHeader } from "@/components/shell/PanelHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/stores/settings-store";
import { OAuthConnect } from "@/components/welcome/OAuthConnect";
import { ArrowLeft, Plus, Trash2, Check, Eye, EyeOff, Loader2, Zap, CheckCircle, XCircle, Shield, Pencil, Save, X } from "lucide-react";
import type { LlmConnection } from "@/types/session";

export default function SettingsPage() {
  const router = useRouter();
  const connections = useSettingsStore((s) => s.connections);
  const updateConnection = useSettingsStore((s) => s.updateConnection);

  // Sync maskedApiKey from backend on mount
  useEffect(() => {
    fetch("/api/settings/llm")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.connections) {
          for (const bc of data.connections) {
            if (bc.maskedApiKey) {
              updateConnection(bc.id, { maskedApiKey: bc.maskedApiKey });
            }
          }
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const activeConnectionId = useSettingsStore((s) => s.activeConnectionId);
  const setActiveConnection = useSettingsStore((s) => s.setActiveConnection);
  const removeConnection = useSettingsStore((s) => s.removeConnection);
  const addConnection = useSettingsStore((s) => s.addConnection);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="设置" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[600px] mx-auto px-6 py-8 space-y-8">
          {/* LLM Connections */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  模型连接
                </h2>
                <p className="text-xs text-foreground-40 mt-0.5">
                  配置 Claude、ChatGPT 或其他兼容 API
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowAdd(!showAdd)}
                className="gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                添加
              </Button>
            </div>

            {showAdd && (
              <AddConnectionForm
                onAdd={(conn, refreshToken) => {
                  addConnection(conn, refreshToken);
                  setShowAdd(false);
                }}
                onCancel={() => setShowAdd(false)}
              />
            )}

            <div className="space-y-2">
              {connections.length === 0 && !showAdd && (
                <div className="text-center py-8">
                  <p className="text-sm text-foreground-40 mb-3">
                    未配置模型连接
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setShowAdd(true)}
                    className="gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加第一个连接
                  </Button>
                </div>
              )}
              {connections.map((conn) => (
                <ConnectionCard
                  key={conn.id}
                  connection={conn}
                  isActive={conn.id === activeConnectionId}
                  onSetActive={() => setActiveConnection(conn.id)}
                  onRemove={() => removeConnection(conn.id)}
                />
              ))}
            </div>
          </section>

          {/* Back button */}
          <button
            onClick={() => router.push("/app")}
            className="flex items-center gap-1.5 text-sm text-foreground-50 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            返回主界面
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectionCard({
  connection,
  isActive,
  onSetActive,
  onRemove,
}: {
  connection: LlmConnection;
  isActive: boolean;
  onSetActive: () => void;
  onRemove: () => void;
}) {
  const updateConnection = useSettingsStore((s) => s.updateConnection);
  const [editing, setEditing] = useState(false);
  const [editApiKey, setEditApiKey] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState(connection.baseUrl || "");
  const [editModel, setEditModel] = useState(connection.model);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const providerLabel: Record<string, string> = {
    anthropic: "Claude",
    openai_compatible: "OpenAI 兼容",
    local: "本地模型",
  };

  const maskedKey = (() => {
    // Prefer backend-provided masked key, fall back to local computation
    if (connection.maskedApiKey) return connection.maskedApiKey;
    const key = connection.apiKey || "";
    if (key.length < 8) return "";
    return key.slice(0, 6) + "•".repeat(Math.min(key.length - 10, 20)) + key.slice(-4);
  })();

  const isOAuth = connection.authType === "oauth_token";
  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt) : null;
  const isExpired = expiresAt ? expiresAt < new Date() : false;
  const isExpiringSoon = expiresAt
    ? expiresAt.getTime() - Date.now() < 10 * 60 * 1000 && !isExpired
    : false;

  const handleStartEdit = () => {
    setEditing(true);
    setEditApiKey("");
    setEditBaseUrl(connection.baseUrl || "");
    setEditModel(connection.model);
    setTestResult(null);
  };

  const handleTest = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const backendProvider = connection.provider === "anthropic" ? "anthropic" : "generic";
      const res = await fetch("/api/settings/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: backendProvider,
          apiKey: editApiKey || connection.apiKey || undefined,
          baseUrl: connection.provider !== "anthropic" ? editBaseUrl : undefined,
          model: editModel,
        }),
      });
      const data = await res.json();
      setTestResult(data.success
        ? { success: true, message: `连接成功: ${data.response}` }
        : { success: false, message: data.error || "连接失败" }
      );
    } catch {
      setTestResult({ success: false, message: "网络错误" });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Partial<LlmConnection> = { model: editModel };
      if (editApiKey) updates.apiKey = editApiKey;
      if (connection.provider !== "anthropic") updates.baseUrl = editBaseUrl;

      // Sync to backend
      await fetch("/api/settings/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: connection.provider,
          apiKey: editApiKey || connection.apiKey,
          baseUrl: connection.provider !== "anthropic" ? editBaseUrl : connection.baseUrl,
          model: editModel,
          name: connection.name,
          isDefault: isActive,
          authType: connection.authType || "api_key",
        }),
      });

      // Update local state
      updateConnection(connection.id, updates);
      setEditing(false);
      setTestResult(null);
    } catch {
      setTestResult({ success: false, message: "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isActive
          ? "border-accent/30 bg-accent/5"
          : "border-foreground-5 bg-foreground-2"
      }`}
    >
      {/* Card header — clickable to edit */}
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={handleStartEdit}
          className="flex-1 min-w-0 text-left group"
          title="点击编辑"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {connection.name}
            </span>
            <span className="text-[10px] text-foreground-30 bg-foreground-5 px-1.5 py-0.5 rounded-full">
              {providerLabel[connection.provider] || connection.provider}
            </span>
            {isOAuth && (
              <span className="text-[10px] text-blue-600 font-medium bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <Shield className="w-2.5 h-2.5" />
                OAuth
              </span>
            )}
            {isActive && (
              <span className="text-[10px] text-accent font-medium bg-accent/10 px-1.5 py-0.5 rounded-full">
                当前使用
              </span>
            )}
            <Pencil className="w-3 h-3 text-foreground-20 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-xs text-foreground-40 mt-0.5 truncate">
            {connection.model}
            {connection.provider !== "anthropic" && connection.baseUrl && ` · ${connection.baseUrl}`}
            {isOAuth && expiresAt && (
              <span className={isExpired ? "text-red-500" : isExpiringSoon ? "text-yellow-500" : ""}>
                {" · "}
                {isExpired ? "Token 已过期" : `有效至 ${expiresAt.toLocaleString()}`}
              </span>
            )}
          </div>
        </button>

        <div className="flex items-center gap-1">
          {!isActive && (
            <button
              onClick={onSetActive}
              className="p-1.5 rounded-lg text-foreground-40 hover:text-accent hover:bg-accent/10 transition-colors"
              title="设为当前使用"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onRemove}
            className="p-1.5 rounded-lg text-foreground-40 hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="px-3 pb-3 pt-1 border-t border-foreground-5 space-y-2.5">
          {/* API Key */}
          <div className="space-y-1">
            <label className="text-xs text-foreground-50">API Key</label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={editApiKey}
                onChange={(e) => { setEditApiKey(e.target.value); setTestResult(null); }}
                placeholder={maskedKey || "输入 API Key"}
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
            {maskedKey && !editApiKey && (
              <p className="text-[11px] text-foreground-30">当前: {maskedKey}</p>
            )}
          </div>

          {/* Base URL (non-anthropic only) */}
          {connection.provider !== "anthropic" && (
            <div className="space-y-1">
              <label className="text-xs text-foreground-50">Base URL</label>
              <Input
                value={editBaseUrl}
                onChange={(e) => { setEditBaseUrl(e.target.value); setTestResult(null); }}
                placeholder="https://api.example.com/v1"
              />
            </div>
          )}

          {/* Model */}
          <div className="space-y-1">
            <label className="text-xs text-foreground-50">模型</label>
            <Input
              value={editModel}
              onChange={(e) => { setEditModel(e.target.value); setTestResult(null); }}
              placeholder="模型名称"
            />
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
              testResult.success
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}>
              {testResult.success
                ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="truncate">{testResult.message}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => { setEditing(false); setTestResult(null); }} className="gap-1">
              <X className="w-3 h-3" />
              取消
            </Button>
            <Button variant="outline" size="sm" disabled={saving} onClick={handleTest} className="gap-1">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              测试
            </Button>
            <Button size="sm" disabled={saving || !editModel} onClick={handleSave} className="flex-1 gap-1">
              <Save className="w-3.5 h-3.5" />
              保存
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const PROVIDER_PRESETS = {
  anthropic: {
    name: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-20250514",
    needsKey: true,
    keyPlaceholder: "sk-ant-api03-...",
    showBaseUrl: false,
    modelHint: "claude-sonnet-4-20250514 / claude-haiku-4-5-20251001",
  },
  openai: {
    name: "ChatGPT (OpenAI)",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    needsKey: true,
    keyPlaceholder: "sk-...",
    showBaseUrl: false,
    modelHint: "gpt-4o / gpt-4o-mini / gpt-4-turbo",
  },
  openai_compatible: {
    name: "OpenAI 兼容 API",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    needsKey: true,
    keyPlaceholder: "sk-...",
    showBaseUrl: true,
    modelHint: "DeepSeek / Qwen / OpenRouter 等",
  },
  local: {
    name: "本地模型 (Ollama)",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5:14b",
    needsKey: false,
    keyPlaceholder: "",
    showBaseUrl: true,
    modelHint: "确保 Ollama 已在本地运行",
  },
} as const;

type ProviderKey = keyof typeof PROVIDER_PRESETS;
type AddMode = "api_key" | "claude_oauth";

function AddConnectionForm({
  onAdd,
  onCancel,
}: {
  onAdd: (conn: Omit<LlmConnection, "id">, refreshToken?: string) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<AddMode>("api_key");
  const [provider, setProvider] = useState<ProviderKey>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState<string>(PROVIDER_PRESETS.anthropic.baseUrl);
  const [model, setModel] = useState<string>(PROVIDER_PRESETS.anthropic.model);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const preset = PROVIDER_PRESETS[provider];
  const canSubmit = preset.needsKey ? !!apiKey && !!model : !!model;

  const handleProviderChange = (p: ProviderKey) => {
    setProvider(p);
    const d = PROVIDER_PRESETS[p];
    setBaseUrl(d.baseUrl);
    setModel(d.model);
    setApiKey("");
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const backendProvider = provider === "anthropic" ? "anthropic" : "generic";
      const res = await fetch("/api/settings/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: backendProvider,
          apiKey: apiKey || undefined,
          baseUrl: provider !== "anthropic" ? baseUrl : undefined,
          model,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: `连接成功: ${data.response}` });
      } else {
        setTestResult({ success: false, message: data.error || "连接失败" });
      }
    } catch {
      setTestResult({ success: false, message: "网络错误" });
    } finally {
      setTesting(false);
    }
  };

  const handleAdd = () => {
    const backendProvider = provider === "anthropic" ? "anthropic"
      : provider === "local" ? "local"
      : "openai_compatible";
    onAdd({
      provider: backendProvider,
      name: preset.name,
      apiKey,
      baseUrl: provider === "anthropic" ? "https://api.anthropic.com" : baseUrl,
      model,
      isDefault: true,
      authType: "api_key",
    });
  };

  const handleOAuthComplete = (config: {
    provider: "anthropic" | "openai_compatible" | "local";
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    authType?: "api_key" | "oauth_token";
    refreshToken?: string;
    tokenExpiresAt?: string;
  }) => {
    onAdd({
      provider: config.provider,
      name: config.name,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      isDefault: true,
      authType: config.authType || "oauth_token",
      tokenExpiresAt: config.tokenExpiresAt,
    }, config.refreshToken);
  };

  return (
    <div className="border border-foreground-10 rounded-xl p-4 mb-4 space-y-3">
      {/* Mode selector: API Key vs OAuth */}
      <div className="flex gap-1.5 flex-wrap mb-2">
        <button
          onClick={() => setMode("api_key")}
          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
            mode === "api_key"
              ? "bg-accent text-accent-foreground"
              : "bg-foreground-5 text-foreground-50 hover:bg-foreground-10"
          }`}
        >
          API Key
        </button>
        <button
          onClick={() => setMode("claude_oauth")}
          className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
            mode === "claude_oauth"
              ? "bg-accent text-accent-foreground"
              : "bg-foreground-5 text-foreground-50 hover:bg-foreground-10"
          }`}
        >
          Claude OAuth
        </button>
      </div>

      {mode === "claude_oauth" && (
        <OAuthConnect
          onBack={onCancel}
          onComplete={handleOAuthComplete}
        />
      )}

      {mode === "api_key" && (
        <>
          {/* Provider selector */}
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(PROVIDER_PRESETS) as ProviderKey[]).map((p) => (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  provider === p
                    ? "bg-accent text-accent-foreground"
                    : "bg-foreground-5 text-foreground-50 hover:bg-foreground-10"
                }`}
              >
                {p === "anthropic" ? "Claude"
                  : p === "openai" ? "ChatGPT"
                  : p === "openai_compatible" ? "兼容 API"
                  : "本地模型"}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-foreground-30">{preset.modelHint}</p>

          {preset.needsKey && (
            <div className="space-y-1">
              <label className="text-xs text-foreground-50">API Key</label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                  placeholder={preset.keyPlaceholder}
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

          {preset.showBaseUrl && (
            <div className="space-y-1">
              <label className="text-xs text-foreground-50">Base URL</label>
              <Input
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); setTestResult(null); }}
                placeholder="https://api.example.com/v1"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-foreground-50">模型</label>
            <Input
              value={model}
              onChange={(e) => { setModel(e.target.value); setTestResult(null); }}
              placeholder="模型名称"
            />
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
              testResult.success
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
            }`}>
              {testResult.success
                ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="truncate">{testResult.message}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={onCancel}>
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canSubmit || testing}
              onClick={handleTest}
              className="gap-1.5"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              测试连接
            </Button>
            <Button
              size="sm"
              disabled={!canSubmit}
              onClick={handleAdd}
              className="flex-1"
            >
              添加
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
