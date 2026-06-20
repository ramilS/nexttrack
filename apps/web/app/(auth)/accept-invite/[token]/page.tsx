'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { InviteInvalidReason } from '@repo/shared/schemas';
import { useAcceptInvite } from '@/lib/hooks/use-auth';
import { authApi } from '@/lib/api/auth.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';

const INVITE_ERROR_COPY: Record<
  InviteInvalidReason,
  { title: string; description: string; showLogin?: boolean }
> = {
  used: {
    title: 'Invitation already used',
    description:
      'This invitation has already been accepted. Log in with your email and password instead.',
    showLogin: true,
  },
  expired: {
    title: 'Invitation expired',
    description:
      'This invitation link has expired. Ask an admin to send you a new one.',
  },
  revoked: {
    title: 'Invitation revoked',
    description:
      'This invitation has been revoked. Contact your admin if you think this is a mistake.',
  },
  invalid: {
    title: 'Invalid invitation',
    description: 'This invitation link is invalid or no longer exists.',
  },
};

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const acceptInvite = useAcceptInvite();

  const { data: invite, isLoading, isError } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => authApi.getInvite(token).then((r) => r.data),
    retry: false,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    acceptInvite.mutate({ token, name, password });
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-sm space-y-4">
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !invite?.valid) {
    const reason: InviteInvalidReason = invite?.reason ?? 'invalid';
    const copy = INVITE_ERROR_COPY[reason];
    return (
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        {copy.showLogin && (
          <CardContent>
            <Button className="w-full" onClick={() => router.push('/login')}>
              Go to login
            </Button>
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex justify-center mb-8">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-bold">
            NT
          </div>
          <span className="text-xl font-semibold tracking-tight">NextTrack</span>
        </div>
      </div>

      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-lg">Accept Invitation</CardTitle>
          {invite.inviterName && (
            <CardDescription>
              {invite.inviterName} invited you to join NextTrack
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {acceptInvite.error && (
              <p className="text-sm text-destructive">
                Failed to accept invite. Please try again.
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={acceptInvite.isPending}
            >
              {acceptInvite.isPending && <Loader2 className="size-4 animate-spin" />}
              Join NextTrack
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
