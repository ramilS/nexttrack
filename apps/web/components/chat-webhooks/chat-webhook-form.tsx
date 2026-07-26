'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { WEBHOOK_NAME_MAX, type WebhookEventType } from '@repo/shared/schemas';
import { WEBHOOK_EVENT_TYPES } from '@/components/webhooks/webhook-event-types';
import type { ChatWebhookProviderMeta } from './chat-webhook-provider-meta';

interface ChatWebhookFormSubmitData {
  name: string;
  url: string;
  eventTypes: WebhookEventType[];
  isEnabled: boolean;
}

interface ChatWebhookFormProps {
  meta: ChatWebhookProviderMeta;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ChatWebhookFormSubmitData) => void;
  isPending?: boolean;
  defaultValues?: ChatWebhookFormSubmitData;
}

export function ChatWebhookForm({
  meta,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  defaultValues,
}: ChatWebhookFormProps) {
  const isEdit = !!defaultValues;
  const [name, setName] = useState(defaultValues?.name ?? meta.label);
  const [url, setUrl] = useState(defaultValues?.url ?? '');
  const [eventTypes, setEventTypes] = useState<WebhookEventType[]>(
    defaultValues?.eventTypes ?? WEBHOOK_EVENT_TYPES.map((e) => e.value),
  );
  const [isEnabled, setIsEnabled] = useState(defaultValues?.isEnabled ?? true);

  function toggleEvent(value: WebhookEventType) {
    setEventTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim() || eventTypes.length === 0) return;
    onSubmit({ name: name.trim(), url: url.trim(), eventTypes, isEnabled });
  }

  const isValid =
    name.trim().length > 0 &&
    name.trim().length <= WEBHOOK_NAME_MAX &&
    url.trim().length > 0 &&
    eventTypes.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${meta.label}` : `Connect ${meta.label}`}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chat-webhook-name">Name</Label>
            <Input
              id="chat-webhook-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chat-webhook-url">Webhook URL</Label>
            <Input
              id="chat-webhook-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={meta.urlPlaceholder}
            />
            <p className="text-xs text-muted-foreground">
              Paste the incoming webhook URL from {meta.label}.{' '}
              <a href={meta.helpUrl} target="_blank" rel="noreferrer" className="underline">
                How do I get one?
              </a>
            </p>
          </div>

          <div className="space-y-2">
            <Label>Events</Label>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENT_TYPES.map((evt) => (
                <label
                  key={evt.value}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={eventTypes.includes(evt.value)}
                    onCheckedChange={() => toggleEvent(evt.value)}
                  />
                  {evt.label}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isEnabled} onCheckedChange={() => setIsEnabled(!isEnabled)} />
            Active
          </label>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? 'Save' : 'Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
