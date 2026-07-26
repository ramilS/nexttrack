'use client';

import { useState } from 'react';
import { Loader2, Send, Trash2, Pencil, AlertTriangle, CircleCheck, CircleX, MessageSquare } from 'lucide-react';
import { AsyncContent } from '@/components/shared/async-content';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { RelativeTime } from '@/components/shared/relative-time';
import type { WebhookProvider } from '@repo/shared/schemas';
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
} from '@/lib/hooks/use-webhooks';
import { WEBHOOK_EVENT_TYPES } from '@/components/webhooks/webhook-event-types';
import { cn } from '@/lib/utils';
import { ChatWebhookForm } from './chat-webhook-form';
import { CHAT_WEBHOOK_PROVIDERS } from './chat-webhook-provider-meta';

function eventLabel(value: string): string {
  return WEBHOOK_EVENT_TYPES.find((e) => e.value === value)?.label ?? value;
}

interface ChatWebhookCardProps {
  projectKey: string;
  provider: Exclude<WebhookProvider, 'GENERIC'>;
  className?: string;
}

export function ChatWebhookCard({ projectKey, provider, className }: ChatWebhookCardProps) {
  const meta = CHAT_WEBHOOK_PROVIDERS[provider];
  const { data: webhooks, isLoading } = useWebhooks(projectKey);
  const createWebhook = useCreateWebhook(projectKey);
  const updateWebhook = useUpdateWebhook(projectKey);
  const deleteWebhook = useDeleteWebhook(projectKey);
  const testWebhook = useTestWebhook(projectKey);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  // One connection per chat provider per project, mirroring the Telegram UX —
  // additional Slack/Discord channels can still be wired up via the generic
  // Webhooks page, which lists every row regardless of provider.
  const config = webhooks?.find((w) => w.provider === provider);

  return (
    <AsyncContent loading={isLoading} className="py-8">
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{meta.label}</h2>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>
          {!config && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Connect {meta.label}
            </Button>
          )}
        </div>

        {!config ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
            <MessageSquare className="size-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              No {meta.label} integration configured.
            </p>
          </div>
        ) : (
          <Card className="gap-0 py-0">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'flex items-center justify-center size-8 rounded-md',
                    config.isEnabled && !config.disabledAt
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <MessageSquare className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{config.name}</span>
                    {!config.isEnabled && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Disabled</Badge>
                    )}
                    {config.disabledAt && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Auto-disabled</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{config.url}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => testWebhook.mutate(config.id)}
                  disabled={testWebhook.isPending || !config.isEnabled}
                >
                  {testWebhook.isPending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                  Test
                </Button>
                <Button variant="ghost" size="icon-xs" className="size-7" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => setRemoveOpen(true)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4 border-t border-border px-4 py-2 bg-muted/30">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {config.consecutiveFailures > 0 ? (
                  <AlertTriangle className="size-3 text-warning" />
                ) : config.lastDeliveryAt ? (
                  <CircleCheck className="size-3 text-success" />
                ) : (
                  <CircleX className="size-3" />
                )}
                {config.lastDeliveryAt
                  ? <>Last delivery <RelativeTime date={config.lastDeliveryAt} /></>
                  : 'No deliveries yet'}
                {config.consecutiveFailures > 0 && ` · ${config.consecutiveFailures} failures`}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {config.eventTypes.map((evt) => (
                  <span key={evt} className="text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                    {eventLabel(evt)}
                  </span>
                ))}
              </div>
            </div>

            {config.disabledAt && config.disabledReason && (
              <div className="flex items-center gap-2 border-t border-border px-4 py-2 bg-destructive/5">
                <AlertTriangle className="size-3.5 text-destructive shrink-0" />
                <p className="text-xs text-destructive">{config.disabledReason}</p>
              </div>
            )}
          </Card>
        )}

        <ChatWebhookForm
          meta={meta}
          open={createOpen}
          onOpenChange={setCreateOpen}
          isPending={createWebhook.isPending}
          onSubmit={(data) => {
            createWebhook.mutate(
              { ...data, provider },
              { onSuccess: () => setCreateOpen(false) },
            );
          }}
        />

        <ConfirmDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          title={`Remove ${meta.label} integration`}
          description="Notifications will stop being sent."
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => config && deleteWebhook.mutate(config.id)}
        />

        {editOpen && config && (
          <ChatWebhookForm
            meta={meta}
            open
            onOpenChange={setEditOpen}
            isPending={updateWebhook.isPending}
            onSubmit={(data) => {
              updateWebhook.mutate(
                { webhookId: config.id, data },
                { onSuccess: () => setEditOpen(false) },
              );
            }}
            defaultValues={{
              name: config.name,
              url: config.url,
              eventTypes: config.eventTypes,
              isEnabled: config.isEnabled,
            }}
          />
        )}
      </div>
    </AsyncContent>
  );
}
