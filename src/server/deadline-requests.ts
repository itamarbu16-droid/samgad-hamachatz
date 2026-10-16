import {and,eq,desc,getTableColumns} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getDb} from './db';
import * as s from './schema';
import {AppError,assertWrite,canEditAll,type Principal} from './policy';
import {actionRef,getActionTask} from './task-actions';
import {queueTaskNotification} from './notifications';
export async function listDeadlineRequests(p:Principal){
 const db=await getDb();return db.select({...getTableColumns(s.deadlineRequests),requesterName:s.user.name}).from(s.deadlineRequests).innerJoin(s.user,eq(s.user.id,s.deadlineRequests.requesterId)).where(and(eq(s.deadlineRequests.organizationId,p.organizationId),p.manageAccess?undefined:eq(s.deadlineRequests.requesterId,p.userId))).orderBy(desc(s.deadlineRequests.createdAt)).limit(100);
}
export async function requestDeadline(p:Principal,input:unknown){
 assertWrite(p);
 const data=actionRef.extend({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),reason:z.string().trim().min(2).max(1500)}).strict().parse(input);
 const task=await getActionTask(p,{kind:data.kind,id:data.id,occurrenceId:data.occurrenceId});
 if(!task.canEdit)throw new AppError(403,'אפשר לבקש הארכה רק למשימה שהוקצתה לך');
 if(!Number.isFinite(Date.parse(data.date+'T12:00:00Z'))||new Date(data.date+'T12:00:00Z').toISOString().slice(0,10)!==data.date||task.dueDate&&data.date<=task.dueDate)throw new AppError(422,'יש לבחור תג״ב מאוחר ותקין');
 if(data.kind==='rhythm'&&!task.occurrence)throw new AppError(422,'יש לבחור מופע משימה');
 const db=await getDb();return db.transaction(async tx=>{
  const [request]=await tx.insert(s.deadlineRequests).values({id:randomUUID(),organizationId:p.organizationId,requesterId:p.userId,kind:data.kind,taskId:data.id,occurrenceId:data.occurrenceId,title:task.title,originalDate:task.dueDate,requestedDate:data.date,reason:data.reason}).onConflictDoNothing().returning();
  if(!request)throw new AppError(409,'כבר קיימת בקשת הארכה שממתינה לאישור');
  await queueTaskNotification(tx,p,[], 'בקשת הארכת תג״ב',task.title);
  return request;
 });
}
export async function resolveDeadline(p:Principal,input:unknown){
 if(!p.manageAccess)throw new AppError(403,'רק מנהל המערכת רשאי לאשר הארכת תג״ב');
 const data=z.object({id:z.string(),approve:z.boolean()}).strict().parse(input),db=await getDb();
 // Serialize decisions and commit deadline changes together with the resolution.
 return db.transaction(async tx=>{
  const [request]=await tx.select().from(s.deadlineRequests).where(and(eq(s.deadlineRequests.id,data.id),eq(s.deadlineRequests.organizationId,p.organizationId))).for('update');
  if(!request)throw new AppError(404,'הבקשה לא נמצאה');
  if(request.status!=='pending')throw new AppError(409,'הבקשה כבר הוכרעה');
  if(data.approve){
   const task=await getActionTask(p,{kind:request.kind,id:request.taskId,occurrenceId:request.occurrenceId||undefined},tx);
   if(!task.assigneeIds.includes(request.requesterId))throw new AppError(409,'המשימה אינה משויכת עוד למבקש ההארכה');
   if(task.dueDate!==request.originalDate)throw new AppError(409,'התג״ב השתנה מאז הגשת הבקשה. יש להגיש בקשה חדשה');
   if(request.kind==='task'){
    const [changed]=await tx.update(s.tasks).set({dueDate:request.requestedDate,version:task.version+1,updatedAt:new Date()}).where(and(eq(s.tasks.id,request.taskId),eq(s.tasks.organizationId,p.organizationId),eq(s.tasks.version,task.version))).returning();
    if(!changed)throw new AppError(409,'המשימה השתנתה');
   }else{
    const occurrence=task.occurrence;if(!occurrence)throw new AppError(404,'מופע המשימה אינו זמין');
    if(task.frequency==='once'){
     const [changed]=await tx.update(s.rhythmItems).set({startDate:request.requestedDate,hasDeadline:true,version:task.version+1}).where(and(eq(s.rhythmItems.id,request.taskId),eq(s.rhythmItems.organizationId,p.organizationId),eq(s.rhythmItems.version,task.version))).returning();
     if(!changed)throw new AppError(409,'המשימה השתנתה');
    }
    const [changed]=await tx.update(s.rhythmOccurrences).set({dueDate:request.requestedDate,scheduledDate:task.frequency==='once'?request.requestedDate:occurrence.scheduledDate||occurrence.dueDate,version:occurrence.version+1}).where(and(eq(s.rhythmOccurrences.id,occurrence.id),eq(s.rhythmOccurrences.version,occurrence.version))).returning();
    if(!changed)throw new AppError(409,'מופע המשימה השתנה');
   }
  }
  const [updated]=await tx.update(s.deadlineRequests).set({status:data.approve?'approved':'rejected',resolvedAt:new Date(),resolvedBy:p.userId}).where(eq(s.deadlineRequests.id,request.id)).returning();
  await tx.insert(s.auditEvents).values({id:randomUUID(),organizationId:p.organizationId,entityType:request.kind==='task'?'task':'rhythm',entityId:request.taskId,actorId:p.userId,action:data.approve?'deadline.approved':'deadline.rejected',summary:`${data.approve?'אושרה':'נדחתה'} הארכת תג״ב: ${request.title}`,details:{originalDate:request.originalDate,requestedDate:request.requestedDate,requesterId:request.requesterId}});
  await queueTaskNotification(tx,p,[request.requesterId],data.approve?'בקשת ההארכה אושרה':'בקשת ההארכה נדחתה',request.title);
  return updated;
 });
}
