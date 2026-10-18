import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {closeDb,getDb} from '../src/server/db';
import {seedDemo} from '../src/server/seed';
import {principalFor,createTask,updateTask,getWorkspace} from '../src/server/service';
import {createRhythmItem,getRhythm,editRhythmItem,completeRhythm} from '../src/server/rhythm';
import {getAuth} from '../src/server/auth';
import {grantAccess,deleteAccess,getAccess,publicPrincipal,assertEmailAccess} from '../src/server/access';
import {searchWorkspace} from '../src/server/search';
import {taskTone,compareTasks} from '../src/lib/task-display';
import {api} from '../src/server/http';
import {POST as signInRoute} from '../src/app/api/auth/[...all]/route';
import {GET as workspaceRoute} from '../src/app/api/workspace/route';
import {localDate,type Principal} from '../src/server/policy';
import * as s from '../src/server/schema';
let owner:Principal,company:Principal,other:Principal;
const today=localDate();
beforeAll(async()=>{process.env.DEMO_MODE='true';process.env.PGLITE_DATA_DIR='memory://';delete process.env.DATABASE_URL;delete process.env.VERCEL;process.env.BETTER_AUTH_URL='http://localhost:3000';process.env.BETTER_AUTH_SECRET='isolated-access-secret-12345678901234567890';process.env.DEMO_PASSWORD='isolated-access-password-12345';process.env.DEMO_EMAIL='demo@samgad.example';await seedDemo();const users=await (await getDb()).select().from(s.user);const p=(email:string)=>{const u=users.find(u=>u.email===email)!;return principalFor(u.id,u.name);};owner=await p('demo@samgad.example');company=await p('company.a@samgad.example');other=await p('contributor@samgad.example');},60000);
afterAll(closeDb);
it('maps deadlines with completed taking precedence and null dates last',()=>{
 expect(taskTone(true,'2000-01-01',today)).toBe('task-done');expect(taskTone(false,'2000-01-01',today)).toBe('task-overdue');expect(taskTone(false,today,today)).toBe('task-due-soon');expect(taskTone(false,null,today)).toBe('');
 const a={id:'a',title:'a',done:false,dueDate:'2026-12-01'},b={...a,id:'b',dueDate:'2026-10-01'};expect(compareTasks(a,b,'deadline_desc')).toBeLessThan(0);expect(compareTasks({...a,dueDate:null},b,'deadline_desc')).toBeGreaterThan(0);
});
it('hides private tasks and points from guests, other assignees while co-managers share owner records',async()=>{
 const privateItem=await createRhythmItem(owner,{clientRequestId:randomUUID(),title:'private-owner-secret',category:'point'});
 const privateTask=await createTask(owner,{title:'private-owner-legacy',ownerId:owner.userId,domainId:'safety'});
 const publicView:Principal={userId:'public-viewer',organizationId:owner.organizationId,role:'viewer',name:'guest',companyId:null,domainId:null,guest:true};
 await grantAccess(owner,{email:'contributor@samgad.example',level:'all'});const editor=await principalFor(other.userId,other.name);
 for(const p of [publicView,company]){
  expect((await getRhythm(p)).items.some(i=>i.id===privateItem.id)).toBe(false);
  expect((await getWorkspace(p)).tasks.some(i=>i.id===privateTask.id)).toBe(false);
  expect((await searchWorkspace(p,'private-owner')).results).toHaveLength(0);
  await expect(editRhythmItem(p,privateItem.id,{version:1,title:'stolen'})).rejects.toMatchObject({status:p.guest?403:404});
 }
 expect((await getRhythm(editor)).items.some(i=>i.id===privateItem.id)).toBe(true);
 expect((await getWorkspace(editor)).tasks.some(i=>i.id===privateTask.id)).toBe(true);
 await expect(editRhythmItem(editor,privateItem.id,{version:1,title:'shared manager update'})).resolves.toMatchObject({version:2});
 const guest=await getRhythm(publicView);expect(guest.groups).toHaveLength(0);expect(guest.people.every(p=>p.email==='')).toBe(true);
 await grantAccess(owner,{email:'contributor@samgad.example',level:'own'});
});
it('allows assigned users to edit their task but not assignments, other tasks or permissions',async()=>{
 const mine=await createTask(owner,{title:'assigned own edit',ownerId:company.userId,domainId:'safety',companyId:'company-a'});
 await expect(updateTask(company,mine.id,{version:1,title:'updated by assigned user'})).resolves.toMatchObject({title:'updated by assigned user'});
 await expect(updateTask(company,mine.id,{version:2,ownerId:owner.userId})).rejects.toMatchObject({status:403});
 await expect(grantAccess(company,{email:'other@example.com',level:'all'})).rejects.toMatchObject({status:403});
 await expect(getAccess(company)).rejects.toMatchObject({status:403});
 const task=await createRhythmItem(owner,{clientRequestId:randomUUID(),title:'assigned rhythm edit',recipientIds:[company.userId]});
 await expect(editRhythmItem(company,task.id,{version:1,title:'assigned title updated',recipientIds:[company.userId]})).resolves.toMatchObject({version:2});
 const multi=await createRhythmItem(owner,{clientRequestId:randomUUID(),title:'shared assigned fields',recipientIds:[company.userId,other.userId]});
 await expect(editRhythmItem(company,multi.id,{version:1,title:'allowed shared edit',recipientIds:[company.userId,other.userId]})).resolves.toMatchObject({version:2});
 await expect(editRhythmItem(company,task.id,{version:2,category:'point'})).rejects.toMatchObject({status:403});
 const row=(await getRhythm(company)).occurrences.find(r=>r.itemId===task.id)!;
 await completeRhythm(company,row.id,{version:row.version,done:true});
 expect((await getRhythm(owner)).occurrences.find(r=>r.id===row.id)?.done).toBe(false);
});
it('grants and revokes global editing by email with shared access administration',async()=>{
 const task=await createTask(owner,{title:'edit everyone grant',ownerId:company.userId,domainId:'safety',companyId:'company-a'});
 await grantAccess(owner,{email:'contributor@samgad.example',level:'all'});let editor=await principalFor(other.userId,other.name);
 expect(editor.editAll).toBe(true);expect(editor.manageAccess).toBe(true);
 const workspace=await getWorkspace(editor);
 expect(workspace.user).toMatchObject({role:'deputy',permissions:{editAll:true,manageAccess:true}});
 await expect(updateTask(editor,task.id,{version:1,title:'global edit saved',dueDate:today})).resolves.toMatchObject({version:2,dueDate:today});
 await grantAccess(editor,{email:'viewer@samgad.example',level:'all'});
 expect((await principalFor((await getAccess(owner)).members.find(m=>m.email==='viewer@samgad.example')!.id,'viewer')).manageAccess).toBe(true);
 await grantAccess(owner,{email:'viewer@samgad.example',level:'view'});
 await grantAccess(owner,{email:'contributor@samgad.example',level:'own'});editor=await principalFor(other.userId,other.name);
 await expect(updateTask(editor,task.id,{version:2,title:'unauthorized after revoke'})).rejects.toMatchObject({status:404});
 await expect(grantAccess(owner,{email:'demo@samgad.example',level:'revoke'})).rejects.toMatchObject({status:403});
});
it('returns exactly eight requested responsibility domains in order',async()=>{
 expect((await getWorkspace(owner)).domains.map(d=>d.name)).toEqual(['סמ״פים','תקשוב','טנ״א','לוגיסטיקה','בינוי','הובלות','רפואה','נשקייה ותחמושת']);
});
it('provisions a new email only with an initial password and never resets existing account passwords',async()=>{
 await expect(grantAccess(owner,{email:'new-role@example.com',level:'own'})).rejects.toMatchObject({status:422});
 await grantAccess(owner,{email:'new-role@example.com',name:'בעל תפקיד חדש',level:'own',password:'new-role-password-12345'});
 const signed=await (await getAuth()).api.signInEmail({body:{email:'new-role@example.com',password:'new-role-password-12345'}});expect(signed.user.email).toBe('new-role@example.com');
 const list=await getAccess(owner);expect(list.members.find(m=>m.email==='new-role@example.com')).toMatchObject({level:'own',active:true});
 await grantAccess(owner,{email:'new-role@example.com',level:'revoke'});
 expect((await getAccess(owner)).members.find(m=>m.email==='new-role@example.com')?.active).toBe(false);
});

