import { describe, expect, it } from 'vitest';
import { appUrl } from '../src/server/app-url';
describe('configured application origin', () => {
  it('uses the explicit origin when configured', () => {
    expect(appUrl({ BETTER_AUTH_URL: 'https://example.com/' })).toBe('https://example.com');
  });
  it('uses the exact Vercel preview hostname', () => {
    expect(appUrl({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'samgad-test.vercel.app' })).toBe('https://samgad-test.vercel.app');
  });
  it('fails closed in production and on malformed preview hostnames', () => {
    expect(() => appUrl({ VERCEL: '1', VERCEL_ENV: 'production', VERCEL_URL: 'samgad-test.vercel.app' })).toThrow();
    expect(() => appUrl({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'samgad.vercel.app.evil.com' })).toThrow();
    expect(() => appUrl({ VERCEL_ENV: 'preview', VERCEL_URL: 'samgad-test.vercel.app' })).toThrow();
  });
});
