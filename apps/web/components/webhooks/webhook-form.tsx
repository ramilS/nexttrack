'use client';

import { useState } from 'react';
import { Loader2, Eye, EyeOff, RefreshCw, ChevronDown } from 'lucide-react';
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
import {
  WEBHOOK_SECRET_MIN,
  WEBHOOK_NAME_MAX,
  type WebhookEventType,
} from '@repo/shared/schemas';
import { WEBHOOK_EVENT_TYPES } from './webhook-event-types';
import { cn } from '@/lib/utils';

function PayloadReference() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-border bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen(!open)}
      >
        Payload format & signature verification
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2.5 space-y-3 text-xs">
          <div className="space-y-1">
            <p className="font-medium">Headers</p>
            <div className="bg-muted rounded px-2 py-1.5 font-mono text-[11px] space-y-0.5 text-muted-foreground">
              <p>Content-Type: application/json</p>
              <p>X-Event-Type: ISSUE_ASSIGNED</p>
              <p>X-Delivery-Id: {'<uuid>'}</p>
              <p>X-Timestamp: {'<unix-seconds>'}</p>
              <p>X-Signature: sha256={'<hex>'}</p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="font-medium">Payload body</p>
            <p className="text-muted-foreground">Event-specific JSON object sent as POST body.</p>
          </div>

          <div className="space-y-1">
            <p className="font-medium">Signature verification (Node.js)</p>
            <pre className="bg-muted rounded px-2 py-1.5 font-mono text-[11px] text-muted-foreground overflow-x-auto whitespace-pre">{`const crypto = require('crypto');

const timestamp = req.headers['x-timestamp'];
const signature = req.headers['x-signature'];
const body = JSON.stringify(req.body);

const expected = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(timestamp + '.' + body)
  .digest('hex');

const valid = crypto.timingSafeEqual(
  Buffer.from(signature),
  Buffer.from(expected),
);`}</pre>
          </div>

          <div className="space-y-1">
            <p className="font-medium">Retries & auto-disable</p>
            <p className="text-muted-foreground">
              Failed deliveries are retried up to 5 times with exponential backoff.
              After 10 consecutive failures the webhook is auto-disabled.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface WebhookFormSubmitData {
  name: string;
  url: string;
  secret: string;
  eventTypes: WebhookEventType[];
  isEnabled: boolean;
}

interface WebhookFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: WebhookFormSubmitData) => void;
  isPending?: boolean;
  defaultValues?: {
    name: string;
    url: string;
    eventTypes: WebhookEventType[];
    isEnabled: boolean;
  };
  title?: string;
}

function generateSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = 48;
  // Reject bytes >= floor(256 / 62) * 62 = 248 to avoid modulo bias.
  const cutoff = Math.floor(256 / chars.length) * chars.length;
  let result = '';
  const buf = new Uint8Array(1);
  while (result.length < length) {
    crypto.getRandomValues(buf);
    const byte = buf[0]!;
    if (byte < cutoff) {
      result += chars.charAt(byte % chars.length);
    }
  }
  return result;
}

export function WebhookForm({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  defaultValues,
  title = 'Create Webhook',
}: WebhookFormProps) {
  const isEdit = !!defaultValues;
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [url, setUrl] = useState(defaultValues?.url ?? '');
  const [secret, setSecret] = useState(isEdit ? '' : generateSecret());
  const [showSecret, setShowSecret] = useState(false);
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
    if (!isEdit && !secret.trim()) return;

    const data: WebhookFormSubmitData = {
      name: name.trim(),
      url: url.trim(),
      eventTypes,
      isEnabled,
      secret: secret.trim(),
    };
    onSubmit(data);
  }

  const isValid =
    name.trim().length > 0 &&
    name.trim().length <= WEBHOOK_NAME_MAX &&
    url.trim().length > 0 &&
    eventTypes.length > 0 &&
    (isEdit || secret.trim().length >= WEBHOOK_SECRET_MIN);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-name">Name</Label>
            <Input
              id="webhook-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My webhook"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-url">Payload URL</Label>
            <Input
              id="webhook-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-secret">
              Secret {isEdit && <span className="text-muted-foreground font-normal">(leave empty to keep current)</span>}
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="webhook-secret"
                  type={showSecret ? 'text' : 'password'}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={isEdit ? 'Enter new secret...' : `Min ${WEBHOOK_SECRET_MIN} characters`}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                  aria-pressed={showSecret}
                  className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
              </div>
              {!isEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setSecret(generateSecret())}
                  title="Generate new secret"
                >
                  <RefreshCw className="size-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Used to sign payloads with HMAC-SHA256. Verify the <span className="font-mono">X-Signature</span> header on your server.
            </p>
          </div>

          <PayloadReference />

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
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
