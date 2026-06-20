import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/accept-invite', '/sso'];

// API proxy is handled by catch-all route handler: app/api/[...path]/route.ts
// This proxy only handles auth guard (page-level redirects).

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public pages — no auth required
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Auth guard — redirect to login if no token
  const accessToken =
    request.cookies.get('access_token') ?? request.cookies.get('refresh_token');

  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
