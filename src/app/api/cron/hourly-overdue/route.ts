import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const responseHeaders = { 'Cache-Control': 'no-store' };
const nativeScheduleName = 'hourly-overdue-assignees';

function authenticated(request: Request, secret: string) {
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function run(now?: Date) {
  try {
    const { runHourlyReminders } = await import('@/server/hourly-reminders');
    const { queued, sent, failed, skipped, remaining } = await runHourlyReminders(now);
    return Response.json({ queued, sent, failed, skipped, remaining }, { status: failed ? 503 : 200, headers: responseHeaders });
  } catch {
    return Response.json({ error: 'Hourly reminders unavailable' }, { status: 503, headers: responseHeaders });
  }
}

function validSecret(secret: string | undefined): secret is string {
  // Require the canonical base64url representation of 32 random bytes.
  // The format and obvious-repeat checks don't replace secure provisioning.
  if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return false;
  const decoded = Buffer.from(secret, 'base64url');
  return decoded.length === 32 && decoded.toString('base64url') === secret
    && new Set(decoded).size >= 16 && secret !== process.env.CRON_SECRET;
}

export function HEAD() {
  return new Response(null, { status: 405, headers: { ...responseHeaders, Allow: 'GET, POST' } });
}

export async function GET(request: Request) {
  if (process.env.HOURLY_REMINDERS_ENABLED !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404, headers: responseHeaders });
  }
  const secret = process.env.HOURLY_REMINDERS_SECRET;
  if (!validSecret(secret)) {
    return Response.json({ error: 'Not found' }, { status: 404, headers: responseHeaders });
  }
  if (!authenticated(request, secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: responseHeaders });
  }
  return run();
}

// Native Vercel Schedules sends the existing bearer only on the same deployment.
// This path does not rely on the CloudEvent headers for authorization.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (process.env.HOURLY_REMINDERS_ENABLED !== 'true'
    || process.env.VERCEL !== '1'
    || process.env.VERCEL_ENV !== 'preview'
    || process.env.VERCEL_GIT_COMMIT_REF !== 'feature/personal-rhythm'
    || !secret || secret.length < 16 || secret !== secret.trim()) {
    return Response.json({ error: 'Not found' }, { status: 404, headers: responseHeaders });
  }
  if (!authenticated(request, secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: responseHeaders });
  }
  if (request.headers.get('ce-type') !== 'com.vercel.schedule.v1beta'
    || request.headers.get('ce-vssschedulename') !== nativeScheduleName
    || request.headers.get('ce-vssschedulesource') !== 'static') {
    return Response.json({ error: 'Unexpected schedule' }, { status: 400, headers: responseHeaders });
  }
  const now = new Date();
  const scheduled = Date.parse(request.headers.get('ce-vssscheduledat') ?? '');
  // Never catch up a previous hour with today's task/assignment state.
  if (!Number.isFinite(scheduled) || scheduled > now.getTime() + 60_000
    || Math.floor(scheduled / 3_600_000) !== Math.floor(now.getTime() / 3_600_000)) {
    return Response.json({ skippedStaleRun: true }, { status: 200, headers: responseHeaders });
  }
  return run(now);
}
