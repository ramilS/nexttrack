import { ConfigType } from '@nestjs/config';
import { EncryptionService } from './encryption.service';
import { ssoConfig } from '@/config';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    // 32-byte key as hex = 64 hex chars
    const key = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    const config: ConfigType<typeof ssoConfig> = {
      encryptionKey: key,
      stateTtl: 600,
      finalizeCodeTtl: 30,
    };
    service = new EncryptionService(config);
  });

  it('should encrypt and decrypt roundtrip', () => {
    const plaintext = 'super-secret-client-data';
    const encrypted = service.encrypt(plaintext);
    const decrypted = service.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
    expect(encrypted).not.toBe(plaintext);
  });

  it('should produce format IV:TAG:CIPHERTEXT', () => {
    const encrypted = service.encrypt('test');
    const parts = encrypted.split(':');

    expect(parts).toHaveLength(3);
    // IV = 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // GCM auth tag = 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext is non-empty hex
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('should produce different ciphertexts for same plaintext (random IV)', () => {
    const a = service.encrypt('same-data');
    const b = service.encrypt('same-data');

    expect(a).not.toBe(b);
  });

  it('should reject tampered ciphertext', () => {
    const encrypted = service.encrypt('data');
    const parts = encrypted.split(':');
    // Tamper with the auth tag
    parts[1] = '0'.repeat(32);
    const tampered = parts.join(':');

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('should reject tampered IV', () => {
    const encrypted = service.encrypt('data');
    const parts = encrypted.split(':');
    parts[0] = '0'.repeat(24);
    const tampered = parts.join(':');

    expect(() => service.decrypt(tampered)).toThrow();
  });

  describe('isEncrypted', () => {
    it('returns true for own ciphertext', () => {
      expect(service.isEncrypted(service.encrypt('value'))).toBe(true);
    });

    it('returns false for plaintext secrets', () => {
      expect(service.isEncrypted('supersecretkey1234567890abcdef12')).toBe(false);
      expect(service.isEncrypted('1234567890:ABCdefGHIJklmnoPQRstuVWXyz')).toBe(false);
      expect(service.isEncrypted('')).toBe(false);
    });
  });

  describe('decryptWithLegacyFallback', () => {
    it('decrypts encrypted values', () => {
      const encrypted = service.encrypt('webhook-secret');

      expect(service.decryptWithLegacyFallback(encrypted)).toBe('webhook-secret');
    });

    it('returns legacy plaintext as-is and logs a warning', () => {
      const warnSpy = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);

      const result = service.decryptWithLegacyFallback('legacy-plaintext-secret');

      expect(result).toBe('legacy-plaintext-secret');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Legacy plaintext secret'),
      );
    });

    it('still throws on structurally valid but tampered ciphertext', () => {
      const parts = service.encrypt('data').split(':');
      parts[1] = '0'.repeat(32);

      expect(() => service.decryptWithLegacyFallback(parts.join(':'))).toThrow();
    });
  });
});
