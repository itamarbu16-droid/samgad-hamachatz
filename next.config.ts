import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  outputFileTracingExcludes: { '/*': ['.env*', '.data/**/*', 'test-results/**/*', 'playwright-report/**/*'] },
  outputFileTracingIncludes: { '/api/*': ['./migrations/*.sql'] },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
    ] }];
  }
};
export default config;
