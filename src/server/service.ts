import {purgeCompletedTasks} from "./task-archive";
import {queueTaskNotification} from "./notifications";
import { and, eq, inArray, or, desc, sql, lt, type SQL } from 'drizzle-orm';
import { randomUUID,createHash } from 'node:crypto';
import { getDb, isDemo, type Database } from './db';
import * as s from './schema';
import { AppError, assertTransition, assertWrite, assertOwnTask, canEditAll, canRead, isManager, calculateMetrics, localDate, type Principal } from './policy';
import { initializeWorkspace,ensureResponsibilityDomains,authorizedMember } from './access';
import {getPins} from './task-pins';
import { responsibilityDomains } from '../lib/responsibility-domains';
import { createTaskInput, updateTaskInput, commentInput, createDecisionInput, updateDecisionInput } from './validation';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Tx;
type Task = typeof s.tasks.$inferSelect;
async function idempotent<T>(tx:Tx,p:Principal,action:string,requestId:string|undefined,input:unknown,mutate:()=>Promise<T>):Promise<T> {
  if(!requestId) return mutate();
  const key=`${p.organizationId}:${p.userId}:${action}:${requestId}`;
  const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const inserted=await tx.insert(s.mutationReceipts).values({key,fingerprint}).onConflictDoNothing().returning();
  if(!inserted.length) {
    const [receipt]=await tx.select().from(s.mutationReceipts).where(eq(s.mutationReceipts.key,key));
    if(!receipt || receipt.fingerprint!==fingerprint) throw new AppError(409,'מזהה הבקשה כבר שימש לפעולה אחרת');
    const result=receipt.result as {id:string};
    // Permissions and assignment can change after the original successful request.
    if(action.startsWith('task.patch:')) await findTask(tx,p,action.slice('task.patch:'.length));
    else if(action==='task.create') await findTask(tx,p,result.id);
    else if(action.startsWith('task.comment:')) await findTask(tx,p,action.slice('task.comment:'.length));
    else if(action==='decision.create') { const permitted=await tx.select({id:s.decisions.id}).from(s.decisions).where(and(decisionScope(p),eq(s.decisions.id,result.id))).limit(1); if(!permitted.length) throw new AppError(404,'הבקשה לא נמצאה או אינה זמינה לך'); }
    return receipt.result as T;
  }
  const result=await mutate();
  await tx.update(s.mutationReceipts).set({result}).where(eq(s.mutationReceipts.key,key));
  return result;
}
export async function principalFor(userId: string, name: string): Promise<Principal> {
  const db = await getDb();
  const member = await db.select().from(s.memberships).where(and(eq(s.memberships.userId, userId), eq(s.memberships.active, true))).limit(2);
  if (member.length !== 1) throw new AppError(403, 'לא נמצאה הרשאה פעילה וחד־משמעית לארגון');
  return initializeWorkspace({ userId, name, organizationId: member[0].organizationId, role: member[0].role, editAll:member[0].editAll, companyId:member[0].editAll?null:member[0].companyId, domainId:member[0].editAll?null:member[0].domainId });
}
function taskScope(p: Principal): SQL | undefined {
  const filters = [eq(s.tasks.organizationId, p.organizationId),sql`(${s.tasks.ownerId} <> ${s.tasks.creatorId} OR ${s.tasks.creatorId} = ${p.userId} OR ${s.tasks.creatorId} = ${canEditAll(p)?p.workspaceOwnerId || p.userId:p.userId})`];
  if (p.role === 'admin') filters.push(sql`false`);
  if (p.companyId) filters.push(eq(s.tasks.companyId, p.companyId));
  if (p.domainId) filters.push(eq(s.tasks.domainId, p.domainId));
  if (p.role === 'contributor' && !canEditAll(p)) filters.push(eq(s.tasks.ownerId, p.userId));
  return and(...filters);
}
function decisionScope(p: Principal): SQL | undefined {
  const filters: (SQL | undefined)[] = [eq(s.decisions.organizationId, p.organizationId),sql`NOT EXISTS (SELECT 1 FROM tasks private_task WHERE private_task.id=${s.decisions.taskId} AND private_task.organization_id=${p.organizationId} AND private_task.owner_id=private_task.creator_id AND private_task.creator_id<>${p.userId} AND private_task.creator_id<>${canEditAll(p)?p.workspaceOwnerId || p.userId:p.userId})`];
  if (p.role === 'admin') filters.push(sql`false`);
  if (p.companyId) filters.push(eq(s.decisions.companyId, p.companyId));
  if (p.domainId) filters.push(eq(s.decisions.domainId, p.domainId));
  if (p.role === 'contributor' && !canEditAll(p)) filters.push(or(eq(s.decisions.requesterId, p.userId), eq(s.decisions.deciderId, p.userId)));
  return and(...filters);
}
export async function findTask(db: Executor, p: Principal, id: string): Promise<Task> {
  const rows = await db.select().from(s.tasks).where(and(taskScope(p), eq(s.tasks.id, id))).limit(1);
  if (!rows[0]) throw new AppError(404, 'המשימה לא נמצאה או אינה זמינה לך');
  return rows[0];
}
async function validateScope(db: Executor, p: Principal, record: { organizationId: string; companyId: string | null; domainId: string; ownerId?: string; requesterId?: string; deciderId?: string }) {
  if (!canRead(p, record)) throw new AppError(403, 'הפרטים חורגים מתחום ההרשאה שלך');
  const domain = await db.select({ id: s.domains.id }).from(s.domains).where(and(eq(s.domains.organizationId, p.organizationId), eq(s.domains.id, record.domainId))).limit(1);
  if (!domain.length) throw new AppError(422, 'תחום האחריות אינו זמין');
  if (record.companyId) {
    const company = await db.select({ id: s.companies.id }).from(s.companies).where(and(eq(s.companies.organizationId, p.organizationId), eq(s.companies.id, record.companyId))).limit(1);
    if (!company.length) throw new AppError(422, 'המסגרת אינה זמינה');
  }
}
async function validateAssignee(db: Executor, p: Principal, userId: string, scope: { companyId: string | null; domainId: string }, decision = false) {
  const [member] = await db.select().from(s.memberships).where(and(eq(s.memberships.organizationId, p.organizationId), eq(s.memberships.userId, userId), eq(s.memberships.active, true))).limit(1);
  if (!member || ['admin','viewer'].includes(member.role) || (member.companyId && member.companyId !== scope.companyId) || (member.domainId && member.domainId !== scope.domainId) || (decision && !member.editAll && !['deputy','staff','company_commander'].includes(member.role))) throw new AppError(422, 'לבעל התפקיד שנבחר אין הרשאה מתאימה לפריט זה');
}
async function audit(db: Executor, p: Principal, type: 'task'|'decision', id: string, action: string, summary: string, details: Record<string,unknown> = {}) {
  await db.insert(s.auditEvents).values({ id: randomUUID(), organizationId: p.organizationId, entityType: type, entityId: id, actorId: p.userId, action, summary, details });
}
export async function getWorkspace(p: Principal) {
  await purgeCompletedTasks(p.organizationId);
  if(canEditAll(p)) await ensureResponsibilityDomains(p);
  const db = await getDb();
  const taskRows = await db.select().from(s.tasks).where(taskScope(p)).orderBy(desc(s.tasks.updatedAt));
  const decisionRows = await db.select().from(s.decisions).where(decisionScope(p)).orderBy(desc(s.decisions.createdAt));
  const taskIds = taskRows.map(t => t.id), decisionIds = decisionRows.map(d => d.id);
  const commentRows = taskIds.length ? await db.select({ id: s.comments.id, taskId: s.comments.taskId, actorId: s.comments.actorId, actorName: s.user.name, body: s.comments.body, createdAt: s.comments.createdAt }).from(s.comments).innerJoin(s.user, eq(s.comments.actorId, s.user.id)).where(inArray(s.comments.taskId, taskIds)).orderBy(desc(s.comments.createdAt)) : [];
  const entityFilters: SQL[] = [];
  if (taskIds.length) entityFilters.push(and(eq(s.auditEvents.entityType, 'task'), inArray(s.auditEvents.entityId, taskIds))!);
  if (decisionIds.length) entityFilters.push(and(eq(s.auditEvents.entityType, 'decision'), inArray(s.auditEvents.entityId, decisionIds))!);
  const activity = entityFilters.length ? await db.select({ id: s.auditEvents.id, entityType: s.auditEvents.entityType, entityId: s.auditEvents.entityId, action: s.auditEvents.action, summary: s.auditEvents.summary, actorName: s.user.name, createdAt: s.auditEvents.createdAt }).from(s.auditEvents).innerJoin(s.user, eq(s.auditEvents.actorId, s.user.id)).where(and(eq(s.auditEvents.organizationId, p.organizationId), or(...entityFilters))).orderBy(desc(s.auditEvents.createdAt)).limit(100) : [];
  const domainRows = await db.select({ id: s.domains.id, name: s.domains.name, color: s.domains.color }).from(s.domains).where(and(eq(s.domains.organizationId, p.organizationId), p.domainId ? eq(s.domains.id, p.domainId) : undefined));
  const companyRows = await db.select({ id: s.companies.id, name: s.companies.name }).from(s.companies).where(and(eq(s.companies.organizationId, p.organizationId), p.companyId ? eq(s.companies.id, p.companyId) : undefined));
  const userRows = await db.select({ id: s.user.id, name: s.user.name, role: s.memberships.role, companyId: s.memberships.companyId, domainId: s.memberships.domainId }).from(s.memberships).innerJoin(s.user, eq(s.memberships.userId, s.user.id)).where(and(eq(s.memberships.organizationId, p.organizationId), eq(s.memberships.active, true), authorizedMember(p.organizationId)));
  const visibleUserIds = new Set([p.userId, ...taskRows.flatMap(t => [t.ownerId,t.creatorId]), ...decisionRows.flatMap(d => [d.deciderId,d.requesterId])]);
  const users = userRows.filter(u => visibleUserIds.has(u.id) || (isManager(p) && (!p.companyId || !u.companyId || u.companyId === p.companyId) && (!p.domainId || !u.domainId || u.domainId === p.domainId)));
  const canonicalDomains=responsibilityDomains.map(d=>domainRows.find(row=>row.id===d.id||row.id===`${p.organizationId}:${d.id}`)).filter((d):d is NonNullable<typeof d>=>Boolean(d));
  const normalizedTasks=taskRows.map(t=>({...t,domainId:['safety','people'].includes(t.domainId)?`${p.organizationId}:deputies`:t.domainId}));
  return { pinnedTaskKeys:await getPins(p), user: { id: p.userId, workspaceOwnerId:p.workspaceOwnerId, name: p.name, role:canEditAll(p)?'deputy':['company_commander','staff'].includes(p.role)?'contributor':p.role, permissions:{editAll:canEditAll(p),manageAccess:Boolean(p.manageAccess),guest:Boolean(p.guest)} }, tasks: normalizedTasks.map(task => ({ ...task, comments: commentRows.filter(c => c.taskId === task.id) })), decisions: decisionRows, domains: canonicalDomains, companies: companyRows, users, activity, metrics: calculateMetrics(taskRows.filter(t=>t.ownerId!==t.creatorId)), today:localDate(), demo: isDemo(), refreshedAt: new Date().toISOString() };
}
export async function createTask(p: Principal, input: unknown) {
  assertWrite(p); const {clientRequestId,...data} = createTaskInput.parse(input); const db = await getDb();
  return db.transaction(async tx => idempotent(tx,p,'task.create',clientRequestId,data,async()=>{
    const task = { ...data, id: randomUUID(), organizationId: p.organizationId, companyId: data.companyId ?? p.companyId, creatorId: data.ownerId === p.workspaceOwnerId ? data.ownerId : p.userId };
    if (!canEditAll(p) && data.ownerId !== p.userId) throw new AppError(403, 'ניתן ליצור משימות לעצמך בלבד');
    await validateScope(tx,p,task); await validateAssignee(tx,p,task.ownerId,task);
    const [created] = await tx.insert(s.tasks).values(task).returning();
    await audit(tx,p,'task',created.id,'task.created',`נוצרה משימה: ${created.title}`,{ownerId:created.ownerId});
    await queueTaskNotification(tx,p,[created.ownerId],"משימה חדשה שויכה אליך",created.title);
    return {...created, comments:[]};
  }));
}
export async function updateTask(p: Principal, id: string, input: unknown) {
  assertWrite(p); const {clientRequestId,version,...data} = updateTaskInput.parse(input); const db = await getDb();
  return db.transaction(async tx => idempotent(tx,p,`task.patch:${id}`,clientRequestId,{version,...data},async()=>{
    const before = await findTask(tx,p,id);
    if (before.version !== version) throw new AppError(409, 'המשימה השתנתה מאז שנפתחה. יש לרענן ולנסות שוב');
    assertOwnTask(p,before);
    if(!canEditAll(p)&&data.dueDate!==undefined&&data.dueDate!==before.dueDate)throw new AppError(403,'שינוי תג״ב מחייב בקשת הארכה ואישור מנהל');
    if (!canEditAll(p) && Object.keys(data).some(k => ['ownerId','companyId','domainId','requiresReview'].includes(k))) throw new AppError(403,'שינוי הקצאה דורש הרשאת עריכה כללית');
    if (data.status === 'completed' && before.status !== 'pending_review' && before.ownerId !== before.creatorId && p.userId !== before.creatorId && !canEditAll(p)) data.status = 'pending_review';
    const next = { ...before, ...data, ...(data.ownerId === p.workspaceOwnerId ? {creatorId:data.ownerId} : {}) };
    await validateScope(tx,p,next); await validateAssignee(tx,p,next.ownerId,next);
    if (data.status) assertTransition(p,before,data.status);
    if (next.status === 'blocked' && !next.blockerReason?.trim()) throw new AppError(422, 'יש לתאר מה חוסם את המשימה');
    const completed = next.status === 'completed';
    const [updated] = await tx.update(s.tasks).set({...data, creatorId:next.creatorId, blockerReason: next.status === 'blocked' ? next.blockerReason : null, completedAt: completed ? before.completedAt ?? new Date() : null, completedBy: completed ? before.completedBy ?? p.userId : null, version: version+1, updatedAt: new Date()}).where(and(eq(s.tasks.id,id),eq(s.tasks.version,version),taskScope(p))).returning();
    if (!updated) throw new AppError(409,'המשימה השתנתה. יש לרענן ולנסות שוב');
    await audit(tx,p,'task',id,'task.updated',`עודכנה משימה: ${updated.title}`, {changes: Object.fromEntries(Object.keys(data).map(k=>[k,{before:before[k as keyof Task],after:updated[k as keyof Task]}]))});
    await queueTaskNotification(tx,p,[updated.ownerId,updated.creatorId],updated.status==='pending_review'?'ביצוע משימה ממתין לאישורך':'המשימה עודכנה',updated.title);
    const undoToken=randomUUID();
    await tx.delete(s.rhythmUndo).where(lt(s.rhythmUndo.expiresAt,new Date()));
    await tx.insert(s.rhythmUndo).values({id:undoToken,organizationId:p.organizationId,actorId:p.userId,kind:'task',entityId:id,snapshot:{task:before,occurrences:[]},expectedVersion:updated.version,expiresAt:new Date(Date.now()+60_000)});
    return {...updated,undoToken};
  }));
}
export async function addComment(p: Principal,id: string,input: unknown) {
  assertWrite(p); const {body,clientRequestId} = commentInput.parse(input); const db=await getDb();
  return db.transaction(async tx => idempotent(tx,p,`task.comment:${id}`,clientRequestId,{body},async()=>{ const task=await findTask(tx,p,id); assertOwnTask(p,task); const [comment]=await tx.insert(s.comments).values({id:randomUUID(),taskId:id,actorId:p.userId,body}).returning(); await audit(tx,p,'task',id,'task.comment',`נוסף עדכון למשימה: ${task.title}`); await queueTaskNotification(tx,p,[task.ownerId,task.creatorId],'נוסף עדכון למשימה',task.title); return comment; }));
}
export async function createDecision(p: Principal,input: unknown) {
  assertWrite(p); const {clientRequestId,...data}=createDecisionInput.parse(input); const db=await getDb();
  return db.transaction(async tx => idempotent(tx,p,'decision.create',clientRequestId,data,async()=>{
    const decision={...data,id:randomUUID(),organizationId:p.organizationId,companyId:data.companyId??p.companyId,requesterId:p.userId};
    await validateScope(tx,p,decision); await validateAssignee(tx,p,decision.deciderId,decision,true);
    if(data.taskId) { const task=await findTask(tx,p,data.taskId); if(task.domainId!==decision.domainId || task.companyId!==decision.companyId) throw new AppError(422,'המשימה והבקשה חייבות להיות באותו תחום ומסגרת'); }
    const [created]=await tx.insert(s.decisions).values(decision).returning(); await audit(tx,p,'decision',created.id,'decision.created',`נפתחה בקשה להחלטה: ${created.title}`); return created;
  }));
}
export async function updateDecision(p: Principal,id: string,input: unknown) {
  assertWrite(p); const data=updateDecisionInput.parse(input); const db=await getDb();
  return db.transaction(async tx => {
    const [before]=await tx.select().from(s.decisions).where(and(decisionScope(p),eq(s.decisions.id,id))).limit(1);
    if(!before) throw new AppError(404,'הבקשה לא נמצאה או אינה זמינה לך');
    if(before.version!==data.version) throw new AppError(409,'הבקשה השתנתה. יש לרענן ולנסות שוב');
    if(['approved','rejected'].includes(before.status)) throw new AppError(422,'הבקשה כבר הוכרעה');
    if(data.status==='pending') { if(before.status!=='clarification_requested' || before.requesterId!==p.userId) throw new AppError(403,'רק מבקש ההחלטה יכול להגיש הבהרה'); }
    else if(before.deciderId!==p.userId || !isManager(p)) throw new AppError(403,'רק מקבל ההחלטה המוגדר יכול להכריע בבקשה');
    const [updated]=await tx.update(s.decisions).set({status:data.status,notes:data.notes,version:data.version+1,resolvedAt:['approved','rejected'].includes(data.status)?new Date():null}).where(and(eq(s.decisions.id,id),eq(s.decisions.version,data.version),decisionScope(p))).returning();
    if(!updated) throw new AppError(409,'הבקשה השתנתה. יש לרענן ולנסות שוב');
    await audit(tx,p,'decision',id,'decision.resolved',`עודכנה החלטה: ${updated.title}`,{before:before.status,after:updated.status,notes:updated.notes}); return updated;
  });
}

