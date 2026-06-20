'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { Settings, Tags, Columns3, Package, Users, GitBranch, Users2, UserCog, Zap, Webhook, Plug } from 'lucide-react';
import { cn } from '@/lib/utils';

const SETTINGS_NAV = [
  { label: 'General', href: '', icon: Settings },
  { label: 'Members', href: '/members', icon: Users },
  { label: 'Workflow', href: '/workflows', icon: GitBranch },
  { label: 'Tags', href: '/tags', icon: Tags },
  { label: 'Custom Fields', href: '/custom-fields', icon: Columns3 },
  { label: 'Versions', href: '/versions', icon: Package },
  { label: 'Teams', href: '/teams', icon: Users2 },
  { label: 'Auto-assign', href: '/auto-assign', icon: UserCog },
  { label: 'Automation', href: '/workflow-rules', icon: Zap },
  { label: 'Webhooks', href: '/webhooks', icon: Webhook },
  { label: 'Integrations', href: '/integrations', icon: Plug },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { key } = useParams<{ key: string }>();
  const pathname = usePathname();
  const base = `/projects/${key}/settings`;

  return (
    <div className="flex gap-8 p-8">
      <nav className="w-48 shrink-0 space-y-1">
        <h2 className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Settings
        </h2>
        {SETTINGS_NAV.map((item) => {
          const href = `${base}${item.href}`;
          const isActive = item.href === ''
            ? pathname === base || pathname === `${base}/`
            : pathname.startsWith(href);
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
