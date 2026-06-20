'use client';

import { useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { routes } from '@/lib/routes';
import { useCurrentUser } from '@/lib/hooks/use-auth';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: user, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (isLoading) return;
    if (isError || !user) {
      const query = searchParams.toString();
      const redirect = query ? `${pathname}?${query}` : pathname;
      router.replace(routes.login({ redirect }));
    }
  }, [isLoading, isError, user, router, pathname, searchParams]);

  if (isLoading || isError || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
