"use client";

import { Key, Monitor } from "lucide-react";

/**
 * Provider choices — matching Craft Agents onboarding exactly.
 *
 * ChatGPT OAuth is disabled: OpenAI does not offer third-party OAuth registration.
 * The Codex CLI client ID only allows its own redirect URIs.
 * ChatGPT users should use API Key via "其他 Provider" instead.
 */
export type ProviderChoice =
  | "anthropic_oauth"
  | "anthropic_api_key"
  | "openai_compatible"
  | "local";

interface ProviderOption {
  id: ProviderChoice;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const claudeIcon = (
  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
    <path d="M16.31 2H7.69L2 12l5.69 10h8.62L22 12zm-3.08 14.19L8 12l5.23-4.19 1.54 1.22L10.77 12l4 2.97z" />
  </svg>
);

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: "anthropic_oauth",
    name: "Claude Pro / Max",
    description: "使用 Anthropic 账户直接授权（免 API Key）",
    icon: claudeIcon,
  },
  {
    id: "anthropic_api_key",
    name: "Claude (API Key)",
    description: "使用 API Key 调用 Claude Sonnet / Haiku",
    icon: claudeIcon,
  },
  {
    id: "openai_compatible",
    name: "其他 Provider",
    description: "Qwen, DeepSeek, GPT, OpenRouter 等兼容 API",
    icon: <Key className="size-5" />,
  },
  {
    id: "local",
    name: "本地模型",
    description: "Ollama 本地部署运行",
    icon: <Monitor className="size-5" />,
  },
];

interface ProviderSelectProps {
  onSelect: (choice: ProviderChoice) => void;
  onSkip: () => void;
}

export function ProviderSelect({ onSelect, onSkip }: ProviderSelectProps) {
  return (
    <div className="space-y-2 stagger-children">
      {PROVIDER_OPTIONS.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className="flex items-center gap-4 w-full rounded-xl bg-foreground-2 p-4 text-left hover:bg-foreground-5 transition-all duration-spring ease-spring group"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-[10px] bg-foreground-5 text-foreground-60 group-hover:text-accent group-hover:bg-accent/10 transition-colors">
            {p.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground">{p.name}</div>
            <div className="text-xs text-foreground-50 mt-0.5">
              {p.description}
            </div>
          </div>
          <svg
            className="w-4 h-4 text-foreground-30 group-hover:text-foreground-50 flex-shrink-0 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      ))}

      <button
        onClick={onSkip}
        className="w-full text-center text-sm text-foreground-40 hover:text-foreground-60 py-3 transition-colors"
      >
        跳过设置 — 稍后在设置中配置
      </button>
    </div>
  );
}
