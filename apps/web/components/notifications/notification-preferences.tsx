'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AsyncContent } from '@/components/shared/async-content';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  useNotificationPreferences,
  useChannelOptions,
  useUpdatePreferences,
} from '@/lib/hooks/use-notifications';
import type {
  NotificationPreferences as Prefs,
  NotificationTypeMeta,
} from '@/lib/api/notifications.api';

const EMAIL_MODES = [
  { value: 'INSTANT', label: 'Instant' },
  { value: 'DIGEST', label: 'Daily digest' },
  { value: 'OFF', label: 'Off' },
];

interface PreferencesFormProps {
  prefs: Prefs;
  channelOptions: NotificationTypeMeta[];
}

function PreferencesForm({ prefs, channelOptions }: PreferencesFormProps) {
  const updatePrefs = useUpdatePreferences();

  const [emailMode, setEmailMode] = useState(prefs.emailMode);
  const [channelSettings, setChannelSettings] = useState(prefs.channelSettings ?? {});

  function toggleChannel(type: string, channel: 'inApp' | 'email') {
    setChannelSettings((prev) => {
      const current = prev[type] ?? { inApp: true, email: true };
      return { ...prev, [type]: { ...current, [channel]: !current[channel] } };
    });
  }

  function handleSave() {
    updatePrefs.mutate({ emailMode, channelSettings });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Email delivery</Label>
        <Select
          value={emailMode}
          onValueChange={(v: string | null) => {
            if (v) setEmailMode(v as Prefs['emailMode']);
          }}
        >
          <SelectTrigger className="h-9 w-48">
            <SelectValue>
              {(value: string | null) => {
                const mode = EMAIL_MODES.find((m) => m.value === value);
                return mode?.label ?? 'Select mode';
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EMAIL_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value} label={m.label}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_60px_60px] gap-2 items-center">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Notification type
          </span>
          <span className="text-xs font-medium text-muted-foreground text-center">In-App</span>
          <span className="text-xs font-medium text-muted-foreground text-center">Email</span>
        </div>

        {channelOptions.map((opt) => {
          const settings = channelSettings[opt.type] ?? { inApp: true, email: true };
          return (
            <div key={opt.type} className="grid grid-cols-[1fr_60px_60px] gap-2 items-center">
              <span className="text-sm">{opt.label}</span>
              <div className="flex justify-center">
                <Checkbox
                  checked={settings.inApp}
                  onCheckedChange={() => toggleChannel(opt.type, 'inApp')}
                />
              </div>
              <div className="flex justify-center">
                {opt.channels.includes('email') ? (
                  <Checkbox
                    checked={settings.email}
                    onCheckedChange={() => toggleChannel(opt.type, 'email')}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={updatePrefs.isPending}>
          {updatePrefs.isPending && <Loader2 className="size-4 animate-spin" />}
          Save Preferences
        </Button>
      </div>
    </div>
  );
}

export function NotificationPreferences() {
  const { data: prefs, isLoading: prefsLoading } = useNotificationPreferences();
  const { data: channelOptions, isLoading: optionsLoading } = useChannelOptions();

  return (
    <AsyncContent loading={prefsLoading || optionsLoading} data={prefs}>
      {(prefs) => (
        <PreferencesForm
          key={prefs.userId}
          prefs={prefs}
          channelOptions={channelOptions ?? []}
        />
      )}
    </AsyncContent>
  );
}
