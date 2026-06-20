'use client';

import { PageHeader } from '@/components/shared/page-header';
import { SsoProviderList } from '@/components/admin/sso-provider-list';

export default function AdminSsoPage() {
  return (
    <div className="p-8">
      <PageHeader title="SSO Configuration" description="Manage single sign-on providers for your organization." />
      <div className="mt-6">
        <SsoProviderList />
      </div>
    </div>
  );
}
