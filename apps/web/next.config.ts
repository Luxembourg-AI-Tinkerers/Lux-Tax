import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@luxtax/contracts',
    '@luxtax/validation',
    '@luxtax/api-client',
    '@luxtax/design-tokens',
  ],
};

export default nextConfig;
