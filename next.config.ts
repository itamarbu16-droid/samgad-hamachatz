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
    ] }, ...(process.env.VERCEL_GIT_COMMIT_REF === 'feature/tutorial-recording' ? [{source:'/training',headers:[{key:'X-Frame-Options',value:'SAMEORIGIN'}]}] : [])];
  }
};
export default config;

