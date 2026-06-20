'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { RuleList } from '@/components/workflow-rules/rule-list';

export default function WorkflowRulesPage() {
  const { key } = useParams<{ key: string }>();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automation"
        description="Create rules to automate workflow actions based on triggers and conditions."
      />
      <RuleList projectKey={key} />
    </div>
  );
}
