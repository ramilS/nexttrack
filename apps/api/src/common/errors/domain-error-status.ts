import { HttpStatus } from '@nestjs/common';
import { DomainError, DomainErrorKind } from './domain.errors';

/**
 * The single place where domain error kinds meet HTTP. Used by the global
 * exception filter (response status) and the metrics interceptor (status
 * label) so the two can never disagree.
 */
export const DOMAIN_ERROR_STATUS: Record<DomainErrorKind, HttpStatus> = {
  validation: HttpStatus.BAD_REQUEST,
  unauthenticated: HttpStatus.UNAUTHORIZED,
  permission_denied: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
};

export function httpStatusOf(error: DomainError): HttpStatus {
  return DOMAIN_ERROR_STATUS[error.kind];
}
