import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from './db';
import { getAuth } from './auth';
import * as s from './schema';
import { AppError, canEditAll, type Principal } from './policy';
import {ensureSharedManagementSchema} from "./shared-management-schema";
import { responsibilityDomains } from '../lib/responsibility-domains';

export async function initializeWorkspace(p: Principal) {
 await ensureSharedManagementSchema();
 const db=await getDb();
 if(p.role==='deputy') await db.insert(s.workspaceSettings).values({organizationId:p.organizationId,ownerId:p.userId}).onConflictDoNothing();
 const [settings]=await db.select().from(s.workspaceSettings).where(eq(s.workspaceSettings.organizationId,p.organizationId));
 p.workspaceOwnerId=settings?.ownerId;
 if(settings?.ownerId===p.userId || canEditAll(p)) p.manageAccess=true;
 return p;
}
export async function publicPrincipal():Promise<Principal> {
 throw new AppError(401,'הכניסה למיילים מורשים בלבד. יש להתחבר');
}
export async function assertEmailAccess(email:string) {
 const db=await getDb();
 const members=await db.select({id:s.memberships.id}).from(s.memberships).innerJoin(s.user,eq(s.user.id,s.memberships.userId)).where(and(sql`lower(${s.user.email})=${email.trim().toLowerCase()}`,eq(s.memberships.active,true))).limit(2);
 if(members.length!==1)throw new AppError(403,'אין הרשאת כניסה למייל הזה. יש לפנות למנהל המערכת');
}
export async function ensureResponsibilityDomains(p:Principal) {
 const db=await getDb();
 // Rename legacy categories without dropping their tasks or foreign-key references.
 const existing=await db.select().from(s.domains).where(eq(s.domains.organizationId,p.organizationId));
 const aliases:Record<string,string>={safety:'סמ״פים',people:'סמ״פים'};
 for(const [id,name] of Object.entries(aliases)) await db.update(s.domains).set({name}).where(and(eq(s.domains.organizationId,p.organizationId),eq(s.domains.id,id)));
 for(const d of responsibilityDomains) {
  const id=existing.find(row=>row.id===d.id || row.id===`${p.organizationId}:${d.id}`)?.id || `${p.organizationId}:${d.id}`;
  await db.insert(s.domains).values({...d,id,organizationId:p.organizationId}).onConflictDoNothing();
  await db.update(s.domains).set({name:d.name,color:d.color}).where(and(eq(s.domains.organizationId,p.organizationId),eq(s.domains.id,id)));
 }
}
export async function getAccess(p:Principal) {
 if(!p.manageAccess)throw new AppError(403,'רק בעל המרחב רשאי לנהל הרשאות');
 const db=await getDb();const members=await db.select({id:s.user.id,email:s.user.email,name:s.user.name,active:s.memberships.active,editAll:s.memberships.editAll,role:s.memberships.role}).from(s.memberships).innerJoin(s.user,eq(s.user.id,s.memberships.userId)).where(eq(s.memberships.organizationId,p.organizationId));
 return {members:members.map(m=>({...m,level:m.id===p.workspaceOwnerId?'owner':m.editAll?'all':m.role==='viewer'?'view':'own'})),publicRead:false};
}
export async function grantAccess(p:Principal,input:unknown) {
 if(!p.manageAccess)throw new AppError(403,'רק בעל המרחב רשאי לנהל הרשאות');
 const data=z.object({email:z.string().trim().toLowerCase().email(),name:z.string().trim().min(2).max(100).optional(),level:z.enum(['view','own','all','revoke']),password:z.string().min(12).max(128).optional()}).strict().parse(input);
 const db=await getDb();let [user]=await db.select().from(s.user).where(sql`lower(${s.user.email})=${data.email}`);
 if(user?.id===(p.workspaceOwnerId || p.userId))throw new AppError(403,'אי אפשר להסיר או לשנות את הרשאת בעל המרחב');
 if(!user && data.level==='revoke')return {saved:true};
 if(!user){
  if(!data.password)throw new AppError(422,'לחשבון חדש יש להזין סיסמה ראשונית בת 12 תווים לפחות');
  const auth=await getAuth(true);
  await auth.api.signUpEmail({body:{email:data.email,name:data.name || data.email,password:data.password}});
  [user]=await db.select().from(s.user).where(sql`lower(${s.user.email})=${data.email}`);
 }
 if(!user)throw new AppError(503,'לא ניתן ליצור את החשבון');
 const other=await db.select().from(s.memberships).where(and(eq(s.memberships.userId,user.id),sql`${s.memberships.organizationId} <> ${p.organizationId}`,eq(s.memberships.active,true)));
 if(other.length)throw new AppError(422,'החשבון כבר שייך למרחב אחר');
 await db.insert(s.memberships).values({id:randomUUID(),userId:user.id,organizationId:p.organizationId,role:data.level==='view'?'viewer':'contributor',editAll:data.level==='all',active:data.level!=='revoke',companyId:null,domainId:null}).onConflictDoUpdate({target:[s.memberships.userId,s.memberships.organizationId],set:{active:data.level!=='revoke',editAll:data.level==='all',role:data.level==='view'?'viewer':'contributor',companyId:null,domainId:null}});
 await db.insert(s.workspaceAccessGrants).values({userId:user.id,organizationId:p.organizationId,grantedBy:p.workspaceOwnerId || p.userId}).onConflictDoNothing();
 return {saved:true};
}

