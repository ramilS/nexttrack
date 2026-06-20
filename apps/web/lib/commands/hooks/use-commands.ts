'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useUpdateIssue, useBulkUpdateIssues } from '@/lib/hooks/use-issues';
import { useProjects } from '@/lib/hooks/use-projects';
import { useSidebarStore } from '@/lib/stores/sidebar.store';
import { createIssueCommands, type IssueCommandDeps } from '../commands/issue-commands';
import { createNavigationCommands } from '../commands/navigation-commands';
import { createAppCommands } from '../commands/app-commands';
import type { Command } from '../command-registry';
import type { ProjectMember, WorkflowStatus } from '@repo/shared/schemas';
import type { Tag } from '@/lib/api/tags.api';

export interface UseCommandsDeps {
  statuses?: WorkflowStatus[];
  projectMembers?: ProjectMember[];
  tags?: Tag[];
  openCreateDialog?: () => void;
  openCreateSwimlaneDialog?: () => void;
  openCreateSprintDialog?: () => void;
  openCreateBoardDialog?: () => void;
}

export function useCommands(deps: UseCommandsDeps): Command[] {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const updateIssue = useUpdateIssue();
  const bulkUpdate = useBulkUpdateIssues();
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const { data: projectsData } = useProjects();

  return useMemo(() => {
    const projectItems = projectsData?.items ?? [];
    const issueCommandDeps: IssueCommandDeps = {
      updateIssue: (data) => updateIssue.mutate(data),
      bulkUpdate: (data) => bulkUpdate.mutate(data),
      statuses: deps.statuses ?? [],
      projectMembers: deps.projectMembers ?? [],
      tags: deps.tags ?? [],
    };

    const issueCommands = createIssueCommands(issueCommandDeps);

    const navigationCommands = createNavigationCommands({
      navigate: (path) => router.push(path),
      projects: projectItems,
    });

    const appCommands = createAppCommands({
      openCreateDialog: deps.openCreateDialog,
      openCreateSwimlaneDialog: deps.openCreateSwimlaneDialog,
      openCreateSprintDialog: deps.openCreateSprintDialog,
      openCreateBoardDialog: deps.openCreateBoardDialog,
      toggleSidebar,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      theme,
    });

    return [...issueCommands, ...navigationCommands, ...appCommands];
  }, [
    deps.statuses,
    deps.projectMembers,
    deps.tags,
    deps.openCreateDialog,
    deps.openCreateSwimlaneDialog,
    deps.openCreateSprintDialog,
    deps.openCreateBoardDialog,
    updateIssue,
    bulkUpdate,
    router,
    projectsData?.items,
    toggleSidebar,
    theme,
    setTheme,
  ]);
}
