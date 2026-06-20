import { create } from 'zustand';
import type { CommandContext } from '@/lib/commands/command-registry';

interface CommandContextState extends CommandContext {
  setContext: (ctx: CommandContext) => void;
  clearContext: () => void;
}

const emptyContext: CommandContext = {
  activeIssue: null,
  selectedIssueIds: [],
  currentProject: null,
  currentUser: null,
};

/**
 * Holds the "what is the user looking at" context (active issue, selection,
 * project) for the command palette. Lives in a store rather than React context
 * because the palette is mounted as a sibling of the pages that set it — React
 * context only flows down, a store is readable from anywhere.
 */
export const useCommandContextStore = create<CommandContextState>()((set) => ({
  ...emptyContext,
  setContext: (ctx) => set(ctx),
  clearContext: () => set(emptyContext),
}));
