'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Shield, Settings, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth.store';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Roles', href: '/admin/roles', icon: KeyRound },
  { label: 'SSO Providers', href: '/admin/sso', icon: Shield },
  { label: 'System', href: '/admin/system', icon: Settings },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  if (user && user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-full">
      <nav className="w-56 border-r border-border p-4 space-y-1 shrink-0">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-3">
          Administration
        </h2>
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
