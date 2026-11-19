import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {getDb,closeDb} from '../src/server/db';
import {seedDemo} from '../src/server/seed';
import {principalFor,getWorkspace} from '../src/server/service';
import {grantAccess,getAccess,deleteAccess,renameAccessMember} from '../src/server/access';
import {createRhythmItem,getRhythm,saveRhythmGroup,deleteRhythmGroup,editRhythmItem} from '../src/server/rhythm';
import {createDocumentFolder,createDocument,getDocuments,updateDocument} from '../src/server/documents';
import {searchWorkspace} from '../src/server/search';
import type {Principal} from '../src/server/policy';
import * as s from '../src/server/schema';
let owner:Principal,editor:Principal,member:Principal;
beforeAll(async()=>{
 process.env.DEMO_MODE='true';process.env.PGLITE_DATA_DIR='memory://';delete process.env.DATABASE_URL;delete process.env.VERCEL;
 process.env.BETTER_AUTH_URL='http://localhost:3000';process.env.BETTER_AUTH_SECRET='shared-management-secret-12345678901234567890';process.env.DEMO_PASSWORD='shared-management-password-12345';process.env.DEMO_EMAIL='demo@samgad.example';
 await seedDemo();const users=await (await getDb()).select().from(s.user);
 const principal=async(email:string)=>{const u=users.find(u=>u.email===email)!;return principalFor(u.id,u.name);};
 owner=await principal('demo@samgad.example');
 await grantAccess(owner,{email:'contributor@samgad.example',level:'all'});
 await grantAccess(owner,{email:'company.a@samgad.example',level:'own'});
 editor=await principal('contributor@samgad.example');member=await principal('company.a@samgad.example');
},60000);
afterAll(closeDb);
it('co-manages access while preserving the real identity and protecting the original owner',async()=>{
 expect(editor.userId).not.toBe(owner.userId);expect(editor.workspaceOwnerId).toBe(owner.userId);expect(editor.manageAccess).toBe(true);
 expect((await getWorkspace(editor)).user).toMatchObject({id:editor.userId,workspaceOwnerId:owner.userId,permissions:{manageAccess:true}});
 await grantAccess(editor,{email:'company.b@samgad.example',level:'own'});
 const members=(await getAccess(editor)).members;expect(members.find(m=>m.id===owner.userId)?.level).toBe('owner');
 const [grant]=await (await getDb()).select().from(s.workspaceAccessGrants).where(eq(s.workspaceAccessGrants.userId,members.find(m=>m.email==='company.b@samgad.example')!.id));
 expect(grant.grantedBy).toBe(owner.userId);
 await expect(deleteAccess(editor,{userId:owner.userId})).rejects.toMatchObject({status:403});
 await expect(grantAccess(editor,{email:'demo@samgad.example',level:'view'})).rejects.toMatchObject({status:403});
});
it('lets full editors read, create and edit owner personal work',async()=>{
 const point=await createRhythmItem(owner,{clientRequestId:randomUUID(),title:'owner shared point',category:'point'});
 expect((await getRhythm(editor)).items.some(i=>i.id===point.id)).toBe(true);
 await expect(editRhythmItem(editor,point.id,{version:1,title:'co-managed point'})).resolves.toMatchObject({version:2});
 const added=await createRhythmItem(editor,{clientRequestId:randomUUID(),title:'added by co-manager',category:'point',personal:true,recipientIds:[owner.userId]});
 expect((await getRhythm(editor)).items.some(i=>i.id===added.id)).toBe(true);
 expect(added.creatorId).toBe(owner.userId);expect(added.assigneeIds).toEqual([owner.userId]);
 expect((await getRhythm(owner)).items.some(i=>i.id===added.id)).toBe(true);
 expect((await getRhythm(member)).items.some(i=>i.id===added.id)).toBe(false);
 await expect(createRhythmItem(member,{clientRequestId:randomUUID(),title:'unauthorized personal',personal:true})).rejects.toMatchObject({status:403});
});
it('persists nested library and meeting folders shared across managers, and accepts documents in them',async()=>{
 for(const section of ['library','records']){
 const key=randomUUID();const folder=await createDocumentFolder(editor,{name:'תיקייה משותפת',section,clientRequestId:key});
 expect((await createDocumentFolder(editor,{name:'תיקייה משותפת',section,clientRequestId:key})).id).toBe(folder.id);
 const child=await createDocumentFolder(owner,{name:'תיקייה פנימית',section,parent:folder.id,clientRequestId:randomUUID()});
 const doc=await createDocument(editor,{clientRequestId:randomUUID(),title:'folder-search-marker',body:'shared text',folderId:child.id});
 const documents=await getDocuments(owner);expect(documents.folders.find(f=>f.id===child.id)?.parent).toBe(folder.id);expect(documents.entries.some(e=>e.id===doc.id)).toBe(true);
 await updateDocument(owner,doc.id,{title:'folder-search-marker updated',body:'edited',folderId:child.id,version:1});
 expect((await searchWorkspace(editor,'folder-search-marker')).results.find(r=>r.id===doc.id)?.href).toContain(section==='records'?'view=records':'view=library');
 await expect(createDocumentFolder(editor,{name:'wrong section',section:section==='library'?'records':'library',parent:folder.id,clientRequestId:randomUUID()})).rejects.toMatchObject({status:422});
 }
 await expect(createDocumentFolder(member,{name:'forbidden',section:'library',clientRequestId:randomUUID()})).rejects.toMatchObject({status:403});
 await expect(createDocument(editor,{clientRequestId:randomUUID(),title:'invalid folder',body:'text',folderId:'missing'})).rejects.toMatchObject({status:422});
});
it('edits and deletes shared groups without recreating default roles or removing existing tasks',async()=>{
 const group=(await getRhythm(editor)).groups.find(g=>g.name==='סמ״פ א׳')!;
 const changed=await saveRhythmGroup(editor,{name:'קבוצה ששונתה',emails:['company.a@samgad.example'],version:group.version},group.id);
 expect((await getRhythm(owner)).groups.some(g=>g.id===group.id&&g.name==='קבוצה ששונתה')).toBe(true);
 const task=await createRhythmItem(editor,{clientRequestId:randomUUID(),title:'retained group task',groupIds:[group.id]});
 await deleteRhythmGroup(editor,group.id,{version:changed.version});
 expect((await getRhythm(owner)).groups.some(g=>g.id===group.id)).toBe(false);
 expect((await getRhythm(editor)).items.some(i=>i.id===task.id)).toBe(true);
 await expect(deleteRhythmGroup(member,group.id,{version:changed.version})).rejects.toMatchObject({status:403});
 const collection=(await getRhythm(editor)).groups.find(g=>g.name==='מטה 2')!;
 await saveRhythmGroup(editor,{name:'מטה 2',emails:['company.a@samgad.example'],version:collection.version},collection.id);
 expect((await getRhythm(owner)).groups.find(g=>g.id===collection.id)?.emails).toEqual(['company.a@samgad.example']);
});

