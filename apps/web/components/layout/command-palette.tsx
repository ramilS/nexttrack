'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  LayoutDashboard,
  ListChecks,
  Plus,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeft,
  Search,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useParams, useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { Kbd } from '@/components/shared/kbd';
import { ColorDot } from '@/components/shared/color-dot';
import { IssueTypeIcon } from '@/components/shared/issue-type-icon';
import { useCommandPaletteStore } from '@/lib/stores/command-palette.store';
import { useSidebarStore } from '@/lib/stores/sidebar.store';
import { useQuickSearch } from '@/lib/hooks/use-quick-search';
import { useWorkflowStatuses, useProjectMembers } from '@/lib/hooks/use-projects';
import { useTags } from '@/lib/hooks/use-tags';
import { useCommandContext } from '@/lib/commands/command-context';
import { useCommands } from '@/lib/commands/hooks/use-commands';
import { useCreateIssueStore } from '@/lib/stores/create-issue.store';
import { useCreateSprintStore } from '@/lib/stores/create-sprint.store';
import { useCreateBoardStore } from '@/lib/stores/create-board.store';
import type { Command, CommandOption } from '@/lib/commands/command-registry';

type PaletteMode =
  | { type: 'root' }
  | { type: 'sub'; command: Command; options: CommandOption[] };

const GROUP_LABELS: Record<string, string> = {
  issue: 'Issue Actions',
  navigation: 'Navigation',
  application: 'Application',
};

