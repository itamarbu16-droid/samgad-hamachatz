import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import {seedDemo} from '../src/server/seed';
import {getDb,closeDb,type Database} from '../src/server/db';
import {principalFor} from '../src/server/service';
import {pushKey} from '../src/server/notifications';
import {sendManualTaskReminder} from '../src/server/manual-task-reminders';
import {pendingManualReminder,acknowledgeManualReminder} from '../src/server/manual-task-reminder-state';
import * as s from '../src/server/schema';
import type {Principal} from '../src/server/policy';

let db:Database, owner:Principal, member:Principal, other:Principal;
const now=new Date('2026-11-23T22:35:00Z');
let fetcher:ReturnType<typeof vi.fn<typeof fetch>>;
const endpoint=(device:string)=>'https://fcm.googleapis.com/fcm/send/manual-synthetic-'+device;
const taskInput=(id:string,version=1)=>({kind:'task',id,version});
const rhythmInput=(id:string,occurrenceVersion=1)=>({kind:'rhythm',id,version:1,occurrenceId:id+'-occ',occurrenceVersion});
const send=(input:unknown,p=owner)=>sendManualTaskReminder(p,input,{now});
beforeAll(async()=>{
 vi.stubEnv('DATABASE_URL',undefined);vi.stubEnv('VERCEL',undefined);
 vi.stubEnv('DEMO_MODE','true');vi.stubEnv('PGLITE_DATA_DIR','memory://');
 vi.stubEnv('BETTER_AUTH_URL','http://localhost:3000');vi.stubEnv('BETTER_AUTH_SECRET','synthetic-manual-reminder-test-secret-123456789');
 vi.stubEnv('DEMO_PASSWORD','synthetic-manual-reminder-password');vi.stubEnv('DEMO_EMAIL','demo@samgad.example');
 await seedDemo();db=await getDb();
 async function principal(email:string){
  const [user]=await db.select().from(s.user).where(eq(s.user.email,email));
  return principalFor(user.id,user.name);
 }
 owner=await principal('demo@samgad.example');member=await principal('company.a@samgad.example');other=await principal('contributor@samgad.example');
 await db.insert(s.workspaceAccessGrants).values([member,other].map(p=>({organizationId:owner.organizationId,userId:p.userId,grantedBy:owner.userId}))).onConflictDoNothing();
 await pushKey(owner);
},60000);
afterAll(async()=>{await closeDb();vi.unstubAllEnvs();});
beforeEach(async()=>{
 fetcher=vi.fn<typeof fetch>(async()=>{throw new Error('No manual reminder network delivery allowed');});
 vi.stubGlobal('fetch',fetcher);
 await db.delete(s.pushSubscriptions);await db.delete(s.pushEvents);await db.delete(s.overdueDigestRuns);
 await db.update(s.memberships).set({active:true}).where(eq(s.memberships.userId,member.userId));
});
afterEach(()=>{try{expect(fetcher).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}});
async function subscribe(p=member,device='a'){
 await db.insert(s.pushSubscriptions).values({id:'manual-sub-'+device,organizationId:p.organizationId,userId:p.userId,endpoint:endpoint(device),p256dh:'synthetic',auth:'synthetic'});
}
async function task(id:string,changes:Partial<typeof s.tasks.$inferInsert>={}){
 await db.insert(s.tasks).values({id,organizationId:owner.organizationId,companyId:'company-a',domainId:'safety',ownerId:member.userId,creatorId:owner.userId,dueDate:'2026-11-23',title:'NEVER-SEND-MANUAL-SYNTHETIC-TITLE',...changes});
}
async function rhythm(id:string,changes:Partial<typeof s.rhythmItems.$inferInsert>={},occurrence:Partial<typeof s.rhythmOccurrences.$inferInsert>={}){
 await db.insert(s.rhythmItems).values({id,organizationId:owner.organizationId,creatorId:owner.userId,title:'NEVER-SEND-MANUAL-SYNTHETIC-TITLE',frequency:'once',startDate:'2026-11-23',completionMode:'shared',assigneeIds:[member.userId,other.userId],...changes});
 await db.insert(s.rhythmOccurrences).values({id:id+'-occ',itemId:id,dueDate:'2026-11-23',...occurrence});
}
async function noDelivery(operation:Promise<unknown>){
 // Either explicit stale/eligibility denial or zero eligible recipients.
 await expect(operation.then(result=>(result as {created:number}).created,()=>0)).resolves.toBe(0);
 expect(fetcher).not.toHaveBeenCalled();
}

it('only accepts current manager authority and strictly versioned, scoped task input',async()=>{
 await task('guard');await subscribe();
 await expect(send(taskInput('guard'),member)).rejects.toBeDefined();
 await expect(send(taskInput('guard'),{...member,role:'staff',editAll:false})).rejects.toBeDefined();
 await expect(send(taskInput('guard'),{...member,editAll:true})).rejects.toBeDefined();
 await expect(send(taskInput('guard'),{...owner,guest:true})).rejects.toBeDefined();
 await expect(send({...taskInput('guard'),recipientId:other.userId})).rejects.toBeDefined();
 await expect(send({kind:'rhythm',id:'guard',version:1})).rejects.toBeDefined();
 await noDelivery(send(taskInput('guard',2)));
 expect(await db.select().from(s.overdueDigestRuns)).toEqual([]);
});