it('denies anonymous data requests and unknown emails even when legacy public-read is enabled',async()=>{
 await expect(publicPrincipal()).rejects.toMatchObject({status:401});
 const result=await api(new Request('http://localhost:3000/api/workspace'),getWorkspace);
 expect(result.status).toBe(401);
 await expect(assertEmailAccess('unknown@samgad.example')).rejects.toMatchObject({status:403});
 const deniedLogin=await signInRoute(new Request('http://localhost:3000/api/auth/sign-in/email',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email:'unknown@samgad.example',password:'invalid-password-12345'})}));
 expect(deniedLogin.status).toBe(403);expect(deniedLogin.headers.get('set-cookie')).toBeNull();
 await expect(assertEmailAccess(' DEMO@SAMGAD.EXAMPLE ')).resolves.toBeUndefined();
 expect((await getAccess(owner)).publicRead).toBe(false);
});
it('enforces email grants and revocation on an already signed-in session without guest fallback',async()=>{
 const email='session-member@example.com',password='isolated-session-password-12345';
 await grantAccess(owner,{email,name:'סמ״פ בדיקה',level:'own',password});
 const response=await signInRoute(new Request('http://localhost:3000/api/auth/sign-in/email',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email,password})}));
 expect(response.status).toBe(200);
 const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 expect(cookie).toContain('session_token');
 const request=()=>new Request('http://localhost:3000/api/workspace',{headers:{cookie}});
 const allowed=await workspaceRoute(request());expect(allowed.status).toBe(200);
 const data=await allowed.json();expect(data.user.permissions).toMatchObject({manageAccess:false,editAll:false,guest:false});
 await expect(getAccess(await principalFor(data.user.id,'סמ״פ בדיקה'))).rejects.toMatchObject({status:403});
 await grantAccess(owner,{email,level:'all'});
 const editor=await (await workspaceRoute(request())).json();expect(editor.user.permissions).toMatchObject({manageAccess:true,editAll:true});
 await grantAccess(owner,{email,level:'revoke'});
 await expect(assertEmailAccess(email)).rejects.toMatchObject({status:403});
 expect((await workspaceRoute(request())).status).toBe(403);
 const denied=await signInRoute(new Request('http://localhost:3000/api/auth/sign-in/email',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email,password})}));
 expect(denied.status).toBe(403);expect(denied.headers.get('set-cookie')).toBeNull();
 await grantAccess(owner,{email,level:'view'});
 await expect(assertEmailAccess(email)).resolves.toBeUndefined();
 expect((await workspaceRoute(request())).status).toBe(200);
});

