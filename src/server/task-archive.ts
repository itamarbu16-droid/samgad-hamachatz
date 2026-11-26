import {and,eq,lt,inArray} from 'drizzle-orm';
import {getDb} from './db';
import * as s from './schema';
export async function purgeCompletedTasks(organizationId?:string,now=new Date()){
 const cutoff=new Date(now),day=cutoff.getUTCDate();cutoff.setUTCDate(1);cutoff.setUTCMonth(cutoff.getUTCMonth()-1);cutoff.setUTCDate(Math.min(day,new Date(Date.UTC(cutoff.getUTCFullYear(),cutoff.getUTCMonth()+1,0)).getUTCDate()));
 const db=await getDb();
 await db.transaction(async tx=>{
  const tasks=await tx.select({id:s.tasks.id}).from(s.tasks).where(and(eq(s.tasks.status,'completed'),lt(s.tasks.completedAt,cutoff),organizationId?eq(s.tasks.organizationId,organizationId):undefined)).for('update');
  const ids=tasks.map(t=>t.id);
  if(ids.length){
   await tx.delete(s.comments).where(inArray(s.comments.taskId,ids));
   await tx.update(s.decisions).set({taskId:null}).where(inArray(s.decisions.taskId,ids));
   await tx.delete(s.tasks).where(and(inArray(s.tasks.id,ids),eq(s.tasks.status,'completed'),lt(s.tasks.completedAt,cutoff)));
  }
  const rows=await tx.select({occurrence:s.rhythmOccurrences,item:s.rhythmItems}).from(s.rhythmOccurrences).innerJoin(s.rhythmItems,eq(s.rhythmItems.id,s.rhythmOccurrences.itemId)).where(and(eq(s.rhythmItems.frequency,'once'),lt(s.rhythmOccurrences.completedAt,cutoff),organizationId?eq(s.rhythmItems.organizationId,organizationId):undefined)).for('update');
  for(const {occurrence,item} of rows){
   await tx.insert(s.expiredTaskRecords).values({taskKey:`${item.id}:${occurrence.scheduledDate||occurrence.dueDate}`}).onConflictDoNothing();
   await tx.delete(s.rhythmMail).where(eq(s.rhythmMail.occurrenceId,occurrence.id));
   await tx.delete(s.rhythmOccurrences).where(and(eq(s.rhythmOccurrences.id,occurrence.id),eq(s.rhythmOccurrences.version,occurrence.version),lt(s.rhythmOccurrences.completedAt,cutoff)));
   if(item.frequency==='once'){
    await tx.delete(s.rhythmItems).where(eq(s.rhythmItems.id,item.id));
   }
  }
  await tx.delete(s.rhythmUndo).where(lt(s.rhythmUndo.expiresAt,now));
 });
}
