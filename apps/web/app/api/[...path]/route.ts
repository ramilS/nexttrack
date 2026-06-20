/**
 * Catch-all API proxy route handler.
 *
 * Forwards all /api/* requests to the NestJS backend at INTERNAL_API_URL.
 * Uses runtime env — works with dynamic ports in E2E and any deployment.
 *
 * Why not proxy.ts / middleware.ts?
 *   - proxy.ts has known bugs in standalone mode (GitHub #86122, #85243)
 *   - Route Handlers are 100% reliable for proxying client-side XHR/fetch
 */

const API_BASE = () => process.env.INTERNAL_API_URL || 'http://localhost:3001';

async function handler(request: Request) {
  const url = new URL(request.url);
  const target = `${API_BASE()}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  // Remove host header — use the target's host
  headers.delete('host');

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  // Forward body for non-GET/HEAD requests
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    // @ts-expect-error -- Required for streaming body in Node.js fetch
    init.duplex = 'half';
  }

  const response = await fetch(target, init);

  // Forward response with original headers
  const responseHeaders = new Headers(response.headers);
  // Remove transfer-encoding to avoid conflicts with Next.js response handling
  responseHeaders.delete('transfer-encoding');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
