import {beforeAll,afterAll,it,expect} from 'vitest';
import {eq,sql} from 'drizzle-orm';
import {getDb,closeDb} from '../src/server/db';
import {seedDemo} from '../src/server/seed';
import {getAuth} from '../src/server/auth';
import {principalFor} from '../src/server/service';
import {readOwnerReview} from '../src/server/daily-review';
import {GET} from '../src/app/api/daily-review/route';
import * as s from '../src/server/schema';
let ownerId:string,otherId:string,cookie:string;
beforeAll(async()=>{
 process.env.DEMO_MODE='true';process.env.PGLITE_DATA_DIR='memory://';delete process.env.DATABASE_URL;delete process.env.VERCEL;
 process.env.BETTER_AUTH_URL='http://localhost:3000';process.env.BETTER_AUTH_SECRET='review-isolated-test-secret-123456789012345';
 process.env.DEMO_EMAIL='demo@samgad.example';process.env.DEMO_PASSWORD='review-isolated-test-password';
 await seedDemo();const users=await (await getDb()).select().from(s.user);
 ownerId=users.find(u=>u.email===process.env.DEMO_EMAIL)!.id;otherId=users.find(u=>u.id!==ownerId)!.id;
 await principalFor(ownerId,'owner');
 const response=await (await getAuth()).api.signInEmail({body:{email:process.env.DEMO_EMAIL,password:process.env.DEMO_PASSWORD},asResponse:true});
 cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
},60000);
afterAll(closeDb);
const request=()=>new Request('http://localhost:3000/api/daily-review',{headers:{cookie}});
async function snapshot(){const db=await getDb();const tables=await db.execute<{table_name:string}>(sql`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`);const out:Record<string,unknown>={};for(const {table_name:name} of tables.rows)out[name]=(await db.execute(sql.raw(`select * from "${name.replaceAll('"','""')}" order by 1`))).rows;return JSON.stringify(out);}
it('rejects unauthenticated reads without caching',async()=>{const r=await GET(new Request('http://localhost:3000/api/daily-review'));expect(r.status).toBe(401);expect(r.headers.get('cache-control')).toContain('no-store');});
it('rejects another member',async()=>{await expect(readOwnerReview(await getDb(),otherId,new Date())).rejects.toMatchObject({status:403});});
it('has no database changes, including cleanup and auth refresh',async()=>{const before=await snapshot(),r=await GET(request());expect(r.status).toBe(200);expect(await r.json()).toMatchObject({ownerId,readOnly:true,history:{repeatPatternsAvailable:false}});expect(await snapshot()).toBe(before);});
it('distinguishes approval, shared work, individual work, no deadline and missing occurrences',async()=>{
 const db=await getDb();const base={organizationId:'demo-org',creatorId:ownerId,frequency:'once',startDate:'2000-01-01',completionMode:'individual',assigneeIds:[ownerId]};
 await db.insert(s.rhythmItems).values([{...base,id:'review-shared',title:'shared',completionMode:'shared',assigneeIds:[ownerId,otherId]},{...base,id:'review-point',title:'point',category:'point',hasDeadline:false},{...base,id:'review-individual',title:'individual',assigneeIds:[ownerId,otherId]},{...base,id:'review-missing',title:'missing'}]);
 await db.insert(s.rhythmOccurrences).values([{id:'review-shared-o',itemId:'review-shared',dueDate:'2000-01-01',reports:{[otherId]:'2000-01-01T12:00:00Z'}},{id:'review-point-o',itemId:'review-point',dueDate:'2000-01-01'},{id:'review-individual-o',itemId:'review-individual',dueDate:'2000-01-01',reports:{[otherId]:'2000-01-01T12:00:00Z'}}]);
 const body=await (await GET(request())).json();
 expect(body.records.find((r:{title:string})=>r.title==='shared')).toMatchObject({overdue:false,outstandingAssigneeIds:[],awaitingApprovalIds:[otherId]});
 expect(body.records.find((r:{title:string})=>r.title==='point')).toMatchObject({overdue:false,dueDate:null,personal:true});
 expect(body.records.find((r:{title:string})=>r.title==='individual')).toMatchObject({overdue:true,outstandingAssigneeIds:[ownerId],awaitingApprovalIds:[otherId]});
 expect(body.missingOccurrences).toContainEqual({id:'review-missing',title:'missing'});
});
it('excludes foreign organizations and archived items',async()=>{
 const db=await getDb();await db.insert(s.organizations).values({id:'review-other-org',name:'other'});
 await db.insert(s.rhythmItems).values({id:'review-secret',organizationId:'review-other-org',creatorId:ownerId,title:'foreign-secret',frequency:'once',startDate:'2000-01-01',completionMode:'individual',assigneeIds:[ownerId]});
 await db.update(s.rhythmItems).set({archived:true}).where(eq(s.rhythmItems.id,'review-missing'));
 const body=await (await GET(request())).json();expect(JSON.stringify(body)).not.toContain('foreign-secret');expect(body.missingOccurrences).not.toContainEqual({id:'review-missing',title:'missing'});
});
it('preserves privacy of other members personal points and tasks',async()=>{
 const db=await getDb();const base={organizationId:'demo-org',creatorId:otherId,frequency:'once',startDate:'2000-01-01',completionMode:'individual',assigneeIds:[otherId]};
 await db.insert(s.rhythmItems).values([{...base,id:'review-private-point',title:'other-private-point',category:'point'},{...base,id:'review-private-task',title:'other-private-task'}]);
 const [domain]=await db.select().from(s.domains).where(eq(s.domains.organizationId,'demo-org')).limit(1);
 await db.insert(s.tasks).values({id:'review-private-legacy',organizationId:'demo-org',domainId:domain.id,creatorId:otherId,ownerId:otherId,title:'other-private-legacy'});
 expect(JSON.stringify(await (await GET(request())).json())).not.toContain('other-private-');
});
it('does not delete an expired session',async()=>{const db=await getDb();await db.update(s.session).set({expiresAt:new Date('2000-01-01')}).where(eq(s.session.userId,ownerId));const before=await snapshot();expect((await GET(request())).status).toBe(401);expect(await snapshot()).toBe(before);});
