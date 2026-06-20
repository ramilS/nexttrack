'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useCreateSsoProvider, useUpdateSsoProvider } from '@/lib/hooks/use-sso-admin';
import type { SsoProvider, SsoProviderType, ProvisioningPolicy } from '@/lib/api/sso-admin.api';
import { Loader2 } from 'lucide-react';

interface SsoProviderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: SsoProvider | null;
}

export function SsoProviderForm({ open, onOpenChange, provider }: SsoProviderFormProps) {
  const isEdit = !!provider;

  const [name, setName] = useState('');
  const [type, setType] = useState<SsoProviderType>('GOOGLE');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [allowedDomain, setAllowedDomain] = useState('');
  const [provisioningPolicy, setProvisioningPolicy] = useState<ProvisioningPolicy>('INVITE_ONLY');

  const createProvider = useCreateSsoProvider();
  const updateProvider = useUpdateSsoProvider();

  useEffect(() => {
    if (provider) {
      setName(provider.name);
      setType(provider.type);
      setClientId(provider.clientId);
      setClientSecret('');
      setAllowedDomain(provider.allowedDomain);
      setProvisioningPolicy(provider.provisioningPolicy);
    } else {
      setName('');
      setType('GOOGLE');
      setClientId('');
      setClientSecret('');
      setAllowedDomain('');
      setProvisioningPolicy('INVITE_ONLY');
    }
  }, [provider, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEdit) {
      updateProvider.mutate({
        id: provider.id,
        data: {
          name,
          clientId,
          ...(clientSecret ? { clientSecret } : {}),
          allowedDomain,
          provisioningPolicy,
        },
      }, {
        onSuccess: () => onOpenChange(false),
      });
    } else {
      createProvider.mutate({
        name,
        type,
        clientId,
        clientSecret,
        allowedDomain,
        provisioningPolicy,
      }, {
        onSuccess: () => onOpenChange(false),
      });
    }
  }

  const isPending = createProvider.isPending || updateProvider.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit SSO Provider' : 'Add SSO Provider'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the SSO provider configuration.'
              : 'Configure a new single sign-on provider.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sso-name">Name</Label>
              <Input
                id="sso-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Google Workspace"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sso-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as SsoProviderType)} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue>
                    {(value: string | null) => {
                      const labels: Record<string, string> = { GOOGLE: 'Google', MICROSOFT: 'Microsoft', OKTA: 'Okta', SAML: 'SAML' };
                      return labels[value ?? ''] ?? 'Select type';
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GOOGLE" label="Google">Google</SelectItem>
                  <SelectItem value="MICROSOFT" label="Microsoft">Microsoft</SelectItem>
                  <SelectItem value="OKTA" label="Okta">Okta</SelectItem>
                  <SelectItem value="SAML" label="SAML">SAML</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sso-client-id">Client ID</Label>
            <Input
              id="sso-client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sso-client-secret">
              Client Secret {isEdit && <span className="text-muted-foreground">(leave empty to keep current)</span>}
            </Label>
            <Input
              id="sso-client-secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              required={!isEdit}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sso-domain">Allowed Domain</Label>
            <Input
              id="sso-domain"
              value={allowedDomain}
              onChange={(e) => setAllowedDomain(e.target.value)}
              placeholder="company.com"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provisioning Policy</Label>
              <Select
                value={provisioningPolicy}
                onValueChange={(v) => setProvisioningPolicy(v as ProvisioningPolicy)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value: string | null) => {
                      const labels: Record<string, string> = { INVITE_ONLY: 'Invite Only', AUTO_PROVISION: 'Auto-Provision' };
                      return labels[value ?? ''] ?? 'Select policy';
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INVITE_ONLY" label="Invite Only">Invite Only</SelectItem>
                  <SelectItem value="AUTO_PROVISION" label="Auto-Provision">Auto-Provision</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Role</Label>
              <p className="text-xs text-muted-foreground">
                Auto-provisioned users are always created as <strong>User</strong>.
                Promote to Admin manually after sign-in to avoid privilege escalation.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Provider'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
