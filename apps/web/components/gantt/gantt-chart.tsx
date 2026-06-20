'use client';

import { useCallback, useRef } from 'react';
import { Gantt, Willow, WillowDark, Tooltip, type ITask, type ILink, type IApi } from '@svar-ui/react-gantt';
import '@svar-ui/react-gantt/all.css';
import { useTheme } from 'next-themes';
import { format } from 'date-fns';

function TooltipContent({ data }: { data: ITask }) {
  if (!data) return null;
  return (
    <div className="flex flex-col gap-1 p-1 text-xs">
      <div className="font-medium">{data.text}</div>
      {data.start && data.end && (
        <div className="text-muted-foreground">
          {format(data.start, 'MMM d')} – {format(data.end, 'MMM d, yyyy')}
        </div>
      )}
      {data.assigneeName && (
        <div className="text-muted-foreground">{data.assigneeName as string}</div>
      )}
      {typeof data.progress === 'number' && (
        <div className="text-muted-foreground">Progress: {data.progress}%</div>
      )}
    </div>
  );
}

interface GanttChartProps {
  tasks: ITask[];
  links: ILink[];
  scales: { unit: string; step: number; format?: string }[];
  cellWidth: number;
  start: Date;
  end: Date;
  onUpdateTask: (ev: { id: string | number; task: Partial<ITask> }) => void;
  onSelectTask: (ev: { id: string | number }) => void;
}

export default function GanttChart({
  tasks,
  links,
  scales,
  cellWidth,
  start,
  end,
  onUpdateTask,
  onSelectTask,
}: GanttChartProps) {
  const { resolvedTheme } = useTheme();
  const apiRef = useRef<IApi | null>(null);

  const handleInit = useCallback((api: IApi) => {
    apiRef.current = api;
  }, []);

  const ThemeWrapper = resolvedTheme === 'dark' ? WillowDark : Willow;

  return (
    <div className="gantt-container h-full">
      <ThemeWrapper>
        <Gantt
          tasks={tasks}
          links={links}
          scales={scales}
          cellWidth={cellWidth}
          cellHeight={36}
          scaleHeight={36}
          lengthUnit="day"
          start={start}
          end={end}
          columns={[
            {
              id: 'text',
              header: 'Task',
              flexgrow: 1,
              cell: ({ row }: { row: ITask }) => (
                <span title={row.text ?? ''} className="block truncate">
                  {row.text}
                </span>
              ),
            },
          ]}
          zoom
          init={handleInit}
          onupdatetask={onUpdateTask}
          onselecttask={onSelectTask}
        />
        <Tooltip content={TooltipContent} />
      </ThemeWrapper>
    </div>
  );
}
