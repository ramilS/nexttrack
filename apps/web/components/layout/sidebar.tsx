'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebarStore } from '@/lib/stores/sidebar.store';
import { useKeyboardShortcut } from '@/lib/hooks/use-keyboard-shortcut';
import { useProjects } from '@/lib/hooks/use-projects';
import {
  LayoutDashboard,
  ListChecks,
  FolderKanban,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Columns3,
  CalendarRange,
  GanttChart,
  BookOpen,
  ChevronRight,
  Bell,
  BellOff,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ColorDot } from '@/components/shared/color-dot';
import { ProjectCreateDialog } from '@/components/projects/project-create-dialog';
import { useMuteProject } from '@/lib/hooks/use-mute-notifications';
import { useAuthStore } from '@/lib/stores/auth.store';
import { routes } from '@/lib/routes';

interface SidebarProps {
  className?: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: routes.dashboard, icon: LayoutDashboard },
  { label: 'My Issues', href: routes.myIssues, icon: ListChecks },
  { label: 'My Time', href: routes.myTimeReport, icon: Clock },
  { label: 'Projects', href: routes.projects, icon: FolderKanban },
];

export function Sidebar({ className }: SidebarProps) {
  const collapsed = useSidebarStore((s) => s.isCollapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  const pathname = usePathname();
  const { data: projectsData } = useProjects();
  const projects = projectsData?.items ?? [];
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  useKeyboardShortcut({ key: '\\', meta: true }, toggle);

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-sidebar transition-[width] duration-300 ease-out',
        collapsed ? 'w-14' : 'w-64',
        className
      )}
    >
      {/* Logo */}
      <div className={cn('flex h-14 items-center border-b border-border px-5', collapsed && 'justify-center px-3')}>
        <Link href={routes.dashboard} className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            NT
          </div>
          {!collapsed && <span className="text-base font-semibold tracking-tight">NextTrack</span>}
        </Link>
      </div>

      <ScrollArea className="min-h-0 flex-1 py-3">
        {/* Main nav */}
        <nav aria-label="Main navigation" className="px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              isActive={pathname.startsWith(item.href)}
              collapsed={collapsed}
            />
          ))}
        </nav>

        <Separator className="my-3 mx-3" />

        {/* Projects */}
        <div className="px-3">
          {!collapsed && (
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Projects
              </span>
              <Button variant="ghost" size="icon-xs" className="size-6" onClick={() => setCreateProjectOpen(true)}>
                <Plus className="size-3.5" />
              </Button>
            </div>
          )}
          <div className="space-y-1">
            {projects.map((project) => (
              <SidebarProjectLink
                key={project.key}
                project={project}
                isActive={pathname.includes(`/projects/${project.key}`)}
                collapsed={collapsed}
              />
            ))}
          </div>
        </div>
      </ScrollArea>

      {/* Bottom */}
      <div className="border-t border-border px-3 py-3 space-y-1">
        <AdminLink collapsed={collapsed} />
        <Button
          variant="ghost"
          size={collapsed ? 'icon-xs' : 'sm'}
          className={cn('w-full', !collapsed && 'justify-start')}
          onClick={toggle}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && <span className="ml-1 text-xs">Collapse</span>}
        </Button>
      </div>

      <ProjectCreateDialog open={createProjectOpen} onOpenChange={setCreateProjectOpen} />
    </aside>
  );
}

function SidebarLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const content = (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        collapsed && 'justify-center px-0'
      )}
    >
      <item.icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
          {item.badge}
        </span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>{content}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <span>{item.label}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span className="ml-1 text-muted-foreground">({item.badge})</span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

const PROJECT_SUB_LINKS = [
  { label: 'Issues', suffix: 'issues', icon: ListChecks },
  { label: 'Board', suffix: 'board', icon: Columns3 },
  { label: 'Backlog', suffix: 'backlog', icon: CalendarRange },
  { label: 'Gantt', suffix: 'gantt', icon: GanttChart },
  { label: 'Docs', suffix: 'knowledge-base', icon: BookOpen },
];

function SidebarProjectLink({
  project,
  isActive,
  collapsed,
}: {
  project: { id: string; key: string; name: string; color: string };
  isActive: boolean;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(isActive);
  const { isMuted, toggleMute } = useMuteProject();
  const muted = isMuted(project.id);

  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Link
            href={routes.project(project.key).issues.list}
            className={cn(
              'relative flex items-center justify-center rounded-lg py-2 text-sm transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
          >
            <ColorDot color={project.color} size="sm" />
            {muted && <BellOff className="absolute -top-0.5 -right-0.5 size-2.5 text-muted-foreground" />}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {project.name} ({project.key}){muted ? ' · Muted' : ''}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div>
      <div className="group/project flex items-center">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`project-${project.key}-sublinks`}
          className={cn(
            'flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors min-w-0',
            isActive
              ? 'text-sidebar-accent-foreground font-medium'
              : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          )}
        >
          <ChevronRight
            className={cn('size-3 shrink-0 transition-transform', expanded && 'rotate-90')}
          />
          <ColorDot color={project.color} size="sm" />
          <span className="truncate">{project.name}</span>
          {muted && <BellOff className="size-3 shrink-0 text-muted-foreground" />}
        </button>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                className="opacity-0 group-hover/project:opacity-100 transition-opacity mr-1 rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute.mutate(project.id);
                }}
              />
            }
          >
            {muted ? <BellOff className="size-3" /> : <Bell className="size-3" />}
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={4}>
            {muted ? 'Unmute notifications' : 'Mute notifications'}
          </TooltipContent>
        </Tooltip>
      </div>

      {expanded && (
        <div id={`project-${project.key}-sublinks`} className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2.5">
          {PROJECT_SUB_LINKS.map((sub) => {
            const href = `/projects/${project.key}/${sub.suffix}`;
            const active = pathname.startsWith(href);
            return (
              <Link
                key={sub.suffix}
                href={href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <sub.icon className="size-3.5 shrink-0" />
                <span>{sub.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminLink({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuthStore();
  const pathname = usePathname();

  if (user?.role !== 'ADMIN') return null;

  const isActive = pathname.startsWith('/admin');

  const content = (
    <Link
      href={routes.admin.users.list}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors w-full',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      <ShieldCheck className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">Admin</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span />}>{content}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>Admin</TooltipContent>
      </Tooltip>
    );
  }

  return content;
}
