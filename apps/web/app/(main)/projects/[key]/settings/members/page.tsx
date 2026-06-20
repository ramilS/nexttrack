'use client';

import { use } from 'react';
import { MembersList } from '@/components/projects/members-list';
import { PageHeader } from '@/components/shared/page-header';
import { useProject } from '@/lib/hooks/use-projects';

export default function MembersPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const { data: project } = useProject(key);

  return (
    <div>
      <PageHeader title="Members" description="Manage project members and roles." />
      {project && <MembersList projectKey={project.key} className="mt-6" />}
    </div>
  );
}
