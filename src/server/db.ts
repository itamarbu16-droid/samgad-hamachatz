import { PGlite } from '@electric-sql/pglite';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;
type Connection = { db: Database; migrate: () => Promise<void>; close: () => Promise<void> };
const state = globalThis as unknown as { samgadConnection?: Promise<Connection> };

export function isDemo() { return process.env.DEMO_MODE === 'true'; }

async function connect(): Promise<Connection> {
  const migration = async () => {
    const directory = path.join(process.cwd(), 'migrations');
    const files = (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
    return (await Promise.all(files.map(name => readFile(path.join(directory, name), 'utf8')))).join('\n');
  };
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    return { db: drizzle(pool, { schema }), migrate: async () => { await pool.query(await migration()); }, close: () => pool.end() };
  }
  if (process.env.VERCEL || !isDemo()) throw new Error('DATABASE_URL is required outside explicit local demonstration mode');
  const location = process.env.PGLITE_DATA_DIR || '.data/postgres';
  if (location !== 'memory://') await mkdir(path.resolve(/* turbopackIgnore: true */ location), { recursive: true });
  const client = new PGlite(location);
  await client.waitReady;
  await client.exec(await migration());
  return { db: pgliteDrizzle(client, { schema }) as unknown as Database, migrate: async () => { await client.exec(await migration()); }, close: () => client.close() };
}
export async function connection() { return state.samgadConnection ??= connect(); }
export async function getDb() { return (await connection()).db; }
export async function closeDb() { if (state.samgadConnection) { const existing = await state.samgadConnection; await existing.close(); delete state.samgadConnection; } }
