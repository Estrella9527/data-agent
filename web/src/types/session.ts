export type PipelineState =
  | "IDLE"
  | "PROFILING"
  | "PLANNING"
  | "CLARIFYING"
  | "WAITING_CONFIRM"
  | "EXECUTING"
  | "REPORTING"
  | "COMPLETED";

export interface Session {
  id: string;
  title: string | null;
  state: PipelineState;
  mode: string | null;
  pinnedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
  dataSourceIds?: string[];
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface LlmConnection {
  id: string;
  provider: "anthropic" | "openai_compatible" | "local";
  name: string;
  apiKey?: string;
  maskedApiKey?: string;
  baseUrl?: string;
  model: string;
  authType?: "api_key" | "oauth_token";
  tokenExpiresAt?: string;
  isDefault: boolean;
}
