'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { ApiKeysCard } from '@/components/api-keys/api-keys-card';

export default function ApiKeysSettingsPage() {
  const { key } = useParams<{ key: string }>();

  return (
    <div>
      <PageHeader
        title="API keys"
        description="Let external systems create issues in this project over HTTP."
      />
      <div className="mt-6">
        <ApiKeysCard projectKey={key} />
      </div>
    </div>
  );
}
