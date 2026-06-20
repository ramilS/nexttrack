/**
 * Transport-agnostic domain errors. Services and repositories throw these
 * instead of NestJS HTTP exceptions; `AllExceptionsFilter` maps `kind` to an
 * HTTP status at the boundary. Controllers, guards, pipes and middleware are
 * the transport layer and may keep using NestJS exceptions.
 */
export type DomainErrorKind =
  | 'validation'
  | 'unauthenticated'
  | 'permission_denied'
  | 'not_found'
  | 'conflict';

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  constructor(
    readonly code: string,
    message?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = new.target.name;
  }
}

/** Invalid input or business-rule violation → 400. */
export class ValidationError extends DomainError {
  readonly kind = 'validation';
}

/** Missing or invalid credentials → 401. */
export class UnauthenticatedError extends DomainError {
  readonly kind = 'unauthenticated';
}

/** Authenticated but not allowed → 403. */
export class PermissionDeniedError extends DomainError {
  readonly kind = 'permission_denied';
}

/** Aggregate or sub-resource does not exist → 404. */
export class NotFoundError extends DomainError {
  readonly kind = 'not_found';
}

/** State conflict: duplicates, stale version, illegal transition → 409. */
export class ConflictError extends DomainError {
  readonly kind = 'conflict';
}
