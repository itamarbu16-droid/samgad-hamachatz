import {createHash} from 'node:crypto';
import {eq,inArray} from 'drizzle-orm';
import {getDb} from './db';
import * as s from './schema';
import {countOwnOverdue} from './hourly-task-selection';
export const HOURLY_PREFIX='hourly-overdue:';
export const hourlyEnabled=()=>process.env.HOURLY_REMINDERS_ENABLED==='true';
export function hourStart(now:Date){return new Date(Math.floor(now.getTime()/3600000)*3600000);}
export function hourlyId(org:string,user:string,now:Date){return HOURLY_PREFIX+createHash('sha256').update(JSON.stringify([org,user])).digest('hex')+':'+Math.floor(now.getTime()/3600000);}
export function hourlyTag(org:string,user:string){return 'hourly-'+createHash('sha256').update(JSON.stringify([org,user])).digest('base64url').slice(0,24);}
export function hourlyMessage(count:number){return {title:'תזכורת: משימות באיחור',body:`יש לך ${count} משימות באיחור שטרם דווחו כבוצעו. לפרטים פתח את האפליקציה.`,url:'/deputies?view=tasks'};}
/** Separate key-only ledger: immutable old deployments cannot read or flush it. */
export async function pendingHourlyPush(p:{organizationId:string;userId:string},now=new Date()){
 if(!hourlyEnabled())return [];
 const db=await getDb(),id=hourlyId(p.organizationId,p.userId,now);
 const rows=await db.select().from(s.overdueDigestRuns).where(inArray(s.overdueDigestRuns.id,[id,id+':ack']));
 if(!rows.some(row=>row.id===id)||rows.some(row=>row.id===id+':ack'))return [];
 const count=await countOwnOverdue(db,p.organizationId,p.userId,now);
 if(!count)return [];
 return [{id,...hourlyMessage(count),tag:hourlyTag(p.organizationId,p.userId)}];
}
export async function acknowledgeHourlyPush(p:{organizationId:string;userId:string},ids:string[],now=new Date()){
 if(!hourlyEnabled())return;
 const id=hourlyId(p.organizationId,p.userId,now);
 if(!ids.includes(id))return;
 const db=await getDb();
 const [queued]=await db.select().from(s.overdueDigestRuns).where(eq(s.overdueDigestRuns.id,id));
 if(queued)await db.insert(s.overdueDigestRuns).values({id:id+':ack',createdAt:now}).onConflictDoNothing();
}
