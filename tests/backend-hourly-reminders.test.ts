import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {and,eq,isNull,lt,sql} from 'drizzle-orm';
import {seedDemo} from '../src/server/seed';
import {getDb,closeDb,type Database} from '../src/server/db';
import {principalFor} from '../src/server/service';
import {pushKey,flushPush,pendingPush,acknowledgePush} from '../src/server/notifications';
import {countOwnOverdue} from '../src/server/hourly-task-selection';
import {acknowledgeHourlyPush,hourlyId,pendingHourlyPush} from '../src/server/hourly-reminder-state';
import {queueHourlyReminders,flushHourlyReminders} from '../src/server/hourly-reminders';
import * as s from '../src/server/schema';
import type {Principal} from '../src/server/policy';
let db:Database, owner:Principal, member:string, ungranted:string;
const now=new Date('2026-11-19T22:35:00Z'); // Nov 20, 00:35 in Jerusalem.
const endpoint=(id:string)=>'https://fcm.googleapis.com/fcm/send/synthetic-'+id;
let fetcher:ReturnType<typeof vi.fn<typeof fetch>>;
beforeAll(async()=>{
 vi.stubEnv('DATABASE_URL',undefined);vi.stubEnv('VERCEL',undefined);
 vi.stubEnv('DEMO_MODE','true');vi.stubEnv('PGLITE_DATA_DIR','memory://');
 vi.stubEnv('BETTER_AUTH_URL','http://localhost:3000');vi.stubEnv('BETTER_AUTH_SECRET','synthetic-hourly-test-secret-123456789123456789');
 vi.stubEnv('DEMO_PASSWORD','synthetic-hourly-test-password');vi.stubEnv('DEMO_EMAIL','demo@samgad.example');
 await seedDemo();db=await getDb();const users=await db.select().from(s.user);
 const current=users.find(u=>u.email==='demo@samgad.example')!;
 owner=await principalFor(current.id,current.name);
 member=users.find(u=>u.email==='company.a@samgad.example')!.id;
 ungranted=users.find(u=>u.email==='contributor@samgad.example')!.id;
 await db.insert(s.workspaceAccessGrants).values({organizationId:owner.organizationId,userId:member,grantedBy:owner.userId}).onConflictDoNothing();
 await db.delete(s.workspaceAccessGrants).where(eq(s.workspaceAccessGrants.userId,ungranted));
 await db.insert(s.organizations).values({id:'hourly-other-org',name:'Synthetic'});
 await db.insert(s.domains).values({id:'hourly-other-domain',organizationId:owner.organizationId,name:'Synthetic'});
 await pushKey(owner);
},60000);
afterAll(async()=>{await closeDb();vi.unstubAllEnvs();});
beforeEach(async()=>{
 process.env.HOURLY_REMINDERS_ENABLED='true';
 fetcher=vi.fn<typeof fetch>(async()=>new Response(null,{status:201}));
 vi.stubGlobal('fetch',fetcher);
 await db.delete(s.pushEvents);await db.delete(s.overdueDigestRuns);await db.delete(s.pushSubscriptions);
 await db.update(s.tasks).set({dueDate:null});
 await db.update(s.rhythmItems).set({archived:true});
 await db.delete(s.memberships).where(eq(s.memberships.organizationId,'hourly-other-org'));
 await db.update(s.memberships).set({active:true,role:'company_commander',companyId:'company-a',domainId:'safety',editAll:false}).where(eq(s.memberships.userId,member));
});
afterEach(()=>vi.unstubAllGlobals());
async function subscribe(userId=member,device='a'){
 await db.insert(s.pushSubscriptions).values({id:'subscription-'+device,organizationId:owner.organizationId,userId,endpoint:endpoint(device),p256dh:'synthetic',auth:'synthetic'});
}
async function task(id:string,changes:Partial<typeof s.tasks.$inferInsert>={}){
 await db.insert(s.tasks).values({id,organizationId:owner.organizationId,companyId:'company-a',domainId:'safety',ownerId:member,creatorId:owner.userId,dueDate:'2026-11-19',title:'NEVER-PUSH-SYNTHETIC-TITLE',...changes});
}
async function rhythm(id:string,changes:Partial<typeof s.rhythmItems.$inferInsert>={},occurrence:Partial<typeof s.rhythmOccurrences.$inferInsert>={}){
 await db.insert(s.rhythmItems).values({id,organizationId:owner.organizationId,creatorId:owner.userId,title:'NEVER-PUSH-RHYTHM-TITLE',frequency:'once',startDate:'2026-11-19',completionMode:'individual',assigneeIds:[member],...changes});
 await db.insert(s.rhythmOccurrences).values({id:id+'-occ',itemId:id,dueDate:'2026-11-19',...occurrence});
}
const count=(user=member,date=now)=>countOwnOverdue(db,owner.organizationId,user,date);
const current=()=>hourlyId(owner.organizationId,member,now);
it('counts only own visible unfinished assignments on Jerusalem date boundaries',async()=>{
 await task('private',{creatorId:member});await task('blocked',{status:'blocked',blockerReason:'Synthetic blocker'});
 await task('review',{status:'pending_review'});await task('complete',{status:'completed',completedAt:now,completedBy:owner.userId});await task('cancel',{status:'cancelled'});
 await task('company',{companyId:null});await task('domain',{domainId:'hourly-other-domain'});await task('owner',{ownerId:owner.userId});
 await task('ungranted',{ownerId:ungranted});await task('today',{dueDate:'2026-11-20'});
 expect(await count()).toBe(2);expect(await count(owner.userId)).toBe(1);expect(await count(ungranted)).toBe(0);
 expect(await count(member,new Date('2026-11-19T21:59:59Z'))).toBe(0);
 for(const role of ['viewer','admin']){
  await db.update(s.memberships).set({role}).where(eq(s.memberships.userId,member));
  expect(await count()).toBe(0);
 }
 await db.update(s.memberships).set({role:'contributor',active:false}).where(eq(s.memberships.userId,member));
 expect(await count()).toBe(0);
 await db.update(s.memberships).set({active:true}).where(eq(s.memberships.userId,member));
 await db.insert(s.memberships).values({id:'second-membership',organizationId:'hourly-other-org',userId:member,role:'contributor'});
 expect(await count()).toBe(0);
});
it('handles individual and shared completion without counting recurring, points, or no-deadline items',async()=>{
 const stamp=now.toISOString();
 await rhythm('single');
 await rhythm('own-report',{}, {reports:{[member]:stamp}});
 await rhythm('own-complete',{}, {completions:{[member]:stamp}});
 await rhythm('global-complete',{}, {completedAt:now});
 await rhythm('shared-report',{completionMode:'shared',assigneeIds:[member,owner.userId]},{reports:{[owner.userId]:stamp}});
 await rhythm('shared-completion',{completionMode:'shared',assigneeIds:[member,owner.userId]},{completions:{[owner.userId]:stamp}});
 await rhythm('shared-other',{completionMode:'shared'},{reports:{[ungranted]:stamp}});
 await rhythm('repeat',{frequency:'daily'});await rhythm('point',{category:'point'});
 await rhythm('no-deadline',{hasDeadline:false});await rhythm('archive',{archived:true});
 await rhythm('other',{assigneeIds:[owner.userId]});
 expect(await count()).toBe(2);expect(await count(owner.userId)).toBe(1);
});
it('queues once even with concurrent requests and after ack, expires only hourly and preserves ordinary reminders',async()=>{
 await task('queue');await subscribe();await subscribe(owner.userId,'owner');
 await db.insert(s.pushEvents).values({id:'legacy',organizationId:owner.organizationId,recipientId:member,title:'Legacy',body:'Legacy',url:'/'});
 await db.insert(s.overdueDigestRuns).values({id:'legacy-ledger',createdAt:new Date('2026-01-01')});
 const runs=await Promise.all([queueHourlyReminders(now),queueHourlyReminders(now)]);
 expect(runs[0]+runs[1]).toBe(1);
 expect(await pendingHourlyPush({organizationId:owner.organizationId,userId:member},now)).toMatchObject([{id:current()}]);
 const rows=await db.select().from(s.pushEvents);expect(rows.map(r=>r.id)).toEqual(['legacy']);
 expect(JSON.stringify(await pendingHourlyPush({organizationId:owner.organizationId,userId:member},now))).not.toContain('NEVER-PUSH');
 await acknowledgeHourlyPush(owner,[current()],now);
 expect(await pendingHourlyPush({organizationId:owner.organizationId,userId:member},now)).toMatchObject([{id:current()}]);
 await acknowledgeHourlyPush({...owner,userId:member},[current()],now);
 expect(await queueHourlyReminders(now)).toBe(0);
 const next=new Date('2026-11-19T23:00:00Z');expect(await queueHourlyReminders(next)).toBe(1);
 expect(await pendingHourlyPush({organizationId:owner.organizationId,userId:member},next)).toMatchObject([{id:hourlyId(owner.organizationId,member,next)}]);
 expect((await db.select().from(s.overdueDigestRuns)).some(r=>r.id==='legacy-ledger')).toBe(true);
});
it('rechecks changed assignment and pending review before reading or delivering',async()=>{
 await task('reassign');await task('review-later');await subscribe();await queueHourlyReminders(now);
 await db.update(s.tasks).set({ownerId:owner.userId}).where(eq(s.tasks.id,'reassign'));
 await db.update(s.tasks).set({status:'pending_review'}).where(eq(s.tasks.id,'review-later'));
 expect(await flushHourlyReminders(now)).toMatchObject({sent:0,skipped:1});expect(fetcher).not.toHaveBeenCalled();
 expect(await pendingHourlyPush({organizationId:owner.organizationId,userId:member},now)).toEqual([]);
});
it('retries only the unsuccessful device with empty payload, short TTL and separate topic',async()=>{
 await task('deliver');await subscribe(member,'a');await subscribe(member,'b');await queueHourlyReminders(now);
 fetcher.mockImplementation(async input=>new Response(null,{status:String(input)===endpoint('b')?503:201}));
 expect(await flushHourlyReminders(now)).toMatchObject({failed:1});
 expect(fetcher).toHaveBeenCalledTimes(2);
 for(const [,init] of fetcher.mock.calls){
  const headers=new Headers(init?.headers);
  expect(init?.body).toBeUndefined();expect(headers.get('urgency')).toBe('high');
  expect(headers.get('topic')).toMatch(/^hourly-/);expect(Number(headers.get('ttl'))).toBeLessThanOrEqual(1500);
 }
 fetcher.mockClear();fetcher.mockResolvedValue(new Response(null,{status:201}));
 expect(await flushHourlyReminders(now)).toMatchObject({sent:1});
 expect(fetcher.mock.calls.map(([url])=>url)).toEqual([endpoint('b')]);
});
it('does not share ordinary push flush and adds one current row beyond twenty ordinary rows',async()=>{
 const real=new Date();
 // Stable old date is overdue regardless of which minute this test runs.
 await task('ordinary-isolation',{dueDate:'2000-01-01'});
 await subscribe();await queueHourlyReminders(real);
 await flushPush();expect(fetcher).not.toHaveBeenCalled();
 await db.insert(s.pushEvents).values(Array.from({length:20},(_,i)=>({id:'ordinary-'+i,organizationId:owner.organizationId,recipientId:member,title:'Ordinary',body:'Ordinary',url:'/'})));
 const p={...owner,userId:member};const rows=await pendingPush(p);
 expect(rows).toHaveLength(21);expect(rows.slice(0,20).every(row=>row.id.startsWith('ordinary-'))).toBe(true);
 await acknowledgePush(p,{ids:rows.map(row=>row.id)});
 expect(await pendingPush(p)).toEqual([]);
});
it('keeps disabled hourly path inert',async()=>{
 const prior=process.env.HOURLY_REMINDERS_ENABLED;
 try {
  process.env.HOURLY_REMINDERS_ENABLED='false';
  await subscribe();await task('disabled');
  expect(await queueHourlyReminders(now)).toBe(0);
  expect(await flushHourlyReminders(now)).toEqual({sent:0,failed:0,skipped:0,remaining:0});
  expect(await db.select().from(s.pushEvents)).toEqual([]);expect(fetcher).not.toHaveBeenCalled();
 } finally { process.env.HOURLY_REMINDERS_ENABLED=prior; }
});
it('does not expose queued alerts after the assignee loses access',async()=>{
 await task('revoked-later');await subscribe();await queueHourlyReminders(now);
 await db.update(s.memberships).set({active:false}).where(eq(s.memberships.userId,member));
 expect(await pendingHourlyPush({organizationId:owner.organizationId,userId:member},now)).toEqual([]);
 expect(await flushHourlyReminders(now)).toMatchObject({sent:0});
 expect(fetcher).not.toHaveBeenCalled();
});
it('does not let a delayed prior-hour invocation delete or deliver a newer-hour reminder',async()=>{
 await task('hour-boundary');await subscribe();
 const next=new Date('2026-11-19T23:00:00Z');const nextId=hourlyId(owner.organizationId,member,next);
 expect(await queueHourlyReminders(next)).toBe(1);
 const principal={organizationId:owner.organizationId,userId:member};
 expect(await pendingHourlyPush(principal,now)).toEqual([]);
 expect(await queueHourlyReminders(now)).toBeLessThanOrEqual(1);
 await flushHourlyReminders(now);
 expect(fetcher.mock.calls.length).toBeLessThanOrEqual(1);
 const later=await db.select().from(s.overdueDigestRuns).where(eq(s.overdueDigestRuns.id,nextId+':sent'));
 expect(later).toEqual([]);
 expect(await pendingHourlyPush(principal,next)).toMatchObject([{id:nextId}]);
});
it('uses Jerusalem summer midnight while preserving unique UTC hours at the fall clock change',async()=>{
 await task('summer',{dueDate:'2026-07-01'});
 expect(await count(member,new Date('2026-07-01T20:59:59Z'))).toBe(0);
 expect(await count(member,new Date('2026-07-01T21:00:00Z'))).toBe(1);
 const first=new Date('2026-10-24T22:30:00Z'),second=new Date('2026-10-24T23:30:00Z');
 const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit'});
 expect(formatter.format(first)).toBe(formatter.format(second));
 expect(hourlyId(owner.organizationId,member,first)).not.toBe(hourlyId(owner.organizationId,member,second));
});
it('a disabled worker hides but does not erase an enabled worker’s fresh row',async()=>{
 await task('mixed-deployments');await subscribe();
 expect(await queueHourlyReminders(now)).toBe(1);
 const principal={organizationId:owner.organizationId,userId:member};
 const prior=process.env.HOURLY_REMINDERS_ENABLED;
 try {
  process.env.HOURLY_REMINDERS_ENABLED='false';
  expect(await pendingHourlyPush(principal,now)).toEqual([]);
 } finally { process.env.HOURLY_REMINDERS_ENABLED=prior; }
 expect(await pendingHourlyPush(principal,now)).toMatchObject([{id:current()}]);
});

