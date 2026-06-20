'use client';

import { use } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { WorkflowManager } from '@/components/workflows/workflow-manager';

export default function WorkflowsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);

  return (
    <div>
      <PageHeader title="Workflows" description="Create and manage workflows to define issue statuses and transitions." />
      <WorkflowManager projectKey={key} className="mt-6" />
    </div>
  );
}
