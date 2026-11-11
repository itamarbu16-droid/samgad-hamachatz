import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { seedDemo } from '../src/server/seed';
import { getDb, closeDb } from '../src/server/db';
import { principalFor } from '../src/server/service';
import type { Principal } from '../src/server/policy';
import { createQuickPointKey, captureQuickPoint, quickPointStatus, revokeQuickPointKey } from '../src/server/quick-points';
import { POST } from '../src/app/api/quick-points/route';
import * as s from '../src/server/schema';
let owner: Principal, other: Principal;
beforeAll(async () => {
  process.env.DEMO_MODE='true'; process.env.PGLITE_DATA_DIR='memory://'; delete process.env.DATABASE_URL; delete process.env.VERCEL;
  process.env.BETTER_AUTH_URL='http://localhost:3000'; process.env.BETTER_AUTH_SECRET='quick-point-test-secret-12345678901234567890'; process.env.DEMO_PASSWORD='quick-point-password-12345'; process.env.DEMO_EMAIL='demo@samgad.example';
  await seedDemo(); const users=await (await getDb()).select().from(s.user);
  const u=users.find(row=>row.email==='demo@samgad.example')!;
  owner=await principalFor(u.id,u.name);
  const o=users.find(row=>row.email==='company.a@samgad.example')!;
  other=await principalFor(o.id,o.name);
}, 60000);
afterAll(closeDb);
it('requires owner permission and explicit consent, stores hash only', async () => {
  await expect(createQuickPointKey(other,{consent:true})).rejects.toThrow();
  await expect(createQuickPointKey(owner,{consent:false})).rejects.toThrow();
  const key=await createQuickPointKey(owner,{consent:true});
  const rows=await (await getDb()).select().from(s.quickPointKeys);
  expect(rows).toHaveLength(1); expect(rows[0].tokenHash).not.toBe(key.token);
  expect(rows[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
  expect(await quickPointStatus(owner)).toMatchObject({active:true,lastUsedAt:null});
  expect(JSON.stringify(await quickPointStatus(owner))).not.toContain(key.token);
});
it('creates only owner points without deadline, preserves full shared text, deduplicates retries', async () => {
  const key=await createQuickPointKey(owner,{consent:true});
  const text='כותרת הנקודה\nטקסט שהועבר עם "ציטוטים", שורה נוספת וכתובת https://example.org';
  const input={text,clientRequestId:randomUUID()};
  const result=await captureQuickPoint(key.token,input);
  expect(await captureQuickPoint(key.token,input)).toEqual(result);
  const [item]=await (await getDb()).select().from(s.rhythmItems).where(eq(s.rhythmItems.id,result.id));
  expect(item).toMatchObject({title:'כותרת הנקודה',description:text,category:'point',creatorId:owner.userId,assigneeIds:[owner.userId],frequency:'once',hasDeadline:false});
  expect(await quickPointStatus(owner)).toMatchObject({active:true});
  await expect(captureQuickPoint(key.token,{...input,text:'טקסט אחר'})).rejects.toThrow();
});
it('rejects blank, oversized and target/category/assignee injection', async () => {
  const {token}=await createQuickPointKey(owner,{consent:true});
  for (const body of [{text:' ',clientRequestId:randomUUID()},{text:'א'.repeat(5001),clientRequestId:randomUUID()},{text:'נקודה',clientRequestId:randomUUID(),category:'task'},{text:'נקודה',clientRequestId:randomUUID(),userId:other.userId}])
    await expect(captureQuickPoint(token,body)).rejects.toThrow();
});
it('revocation, rotation and expiration stop the old shortcut', async () => {
  const first=await createQuickPointKey(owner,{consent:true});
  const second=await createQuickPointKey(owner,{consent:true});
  await expect(captureQuickPoint(first.token,{text:'נקודה',clientRequestId:randomUUID()})).rejects.toThrow();
  await (await getDb()).update(s.quickPointKeys).set({expiresAt:new Date(0)}).where(eq(s.quickPointKeys.userId,owner.userId));
  await expect(captureQuickPoint(second.token,{text:'נקודה',clientRequestId:randomUUID()})).rejects.toThrow();
  const third=await createQuickPointKey(owner,{consent:true});
  await revokeQuickPointKey(owner);
  await expect(captureQuickPoint(third.token,{text:'נקודה',clientRequestId:randomUUID()})).rejects.toThrow();
});
it('rechecks membership and limits request bursts', async () => {
  const {token}=await createQuickPointKey(owner,{consent:true});
  const db=await getDb();
  await db.update(s.memberships).set({active:false}).where(eq(s.memberships.userId,owner.userId));
  await expect(captureQuickPoint(token,{text:'נקודה',clientRequestId:randomUUID()})).rejects.toThrow();
  await db.update(s.memberships).set({active:true}).where(eq(s.memberships.userId,owner.userId));
  await db.update(s.quickPointKeys).set({windowCount:30,windowStartedAt:new Date()}).where(eq(s.quickPointKeys.userId,owner.userId));
  await expect(captureQuickPoint(token,{text:'נקודה',clientRequestId:randomUUID()})).rejects.toMatchObject({status:429});
});
it('HTTP rejects cookie-only and query credentials; JSON safely accepts quoted shared text', async () => {
  const {token}=await createQuickPointKey(owner,{consent:true});
  const init={method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({text:'הודעה "בציטוט"\nשורה נוספת',clientRequestId:randomUUID()})};
  const response=await POST(new Request('http://localhost:3000/api/quick-points',init));
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({saved:true});
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect((await POST(new Request('http://localhost:3000/api/quick-points?token=bad',init))).status).toBe(400);
  expect((await POST(new Request('http://localhost:3000/api/quick-points',{...init,headers:{'Content-Type':'application/json'}}))).status).toBe(401);
});
