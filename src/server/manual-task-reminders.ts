import {and,gte,like,sql} from 'drizzle-orm';
import {getDb} from './db';
import {overdueDigestRuns as ledger} from './schema';
import {AppError,canEditAll,localDate,type Principal} from './policy';
import {hourlyPrincipal} from './hourly-task-selection';
import {readOverdueTarget,currentRecipientTarget,manualClaimId,manualReminderInput,manualRecipientPrefix,MANUAL_COOLDOWN_MS} from './manual-task-reminder-state';
import type {ManualReminderResult} from '../lib/manual-task-reminder';
import {wakeManualDevice} from './manual-device-push';

const limitRecipients=20;

/** Commit the in-app notice before transport; duplicate requests never wake twice. */
export async function sendManualTaskReminder(p:Principal,input:unknown,{now=new Date(),origin,request=(input,init)=>globalThis.fetch(input,init)}:{now?:Date;origin?:string;request?:typeof fetch}={}):Promise<ManualReminderResult>{
 const ref=manualReminderInput.parse(input);
 if(!canEditAll(p))throw new AppError(403,'שליחת תזכורת דורשת הרשאת עריכה מלאה');
 const db=await getDb();
 const result:ManualReminderResult={created:0,throttled:0,accepted:0,notEnrolled:0,unconfirmed:0};
 const created=await db.transaction(async tx=>{
  const actor=await hourlyPrincipal(tx,p.organizationId,p.userId);
  if(!actor||!canEditAll(actor))throw new AppError(403,'שליחת תזכורת דורשת הרשאת עריכה מלאה');
  const target=await readOverdueTarget(tx,actor,ref,localDate(now),true);
  const recipients=target.assignees.filter(id=>id!==p.userId).sort();
  if(recipients.length>limitRecipients)throw new AppError(422,'יש יותר מדי אחראים לשליחת תזכורת בבת אחת');
  const reserved:{recipient:string;claimId:string}[]=[];
  for(const recipient of recipients){
   if(!await currentRecipientTarget(tx,p.organizationId,recipient,ref,now))continue;
   const prefix=manualRecipientPrefix(p.organizationId,recipient);
   const lock=await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${prefix})) as locked`);
   if(!lock.rows[0]?.locked){result.throttled++;continue;}
   const [recent]=await tx.select({id:ledger.id}).from(ledger).where(and(like(ledger.id,prefix+'%'),
    gte(ledger.createdAt,new Date(now.getTime()-MANUAL_COOLDOWN_MS)))).limit(1);
   if(recent){result.throttled++;continue;}
   const id=manualClaimId(prefix,ref);
   await tx.insert(ledger).values({id,createdAt:now});
   reserved.push({recipient,claimId:id});
  }
  return reserved;
 });
 result.created=created.length;
 if(!origin){result.notEnrolled=created.length;return result;}
 for(let i=0;i<created.length;i+=5){
  const outcomes=await Promise.all(created.slice(i,i+5).map(({recipient,claimId})=>wakeManualDevice(db,p.organizationId,origin,recipient,ref,claimId,now,request).catch(()=>'unconfirmed' as const)));
  for(const outcome of outcomes)if(outcome!=='ineligible')result[outcome]++;
 }
 return result;
}
