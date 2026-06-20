'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  useSsoProviders,
  useToggleSsoProvider,
  useDeleteSsoProvider,
} from '@/lib/hooks/use-sso-admin';
import type { SsoProvider } from '@/lib/api/sso-admin.api';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { SsoProviderForm } from './sso-provider-form';
import { MoreHorizontal, Pencil, Trash2, Plus, Shield, Users } from 'lucide-react';

const PROVIDER_TYPE_LABELS: Record<string, string> = {
  GOOGLE: 'Google',
  MICROSOFT: 'Microsoft',
  OKTA: 'Okta',
  SAML: 'SAML',
};

export function SsoProviderList() {
  const { data: providers, isLoading } = useSsoProviders();
  const [formOpen, setFormOpen] = useState(false);
  const [editProvider, setEditProvider] = useState<SsoProvider | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="gap-0 py-0">
            <div className="flex items-center gap-3 px-4 py-4">
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-60" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          Add Provider
        </Button>
      </div>

      {!providers?.length ? (
        <Card>
          <CardContent className="text-center py-12">
            <Shield className="size-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No SSO providers configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a provider to enable single sign-on for your organization.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onEdit={() => { setEditProvider(provider); setFormOpen(true); }}
            />
          ))}
        </div>
      )}

      <SsoProviderForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditProvider(null);
        }}
        provider={editProvider}
      />
    </div>
  );
}

function ProviderCard({ provider, onEdit }: { provider: SsoProvider; onEdit: () => void }) {
  const toggleProvider = useToggleSsoProvider();
  const deleteProvider = useDeleteSsoProvider();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <Card className="gap-0 py-0 overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-sm font-bold">
          {PROVIDER_TYPE_LABELS[provider.type]?.[0] ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{provider.name}</span>
            <Badge variant="outline" className="text-[10px]">
              {PROVIDER_TYPE_LABELS[provider.type] ?? provider.type}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground">
              Domain: {provider.allowedDomain}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="size-3" />
              {provider.connectionsCount} connections
            </span>
            <span className="text-xs text-muted-foreground">
              {provider.provisioningPolicy === 'AUTO_PROVISION' ? 'Auto-provision' : 'Invite only'}
            </span>
          </div>
        </div>

        <Switch
          checked={provider.isEnabled}
          onCheckedChange={(enabled) =>
            toggleProvider.mutate({ id: provider.id, enabled })
          }
        />

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label="Provider actions" />}>
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${provider.name}"`}
        description="All connected users will lose SSO access."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteProvider.mutate(provider.id)}
      />
    </Card>
  );
}
