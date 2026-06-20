'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { WebhookList } from '@/components/webhooks/webhook-list';

export default function WebhooksSettingsPage() {
  const { key } = useParams<{ key: string }>();

  return (
    <div>
      <PageHeader
        title="Webhooks"
        description="Send event notifications to external services via HTTP POST."
      />
      <WebhookList projectKey={key} className="mt-6" />
    </div>
  );
}
