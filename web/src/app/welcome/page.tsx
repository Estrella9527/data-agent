"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ProviderSelect,
  type ProviderChoice,
} from "@/components/welcome/ProviderSelect";
import { ApiKeyInput } from "@/components/welcome/ApiKeyInput";
import { OAuthConnect } from "@/components/welcome/OAuthConnect";
import { SetupComplete } from "@/components/welcome/SetupComplete";
import { useSettingsStore } from "@/stores/settings-store";

type Step = "select" | "credentials" | "oauth" | "complete";

export default function WelcomePage() {
  const router = useRouter();
  const addConnection = useSettingsStore((s) => s.addConnection);
  const setConfigured = useSettingsStore((s) => s.setConfigured);

  const [step, setStep] = useState<Step>("select");
  const [selectedChoice, setSelectedChoice] = useState<ProviderChoice | null>(null);
  const [completedConfig, setCompletedConfig] = useState<{
    name: string;
    model: string;
  } | null>(null);

  const handleSelect = (choice: ProviderChoice) => {
    setSelectedChoice(choice);
    if (choice === "anthropic_oauth") {
      setStep("oauth");
    } else {
      setStep("credentials");
    }
  };

  const handleSkip = () => {
    setConfigured(true);
    router.push("/app");
  };

  const handleComplete = (config: {
    provider: "anthropic" | "openai_compatible" | "local";
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    authType?: "api_key" | "oauth_token";
    refreshToken?: string;
    tokenExpiresAt?: string;
  }) => {
    addConnection({
      provider: config.provider,
      name: config.name,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      isDefault: true,
      authType: config.authType || "api_key",
      tokenExpiresAt: config.tokenExpiresAt,
    }, config.refreshToken);
    setCompletedConfig({ name: config.name, model: config.model });
    setStep("complete");
  };

  const handleContinue = () => {
    router.push("/app");
  };

  const stepLabel = {
    select: "选择你的 AI 模型提供商",
    credentials: "配置连接信息",
    oauth: "使用 Claude 账户登录",
    complete: "一切就绪",
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-[28rem] px-6">
        {/* Logo — Craft style: centered icon + title */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center size-16 rounded-2xl bg-accent/10 mb-4">
            <Image src="/logo.png" alt="重明" width={40} height={40} className="select-none" priority />
          </div>
          <h1 className="text-xl font-semibold text-foreground">重明 Data Agent</h1>
          <p className="text-sm text-foreground-50 mt-1">
            {stepLabel[step]}
          </p>
        </div>

        {/* Steps */}
        {step === "select" && (
          <ProviderSelect onSelect={handleSelect} onSkip={handleSkip} />
        )}

        {step === "credentials" && selectedChoice && (
          <ApiKeyInput
            provider={selectedChoice}
            onBack={() => setStep("select")}
            onComplete={handleComplete}
          />
        )}

        {step === "oauth" && (
          <OAuthConnect
            onBack={() => setStep("select")}
            onComplete={handleComplete}
          />
        )}

        {step === "complete" && completedConfig && (
          <SetupComplete
            providerName={completedConfig.name}
            model={completedConfig.model}
            onContinue={handleContinue}
          />
        )}
      </div>
    </div>
  );
}