it('creates a reminder only for the overdue assignee, preserves ordinary push, and throttles a concurrent duplicate',async()=>{
 await task('accepted');await subscribe();await subscribe(other,'other');
 await db.insert(s.pushEvents).values({id:'legacy-manual',organizationId:owner.organizationId,recipientId:member.userId,title:'Legacy',body:'Legacy',url:'/'});
 const results=await Promise.all([send(taskInput('accepted')),send(taskInput('accepted'))]);
 expect(results.reduce((n,r)=>n+r.created,0)).toBe(1);
 expect(results.reduce((n,r)=>n+r.throttled,0)).toBe(1);
 expect(fetcher).not.toHaveBeenCalled();
 expect((await db.select().from(s.pushEvents)).map(row=>row.id)).toEqual(['legacy-manual']);
 const rows=await pendingManualReminder(member,now);
 expect(rows).toHaveLength(1);expect(JSON.stringify(rows)).not.toContain('NEVER-SEND');
 expect(await pendingManualReminder(owner,now)).toEqual([]);
 await acknowledgeManualReminder(owner,rows.map(row=>row.id),now);
 expect(await pendingManualReminder(member,now)).toHaveLength(1);
 await acknowledgeManualReminder(member,rows.map(row=>row.id),now);
 expect(await pendingManualReminder(member,now)).toEqual([]);
});

it('does not wake a sender, task due today, task pending review, or a recipient with revoked access',async()=>{
 await subscribe();await subscribe(owner,'owner');
 await task('self',{ownerId:owner.userId});await task('today',{dueDate:'2026-11-24'});
 await task('review',{status:'pending_review'});await task('revoked');
 await noDelivery(send(taskInput('self')));await noDelivery(send(taskInput('today')));await noDelivery(send(taskInput('review')));
 await db.update(s.memberships).set({active:false}).where(eq(s.memberships.userId,member.userId));
 await noDelivery(send(taskInput('revoked')));
});

it('rejects stale occurrences and stops an entire shared reminder after any assigned report or completion',async()=>{
 await subscribe();await subscribe(other,'other');
 await rhythm('stale-occ');
 await rhythm('reported',{}, {reports:{[other.userId]:now.toISOString()}});
 await rhythm('completed',{}, {completions:{[other.userId]:now.toISOString()}});
 await noDelivery(send(rhythmInput('stale-occ',2)));
 await noDelivery(send({...rhythmInput('stale-occ'),occurrenceId:'reported-occ'}));
 await noDelivery(send(rhythmInput('reported')));await noDelivery(send(rhythmInput('completed')));
});

it('hides an unacknowledged reminder when the recipient is no longer authorized',async()=>{
 await task('hide-revoked');await subscribe();
 expect((await send(taskInput('hide-revoked'))).created).toBe(1);
 expect(await pendingManualReminder(member,now)).toHaveLength(1);
 await db.update(s.memberships).set({active:false}).where(eq(s.memberships.userId,member.userId));
 expect(await pendingManualReminder(member,now)).toEqual([]);
});

it('creates the same in-app fallback with or without an opted-in device, with no network calls',async()=>{
 await task('no-device');await task('with-device',{ownerId:other.userId,companyId:other.companyId,domainId:other.domainId||'safety'});
 expect(await send(taskInput('no-device'))).toMatchObject({created:1});
 const fallback=await pendingManualReminder(member,now);expect(fallback).toHaveLength(1);
 await acknowledgeManualReminder(member,fallback.map(row=>row.id),now);
 expect(await pendingManualReminder(member,now)).toEqual([]);
 expect(await send(taskInput('no-device'))).toMatchObject({created:0,throttled:1});
 await subscribe(other,'other');
 expect(await send(taskInput('with-device'))).toMatchObject({created:1});
 expect(await pendingManualReminder(other,now)).toHaveLength(1);
 expect(fetcher).not.toHaveBeenCalled();
});

it('hides a queued reminder when its exact source has been completed',async()=>{
 await task('hide-completed');
 expect(await send(taskInput('hide-completed'))).toMatchObject({created:1});
 expect(await pendingManualReminder(member,now)).toHaveLength(1);
 await db.update(s.tasks).set({status:'completed',completedAt:now,completedBy:member.userId}).where(eq(s.tasks.id,'hide-completed'));
 expect(await pendingManualReminder(member,now)).toEqual([]);
});

it('accepts a currently authorized edit-all operator and releases the same-source throttle after fifteen minutes',async()=>{
 await db.update(s.memberships).set({editAll:true}).where(eq(s.memberships.userId,other.userId));
 try {
  const editAll=await principalFor(other.userId,other.name);
  await task('edit-all');await subscribe();
  expect(await send(taskInput('edit-all'),editAll)).toMatchObject({created:1});
  expect(await sendManualTaskReminder(editAll,taskInput('edit-all'),{now:new Date(now.getTime()+14*60000)})).toMatchObject({throttled:1});
  expect(await sendManualTaskReminder(editAll,taskInput('edit-all'),{now:new Date(now.getTime()+16*60000)})).toMatchObject({created:1});
  expect(fetcher).not.toHaveBeenCalled();
 } finally {
  await db.update(s.memberships).set({editAll:false}).where(eq(s.memberships.userId,other.userId));
 }
});

it('revalidates assignment when listing an unacknowledged reminder instead of carrying it to a new assignee',async()=>{
 await task('reassigned');
 expect(await send(taskInput('reassigned'))).toMatchObject({created:1});
 expect(await pendingManualReminder(member,now)).toHaveLength(1);
 await db.update(s.tasks).set({ownerId:other.userId,version:2}).where(eq(s.tasks.id,'reassigned'));
 expect(await pendingManualReminder(member,now)).toEqual([]);
 expect(await pendingManualReminder(other,now)).toEqual([]);
 await noDelivery(send(taskInput('reassigned')));
 expect(await send(taskInput('reassigned',2))).toMatchObject({created:1});
 expect(await pendingManualReminder(other,now)).toHaveLength(1);
});
