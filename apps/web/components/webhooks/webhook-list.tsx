'use client';

import { useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Webhook as WebhookIcon,
  Send,
  CircleCheck,
  CircleX,
  AlertTriangle,
} from 'lucide-react';
import { AsyncContent } from '@/components/shared/async-content';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WebhookForm } from './webhook-form';
import { WEBHOOK_EVENT_TYPES } from './webhook-event-types';
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
} from '@/lib/hooks/use-webhooks';
import type { Webhook } from '@repo/shared/schemas';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { RelativeTime } from '@/components/shared/relative-time';

interface WebhookListProps {
  projectKey: string;
  className?: string;
}

function eventLabel(value: string): string {
  return WEBHOOK_EVENT_TYPES.find((e) => e.value === value)?.label ?? value;
}

export function WebhookList({ projectKey, className }: WebhookListProps) {
  const { data: webhooks, isLoading } = useWebhooks(projectKey);
  const createWebhook = useCreateWebhook(projectKey);
  const updateWebhook = useUpdateWebhook(projectKey);
  const deleteWebhook = useDeleteWebhook(projectKey);
  const testWebhook = useTestWebhook(projectKey);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [deletingWebhook, setDeletingWebhook] = useState<Webhook | null>(null);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Webhooks {webhooks && webhooks.length > 0 && (
            <span className="text-muted-foreground font-normal text-sm ml-1">({webhooks.length})</span>
          )}
        </h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New Webhook
        </Button>
      </div>

      <AsyncContent
        loading={isLoading}
        empty={!webhooks || webhooks.length === 0}
        emptyState={
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
            <WebhookIcon className="size-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              No webhooks configured. Create one to receive event notifications.
            </p>
          </div>
        }
        className="py-8"
      >
        <div className="space-y-3">
          {webhooks?.map((webhook) => (
            <WebhookCard
              key={webhook.id}
              webhook={webhook}
              onEdit={() => setEditingWebhook(webhook)}
              onDelete={() => setDeletingWebhook(webhook)}
              onTest={() => testWebhook.mutate(webhook.id)}
              isTestPending={testWebhook.isPending}
            />
          ))}
        </div>
      </AsyncContent>

      <WebhookForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => {
          createWebhook.mutate(data, { onSuccess: () => setCreateOpen(false) });
        }}
        isPending={createWebhook.isPending}
      />

      <ConfirmDialog
        open={!!deletingWebhook}
        onOpenChange={(open) => { if (!open) setDeletingWebhook(null); }}
        title={`Delete webhook "${deletingWebhook?.name}"`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deletingWebhook) deleteWebhook.mutate(deletingWebhook.id);
        }}
      />

      {editingWebhook && (
        <WebhookForm
          open
          onOpenChange={() => setEditingWebhook(null)}
          onSubmit={(data) => {
            updateWebhook.mutate(
              { webhookId: editingWebhook.id, data },
              { onSuccess: () => setEditingWebhook(null) },
            );
          }}
          isPending={updateWebhook.isPending}
          defaultValues={{
            name: editingWebhook.name,
            url: editingWebhook.url,
            eventTypes: editingWebhook.eventTypes,
            isEnabled: editingWebhook.isEnabled,
          }}
          title="Edit Webhook"
        />
      )}
    </div>
  );
}

function WebhookCard({
  webhook,
  onEdit,
  onDelete,
  onTest,
  isTestPending,
}: {
  webhook: Webhook;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  isTestPending: boolean;
}) {
  const isAutoDisabled = !!webhook.disabledAt;
  const hasFailures = webhook.consecutiveFailures > 0;

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'flex items-center justify-center size-8 rounded-md',
            webhook.isEnabled && !isAutoDisabled
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-muted text-muted-foreground',
          )}>
            <WebhookIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{webhook.name}</span>
              {!webhook.isEnabled && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Disabled</Badge>
              )}
              {isAutoDisabled && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Auto-disabled</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{webhook.url}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onTest}
            disabled={isTestPending || !webhook.isEnabled}
          >
            {isTestPending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
            Test
          </Button>
          <Button variant="ghost" size="icon-xs" className="size-7" onClick={onEdit}>
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-border px-4 py-2 bg-muted/30">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {hasFailures ? (
            <AlertTriangle className="size-3 text-warning" />
          ) : webhook.lastDeliveryAt ? (
            <CircleCheck className="size-3 text-success" />
          ) : (
            <CircleX className="size-3" />
          )}
          {webhook.lastDeliveryAt
            ? <>Last delivery <RelativeTime date={webhook.lastDeliveryAt} /></>
            : 'No deliveries yet'}
          {hasFailures && ` · ${webhook.consecutiveFailures} failures`}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {webhook.eventTypes.map((evt) => (
            <span key={evt} className="text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
              {eventLabel(evt)}
            </span>
          ))}
        </div>
      </div>

      {isAutoDisabled && webhook.disabledReason && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2 bg-destructive/5">
          <AlertTriangle className="size-3.5 text-destructive shrink-0" />
          <p className="text-xs text-destructive">{webhook.disabledReason}</p>
        </div>
      )}
    </Card>
  );
}
