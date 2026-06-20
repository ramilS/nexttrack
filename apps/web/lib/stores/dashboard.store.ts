import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DashboardState {
  activeDashboardId: string | null;
  setActiveDashboardId: (id: string | null) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      activeDashboardId: null,
      setActiveDashboardId: (id) => set({ activeDashboardId: id }),
    }),
    {
      name: 'dashboard',
      partialize: (state) => ({
        activeDashboardId: state.activeDashboardId,
      }),
    },
  ),
);
