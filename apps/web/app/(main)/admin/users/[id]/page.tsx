'use client';

import { useParams, useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ColorDot } from '@/components/shared/color-dot';
import { PageHeader } from '@/components/shared/page-header';
import { useUser, useUserMemberships, useAdminUpdateUser } from '@/lib/hooks/use-users';
import { isAdminRole } from '@/lib/auth/roles';
import { useRoles } from '@/lib/hooks/use-roles';
import { projectsApi } from '@/lib/api/projects.api';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useUser(id);
  const { data: memberships, isLoading: membershipsLoading } = useUserMemberships(id);
  const { data: roles } = useRoles();
  const updateUser = useAdminUpdateUser();

  const [name, setName] = useState('');
  const [pendingMembershipProjectId, setPendingMembershipProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name);
    }
  }, [user]);

  function handleSave() {
    if (!user) return;
    const data: Record<string, string> = {};
    if (name !== user.name) data.name = name;
    if (Object.keys(data).length === 0) return;
    updateUser.mutate({ userId: id, data });
  }

  async function handleMemberRoleChange(
    projectId: string,
    projectKey: string,
    userId: string,
    roleId: string,
  ) {
    setPendingMembershipProjectId(projectId);
    try {
      await projectsApi.updateMember(projectKey, userId, { roleId });
      await queryClient.invalidateQueries({ queryKey: ['admin-users', 'memberships', id] });
      toast.success('Role updated');
    } catch {
      toast.error('Failed to update role');
    } finally {
      setPendingMembershipProjectId(null);
    }
  }

  const hasChanges = user && name !== user.name;

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="space-y-4 py-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-1/3" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">User not found.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(routes.admin.users.list)}>
          <ArrowLeft className="size-4" />
        </Button>
        <PageHeader title="Edit User" />
      </div>

      {/* User info header */}
      <Card>
        <CardContent className="flex items-center gap-4 py-6">
          <UserAvatar user={user} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{user.name}</h2>
              {isAdminRole(user.role) && <Badge variant="secondary">Super Admin</Badge>}
              {user.isBlocked && <Badge variant="destructive">Blocked</Badge>}
              {user.deletedAt && <Badge variant="outline">Deleted</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </CardContent>
      </Card>

      {/* Edit form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">User Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user.email} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="User name"
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={!hasChanges || updateUser.isPending}>
              {updateUser.isPending && <Loader2 className="size-4 animate-spin" />}
              <Save className="size-4" />
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Project Memberships */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Memberships</CardTitle>
        </CardHeader>
        <CardContent>
          {membershipsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : memberships && memberships.length > 0 ? (
            <div className="space-y-0 -mx-6">
              {memberships.map((m) => (
                <div
                  key={m.project.id}
                  className="flex items-center gap-3 border-b border-border last:border-b-0 px-6 py-3"
                >
                  <ColorDot color={m.project.color} size="sm" />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={routes.project(m.project.key).issues.list}
                      className="text-sm font-medium hover:underline inline-flex items-center gap-1"
                    >
                      {m.project.name}
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </Link>
                    <p className="text-xs text-muted-foreground">{m.project.key}</p>
                  </div>
                  {m.canChangeRole ? (
                    <Select
                      value={m.role.id}
                      onValueChange={(v: string | null) => {
                        if (v) {
                          void handleMemberRoleChange(
                            m.project.id,
                            m.project.key,
                            user.id,
                            v,
                          );
                        }
                      }}
                    >
                      <SelectTrigger
                        className="h-7 w-auto text-xs"
                        aria-label={`Project role for ${m.project.name}`}
                        disabled={pendingMembershipProjectId === m.project.id}
                      >
                        <SelectValue>
                          {(value: string | null) => {
                            const role = roles?.find((r) => r.id === value);
                            return role?.name ?? 'Select role';
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {roles?.map((role) => (
                          <SelectItem key={role.id} value={role.id} label={role.name}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="text-right">
                      <Badge variant="secondary">Project Admin</Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Assign another Project Admin before changing this role.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Not a member of any project.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Meta info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Info</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Created</dt>
            <dd>{format(new Date(user.createdAt), 'PPP')}</dd>
            <dt className="text-muted-foreground">Updated</dt>
            <dd>{format(new Date(user.updatedAt), 'PPP p')}</dd>
            {user.isBlocked && user.blockReason && (
              <>
                <dt className="text-muted-foreground">Block Reason</dt>
                <dd>{user.blockReason}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
