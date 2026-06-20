'use client';

import { useState } from 'react';
import { Loader2, Eye, EyeOff, ChevronDown } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WEBHOOK_EVENT_TYPES } from '@/components/webhooks/webhook-event-types';
import { cn } from '@/lib/utils';
import { TELEGRAM_PARSE_MODES } from '@repo/shared/schemas';
import type { TelegramParseMode } from '@repo/shared/schemas';

function isParseMode(v: string): v is TelegramParseMode {
  return (TELEGRAM_PARSE_MODES as readonly string[]).includes(v);
}

const TEMPLATE_VARIABLES: Record<string, { variables: string[]; defaultTemplate: string }> = {
  ISSUE_ASSIGNED: {
    variables: ['issueKey', 'issueTitle', 'assigneeName', 'actorName', 'projectName'],
    defaultTemplate: '<b>{{issueKey}}</b> assigned to {{assigneeName}}\\n{{issueTitle}}',
  },
  STATUS_CHANGE: {
    variables: ['issueKey', 'issueTitle', 'statusName', 'actorName', 'projectName'],
    defaultTemplate: '<b>{{issueKey}}</b> status changed to <b>{{statusName}}</b>\\n{{issueTitle}}',
  },
  COMMENT_ADD: {
    variables: ['issueKey', 'issueTitle', 'preview', 'actorName', 'projectName'],
    defaultTemplate: '<b>{{issueKey}}</b> new comment by {{actorName}}\\n{{preview}}',
  },
  ISSUE_RESOLVED: {
    variables: ['issueKey', 'issueTitle', 'actorName', 'projectName'],
    defaultTemplate: '✅ <b>{{issueKey}}</b> resolved by {{actorName}}\\n{{issueTitle}}',
  },
  SPRINT_STARTED: {
    variables: ['sprintName', 'projectName'],
    defaultTemplate: '🏃 Sprint <b>{{sprintName}}</b> started in {{projectName}}',
  },
  SPRINT_CLOSED: {
    variables: ['sprintName', 'projectName'],
    defaultTemplate: '🏁 Sprint <b>{{sprintName}}</b> closed in {{projectName}}',
  },
};

function TemplateReference() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-border bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen(!open)}
      >
        Template variables reference
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2.5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Uses <span className="font-mono text-foreground/80">Handlebars</span> syntax.
            If no custom template is set, the default template is used per event type.
          </p>
          {Object.entries(TEMPLATE_VARIABLES).map(([event, info]) => {
            const label = WEBHOOK_EVENT_TYPES.find((e) => e.value === event)?.label ?? event;
            return (
              <div key={event} className="space-y-1">
                <p className="text-xs font-medium">{label}</p>
                <code className="block text-[11px] text-muted-foreground bg-muted rounded px-2 py-1 break-all">
                  {info.defaultTemplate}
                </code>
                <div className="flex flex-wrap gap-1">
                  {info.variables.map((v) => (
                    <span key={v} className="font-mono text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                      {'{{' + v + '}}'}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface TelegramFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    botToken?: string;
    chatId: string;
    messageTemplate?: string;
    eventTypes: string[];
    isEnabled: boolean;
    parseMode: TelegramParseMode;
  }) => void;
  isPending?: boolean;
  defaultValues?: {
    name: string;
    chatId: string;
    messageTemplate: string | null;
    eventTypes: string[];
    isEnabled: boolean;
    parseMode: TelegramParseMode;
  };
  title?: string;
}

export function TelegramForm({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  defaultValues,
  title = 'Connect Telegram',
}: TelegramFormProps) {
  const isEdit = !!defaultValues;
  const [name, setName] = useState(defaultValues?.name ?? '');
  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [chatId, setChatId] = useState(defaultValues?.chatId ?? '');
  const [messageTemplate, setMessageTemplate] = useState(defaultValues?.messageTemplate ?? '');
  const [parseMode, setParseMode] = useState<TelegramParseMode>(defaultValues?.parseMode ?? 'HTML');
  const [eventTypes, setEventTypes] = useState<string[]>(
    defaultValues?.eventTypes ?? WEBHOOK_EVENT_TYPES.map((e) => e.value),
  );
  const [isEnabled, setIsEnabled] = useState(defaultValues?.isEnabled ?? true);

  function toggleEvent(value: string) {
    setEventTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !chatId.trim() || eventTypes.length === 0) return;
    if (!isEdit && !botToken.trim()) return;

    const data: Parameters<typeof onSubmit>[0] = {
      name: name.trim(),
      chatId: chatId.trim(),
      eventTypes,
      isEnabled,
      parseMode,
      ...(botToken.trim() ? { botToken: botToken.trim() } : {}),
      ...(messageTemplate.trim() ? { messageTemplate: messageTemplate.trim() } : {}),
    };
    onSubmit(data);
  }

  const isValid = name.trim() && chatId.trim() && eventTypes.length > 0 && (isEdit || botToken.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tg-name">Name</Label>
            <Input
              id="tg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project notifications"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tg-token">
              Bot Token {isEdit && <span className="text-muted-foreground font-normal">(leave empty to keep current)</span>}
            </Label>
            <div className="relative">
              <Input
                id="tg-token"
                type={showToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={isEdit ? 'Enter new token...' : '123456:ABC-DEF...'}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tg-chat-id">Chat ID</Label>
            <Input
              id="tg-chat-id"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="-1001234567890"
            />
            <p className="text-xs text-muted-foreground">
              Group/channel ID. Use @userinfobot to find your chat ID.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Parse Mode</Label>
              <Select value={parseMode} onValueChange={(v: string | null) => { if (v && isParseMode(v)) setParseMode(v); }}>
                <SelectTrigger className="h-9">
                  <SelectValue>
                    {(value: string | null) => value ?? 'Select mode'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HTML" label="HTML">HTML</SelectItem>
                  <SelectItem value="Markdown" label="Markdown">Markdown</SelectItem>
                  <SelectItem value="MarkdownV2" label="MarkdownV2">MarkdownV2</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Formatting of messages. Default templates use HTML tags.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tg-template">
              Message Template <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="tg-template"
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              placeholder="Custom Handlebars template... Leave empty to use defaults."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              A single template used for all events. Leave empty to use per-event defaults below.
            </p>
            <TemplateReference />
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
