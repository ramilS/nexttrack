export default async function globalTeardown(): Promise<void> {
  console.log('\n🐳 Stopping shared test containers...');

  const containers = globalThis.__TESTCONTAINERS__;
  if (!containers) return;

  // Wait for app connections (BullMQ, ioredis) to fully drain
  await new Promise((r) => setTimeout(r, 1_000));

  await Promise.all([
    containers.pgContainer?.stop(),
    containers.redisContainer?.stop(),
  ]);

  console.log('✅ Containers stopped.');
}
