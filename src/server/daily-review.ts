import {and,eq,or,ne,sql} from 'drizzle-orm';
import {getDb,type Database} from './db';
import {getAuth} from './auth';
import {AppError,localDate} from './policy';
import * as s from './schema';

// Never call normal workspace/rhythm helpers: they purge, initialize or notify.
// Authentication also uses the read-only transaction, without session renewal.
export async function dailyReview(request:Request,now=new Date()){
 return (await getDb()).transaction(async tx=>{
  const session=await (await getAuth(false,tx as unknown as Database)).api.getSession({headers:request.headers,query:{disableRefresh:true,disableCookieCache:true}});
  if(!session||session.session.expiresAt<=now)throw new AppError(401,'יש להתחבר מחדש כדי לבדוק את המשימות');
  return readOwnerReview(tx as unknown as Database,session.user.id,now);
 },{accessMode:'read only',isolationLevel:'repeatable read'});
}
export async function readOwnerReview(db:Database,userId:string,now:Date){
 const owners=await db.select({organizationId:s.workspaceSettings.organizationId}).from(s.workspaceSettings)
  .innerJoin(s.memberships,and(eq(s.memberships.organizationId,s.workspaceSettings.organizationId),eq(s.memberships.userId,userId),eq(s.memberships.active,true),or(eq(s.memberships.role,'deputy'),eq(s.memberships.editAll,true))))
  .where(eq(s.workspaceSettings.ownerId,userId));
 if(owners.length!==1)throw new AppError(403,'הסקירה זמינה רק לבעלים של סביבת עבודה יחידה');
 const organizationId=owners[0].organizationId,today=localDate(now,'Asia/Jerusalem');
 const people=await db.select({id:s.user.id,name:s.user.name,active:s.memberships.active}).from(s.memberships).innerJoin(s.user,eq(s.user.id,s.memberships.userId)).where(eq(s.memberships.organizationId,organizationId));
 const tasks=await db.select().from(s.tasks).where(and(eq(s.tasks.organizationId,organizationId),or(ne(s.tasks.ownerId,s.tasks.creatorId),eq(s.tasks.creatorId,userId))));
 // Preserve the normal app's privacy boundary for other members' personal work.
 const itemScope=and(eq(s.rhythmItems.organizationId,organizationId),eq(s.rhythmItems.archived,false),or(eq(s.rhythmItems.creatorId,userId),and(ne(s.rhythmItems.category,'point'),sql`${s.rhythmItems.assigneeIds} <> jsonb_build_array(${s.rhythmItems.creatorId})`)));
 const items=await db.select().from(s.rhythmItems).where(itemScope);
 const occurrences=await db.select({occurrence:s.rhythmOccurrences}).from(s.rhythmOccurrences).innerJoin(s.rhythmItems,eq(s.rhythmItems.id,s.rhythmOccurrences.itemId)).where(itemScope);
 const extensions=await db.select({id:s.deadlineRequests.id,kind:s.deadlineRequests.kind,taskId:s.deadlineRequests.taskId,occurrenceId:s.deadlineRequests.occurrenceId,requesterId:s.deadlineRequests.requesterId,originalDate:s.deadlineRequests.originalDate,requestedDate:s.deadlineRequests.requestedDate}).from(s.deadlineRequests).where(and(eq(s.deadlineRequests.organizationId,organizationId),eq(s.deadlineRequests.status,'pending')));
 const records:ReviewRecord[]=[];
 for(const t of tasks){
  if(['completed','cancelled'].includes(t.status))continue;
  records.push({key:`task:${t.id}`,title:t.title,category:'task',personal:t.creatorId===userId&&t.ownerId===userId,assigneeIds:[t.ownerId],dueDate:t.dueDate,urgent:t.priority==='urgent',status:t.status,overdue:!!t.dueDate&&t.dueDate<today&&t.status!=='pending_review',blocked:t.status==='blocked',awaitingApprovalIds:t.status==='pending_review'?[t.ownerId]:[],outstandingAssigneeIds:t.status==='pending_review'?[]:[t.ownerId],shared:false,pendingExtensions:extensions.filter(e=>e.kind==='task'&&e.taskId===t.id),version:t.version});
 }
 for(const item of items.filter(i=>i.frequency==='once')){
  for(const {occurrence:o} of occurrences.filter(r=>r.occurrence.itemId===item.id)){
   const complete=item.assigneeIds.filter(id=>!!o.completions[id]),shared=item.completionMode==='shared';
   if(o.completedAt||(shared?complete.length>0:item.assigneeIds.length>0&&complete.length===item.assigneeIds.length))continue;
   const waiting=item.assigneeIds.filter(id=>!!o.reports[id]&&!o.completions[id]);
   const outstanding=item.assigneeIds.filter(id=>!o.reports[id]&&!o.completions[id]);
   const dueDate=item.hasDeadline?o.dueDate:null;
   records.push({key:`rhythm:${item.id}:${o.id}`,title:item.title,category:item.category,personal:item.creatorId===userId&&item.assigneeIds.length===1&&item.assigneeIds[0]===userId,assigneeIds:item.assigneeIds,dueDate,urgent:item.manualUrgent||o.urgent,status:waiting.length?'pending_review':'open',overdue:!!dueDate&&dueDate<today&&outstanding.length>0&&!(shared&&waiting.length>0),blocked:false,awaitingApprovalIds:waiting,outstandingAssigneeIds:shared&&waiting.length?[]:outstanding,shared,pendingExtensions:extensions.filter(e=>e.kind==='rhythm'&&e.taskId===item.id&&e.occurrenceId===o.id),version:item.version,occurrenceVersion:o.version});
  }
 }
 return {generatedAt:now.toISOString(),today,timeZone:'Asia/Jerusalem',ownerId:userId,organizationId,readOnly:true,people,records,
  missingOccurrences:items.filter(i=>i.frequency==='once'&&!occurrences.some(o=>o.occurrence.itemId===i.id)).map(i=>({id:i.id,title:i.title})),
  history:{repeatPatternsAvailable:false,reason:'Completion history is pruned after one calendar month; assignment and date edits can replace earlier state. Do not infer repeated non-performance from this snapshot.'},
  scope:{recurringChecklistIncluded:false,notes:'Current one-off points and tasks only. Pending review is not non-completion. Shared tasks must not be attributed as individual failures. Pending extension requests are not approved extensions.'}};
}
type ReviewRecord={key:string;title:string;category:string;personal:boolean;assigneeIds:string[];dueDate:string|null;urgent:boolean;status:string;overdue:boolean;blocked:boolean;awaitingApprovalIds:string[];outstandingAssigneeIds:string[];shared:boolean;pendingExtensions:Array<{id:string;kind:string;taskId:string;occurrenceId:string|null;requesterId:string;originalDate:string|null;requestedDate:string}>;version:number;occurrenceVersion?:number};
