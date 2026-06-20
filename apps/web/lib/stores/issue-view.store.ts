import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ViewMode = 'list' | 'board';

interface SavedFilter {
  name: string;
  params: Record<string, string>;
}

interface IssueViewState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  savedFilters: Record<string, SavedFilter[]>;
  saveFilter: (projectKey: string, name: string, params: Record<string, string>) => void;
  removeFilter: (projectKey: string, name: string) => void;

  columnWidths: Record<string, number>;
  setColumnWidth: (column: string, width: number) => void;

  isFocusMode: boolean;
  toggleFocusMode: () => void;
}

export const useIssueViewStore = create<IssueViewState>()(
  persist(
    (set) => ({
      viewMode: 'list',
      setViewMode: (mode) => set({ viewMode: mode }),

      savedFilters: {},
      saveFilter: (projectKey, name, params) =>
        set((state) => ({
          savedFilters: {
            ...state.savedFilters,
            [projectKey]: [
              ...(state.savedFilters[projectKey] ?? []),
              { name, params },
            ],
          },
        })),
      removeFilter: (projectKey, name) =>
        set((state) => ({
          savedFilters: {
            ...state.savedFilters,
            [projectKey]: (state.savedFilters[projectKey] ?? []).filter(
              (f) => f.name !== name,
            ),
          },
        })),

      columnWidths: {},
      setColumnWidth: (column, width) =>
        set((state) => ({
          columnWidths: { ...state.columnWidths, [column]: width },
        })),

      isFocusMode: false,
      toggleFocusMode: () => set((state) => ({ isFocusMode: !state.isFocusMode })),
    }),
    {
      name: 'issue-view',
      partialize: (state) => ({
        viewMode: state.viewMode,
        savedFilters: state.savedFilters,
        columnWidths: state.columnWidths,
      }),
    },
  ),
);
