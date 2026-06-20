'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
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
  const { key } = useParams<{ key: string }>();
  const { data: boards } = useBoards(key);
  const openCreateBoard = useCreateBoardStore((s) => s.open);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [swimlaneBy, setSwimlaneBy] = useState<SwimlaneBy>('EPIC');
  const [selectedSprintId, setSelectedSprintId] = useState<string | undefined>();
  const [backlogOpen, setBacklogOpen] = useState(false);

  const defaultBoard = boards?.find((b) => b.isDefault) ?? boards?.[0];
  const isScrum = defaultBoard?.type === 'SCRUM';

  const { data: sprints } = useSprints(defaultBoard?.id ?? '');
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
        <div className="px-4 flex items-center justify-between">
          <TabsList variant="line">
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="size-3.5" />
              Analytics
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="board" className="flex-1 flex flex-col min-h-0">
          {/* Sprint header for SCRUM boards */}
          {isScrum && defaultBoard && (
            <SprintBoardHeader
              boardId={defaultBoard.id}
              currentSprintId={selectedSprintId}
              onSprintChange={setSelectedSprintId}
              activeSprint={null}
              backlogOpen={backlogOpen}
              onBacklogToggle={() => setBacklogOpen((prev) => !prev)}
            />
          )}

          {defaultBoard && (
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
            {isScrum && defaultBoard && (
              <BacklogPanel
                boardId={defaultBoard.id}
                projectKey={key}
                currentSprintId={selectedSprintId}
                currentSprintName={selectedSprintName}
                open={backlogOpen}
                onClose={() => setBacklogOpen(false)}
              />
            )}

            <div className="min-h-full px-4 pb-6">
              {defaultBoard ? (
                <KanbanBoard
                  projectKey={key}
                  boardId={defaultBoard.id}
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
          {defaultBoard ? (
            <BoardAnalytics projectKey={key} boardId={defaultBoard.id} />
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

      {defaultBoard && (
        <BoardSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          projectKey={key}
          board={defaultBoard}
        />
      )}
    </div>
  );
}