export function CommandPalette() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const close = useCommandPaletteStore((s) => s.close);
  const toggle = useCommandPaletteStore((s) => s.toggle);
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const { theme } = useTheme();
  const router = useRouter();
  const { query, setQuery, results, isLoading } = useQuickSearch();

  const ctx = useCommandContext();
  const routeParams = useParams<{ key?: string }>();
  // The palette is mounted above any CommandContextProvider, so ctx.currentProject
  // is null on most pages. Fall back to the project key in the route, which is the
  // real "current project" on any /projects/[key]/… page.
  const currentProjectKey = ctx.currentProject?.key ?? routeParams.key;
  const openCreateDialog = useCreateIssueStore((s) => s.open);
  const sprintBoardId = useCreateSprintStore((s) => s.activeBoardId);
  const openCreateSprint = useCreateSprintStore((s) => s.open);
  const openCreateBoard = useCreateBoardStore((s) => s.open);

  // Fetch contextual data for the current project (disabled when off-project).
  const { data: statusesData } = useWorkflowStatuses(currentProjectKey ?? '');
  const { data: membersData } = useProjectMembers(currentProjectKey ?? '');
  const { data: tagsData } = useTags(currentProjectKey ?? '');

  const commands = useCommands({
    statuses: statusesData ?? [],
    projectMembers: membersData ?? [],
    tags: tagsData ?? [],
    openCreateDialog: () => openCreateDialog(currentProjectKey),
    openCreateSwimlaneDialog: currentProjectKey
      ? () => openCreateDialog(currentProjectKey, { type: 'STORY' })
      : undefined,
    openCreateSprintDialog: sprintBoardId ? () => openCreateSprint() : undefined,
    openCreateBoardDialog: currentProjectKey ? () => openCreateBoard(currentProjectKey) : undefined,
  });

  const [mode, setMode] = useState<PaletteMode>({ type: 'root' });

  // Cmd+K toggle
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
      // 'C' to create issue (like Linear) — only when no input/textarea is focused
      if (
        e.key === 'c' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isOpen &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault();
        openCreateDialog(currentProjectKey);
      }
    }
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [toggle, isOpen, openCreateDialog, currentProjectKey]);

  // Reset when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setMode({ type: 'root' });
    }
  }, [isOpen, setQuery]);

  const handleClose = useCallback(() => {
    close();
  }, [close]);

  // Filter visible commands
  const visibleCommands = useMemo(
    () => commands.filter((cmd) => !cmd.when || cmd.when(ctx)),
    [commands, ctx],
  );

  // Group commands
  const grouped = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of visibleCommands) {
      (groups[cmd.group] ??= []).push(cmd);
    }
    return groups;
  }, [visibleCommands]);

  function handleCommandSelect(cmd: Command) {
    if (cmd.getOptions) {
      const options = cmd.getOptions(ctx);
      setMode({ type: 'sub', command: cmd, options });
      setQuery('');
    } else {
      cmd.execute(ctx);
      handleClose();
    }
  }

  function handleOptionSelect(optionId: string) {
    if (mode.type === 'sub') {
      mode.command.execute(ctx, optionId);
      handleClose();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Backspace on empty query in sub-mode → go back to root
    if (e.key === 'Backspace' && query === '' && mode.type === 'sub') {
      e.preventDefault();
      setMode({ type: 'root' });
    }
    // Let cmdk handle Enter naturally — it selects the highlighted item.
    // "View all results" CommandItem handles navigation to /search.
  }

  // Heading for issue actions
  let issueActionsHeading = GROUP_LABELS.issue;
  if (ctx.selectedIssueIds.length > 0) {
    issueActionsHeading = `Issue Actions (${ctx.selectedIssueIds.length} selected)`;
  } else if (ctx.activeIssue) {
    const key = ctx.activeIssue.project?.key
      ? `${ctx.activeIssue.project.key}-${ctx.activeIssue.number}`
      : `#${ctx.activeIssue.number}`;
    issueActionsHeading = `Actions — ${key}`;
  }

  const hasQuery = query.trim().length > 0;

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      {/* Breadcrumb for sub-mode */}
      {mode.type === 'sub' && (
        <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-0">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => { setMode({ type: 'root' }); setQuery(''); }}
          >
            Commands
          </button>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="text-xs font-medium">{mode.command.label}</span>
        </div>
      )}

      <CommandInput
        placeholder={
          mode.type === 'sub'
            ? `Search ${mode.command.label.toLowerCase()}...`
            : 'Type a command or search issues...'
        }
        value={query}
        onValueChange={setQuery}
        onKeyDown={handleKeyDown}
      />

      <CommandList>
        {/* ── Sub-mode: show options ── */}
        {mode.type === 'sub' && (
          <>
            <CommandEmpty>No matching options</CommandEmpty>
            <CommandGroup>
              {mode.options.map((opt) => (
                <CommandItem
                  key={opt.id}
                  value={`${opt.label} ${(opt.keywords ?? []).join(' ')}`}
                  onSelect={() => handleOptionSelect(opt.id)}
                  data-checked={
                    (ctx.activeIssue?.priority === opt.id ||
                     ctx.activeIssue?.type === opt.id ||
                     ctx.activeIssue?.status?.id === opt.id ||
                     ctx.activeIssue?.assignee?.id === opt.id) ||
                    undefined
                  }
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* ── Root mode ── */}
        {mode.type === 'root' && (
          <>
            {/* Quick search results */}
            {hasQuery && isLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {hasQuery && !isLoading && results.length > 0 && (
              <>
                <CommandGroup heading="Issues">
                  {results.map((result) => (
                    <CommandItem
                      key={result.issue.id}
                      value={`issue-${result.issue.number}-${result.issue.title}`}
                      onSelect={() => {
                        handleClose();
                        router.push(
                          routes.project(result.issue.project.key).issues.detail(result.issue.number),
                        );
                      }}
                    >
                      <IssueTypeIcon type={result.issue.type} className="size-3.5" />
                      <span className="text-xs font-mono text-muted-foreground">
                        {result.issue.project.key}-{result.issue.number}
                      </span>
                      <span className="truncate">{result.issue.title}</span>
                    </CommandItem>
                  ))}
                  <CommandItem
                    value="view-all-results"
                    onSelect={() => {
                      handleClose();
                      router.push(routes.search(query));
                    }}
                  >
                    <Search className="size-3.5" />
                    <span>View all results for &quot;{query}&quot;</span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {hasQuery && !isLoading && results.length === 0 && (
              <CommandEmpty>No issues found for &quot;{query}&quot;</CommandEmpty>
            )}

            {!hasQuery && <CommandEmpty>No results found.</CommandEmpty>}

            {/* Issue Actions group — only if we have issue context */}
            {grouped.issue && grouped.issue.length > 0 && (
              <>
                <CommandGroup heading={issueActionsHeading}>
                  {grouped.issue.map((cmd) => (
                    <CommandItem
                      key={cmd.id}
                      value={`${cmd.label} ${(cmd.keywords ?? []).join(' ')}`}
                      onSelect={() => handleCommandSelect(cmd)}
                    >
                      {cmd.getOptions && <ChevronRight className="size-3.5 text-muted-foreground" />}
                      <span>{cmd.label}</span>
                      {cmd.shortcut && (
                        <CommandShortcut>
                          <Kbd keys={[cmd.shortcut]} />
                        </CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Navigation group */}
            {grouped.navigation && grouped.navigation.length > 0 && (
              <>
                <CommandGroup heading={GROUP_LABELS.navigation}>
                  {grouped.navigation.map((cmd) => {
                    const isProject = cmd.id.startsWith('nav-project-');
                    return (
                      <CommandItem
                        key={cmd.id}
                        value={`${cmd.label} ${(cmd.keywords ?? []).join(' ')}`}
                        onSelect={() => handleCommandSelect(cmd)}
                      >
                        {isProject ? (
                          <ColorDot color={cmd.meta?.color ?? ''} />
                        ) : (
                          getNavIcon(cmd.id)
                        )}
                        <span>{cmd.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Application group */}
            {grouped.application && grouped.application.length > 0 && (
              <CommandGroup heading={GROUP_LABELS.application}>
                {grouped.application.map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    value={`${cmd.label} ${(cmd.keywords ?? []).join(' ')}`}
                    onSelect={() => handleCommandSelect(cmd)}
                  >
                    {getAppIcon(cmd.id, theme, isCollapsed)}
                    <span>{cmd.label}</span>
                    {cmd.shortcut && (
                      <CommandShortcut>
                        <Kbd keys={cmd.shortcut.split('')} />
                      </CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

function getNavIcon(commandId: string) {
  switch (commandId) {
    case 'nav-dashboard':
      return <LayoutDashboard className="size-4" />;
    case 'nav-my-issues':
      return <ListChecks className="size-4" />;
    case 'nav-search':
      return <Search className="size-4" />;
    default:
      return null;
  }
}

function getAppIcon(
  commandId: string,
  theme: string | undefined,
  isCollapsed: boolean,
) {
  switch (commandId) {
    case 'create-issue':
    case 'create-sprint':
    case 'create-swimlane':
    case 'create-board':
      return <Plus className="size-4" />;
    case 'toggle-sidebar':
      return isCollapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />;
    case 'toggle-theme':
      return theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />;
    default:
      return null;
  }
}
