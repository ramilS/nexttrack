import { create } from 'zustand';

interface TimerState {
  isRunning: boolean;
  issueId: string | null;
  issueKey: string | null;
  startedAt: Date | null;
  elapsed: number;

  start: (issueId: string, issueKey: string) => void;
  stop: () => void;
  tick: () => void;
  sync: (serverState: { issueId: string; startedAt: string; issue?: { projectKey: string; number: number } | null } | null) => void;
}

export const useTimerStore = create<TimerState>((set, get) => ({
  isRunning: false,
  issueId: null,
  issueKey: null,
  startedAt: null,
  elapsed: 0,

  start: (issueId, issueKey) =>
    set({ isRunning: true, issueId, issueKey, startedAt: new Date(), elapsed: 0 }),

  stop: () =>
    set({ isRunning: false, issueId: null, issueKey: null, startedAt: null, elapsed: 0 }),

  tick: () => {
    const { startedAt } = get();
    if (startedAt) {
      set({ elapsed: Math.floor((Date.now() - startedAt.getTime()) / 1000) });
    }
  },

  sync: (serverState) => {
    if (serverState) {
      const startedAt = new Date(serverState.startedAt);
      const issueKey = serverState.issue
        ? `${serverState.issue.projectKey}-${serverState.issue.number}`
        : null;
      set({
        isRunning: true,
        issueId: serverState.issueId,
        issueKey,
        startedAt,
        elapsed: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      });
    } else {
      set({ isRunning: false, issueId: null, issueKey: null, startedAt: null, elapsed: 0 });
    }
  },
}));
