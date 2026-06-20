'use client';

import { use } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { ProjectSettingsForm } from '@/components/projects/project-settings-form';
import { useProject } from '@/lib/hooks/use-projects';
import { Loader2 } from 'lucide-react';

export default function ProjectSettingsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const { data: project, isLoading } = useProject(key);

  return (
    <div>
      <PageHeader title="General Settings" description="Manage your project configuration." />
      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {project && <ProjectSettingsForm project={project} />}
    </div>
  );
}
