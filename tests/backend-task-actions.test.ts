import {grantAccess} from "../src/server/access";
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {seedDemo} from '../src/server/seed';
import {getDb,closeDb} from '../src/server/db';
import {principalFor,createTask,updateTask,getWorkspace} from '../src/server/service';
import {createRhythmItem,getRhythm,undoRhythm} from '../src/server/rhythm';
import {actOnTask} from '../src/server/task-actions';
import {getPins} from '../src/server/task-pins';
import {workspaceSchedule,scheduleCalendars,selectScheduleCalendar,calendarSlots,scheduleCalendarTask,seal,unseal,startCalendarConnection,finishCalendarConnection} from '../src/server/google-calendar';
import {compareTasks} from '../src/lib/task-display';
import {addDays} from '../src/lib/rhythm';
import {localDate,type Principal} from '../src/server/policy';
import * as s from '../src/server/schema';
let owner:Principal,deputy:Principal,other:Principal;
const today=localDate(),uuid=()=>randomUUID();
beforeAll(async()=>{
 process.env.DEMO_MODE='true';process.env.PGLITE_DATA_DIR='memory://';delete process.env.DATABASE_URL;delete process.env.VERCEL;
 process.env.BETTER_AUTH_URL='http://localhost:3000';process.env.BETTER_AUTH_SECRET='task-actions-isolated-secret-12345678901234567890';process.env.DEMO_PASSWORD='actions-isolated-password-12345';process.env.DEMO_EMAIL='demo@samgad.example';
 process.env.GOOGLE_CALENDAR_CLIENT_ID='test-google-client';process.env.GOOGLE_CALENDAR_CLIENT_SECRET='test-google-secret';
 await seedDemo();const users=await (await getDb()).select().from(s.user);
 const p=(email:string)=>{const u=users.find(u=>u.email===email)!;return principalFor(u.id,u.name);};owner=await p('demo@samgad.example');deputy=await p('company.a@samgad.example');other=await p('contributor@samgad.example');
},60000);
afterAll(async()=>{vi.unstubAllGlobals();await closeDb();});
const assigned=()=>createTask(owner,{title:'פעולת משימה לבדיקה',ownerId:deputy.userId,domainId:'safety',companyId:'company-a',dueDate:addDays(today,2)});
it('keeps pins personal and puts pinned tasks first for every sorting choice',async()=>{
 const task=await assigned();await actOnTask(deputy,{kind:'task',id:task.id,action:'pin',pinned:true});
 expect(await getPins(deputy)).toContain('task:'+task.id);expect(await getPins(owner)).not.toContain('task:'+task.id);
 expect((await getWorkspace(deputy)).pinnedTaskKeys).toContain('task:'+task.id);
 await expect(actOnTask(other,{kind:'task',id:task.id,action:'pin',pinned:true})).rejects.toMatchObject({status:404});
 for(const sort of ['deadline_desc','deadline_asc','title','status'] as const)expect(compareTasks({id:'p',title:'z',dueDate:null,done:true,pinned:true},{id:'u',title:'a',dueDate:today,done:false},sort)).toBeLessThan(0);
 await actOnTask(deputy,{kind:'task',id:task.id,action:'pin',pinned:false});expect(await getPins(deputy)).not.toContain('task:'+task.id);
});
it('extends permitted deadlines, rejects stale versions and protects manager-assigned deletions',async()=>{
 const task=await assigned();await expect(actOnTask(deputy,{kind:'task',id:task.id,action:'extend',version:1,date:addDays(today,4)})).rejects.toMatchObject({status:403});await actOnTask(owner,{kind:'task',id:task.id,action:'extend',version:1,date:addDays(today,4)});
 expect((await getWorkspace(deputy)).tasks.find(t=>t.id===task.id)?.dueDate).toBe(addDays(today,4));
 await expect(actOnTask(owner,{kind:'task',id:task.id,action:'delete',version:1})).rejects.toMatchObject({status:409});
 await expect(actOnTask(deputy,{kind:'task',id:task.id,action:'delete',version:2})).rejects.toMatchObject({status:403});
 const deleted=await actOnTask(owner,{kind:'task',id:task.id,action:'delete',version:2}) as {undoToken:string};
 expect((await getWorkspace(owner)).tasks.find(t=>t.id===task.id)?.status).toBe('cancelled');
 await undoRhythm(owner,{token:deleted.undoToken});expect((await getWorkspace(owner)).tasks.find(t=>t.id===task.id)?.status).toBe('open');
});
it('allows deleting a completed task without reopening it first',async()=>{
 const task=await createTask(owner,{title:'משימה שהושלמה',ownerId:owner.userId,domainId:'safety'});
 await updateTask(owner,task.id,{version:1,status:'completed'});
 const deleted=await actOnTask(owner,{kind:'task',id:task.id,action:'delete',version:2}) as {undoToken:string};
 await undoRhythm(owner,{token:deleted.undoToken});expect((await getWorkspace(owner)).tasks.find(t=>t.id===task.id)?.status).toBe('completed');
});
it('extends only the selected recurrence, preserves identity through repeated reads, and supports undo',async()=>{
 const item=await createRhythmItem(owner,{clientRequestId:uuid(),title:'הארכת מופע יומי',frequency:'daily',startDate:today,endDate:addDays(today,3),recipientIds:[deputy.userId]});
 const before=(await getRhythm(owner)).occurrences.filter(o=>o.itemId===item.id);const row=before.find(o=>o.dueDate===today)!;
 const changed=await actOnTask(owner,{kind:'rhythm',id:item.id,occurrenceId:row.id,action:'extend',version:item.version,occurrenceVersion:row.version,date:addDays(today,1)}) as {undoToken:string};
 for(let n=0;n<2;n++){const after=(await getRhythm(owner)).occurrences.filter(o=>o.itemId===item.id);expect(after).toHaveLength(before.length);expect(after.find(o=>o.id===row.id)?.dueDate).toBe(addDays(today,1));expect(after.filter(o=>o.dueDate===today)).toHaveLength(0);expect(after.filter(o=>o.dueDate===addDays(today,1))).toHaveLength(2);}
 await undoRhythm(owner,{token:changed.undoToken});expect((await getRhythm(owner)).occurrences.find(o=>o.id===row.id)?.dueDate).toBe(today);
 await expect(actOnTask(deputy,{kind:'rhythm',id:item.id,action:'delete',version:item.version})).rejects.toMatchObject({status:403});
 const removed=await actOnTask(owner,{kind:'rhythm',id:item.id,action:'delete',version:item.version}) as {undoToken:string};
 expect((await getRhythm(owner)).items.find(i=>i.id===item.id)?.archived).toBe(true);await undoRhythm(owner,{token:removed.undoToken});
});
async function connect(calendarId='owner@example.test'){
 const id=createHash('sha256').update(`${owner.organizationId}:${owner.userId}`).digest('hex');
 const encryptedTokens=seal({access_token:'isolated-access',refresh_token:'isolated-refresh',calendarId,expiresAt:Date.now()+3600000});
 await (await getDb()).insert(s.calendarConnections).values({id,organizationId:owner.organizationId,userId:owner.userId,encryptedTokens}).onConflictDoUpdate({target:s.calendarConnections.id,set:{encryptedTokens}});
}
it('encrypts tokens and binds OAuth state to account, organization and nonce',async()=>{
 const encrypted=seal({refresh_token:'secret-test-token'});expect(encrypted).not.toContain('secret-test-token');expect(unseal(encrypted)).toEqual({refresh_token:'secret-test-token'});
 const start=await startCalendarConnection(owner),location=new URL(start.headers.get('Location')!);expect(location.hostname).toBe('accounts.google.com');expect(location.searchParams.get('code_challenge_method')).toBe('S256');
 const cookie=start.headers.get('set-cookie')!.split(';')[0];
 await expect(finishCalendarConnection(deputy,new Request('http://localhost:3000/api/calendar/callback?state='+location.searchParams.get('state')+'&code=test',{headers:{cookie}}))).rejects.toMatchObject({status:403});
 await expect(finishCalendarConnection(owner,new Request('http://localhost:3000/api/calendar/callback?state=wrong&code=test',{headers:{cookie}}))).rejects.toMatchObject({status:403});
});
it('fails closed if any calendar availability check fails',async()=>{
 const task=await assigned();await connect();
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('calendarList')?Response.json({items:[{id:'one'},{id:'two'}]}):Response.json({calendars:{one:{busy:[]},two:{errors:[{reason:'internalError'}]}}})));
 await expect(calendarSlots(owner,{kind:'task',id:task.id,from:addDays(today,1),through:addDays(today,2),minutes:30})).rejects.toMatchObject({status:503});vi.unstubAllGlobals();
});
it('rechecks availability before creating events and recovers an event after a lost database response',async()=>{
 const task=await assigned();await connect();let busy=true,created:Record<string,unknown>|null=null,inserts=0;
 const start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.parse(start)+1800000).toISOString();
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.includes('calendarList'))return Response.json({items:[{id:'one'}]});
  if(url.includes('/freeBusy'))return Response.json({calendars:{one:{busy:busy?[{start,end}]:[]}}});
  if(init?.method==='POST'&&url.endsWith('/events')){inserts++;const body=JSON.parse(String(init.body));created={id:body.id,start:{dateTime:start},end:{dateTime:end},htmlLink:'https://calendar.google.com/event?test'};return Response.json(created);}
  if(url.includes('/events/'))return created?Response.json(created):new Response('{}',{status:404});
  throw Error('Unexpected test request');
 }));
 await expect(scheduleCalendarTask(owner,{kind:'task',id:task.id,start,end})).rejects.toMatchObject({status:409});expect(inserts).toBe(0);
 busy=false;const first=await scheduleCalendarTask(owner,{kind:'task',id:task.id,start,end});expect(first.start).toBe(start);expect(inserts).toBe(1);
 // Simulate a transaction result lost after Google accepted the event.
 await (await getDb()).delete(s.calendarBookings);busy=true;
 const recovered=await scheduleCalendarTask(owner,{kind:'task',id:task.id,start:new Date(Date.parse(start)+3600000).toISOString(),end:new Date(Date.parse(end)+3600000).toISOString()});
 expect(recovered.start).toBe(start);expect(inserts).toBe(1);
 // A different connected Google account must not reuse the former account's booking.
 await connect('different-google-account@example.test');created=null;busy=false;
 await scheduleCalendarTask(owner,{kind:'task',id:task.id,start,end});expect(inserts).toBe(2);
 expect((await (await getDb()).select().from(s.calendarBookings))).toHaveLength(2);
 vi.unstubAllGlobals();
});

