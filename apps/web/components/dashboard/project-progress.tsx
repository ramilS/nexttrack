'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { ColorDot } from '@/components/shared/color-dot';
import { routes } from '@/lib/routes';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjects } from '@/lib/hooks/use-projects';

export function ProjectProgress() {
  const { data: projectsData, isLoading } = useProjects();
  const projects = projectsData?.items ?? [];

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Projects</h2>
      <Card className="gap-0 py-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No projects yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {projects.map((project) => (
              <ProjectRow key={project.key} project={project} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ProjectRow({ project }: { project: { key: string; name: string; color: string } }) {
  return (
    <Link
      href={routes.project(project.key).issues.list}
      className="flex items-center justify-between px-4 py-3.5 hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-center gap-2">
        <ColorDot color={project.color} size="sm" />
        <span className="text-sm font-medium">{project.name}</span>
      </div>
    </Link>
  );
}
