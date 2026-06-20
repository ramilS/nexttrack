import { ErrorCode } from '@repo/shared';
import {
  ConflictError,
  DomainError,
  NotFoundError,
  PermissionDeniedError,
  UnauthenticatedError,
  ValidationError,
} from './domain.errors';

describe('DomainError hierarchy', () => {
  it('exposes code, message and kind', () => {
    const err = new NotFoundError(ErrorCode.ISSUE_NOT_FOUND, 'Issue not found');

    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(ErrorCode.ISSUE_NOT_FOUND);
    expect(err.message).toBe('Issue not found');
    expect(err.kind).toBe('not_found');
  });

  it('defaults message to the code when omitted', () => {
    const err = new ValidationError(ErrorCode.INVALID_STATUS);

    expect(err.message).toBe(ErrorCode.INVALID_STATUS);
  });

  it('carries optional structured details', () => {
    const err = new ValidationError(ErrorCode.FIELD_REQUIRED, 'Missing fields', {
      missingFields: [{ id: 'f1', name: 'Severity' }],
    });

    expect(err.details).toEqual({ missingFields: [{ id: 'f1', name: 'Severity' }] });
  });

  it('sets name to the concrete class for log readability', () => {
    expect(new ConflictError('X').name).toBe('ConflictError');
    expect(new PermissionDeniedError('X').name).toBe('PermissionDeniedError');
    expect(new UnauthenticatedError('X').name).toBe('UnauthenticatedError');
  });

  it.each([
    [new ValidationError('C'), 'validation'],
    [new UnauthenticatedError('C'), 'unauthenticated'],
    [new PermissionDeniedError('C'), 'permission_denied'],
    [new NotFoundError('C'), 'not_found'],
    [new ConflictError('C'), 'conflict'],
  ] as const)('%s has kind %s', (err, kind) => {
    expect(err.kind).toBe(kind);
  });
});
