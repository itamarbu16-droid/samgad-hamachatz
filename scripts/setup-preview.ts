import { Pool } from 'pg';
import { assertHostedPreviewSeedAllowed } from './preview-guard';
import { connection, closeDb } from '../src/server/db';
import { seedHostedPreview } from '../src/server/seed';

async function main() {
  const target = assertHostedPreviewSeedAllowed();
  const preflight = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    // Refuse an existing application/database before running even an idempotent migration.
    const existing = await preflight.query<{ count: string }>("SELECT count(*)::text AS count FROM pg_catalog.pg_tables WHERE schemaname = 'public'");
    if (Number(existing.rows[0].count) !== 0) throw new Error('Preview seed requires a fresh dedicated database with no public tables; existing database left unchanged');
  } finally { await preflight.end(); }
  await (await connection()).migrate();
  const result = await seedHostedPreview();
  console.log(`Synthetic preview provisioned for ${target.applicationOrigin}. Sign in as ${result?.email} using the separately configured DEMO_PASSWORD.`);
  console.log('This is an isolated synthetic preview. Production use and security approval remain separate.');
}
main().catch(() => {
  // Driver failures can include connection details; never echo raw provisioning errors.
  console.error('Preview provisioning stopped. Check the explicit preview flags, exact Neon host, TLS, credentials, and fresh-database requirement. No credentials are logged.');
  process.exitCode = 1;
}).finally(closeDb);
