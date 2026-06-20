'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useSsoConnections, useDisconnectSso } from '@/lib/hooks/use-sso-connections';
import { useAuthMethods } from '@/lib/hooks/use-auth';
import type { UserSsoConnection } from '@/lib/api/sso-admin.api';
import { LinkIcon, Unlink, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

const PROVIDER_ICONS: Record<string, string> = {
  GOOGLE: 'G',
  MICROSOFT: 'M',
  OKTA: 'O',
  SAML: 'S',
};

export function ConnectedAccounts() {
  const { data: connections, isLoading } = useSsoConnections();
  const { data: authMethods } = useAuthMethods();

  const availableProviders = authMethods?.sso ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const connectedProviderIds = new Set(connections?.map((c) => c.provider.id) ?? []);
  const unconnectedProviders = availableProviders.filter((p) => !connectedProviderIds.has(p.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>Link your SSO accounts for single sign-on.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connections?.map((conn) => (
          <ConnectionRow key={conn.id} connection={conn} />
        ))}

        {unconnectedProviders.map((provider) => (
          <div
            key={provider.id}
            className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3"
          >
            <div className="flex size-8 items-center justify-center rounded bg-muted text-xs font-bold">
              {PROVIDER_ICONS[provider.type] ?? '?'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{provider.name}</p>
              <p className="text-xs text-muted-foreground">Not connected</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = `/api/auth/sso/${provider.id}/authorize?redirectTo=${encodeURIComponent(window.location.pathname)}`;
              }}
            >
              <LinkIcon className="size-3.5" />
              Connect
            </Button>
          </div>
        ))}

        {!connections?.length && !unconnectedProviders.length && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No SSO providers available.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectionRow({ connection }: { connection: UserSsoConnection }) {
  const disconnect = useDisconnectSso();
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <div className="flex size-8 items-center justify-center rounded bg-muted text-xs font-bold">
        {PROVIDER_ICONS[connection.provider.type] ?? '?'}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{connection.provider.name}</p>
          <Badge variant="outline" className="text-[10px]">Connected</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Connected {new Date(connection.createdAt).toLocaleDateString()}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        onClick={() => setDisconnectOpen(true)}
        disabled={disconnect.isPending}
      >
        {disconnect.isPending
          ? <Loader2 className="size-3.5 animate-spin" />
          : <Unlink className="size-3.5" />}
        Disconnect
      </Button>
      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title={`Disconnect ${connection.provider.name}`}
        description="You will no longer be able to sign in with it."
        confirmLabel="Disconnect"
        variant="danger"
        onConfirm={() => disconnect.mutate(connection.provider.id)}
      />
    </div>
  );
}
