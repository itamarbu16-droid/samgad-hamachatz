import {and,eq,inArray,ne} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import {getDb} from './db';
import * as s from './schema';

// Exact original fixture identities only. The workspace owner is always protected.
export const originalSampleEmails=[
 'company.a@samgad.example','company.b@samgad.example',
 'company.c@samgad.example','company.d@samgad.example',
 'logistics@samgad.example','contributor@samgad.example',
 'viewer@samgad.example','hurricane@samgad.example','medical@samgad.example',
];

/** Retire access, never account rows referenced by existing work and history. */
export async function retireSyntheticAccess(organizationId:string){
 const db=await getDb();
 return db.transaction(async tx=>{
  const [workspace]=await tx.select().from(s.workspaceSettings).where(eq(s.workspaceSettings.organizationId,organizationId));
  if(!workspace)throw Error('Sample access cleanup requires an existing workspace owner');
  const samples=await tx.select({id:s.user.id,email:s.user.email}).from(s.memberships).innerJoin(s.user,eq(s.user.id,s.memberships.userId)).where(and(eq(s.memberships.organizationId,organizationId),inArray(s.user.email,originalSampleEmails),ne(s.user.id,workspace.ownerId)));
  if(!samples.length)return {retired:0};
  const ids=samples.map(user=>user.id),emails=new Set(samples.map(user=>user.email.toLowerCase()));
  await tx.delete(s.memberships).where(and(eq(s.memberships.organizationId,organizationId),inArray(s.memberships.userId,ids)));
  await tx.delete(s.workspaceAccessGrants).where(and(eq(s.workspaceAccessGrants.organizationId,organizationId),inArray(s.workspaceAccessGrants.userId,ids)));
  await tx.delete(s.session).where(inArray(s.session.userId,ids));
  await tx.delete(s.pushSubscriptions).where(and(eq(s.pushSubscriptions.organizationId,organizationId),inArray(s.pushSubscriptions.userId,ids)));
  await tx.delete(s.pushEvents).where(and(eq(s.pushEvents.organizationId,organizationId),inArray(s.pushEvents.recipientId,ids)));
  const groups=await tx.select().from(s.rhythmGroups).where(eq(s.rhythmGroups.organizationId,organizationId));
  for(const group of groups){
   const retained=group.emails.filter(email=>!emails.has(email.toLowerCase()));
   if(retained.length!==group.emails.length)await tx.update(s.rhythmGroups).set({emails:retained,version:group.version+1}).where(eq(s.rhythmGroups.id,group.id));
  }
  await tx.insert(s.auditEvents).values(samples.map(user=>({id:randomUUID(),organizationId,entityType:'access',entityId:user.id,actorId:workspace.ownerId,action:'access.sample_retired',summary:'הוסרה הרשאת חשבון ניסיון מקורי'})));
  return {retired:samples.length};
 });
}
