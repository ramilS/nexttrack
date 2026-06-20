'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserAvatar } from '@/components/shared/user-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useUsers,
  useBlockUser,
  useUnblockUser,
  useDeleteUser,
  useRestoreUser,
} from '@/lib/hooks/use-users';
import type { User } from '@/lib/api/users.api';
import { isAdminRole } from '@/lib/auth/roles';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { InviteUserDialog } from './invite-user-dialog';
import { InviteList } from './invite-list';
import { BlockUserDialog } from './block-user-dialog';
import {
  Search,
  MoreHorizontal,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  RotateCcw,
  UserPlus,
  Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDebounce } from '@/lib/hooks/use-debounce';

type UserStatus = 'active' | 'blocked' | 'deleted';

export function UserList() {
  const [tab, setTab] = useState<'users' | 'invites'>('users');
  const [status, setStatus] = useState<UserStatus>('active');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useUsers({
    page,
    perPage: 20,
    search: debouncedSearch || undefined,
    status,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'users' | 'invites')}>
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="invites">Invites</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" />
          Invite User
        </Button>
      </div>

      {tab === 'users' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Tabs value={status} onValueChange={(v) => { setStatus(v as UserStatus); setPage(1); }}>
              <TabsList>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="blocked">Blocked</TabsTrigger>
                <TabsTrigger value="deleted">Deleted</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {isLoading ? (
            <Card className="gap-0 py-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-60" />
                  </div>
                </div>
              ))}
            </Card>
          ) : !data?.items.length ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-sm text-muted-foreground">No users found.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="gap-0 py-0 overflow-hidden">
                {data.items.map((user) => (
                  <UserRow key={user.id} user={user} />
                ))}
              </Card>

              {data.meta.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {data.meta.total} users total
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= data.meta.totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <InviteList />
      )}

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function UserRow({ user }: { user: User }) {
  const router = useRouter();
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const deleteUser = useDeleteUser();
  const restoreUser = useRestoreUser();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const isPending = blockUser.isPending || unblockUser.isPending || deleteUser.isPending || restoreUser.isPending;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/50 cursor-pointer"
      onClick={() => router.push(`/admin/users/${user.id}`)}
    >
      <UserAvatar user={user} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{user.name}</span>
          {isAdminRole(user.role) && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Admin</Badge>
          )}
          {user.isBlocked && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Blocked</Badge>
          )}
          {user.deletedAt && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Deleted</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        Joined {new Date(user.createdAt).toLocaleDateString()}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label="User actions" onClick={(e: React.MouseEvent) => e.stopPropagation()} />}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!user.isBlocked && !user.deletedAt && (
            <DropdownMenuItem onClick={() => setBlockOpen(true)}>
              <ShieldAlert className="size-4" />
              Block User
            </DropdownMenuItem>
          )}
          {user.isBlocked && (
            <DropdownMenuItem onClick={() => unblockUser.mutate(user.id)}>
              <ShieldCheck className="size-4" />
              Unblock User
            </DropdownMenuItem>
          )}
          {user.deletedAt ? (
            <DropdownMenuItem onClick={() => restoreUser.mutate(user.id)}>
              <RotateCcw className="size-4" />
              Restore User
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                Delete User
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${user.name}`}
        description="This action can be reversed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteUser.mutate(user.id)}
      />

      <BlockUserDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        userName={user.name}
        onConfirm={(reason) => {
          blockUser.mutate({ userId: user.id, reason: reason || undefined });
        }}
        isPending={blockUser.isPending}
      />
    </div>
  );
}
