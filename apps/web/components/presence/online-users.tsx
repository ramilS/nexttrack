'use client';

import { UserAvatar } from '@/components/shared/user-avatar';
import { PresenceDot } from './presence-dot';
import { usePresence } from '@/lib/hooks/use-presence';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface OnlineUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface OnlineUsersProps {
  users: OnlineUser[];
  label?: string;
}

export function OnlineUsers({ users, label = 'Currently viewing' }: OnlineUsersProps) {
  const { isOnline } = usePresence(users.map((u) => u.id));

  const online = users.filter((u) => isOnline(u.id));
  if (online.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        {online.map((user) => (
          <Tooltip key={user.id}>
            <TooltipTrigger render={<span />}>
              <div className="relative">
                <UserAvatar user={user} size="sm" className="size-6" />
                <PresenceDot online className="absolute -bottom-0.5 -right-0.5 ring-1 ring-background" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              {user.name}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
