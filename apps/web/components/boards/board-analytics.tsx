'use client';

import { CfdChart } from './cfd-chart';
import { VelocityChart } from './velocity-chart';

interface BoardAnalyticsProps {
  projectKey: string;
  boardId: string;
}

export function BoardAnalytics({ projectKey, boardId }: BoardAnalyticsProps) {
  return (
    <div className="max-w-240 space-y-6">
      <CfdChart projectKey={projectKey} boardId={boardId} />
      <VelocityChart projectKey={projectKey} boardId={boardId} />
    </div>
  );
}
