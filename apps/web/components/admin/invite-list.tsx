'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useInvites, useResendInvite, useRevokeInvite } from '@/lib/hooks/use-users';
import { Mail, Trash2, Loader2 } from 'lucide-react';
import type { Invite } from '@/lib/api/users.api';

export function InviteList() {
  const { data, isLoading } = useInvites();

  if (isLoading) {
    return (
      <Card className="gap-0 py-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-20 ml-auto" />
          </div>
        ))}
      </Card>
    );
  }

  if (!data?.length) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-sm text-muted-foreground">No pending invites.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0 overflow-hidden">
      {data.map((invite) => (
        <InviteRow key={invite.id} invite={invite} />
      ))}
    </Card>
  );
}

function InviteRow({ invite }: { invite: Invite }) {
  const resendInvite = useResendInvite();
  const revokeInvite = useRevokeInvite();

  const isExpired = invite.status === 'EXPIRED' || new Date(invite.expiresAt) < new Date();

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{invite.email}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {invite.role}
          </Badge>
          {isExpired && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-warning">
              Expired
            </Badge>
          )}
          {invite.status === 'ACCEPTED' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-success">
              Accepted
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Invited {new Date(invite.createdAt).toLocaleDateString()}
          {invite.invitedBy && ` by ${invite.invitedBy.name}`}
        </p>
      </div>

      {invite.status === 'PENDING' && (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Resend invite"
            onClick={() => resendInvite.mutate(invite.id)}
            disabled={resendInvite.isPending}
          >
            {resendInvite.isPending
              ? <Loader2 className="size-4 animate-spin" />
              : <Mail className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive"
            aria-label="Revoke invite"
            onClick={() => revokeInvite.mutate(invite.id)}
            disabled={revokeInvite.isPending}
          >
            {revokeInvite.isPending
              ? <Loader2 className="size-4 animate-spin" />
              : <Trash2 className="size-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
