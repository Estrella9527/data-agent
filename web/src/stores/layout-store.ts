import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  sidebarCollapsed: boolean;
  sessionListWidth: number;
  toggleSidebar: () => void;
  setSessionListWidth: (width: number) => void;
}

const MIN_SESSION_WIDTH = 200;
const MAX_SESSION_WIDTH = 480;

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sessionListWidth: 280,

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSessionListWidth: (width: number) =>
        set({
          sessionListWidth: Math.max(
            MIN_SESSION_WIDTH,
            Math.min(MAX_SESSION_WIDTH, width)
          ),
        }),
    }),
    {
      name: "layout-preferences",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        sessionListWidth: state.sessionListWidth,
      }),
    }
  )
);

export { MIN_SESSION_WIDTH, MAX_SESSION_WIDTH };
