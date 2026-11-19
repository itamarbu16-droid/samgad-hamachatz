import {and,eq,inArray,lt,sql} from 'drizzle-orm';
import type {Database} from './db';
import * as s from './schema';
import {authorizedMember} from './access';
import {localDate,type Principal} from './policy';
export type HourlyDb=Pick<Database,'select'>;
const writerRoles=['deputy','staff','company_commander','contributor'];
/** Read-only: never initialize a workspace, materialize occurrences, or renew auth. */
export async function hourlyPrincipal(db:HourlyDb,organizationId:string,userId:string):Promise<Principal|null>{
 const [row]=await db.select({member:s.memberships,ownerId:s.workspaceSettings.ownerId})
  .from(s.memberships).innerJoin(s.workspaceSettings,eq(s.workspaceSettings.organizationId,s.memberships.organizationId))
  .where(and(eq(s.memberships.organizationId,organizationId),eq(s.memberships.userId,userId),eq(s.memberships.active,true),
   inArray(s.memberships.role,writerRoles),authorizedMember(organizationId),
   sql`(SELECT count(*) FROM memberships current_memberships WHERE current_memberships.user_id=${userId} AND current_memberships.active=true)=1`)).limit(1);
 if(!row)return null;
 const m=row.member;
 return {userId,organizationId,name:'',role:m.role,editAll:m.editAll,workspaceOwnerId:row.ownerId,
  companyId:m.editAll?null:m.companyId,domainId:m.editAll?null:m.domainId};
}
export async function countOwnOverdue(db:HourlyDb,organizationId:string,userId:string,now:Date){
 const p=await hourlyPrincipal(db,organizationId,userId);if(!p)return 0;
 const today=localDate(now);
 // For exact ownerId, the existing private-task and contributor scope clauses
 // are already satisfied. Retain company/domain restrictions exactly as taskScope.
 const tasks=await db.select({id:s.tasks.id}).from(s.tasks).where(and(
  eq(s.tasks.organizationId,organizationId),eq(s.tasks.ownerId,userId),
  inArray(s.tasks.status,['open','in_progress','blocked']),lt(s.tasks.dueDate,today),
  p.companyId?eq(s.tasks.companyId,p.companyId):undefined,p.domainId?eq(s.tasks.domainId,p.domainId):undefined));
 const rows=await db.select({assignees:s.rhythmItems.assigneeIds,mode:s.rhythmItems.completionMode,
  completedAt:s.rhythmOccurrences.completedAt,completions:s.rhythmOccurrences.completions,reports:s.rhythmOccurrences.reports})
  .from(s.rhythmOccurrences).innerJoin(s.rhythmItems,eq(s.rhythmItems.id,s.rhythmOccurrences.itemId)).where(and(
   eq(s.rhythmItems.organizationId,organizationId),eq(s.rhythmItems.archived,false),eq(s.rhythmItems.category,'task'),
   eq(s.rhythmItems.frequency,'once'),eq(s.rhythmItems.hasDeadline,true),lt(s.rhythmOccurrences.dueDate,today),
   sql`${s.rhythmItems.assigneeIds} @> ${JSON.stringify([userId])}::jsonb`));
 // Explicit assignment also satisfies rhythmScope for these non-viewer principals.
 return tasks.length+rows.filter(row=>!row.completedAt&&!row.completions[userId]&&!row.reports[userId]
  &&(row.mode!=='shared'||!row.assignees.some(id=>row.completions[id]||row.reports[id]))).length;
}
