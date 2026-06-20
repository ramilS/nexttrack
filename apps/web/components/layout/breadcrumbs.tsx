'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useProject } from '@/lib/hooks/use-projects';

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  'my-issues': 'My Issues',
  notifications: 'Notifications',
  admin: 'Settings',
  profile: 'Profile',
  projects: 'Projects',
  issues: 'Issues',
  board: 'Board',
  backlog: 'Backlog',
  settings: 'Settings',
};

interface Crumb {
  label: string;
  href?: string;
  isIssueKey?: boolean;
}

function buildCrumbs(pathname: string, projectName: string | undefined): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [];

  // /dashboard, /my-issues, /notifications, /admin
  if (segments.length === 1) {
    return [{ label: ROUTE_LABELS[segments[0]!] ?? segments[0]! }];
  }

  // /projects/[key]/issues or /projects/[key]/board or /projects/[key]/issues/[number]
  if (segments[0] === 'projects' && segments.length >= 2) {
    const projectKey = segments[1]!;
    const displayName = projectName ?? projectKey;
    const crumbs: Crumb[] = [
      { label: displayName, href: `/projects/${projectKey}/issues` },
    ];

    if (segments[2]) {
      crumbs.push({
        label: ROUTE_LABELS[segments[2]] ?? segments[2],
        href: segments[3] ? `/projects/${projectKey}/${segments[2]}` : undefined,
      });
    }

    // Issue detail: /projects/[key]/issues/[number]
    if (segments[2] === 'issues' && segments[3]) {
      crumbs.push({ label: `${projectKey}-${segments[3]}`, isIssueKey: true });
    }

    return crumbs;
  }

  return segments.map((seg) => ({ label: ROUTE_LABELS[seg] ?? seg }));
}

function extractProjectKey(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'projects' && segments[1]) return segments[1];
  return '';
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const router = useRouter();
  const projectKey = extractProjectKey(pathname);
  const { data: project } = useProject(projectKey);

  const crumbs = useMemo(
    () => buildCrumbs(pathname, project?.name),
    [pathname, project?.name],
  );

  const hasIssueKey = crumbs.some((c) => c.isIssueKey);

  if (crumbs.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {hasIssueKey && (
        <Button variant="ghost" size="icon-xs" className="size-6" onClick={() => router.back()}>
          <ArrowLeft className="size-3.5" />
        </Button>
      )}
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <React.Fragment key={crumb.label}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {isLast || !crumb.href ? (
                    <BreadcrumbPage className={crumb.isIssueKey ? 'font-mono font-medium text-foreground' : undefined}>
                      {crumb.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
