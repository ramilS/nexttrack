'use client';

import { useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { Search, LogOut, User, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/shared/kbd';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ThemeSwitcher } from './theme-switcher';
import { Breadcrumbs } from './breadcrumbs';
import { TimerHeaderBadge } from '@/components/time-tracking/timer-header-badge';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { useCommandPaletteStore } from '@/lib/stores/command-palette.store';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useLogout } from '@/lib/hooks/use-auth';
import { useIsAdmin } from '@/lib/hooks/use-is-admin';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const openCommandPalette = useCommandPaletteStore((s) => s.open);
  const user = useAuthStore((s) => s.user);
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const logout = useLogout();

  return (
    <header
      className={cn(
        'flex h-14 items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-5',
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <Breadcrumbs />
        <div id="breadcrumb-actions" />
      </div>

      <div className="flex items-center gap-1.5">
        {/* Search trigger */}
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:flex gap-2 text-muted-foreground px-3 h-9"
          onClick={openCommandPalette}
        >
          <Search className="size-4" />
          <span className="text-sm">Search...</span>
          <Kbd keys={['\u2318', 'K']} />
        </Button>
        <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Open search" onClick={openCommandPalette}>
          <Search className="size-[18px]" />
        </Button>

        <TimerHeaderBadge />

        <NotificationBell />

        <ThemeSwitcher />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full ml-1" render={<Button variant="ghost" size="icon" />}>
            <UserAvatar user={{ name: user?.name ?? 'User', avatarUrl: user?.avatarUrl }} size="sm" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{user?.name ?? 'User'}</p>
              <p className="text-xs text-muted-foreground">{user?.email ?? ''}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(routes.profile)}>
              <User className="size-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => router.push(routes.admin.root)}>
                <Settings className="size-4" />
                <span>Settings</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => logout.mutate(undefined)}
            >
              <LogOut className="size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
