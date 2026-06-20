'use client';

import { use } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { AiDocsSettingsForm } from '@/components/ai-docs/ai-docs-settings-form';
import { useAiDocsSettings } from '@/lib/hooks/use-ai-docs';

export default function AiDocsSettingsPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  const { data, isLoading } = useAiDocsSettings(key);

  return (
    <div>
      <PageHeader
        title="AI Docs"
        description="Customize the prompts used to draft and reconcile documentation updates."
      />
      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {data && <AiDocsSettingsForm projectKey={key} settings={data} />}
    </div>
  );
}
