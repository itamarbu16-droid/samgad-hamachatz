import {and,eq,gte,like,lt,sql} from 'drizzle-orm';
import {createHash} from 'node:crypto';
import {getDb} from './db';
import * as s from './schema';
import {countOwnOverdue} from './hourly-task-selection';
import {hourlyEnabled,HOURLY_PREFIX,hourlyId,hourStart,hourlyTag} from './hourly-reminder-state';
import {validPushEndpoint,vapidAuthorization} from './notifications';
import {unseal} from './google-calendar';

/** No occurrence generation, mail, ordinary reminders, or source-record changes. */
async function recipients(db:Awaited<ReturnType<typeof getDb>>){
 return db.selectDistinct({org:s.pushSubscriptions.organizationId,user:s.pushSubscriptions.userId})
  .from(s.pushSubscriptions).innerJoin(s.pushConfig,eq(s.pushConfig.organizationId,s.pushSubscriptions.organizationId));
}
export async function queueHourlyReminders(now=new Date()){
 if(!hourlyEnabled())return 0;
 const db=await getDb();let queued=0;
 for(const recipient of await recipients(db)){
  const devices=await db.select({endpoint:s.pushSubscriptions.endpoint}).from(s.pushSubscriptions).where(and(eq(s.pushSubscriptions.organizationId,recipient.org),eq(s.pushSubscriptions.userId,recipient.user)));
  if(!devices.some(device=>validPushEndpoint(device.endpoint))||!await countOwnOverdue(db,recipient.org,recipient.user,now))continue;
  const id=hourlyId(recipient.org,recipient.user,now);
  const inserted=await db.insert(s.overdueDigestRuns).values({id,createdAt:hourStart(now)}).onConflictDoNothing().returning({id:s.overdueDigestRuns.id});
  queued+=inserted.length;
 }
 // A key-only ledger contains no notification payload, identity or routing data.
 // Old daily cleanup also removes only records older than 35 days.
 await db.delete(s.overdueDigestRuns).where(and(like(s.overdueDigestRuns.id,HOURLY_PREFIX+'%'),lt(s.overdueDigestRuns.createdAt,new Date(now.getTime()-35*86400000))));
 return queued;
}
/** Bounded independent worker. Device receipts survive event acknowledgement.
 * Network outcome can be unknown after a crash; stable notification tags and a
 * separate Web Push Topic coalesce retries without touching ordinary reminders.
 */
