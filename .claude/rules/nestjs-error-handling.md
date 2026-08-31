# Error Handling in NestJS

## Domain Errors in Services — Never HTTP Exceptions

Services, repositories, and utils throw domain errors from `@/common/errors/domain.errors`, NOT NestJS HTTP exceptions. The transport layer (controllers, guards, pipes, strategies, middleware, interceptors, filters) is the ONLY place NestJS exceptions are allowed.

### Mapping (enforced by `AllExceptionsFilter` via `DOMAIN_ERROR_STATUS`)

| Domain error | HTTP status |
|---|---|
| `ValidationError` | 400 |
| `UnauthenticatedError` | 401 |
| `PermissionDeniedError` | 403 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |

### Wrong

```typescript
// HTTP transport leaking into the domain layer
throw new NotFoundException(ErrorCode.ISSUE_NOT_FOUND);
throw new BadRequestException({ code: ErrorCode.INVALID_STATUS, message: 'Bad status' });
throw new Error('not found'); // raw Error → opaque 500
```

### Correct

```typescript
import { NotFoundError, ValidationError } from '@/common/errors/domain.errors';

throw new NotFoundError(ErrorCode.ISSUE_NOT_FOUND);
throw new ValidationError(ErrorCode.INVALID_STATUS, 'Bad status');
// structured payload for the client goes in details (3rd arg):
throw new ValidationError(ErrorCode.FIELD_REQUIRED, 'Required fields missing', { missingFields });
```

### Catching domain errors

Code that needs the error code from a caught error checks `error instanceof DomainError` and reads `error.code` — never `getResponse()` (that is HttpException API).

## Global Exception Filter

- Use `@Catch()` (no arguments) to catch ALL exceptions, not just `HttpException`
- Non-HTTP exceptions MUST return generic `500 Internal Server Error` — never expose stack traces or internal error messages to clients
- Always log the full error (message + stack) server-side for debugging
- The filter is registered in `AppModule` via an `APP_FILTER` provider (NOT `main.ts`) so every app context — production bootstrap AND the integration-test harness — gets the identical `{ error: { code, message, statusCode, requestId?, details? } }` envelope. Integration tests assert `res.body.error.code`, never flat `res.body.code`.

## Bootstrap Parity — `configureApp`

The `APP_FILTER` trick achieves parity for DI providers (they are reflected
into the test module automatically). Raw Express middleware registered with
`app.use(...)` in `main.ts` does NOT carry over to `Test.createTestingModule`,
so any middleware applied only in `main.ts` silently diverges: the integration
harness ran without it and the behavior riding on it went uncovered (e.g. the
`requestId` in the error envelope, helmet headers).

Request-pipeline middleware therefore lives in ONE shared function,
`configureApp(app)` (`@/bootstrap/configure-app`), applied by BOTH `main.ts`
and the test harness (`test/support/create-e2e-app.ts`). It currently applies
`requestIdMiddleware`, `helmet()`, `cookieParser()`.

### Wrong

```typescript
// main.ts only — the harness never sees this, tests don't exercise it
app.use(requestIdMiddleware);
app.use(helmet());
```

### Correct

```typescript
// configure-app.ts — single source of truth
export function configureApp(app: INestApplication): void {
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cookieParser());
}
// called in main.ts AND create-e2e-app.ts
```

**Deliberately NOT in `configureApp`:** `app.setGlobalPrefix('api')` and
`enableCors` (deployment-/config-dependent). The `/api` prefix is
framework-guaranteed string routing that adds no behavioral coverage in tests
but would force every supertest URL to carry it — kept prod-only by design.
When adding new request-pipeline middleware, add it to `configureApp` (not bare
`app.use` in `main.ts`) unless it is genuinely deployment-specific.

## Interpreters Fail Closed

Code that interprets stored data it did not write — a condition tree, a rule
DSL, a saved filter — must treat "I cannot read this" as **no match / no
permission / no action**, never as a pass.

`ConditionEvaluator` returned `true` for a condition whose field, operator or
operand it could not read. A workflow rule the author wrote as a narrow filter
therefore fired on every issue in the project, silently reassigning and blocking
transitions. A rule that does not fire is a visible bug someone reports; a rule
that fires on everything is not.

```typescript
// Wrong — an unreadable condition means "applies to everything"
default:
  return true;

// Correct — say what could not be read, and do not act
default:
  this.logger.warn('Workflow condition not evaluated: unsupported operator', { field, op });
  return false;
```

Distinguish *absence* from *unreadability*: an empty condition (`{}`, `null`)
legitimately expresses "no filter" and may match. A condition that expresses
something the interpreter does not implement must not.

## Error Codes

- Use `ErrorCode` constants from `@repo/shared` for business errors, never raw strings
- Do not throw raw `Error` — in services use a `DomainError` subclass; in the transport layer use NestJS built-in exceptions

## Test Mocks

- All mock methods for async service dependencies MUST use `.mockResolvedValue()` or `.mockRejectedValue()`, not `.mockReturnValue()` or bare `jest.fn()`
- This prevents `TypeError: Cannot read properties of undefined (reading 'catch')` when production code chains `.catch()` on the returned promise
