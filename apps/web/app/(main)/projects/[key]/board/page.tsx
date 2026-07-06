'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useParams, useRouter, useSearchParams } from 'next/navigation';
import { Settings, BarChart3, KanbanSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { KanbanBoard } from '@/components/boards/kanban-board';
import { SprintBoardHeader } from '@/components/boards/sprint-board-header';
import { BacklogPanel } from '@/components/boards/backlog-panel';
import { BoardSettingsDialog } from '@/components/boards/board-settings-dialog';
import { BoardAnalytics } from '@/components/boards/board-analytics';
import { useBoards } from '@/lib/hooks/use-boards';
import { useSprints } from '@/lib/hooks/use-sprints';
import { useKeyboardShortcut } from '@/lib/hooks/use-keyboard-shortcut';
import { useCreateBoardStore } from '@/lib/stores/create-board.store';
import type { SwimlaneBy } from '@/lib/api/boards.api';

const SWIMLANE_OPTIONS: { value: SwimlaneBy; label: string }[] = [
  { value: 'EPIC', label: 'By Story' },
  { value: 'ASSIGNEE', label: 'By Assignee' },
  { value: 'PRIORITY', label: 'By Priority' },
  { value: 'TYPE', label: 'By Type' },
];

export default function BoardPage() {
  return (
    <Suspense>
      <BoardPageContent />
    </Suspense>
  );
}

function BoardPageContent() {
  const { key } = useParams<{ key: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: boards } = useBoards(key);
  const openCreateBoard = useCreateBoardStore((s) => s.open);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [swimlaneBy, setSwimlaneBy] = useState<SwimlaneBy>('EPIC');
  const [selectedSprintId, setSelectedSprintId] = useState<string | undefined>();
  const [backlogOpen, setBacklogOpen] = useState(false);

  // Kept as local state (not derived from useSearchParams on every render) so
  // switching boards updates in the SAME synchronous batch as resetting
  // selectedSprintId below. Deriving boardId from the URL instead raced: router
  // .replace()'s RSC round-trip resolves searchParams asynchronously, so for a
  // render or two the OLD board's SprintBoardHeader would see the freshly reset
  // `undefined` sprintId and "helpfully" auto-select ITS OWN sprint before the
  // boardId prop ever changed — clobbering the reset with the wrong board's sprint.
  const [selectedBoardId, setSelectedBoardId] = useState<string | undefined>(
    () => searchParams.get('board') ?? undefined,
  );

  const selectedBoard =
    boards?.find((b) => b.id === selectedBoardId) ||
    boards?.find((b) => b.isDefault) ||
    boards?.[0];
  const isScrum = selectedBoard?.type === 'SCRUM';

  // Once boards load, snap an unset/stale board id to the resolved default.
  useEffect(() => {
    if (boards && selectedBoard && selectedBoardId !== selectedBoard.id) {
      setSelectedBoardId(selectedBoard.id);
    }
  }, [boards, selectedBoard, selectedBoardId]);

  const handleBoardChange = useCallback(
    (boardId: string) => {
      setSelectedBoardId(boardId);
      setSelectedSprintId(undefined);
      const params = new URLSearchParams(searchParams);
      params.set('board', boardId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const { data: sprints } = useSprints(selectedBoard?.id ?? '');
  const selectedSprintName = sprints?.find((s) => s.id === selectedSprintId)?.name;

  const toggleBacklog = useCallback(() => {
    if (isScrum) setBacklogOpen((prev) => !prev);
  }, [isScrum]);
  useKeyboardShortcut({ key: 'b' }, toggleBacklog);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4 pb-1">
        <PageHeader title={`${key} Board`} />
      </div>

      <Tabs defaultValue="board" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 flex items-center justify-between gap-3">
          <TabsList variant="line">
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="size-3.5" />
              Analytics
            </TabsTrigger>
          </TabsList>
          {boards && boards.length > 1 && (
            <Select value={selectedBoard?.id ?? ''} onValueChange={(v) => v && handleBoardChange(v)}>
              <SelectTrigger className="h-8 w-auto text-xs font-medium">
                <SelectValue placeholder="Select board...">
                  {(value: string | null) => boards.find((b) => b.id === value)?.name ?? 'Select board...'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {boards.map((b) => (
                  <SelectItem key={b.id} value={b.id} label={b.name}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <TabsContent value="board" className="flex-1 flex flex-col min-h-0">
          {/* Sprint header for SCRUM boards */}
          {isScrum && selectedBoard && (
            <SprintBoardHeader
              boardId={selectedBoard.id}
              currentSprintId={selectedSprintId}
              onSprintChange={setSelectedSprintId}
              activeSprint={null}
              backlogOpen={backlogOpen}
              onBacklogToggle={() => setBacklogOpen((prev) => !prev)}
            />
          )}

          {selectedBoard && (
            <div className="px-4 py-1.5 flex items-center justify-end gap-2">
              <Select
                value={swimlaneBy}
                onValueChange={(v: string | null) => {
                  if (v) setSwimlaneBy(v as SwimlaneBy);
                }}
              >
                <SelectTrigger className="h-8 w-auto text-xs">
                  <SelectValue>
                    {(value: string | null) => {
                      const opt = SWIMLANE_OPTIONS.find((o) => o.value === value);
                      return opt?.label ?? 'No swimlanes';
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SWIMLANE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} label={opt.label}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings className="size-4" />
                Settings
              </Button>
            </div>
          )}
          <div className="relative flex-1 min-w-0 min-h-0 overflow-auto">
            {/* Backlog side panel */}
            {isScrum && selectedBoard && (
              <BacklogPanel
                boardId={selectedBoard.id}
                projectKey={key}
                currentSprintId={selectedSprintId}
                currentSprintName={selectedSprintName}
                open={backlogOpen}
                onClose={() => setBacklogOpen(false)}
              />
            )}

            <div className="min-h-full px-4 pb-6">
              {selectedBoard ? (
                <KanbanBoard
                  projectKey={key}
                  boardId={selectedBoard.id}
                  swimlaneBy={swimlaneBy}
                  sprintId={isScrum ? selectedSprintId : undefined}
                />
              ) : (
                <EmptyState
                  icon={KanbanSquare}
                  title="No board yet"
                  description="Create a board to start organizing issues into columns."
                  action={{ label: 'Create board', onClick: () => openCreateBoard(key) }}
                />
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="flex-1 overflow-y-auto px-6 py-4">
          {selectedBoard ? (
            <BoardAnalytics projectKey={key} boardId={selectedBoard.id} />
          ) : (
            <EmptyState
              icon={KanbanSquare}
              title="No board yet"
              description="Create a board to see analytics for its issues."
              action={{ label: 'Create board', onClick: () => openCreateBoard(key) }}
            />
          )}
        </TabsContent>
      </Tabs>

      {selectedBoard && (
        <BoardSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          projectKey={key}
          board={selectedBoard}
        />
      )}
    </div>
  );
}
