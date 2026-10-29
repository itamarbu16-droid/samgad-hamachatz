import {beforeAll, afterAll, it, expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {seedDemo} from '../src/server/seed';
import {getDb,closeDb} from '../src/server/db';
import {digestSlot,queueOverdueDigests} from '../src/server/overdue-digest';
import {acknowledgePush} from '../src/server/notifications';
import {principalFor} from '../src/server/service';
import type {Principal} from '../src/server/policy';
import * as s from '../src/server/schema';
let owner:Principal, other:string;
const morning=new Date('2026-10-22T05:00:00Z'), evening=new Date('2026-10-22T15:00:00Z');
beforeAll(async()=>{
 process.env.DEMO_MODE='true';process.env.PGLITE_DATA_DIR='memory://';delete process.env.DATABASE_URL;delete process.env.VERCEL;
 process.env.BETTER_AUTH_URL='http://localhost:3000';process.env.BETTER_AUTH_SECRET='overdue-digest-test-secret-12345678901234567890';process.env.DEMO_PASSWORD='overdue-password-12345';process.env.DEMO_EMAIL='demo@samgad.example';
 await seedDemo();const db=await getDb();const users=await db.select().from(s.user);
 const user=users.find(u=>u.email==='demo@samgad.example')!;
 owner=await principalFor(user.id,user.name);other=users.find(u=>u.email==='company.a@samgad.example')!.id;
 await db.update(s.tasks).set({dueDate:null});await db.update(s.rhythmItems).set({archived:true});await db.delete(s.pushEvents);
 const base={organizationId:owner.organizationId,domainId:'safety',creatorId:owner.userId,dueDate:'2026-10-21'};
 await db.insert(s.tasks).values([
  {...base,id:randomUUID(),ownerId:owner.userId,title:'owner-late'},
  {...base,id:randomUUID(),ownerId:other,title:'other-late'},
  {...base,id:randomUUID(),ownerId:other,title:'pending-excluded',status:'pending_review'},
  {...base,id:randomUUID(),ownerId:owner.userId,title:'today-excluded',dueDate:'2026-10-22'},
  {...base,id:randomUUID(),ownerId:owner.userId,title:'undated-excluded',dueDate:null},
  {...base,id:randomUUID(),ownerId:other,creatorId:other,title:'private-excluded'},
 ]);
 const itemId=randomUUID();await db.insert(s.rhythmItems).values({id:itemId,organizationId:owner.organizationId,creatorId:owner.userId,title:'recurring-late',frequency:'once',startDate:'2026-10-21',assigneeIds:[other],completionMode:'individual'});
 await db.insert(s.rhythmOccurrences).values({id:randomUUID(),itemId,dueDate:'2026-10-21'});
},60000);
afterAll(closeDb);
it('keeps Israel morning and evening across daylight saving transitions',()=>{
 expect(digestSlot(morning)).toBe('morning');expect(digestSlot(evening)).toBe('evening');
 expect(digestSlot(new Date('2026-10-26T06:00:00Z'))).toBe('morning');
 expect(digestSlot(new Date('2026-10-26T16:00:00Z'))).toBe('evening');
 expect(digestSlot(new Date('2026-10-22T06:00:00Z'))).toBe(null);
});
it('queues only overdue actionable tasks and isolates personal and others digests',async()=>{
 expect(await queueOverdueDigests(morning)).toEqual({queued:2});
 const rows=await (await getDb()).select().from(s.pushEvents);
 expect(rows).toHaveLength(2);expect(rows.every(r=>r.recipientId===owner.userId)).toBe(true);
 expect(rows.find(r=>r.title.includes('שלך'))?.body).toContain('1 משימות');
 const others=rows.find(r=>r.title.includes('האחרים'))!;
 expect(others.body).toContain('2 משימות');expect(others.body).toContain('other-late');expect(others.body).toContain('recurring-late');
 expect(rows.map(r=>r.body).join()).not.toMatch(/excluded/);
});
it('does not duplicate notifications after acknowledgement or concurrent retries',async()=>{
 const db=await getDb();const events=await db.select().from(s.pushEvents);
 await acknowledgePush(owner,{ids:events.map(e=>e.id)});
 expect(await queueOverdueDigests(morning)).toEqual({queued:0});
 const runs=await Promise.all([queueOverdueDigests(evening),queueOverdueDigests(evening)]);
 expect(runs.reduce((n,r)=>n+r.queued,0)).toBe(1);
 const rows=await db.select().from(s.pushEvents);expect(rows).toHaveLength(1);expect(rows[0].title).toContain('שלך');
});
it('does not notify when all tasks are completed or awaiting approval',async()=>{
 const db=await getDb();await db.update(s.tasks).set({status:'completed',completedAt:new Date(),completedBy:owner.userId});
 const [item]=await db.select().from(s.rhythmItems).where(eq(s.rhythmItems.title,'recurring-late'));
 await db.update(s.rhythmOccurrences).set({reports:{[other]:'2026-10-22T12:00:00Z'}}).where(eq(s.rhythmOccurrences.itemId,item.id));
 expect(await queueOverdueDigests(new Date('2026-10-23T05:00:00Z'))).toEqual({queued:0});
});
