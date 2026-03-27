import { create } from "zustand";
import type { DataSource } from "@/types/source";

interface SourceState {
  sources: DataSource[];
  isLoading: boolean;
  selectedSourceId: string | null;

  fetchSources: (type?: string) => Promise<void>;
  uploadFile: (file: File, name?: string) => Promise<DataSource | null>;
  createDatabaseSource: (data: {
    name: string;
    db_type: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }) => Promise<DataSource | null>;
  createApiSource: (data: Record<string, unknown>) => Promise<DataSource | null>;
  testApiConnection: (data: Record<string, unknown>) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
    sample?: Record<string, unknown>[];
    schema?: Record<string, unknown>[];
  }>;
  deleteSource: (id: string) => Promise<void>;
  refreshProfile: (id: string) => Promise<void>;
  getSample: (id: string, n?: number) => Promise<Record<string, unknown>[]>;
  selectTable: (sourceId: string, table: string) => Promise<DataSource>;
  addTables: (sourceId: string, tables: string[]) => Promise<DataSource>;
  removeTables: (sourceId: string, tables: string[]) => Promise<DataSource>;
  updateSelectedTables: (sourceId: string, tables: string[]) => Promise<DataSource>;
  profileTable: (sourceId: string, tableName: string) => Promise<DataSource>;
  selectSource: (id: string | null) => void;
}

export const useSourceStore = create<SourceState>((set) => ({
  sources: [],
  isLoading: false,
  selectedSourceId: null,

  fetchSources: async (type?: string) => {
    set({ isLoading: true });
    try {
      const url = type ? `/api/sources?type=${type}` : "/api/sources";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        set({ sources: data.data });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  uploadFile: async (file, name) => {
    const formData = new FormData();
    formData.append("file", file);
    if (name) formData.append("name", name);

    const res = await fetch("/api/sources", { method: "POST", body: formData });
    const data = await res.json();
    if (data.success) {
      set((s) => ({ sources: [data.data, ...s.sources] }));
      return data.data;
    }
    throw new Error(data.error || "Upload failed");
  },

  createDatabaseSource: async (params) => {
    const res = await fetch("/api/sources/database", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (data.success) {
      set((s) => ({ sources: [data.data, ...s.sources] }));
      return data.data;
    }
    throw new Error(data.detail || data.error || "Failed to create database source");
  },

  createApiSource: async (params) => {
    const res = await fetch("/api/sources/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (data.success) {
      set((s) => ({ sources: [data.data, ...s.sources] }));
      return data.data;
    }
    throw new Error(data.detail || data.error || "Failed to create API source");
  },

  testApiConnection: async (params) => {
    const res = await fetch("/api/sources/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return await res.json();
  },

  deleteSource: async (id) => {
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
    set((s) => ({
      sources: s.sources.filter((src) => src.id !== id),
      selectedSourceId: s.selectedSourceId === id ? null : s.selectedSourceId,
    }));
  },

  refreshProfile: async (id) => {
    const res = await fetch(`/api/sources/${id}/refresh`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      set((s) => ({
        sources: s.sources.map((src) => (src.id === id ? data.data : src)),
      }));
    }
  },

  getSample: async (id, n = 10) => {
    const res = await fetch(`/api/sources/${id}/sample?n=${n}`);
    const data = await res.json();
    return data.success ? data.data : [];
  },

  selectTable: async (sourceId, table) => {
    const res = await fetch(`/api/sources/database/${sourceId}/tables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tables: [table] }),
    });
    const data = await res.json();
    if (data.success) {
      set((s) => ({
        sources: s.sources.map((src) => (src.id === sourceId ? data.data : src)),
      }));
      return data.data;
    }
    throw new Error(data.detail || data.error || "选择表失败");
  },

  addTables: async (sourceId, tables) => {
    const res = await fetch(`/api/sources/database/${sourceId}/tables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tables }),
    });
    const data = await res.json();
    if (data.success) {
      set((s) => ({
        sources: s.sources.map((src) => (src.id === sourceId ? data.data : src)),
      }));
      return data.data;
    }
    throw new Error(data.detail || data.error || "添加表失败");
  },

  removeTables: async (sourceId, tables) => {
    const res = await fetch(`/api/sources/database/${sourceId}/tables/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tables }),
    });
    const data = await res.json();
    if (data.success) {
      set((s) => ({
        sources: s.sources.map((src) => (src.id === sourceId ? data.data : src)),
      }));
      return data.data;
    }
    throw new Error(data.detail || data.error || "移除表失败");
  },

  updateSelectedTables: async (sourceId, tables) => {
    const res = await fetch(`/api/sources/database/${sourceId}/selected-tables`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tables }),
    });
    const data = await res.json();
    if (data.success) {
      set((s) => ({
        sources: s.sources.map((src) => (src.id === sourceId ? data.data : src)),
      }));
      return data.data;
    }
    throw new Error(data.detail || data.error || "更新选择表失败");
  },

  profileTable: async (sourceId, tableName) => {
    const res = await fetch(
      `/api/sources/database/${sourceId}/tables/${encodeURIComponent(tableName)}/profile`,
      { method: "POST", headers: { "Content-Type": "application/json" } }
    );
    const data = await res.json();
    if (data.success) {
      set((s) => ({
        sources: s.sources.map((src) => (src.id === sourceId ? data.data : src)),
      }));
      return data.data;
    }
    throw new Error(data.detail || data.error || "分析表失败");
  },

  selectSource: (id) => set({ selectedSourceId: id }),
}));
