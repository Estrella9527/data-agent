import { create } from "zustand";
import type { Session } from "@/types/session";

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  isLoading: boolean;

  fetchSessions: () => Promise<void>;
  createSession: (title?: string, dataSourceIds?: string[]) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  updateSessionTitle: (id: string, title: string) => Promise<void>;
  pinSession: (id: string) => Promise<void>;
  unpinSession: (id: string) => Promise<void>;
  setActiveSession: (id: string | null) => void;
  getActiveSession: () => Session | null;
  updateSessionInList: (id: string, updates: Partial<Session>) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isLoading: false,

  fetchSessions: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      if (data.success) {
        set({ sessions: data.data, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  createSession: async (title?: string, dataSourceIds?: string[]) => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title || null,
        dataSourceIds: dataSourceIds || [],
      }),
    });
    const data = await res.json();
    if (data.success) {
      const session = data.data as Session;
      set((state) => ({
        sessions: [session, ...state.sessions],
        activeSessionId: session.id,
      }));
      return session;
    }
    throw new Error("Failed to create session");
  },

  deleteSession: async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
    }));
  },

  updateSessionTitle: async (id: string, title: string) => {
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, title } : s
      ),
    }));
  },

  pinSession: async (id: string) => {
    const pinnedAt = new Date().toISOString();
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinnedAt }),
    });
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, pinnedAt } : s
      ),
    }));
  },

  unpinSession: async (id: string) => {
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinnedAt: null }),
    });
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, pinnedAt: null } : s
      ),
    }));
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  getActiveSession: () => {
    const { sessions, activeSessionId } = get();
    return sessions.find((s) => s.id === activeSessionId) || null;
  },

  updateSessionInList: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),
}));
