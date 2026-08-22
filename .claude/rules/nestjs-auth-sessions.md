# Authentication & Session Management

## Token Storage Model

- Access + refresh tokens are delivered **only** via httpOnly cookies — set by `AuthCookieService.setTokens(res, ...)`.
- Never return `accessToken` in JSON response bodies. Login/refresh/SSO/accept-invite return `{ user }` only.
- Frontend reads no token from JS; axios sends cookies automatically with `withCredentials: true`.
- `clearCookie` MUST be called with the same `secure`/`sameSite`/`path` attributes as `setCookie` — minus `maxAge`. Browsers reject mismatched clears.

## Refresh Token Hashing

- Stored in DB as **SHA-256 hex** of the raw token (NOT bcrypt). 64-byte random tokens already have enough entropy that slow hashing buys nothing.
- Lookup is O(1) via composite index `RefreshToken(userId, token)`.
- bcrypt is reserved for passwords (low-entropy user input) only.

## Rotation & Reuse Detection

- Every successful `/auth/refresh` revokes the old token and issues a new pair.
- If a client presents a token whose `revokedAt` is already set → treat as **reuse** → call `logoutAll(userId)` and log a warning. This is the RFC 6819 mitigation for stolen-cookie scenarios.

## Logout (Frontend)

- `useLogout` MUST `await authApi.logout()` BEFORE `window.location.href = '/login'`. A bare `location.href` can abort the in-flight fetch and leave the DB token valid for up to 30 days.
- Logout publishes `'logged-out'` on `BroadcastChannel('next-track:auth')` — other tabs in `AuthSyncProvider` receive it and clear themselves.

## Cold Boot / Auth Guards

- `AuthGuard` and `GuestGuard` use `useCurrentUser` (which calls `/users/me`) as the source of truth. Never trust persisted state in localStorage to decide auth.
- The `useAuthStore` is NOT `persist`ed — it's seeded by `useCurrentUser` on mount and cleared by interceptor on refresh failure.
- Axios 401 interceptor: on `/auth/refresh` failure → `useAuthStore.getState().logout()` + redirect IF not already on `/login` (prevents the reload-loop bug).
- The `/auth/refresh` endpoint must be excluded from the 401-refresh-retry cycle in the interceptor, or you get infinite refresh attempts on permanent auth failure.

## WebSocket Auth

- Socket handshake uses the same httpOnly cookie via `withCredentials: true`.
- After a successful refresh, `client.ts` dispatches `window.dispatchEvent(new CustomEvent('auth:token-refreshed'))`. `SocketProvider` listens → `s.disconnect(); s.connect()` so the new cookie is sent on the next handshake.
- **A valid signature is NOT sufficient.** `handleConnection` must verify the user still exists (not soft-deleted) and is not blocked — use `UsersReader.findActiveForJwt(sub)` + `isBlocked`, exactly like the HTTP `JwtStrategy`. A bare `jwtService.verify()` lets a blocked/deleted user with a live access token hold a socket.
- **Room-scoped events must check access, not just authentication.** `join:issue` AND `typing:start`/`typing:stop` (and any future issue-room event) must assert the user can access the issue's project via a shared `assertIssueAccess(client, issueId)` — otherwise any authenticated user who knows an `issueId` can emit into that room.
- **The WS access check MUST bypass global admins**, mirroring the HTTP `PermissionGuard` (`role === GlobalRole.ADMIN`). A bare membership check is *stricter* than HTTP and will wrongly block admins (who are not project members) from issue rooms / typing. Capture `isAdmin` on the socket at connect and short-circuit the membership lookup.
- **Set `client.userId` synchronously BEFORE any `await` in `handleConnection`** (and register presence before the async user lookup). Socket.IO processes client messages concurrently with an async `handleConnection`, so any `await` before `userId` is set lets a racing message run with `userId === undefined` (→ `isMember(undefined,…)` → Prisma 500), and a late `setOnline` can land after a fast disconnect's `setOffline` (stuck-online). Do the active/blocked validation after, disconnecting if it fails.

## Refresh / token state checks

- `refreshTokens` and the refresh-equivalent SSO/cookie flows MUST reject soft-deleted users (`user.deletedAt`), not only `isBlocked` — mirror `login` and `JwtStrategy`. Don't rely on every delete path remembering to revoke refresh tokens.

## API Key Authentication (Machine Callers)

Machine callers present a project API key via the `X-Api-Key` header instead of
the JWT cookie pair. `ApiKeyAuthService.authenticate` (`modules/api-keys/`)
resolves it to the key's backing `User` (`kind: SERVICE`) and populates
`req.user`/`req.apiKeyId` exactly like `JwtStrategy` does for a human session,
so every downstream guard (`PermissionGuard` included) is unchanged.

- **One error code for every failure mode** — missing key, unknown hash,
  revoked, expired, or a principal that is blocked/soft-deleted all throw
  `UnauthorizedException(ErrorCode.API_KEY_INVALID)`. Distinct codes per
  failure would let an attacker binary-search a guessed key into existence;
  don't add finer-grained codes here.
- **`SERVICE` principals cannot authenticate with a password.** `AuthService.login`
  rejects `user.kind === UserKind.SERVICE` outright — a service account has no
  password hash to check, and API-key auth is its only entry point.
- **`lastUsedAt` is throttled, not written on every request.** A hit only
  updates the column when the existing value is `null` or is more than 60s
  old (`LAST_USED_THROTTLE_MS`), and the write itself goes through
  `BackgroundTasks.run` (fire-and-forget, drainable on shutdown) rather than
  blocking the request — a busy integration would otherwise turn every call
  into a synchronous `UPDATE` against a single row.

## Rate Limiting

- `/auth/login` — 5 attempts / 5 min per IP
- `/auth/refresh`, `/auth/invite/validate` — 10 / 60s per IP
- `/auth/invite/accept` — 5 / 5min per IP
- Default short bucket (3 req/sec) does NOT apply to these — `@Throttle` per endpoint overrides it.
