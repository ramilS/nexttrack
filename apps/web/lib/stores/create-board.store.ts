import { create } from 'zustand';

interface CreateBoardState {
  isOpen: boolean;
  /** Project the board will be created in (set when opened from a project context) */
  projectKey: string | null;
  open: (projectKey?: string) => void;
  close: () => void;
}

export const useCreateBoardStore = create<CreateBoardState>()((set) => ({
  isOpen: false,
  projectKey: null,
  open: (projectKey) => set({ isOpen: true, projectKey: projectKey ?? null }),
  close: () => set({ isOpen: false, projectKey: null }),
}));
