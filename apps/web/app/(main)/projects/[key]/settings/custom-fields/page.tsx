'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { CustomFieldList } from '@/components/custom-fields/custom-field-list';

export default function CustomFieldsSettingsPage() {
  const { key } = useParams<{ key: string }>();

  return (
    <div>
      <PageHeader
        title="Custom Fields"
        description="Define additional fields to track on issues."
      />
      <CustomFieldList projectKey={key} className="mt-6" />
    </div>
  );
}
