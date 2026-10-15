import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { closeDb,getDb } from '../src/server/db';
import { seedDemo } from '../src/server/seed';
import { getAuth } from '../src/server/auth';
import { createTask,updateTask,addComment,createDecision,updateDecision,getWorkspace,principalFor } from '../src/server/service';
import * as s from '../src/server/schema';
import {undoRhythm} from '../src/server/rhythm';
import type { Principal } from '../src/server/policy';

let deputy:Principal,company:Principal,contributor:Principal,viewer:Principal;
beforeAll(async()=>{
  process.env.DEMO_MODE='true'; process.env.PGLITE_DATA_DIR='memory://'; delete process.env.DATABASE_URL; delete process.env.VERCEL;
  process.env.BETTER_AUTH_URL='http://localhost:3000'; process.env.BETTER_AUTH_SECRET='isolated-test-secret-for-auth-integration-123456789'; process.env.DEMO_PASSWORD='isolated-test-password-123456'; process.env.DEMO_EMAIL='demo@samgad.example';
  await seedDemo(); const db=await getDb(); const rows=await db.select().from(s.user);
  const p=async(email:string)=>{const u=rows.find(u=>u.email===email)!;return principalFor(u.id,u.name);};
  deputy=await p('demo@samgad.example'); company=await p('company.a@samgad.example'); contributor=await p('contributor@samgad.example'); viewer=await p('viewer@samgad.example');
},60_000);
afterAll(closeDb);
describe('persistent domain workflows',()=>{
  it('seeds real persisted counts and isolates every collection',async()=>{
    const all=await getWorkspace(deputy), scoped=await getWorkspace(company), assigned=await getWorkspace(contributor);
    expect(all.metrics.overdue).toBe(3);expect(all.metrics.blocked).toBe(0);expect(all.decisions.filter(d=>d.status==='pending')).toHaveLength(2);
    expect(scoped.tasks.every(t=>t.companyId==='company-a')).toBe(true);
    expect(scoped.decisions.every(d=>d.companyId==='company-a')).toBe(true);
    const ids=new Set([...scoped.tasks.map(t=>t.id),...scoped.decisions.map(d=>d.id)]);expect(scoped.activity.every(a=>ids.has(a.entityId))).toBe(true);
    expect(assigned.tasks.every(t=>t.ownerId===contributor.userId)).toBe(true);
  });
  it('creates with idempotency, persists progress, comments, completion and audit, rejects stale updates',async()=>{
    const input={title:'בדיקת תהליך מלא',description:'תיאור שנשמר',ownerId:company.userId,domainId:'safety',companyId:'company-a',clientRequestId:randomUUID()};
    const created=await createTask(deputy,input),retry=await createTask(deputy,input);expect(retry.id).toBe(created.id);
    await expect(createTask(deputy,{...input,title:'תוכן שונה'})).rejects.toMatchObject({status:409});
    const retryPatch={version:created.version,status:'in_progress',clientRequestId:randomUUID()};
    const running=await updateTask(deputy,created.id,retryPatch);expect(running.description).toBe(input.description);
    const retriedPatch=await updateTask(deputy,created.id,retryPatch);expect(retriedPatch.version).toBe(running.version);expect(retriedPatch.undoToken).toBe(running.undoToken);
    await expect(updateTask(deputy,created.id,{version:created.version,status:'blocked',blockerReason:'חסום'})).rejects.toMatchObject({status:409});
    await addComment(company,created.id,{body:'התקדמות נשמרה'});
    const completed=await updateTask(deputy,created.id,{version:running.version,status:'completed'});expect(completed.completedBy).toBe(deputy.userId);expect(completed.completedAt).toBeInstanceOf(Date);
    const workspace=await getWorkspace(deputy);expect(workspace.tasks.find(t=>t.id===created.id)?.comments).toHaveLength(1);expect(workspace.activity.filter(a=>a.entityId===created.id)).toHaveLength(4);
  });
  it('denies cross-company writes, viewer writes and ineligible assignees',async()=>{
    await expect(updateTask(company,'demo-task-3',{version:1,priority:'urgent'})).rejects.toMatchObject({status:404});
    await expect(addComment(viewer,'demo-task-1',{body:'אין הרשאה'})).rejects.toMatchObject({status:403});
    await expect(createTask(deputy,{title:'שיוך לא תקין',ownerId:company.userId,domainId:'safety',companyId:'company-b'})).rejects.toMatchObject({status:422});
    await expect(createTask(company,{title:'מחוץ לתחום',ownerId:company.userId,domainId:'safety',companyId:'company-b'})).rejects.toMatchObject({status:403});
  });
  it('rechecks current scope before replaying an earlier mutation response',async()=>{
    const input={title:'בדיקת הרשאות בחזרה על בקשה',ownerId:company.userId,domainId:'safety',companyId:'company-a',clientRequestId:randomUUID()};
    const task=await createTask(company,input);
    await updateTask(deputy,task.id,{version:task.version,companyId:'company-b',ownerId:deputy.userId});
    await expect(createTask(company,input)).rejects.toMatchObject({status:404});
  });
  it('contributor can update own status but not ownership or a review-required completion',async()=>{
    const task=await createTask(deputy,{title:'משימה לבדיקת הרשאות',ownerId:contributor.userId,domainId:'people',companyId:'company-a',requiresReview:true});
    const running=await updateTask(contributor,task.id,{version:task.version,status:'in_progress'});
    expect(running.description).toBe('');
    await expect(updateTask(contributor,task.id,{version:running.version,ownerId:deputy.userId})).rejects.toMatchObject({status:403});
    const review=await updateTask(contributor,task.id,{version:running.version,status:'pending_review'});
    await expect(updateTask(contributor,task.id,{version:review.version,status:'completed'})).rejects.toMatchObject({status:403});
    await expect(updateTask(deputy,task.id,{version:review.version,status:'completed'})).resolves.toMatchObject({status:'completed'});
  });
  it('requires designated decision maker and preserves task state',async()=>{
    const decision=await createDecision(company,{title:'בקשת אישור לבדיקה',domainId:'safety',companyId:'company-a',deciderId:deputy.userId,taskId:'demo-task-1'});
    await expect(updateDecision(company,decision.id,{version:1,status:'approved',notes:'אישור לא מורשה'})).rejects.toMatchObject({status:403});
    const result=await updateDecision(deputy,decision.id,{version:1,status:'approved',notes:'אושר לצורך הדגמה'});expect(result.resolvedAt).toBeInstanceOf(Date);
    expect((await getWorkspace(deputy)).tasks.find(t=>t.id==='demo-task-1')?.status).toBe('in_progress');
    await expect(updateDecision(deputy,decision.id,{version:2,status:'rejected',notes:'שינוי לאחר סגירה'})).rejects.toMatchObject({status:422});
  });
  it('database rejects cross-organization relationships and immutable audit changes',async()=>{
    const db=await getDb();await db.insert(s.organizations).values({id:'other-org',name:'Isolated'});await db.insert(s.domains).values({id:'other-domain',organizationId:'other-org',name:'Isolated'});
    await expect(db.insert(s.tasks).values({id:randomUUID(),organizationId:'demo-org',domainId:'other-domain',title:'Invalid',creatorId:deputy.userId,ownerId:deputy.userId})).rejects.toThrow();
    const [audit]=await db.select().from(s.auditEvents).limit(1);await expect(db.update(s.auditEvents).set({summary:'tampered'}).where(eq(s.auditEvents.id,audit.id))).rejects.toThrow();
  });
  it('uses genuine Better Auth credentials and sessions, rejects public sign-up',async()=>{
    const auth=await getAuth();const session=await auth.api.signInEmail({body:{email:'demo@samgad.example',password:process.env.DEMO_PASSWORD!}});expect(session.token).toBeTruthy();
    await expect(auth.api.signInEmail({body:{email:'demo@samgad.example',password:'incorrect-password'}})).rejects.toThrow();
    await expect(auth.api.signUpEmail({body:{email:'unauthorized@samgad.example',name:'Unauthorized',password:'unapproved-password'}})).rejects.toThrow();
  });
});

describe('ordinary task undo',()=>{
  it('restores completion without overwriting newer edits',async()=>{
    const task=await createTask(deputy,{title:'בדיקת ביטול רגילה',ownerId:deputy.userId,domainId:'safety'});
    const done=await updateTask(deputy,task.id,{version:1,status:'completed'});
    await undoRhythm(deputy,{token:done.undoToken});
    const restored=(await getWorkspace(deputy)).tasks.find(t=>t.id===task.id)!;
    expect(restored.status).toBe('open');expect(restored.completedAt).toBeNull();
    await expect(undoRhythm(deputy,{token:done.undoToken})).rejects.toMatchObject({status:409});
  });
});
