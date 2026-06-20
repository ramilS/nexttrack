'use client';

import { Suspense, useState } from 'react';
import { AxiosError } from 'axios';
import { useLogin, useAuthMethods } from '@/lib/hooks/use-auth';
import { authApi, type SsoProviderInfo } from '@/lib/api/auth.api';

function loginErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    if (status === 401) return 'Invalid email or password. Please try again.';
    if (status === 403) {
      const code = (error.response?.data as { error?: { code?: string } } | undefined)
        ?.error?.code;
      if (code === 'USER_BLOCKED') return 'Your account has been blocked.';
      if (code === 'USER_DELETED') return 'This account no longer exists.';
      return 'Access denied.';
    }
    if (status === 429) return 'Too many login attempts. Please wait a few minutes.';
    if (status === 400) return 'Please check the email and password fields.';
    if (!error.response) return 'Cannot reach the server. Check your connection.';
  }
  return 'Something went wrong. Please try again.';
}
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853" />
      <path d="M5.84 14.09A6.68 6.68 0 0 1 5.5 12c0-.72.13-1.43.34-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 5.07l3.66-2.98Z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

const SSO_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  GOOGLE: GoogleIcon,
  MICROSOFT: MicrosoftIcon,
};

function SsoButton({ provider }: { provider: SsoProviderInfo }) {
  const Icon = SSO_ICON_MAP[provider.type];
  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={() => {
        window.location.href = authApi.ssoRedirect(provider.id);
      }}
    >
      {Icon ? (
        <Icon className="size-4 mr-1.5" />
      ) : (
        <span className="mr-1.5 font-bold text-xs">{provider.type[0]}</span>
      )}
      {provider.name}
    </Button>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const { data: authMethods, isLoading } = useAuthMethods();

  const localEnabled = authMethods?.local.enabled ?? true;
  const ssoProviders = authMethods?.sso ?? [];
  const hasSso = ssoProviders.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate({ email, password });
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
          <CardTitle className="text-lg">Sign in to your account</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {localEnabled && (
                <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>

                  {login.error && (
                    <p role="alert" className="text-sm text-destructive">
                      {loginErrorMessage(login.error)}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={login.isPending}
                  >
                    {login.isPending && <Loader2 className="size-4 animate-spin" />}
                    Sign In
                  </Button>
                </form>
              )}

              {localEnabled && hasSso && (
                <div className="relative my-6">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
                    or continue with
                  </span>
                </div>
              )}

              {hasSso && (
                <div className={ssoProviders.length === 1 ? '' : 'grid grid-cols-2 gap-3'}>
                  {ssoProviders.map((provider) => (
                    <SsoButton key={provider.id} provider={provider} />
                  ))}
                </div>
              )}

              {!localEnabled && !hasSso && (
                <p className="text-sm text-muted-foreground text-center">
                  No authentication methods are configured. Contact your administrator.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-sm rounded-xl" />}>
      <LoginForm />
    </Suspense>
  );
}
