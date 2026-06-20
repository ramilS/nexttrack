import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      '@repo/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // Unit coverage is scoped to the logic layer (lib/**: hooks, api clients,
      // stores, utils). Components and pages are exercised by the Playwright e2e
      // suite, not unit tests, so gating the whole component tree here would just
      // measure the e2e/unit split, not unit quality.
      include: ['lib/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', 'test/**'],
      // Ratchet floor at the current lib/ level — not an aspirational 70/80,
      // which unit tests alone don't reach (UI is e2e-covered). Enforced in CI so
      // it can't rot; raise as lib/ unit tests are added.
      thresholds: {
        statements: 32,
        branches: 35,
        functions: 25,
        lines: 32,
      },
    },
  },
});
