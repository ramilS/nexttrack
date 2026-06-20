'use client';

import { useParams } from 'next/navigation';
import { IssueDetail } from '@/components/issues/issue-detail';

export default function IssueDetailPage() {
  const { key, number } = useParams<{ key: string; number: string }>();

  return <IssueDetail projectKey={key} issueNumber={Number(number)} />;
}
