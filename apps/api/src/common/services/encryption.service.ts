import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logging/app-logger';
import { ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';
import { ssoConfig } from '@/config';

// Ciphertext format produced by encrypt(): <iv 12B>:<gcm tag 16B>:<payload> in hex.
const CIPHERTEXT_PATTERN = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/;

@Injectable()
export class EncryptionService {
  private readonly logger = new AppLogger(EncryptionService.name);
  private key: Buffer;

  constructor(
    @Inject(ssoConfig.KEY)
    config: ConfigType<typeof ssoConfig>,
  ) {
    this.key = Buffer.from(config.encryptionKey, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, tagHex, encryptedHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  isEncrypted(value: string): boolean {
    return CIPHERTEXT_PATTERN.test(value);
  }

  /**
   * Decrypts a value, falling back to the raw input for legacy rows that were
   * persisted before secrets-at-rest encryption was introduced.
   */
  decryptWithLegacyFallback(value: string): string {
    if (!this.isEncrypted(value)) {
      this.logger.warn(
        'Legacy plaintext secret detected; using as-is. Re-save it to encrypt at rest.',
      );
      return value;
    }
    return this.decrypt(value);
  }
}
