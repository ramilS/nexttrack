import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@repo/shared', '@repo/ui'],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '9000' },
    ],
  },
  // API proxy moved to proxy.ts for runtime env support (dynamic ports in E2E)
};

export default nextConfig;
