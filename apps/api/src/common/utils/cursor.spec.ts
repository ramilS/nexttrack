import { ValidationError } from '@/common/errors/domain.errors';
import { encodeCursor, decodeCursor, encodeEsCursor, decodeEsCursor } from './cursor';

describe('cursor', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('should round-trip a simple payload', () => {
      const payload = { id: 'abc-123', createdAt: '2026-01-01T00:00:00.000Z' };
      const encoded = encodeCursor(payload);
      expect(typeof encoded).toBe('string');
      expect(encoded).not.toContain('='); // base64url has no padding
      expect(decodeCursor(encoded)).toEqual(payload);
    });

    it('should handle null values in payload', () => {
      const payload = { id: 'x', dueDate: null };
      const encoded = encodeCursor(payload);
      expect(decodeCursor(encoded)).toEqual(payload);
    });

    it('should handle numeric values', () => {
      const payload = { id: 'x', sortOrder: 42 };
      const encoded = encodeCursor(payload);
      expect(decodeCursor(encoded)).toEqual(payload);
    });

    it('should throw ValidationError for invalid base64', () => {
      expect(() => decodeCursor('not-valid-base64!!!')).toThrow(ValidationError);
    });

    it('should throw ValidationError for non-object JSON', () => {
      const encoded = Buffer.from('"just a string"', 'utf-8').toString('base64url');
      expect(() => decodeCursor(encoded)).toThrow(ValidationError);
    });

    it('should throw ValidationError for array JSON', () => {
      const encoded = Buffer.from('[1,2,3]', 'utf-8').toString('base64url');
      expect(() => decodeCursor(encoded)).toThrow(ValidationError);
    });
  });

  describe('encodeEsCursor / decodeEsCursor', () => {
    it('should round-trip an ES cursor', () => {
      const payload = { searchAfter: [1.5, 'doc-1'], id: 'doc-1' };
      const encoded = encodeEsCursor(payload);
      expect(decodeEsCursor(encoded)).toEqual(payload);
    });

    it('should throw for missing searchAfter', () => {
      const encoded = encodeCursor({ id: 'x' });
      expect(() => decodeEsCursor(encoded)).toThrow(ValidationError);
    });

    it('should throw for non-array searchAfter', () => {
      const encoded = encodeCursor({ searchAfter: 'not-array', id: 'x' });
      expect(() => decodeEsCursor(encoded)).toThrow(ValidationError);
    });
  });
});
