import {and,desc,eq,gte,inArray,like,notLike,sql} from 'drizzle-orm';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {getDb,type Database} from './db';
import {overdueDigestRuns as ledger,rhythmItems,rhythmOccurrences} from './schema';
import {findTask} from './service';
import {rhythmScope} from './rhythm';
import {AppError,localDate,canEditAll,type Principal} from './policy';
import {hourlyPrincipal} from './hourly-task-selection';
import {seal,unseal} from './google-calendar';
import {canRemindLegacy,outstandingRhythmIds} from '../lib/manual-task-reminder';

const id=z.string().min(1).max(150);
const version=z.number().int().positive();
export const manualReminderInput=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('task'),id,version}).strict(),
 z.object({kind:z.literal('rhythm'),id,occurrenceId:id,version,occurrenceVersion:version}).strict()
]);
export type ReminderRef = z.infer<typeof manualReminderInput>;
export type ReminderDb=Database|Parameters<Parameters<Database['transaction']>[0]>[0];
export const MANUAL_PREFIX='manual-overdue:v1:';
export const MANUAL_VISIBLE_MS=6*60*60*1000;
export const MANUAL_COOLDOWN_MS=15*60*1000;
export const manualRecipientPrefix=(org:string,recipient:string)=>MANUAL_PREFIX+createHash('sha256').update(JSON.stringify([org,recipient])).digest('hex')+':';
export const manualClaimId=(prefix:string,ref:ReminderRef)=>prefix+seal(ref);
const isClaim=(value:string,prefix:string)=>value.startsWith(prefix)&&/^[A-Za-z0-9_-]{40,1024}$/.test(value.slice(prefix.length));

export async function readOverdueTarget(db:ReminderDb,p:Principal,ref:ReminderRef,today:string,requireVersion=false){
 if(ref.kind==='task'){
  const task=await findTask(db,p,ref.id);
  if(requireVersion&&task.version!==ref.version)throw new AppError(409,'המשימה השתנתה. יש לרענן');
  return {assignees:canRemindLegacy(task.status,task.dueDate,today)&&task.ownerId?[task.ownerId]:[],
    personal:task.ownerId===task.creatorId, dueDate:task.dueDate, recurring:false};
 }
 const [entry]=await db.select({item:rhythmItems,occurrence:rhythmOccurrences}).from(rhythmItems)
  .innerJoin(rhythmOccurrences,eq(rhythmOccurrences.itemId,rhythmItems.id)).where(and(
   eq(rhythmItems.id,ref.id),eq(rhythmItems.category,'task'),eq(rhythmItems.archived,false),rhythmScope(p),
   eq(rhythmOccurrences.id,ref.occurrenceId))).limit(1);
 if(!entry)throw new AppError(404,'מופע המשימה אינו זמין');
 const {item,occurrence}=entry;
 if(requireVersion&&(item.version!==ref.version||occurrence.version!==ref.occurrenceVersion))throw new AppError(409,'המשימה השתנתה. יש לרענן');
 return {assignees:item.hasDeadline&&occurrence.dueDate<today?outstandingRhythmIds(item,occurrence):[],
  personal:item.assigneeIds.length===1&&item.assigneeIds[0]===item.creatorId,dueDate:occurrence.dueDate,recurring:item.frequency!=='once'};
}

export async function currentRecipientTarget(db:ReminderDb,org:string,recipient:string,ref:ReminderRef,now:Date){
 const principal=await hourlyPrincipal(db,org,recipient);
 if(!principal)return null;
 try {
  const result=await readOverdueTarget(db,principal,ref,localDate(now));
  return result.assignees.includes(recipient)?{principal,...result}:null;
 } catch(e) {
  if(e instanceof AppError&&[403,404].includes(e.status))return null;
  throw e;
 }
}

export async function pendingManualReminder(p:Pick<Principal,'organizationId'|'userId'>,now=new Date()){
 const db=await getDb(),prefix=manualRecipientPrefix(p.organizationId,p.userId),expires=new Date(now.getTime()-MANUAL_VISIBLE_MS);
 const rows=await db.select({id:ledger.id}).from(ledger).where(and(like(ledger.id,prefix+'%'),gte(ledger.createdAt,expires),
  notLike(ledger.id,'%:ack'),sql`NOT EXISTS (SELECT 1 FROM overdue_digest_runs manual_ack WHERE manual_ack.id = ${ledger.id} || ':ack')`))
  .orderBy(desc(ledger.createdAt),desc(ledger.id)).limit(64);
 for(const row of rows){
  if(!isClaim(row.id,prefix))continue;
  let ref:ReminderRef;
  try{ref=manualReminderInput.parse(unseal(row.id.slice(prefix.length)));}catch{continue;}
  const target=await currentRecipientTarget(db,p.organizationId,p.userId,ref,now);if(!target)continue;
  const principal=target.principal;
  const manager=canEditAll(principal),ownsWorkspace=principal.workspaceOwnerId===principal.userId;
  const url=new URLSearchParams({view:target.personal&&ownsWorkspace?'personal':'tasks'});
  if(ref.kind==='task')url.set('task',ref.id);
  else {url.set('occurrence',ref.occurrenceId);if(target.dueDate)url.set('month',target.dueDate.slice(0,7));if(target.recurring&&manager)url.set('tab','rhythm');}
  return [{id:row.id,url:(manager?'/':'/deputies')+'?'+url}];
 }
 return [];
}

export async function acknowledgeManualReminder(p:Pick<Principal,'organizationId'|'userId'>,ids:string[],now=new Date()){
 const prefix=manualRecipientPrefix(p.organizationId,p.userId),validIds=ids.filter(id=>isClaim(id,prefix));
 if(!validIds.length)return;
 const db=await getDb();
 const rows=await db.select({id:ledger.id,createdAt:ledger.createdAt}).from(ledger).where(and(inArray(ledger.id,validIds),gte(ledger.createdAt,new Date(now.getTime()-MANUAL_VISIBLE_MS))));
 if(rows.length)await db.insert(ledger).values(rows.map(row=>({id:row.id+':ack',createdAt:row.createdAt}))).onConflictDoNothing();
}
