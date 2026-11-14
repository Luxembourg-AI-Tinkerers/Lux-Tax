import os from 'node:os';

import type { NextConfig } from 'next';

/**
 * Dev-only resources (the HMR socket) are served to same-origin requests only;
 * a phone opening the demo by LAN address is a different origin, so Next refuses
 * `/_next/hmr` and logs "Blocked cross-origin request". Every non-internal IPv4
 * address of this machine is therefore allowed, which keeps working when DHCP
 * hands out a different address. `ALLOWED_DEV_ORIGINS` adds hostnames by hand.
 */
function allowedDevOrigins(): string[] {
  const lanAddresses = Object.values(os.networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);

  const configured = (process.env.ALLOWED_DEV_ORIGINS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  return [...new Set([...lanAddresses, ...configured])];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: allowedDevOrigins(),
  transpilePackages: [
    '@luxtax/contracts',
    '@luxtax/validation',
    '@luxtax/api-client',
    '@luxtax/design-tokens',
  ],
};

export default nextConfig;
