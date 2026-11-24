import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {eq,like} from 'drizzle-orm';
import {seedDemo} from '../src/server/seed';
import {getDb,closeDb,type Database} from '../src/server/db';
import {principalFor} from '../src/server/service';
import {pushKey} from '../src/server/notifications';
import {sendManualTaskReminder} from '../src/server/manual-task-reminders';
import {pendingManualReminder} from '../src/server/manual-task-reminder-state';
import {getManualDeviceKey,enrollManualDevice,manualDeviceStatus,removeManualDevice,checkManualDevice,manualDeviceScopes} from '../src/server/manual-device-push';
import * as s from '../src/server/schema';
import type {Principal} from '../src/server/policy';
let db:Database, owner:Principal, member:Principal, other:Principal;
let request:ReturnType<typeof vi.fn<typeof fetch>>;
const now=new Date('2026-11-23T22:35:00Z');
const origin='https://app.example.test', differentOrigin='https://other.example.test';
const endpoint=(device:string)=>'https://fcm.googleapis.com/fcm/send/manual-push-synthetic-'+device;
const device=(name:string)=>({version:1 as const,endpoint:endpoint(name)});
beforeAll(async()=>{
 vi.stubEnv('DATABASE_URL',undefined);vi.stubEnv('VERCEL',undefined);
 vi.stubEnv('DEMO_MODE','true');vi.stubEnv('PGLITE_DATA_DIR','memory://');
 vi.stubEnv('BETTER_AUTH_URL','http://localhost:3000');vi.stubEnv('BETTER_AUTH_SECRET','synthetic-manual-device-test-secret-123456789');
 vi.stubEnv('DEMO_PASSWORD','synthetic-manual-device-password');vi.stubEnv('DEMO_EMAIL','demo@samgad.example');
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
 request=vi.fn<typeof fetch>(async()=>new Response(null,{status:201}));
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Real push transport forbidden');}));
 await db.delete(s.pushSubscriptions);await db.delete(s.pushEvents);await db.delete(s.overdueDigestRuns);
 await db.delete(s.pushConfig).where(like(s.pushConfig.organizationId,'manual-phone-v1-device:%'));
 await db.update(s.memberships).set({active:true}).where(eq(s.memberships.userId,member.userId));
});
afterEach(()=>{try{expect(globalThis.fetch).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}});
async function task(id:string,changes:Partial<typeof s.tasks.$inferInsert>={}){
 await db.insert(s.tasks).values({id,organizationId:owner.organizationId,companyId:'company-a',domainId:'safety',ownerId:member.userId,creatorId:owner.userId,dueDate:'2026-11-23',title:'NEVER-SEND-SYNTHETIC-TASK-TITLE',...changes});
}
const send=(id:string,from=origin)=>sendManualTaskReminder(owner,{kind:'task',id,version:1},{now,origin:from,request});
const enroll=async(p:Principal,name:string,from=origin)=>{
 await getManualDeviceKey(p,from,true);
 return enrollManualDevice(p,from,device(name));
};

it('uses a distinct origin-bound VAPID key with no legacy mailbox/config join',async()=>{
 const ordinary=await pushKey(owner);
 const first=await getManualDeviceKey(member,origin,true);
 const same=await getManualDeviceKey(other,origin);
 const second=await getManualDeviceKey(member,differentOrigin,true);
 expect(first).toMatchObject({version:1,publicKey:expect.any(String)});
 expect(first.publicKey).not.toBe(ordinary.publicKey);
 expect(first).toEqual(same);expect(second.publicKey).not.toBe(first.publicKey);
 const scopes=manualDeviceScopes(origin,owner.organizationId);
 expect(scopes.mailbox).not.toBe(scopes.config);
 await enrollManualDevice(member,origin,device('separate-key'));
 expect(await manualDeviceStatus(member,origin,device('separate-key'))).toEqual({registered:true});
 const config=await db.select().from(s.pushConfig).where(eq(s.pushConfig.organizationId,scopes.mailbox));
 expect(config).toEqual([]);
 expect(await db.select().from(s.pushSubscriptions)).toEqual([]);
 const legacyJoin=await db.select().from(s.pushSubscriptions).innerJoin(s.pushConfig,eq(s.pushSubscriptions.organizationId,s.pushConfig.organizationId));
 expect(legacyJoin).toEqual([]);
 expect(request).not.toHaveBeenCalled();
});

it('cannot promote an existing ordinary endpoint into the manual channel',async()=>{
 await getManualDeviceKey(member,origin,true);
 await db.insert(s.pushSubscriptions).values({id:'ordinary-endpoint',organizationId:member.organizationId,userId:member.userId,endpoint:endpoint('ordinary'),p256dh:'synthetic',auth:'synthetic'});
 await expect(enrollManualDevice(member,origin,device('ordinary'))).rejects.toBeDefined();
 expect(await manualDeviceStatus(member,origin,device('ordinary'))).toEqual({registered:false});
 await task('ordinary-not-enrolled');
 expect(await send('ordinary-not-enrolled')).toMatchObject({created:1,accepted:0,notEnrolled:1});
 expect((await db.select().from(s.pushSubscriptions)).map(row=>row.id)).toEqual(['ordinary-endpoint']);
 expect(request).not.toHaveBeenCalled();
});

