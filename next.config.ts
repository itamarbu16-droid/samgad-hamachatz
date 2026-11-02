import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  outputFileTracingExcludes: { '/*': ['.env*', '.data/**/*', 'test-results/**/*', 'playwright-report/**/*'] },
  outputFileTracingIncludes: { '/api/*': ['./migrations/*.sql'] },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] }, { source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
    ] }, {
      // Authenticated attachment previews may be framed only by this application.
      // Keep this after the global DENY rule: Next uses the last matching value.
      source: '/api/documents/files/:id',
      headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }]
    }];
  }
};
export default config;
