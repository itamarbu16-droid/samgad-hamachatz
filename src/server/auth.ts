import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from './db';
import * as schema from './schema';

export async function getAuth(allowProvisioning = false) {
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
  if (!process.env.BETTER_AUTH_URL) throw new Error('BETTER_AUTH_URL must be configured');
  return betterAuth({
    database: drizzleAdapter(await getDb(), { provider: 'pg', schema, transaction: true }),
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    emailAndPassword: { enabled: true, disableSignUp: !allowProvisioning, minPasswordLength: 12 },
    session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 30 },
    rateLimit: { enabled: true, window: 60, max: 30, storage: 'database', modelName: 'rateLimit' },
    advanced: { useSecureCookies: process.env.BETTER_AUTH_URL.startsWith('https://') },
  });
}