export async function flushHourlyReminders(now=new Date()){
 const result={sent:0,failed:0,skipped:0,remaining:0};if(!hourlyEnabled())return result;
 const db=await getDb();
 const started=Date.now();const current=()=>new Date(now.getTime()+Date.now()-started);
 const audience=await recipients(db);
 let processed=0;
 for(const recipient of audience){
  if(Date.now()-started>=45000||processed>=50)break;
  const id=hourlyId(recipient.org,recipient.user,now);
  const outcome=await db.transaction(async tx=>{
   const lock=await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${id})) as locked`);
   if(!lock.rows[0]?.locked)return null;
   const state=await tx.select().from(s.overdueDigestRuns).where(like(s.overdueDigestRuns.id,id+'%'));
   const has=(suffix:string)=>state.some(row=>row.id===id+suffix);
   const attempts=state.filter(row=>row.id.startsWith(id+':attempt:')).length;
   if(!has('')||has(':sent')||has(':ack')||attempts>=5)return null;
   processed++;
   const event={id,organizationId:recipient.org,recipientId:recipient.user};
   const mark=async(suffix:string)=>{await tx.insert(s.overdueDigestRuns).values({id:id+suffix,createdAt:current()}).onConflictDoNothing();};
   if(id!==hourlyId(recipient.org,recipient.user,current())||!await countOwnOverdue(tx,recipient.org,recipient.user,current())){
    await mark(':ack');return 'skipped' as const;
   }
   const subscriptions=await tx.select().from(s.pushSubscriptions).where(and(eq(s.pushSubscriptions.organizationId,event.organizationId),eq(s.pushSubscriptions.userId,event.recipientId)));
   const [config]=await tx.select().from(s.pushConfig).where(eq(s.pushConfig.organizationId,event.organizationId));
   if(!config||!subscriptions.some(subscription=>validPushEndpoint(subscription.endpoint))){await mark(':ack');return 'skipped' as const;}
   let privateKey:string;
   try{privateKey=(unseal(config.encryptedPrivateKey) as {key:string}).key;}catch{
    await mark(':attempt:'+attempts);return 'failed' as const;
   }
   let failed=false,accepted=0;
   for(const subscription of subscriptions){
    if(Date.now()-started>=45000){failed=true;break;}
    const ttl=Math.floor((hourStart(now).getTime()+3600000-current().getTime())/1000);
    if(ttl<=0||!await countOwnOverdue(tx,event.organizationId,event.recipientId,current())){
     await mark(':ack');return 'skipped' as const;
    }
    if(!validPushEndpoint(subscription.endpoint))continue;
    const receiptId=event.id+':device:'+createHash('sha256').update(subscription.endpoint).digest('hex');
    const receipt=await tx.select({id:s.overdueDigestRuns.id}).from(s.overdueDigestRuns).where(eq(s.overdueDigestRuns.id,receiptId));
    if(receipt.length){accepted++;continue;}
    try{
     const response=await fetch(subscription.endpoint,{method:'POST',headers:{Authorization:vapidAuthorization(subscription.endpoint,config.publicKey,privateKey),
      TTL:String(ttl),Urgency:'high',Topic:hourlyTag(event.organizationId,event.recipientId),'Content-Length':'0'},redirect:'error',signal:AbortSignal.timeout(8000)});
     if([404,410].includes(response.status))await tx.delete(s.pushSubscriptions).where(eq(s.pushSubscriptions.id,subscription.id));
     else if(response.ok){accepted++;await tx.insert(s.overdueDigestRuns).values({id:receiptId,createdAt:now}).onConflictDoNothing();}
     else failed=true;
    }catch{failed=true;}
   }
   if(!failed&&!accepted){await mark(':ack');return 'skipped' as const;}
   await mark(':attempt:'+attempts);if(!failed)await mark(':sent');
   return failed?'failed' as const:'sent' as const;
  });
  if(outcome)result[outcome]++;
 }
 // Aggregate resumable slots, not delivery promises: permissions are rechecked
 // on the next drain. Only current-hour work is ever reported as remaining.
 if(hourStart(current()).getTime()===hourStart(now).getTime()){
  const rows=await db.select({id:s.overdueDigestRuns.id}).from(s.overdueDigestRuns).where(and(
   like(s.overdueDigestRuns.id,HOURLY_PREFIX+'%'),gte(s.overdueDigestRuns.createdAt,hourStart(now)),
   lt(s.overdueDigestRuns.createdAt,new Date(hourStart(now).getTime()+3600000))));
  const keys=new Set(rows.map(row=>row.id));
  result.remaining=audience.filter(recipient=>{
   const id=hourlyId(recipient.org,recipient.user,now);
   return keys.has(id)&&!keys.has(id+':sent')&&!keys.has(id+':ack')&&!keys.has(id+':attempt:4');
  }).length;
 }
 return result;
}
export async function runHourlyReminders(now=new Date()){
 if(!hourlyEnabled())return {queued:0,sent:0,failed:0,skipped:0,remaining:0};
 const started=Date.now();let queued=await queueHourlyReminders(now);
 const current=new Date(now.getTime()+Date.now()-started);
 if(hourStart(current).getTime()!==hourStart(now).getTime())queued+=await queueHourlyReminders(current);
 return {queued,...await flushHourlyReminders(new Date(now.getTime()+Date.now()-started))};
}
