'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AsyncContent } from '@/components/shared/async-content';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { RelativeTime } from '@/components/shared/relative-time';
import { dateInputToIsoOrUndefined } from '@/lib/dates';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/lib/hooks/use-api-keys';
import type { ApiKey } from '@repo/shared/schemas';
import { ApiKeyCreatedDialog } from './api-key-created-dialog';

function isExpired(key: ApiKey): boolean {
  return key.expiresAt !== null && new Date(key.expiresAt).getTime() <= Date.now();
}

interface ApiKeysCardProps {
  projectKey: string;
}

export function ApiKeysCard({ projectKey }: ApiKeysCardProps) {
  const { data: keys, isLoading } = useApiKeys(projectKey);
  const createApiKey = useCreateApiKey(projectKey);
  const revokeApiKey = useRevokeApiKey(projectKey);

  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [revokingKey, setRevokingKey] = useState<ApiKey | null>(null);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    createApiKey.mutate(
      { name: trimmedName, expiresAt: dateInputToIsoOrUndefined(expiresAt) },
      {
        onSuccess: () => {
          setName('');
          setExpiresAt('');
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
        <CardDescription>
          Each key authenticates as an Integration principal scoped to this project.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="api-key-name">Name</Label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CI pipeline"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="api-key-expires">Expires</Label>
            <Input
              id="api-key-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-40"
            />
          </div>
          <Button type="submit" disabled={!name.trim() || createApiKey.isPending}>
            Create key
          </Button>
        </form>
      </CardContent>

      <CardContent className="border-t border-border pt-4">
        <AsyncContent
          loading={isLoading}
          empty={!keys || keys.length === 0}
          emptyState={
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
              <KeyRound className="size-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No API keys yet.</p>
            </div>
          }
        >
          <ul className="divide-y divide-border">
            {keys?.map((key) => {
              const revoked = key.revokedAt !== null;
              const expired = !revoked && isExpired(key);

              return (
                <li key={key.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{key.name}</span>
                      {revoked && <Badge variant="destructive">Revoked</Badge>}
                      {expired && <Badge variant="secondary">Expired</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <code className="font-mono">{key.prefix}…</code>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1">
                        Created <RelativeTime date={key.createdAt} />
                      </span>
                      <span aria-hidden>·</span>
                      {key.lastUsedAt ? (
                        <span className="inline-flex items-center gap-1">
                          Last used <RelativeTime date={key.lastUsedAt} />
                        </span>
                      ) : (
                        <span>Never used</span>
                      )}
                    </div>
                  </div>
                  {!revoked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setRevokingKey(key)}
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </AsyncContent>
      </CardContent>

      <ApiKeyCreatedDialog
        apiKey={createApiKey.data ?? null}
        onOpenChange={(open) => {
          if (!open) createApiKey.reset();
        }}
      />

      <ConfirmDialog
        open={revokingKey !== null}
        onOpenChange={(open) => {
          if (!open) setRevokingKey(null);
        }}
        title={`Revoke "${revokingKey?.name}"`}
        description="Requests using this key will start failing immediately. This cannot be undone."
        confirmLabel="Yes, revoke"
        variant="danger"
        onConfirm={() => {
          if (revokingKey) revokeApiKey.mutate(revokingKey.id);
        }}
      />
    </Card>
  );
}
