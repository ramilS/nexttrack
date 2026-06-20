import { use } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { VersionList } from '@/components/versions/version-list';

export default function VersionsSettingsPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);

  return (
    <div>
      <PageHeader title="Versions" description="Manage project versions and releases." />
      <VersionList projectKey={key} className="mt-6" />
    </div>
  );
}
