'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { TimeReport } from '@/components/time-tracking/time-report';

export default function TimeReportPage() {
  const { key } = useParams<{ key: string }>();

  return (
    <div className="p-8">
      <PageHeader title="Time Report" description="Track time spent across issues and team members." />
      <div className="mt-6">
        <TimeReport projectKey={key} />
      </div>
    </div>
  );
}
