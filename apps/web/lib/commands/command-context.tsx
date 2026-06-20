'use client';

import { useEffect, type ReactNode } from 'react';
import { useCommandContextStore } from '@/lib/stores/command-context.store';
import type { CommandContext } from './command-registry';

/**
 * Publishes the current page's command context into the shared store while
 * mounted, and clears it on unmount. Rendered by IssueList / IssueDetail; read
 * by the command palette via {@link useCommandContext}.
 */
export function CommandContextProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: Partial<CommandContext>;
}) {
  const setContext = useCommandContextStore((s) => s.setContext);
  const clearContext = useCommandContextStore((s) => s.clearContext);

  const activeIssue = value.activeIssue ?? null;
  const currentUser = value.currentUser ?? null;
  const projectKey = value.currentProject?.key ?? null;
  const projectId = value.currentProject?.id ?? null;
  // Stable scalar dep — avoids re-syncing on every parent render when the
  // caller passes a fresh array/object literal.
  const selectedKey = (value.selectedIssueIds ?? []).join(',');

  useEffect(() => {
    setContext({
      activeIssue,
      selectedIssueIds: selectedKey ? selectedKey.split(',') : [],
      currentProject: projectKey && projectId ? { key: projectKey, id: projectId } : null,
      currentUser,
    });
    return () => clearContext();
  }, [activeIssue, currentUser, projectKey, projectId, selectedKey, setContext, clearContext]);

  return <>{children}</>;
}

export function useCommandContext(): CommandContext {
  const activeIssue = useCommandContextStore((s) => s.activeIssue);
  const selectedIssueIds = useCommandContextStore((s) => s.selectedIssueIds);
  const currentProject = useCommandContextStore((s) => s.currentProject);
  const currentUser = useCommandContextStore((s) => s.currentUser);
  return { activeIssue, selectedIssueIds, currentProject, currentUser };
}
