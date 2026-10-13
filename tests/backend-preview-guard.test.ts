import { describe,it,expect } from 'vitest';
import { assertHostedPreviewSeedAllowed,PREVIEW_PROJECT_ID } from '../scripts/preview-guard';
const valid = () => ({
  ALLOW_HOSTED_PREVIEW_SEED:'true', APP_ENV:'preview', DEMO_MODE:'true',
  DATABASE_URL:'postgresql://fictional:fictional@ep-synthetic-test.eu-central-1.aws.neon.tech/preview?sslmode=require',
  PREVIEW_DATABASE_HOST:'ep-synthetic-test.eu-central-1.aws.neon.tech',
  BETTER_AUTH_URL:'https://synthetic-preview.vercel.app', BETTER_AUTH_SECRET:'synthetic-test-secret-at-least-thirty-two-characters', DEMO_PASSWORD:'synthetic-test-password',
});
describe('hosted synthetic provisioning boundary',()=>{
  it('allows only an explicitly configured isolated preview target',()=>expect(assertHostedPreviewSeedAllowed(valid())).toEqual({databaseHost:valid().PREVIEW_DATABASE_HOST,applicationOrigin:valid().BETTER_AUTH_URL}));
  it.each(['ALLOW_HOSTED_PREVIEW_SEED','APP_ENV','DEMO_MODE','DATABASE_URL','PREVIEW_DATABASE_HOST','BETTER_AUTH_SECRET','DEMO_PASSWORD'])('requires %s',key=>{const env:Record<string,string|undefined>=valid();delete env[key];expect(()=>assertHostedPreviewSeedAllowed(env)).toThrow();});
  it('allows the exact opted-in Vercel preview build with integration PGHOST',()=>{
    const env={...valid(),PREVIEW_DATABASE_HOST:undefined,PGHOST:valid().PREVIEW_DATABASE_HOST,VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:PREVIEW_PROJECT_ID,NODE_ENV:'production'};
    expect(()=>assertHostedPreviewSeedAllowed(env)).not.toThrow();
    expect(()=>assertHostedPreviewSeedAllowed({...env,VERCEL_PROJECT_ID:'another-project'})).toThrow();
    expect(()=>assertHostedPreviewSeedAllowed({...env,VERCEL_ENV:'production'})).toThrow();
    expect(()=>assertHostedPreviewSeedAllowed({...env,VERCEL_TARGET_ENV:'production'})).toThrow();
  });
  it.each([{APP_ENV:'production'},{NODE_ENV:'production'},{VERCEL_ENV:'production'},{VERCEL:'1'},{VERCEL_ENV:'development'}])('rejects production and deployment runtimes %o',patch=>expect(()=>assertHostedPreviewSeedAllowed({...valid(),...patch})).toThrow());
  it.each([
    {PREVIEW_DATABASE_HOST:'*.neon.tech'},
    {PREVIEW_DATABASE_HOST:'another.neon.tech'},
    {DATABASE_URL:'postgresql://u:p@ep-synthetic-test.eu-central-1.aws.neon.tech/preview'},
    {DATABASE_URL:'postgresql://u:p@ep-synthetic-test.eu-central-1.aws.neon.tech.attacker.example/preview?sslmode=require',PREVIEW_DATABASE_HOST:'ep-synthetic-test.eu-central-1.aws.neon.tech.attacker.example'},
    {DATABASE_URL:'postgresql://u:p@localhost/preview?sslmode=require',PREVIEW_DATABASE_HOST:'localhost'},
    {BETTER_AUTH_URL:'http://synthetic-preview.vercel.app'},
  ])('rejects unsafe target %o',patch=>expect(()=>assertHostedPreviewSeedAllowed({...valid(),...patch})).toThrow());
});
