import {afterAll,beforeAll,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {seedDemo} from '../src/server/seed';
import {closeDb,getDb} from '../src/server/db';
import {principalFor} from '../src/server/service';
import {grantAccess} from '../src/server/access';
import {createDocument,duplicateDocument,getDocument,updateDocument} from '../src/server/documents';
import {changeTrackerCell,emptyFlexibleTracker,mergeTrackerCells,parseFlexibleTracker} from '../src/lib/flexible-tracker';
import type {Principal} from '../src/server/policy';
import * as s from '../src/server/schema';

let owner:Principal,member:Principal;
beforeAll(async()=>{
 process.env.DEMO_MODE='true';process.env.PGLITE_DATA_DIR='memory://';delete process.env.DATABASE_URL;delete process.env.VERCEL;
 process.env.BETTER_AUTH_URL='http://localhost:3000';process.env.BETTER_AUTH_SECRET='flexible-tracker-tests-isolated-secret-1234567890';process.env.DEMO_PASSWORD='isolated-password-12345';process.env.DEMO_EMAIL='demo@samgad.example';
 await seedDemo();const users=await(await getDb()).select().from(s.user);
 const p=(email:string)=>{const u=users.find(u=>u.email===email)!;return principalFor(u.id,u.name);};
 owner=await p('demo@samgad.example');await grantAccess(owner,{email:'contributor@samgad.example',level:'own'});member=await p('contributor@samgad.example');
},60000);
afterAll(closeDb);

it('persists merged cells through edits and copies, blocks malformed or out-of-folder writes, and preserves tracker permissions',async()=>{
 const a={row:'row-0',column:'column-0'},b={row:'row-1',column:'column-1'};
 const grid=mergeTrackerCells(changeTrackerCell(emptyFlexibleTracker(),a,'לפני'),a,b);
 const input={title:'טבלת בדיקה גמישה',body:JSON.stringify(grid),folderId:'trackers',clientRequestId:randomUUID()};
 await expect(createDocument(owner,{...input,folderId:'orders'})).rejects.toMatchObject({status:422});
 await expect(createDocument(owner,{...input,body:JSON.stringify({...grid,rows:[]})})).rejects.toMatchObject({status:422});
 const entry=await createDocument(owner,input);
 const patched={title:input.title,folderId:input.folderId,version:1,body:JSON.stringify(changeTrackerCell(grid,a,'אחרי'))};
 await expect(updateDocument({...member,role:'viewer'},entry.id,patched)).rejects.toMatchObject({status:403});
 await expect(updateDocument(member,entry.id,{...patched,title:'שם לא מורשה'})).rejects.toMatchObject({status:403});
 await expect(updateDocument(owner,entry.id,{...patched,body:'טקסט רגיל'})).rejects.toMatchObject({status:422});
 await expect(updateDocument({...member,organizationId:'synthetic-foreign'},entry.id,patched)).rejects.toMatchObject({status:404});
 await updateDocument(member,entry.id,patched);
 await expect(updateDocument(member,entry.id,patched)).rejects.toMatchObject({status:409});
 const active=parseFlexibleTracker(JSON.parse((await getDocument(owner,entry.id)).body))!;
 expect(active.merges).toEqual(grid.merges);expect(active.rows[0].cells[a.column]).toBe('אחרי');
 const copy=await duplicateDocument(owner,entry.id,{title:'עותק סינתטי',folderId:'trackers',resetStatuses:true,clientRequestId:randomUUID()});
 expect(JSON.parse((await getDocument(owner,copy.id)).body)).toEqual(active);
});
