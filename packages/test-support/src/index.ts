// Shared by the integration and e2e stacks. JWT secrets need >=32 chars,
// encryptionKey exactly 64 (AES-256); the production placeholder guard is off
// under NODE_ENV=test.
export const TEST_SECRETS = {
  jwtAccessSecret: 'e2e-test-access-secret-32-chars-ok',
  jwtRefreshSecret: 'e2e-test-refresh-secret-32-chars-ok',
  encryptionKey: 'a'.repeat(64),
  migrationApiSecret: 'e2e-migration-secret-that-is-32-chars-long',
  // Same pair is the Garage container's default key and the API's S3 creds.
  // Garage requires a key id of >=8 chars and a secret of >=16.
  s3AccessKey: 'nexttrack-test',
  s3SecretKey: 'nexttrack-test-secret',
} as const;
