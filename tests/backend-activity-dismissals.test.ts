import {beforeAll,afterAll,it,expect} from 'vitest';
import {eq} from 'drizzle-orm';
import {seedDemo} from '../src/server/seed';
import {getDb,closeDb} from '../src/server/db';
import {principalFor,createTask,getWorkspace,dismissActivity} from '../src/server/service';
import type {Principal} from '../src/server/policy';
import * as s from '../src/server/schema';
let owner:Principal,member:Principal,other:Principal;
beforeAll(async()=>{
 process.env.DEMO_MODE='true';process.env.PGLITE_DATA_DIR='memory://';delete process.env.DATABASE_URL;delete process.env.VERCEL;
 process.env.BETTER_AUTH_URL='http://localhost:3000';process.env.BETTER_AUTH_SECRET='activity-tests-isolated-secret-12345678901234567890';process.env.DEMO_PASSWORD='isolated-password-12345';process.env.DEMO_EMAIL='demo@samgad.example';
 await seedDemo();const users=await(await getDb()).select().from(s.user);
 const p=(email:string)=>{const u=users.find(u=>u.email===email)!;return principalFor(u.id,u.name);};owner=await p('demo@samgad.example');member=await p('company.a@samgad.example');other=await p('contributor@samgad.example');
},60000);
afterAll(closeDb);
it('removes and restores only my update feed, preserving task and audit event',async()=>{
 const task=await createTask(owner,{title:'עדכון לבדיקה',ownerId:member.userId,domainId:'safety',companyId:'company-a'});
 const event=(await getWorkspace(owner)).activity.find(a=>a.entityId===task.id)!;
 expect(event).toBeTruthy();
 await dismissActivity(owner,event.id,{dismissed:true});await dismissActivity(owner,event.id,{dismissed:true});
 const state=await getWorkspace(owner);
 expect(state.activity.some(a=>a.id===event.id)).toBe(false);
 expect(state.dismissedActivity.filter(a=>a.id===event.id)).toHaveLength(1);
 expect(state.tasks.some(t=>t.id===task.id)).toBe(true);
 expect((await getWorkspace(member)).activity.some(a=>a.id===event.id)).toBe(true);
 expect(await(await getDb()).select().from(s.auditEvents).where(eq(s.auditEvents.id,event.id))).toHaveLength(1);
 await dismissActivity(owner,event.id,{dismissed:false});await dismissActivity(owner,event.id,{dismissed:false});
 expect((await getWorkspace(owner)).activity.some(a=>a.id===event.id)).toBe(true);
});
it('rejects inaccessible events, cross-organization access and invalid body',async()=>{
 const task=await createTask(owner,{title:'עדכון פרטי',ownerId:owner.userId,domainId:'safety'});
 const event=(await getWorkspace(owner)).activity.find(a=>a.entityId===task.id)!;
 await expect(dismissActivity(other,event.id,{dismissed:true})).rejects.toMatchObject({status:404});
 await expect(dismissActivity({...owner,organizationId:'wrong'},event.id,{dismissed:false})).rejects.toMatchObject({status:404});
 await expect(dismissActivity(owner,event.id,{dismissed:'yes'})).rejects.toBeTruthy();
});
