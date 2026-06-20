'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { RuleList } from '@/components/auto-assign/rule-list';

export default function AutoAssignSettingsPage() {
  const { key } = useParams<{ key: string }>();

  return (
    <div>
      <PageHeader title="Auto-assign" description="Configure rules to automatically assign issues to team members." />
      <RuleList projectKey={key} className="mt-6" />
    </div>
  );
}
