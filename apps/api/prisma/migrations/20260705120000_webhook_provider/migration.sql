-- Chat-notification providers (Slack/Discord/Teams incoming webhooks) reuse
-- the generic ProjectWebhook delivery pipeline; `provider` selects the
-- payload envelope built at delivery time (see chat-webhook-formatter.ts).
CREATE TYPE "webhook_provider" AS ENUM ('GENERIC', 'SLACK', 'DISCORD', 'TEAMS');

ALTER TABLE "project_webhooks"
  ADD COLUMN "provider" "webhook_provider" NOT NULL DEFAULT 'GENERIC';
