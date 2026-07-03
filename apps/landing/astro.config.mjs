// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Alias to shared *source* so the landing never depends on packages/shared
// having been built first (same approach as apps/api's jest moduleNameMapper).
const sharedQueryLanguage = fileURLToPath(
  new URL('../../packages/shared/src/query-language/index.ts', import.meta.url),
);

export default defineConfig({
  site: 'https://ramils.github.io',
  base: '/nexttrack',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: { '@repo/shared/query-language': sharedQueryLanguage },
    },
  },
});
