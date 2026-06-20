'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useCurrentUser } from '@/lib/hooks/use-auth';

export function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard');
    }
  }, [isLoading, user, router]);

  if (isLoading || user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
