import {
  sanitizeMigrationErrorDetails,
  sanitizeMigrationErrorMessage,
} from './migration-json';
import { MigrationController } from './migration.controller';
import { MigrationEntityStatus } from '@prisma/client';

describe('sanitizeMigrationErrorDetails', () => {
  it('redacts credential-shaped values even when their keys are neutral', () => {
    const sanitized = sanitizeMigrationErrorDetails({
      header: 'Bearer abc.def.ghi',
      response: 'apiKey=top-secret-value',
      operation: 'createIssue',
    });

    expect(sanitized).toEqual({
      header: '[redacted]',
      response: '[redacted]',
      operation: 'createIssue',
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/abc\.def|top-secret-value/);
  });

  it.each([
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signaturevalue',
    'eyJhbGciOiJIUzI1NiJ9.e30.signaturevalue',
    'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789',
  ])('redacts raw token-shaped neutral values', (value) => {
    expect(sanitizeMigrationErrorDetails({ value })).toEqual({
      value: '[redacted]',
    });
  });

  it('preserves ordinary diagnostic strings', () => {
    expect(
      sanitizeMigrationErrorDetails({ reason: 'token validation failed upstream' }),
    ).toEqual({ reason: 'token validation failed upstream' });
  });

  it('redacts credentials inside an error message while preserving diagnostics', () => {
    const sanitized = sanitizeMigrationErrorMessage(
      'POST /issues returned 422: Bearer abcdefghijklmnopqrstuvwxyz',
    );

    expect(sanitized).toContain('POST /issues returned 422');
    expect(sanitized).toContain('[redacted]');
    expect(sanitized).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it.each(['access_token', 'refresh_token', 'client_secret'])(
    'redacts prefixed credential assignment %s',
    (key) => {
      const sanitized = sanitizeMigrationErrorMessage(
        `upstream rejected ${key}=abcdefghijklmnopqrstuvwxyz`,
      );
      expect(sanitized).toContain('[redacted]');
      expect(sanitized).not.toContain('abcdefghijklmnopqrstuvwxyz');
    },
  );

  it.each(['access_token', 'refresh_token', 'client_secret', 'x-access_token'])(
    'redacts prefixed credential assignment %s inside structured details',
    (key) => {
      const sanitized = sanitizeMigrationErrorDetails({
        nested: { response: `${key}=abcdefghijklmnopqrstuvwxyz` },
      });
      expect(sanitized).toEqual({ nested: { response: '[redacted]' } });
    },
  );

  it('bounds sanitized messages to 2 KiB of UTF-8 without splitting code points', () => {
    const sanitized = sanitizeMigrationErrorMessage('é'.repeat(2_000));

    expect(Buffer.byteLength(sanitized, 'utf8')).toBeLessThanOrEqual(2_000);
    expect(sanitized).toBe('é'.repeat(1_000));
  });

  it('bounds structured detail strings to 2 KiB of UTF-8', () => {
    const sanitized = sanitizeMigrationErrorDetails({ detail: 'é'.repeat(2_000) });
    const detail = sanitized.detail as string;

    expect(Buffer.byteLength(detail, 'utf8')).toBeLessThanOrEqual(2_000);
    expect(detail).toBe('é'.repeat(1_000));
  });

  it('sanitizes legacy stored details again at serialization', () => {
    const now = new Date('2026-07-14T00:00:00.000Z');
    const controller = Object.create(MigrationController.prototype);
    const serialized = Reflect.apply(
      Reflect.get(controller, 'serializeEntity'),
      controller,
      [{
        id: 'entity-1', runId: 'run-1', entityType: 'issue', sourceId: '2-42',
        sourceChecksum: 'a'.repeat(64), targetId: null,
        status: MigrationEntityStatus.FAILED, attemptCount: 1,
        errorCode: 'UPSTREAM',
        errorMessage: 'failed with sk-proj-abcdefghijklmnopqrstuvwxyz0123456789',
        errorDetails: { value: 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789' },
        discoveredAt: now, transformedAt: null, loadedAt: null, verifiedAt: null,
        createdAt: now, updatedAt: now,
      }],
    ) as { errorDetails: unknown; errorMessage: string };

    expect(serialized.errorDetails).toEqual({ value: '[redacted]' });
    expect(serialized.errorMessage).toBe('failed with [redacted]');
  });
});
