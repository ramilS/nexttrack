'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { TelegramConfig } from '@/components/telegram/telegram-config';
import { ChatWebhookCard } from '@/components/chat-webhooks/chat-webhook-card';

export default function IntegrationsSettingsPage() {
  const { key } = useParams<{ key: string }>();

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connect external services to receive project notifications."
      />
      <div className="mt-6 space-y-8">
        <TelegramConfig projectKey={key} />
        <ChatWebhookCard projectKey={key} provider="SLACK" />
        <ChatWebhookCard projectKey={key} provider="DISCORD" />
        <ChatWebhookCard projectKey={key} provider="TEAMS" />
      </div>
    </div>
  );
}