it('does not deliver an unsolicited wake, or reveal registration to another account or origin',async()=>{
 await enroll(member,'scoped');
 expect(await checkManualDevice(member,origin,device('scoped'),now)).toEqual({show:false});
 expect(await manualDeviceStatus(other,origin,device('scoped'))).toEqual({registered:false});
 expect(await manualDeviceStatus(member,differentOrigin,device('scoped'))).toEqual({registered:false});
 await expect(enrollManualDevice(member,origin,{...device('wrong-version'),version:2})).rejects.toBeDefined();
 await getManualDeviceKey(other,origin,true);
 await expect(enrollManualDevice(other,origin,device('scoped'))).rejects.toMatchObject({status:409});
 expect(await manualDeviceStatus(member,origin,device('scoped'))).toEqual({registered:true});
 expect(await manualDeviceStatus(other,origin,device('scoped'))).toEqual({registered:false});
 await removeManualDevice(other,origin,device('scoped'));
 expect(await manualDeviceStatus(member,origin,device('scoped'))).toEqual({registered:true});
 await removeManualDevice(member,origin,device('scoped'));
 expect(await enrollManualDevice(other,origin,device('scoped'))).toEqual({registered:true});
 expect(await manualDeviceStatus(other,origin,device('scoped'))).toEqual({registered:true});
 await removeManualDevice(other,origin,device('scoped'));
 await enroll(member,'scoped');
 await task('scoped-task');
 expect(await send('scoped-task',differentOrigin)).toMatchObject({created:1,accepted:0,notEnrolled:1});
 expect(request).not.toHaveBeenCalled();
 expect(await checkManualDevice(member,origin,device('scoped'),now)).toEqual({show:false});
});

it('dedupes concurrent sends, signs with the manual key, and wakes only the enrolled assignee without payload',async()=>{
 await enroll(member,'target');await enroll(other,'not-target');
 await task('send-private-id');
 const [a,b]=await Promise.all([send('send-private-id'),send('send-private-id')]);
 expect(a.accepted+b.accepted).toBe(1);expect(a.throttled+b.throttled).toBe(1);
 expect(request).toHaveBeenCalledTimes(1);expect(String(request.mock.calls[0][0])).toBe(endpoint('target'));
 const init=request.mock.calls[0][1], key=(await getManualDeviceKey(member,origin)).publicKey;
 expect(init?.body==null||init.body==='').toBe(true);
 const headers=new Headers(init?.headers);
 expect(headers.get('authorization')).toContain('k='+key);
 expect(headers.get('authorization')).not.toContain('k='+(await pushKey(owner)).publicKey);
 const serialized=JSON.stringify(request.mock.calls);
 for(const secret of ['send-private-id','NEVER-SEND-SYNTHETIC-TASK-TITLE',member.userId,other.userId])expect(serialized).not.toContain(secret);
 const checks=await Promise.all([checkManualDevice(member,origin,device('target'),now),checkManualDevice(member,origin,device('target'),now)]);
 expect(checks.filter(result=>result.show)).toHaveLength(1);
 expect(await checkManualDevice(member,origin,device('target'),now)).toEqual({show:false});
 expect(await checkManualDevice(other,origin,device('not-target'),now)).toEqual({show:false});
 expect(await db.select().from(s.pushEvents)).toEqual([]);
});

it('counts multiple accepted handsets once, and removes a revoked association from account checks',async()=>{
 await enroll(member,'one');await enroll(member,'two');await task('two-handsets');
 expect(await send('two-handsets')).toMatchObject({created:1,accepted:1,unconfirmed:0});
 expect(request).toHaveBeenCalledTimes(2);
 await removeManualDevice(member,origin,device('one'));
 expect(await manualDeviceStatus(member,origin,device('one'))).toEqual({registered:false});
 expect(await checkManualDevice(member,origin,device('one'),now)).toEqual({show:false});
 await db.update(s.memberships).set({active:false}).where(eq(s.memberships.userId,member.userId));
 await expect(checkManualDevice(member,origin,device('two'),now)).rejects.toMatchObject({status:403});
});

it('expires unused device wake authorization after two minutes without expiring the in-app reminder',async()=>{
 await enroll(member,'expired');await task('expired-wake');
 expect(await send('expired-wake')).toMatchObject({created:1,accepted:1});
 expect(await checkManualDevice(member,origin,device('expired'),new Date(now.getTime()+121000))).toEqual({show:false});
 expect(await pendingManualReminder(member,new Date(now.getTime()+121000))).toHaveLength(1);
});

it('suppresses a dedicated wake if an older deployment subsequently claims its endpoint in the ordinary table',async()=>{
 await enroll(member,'late-ordinary');await task('late-legacy-conflict');
 await db.insert(s.pushSubscriptions).values({id:'late-ordinary',organizationId:member.organizationId,userId:member.userId,endpoint:endpoint('late-ordinary'),p256dh:'synthetic',auth:'synthetic'});
 expect(await send('late-legacy-conflict')).toMatchObject({created:1,accepted:0,notEnrolled:1});
 expect(request).not.toHaveBeenCalled();
 expect(await checkManualDevice(member,origin,device('late-ordinary'),now)).toEqual({show:false});
 expect((await db.select().from(s.pushSubscriptions)).map(row=>row.id)).toEqual(['late-ordinary']);
});
