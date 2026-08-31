'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronsUpDown, KanbanSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { AsyncContent } from '@/components/shared/async-content';
import { useVisibleBoards } from '@/lib/hooks/use-boards';
import { routes } from '@/lib/routes';
import type { BoardSummary } from '@/lib/api/boards.api';

interface BoardSwitcherProps {
  /** Key of the project whose board page is currently open. */
  projectKey: string;
  currentBoardId: string | undefined;
  /** Name to show on the trigger before the cross-project list has loaded. */
  currentBoardName: string | undefined;
  /** Switch to another board of the SAME project, without a navigation. */
  onSelectInProject: (boardId: string) => void;
}

interface BoardGroup {
  projectKey: string;
  projectName: string;
  boards: BoardSummary[];
}

/**
 * Groups boards by project, current project first. Board order within a group
 * is left as the API returned it (creation order), so the list stays stable
 * between openings.
 */
function groupByProject(
  boards: BoardSummary[],
  currentProjectKey: string,
): BoardGroup[] {
  const groups = new Map<string, BoardGroup>();

  for (const board of boards) {
    const existing = groups.get(board.project.key);
    if (existing) {
      existing.boards.push(board);
      continue;
    }
    groups.set(board.project.key, {
      projectKey: board.project.key,
      projectName: board.project.name,
      boards: [board],
    });
  }

  return [...groups.values()].sort((a, b) => {
    if (a.projectKey === currentProjectKey) return -1;
    if (b.projectKey === currentProjectKey) return 1;
    return a.projectName.localeCompare(b.projectName);
  });
}

export function BoardSwitcher({
  projectKey,
  currentBoardId,
  currentBoardName,
  onSelectInProject,
}: BoardSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: boards, isLoading } = useVisibleBoards();

  const groups = useMemo(
    () => (boards ? groupByProject(boards, projectKey) : []),
    [boards, projectKey],
  );

  function handleSelect(board: BoardSummary) {
    setOpen(false);
    if (board.project.key === projectKey) {
      onSelectInProject(board.id);
      return;
    }
    router.push(`${routes.project(board.project.key).board}?board=${board.id}`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label="Switch board"
            className="max-w-64 justify-between gap-2 font-medium"
          />
        }
      >
        <KanbanSquare className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{currentBoardName ?? 'Select board'}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search boards..." />
          <CommandList>
            <AsyncContent
              loading={isLoading}
              data={groups}
              empty={(g) => g.length === 0}
              className="py-6"
              emptyState={
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No boards available.
                </p>
              }
            >
              {(loaded) => (
                <>
                  <CommandEmpty>No board found.</CommandEmpty>
                  {loaded.map((group) => (
                    <CommandGroup
                      key={group.projectKey}
                      heading={
                        group.projectKey === projectKey
                          ? `${group.projectName} (current)`
                          : group.projectName
                      }
                    >
                      {group.boards.map((board) => (
                        <CommandItem
                          key={board.id}
                          // cmdk filters on `value`; without the project key a
                          // search for "OPS" would not surface that project's
                          // boards by name alone.
                          value={`${group.projectKey} ${group.projectName} ${board.name}`}
                          data-checked={board.id === currentBoardId}
                          onSelect={() => handleSelect(board)}
                        >
                          <span className="truncate">{board.name}</span>
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[10px]"
                          >
                            {board.type}
                          </Badge>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </>
              )}
            </AsyncContent>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
