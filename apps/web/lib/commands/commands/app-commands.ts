import type { Command } from '../command-registry';

export interface AppCommandDeps {
  openCreateDialog?: () => void;
  openCreateSwimlaneDialog?: () => void;
  openCreateSprintDialog?: () => void;
  openCreateBoardDialog?: () => void;
  toggleSidebar: () => void;
  toggleTheme: () => void;
  theme: string | undefined;
}

export function createAppCommands(deps: AppCommandDeps): Command[] {
  return [
    {
      id: 'create-issue',
      label: 'Create new issue',
      group: 'application',
      keywords: ['create', 'new', 'issue', 'add'],
      shortcut: 'C',
      execute: () => deps.openCreateDialog?.(),
    },
    {
      id: 'create-swimlane',
      label: 'Create new swimlane (Story)',
      group: 'application',
      keywords: ['create', 'new', 'swimlane', 'story', 'add'],
      when: () => !!deps.openCreateSwimlaneDialog,
      execute: () => deps.openCreateSwimlaneDialog?.(),
    },
    {
      id: 'create-board',
      label: 'Create new board',
      group: 'application',
      keywords: ['create', 'new', 'board', 'kanban', 'scrum', 'add'],
      when: () => !!deps.openCreateBoardDialog,
      execute: () => deps.openCreateBoardDialog?.(),
    },
    {
      id: 'create-sprint',
      label: 'Create new sprint',
      group: 'application',
      keywords: ['create', 'new', 'sprint', 'add', 'scrum'],
      when: () => !!deps.openCreateSprintDialog,
      execute: () => deps.openCreateSprintDialog?.(),
    },
    {
      id: 'toggle-sidebar',
      label: 'Toggle sidebar',
      group: 'application',
      keywords: ['sidebar', 'panel', 'nav'],
      shortcut: '⌘\\',
      execute: () => deps.toggleSidebar(),
    },
    {
      id: 'toggle-theme',
      label: deps.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      group: 'application',
      keywords: ['theme', 'dark', 'light', 'mode'],
      execute: () => deps.toggleTheme(),
    },
  ];
}
