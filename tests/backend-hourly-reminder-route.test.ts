import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, HEAD, POST } from '../src/app/api/cron/hourly-overdue/route';

const mocks = vi.hoisted(() => ({ loaded: vi.fn(), run: vi.fn() }));
vi.mock('@/server/hourly-reminders', () => {
  mocks.loaded();
  return { runHourlyReminders: mocks.run };
});

const url = 'http://localhost/api/cron/hourly-overdue';
const request = (authorization?: string) => new Request(url, {
  headers: authorization ? { authorization } : undefined,
});
const newSecret = () => randomBytes(32).toString('base64url');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('HOURLY_REMINDERS_ENABLED', 'true');
  vi.stubEnv('HOURLY_REMINDERS_SECRET', newSecret());
  vi.stubEnv('CRON_SECRET', newSecret());
});
afterEach(() => vi.unstubAllEnvs());

describe('hourly overdue invocation', () => {
  it('does not invoke the service when disabled, even with a matching bearer', async () => {
    for (const flag of [undefined, 'false', '1', 'TRUE']) {
      vi.stubEnv('HOURLY_REMINDERS_ENABLED', flag);
      const response = await GET(request(`Bearer ${process.env.HOURLY_REMINDERS_SECRET}`));
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(mocks.loaded).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('rejects missing, weak, malformed, or reused scheduled secrets', async () => {
    for (const secret of [undefined, 'short', 'A'.repeat(43), 'a'.repeat(44), process.env.CRON_SECRET]) {
      vi.stubEnv('HOURLY_REMINDERS_SECRET', secret);
      expect((await GET(request(`Bearer ${secret}`))).status).toBe(404);
    }
    expect(mocks.loaded).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('rejects absent, malformed, mismatched, and daily bearer authentication', async () => {
    const secret = process.env.HOURLY_REMINDERS_SECRET!;
    for (const header of [undefined, secret, `Basic ${secret}`, `Bearer ${newSecret()}`, `Bearer ${process.env.CRON_SECRET}`]) {
      expect((await GET(request(header))).status).toBe(401);
    }
    expect(mocks.loaded).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('never dispatches via HEAD', () => {
    expect(HEAD().status).toBe(405);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('invokes once with the dedicated bearer and returns an uncached aggregate', async () => {
    const counts = { queued: 2, sent: 1, failed: 0, skipped: 1, remaining: 4 };
    mocks.run.mockResolvedValueOnce({ ...counts, detail: "synthetic private detail" });
    const response = await GET(request(`Bearer ${process.env.HOURLY_REMINDERS_SECRET}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(counts);
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });

  it('signals a retryable partial provider failure without changing the stable slot', async () => {
    const counts={queued:2,sent:1,failed:1,skipped:0,remaining:1};
    mocks.run.mockResolvedValueOnce(counts);
    const response=await GET(request(`Bearer ${process.env.HOURLY_REMINDERS_SECRET}`));
    expect(response.status).toBe(503);expect(await response.json()).toEqual(counts);
  });

  it('returns a generic uncached failure without exposing service details', async () => {
    mocks.run.mockRejectedValueOnce(new Error('synthetic internal detail'));
    const response = await GET(request(`Bearer ${process.env.HOURLY_REMINDERS_SECRET}`));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'Hourly reminders unavailable' });
  });
});


describe('native Vercel Schedules preview path',()=>{
 const now=new Date('2026-11-19T05:13:00Z');
 const post=(updates:Record<string,string>={})=>new Request(url,{method:'POST',headers:{
  authorization:`Bearer ${process.env.CRON_SECRET}`,
  'ce-type':'com.vercel.schedule.v1beta',
  'ce-vssschedulename':'hourly-overdue-assignees',
  'ce-vssschedulesource':'static',
  'ce-vssscheduledat':'2026-11-19T05:07:00Z',
  ...updates,
 }});
 beforeEach(()=>{
  vi.stubEnv('VERCEL','1');vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','feature/personal-rhythm');
  vi.useFakeTimers();vi.setSystemTime(now);
 });
 afterEach(()=>vi.useRealTimers());
 it('never starts on production, another branch, or when disabled',async()=>{
  vi.stubEnv('VERCEL_ENV','production');expect((await POST(post())).status).toBe(404);
  vi.stubEnv('VERCEL_ENV','preview');vi.stubEnv('VERCEL_GIT_COMMIT_REF','feature/other');expect((await POST(post())).status).toBe(404);
  vi.stubEnv('VERCEL_GIT_COMMIT_REF','feature/personal-rhythm');vi.stubEnv('HOURLY_REMINDERS_ENABLED','false');expect((await POST(post())).status).toBe(404);
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('requires both the project bearer and the expected schedule',async()=>{
  expect((await POST(post({authorization:'Bearer wrong'}))).status).toBe(401);
  expect((await POST(post({'ce-vssschedulename':'other-schedule'}))).status).toBe(400);
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('does not retry stale or future scheduled hours',async()=>{
  const r=await POST(post({'ce-vssscheduledat':'2026-11-19T04:07:00Z'}));
  expect(await r.json()).toEqual({skippedStaleRun:true});
  const future=await POST(post({'ce-vssscheduledat':'2026-11-19T05:25:00Z'}));
  expect(await future.json()).toEqual({skippedStaleRun:true});
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it('invokes only the current authorized slot and returns aggregate status',async()=>{
  const counts={queued:2,sent:2,failed:0,skipped:0,remaining:0};
  mocks.run.mockResolvedValueOnce(counts);
  const r=await POST(post());
  expect(r.status).toBe(200);expect(await r.json()).toEqual(counts);expect(mocks.run).toHaveBeenCalledWith(now);
 });
});
