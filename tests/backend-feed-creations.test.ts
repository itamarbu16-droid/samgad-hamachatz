import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {seedDemo} from '../src/server/seed';
import {getDb,closeDb} from '../src/server/db';
import {principalFor,getWorkspace,dismissActivity} from '../src/server/service';
import {createDocument,createDocumentFolder,manageDocuments,duplicateDocument} from '../src/server/documents';
import {createRhythmItem} from '../src/server/rhythm';
import {grantAccess} from '../src/server/access';
import type {Principal} from '../src/server/policy';
import * as s from '../src/server/schema';
let owner:Principal,member:Principal,other:Principal;
beforeAll(async()=>{
 process.env.DEMO_MODE='true';process.env.PGLITE_DATA_DIR='memory://';delete process.env.DATABASE_URL;delete process.env.VERCEL;
 process.env.BETTER_AUTH_URL='http://localhost:3000';process.env.BETTER_AUTH_SECRET='feed-tests-isolated-secret-12345678901234567890';process.env.DEMO_PASSWORD='isolated-password-12345';process.env.DEMO_EMAIL='demo@samgad.example';
 await seedDemo();const users=await(await getDb()).select().from(s.user);
 const p=(email:string)=>{const u=users.find(u=>u.email===email)!;return principalFor(u.id,u.name);};owner=await p('demo@samgad.example');
 for(const email of ['company.a@samgad.example','contributor@samgad.example'])await grantAccess(owner,{email,level:'own'});
 member=await p('company.a@samgad.example');other=await p('contributor@samgad.example');
},60000);
afterAll(closeDb);
it('emits one document update with full custom nested destination; applies current access and personal dismissal',async()=>{
 const folder=await createDocumentFolder(owner,{name:'תיקיית בדיקה',parent:'formats-meetings',section:'library',clientRequestId:randomUUID()});
 const input={title:'מסמך סינתטי',body:'בדיקה בלבד',folderId:folder.id,clientRequestId:randomUUID()};
 const doc=await createDocument(owner,input);await createDocument(owner,input);
 const events=(await getWorkspace(member)).activity.filter(e=>e.entityId===doc.id);
 expect(events).toHaveLength(1);expect(events[0].summary).toBe('נוסף מסמך: מסמך סינתטי · תיקייה: פורמטים / ישיבות / תיקיית בדיקה');
 await dismissActivity(member,events[0].id,{dismissed:true});
 expect((await getWorkspace(member)).dismissedActivity.some(e=>e.id===events[0].id)).toBe(true);
 expect((await getWorkspace(owner)).activity.some(e=>e.id===events[0].id)).toBe(true);
 await expect(dismissActivity({...member,organizationId:'other'},events[0].id,{dismissed:true})).rejects.toMatchObject({status:404});
 await expect(dismissActivity({...member,role:'admin'},events[0].id,{dismissed:true})).rejects.toMatchObject({status:404});
 await manageDocuments(owner,{action:'trash',items:[{id:doc.id,version:1}]});
 expect((await getWorkspace(member)).dismissedActivity.some(e=>e.id===events[0].id)).toBe(false);
 await expect(dismissActivity(member,events[0].id,{dismissed:false})).rejects.toMatchObject({status:404});
});
it('includes only accessible newly created one-off tasks, once, and follows reassignment/archive',async()=>{
 const input={title:'משימה סינתטית',recipientIds:[member.userId],clientRequestId:randomUUID()};
 const item=await createRhythmItem(owner,input);await createRhythmItem(owner,input);
 const events=(await getWorkspace(member)).activity.filter(e=>e.entityId===item.id);
 expect(events).toHaveLength(1);expect(events[0].summary).toContain(input.title);
 expect((await getWorkspace(other)).activity.some(e=>e.id===events[0].id)).toBe(false);
 await expect(dismissActivity(other,events[0].id,{dismissed:true})).rejects.toMatchObject({status:404});
 const db=await getDb();await db.update(s.rhythmItems).set({assigneeIds:[other.userId]}).where(eq(s.rhythmItems.id,item.id));
 expect((await getWorkspace(member)).activity.some(e=>e.id===events[0].id)).toBe(false);
 expect((await getWorkspace(other)).activity.some(e=>e.id===events[0].id)).toBe(true);
 await db.update(s.rhythmItems).set({archived:true}).where(eq(s.rhythmItems.id,item.id));
 expect((await getWorkspace(other)).activity.some(e=>e.id===events[0].id)).toBe(false);
 for(const extra of [{category:'point'},{frequency:'weekly'}]){
 const excluded=await createRhythmItem(owner,{title:'פריט מחוץ להיקף',clientRequestId:randomUUID(),...extra});
 expect((await getWorkspace(owner)).activity.some(e=>e.entityId===excluded.id)).toBe(false);
 }
 const personal=await createRhythmItem(owner,{title:'משימה אישית',personal:true,clientRequestId:randomUUID()});
 expect((await getWorkspace(owner)).activity.some(e=>e.entityId===personal.id)).toBe(true);
 expect((await getWorkspace(member)).activity.some(e=>e.entityId===personal.id)).toBe(false);
});

it('does not backfill old documents or tasks and emits one update for a new tracker copy',async()=>{
 const db=await getDb();const legacyId=randomUUID();
 await db.insert(s.documentEntries).values({id:legacyId,organizationId:owner.organizationId,creatorId:owner.userId,title:'מסמך היסטורי',folderId:'orders',body:'סינתטי'});
 expect((await getWorkspace(owner)).activity.some(e=>e.entityId===legacyId)).toBe(false);
 const original=await createDocument(owner,{title:'מעקב מקורי',body:'סינתטי',folderId:'trackers',clientRequestId:randomUUID()});
 const input={title:'מעקב מועתק',folderId:'trackers',clientRequestId:randomUUID()};
 const copy=await duplicateDocument(owner,original.id,input);await duplicateDocument(owner,original.id,input);
 const events=(await getWorkspace(member)).activity.filter(e=>e.entityId===copy.id);
 expect(events).toHaveLength(1);expect(events[0].summary).toBe('נוסף מסמך: מעקב מועתק · תיקייה: מעקבים');
});
