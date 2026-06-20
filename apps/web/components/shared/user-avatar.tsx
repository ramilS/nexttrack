import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/** Minimal user shape accepted by UserAvatar */
export interface AvatarUser {
  name: string | undefined | null;
  avatarUrl?: string | null;
}

interface UserAvatarProps {
  user: AvatarUser;
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xxs: 'size-4',
  xs: 'size-6',
  sm: 'size-7',
  md: 'size-9',
  lg: 'size-11',
};

function getInitials(name: string | undefined | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function UserAvatar({ user, size = 'md', className }: UserAvatarProps) {
  return (
    <Avatar
      className={cn('@container', sizeClasses[size], className)}
      aria-label={user.name ?? 'User'}
      title={user.name ?? undefined}
    >
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name ?? 'User'} />}
      <AvatarFallback className="bg-primary/10 text-primary font-medium text-[length:35cqi] leading-none">
        {getInitials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}
