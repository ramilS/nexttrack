import { use } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { TagManager } from '@/components/tags/tag-manager';

export default function TagsSettingsPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);

  return (
    <div>
      <PageHeader title="Tags" description="Create and manage tags for organizing issues." />
      <TagManager projectKey={key} className="mt-6" />
    </div>
  );
}