it('renames a member by stable identity without modifying email, permissions or task assignments',async()=>{
 const db=await getDb();const [before]=await db.select().from(s.user).where(eq(s.user.id,member.userId));
 const [membershipBefore]=await db.select().from(s.memberships).where(eq(s.memberships.userId,member.userId));
 const task=await createRhythmItem(owner,{clientRequestId:randomUUID(),title:'assignment retained after rename',recipientIds:[member.userId]});
 await expect(renameAccessMember(editor,{userId:member.userId,name:'  שם מתוקן  '})).resolves.toMatchObject({member:{id:member.userId,name:'שם מתוקן'}});
 const [after]=await db.select().from(s.user).where(eq(s.user.id,member.userId));expect(after.email).toBe(before.email);expect(after.id).toBe(before.id);
 expect((await db.select().from(s.memberships).where(eq(s.memberships.userId,member.userId)))[0]).toEqual(membershipBefore);
 expect((await getAccess(owner)).members.find(m=>m.id===member.userId)?.name).toBe('שם מתוקן');
 expect((await getWorkspace(owner)).users.find(u=>u.id===member.userId)?.name).toBe('שם מתוקן');
 expect((await getRhythm(owner)).items.find(i=>i.id===task.id)?.assigneeIds).toEqual([member.userId]);
 await expect(renameAccessMember(member,{userId:owner.userId,name:'forbidden'})).rejects.toMatchObject({status:403});
 await expect(renameAccessMember({...editor,organizationId:'another-workspace'},{userId:member.userId,name:'forbidden'})).rejects.toMatchObject({status:404});
 await expect(renameAccessMember(owner,{userId:member.userId,name:'valid',email:'changed@example.com'})).rejects.toThrow();
 await expect(renameAccessMember(owner,{userId:member.userId,name:' '})).rejects.toThrow();
});
