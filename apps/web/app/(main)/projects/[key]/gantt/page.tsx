'use client';

import { use } from 'react';
import { GanttView } from '@/components/gantt/gantt-view';

export default function GanttPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  return <GanttView projectKey={key} />;
}