it('deletes access, disconnects existing sessions and preserves assigned tasks and account history',async()=>{
 const email='delete-member@example.com',password='delete-member-password-12345';
 await grantAccess(owner,{email,name:'משתמש למחיקה',level:'own',password});
 const member=(await getAccess(owner)).members.find(m=>m.email===email)!;
 const response=await signInRoute(new Request('http://localhost:3000/api/auth/sign-in/email',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email,password})}));
 expect(response.status).toBe(200);
 const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
 const request=()=>new Request('http://localhost:3000/api/workspace',{headers:{cookie}});
 expect((await workspaceRoute(request())).status).toBe(200);
 await (await getDb()).insert(s.rhythmGroups).values({id:'deleted-member-group',organizationId:owner.organizationId,creatorId:owner.userId,name:'מחיקה מקבוצה',emails:[email]});
 const task=await createTask(owner,{title:'keep after deletion',ownerId:member.id,domainId:'safety'});
 await expect(deleteAccess(company,{userId:member.id})).rejects.toMatchObject({status:403});
 await expect(deleteAccess(owner,{userId:owner.userId})).rejects.toMatchObject({status:403});
 await expect(deleteAccess(owner,{userId:'unknown-member'})).rejects.toMatchObject({status:404});
 await expect(deleteAccess(owner,{userId:member.id})).resolves.toEqual({deleted:true});
 expect((await getAccess(owner)).members.some(m=>m.id===member.id)).toBe(false);
 expect((await getWorkspace(owner)).users.some(m=>m.id===member.id)).toBe(false);
 expect((await (await getDb()).select().from(s.rhythmGroups)).find(g=>g.id==='deleted-member-group')?.emails).toEqual([]);
 await expect(assertEmailAccess(email)).rejects.toMatchObject({status:403});
 await expect(principalFor(member.id,member.name)).rejects.toMatchObject({status:403});
 expect((await workspaceRoute(request())).status).toBe(401);
 const db=await getDb();
 expect((await db.select().from(s.session)).some(row=>row.userId===member.id)).toBe(false);
 expect((await db.select().from(s.workspaceAccessGrants)).some(row=>row.userId===member.id)).toBe(false);
 expect((await db.select().from(s.tasks)).some(row=>row.id===task.id&&row.ownerId===member.id)).toBe(true);
 expect((await db.select().from(s.user)).some(row=>row.id===member.id)).toBe(true);
 await grantAccess(owner,{email,level:'own'});
 expect((await getAccess(owner)).members.find(m=>m.email===email)?.id).toBe(member.id);
 expect((await workspaceRoute(request())).status).toBe(401);
});

it('keeps private tasks out of battalion metrics while retaining them in the owner workspace',async()=>{
 const before=await getWorkspace(owner);
 const personal=await createTask(owner,{title:'personal metric separation',ownerId:owner.userId,domainId:'safety'});
 const afterPersonal=await getWorkspace(owner);
 expect(afterPersonal.tasks.some(t=>t.id===personal.id)).toBe(true);
 expect(afterPersonal.metrics).toEqual(before.metrics);
 await createTask(owner,{title:'battalion metric separation',ownerId:company.userId,domainId:'safety',companyId:'company-a'});
 const afterShared=await getWorkspace(owner);
 expect(afterShared.metrics.open).toBe(before.metrics.open+1);
});
