import {authorizedMember} from "./access";
import {expandRoleGroups,roleCollections,roleName} from "../lib/unit-roles";
import {mentionsRole} from '../lib/schedule';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {and,eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {getDb} from './db';
import * as s from './schema';
import {AppError,localDate,type Principal} from './policy';
import {appUrl} from './app-url';
import {actionRef,getActionTask} from './task-actions';
import {findFreeSlots,zonedTime,type TimeRange} from '../lib/calendar-slots';
import {addDays} from '../lib/rhythm';
const scopes=['https://www.googleapis.com/auth/calendar.events.freebusy','https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/calendar.events'];
const connectionId=(p:Principal)=>createHash('sha256').update(`${p.organizationId}:${p.userId}`).digest('hex');
export const calendarConfigured=()=>Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID&&process.env.GOOGLE_CALENDAR_CLIENT_SECRET);
function key(){if(!process.env.BETTER_AUTH_SECRET)throw Error('Missing auth secret');return createHash('sha256').update('calendar-v1:'+process.env.BETTER_AUTH_SECRET).digest();}
export function seal(value:unknown){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');}
export function unseal<T>(value:string):T{const bytes=Buffer.from(value,'base64url'),decipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));}
type Tokens={access_token:string;refresh_token?:string;expiresAt:number;calendarId?:string;scheduleCalendarId?:string};
async function saveTokens(p:Principal,tokens:Tokens){await (await getDb()).insert(s.calendarConnections).values({id:connectionId(p),organizationId:p.organizationId,userId:p.userId,encryptedTokens:seal(tokens)}).onConflictDoUpdate({target:s.calendarConnections.id,set:{encryptedTokens:seal(tokens)}});}
async function saved(p:Principal){const [row]=await (await getDb()).select().from(s.calendarConnections).where(and(eq(s.calendarConnections.id,connectionId(p)),eq(s.calendarConnections.userId,p.userId),eq(s.calendarConnections.organizationId,p.organizationId)));return row;}
export async function calendarStatus(p:Principal){
 const db=await getDb();
 const members=await db.select({id:s.user.id,email:s.user.email,name:s.user.name}).from(s.memberships).innerJoin(s.user,eq(s.user.id,s.memberships.userId)).where(and(eq(s.memberships.organizationId,p.organizationId),eq(s.memberships.active,true),authorizedMember(p.organizationId)));
 const rawGroups=await db.select().from(s.rhythmGroups).where(and(eq(s.rhythmGroups.organizationId,p.organizationId),eq(s.rhythmGroups.creatorId,p.userId)));
 const groups=expandRoleGroups(rawGroups,members);
 return {configured:calendarConfigured(),connected:Boolean(await saved(p)),invitees:members.filter(m=>m.id!==p.userId).map(m=>({...m,roles:groups.filter(g=>g.emails.some(email=>email.toLowerCase()===m.email.toLowerCase())).map(g=>g.name)}))};
}
async function tokenRequest(body:Record<string,string>){
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new AppError(409,'לא ניתן לאשר את החיבור ליומן. יש לחבר את Google Calendar מחדש');
 return await response.json() as {access_token:string;refresh_token?:string;expires_in:number;scope?:string};
}
async function accessToken(p:Principal){
 const row=await saved(p);if(!row)throw new AppError(409,'יש לחבר תחילה את Google Calendar');
 let tokens:Tokens;try{tokens=unseal<Tokens>(row.encryptedTokens);}catch{throw new AppError(409,'יש לחבר מחדש את היומן');}
 if(tokens.expiresAt>Date.now()+60000)return tokens.access_token;
 if(!tokens.refresh_token)throw new AppError(409,'יש לחבר מחדש את היומן');
 const next=await tokenRequest({grant_type:'refresh_token',refresh_token:tokens.refresh_token,client_id:process.env.GOOGLE_CALENDAR_CLIENT_ID||'',client_secret:process.env.GOOGLE_CALENDAR_CLIENT_SECRET||''});
 tokens={...tokens,...next,refresh_token:next.refresh_token||tokens.refresh_token,expiresAt:Date.now()+next.expires_in*1000};await saveTokens(p,tokens);return tokens.access_token;
}
async function google(p:Principal,path:string,body?:unknown,method?:string,providedToken?:string){
 const token=providedToken||await accessToken(p),response=await fetch('https://www.googleapis.com/calendar/v3/'+path,{method:method||(body?'POST':'GET'),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new AppError(response.status===401||response.status===403?409:503,response.status===401||response.status===403?'יש לחבר מחדש את היומן ולאשר בדיקת זמינות והוספת אירועים':'היומן אינו זמין כרגע. לא נוסף אירוע');
 return await response.json();
}
export async function startCalendarConnection(p:Principal){
 if(!calendarConfigured())throw new AppError(503,'חיבור Google Calendar דורש הגדרה ראשונית של מנהל המערכת');
 const verifier=randomBytes(32).toString('base64url'),state=randomBytes(24).toString('base64url');
 const pending=seal({userId:p.userId,organizationId:p.organizationId,verifier,state,expiresAt:Date.now()+10*60_000});
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:process.env.GOOGLE_CALENDAR_CLIENT_ID!,redirect_uri:appUrl()+'/api/calendar/callback',response_type:'code',scope:scopes.join(' '),access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
 return new Response(null,{status:302,headers:{Location:url.toString(),'Cache-Control':'no-store','Set-Cookie':`samgad-calendar-state=${pending}; HttpOnly; SameSite=Lax; Path=/api/calendar; Max-Age=600${appUrl().startsWith('https:')?'; Secure':''}`}});
}
export async function finishCalendarConnection(p:Principal,request:Request){
 const url=new URL(request.url),cookie=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('samgad-calendar-state='))?.slice('samgad-calendar-state='.length);
 let state:{userId:string;organizationId:string;verifier:string;state:string;expiresAt:number};
 try{state=unseal(cookie||'');}catch{throw new AppError(403,'בקשת חיבור היומן פגה. יש להתחיל מחדש');}
 if(state.userId!==p.userId||state.organizationId!==p.organizationId||state.expiresAt<Date.now()||url.searchParams.get('state')!==state.state)throw new AppError(403,'לא ניתן לאמת את בקשת החיבור');
 if(!url.searchParams.get('code'))throw new AppError(422,'החיבור לא אושר ב-Google');
 const tokens=await tokenRequest({grant_type:'authorization_code',code:url.searchParams.get('code')!,redirect_uri:appUrl()+'/api/calendar/callback',client_id:process.env.GOOGLE_CALENDAR_CLIENT_ID!,client_secret:process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,code_verifier:state.verifier});
 if(!tokens.access_token||!scopes.every(scope=>tokens.scope?.split(' ').includes(scope)))throw new AppError(403,'יש לאשר את כל הרשאות היומן הנדרשות לבדיקת זמינות');
 const calendarsResponse=await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&showHidden=true',{headers:{Authorization:`Bearer ${tokens.access_token}`},signal:AbortSignal.timeout(15000)});
 if(!calendarsResponse.ok)throw new AppError(503,'לא ניתן לזהות את היומן הראשי. החיבור לא נשמר');
 const calendars=await calendarsResponse.json();const calendarId=calendars.items?.find((c:{primary?:boolean})=>c.primary)?.id;
 if(!calendarId)throw new AppError(422,'לא נמצא יומן ראשי בחשבון Google');
 let previous:Tokens|undefined;const row=await saved(p);if(row){try{previous=unseal<Tokens>(row.encryptedTokens);}catch{ /* Reconnection replaces invalid prior credentials. */ }}
 await saveTokens(p,{...tokens,calendarId,scheduleCalendarId:previous?.calendarId===calendarId?previous?.scheduleCalendarId:undefined,refresh_token:tokens.refresh_token||(previous?.calendarId===calendarId?previous?.refresh_token:undefined),expiresAt:Date.now()+tokens.expires_in*1000});
 return new Response(null,{status:302,headers:{Location:appUrl()+(p.manageAccess?'/':'/deputies')+'?view=calendar&connected=1','Cache-Control':'no-store','Set-Cookie':'samgad-calendar-state=; HttpOnly; SameSite=Lax; Path=/api/calendar; Max-Age=0'}});
}
/** Resolve the same selected calendar used by the workspace agenda. Never write to primary implicitly. */
async function bookingCalendar(p:Principal,providedToken?:string){
 const row=await saved(p);if(!row)throw new AppError(409,'יש לחבר תחילה את היומן');
 const tokens=unseal<Tokens>(row.encryptedTokens);
 if(tokens.scheduleCalendarId)return tokens.scheduleCalendarId;
 let page='';const matches:string[]=[];
 do{const result=await google(p,'users/me/calendarList?maxResults=250'+(page?'&pageToken='+encodeURIComponent(page):''),undefined,undefined,providedToken);
 for(const calendar of result.items||[])if(!calendar.deleted&&['owner','writer'].includes(calendar.accessRole)&&/לו.?ז\s*סמג/.test(calendar.summary||''))matches.push(calendar.id);
 page=result.nextPageToken||'';}while(page);
 if(matches.length!==1)throw new AppError(409,'יש לבחור את לו״ז סמג״ד בהגדרות היומן לפני הוספת אירוע');
 await saveTokens(p,{...tokens,scheduleCalendarId:matches[0]});return matches[0];
}
async function busyTimes(p:Principal,start:string,end:string,providedToken?:string,calendarId?:string):Promise<TimeRange[]>{
 const id=calendarId||await bookingCalendar(p,providedToken);
 const result=await google(p,'freeBusy',{timeMin:start,timeMax:end,timeZone:'Asia/Jerusalem',items:[{id}]},undefined,providedToken);
 const calendar=result.calendars?.[id];
 if(!calendar||calendar.errors?.length||!Array.isArray(calendar.busy))throw new AppError(503,'לא ניתן לבדוק זמינות בלו״ז סמג״ד. יש לבדוק את ההרשאה ליומן');
 if(calendar.busy.some((range:TimeRange)=>!Number.isFinite(Date.parse(range.start))||!Number.isFinite(Date.parse(range.end))||Date.parse(range.end)<Date.parse(range.start)))throw new AppError(503,'היומן החזיר זמינות שאינה תקינה. לא נוסף אירוע');
 return calendar.busy;
}
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v);
const clock=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export async function calendarSlots(p:Principal,input:unknown){
 const data=actionRef.extend({from:date,through:date,dayStart:clock.default('09:00'),dayEnd:clock.default('18:00'),minutes:z.number().int().min(5).max(480)}).strict().parse(input);
 await getActionTask(p,{kind:data.kind,id:data.id,occurrenceId:data.occurrenceId});
 if(data.through<data.from||data.through>addDays(data.from,31)||data.dayEnd<=data.dayStart)throw new AppError(422,'יש לבחור טווח של עד חודש ושעות פעילות תקינות');
 const start=new Date(zonedTime(data.from,data.dayStart)).toISOString(),end=new Date(zonedTime(data.through,data.dayEnd)).toISOString();
 const busy=await busyTimes(p,start,end);
 return {slots:findFreeSlots({...data,busy})};
}
export async function scheduleCalendarTask(p:Principal,input:unknown){
 const data=actionRef.extend({start:z.string().datetime(),end:z.string().datetime(),confirmed:z.literal(true),inviteeIds:z.array(z.string().min(1)).max(100).default([])}).strict().parse(input);
 const task=await getActionTask(p,{kind:data.kind,id:data.id,occurrenceId:data.occurrenceId});
 const start=Date.parse(data.start),end=Date.parse(data.end);
 if(start<Date.now()||end<=start||end-start>480*60_000||start>Date.now()+366*86400000)throw new AppError(422,'יש לבחור זמן עתידי ומשך של עד שמונה שעות');
 const selectedCalendar=await bookingCalendar(p);
 const allowed=(await calendarStatus(p)).invitees;
 const inviteeIds=[...new Set(data.inviteeIds)];
 const invitees=inviteeIds.map(id=>{const member=allowed.find(m=>m.id===id);if(!member)throw new AppError(403,'אחד המוזמנים אינו מורשה עוד. יש לבחור מוזמנים מחדש');return {email:member.email};});
 const calendarPath='calendars/'+encodeURIComponent(selectedCalendar)+'/events';
 const bookingKey=createHash('sha256').update(selectedCalendar+':'+task.bookingKey).digest('hex');
 const id=createHash('sha256').update(`${p.organizationId}:${p.userId}:${bookingKey}`).digest('hex');
 const token=await accessToken(p);
 return (await getDb()).transaction(async tx=>{
  if(process.env.DATABASE_URL)await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${connectionId(p)}))`);
  const [existing]=await tx.select().from(s.calendarBookings).where(eq(s.calendarBookings.id,id));
  const readEvent=async(eventId:string)=>{
   const response=await fetch('https://www.googleapis.com/calendar/v3/'+calendarPath+'/'+eventId,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(response.status===404)return null;
   if(response.status===410)return {status:'cancelled'};
   if(!response.ok)throw new AppError(503,'לא ניתן לבדוק אירוע קיים. לא נוסף אירוע');
   return await response.json();
  };
  let eventId=existing?.eventId||id,event=await readEvent(eventId);
  if(event?.status==='cancelled'){
   eventId=createHash('sha256').update(id+':'+data.start+':'+data.end).digest('hex');event=await readEvent(eventId);
   if(event?.status==='cancelled')throw new AppError(409,'אירוע קודם בזמן הזה נמחק. יש לבחור זמן אחר');
  }
  if(!event){
   const busy=await busyTimes(p,data.start,data.end,token,selectedCalendar);
   if(busy.some(b=>Date.parse(b.start)<end&&Date.parse(b.end)>start))throw new AppError(409,'הזמן נתפס בינתיים. יש לחפש זמן פנוי חדש');
   try{event=await google(p,calendarPath+'?sendUpdates=all',{attendees:invitees,id:eventId,summary:task.title,description:task.description,start:{dateTime:data.start,timeZone:'Asia/Jerusalem'},end:{dateTime:data.end,timeZone:'Asia/Jerusalem'},transparency:'opaque'},'POST',token);}
   catch(error){event=await readEvent(eventId);if(!event||event.status==='cancelled')throw error;}
  }
  const actualStart=event.start?.dateTime,actualEnd=event.end?.dateTime;
  if(!actualStart||!actualEnd)throw new AppError(503,'לא ניתן לאמת את פרטי האירוע');
  const eventUrl=event.htmlLink||'https://calendar.google.com';
  await tx.insert(s.calendarBookings).values({id,organizationId:p.organizationId,userId:p.userId,taskKey:bookingKey,eventId,eventUrl,startsAt:actualStart,endsAt:actualEnd}).onConflictDoUpdate({target:s.calendarBookings.id,set:{eventId,eventUrl,startsAt:actualStart,endsAt:actualEnd}});
  return {url:eventUrl,start:actualStart,end:actualEnd,alreadyAdded:Boolean(existing)};
 });
}
export async function disconnectCalendar(p:Principal){await (await getDb()).delete(s.calendarConnections).where(and(eq(s.calendarConnections.id,connectionId(p)),eq(s.calendarConnections.userId,p.userId),eq(s.calendarConnections.organizationId,p.organizationId)));return {connected:false};}

/** Read the workspace owner's calendar; filter before returning any event data. */
export async function workspaceSchedule(p:Principal){
 const db=await getDb();
 const [settings]=await db.select().from(s.workspaceSettings).where(eq(s.workspaceSettings.organizationId,p.organizationId));
 if(!settings)return {connected:false,events:[]};
 const [owner]=await db.select({id:s.user.id,name:s.user.name}).from(s.memberships).innerJoin(s.user,eq(s.user.id,s.memberships.userId)).where(and(eq(s.memberships.organizationId,p.organizationId),eq(s.memberships.userId,settings.ownerId),eq(s.memberships.active,true)));
 if(!owner)return {connected:false,events:[]};
 const source:Principal={...p,userId:owner.id,name:owner.name};
 if(!await saved(source))return {connected:false,events:[]};
 const [viewer]=await db.select({email:s.user.email,name:s.user.name}).from(s.user).where(eq(s.user.id,p.userId));
 const rawGroups=await db.select().from(s.rhythmGroups).where(and(eq(s.rhythmGroups.organizationId,p.organizationId),eq(s.rhythmGroups.creatorId,owner.id)));
 const members=await db.select({email:s.user.email,name:s.user.name}).from(s.memberships).innerJoin(s.user,eq(s.user.id,s.memberships.userId)).where(and(eq(s.memberships.organizationId,p.organizationId),eq(s.memberships.active,true),authorizedMember(p.organizationId)));
 const groups=expandRoleGroups(rawGroups,members);
 const roles=groups.filter(group=>group.emails.some(email=>email.toLowerCase()===viewer?.email.toLowerCase())).map(group=>group.name.replace(/\s*\(קבוצה\)\s*$/,''));
 const connection=await saved(source);
 const tokens=unseal<Tokens>(connection!.encryptedTokens);
 const selectedCalendar=tokens.scheduleCalendarId||'primary';
 const today=localDate(); const weekStart=addDays(today,-new Date(today+'T12:00:00Z').getUTCDay());
 const timeMin=new Date(zonedTime(weekStart,'00:00')).toISOString(),timeMax=new Date(Date.now()+90*86400000).toISOString();
 const events:Array<{id:string;title:string;start:string;end:string;allDay:boolean;location:string;groupIds?:string[]}>=[];
 let page='';
 do{
  const query=new URLSearchParams({timeMin,timeMax,singleEvents:'true',orderBy:'startTime',maxResults:'250',timeZone:'Asia/Jerusalem',...(page?{pageToken:page}:{})});
  const result=await google(source,'calendars/'+encodeURIComponent(selectedCalendar)+'/events?'+query);
  for(const event of result.items||[]){
   if(event.status==='cancelled'||!event.start||!event.end)continue;
   const text=`${event.summary||''}\n${event.description||''}`;
   const matches=(role:string)=>mentionsRole(text,role)||Object.entries(roleCollections).some(([collection,children])=>children.includes(role)&&mentionsRole(text,collection));
   const invitedEmails=(event.attendees||[]).filter((a:{responseStatus?:string})=>a.responseStatus!=='declined').map((a:{email?:string})=>a.email?.toLowerCase());
   const invited=invitedEmails.includes(viewer?.email.toLowerCase());
   if(p.userId!==owner.id&&!invited&&!roles.some(matches))continue;
   const groupIds=groups.filter(group=>matches(roleName(group.name))||group.emails.some(email=>invitedEmails.includes(email))).map(group=>group.id);
   events.push({id:event.id,title:event.summary||'ללא כותרת',start:event.start.dateTime||event.start.date,end:event.end.dateTime||event.end.date,allDay:Boolean(event.start.date),location:event.location||'',...(p.userId===owner.id?{groupIds}:{})});
  }
  page=result.nextPageToken||'';
 }while(page);
 return {connected:true,events,through:timeMax};
}

export async function scheduleCalendars(p:Principal){
 if(!p.manageAccess)throw new AppError(403,'רק בעל המרחב רשאי לבחור את יומן הלו״ז');
 const row=await saved(p);if(!row)return {calendars:[],selected:''};
 const tokens=unseal<Tokens>(row.encryptedTokens),calendars:Array<{id:string;name:string}>=[];let page='';
 do{const result=await google(p,'users/me/calendarList?maxResults=250'+(page?'&pageToken='+encodeURIComponent(page):''));
 for(const calendar of result.items||[])if(!calendar.deleted&&['owner','writer','reader'].includes(calendar.accessRole))calendars.push({id:calendar.id,name:calendar.summary||calendar.id});
 page=result.nextPageToken||'';}while(page);
 return {calendars,selected:tokens.scheduleCalendarId||tokens.calendarId||''};
}
export async function selectScheduleCalendar(p:Principal,input:unknown){
 const {calendarId}=z.object({calendarId:z.string().min(1).max(1024)}).strict().parse(input);
 const available=await scheduleCalendars(p);
 if(!available.calendars.some(calendar=>calendar.id===calendarId))throw new AppError(403,'היומן אינו זמין לקריאה בחשבון שלך');
 const row=await saved(p);if(!row)throw new AppError(409,'יש לחבר תחילה את היומן');
 await saveTokens(p,{...unseal<Tokens>(row.encryptedTokens),scheduleCalendarId:calendarId});
 return {saved:true};
}