export async function deleteAccess(p:Principal,input:unknown) {
 if(!p.manageAccess)throw new AppError(403,'רק בעל המרחב רשאי לנהל הרשאות');
 const {userId}=z.object({userId:z.string().min(1)}).strict().parse(input);
 const db=await getDb();
 return db.transaction(async tx=>{
  const [settings]=await tx.select().from(s.workspaceSettings).where(eq(s.workspaceSettings.organizationId,p.organizationId));
  if(!p.manageAccess)throw new AppError(403,'ניהול הרשאות דורש הרשאת מנהל');
  if(userId===settings?.ownerId)throw new AppError(403,'אי אפשר למחוק את הרשאת בעל המרחב');
  const removed=await tx.delete(s.memberships).where(and(eq(s.memberships.organizationId,p.organizationId),eq(s.memberships.userId,userId))).returning();
  if(!removed.length)throw new AppError(404,'ההרשאה לא נמצאה');
  await tx.delete(s.workspaceAccessGrants).where(and(eq(s.workspaceAccessGrants.organizationId,p.organizationId),eq(s.workspaceAccessGrants.userId,userId)));
  const [removedUser]=await tx.select({email:s.user.email}).from(s.user).where(eq(s.user.id,userId));
  if(removedUser){
   const groups=await tx.select().from(s.rhythmGroups).where(eq(s.rhythmGroups.organizationId,p.organizationId));
   for(const group of groups)await tx.update(s.rhythmGroups).set({emails:group.emails.filter(email=>email.toLowerCase()!==removedUser.email.toLowerCase())}).where(eq(s.rhythmGroups.id,group.id));
  }
  await tx.delete(s.session).where(eq(s.session.userId,userId));
  await tx.delete(s.pushSubscriptions).where(and(eq(s.pushSubscriptions.organizationId,p.organizationId),eq(s.pushSubscriptions.userId,userId)));
  await tx.delete(s.pushEvents).where(and(eq(s.pushEvents.organizationId,p.organizationId),eq(s.pushEvents.recipientId,userId)));
  await tx.insert(s.auditEvents).values({id:randomUUID(),organizationId:p.organizationId,entityType:'access',entityId:userId,actorId:p.userId,action:'access.deleted',summary:'נמחקה הרשאת כניסה למרחב'});
  return {deleted:true};
 });
}

/** Only the workspace owner and accounts explicitly granted access by that owner. */
export function authorizedMember(organizationId:string) {
 return sql`EXISTS (SELECT 1 FROM workspace_settings ws WHERE ws.organization_id = ${organizationId} AND (ws.owner_id = ${s.memberships.userId} OR EXISTS (SELECT 1 FROM workspace_access_grants ag WHERE ag.organization_id = ws.organization_id AND ag.granted_by = ws.owner_id AND ag.user_id = ${s.memberships.userId})))`;
}
