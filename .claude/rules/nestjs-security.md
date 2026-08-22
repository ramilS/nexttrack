# Security Rules for NestJS API

## Never Expose Secrets in API Responses

Database records containing secrets (webhook secrets, bot tokens, API keys) MUST be sanitized before returning to clients.

### Pattern: Use `toDto` to Strip Secrets

```typescript
private toDto(webhook: any) {
  const { secret, ...rest } = webhook;
  return rest;
}
```

Apply `toDto` to ALL return paths: `findAll`, `findOne`, `create`, `update`.

### Pattern: Never Store Secrets in Outbox/Queue Payloads

Outbox event payloads are persisted in the database. Never include secrets (webhook secret, bot token) in the payload. Instead, store only the reference ID and look up the secret at delivery time.

```typescript
// Wrong — secret stored in outbox row
payload: { webhookId: wh.id, url: wh.url, secret: wh.secret }

// Correct — look up secret in processor
payload: { webhookId: wh.id, url: wh.url }
// In processor:
const wh = await this.prisma.projectWebhook.findUnique({ where: { id: webhookId }, select: { secret: true } });
```

## Outbound Requests (SSRF) — Pin the Validated IP

Server-issued HTTP requests to user-supplied URLs (webhooks) must defend against
DNS rebinding. Validating the resolved IP and then calling `fetch(url)` is NOT
enough — `fetch` re-resolves the hostname, so the validated IP and the connected
IP can differ (TOCTOU). Pin the connection to the IP you validated:

- `assertResolvedAddressIsPublic()` returns the validated address — use it, don't
  discard it.
- Pass an `undici` `Agent` with a `connect.lookup` that returns that pinned IP as
  the `fetch` `dispatcher`; the original hostname still drives the `Host` header
  and TLS SNI (keep passing the original URL to `fetch`). `undici` is a direct
  dep of `apps/api` for exactly this (`Dispatcher` typing lives on undici's
  `RequestInit`, not lib.dom — assign the init to a typed variable to pass
  `dispatcher` without `as any`).
- Keep `redirect: 'manual'` so a 3xx can't bounce the request to an internal host.

## Related Rules

- Global exception filter (generic 500, no leaked internals) → `nestjs-error-handling.md`
- Enum constants instead of string literals → `nestjs-prisma-enums.md`
- Composite auth decorators (`@ProjectAuth()`, `@RequirePermission()`) → `nestjs-permissions.md`