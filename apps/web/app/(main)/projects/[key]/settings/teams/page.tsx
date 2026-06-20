'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { TeamList } from '@/components/teams/team-list';

export default function TeamsSettingsPage() {
  const { key } = useParams<{ key: string }>();

  return (
    <div>
      <PageHeader title="Teams" description="Create teams and organize project members into groups." />
      <TeamList projectKey={key} className="mt-6" />
    </div>
  );
}
