'use client';

import { useState, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ProjectSearchBar } from '@/components/issues/project-search-bar';
import { IssueList } from '@/components/issues/issue-list';
import { IssueCreateDialog } from '@/components/issues/issue-create-dialog';
import { IssueListSkeleton } from '@/components/issues/issue-list-skeleton';
import { Button } from '@/components/ui/button';
import { useProject } from '@/lib/hooks/use-projects';

export default function IssuesPage() {
  const { key } = useParams<{ key: string }>();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: project } = useProject(key);

  return (
    <div className="p-8 space-y-4">
      <PageHeader
        title="Issues"
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Create Issue
          </Button>
        }
      />

      <Suspense fallback={null}>
        {project && <ProjectSearchBar projectId={project.id} />}
      </Suspense>

      <Suspense fallback={<IssueListSkeleton />}>
        <IssueList
          projectKey={key}
          onCreateIssue={() => setCreateOpen(true)}
        />
      </Suspense>

      <IssueCreateDialog
        projectKey={key}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
