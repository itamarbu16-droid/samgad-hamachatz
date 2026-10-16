import {and,eq,ne} from 'drizzle-orm';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {getDb} from './db';
import * as s from './schema';
import {AppError,assertWrite,canEditAll,type Principal} from './policy';
import {findTask,updateTask,deleteTask} from './service';
import {rhythmScope,editRhythmItem,rememberUndo} from './rhythm';
import {getPins} from './task-pins';
export const actionRef=z.object({kind:z.enum(['task','rhythm']),id:z.string().min(1).max(150),occurrenceId:z.string().min(1).max(150).optional()});
export type ActionRef=z.infer<typeof actionRef>;
export async function getActionTask(p:Principal,input:unknown){
 const ref=actionRef.parse(input),db=await getDb();
 if(ref.kind==='task'){
  const task=await findTask(db,p,ref.id);
  if(task.status==='cancelled')throw new AppError(404,'המשימה נמחקה');
  return {ref,title:task.title,description:task.description,dueDate:task.dueDate,version:task.version,creatorId:task.creatorId,canEdit:canEditAll(p)||task.ownerId===p.userId,canDelete:canEditAll(p)||task.creatorId===p.userId,key:`task:${task.id}`,bookingKey:`task:${task.id}`,frequency:'once'};
 }
 const [item]=await db.select().from(s.rhythmItems).where(and(eq(s.rhythmItems.id,ref.id),eq(s.rhythmItems.archived,false),rhythmScope(p)));
 if(!item)throw new AppError(404,'המשימה אינה זמינה לך');
 const [occurrence]=ref.occurrenceId?await db.select().from(s.rhythmOccurrences).where(and(eq(s.rhythmOccurrences.id,ref.occurrenceId),eq(s.rhythmOccurrences.itemId,item.id))):[];
 if(ref.occurrenceId&&!occurrence)throw new AppError(404,'מופע המשימה אינו זמין');
 return {ref,title:item.title,description:item.description,dueDate:item.hasDeadline?occurrence?.dueDate||item.startDate:null,version:item.version,creatorId:item.creatorId,canEdit:canEditAll(p)||item.assigneeIds.includes(p.userId),canDelete:canEditAll(p)||item.creatorId===p.userId,key:`rhythm:${item.id}`,bookingKey:`rhythm:${item.id}:${occurrence?.id||'once'}`,frequency:item.frequency,occurrence};
}
export async function actOnTask(p:Principal,input:unknown){
 const data=actionRef.extend({action:z.enum(['pin','delete','extend']),version:z.number().int().positive().optional(),occurrenceVersion:z.number().int().positive().optional(),pinned:z.boolean().optional(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}).strict().parse(input);
 const task=await getActionTask(p,{kind:data.kind,id:data.id,occurrenceId:data.occurrenceId}),db=await getDb();
 if(data.action==='pin'){
  if(data.pinned===undefined)throw new AppError(422,'יש לבחור הצמדה או ביטול הצמדה');
  const id=createHash('sha256').update(`${p.organizationId}:${p.userId}:${task.key}`).digest('hex');
  if(data.pinned)await db.insert(s.taskPins).values({id,organizationId:p.organizationId,userId:p.userId,taskKey:task.key}).onConflictDoNothing();
  else await db.delete(s.taskPins).where(and(eq(s.taskPins.id,id),eq(s.taskPins.userId,p.userId),eq(s.taskPins.organizationId,p.organizationId)));
  return {pinnedTaskKeys:await getPins(p)};
 }
 assertWrite(p);
 if(!task.canEdit)throw new AppError(403,'אין הרשאת שינוי למשימה');
 if(!data.version||data.version!==task.version)throw new AppError(409,'המשימה השתנתה. יש לרענן');
 if(data.action==='delete'){
  if(!task.canDelete)throw new AppError(403,'רק יוצר המשימה או מנהל רשאי למחוק אותה');
  return data.kind==='task'?deleteTask(p,data.id,data.version):editRhythmItem(p,data.id,{version:data.version,archived:true});
 }
 const date=data.date;
 if(!date||Number.isNaN(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new AppError(422,'יש לבחור תאריך תקין');
 if(task.dueDate&&date<=task.dueDate)throw new AppError(422,'התג״ב החדש צריך להיות מאוחר מהתג״ב הקיים');
 if(data.kind==='task')return updateTask(p,data.id,{version:data.version,dueDate:date});
 if(!task.occurrence)throw new AppError(422,'יש לבחור מופע משימה');
 if(task.frequency==='once')return editRhythmItem(p,data.id,{version:data.version,startDate:date,hasDeadline:true});
 const row=task.occurrence;
 if(data.occurrenceVersion!==row.version)throw new AppError(409,'מופע המשימה השתנה. יש לרענן');
 return db.transaction(async tx=>{
  const [updated]=await tx.update(s.rhythmOccurrences).set({dueDate:date,scheduledDate:row.scheduledDate||row.dueDate,version:row.version+1}).where(and(eq(s.rhythmOccurrences.id,row.id),eq(s.rhythmOccurrences.version,row.version))).returning();
  if(!updated)throw new AppError(409,'מופע המשימה השתנה. יש לרענן');
  return {...updated,undoToken:await rememberUndo(tx,p,'occurrence',row.id,{occurrences:[row]},updated.version)};
 });
}
