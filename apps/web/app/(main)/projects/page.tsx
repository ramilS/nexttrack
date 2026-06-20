'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { ProjectCreateDialog } from '@/components/projects/project-create-dialog';
import { useIsAdmin } from '@/lib/hooks/use-is-admin';

export default function ProjectsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const isAdmin = useIsAdmin();

  return (
    <div className="p-8">
      <PageHeader
        title="Projects"
        description="Manage your projects and teams."
        actions={
          isAdmin ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New Project
            </Button>
          ) : undefined
        }
      />

      <ProjectList className="mt-6" />

      {isAdmin && (
        <ProjectCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
    </div>
  );
}