it('reads a selected shared calendar and filters events on the server by role or attendee',async()=>{
 await grantAccess(owner,{email:'company.a@samgad.example',level:'own'});
 const db=await getDb();
 const id=createHash('sha256').update(`${owner.organizationId}:${owner.userId}`).digest('hex');
 await db.insert(s.calendarConnections).values({id,organizationId:owner.organizationId,userId:owner.userId,encryptedTokens:seal({access_token:'test',expiresAt:Date.now()+3600000,calendarId:'owner@example.com'})}).onConflictDoUpdate({target:s.calendarConnections.id,set:{encryptedTokens:seal({access_token:'test',expiresAt:Date.now()+3600000,calendarId:'owner@example.com'})}});
 await db.insert(s.rhythmGroups).values({id:'agenda-role',organizationId:owner.organizationId,creatorId:owner.userId,name:'סמ״פ א׳',emails:['company.a@samgad.example']}).onConflictDoNothing();
 const paths:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:string|URL)=>{
  const url=String(input);paths.push(url);
  if(url.includes('calendarList'))return Response.json({items:[{id:'shared@example.com',summary:'לו״ז גדודי',accessRole:'writer'}]});
  return Response.json({items:[
   {id:'role',summary:'ישיבת סמ״פ א׳',start:{date:'2026-10-20'},end:{date:'2026-10-21'}},
   {id:'private',summary:'אירוע פרטי',start:{date:'2026-10-20'},end:{date:'2026-10-21'}},
   {id:'invited',summary:'תכנון',attendees:[{email:'company.a@samgad.example'}],start:{date:'2026-10-20'},end:{date:'2026-10-21'}},
   {id:'cancelled',status:'cancelled',summary:'סמ״פ א׳',start:{date:'2026-10-20'},end:{date:'2026-10-21'}}]});
 }));
 try{
  expect((await scheduleCalendars(owner)).calendars[0].id).toBe('shared@example.com');
  await expect(selectScheduleCalendar(deputy,{calendarId:'shared@example.com'})).rejects.toMatchObject({status:403});
  await expect(selectScheduleCalendar(owner,{calendarId:'unknown'})).rejects.toMatchObject({status:403});
  await selectScheduleCalendar(owner,{calendarId:'shared@example.com'});
  expect((await workspaceSchedule(deputy)).events.map(event=>event.id)).toEqual(['role','invited']);
  expect((await workspaceSchedule(other)).events).toEqual([]);
  expect((await workspaceSchedule(owner)).events.map(event=>event.id)).toEqual(['role','private','invited']);
  expect(paths.some(path=>path.includes('calendars/shared%40example.com/events'))).toBe(true);
 }finally{vi.unstubAllGlobals();}
});
