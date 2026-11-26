import {afterAll,beforeAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {seedDemo} from '../src/server/seed';
import {closeDb,getDb} from '../src/server/db';
import {getWorkspace,principalFor} from '../src/server/service';
import {grantAccess} from '../src/server/access';
import {localDate,type Principal} from '../src/server/policy';
import {addDays} from '../src/lib/rhythm';
import * as s from '../src/server/schema';
let owner:Principal,member:Principal;
const today=localDate();
beforeAll(async()=>{
 process.env.DEMO_MODE='true';
 process.env.PGLITE_DATA_DIR='memory://';
 delete process.env.DATABASE_URL;
 delete process.env.VERCEL;
 process.env.BETTER_AUTH_URL='http://localhost:3000';
 process.env.BETTER_AUTH_SECRET='open-due-tests-isolated-secret-1234567890';
 process.env.DEMO_PASSWORD='isolated-password-12345';
 process.env.DEMO_EMAIL='demo@samgad.example';
 await seedDemo();
 const users=await(await getDb()).select().from(s.user);
 const p=(email:string)=>{const u=users.find(u=>u.email===email)!;return principalFor(u.id,u.name);};
 owner=await p('demo@samgad.example');
 await grantAccess(owner,{email:'company.a@samgad.example',level:'own'});
 member=await p('company.a@samgad.example');
},60000);
afterAll(closeDb);

it('keeps the projection assigned-only and does not queue mail or push events',async()=>{
 const db=await getDb(), stamp='2026-01-01T12:00:00Z',late=addDays(today,-1),tomorrow=addDays(today,1);
 const base={organizationId:owner.organizationId,creatorId:owner.userId,frequency:'once',startDate:late,
  assigneeIds:[owner.userId],completionMode:'individual'} satisfies Omit<typeof s.rhythmItems.$inferInsert,'id'|'title'>;
 async function add(title:string,item:Partial<typeof s.rhythmItems.$inferInsert>={},occurrence:Partial<typeof s.rhythmOccurrences.$inferInsert>={}){
  const id=randomUUID();
  await db.insert(s.rhythmItems).values({...base,id,title,...item});
  await db.insert(s.rhythmOccurrences).values({id:randomUUID(),itemId:id,dueDate:late,...occurrence});
 }
 await add('reminder owner late');
 await add('reminder member tomorrow',{assigneeIds:[member.userId]},{dueDate:tomorrow});
 await add('reminder common individual',{assigneeIds:[owner.userId,member.userId]},{reports:{[member.userId]:stamp}});
 await add('reminder common shared pending',{assigneeIds:[owner.userId,member.userId],completionMode:'shared'},{reports:{[member.userId]:stamp}});
 await add('reminder common shared done',{assigneeIds:[owner.userId,member.userId],completionMode:'shared'},{completedAt:new Date(stamp)});
 await add('reminder common shared valid completion',{assigneeIds:[owner.userId,member.userId],completionMode:'shared'},{completions:{[member.userId]:stamp}});
 await add('reminder common invalid old report',{assigneeIds:[owner.userId,member.userId],completionMode:'shared'},{reports:{former:stamp}});
 await add('reminder own done',{}, {completions:{[owner.userId]:stamp}});
 await add('reminder later',{}, {dueDate:addDays(today,2)});
 await add('reminder routine',{frequency:'weekly'});
 await add('reminder no deadline',{hasDeadline:false});
 await add('reminder point',{category:'point'});
 await add('reminder archived',{archived:true});
 const mailBefore=(await db.select().from(s.rhythmMail)).length;
 const pushBefore=(await db.select().from(s.pushEvents)).length;
 const titles=(rows:{title:string}[])=>rows.map(x=>x.title).filter(t=>t.startsWith('reminder ')).sort();
 expect(titles((await getWorkspace(owner)).rhythmDueReminder)).toEqual(['reminder common individual','reminder common invalid old report','reminder owner late']);
 expect(titles((await getWorkspace(member)).rhythmDueReminder)).toEqual(['reminder common invalid old report','reminder member tomorrow']);
 expect((await getWorkspace({...member,guest:true})).rhythmDueReminder).toEqual([]);
 expect((await db.select().from(s.rhythmMail))).toHaveLength(mailBefore);
 expect((await db.select().from(s.pushEvents))).toHaveLength(pushBefore);
});
