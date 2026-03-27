/**
 * In-memory OAuth state store (module-level singleton).
 * Shared between /api/auth/claude/start and /api/auth/claude/exchange.
 *
 * For production with multiple processes, replace with Redis or DB.
 */

export const CLAUDE_OAUTH = {
  CLIENT_ID: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  REDIRECT_URI: "https://console.anthropic.com/oauth/code/callback",
  AUTH_URL: "https://claude.ai/oauth/authorize",
  TOKEN_URL: "https://platform.claude.com/v1/oauth/token",
  SCOPES: "org:create_api_key user:profile user:inference",
  STATE_TTL_MS: 10 * 60 * 1000,
} as const;

export interface OAuthFlowState {
  verifier: string;
  createdAt: number;
}

// Use globalThis to survive Next.js dev mode module re-evaluation
const globalStore = globalThis as unknown as {
  __oauthStateStore?: Map<string, OAuthFlowState>;
};
const store = (globalStore.__oauthStateStore ??= new Map<string, OAuthFlowState>());

export function setOAuthState(state: string, flow: OAuthFlowState) {
  // Cleanup expired entries
  const now = Date.now();
  store.forEach((val, key) => {
    if (now - val.createdAt > CLAUDE_OAUTH.STATE_TTL_MS) {
      store.delete(key);
    }
  });
  store.set(state, flow);
}

export function getOAuthState(state: string): OAuthFlowState | undefined {
  const flow = store.get(state);
  if (!flow) return undefined;
  if (Date.now() - flow.createdAt > CLAUDE_OAUTH.STATE_TTL_MS) {
    store.delete(state);
    return undefined;
  }
  return flow;
}

export function deleteOAuthState(state: string) {
  store.delete(state);
}

export const OPENAI_OAUTH = {
  CLIENT_ID: "app_EMoamEEZ73f0CkXaXp7hrann",  // Codex CLI public client
  AUTH_URL: "https://auth.openai.com/authorize",
  TOKEN_URL: "https://auth.openai.com/oauth/token",
  REDIRECT_URI: "http://localhost:3001/api/auth/openai/callback",
  SCOPES: "openid profile email offline_access",
  STATE_TTL_MS: 10 * 60 * 1000,
} as const;