export async function deleteTask(p:Principal,id:string,version:number){
 assertWrite(p);const db=await getDb();
 return db.transaction(async tx=>{
  const before=await findTask(tx,p,id);assertOwnTask(p,before);
  if(!canEditAll(p)&&before.creatorId!==p.userId)throw new AppError(403,'רק יוצר המשימה או מנהל רשאי למחוק אותה');
  if(before.version!==version)throw new AppError(409,'המשימה השתנתה. יש לרענן');
  const [updated]=await tx.update(s.tasks).set({status:'cancelled',completedAt:null,completedBy:null,version:version+1,updatedAt:new Date()}).where(and(eq(s.tasks.id,id),eq(s.tasks.version,version),taskScope(p))).returning();
  if(!updated)throw new AppError(409,'המשימה השתנתה. יש לרענן');
  await audit(tx,p,'task',id,'task.deleted',`נמחקה משימה: ${before.title}`);
  await queueTaskNotification(tx,p,[before.ownerId,before.creatorId],"משימה נמחקה",before.title);
  const undoToken=randomUUID();await tx.insert(s.rhythmUndo).values({id:undoToken,organizationId:p.organizationId,actorId:p.userId,kind:'task',entityId:id,snapshot:{task:before,occurrences:[]},expectedVersion:updated.version,expiresAt:new Date(Date.now()+60000)});
  return {...updated,undoToken};
 });
}
