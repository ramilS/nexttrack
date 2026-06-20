'use client';

import { use } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListChecks, Columns3, CalendarRange, GanttChart, Clock, BookOpen, Settings } from 'lucide-react';
import { useProject } from '@/lib/hooks/use-projects';
import { ProjectContext } from '@/lib/contexts/project.context';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PROJECT_TABS = [
  { label: 'Issues', suffix: 'issues', icon: ListChecks },
  { label: 'Board', suffix: 'board', icon: Columns3 },
  { label: 'Backlog', suffix: 'backlog', icon: CalendarRange },
  { label: 'Gantt', suffix: 'gantt', icon: GanttChart },
  { label: 'Time', suffix: 'time-report', icon: Clock },
  { label: 'Docs', suffix: 'knowledge-base', icon: BookOpen },
  { label: 'Settings', suffix: 'settings', icon: Settings },
];

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  const { data: project, isLoading } = useProject(key);
  const pathname = usePathname();

  if (isLoading) {
    return (
      <div className="space-y-4 p-8">
        <div className="flex items-center gap-3">
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="text-base font-medium">Project not found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Project with key &quot;{key}&quot; does not exist.
        </p>
      </div>
    );
  }

  const base = `/projects/${key}`;

  return (
    <ProjectContext.Provider value={project}>
      {/* Sub-navigation */}
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="px-6">
          <nav className={cn('flex gap-1 -mb-px')}>
            {PROJECT_TABS.map((tab) => {
              const href = `${base}/${tab.suffix}`;
              const isActive = tab.suffix === 'settings'
                ? pathname.startsWith(href)
                : pathname === href || pathname.startsWith(`${href}/`);

              return (
                <Link
                  key={tab.suffix}
                  href={href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  <tab.icon className="size-3.5" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {children}
    </ProjectContext.Provider>
  );
}
