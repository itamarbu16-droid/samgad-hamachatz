import {requestDeadline,listDeadlineRequests} from '../src/server/deadline-requests';
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
import {workspaceSchedule,scheduleCalendars,selectScheduleCalendar,calendarStatus,calendarSlots,scheduleCalendarTask,seal,unseal,startCalendarConnection,finishCalendarConnection} from '../src/server/google-calendar';
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
 const encryptedTokens=seal({access_token:'isolated-access',refresh_token:'isolated-refresh',calendarId,scheduleCalendarId:calendarId,expiresAt:Date.now()+3600000});
 await (await getDb()).insert(s.calendarConnections).values({id,organizationId:owner.organizationId,userId:owner.userId,encryptedTokens}).onConflictDoUpdate({target:s.calendarConnections.id,set:{encryptedTokens}});
}
it('encrypts tokens and binds OAuth state to account, organization and nonce',async()=>{
 const encrypted=seal({refresh_token:'secret-test-token'});expect(encrypted).not.toContain('secret-test-token');expect(unseal(encrypted)).toEqual({refresh_token:'secret-test-token'});
 const start=await startCalendarConnection(owner),location=new URL(start.headers.get('Location')!);expect(location.hostname).toBe('accounts.google.com');expect(location.searchParams.get('code_challenge_method')).toBe('S256');
 const cookie=start.headers.get('set-cookie')!.split(';')[0];
 await expect(finishCalendarConnection(deputy,new Request('http://localhost:3000/api/calendar/callback?state='+location.searchParams.get('state')+'&code=test',{headers:{cookie}}))).rejects.toMatchObject({status:403});
 await expect(finishCalendarConnection(owner,new Request('http://localhost:3000/api/calendar/callback?state=wrong&code=test',{headers:{cookie}}))).rejects.toMatchObject({status:403});
});
it('fails closed if the selected calendar availability check fails',async()=>{
 const task=await assigned();await connect();
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('calendarList')?Response.json({items:[{id:'one'},{id:'two'}]}):Response.json({calendars:{'owner@example.test':{errors:[{reason:'internalError'}]}}})));
 await expect(calendarSlots(owner,{kind:'task',id:task.id,from:addDays(today,1),through:addDays(today,2),minutes:30})).rejects.toMatchObject({status:503});vi.unstubAllGlobals();
});
it('rechecks availability before creating events and recovers an event after a lost database response',async()=>{
 const task=await assigned();await connect();let busy=true,created:Record<string,unknown>|null=null,inserts=0;
 const start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.parse(start)+1800000).toISOString();
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.includes('calendarList'))return Response.json({items:[{id:'one'}]});
  if(url.includes('/freeBusy'))return Response.json({calendars:{'owner@example.test':{busy:busy?[{start,end}]:[]},'different-google-account@example.test':{busy:[]}}});
  if(init?.method==='POST'&&url.includes('/events?')){inserts++;const body=JSON.parse(String(init.body));created={id:body.id,start:{dateTime:start},end:{dateTime:end},htmlLink:'https://calendar.google.com/event?test'};return Response.json(created);}
  if(url.includes('/events/'))return created?Response.json(created):new Response('{}',{status:404});
  throw Error('Unexpected test request');
 }));
 await expect(scheduleCalendarTask(owner,{kind:'task',id:task.id,start,end,confirmed:true})).rejects.toMatchObject({status:409});expect(inserts).toBe(0);
 busy=false;const first=await scheduleCalendarTask(owner,{kind:'task',id:task.id,start,end,confirmed:true});expect(first.start).toBe(start);expect(inserts).toBe(1);
 // Simulate a transaction result lost after Google accepted the event.
 await (await getDb()).delete(s.calendarBookings);busy=true;
 const recovered=await scheduleCalendarTask(owner,{kind:'task',id:task.id,confirmed:true,start:new Date(Date.parse(start)+3600000).toISOString(),end:new Date(Date.parse(end)+3600000).toISOString()});
 expect(recovered.start).toBe(start);expect(inserts).toBe(1);
 // A different connected Google account must not reuse the former account's booking.
 await connect('different-google-account@example.test');created=null;busy=false;
 await scheduleCalendarTask(owner,{kind:'task',id:task.id,start,end,confirmed:true});expect(inserts).toBe(2);
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

