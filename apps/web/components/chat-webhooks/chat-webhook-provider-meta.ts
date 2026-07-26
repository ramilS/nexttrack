import type { WebhookProvider } from '@repo/shared/schemas';

export interface ChatWebhookProviderMeta {
  label: string;
  description: string;
  urlPlaceholder: string;
  helpUrl: string;
}

export const CHAT_WEBHOOK_PROVIDERS: Record<
  Exclude<WebhookProvider, 'GENERIC'>,
  ChatWebhookProviderMeta
> = {
  SLACK: {
    label: 'Slack',
    description: 'Post project notifications to a Slack channel via an Incoming Webhook.',
    urlPlaceholder: 'https://hooks.slack.com/services/...',
    helpUrl: 'https://api.slack.com/messaging/webhooks',
  },
  DISCORD: {
    label: 'Discord',
    description: 'Post project notifications to a Discord channel via a webhook.',
    urlPlaceholder: 'https://discord.com/api/webhooks/...',
    helpUrl: 'https://support.discord.com/hc/en-us/articles/228383668',
  },
  TEAMS: {
    label: 'Microsoft Teams',
    description: 'Post project notifications to a Teams channel via an Incoming Webhook connector.',
    urlPlaceholder: 'https://outlook.office.com/webhook/...',
    helpUrl: 'https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook',
  },
};
