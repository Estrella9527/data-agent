"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

/**
 * OpenAI OAuth Connect — redirect-based flow.
 *
 * Unlike Claude (which requires manual code paste), OpenAI uses a standard
 * redirect callback. The user clicks → redirects to OpenAI → callback auto-redirects
 * back with tokens in query params.
 */

type OAuthStatus = "idle" | "redirecting" | "processing" | "error";

interface OpenAIOAuthConnectProps {
  onBack: () => void;
  onComplete: (config: {
    provider: "openai_compatible";
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    authType: "oauth_token";
    refreshToken?: string;
    tokenExpiresAt?: string;
  }) => void;
}

export function OpenAIOAuthConnect({ onBack, onComplete }: OpenAIOAuthConnectProps) {
  const [status, setStatus] = useState<OAuthStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const searchParams = useSearchParams();

  // Check for callback result on mount
  useEffect(() => {
    const oauthSuccess = searchParams.get("openai_oauth_success");
    const oauthError = searchParams.get("oauth_error");
    const tokenDataStr = searchParams.get("token_data");

    if (oauthError) {
      setStatus("error");
      const errorMessages: Record<string, string> = {
        missing_params: "缺少授权参数",
        expired: "授权已过期，请重新开始",
        token_exchange_failed: "令牌交换失败",
        server_error: "服务器错误",
      };
      setErrorMessage(errorMessages[oauthError] || oauthError);
      return;
    }

    if (oauthSuccess && tokenDataStr) {
      setStatus("processing");
      try {
        const tokenData = JSON.parse(decodeURIComponent(tokenDataStr));
        onComplete({
          provider: "openai_compatible",
          name: "ChatGPT (OAuth)",
          apiKey: tokenData.accessToken || "",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o",
          authType: "oauth_token",
          refreshToken: tokenData.refreshToken,
          tokenExpiresAt: tokenData.expiresIn
            ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString()
            : undefined,
        });
      } catch {
        setStatus("error");
        setErrorMessage("解析令牌数据失败");
      }
    }
  }, [searchParams, onComplete]);

  const handleStartOAuth = async () => {
    setStatus("redirecting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/openai/start", { method: "POST" });
      const data = await res.json();

      if (data.authUrl) {
        // Redirect in same tab — callback will redirect back
        window.location.href = data.authUrl;
      } else {
        setErrorMessage("无法启动 OAuth 流程");
        setStatus("error");
      }
    } catch {
      setErrorMessage("连接服务失败");
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
        使用 ChatGPT 账户登录
      </h3>
      <p className="text-sm text-foreground-50">
        通过 OpenAI OAuth 授权连接你的 ChatGPT Plus 订阅。
      </p>

      {status === "idle" && (
        <Button onClick={handleStartOAuth} className="w-full gap-2">
          <ExternalLink className="w-4 h-4" />
          Sign in with ChatGPT
        </Button>
      )}

      {(status === "redirecting" || status === "processing") && (
        <div className="flex items-center justify-center py-6 gap-2 text-sm text-foreground-50">
          <Loader2 className="w-4 h-4 animate-spin" />
          {status === "redirecting" ? "正在跳转到 OpenAI..." : "处理中..."}
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
