/** Explicit authorization for one fresh preview database, never production. */
export const PREVIEW_PROJECT_ID = 'prj_pktl4SKuEO9E443R77FFe1p95N3M';
export function assertHostedPreviewSeedAllowed(env: Record<string,string|undefined> = process.env) {
  if (env.ALLOW_HOSTED_PREVIEW_SEED !== 'true' || env.APP_ENV !== 'preview' || env.DEMO_MODE !== 'true') {
    throw new Error('Hosted seed requires ALLOW_HOSTED_PREVIEW_SEED=true, APP_ENV=preview, and DEMO_MODE=true');
  }
  const approvedPreviewBuild=env.VERCEL==='1' && env.VERCEL_ENV==='preview' && env.VERCEL_PROJECT_ID===PREVIEW_PROJECT_ID;
  if ((env.VERCEL && !approvedPreviewBuild) || (env.VERCEL_ENV && env.VERCEL_ENV !== 'preview') || env.VERCEL_TARGET_ENV==='production' || (env.NODE_ENV === 'production' && !approvedPreviewBuild)) {
    throw new Error('Hosted synthetic provisioning permits only a workstation or this exact Vercel project in preview; production is denied');
  }
  // PGHOST is supplied alongside DATABASE_URL by the explicitly connected Neon integration.
  const allowedHost=env.PREVIEW_DATABASE_HOST || env.PGHOST;
  if (!env.DATABASE_URL || !allowedHost) throw new Error('DATABASE_URL and exact PREVIEW_DATABASE_HOST or integration PGHOST are required');
  let database: URL;
  try { database = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL is not a valid PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)
    || !database.hostname.endsWith('.neon.tech')
    || database.hostname !== allowedHost
    || (env.PGHOST && database.hostname!==env.PGHOST)
    || !database.username || !database.password || database.pathname.length < 2
    || !['require', 'verify-full', 'verify-ca'].includes(database.searchParams.get('sslmode') || '')) {
    throw new Error('Preview database must be the exact allowlisted Neon host with credentials, database name, and TLS');
  }
  let application: URL;
  try { application = new URL(env.BETTER_AUTH_URL || ''); } catch { throw new Error('BETTER_AUTH_URL must name the HTTPS preview application'); }
  if (application.protocol !== 'https:' || application.username || application.password) throw new Error('Hosted preview authentication requires an HTTPS application origin');
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32 || !env.DEMO_PASSWORD || env.DEMO_PASSWORD.length < 12) throw new Error('Provision separate preview auth secret and demonstration password first');
  return { databaseHost: database.hostname, applicationOrigin: application.origin };
}
