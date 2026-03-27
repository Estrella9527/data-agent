import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LlmConnection } from "@/types/session";

interface SettingsState {
  connections: LlmConnection[];
  activeConnectionId: string | null;
  isConfigured: boolean;

  addConnection: (conn: Omit<LlmConnection, "id">, refreshToken?: string) => Promise<void>;
  updateConnection: (id: string, updates: Partial<LlmConnection>) => void;
  removeConnection: (id: string) => void;
  setActiveConnection: (id: string) => void;
  getActiveConnection: () => LlmConnection | null;
  setConfigured: (v: boolean) => void;
  refreshOAuthToken: (connectionId: string) => Promise<boolean>;
}

function genId() {
  return Math.random().toString(36).substring(2, 10);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      connections: [],
      activeConnectionId: null,
      isConfigured: false,

      addConnection: async (conn, refreshToken) => {
        const id = genId();
        const newConn: LlmConnection = { ...conn, id };

        // Sync to backend first — wait for confirmation before updating state
        try {
          const res = await fetch("/api/settings/llm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: conn.provider,
              apiKey: conn.apiKey,
              baseUrl: conn.baseUrl,
              model: conn.model,
              name: conn.name,
              isDefault: conn.isDefault,
              authType: conn.authType || "api_key",
              refreshToken: refreshToken,
              tokenExpiresAt: conn.tokenExpiresAt,
            }),
          });
          const data = await res.json();
          if (!data.success) {
            console.error("Backend rejected LLM config:", data);
          }
        } catch {
          // Backend may not be running — still save locally
          console.warn("Could not sync LLM config to backend");
        }

        // Don't persist refreshToken in localStorage — only backend DB has it
        set((state) => {
          const connections = [...state.connections, newConn];
          const activeConnectionId =
            conn.isDefault || connections.length === 1
              ? id
              : state.activeConnectionId;
          return { connections, activeConnectionId, isConfigured: true };
        });
      },

      updateConnection: (id, updates) =>
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      removeConnection: (id) =>
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
          activeConnectionId:
            state.activeConnectionId === id ? null : state.activeConnectionId,
        })),

      setActiveConnection: (id) => {
        set({ activeConnectionId: id });
        // Sync active connection to backend
        const conn = get().connections.find((c) => c.id === id);
        if (conn) {
          fetch("/api/settings/llm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: conn.provider,
              apiKey: conn.apiKey,
              baseUrl: conn.baseUrl,
              model: conn.model,
              name: conn.name,
              isDefault: true,
              authType: conn.authType || "api_key",
            }),
          }).catch(() => {});
        }
      },

      getActiveConnection: () => {
        const { connections, activeConnectionId } = get();
        return connections.find((c) => c.id === activeConnectionId) || null;
      },

      setConfigured: (v) => set({ isConfigured: v }),

      refreshOAuthToken: async (connectionId: string) => {
        try {
          const res = await fetch("/api/settings/llm/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ connectionId }),
          });
          const data = await res.json();
          if (data.success) {
            // Update local token expiry
            set((state) => ({
              connections: state.connections.map((c) =>
                c.id === connectionId
                  ? { ...c, tokenExpiresAt: data.tokenExpiresAt }
                  : c
              ),
            }));
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "zhongming-settings",
      partialize: (state) => ({
        // Explicitly exclude refreshToken-related fields from persistence
        connections: state.connections.map(({ ...c }) => c),
        activeConnectionId: state.activeConnectionId,
        isConfigured: state.isConfigured,
      }),
    }
  )
);
