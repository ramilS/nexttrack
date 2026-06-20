'use client';

import { useState } from 'react';
import {
  Loader2,
  Send,
  Trash2,
  Pencil,
  AlertTriangle,
  CircleCheck,
  CircleX,
  MessageCircle,
} from 'lucide-react';
import { AxiosError } from 'axios';
import { AsyncContent } from '@/components/shared/async-content';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TelegramForm } from './telegram-form';
import { WEBHOOK_EVENT_TYPES } from '@/components/webhooks/webhook-event-types';
import {
  useTelegramConfig,
  useCreateTelegramConfig,
  useUpdateTelegramConfig,
  useDeleteTelegramConfig,
  useTestTelegram,
} from '@/lib/hooks/use-telegram';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { RelativeTime } from '@/components/shared/relative-time';

interface TelegramConfigProps {
  projectKey: string;
  className?: string;
}

function eventLabel(value: string): string {
  return WEBHOOK_EVENT_TYPES.find((e) => e.value === value)?.label ?? value;
}

export function TelegramConfig({ projectKey, className }: TelegramConfigProps) {
  const { data: config, isLoading, error } = useTelegramConfig(projectKey);
  const createConfig = useCreateTelegramConfig(projectKey);
  const updateConfig = useUpdateTelegramConfig(projectKey);
  const deleteConfig = useDeleteTelegramConfig(projectKey);
  const testTelegram = useTestTelegram(projectKey);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const is404 = (error as AxiosError | null)?.response?.status === 404;
  const hasConfig = !!config && !is404;

  return (
    <AsyncContent loading={isLoading} className="py-8">
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Telegram</h2>
        {!hasConfig && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Connect Telegram
          </Button>
        )}
      </div>

      {!hasConfig ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
          <MessageCircle className="size-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            No Telegram integration configured. Connect a bot to receive notifications.
          </p>
        </div>
      ) : (
        <Card className="gap-0 py-0">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                'flex items-center justify-center size-8 rounded-md',
                config.isEnabled && !config.disabledAt
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'bg-muted text-muted-foreground',
              )}>
                <MessageCircle className="size-4" />
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
                <p className="text-xs text-muted-foreground">Chat ID: {config.chatId}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => testTelegram.mutate()}
                disabled={testTelegram.isPending || !config.isEnabled}
              >
                {testTelegram.isPending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
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

      <TelegramForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => {
          createConfig.mutate(data as Parameters<typeof createConfig.mutate>[0], {
            onSuccess: () => setCreateOpen(false),
          });
        }}
        isPending={createConfig.isPending}
      />

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove Telegram integration"
        description="Notifications will stop being sent."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => deleteConfig.mutate()}
      />

      {editOpen && config && (
        <TelegramForm
          open
          onOpenChange={setEditOpen}
          onSubmit={(data) => {
            updateConfig.mutate(data, { onSuccess: () => setEditOpen(false) });
          }}
          isPending={updateConfig.isPending}
          defaultValues={{
            name: config.name,
            chatId: config.chatId,
            messageTemplate: config.messageTemplate,
            eventTypes: config.eventTypes,
            isEnabled: config.isEnabled,
            parseMode: config.parseMode,
          }}
          title="Edit Telegram Integration"
        />
      )}
    </div>
    </AsyncContent>
  );
}
