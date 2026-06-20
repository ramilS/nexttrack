import { create } from 'zustand';
import type { IssueType } from '@repo/shared/schemas';

interface CreateIssueDefaults {
  type?: IssueType;
}

interface CreateIssueState {
  isOpen: boolean;
  /** Pre-fill project key when opening from a specific project context */
  projectKey: string | null;
  /** Pre-fill defaults (e.g. type=STORY for swimlane creation) */
  defaults: CreateIssueDefaults | null;
  open: (projectKey?: string, defaults?: CreateIssueDefaults) => void;
  close: () => void;
}

export const useCreateIssueStore = create<CreateIssueState>()((set) => ({
  isOpen: false,
  projectKey: null,
  defaults: null,
  open: (projectKey, defaults) =>
    set({ isOpen: true, projectKey: projectKey ?? null, defaults: defaults ?? null }),
  close: () => set({ isOpen: false, projectKey: null, defaults: null }),
}));
