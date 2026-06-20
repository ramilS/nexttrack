'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RelativeTime } from '@/components/shared/relative-time';
import { routes } from '@/lib/routes';
import { Archive, MoreVertical, Settings, Trash2, Loader2, RotateCcw } from 'lucide-react';
import { useProjects } from '@/lib/hooks/use-projects';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ColorDot } from '@/components/shared/color-dot';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';

interface ProjectListProps {
  className?: string;
}

export function ProjectList({ className }: ProjectListProps) {
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useProjects({
    search: debouncedSearch || undefined,
    isArchived: includeArchived || undefined,
  });

  const projects = data?.items ?? [];

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm h-9"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="show-archived"
            checked={includeArchived}
            onCheckedChange={setIncludeArchived}
          />
          <Label htmlFor="show-archived" className="text-xs text-muted-foreground">
            Show archived
          </Label>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <EmptyState
          title="No projects found"
          description={search ? 'Try adjusting your search.' : 'Create your first project to get started.'}
        />
      )}

      {!isLoading && projects.length > 0 && (
        <Card className="gap-0 py-0 overflow-hidden">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={routes.project(project.key).issues.list}
              className={cn(
                'flex items-center gap-4 border-b border-border last:border-b-0 px-5 py-4 transition-colors hover:bg-accent/50',
                project.isArchived && 'opacity-50',
              )}
            >
              <ColorDot color={project.color} size="md" />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{project.key}</span>
                  <span className="text-sm font-medium truncate">{project.name}</span>
                  {project.isArchived && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      Archived
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span>{project.membersCount} members</span>
                  <span>&middot;</span>
                  <span>Updated <RelativeTime date={project.updatedAt} /></span>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon-xs" className="size-7 shrink-0" />}
                  onClick={(e: React.MouseEvent) => e.preventDefault()}
                >
                  <MoreVertical className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Settings className="size-3.5" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    {project.isArchived ? (
                      <>
                        <RotateCcw className="size-3.5" />
                        Restore
                      </>
                    ) : (
                      <>
                        <Archive className="size-3.5" />
                        Archive
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="size-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