it('checks only the selected shared calendar and requires confirmation before sending authorized invitations',async()=>{
 const task=await assigned();await connect('shared@group.calendar.google.com');
 await grantAccess(owner,{email:'company.b@samgad.example',level:'own'});
 const db=await getDb();const [member]=await db.select().from(s.user).where(eq(s.user.email,'company.b@samgad.example'));
 const status=await calendarStatus(owner);expect(status.invitees.some(m=>m.id===member.id)).toBe(true);
 expect(status.invitees.some(m=>m.id===other.userId)).toBe(false);
 const start=new Date(Date.now()+2*86400000).toISOString(),end=new Date(Date.parse(start)+1800000).toISOString();
 const fetchMock=vi.fn(async(url:string,init?:RequestInit)=>{
  expect(url).not.toContain('/primary/');expect(url).not.toContain('calendarList');
  if(url.includes('/freeBusy')){expect(JSON.parse(String(init?.body)).items).toEqual([{id:'shared@group.calendar.google.com'}]);return Response.json({calendars:{'shared@group.calendar.google.com':{busy:[]},unrelated:{errors:[{reason:'notFound'}]}}});}
  expect(url).toContain('calendars/shared%40group.calendar.google.com/events');
  if(init?.method==='POST'){
   expect(url).toContain('sendUpdates=all');const body=JSON.parse(String(init.body));expect(body.attendees).toEqual([{email:'company.b@samgad.example'}]);
   return Response.json({id:body.id,start:body.start,end:body.end,htmlLink:'https://calendar.google.com/event?invitation'});
  }
  return new Response('{}',{status:404});
 });vi.stubGlobal('fetch',fetchMock);
 try{
  await expect(scheduleCalendarTask(owner,{kind:'task',id:task.id,start,end})).rejects.toThrow();expect(fetchMock).not.toHaveBeenCalled();
  await expect(scheduleCalendarTask(owner,{kind:'task',id:task.id,start,end,confirmed:true,inviteeIds:[other.userId]})).rejects.toMatchObject({status:403});expect(fetchMock).not.toHaveBeenCalled();
  expect((await calendarSlots(owner,{kind:'task',id:task.id,from:addDays(today,1),through:addDays(today,2),minutes:30})).slots.length).toBeGreaterThan(0);
  await scheduleCalendarTask(owner,{kind:'task',id:task.id,start,end,confirmed:true,inviteeIds:[member.id,member.id]});
  await grantAccess(owner,{email:member.email,level:'revoke'});
  await expect(scheduleCalendarTask(owner,{kind:'task',id:task.id,start,end,confirmed:true,inviteeIds:[member.id]})).rejects.toMatchObject({status:403});
 }finally{vi.unstubAllGlobals();}
});
it('does not silently use the primary calendar when no battalion calendar is selected',async()=>{
 const id=createHash('sha256').update(`${owner.organizationId}:${owner.userId}`).digest('hex');
 await (await getDb()).update(s.calendarConnections).set({encryptedTokens:seal({access_token:'test',expiresAt:Date.now()+3600000,calendarId:'personal'})}).where(eq(s.calendarConnections.id,id));
 const task=await assigned();const fetchMock=vi.fn(async()=>Response.json({items:[{id:'personal',summary:'Personal',accessRole:'owner'}]}));vi.stubGlobal('fetch',fetchMock);
 try{await expect(calendarSlots(owner,{kind:'task',id:task.id,from:addDays(today,1),through:addDays(today,2),minutes:30})).rejects.toMatchObject({status:409});expect(fetchMock).toHaveBeenCalledTimes(1);}finally{vi.unstubAllGlobals();}
});

it('moves existing tasks to owner-only space and rejects other users and stale moves',async()=>{
 const task=await assigned();
 const request=await requestDeadline(deputy,{kind:'task',id:task.id,date:addDays(today,5),reason:'test private move'});
 await expect(actOnTask(deputy,{kind:'task',id:task.id,action:'personal',version:task.version})).rejects.toMatchObject({status:403});
 await actOnTask(owner,{kind:'task',id:task.id,action:'personal',version:task.version});
 const moved=(await getWorkspace(owner)).tasks.find(t=>t.id===task.id)!;
 expect(moved.ownerId).toBe(owner.userId);expect(moved.creatorId).toBe(owner.userId);expect(moved.title).toBe(task.title);expect(moved.dueDate).toBe(task.dueDate);
 expect((await getWorkspace(deputy)).tasks.some(t=>t.id===task.id)).toBe(false);
 const editor={...owner,userId:deputy.userId,editAll:true};
 expect((await listDeadlineRequests(editor)).some(r=>r.id===request.id)).toBe(false);
 expect((await getWorkspace(editor)).tasks.some(t=>t.id===task.id)).toBe(false);
 await expect(actOnTask(editor,{kind:'task',id:task.id,action:'pin',pinned:true})).rejects.toMatchObject({status:404});
 await expect(actOnTask(owner,{kind:'task',id:task.id,action:'personal',version:task.version})).rejects.toMatchObject({status:409});
});
it('puts tasks created by an assistant solely for the owner in personal space',async()=>{
 const assistant={...owner,userId:deputy.userId,editAll:true};
 const task=await createTask(assistant,{title:'משימה למפקד בלבד',ownerId:owner.userId,domainId:'safety'});
 expect(task.creatorId).toBe(owner.userId);
 expect((await getWorkspace(assistant)).tasks.some(t=>t.id===task.id)).toBe(false);
 const item=await createRhythmItem(assistant,{clientRequestId:uuid(),title:'משימה אישית מהלשכה',recipientIds:[owner.userId],startDate:today,frequency:'once'});
 expect(item.creatorId).toBe(owner.userId);
 expect((await getRhythm(assistant)).items.some(t=>t.id===item.id)).toBe(false);
 expect((await getRhythm(owner)).items.some(t=>t.id===item.id)).toBe(true);
});
it('moves recurring tasks without recreating occurrences or leaking reminders',async()=>{
 const item=await createRhythmItem(owner,{clientRequestId:uuid(),title:'משימה להעברה לאישי',recipientIds:[deputy.userId],startDate:today,frequency:'daily',endDate:addDays(today,2)});
 const rows=(await getRhythm(owner)).occurrences.filter(o=>o.itemId===item.id);
 await actOnTask(owner,{kind:'rhythm',id:item.id,action:'personal',version:item.version});
 const result=await getRhythm(owner);
 expect(result.items.find(i=>i.id===item.id)?.assigneeIds).toEqual([owner.userId]);
 expect(result.occurrences.filter(o=>o.itemId===item.id).map(o=>o.id)).toEqual(rows.map(o=>o.id));
 const editor={...owner,userId:deputy.userId,editAll:true};
 expect((await getRhythm(editor)).items.some(i=>i.id===item.id)).toBe(false);
 await expect(actOnTask(editor,{kind:'rhythm',id:item.id,action:'pin',pinned:true})).rejects.toMatchObject({status:404});
 const mail=await (await getDb()).select().from(s.rhythmMail);
 expect(mail.filter(m=>rows.some(o=>o.id===m.occurrenceId)&&m.recipientId!==owner.userId)).toHaveLength(0);
});
