/** Uses deployment configuration, never an incoming Host header. */
export function appUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.BETTER_AUTH_URL) return new URL(env.BETTER_AUTH_URL).origin;
  if (env.VERCEL === '1' && env.VERCEL_ENV === 'preview' && env.VERCEL_URL &&
      /^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL)) {
    return `https://${env.VERCEL_URL}`;
  }
  throw new Error('BETTER_AUTH_URL must be configured');
}
