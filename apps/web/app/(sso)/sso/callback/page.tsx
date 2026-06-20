'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth.store';
import type { CurrentUser } from '@/lib/stores/auth.store';
import { routes } from '@/lib/routes';
import { bumpTokenVersion } from '@/lib/api/client';
import { Loader2 } from 'lucide-react';

function SsoCallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const code = searchParams.get('code');

    if (!code) {
      router.push(routes.login({ error: 'sso_missing_code' }));
      return;
    }

    apiClient
      .post<{ user: CurrentUser }>('/auth/sso/finalize', { code })
      .then(({ data }) => {
        bumpTokenVersion();
        setUser(data.user);
        router.push(routes.dashboard);
      })
      .catch((err) => {
        console.error('[SSO] Callback failed:', err);
        router.push(routes.login({ error: 'sso_failed' }));
      });
  }, [searchParams, router, setUser]);

  return (
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Signing you in...</p>
    </div>
  );
}

export default function SsoCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <SsoCallbackHandler />
    </Suspense>
  );
}
