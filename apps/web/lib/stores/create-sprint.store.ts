import { create } from 'zustand';

interface CreateSprintState {
  isOpen: boolean;
  /** boardId registered by SprintBoardHeader when mounted */
  activeBoardId: string | null;
  registerBoard: (boardId: string) => void;
  unregisterBoard: () => void;
  /** Trigger dialog open from cmd+k */
  open: () => void;
  close: () => void;
}

export const useCreateSprintStore = create<CreateSprintState>()((set) => ({
  isOpen: false,
  activeBoardId: null,
  registerBoard: (boardId) => set({ activeBoardId: boardId }),
  unregisterBoard: () => set({ activeBoardId: null }),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