it('keeps hourly state invisible to the original deployment’s reads, flush and ack',async()=>{
 await task('mixed-version',{dueDate:'2000-01-01'});await subscribe();
 const real=new Date(), id=hourlyId(owner.organizationId,member,real);
 await db.insert(s.pushEvents).values({id:'legacy-mixed',organizationId:owner.organizationId,recipientId:member,title:'Legacy',body:'Legacy',url:'/'});
 expect(await queueHourlyReminders(real)).toBe(1);
 expect(await db.select().from(s.pushEvents)).toMatchObject([{id:'legacy-mixed'}]);
 // Candidate predicates copied from 0fe3e15, without any prefix exclusions.
 const candidates=await db.select().from(s.pushEvents).where(and(isNull(s.pushEvents.sentAt),lt(s.pushEvents.attempts,5),
  sql`EXISTS (SELECT 1 FROM ${s.pushSubscriptions} WHERE ${s.pushSubscriptions.userId} = ${s.pushEvents.recipientId} AND ${s.pushSubscriptions.organizationId} = ${s.pushEvents.organizationId})`)).limit(50);
 expect(candidates.map(row=>row.id)).toEqual(['legacy-mixed']);
 const legacyInbox=await db.select().from(s.pushEvents).where(and(eq(s.pushEvents.organizationId,owner.organizationId),eq(s.pushEvents.recipientId,member))).orderBy(s.pushEvents.createdAt).limit(20);
 expect(legacyInbox.map(row=>row.id)).toEqual(['legacy-mixed']);
 await flushPush();expect(fetcher).toHaveBeenCalledTimes(1);
 expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('topic')).toBeNull();
 // Original ack can remove its own ordinary row only.
 await db.delete(s.pushEvents).where(and(eq(s.pushEvents.organizationId,owner.organizationId),eq(s.pushEvents.recipientId,member),eq(s.pushEvents.id,'legacy-mixed')));
 expect(await pendingHourlyPush({organizationId:owner.organizationId,userId:member},real)).toMatchObject([{id}]);
 expect(await db.select().from(s.pushEvents)).toEqual([]);
});
it('drains fifty eligible recipients per invocation without counting terminal markers against capacity',async()=>{
 const users=Array.from({length:54},(_,i)=>'synthetic-batch-'+i),org=owner.organizationId;
 await db.insert(s.user).values(users.map(id=>({id,name:id,email:id+'@example.test'})));
 await db.insert(s.memberships).values(users.map(id=>({id:'membership-'+id,userId:id,organizationId:org,role:'contributor'})));
 await db.insert(s.workspaceAccessGrants).values(users.map(userId=>({userId,organizationId:org,grantedBy:owner.userId})));
 await db.insert(s.pushSubscriptions).values(users.map(userId=>({id:'subscription-'+userId,organizationId:org,userId,endpoint:endpoint(userId),p256dh:'synthetic',auth:'synthetic'})));
 await db.insert(s.tasks).values(users.map(ownerId=>({id:'task-'+ownerId,title:'Synthetic',organizationId:org,ownerId,creatorId:owner.userId,domainId:'safety',dueDate:'2026-11-19'})));
 expect(await queueHourlyReminders(now)).toBe(54);
 const key=(userId:string)=>hourlyId(org,userId,now);
 await db.insert(s.overdueDigestRuns).values([key(users[0])+':sent',key(users[1])+':ack',
  ...Array.from({length:5},(_,i)=>key(users[2])+':attempt:'+i)].map(id=>({id,createdAt:now})));
 expect(await flushHourlyReminders(now)).toEqual({sent:50,failed:0,skipped:0,remaining:1});
 expect(await flushHourlyReminders(now)).toEqual({sent:1,failed:0,skipped:0,remaining:0});
 expect(await flushHourlyReminders(now)).toEqual({sent:0,failed:0,skipped:0,remaining:0});
 expect(new Set(fetcher.mock.calls.map(([url])=>url))).toEqual(new Set(users.slice(3).map(endpoint)));
});
