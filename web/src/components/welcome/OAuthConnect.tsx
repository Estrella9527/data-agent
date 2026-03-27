"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

/**
 * Claude OAuth Connect — Craft-style two-step OAuth flow.
 *
 * Step 1: User clicks "Sign in with Claude" → opens Anthropic OAuth in new tab
 * Step 2: User pastes the authorization code back
 *
 * For a web app, we use a server-side OAuth flow with redirect.
 */

type OAuthStatus = "idle" | "waiting" | "validating" | "success" | "error";

interface OAuthConnectProps {
  onBack: () => void;
  onComplete: (config: {
    provider: "anthropic";
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    authType: "oauth_token";
    refreshToken?: string;
    tokenExpiresAt?: string;
  }) => void;
}

export function OAuthConnect({ onBack, onComplete }: OAuthConnectProps) {
  const [status, setStatus] = useState<OAuthStatus>("idle");
  const [authCode, setAuthCode] = useState("");
  const [oauthState, setOauthState] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleStartOAuth = async () => {
    setStatus("waiting");
    setErrorMessage("");

    try {
      // Request OAuth URL from backend
      const res = await fetch("/api/auth/claude/start", { method: "POST" });
      const data = await res.json();

      if (data.authUrl && data.state) {
        setOauthState(data.state);
        window.open(data.authUrl, "_blank");
      } else {
        setErrorMessage("无法启动 OAuth 流程");
        setStatus("error");
      }
    } catch {
      setErrorMessage("连接服务失败");
      setStatus("error");
    }
  };

  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authCode.trim()) return;

    setStatus("validating");
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/claude/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authCode.trim(), state: oauthState }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus("success");
        onComplete({
          provider: "anthropic",
          name: "Claude (OAuth)",
          apiKey: data.accessToken || "",
          baseUrl: "https://api.anthropic.com",
          model: "claude-sonnet-4-20250514",
          authType: "oauth_token",
          refreshToken: data.refreshToken,
          tokenExpiresAt: data.expiresIn
            ? new Date(Date.now() + data.expiresIn * 1000).toISOString()
            : undefined,
        });
      } else {
        setErrorMessage(data.error || "验证失败");
        setStatus("error");
      }
    } catch {
      setErrorMessage("验证请求失败");
      setStatus("error");
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-foreground-50 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        返回
      </button>

      <h3 className="text-base font-semibold text-foreground">
        使用 Claude 账户登录
      </h3>
      <p className="text-sm text-foreground-50">
        通过 Anthropic OAuth 授权连接你的 Claude Pro 或 Max 订阅。
      </p>

      {status === "idle" && (
        <Button onClick={handleStartOAuth} className="w-full gap-2">
          <ExternalLink className="w-4 h-4" />
          Sign in with Claude
        </Button>
      )}

      {status === "waiting" && (
        <form onSubmit={handleSubmitCode} className="space-y-3">
          <div className="bg-foreground-2 rounded-[10px] p-3 text-sm text-foreground-70">
            <p className="mb-2">
              已在新标签页中打开 Anthropic 授权页面。请完成授权后，将授权码粘贴到下方：
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-foreground-70">授权码</label>
            <Input
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="粘贴授权码..."
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleStartOAuth}
              className="flex-1"
            >
              重新授权
            </Button>
            <Button type="submit" disabled={!authCode.trim()} className="flex-1">
              验证
            </Button>
          </div>
        </form>
      )}

      {status === "validating" && (
        <div className="flex items-center justify-center py-6 gap-2 text-sm text-foreground-50">
          <Loader2 className="w-4 h-4 animate-spin" />
          验证中...
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <div className="bg-destructive/10 text-destructive-text rounded-[10px] p-3 text-sm">
            {errorMessage}
          </div>
          <Button
            onClick={() => setStatus("idle")}
            variant="secondary"
            className="w-full"
          >
            重试
          </Button>
        </div>
      )}
    </div>
  );
}
