export const taskStatuses = ['open', 'in_progress', 'blocked', 'pending_review', 'completed', 'cancelled'] as const;
export type TaskStatus = typeof taskStatuses[number];
export const priorities = ['low', 'normal', 'high', 'urgent'] as const;
export type Role = 'deputy' | 'staff' | 'company_commander' | 'contributor' | 'viewer' | 'admin';
export type Principal = { userId: string; organizationId: string; role: string; companyId: string | null; domainId: string | null; name: string };
export type ScopedRecord = { organizationId: string; companyId: string | null; domainId: string; ownerId?: string; requesterId?: string; deciderId?: string };
export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export function canRead(principal: Principal, record: ScopedRecord) {
  return principal.organizationId === record.organizationId && principal.role !== 'admin'
    && (!principal.companyId || principal.companyId === record.companyId)
    && (!principal.domainId || principal.domainId === record.domainId)
    && (principal.role !== 'contributor' || [record.ownerId, record.requesterId, record.deciderId].includes(principal.userId));
}
export function isManager(principal: Principal) { return ['deputy', 'staff', 'company_commander'].includes(principal.role); }
export function assertWrite(principal: Principal) { if (!isManager(principal) && principal.role !== 'contributor') throw new AppError(403, 'אין לך הרשאה לבצע פעולה זו'); }
const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ['in_progress', 'pending_review', 'completed', 'blocked', 'cancelled'], in_progress: ['blocked', 'pending_review', 'completed', 'cancelled'],
  blocked: ['in_progress', 'cancelled'], pending_review: ['in_progress', 'completed', 'cancelled'],
  completed: ['in_progress'], cancelled: ['open'],
};
export function assertTransition(principal: Principal, task: { status: string; requiresReview: boolean; creatorId?: string; ownerId?: string }, next: TaskStatus) {
  if (task.status === next) return;
  if (next === 'completed' && task.creatorId && task.ownerId !== task.creatorId && principal.userId !== task.creatorId) throw new AppError(403, 'רק מקצה המשימה רשאי לאשר ביצוע');
  if (!transitions[task.status as TaskStatus]?.includes(next)) throw new AppError(422, 'המעבר בין המצבים אינו אפשרי. יש לבדוק את מצב המשימה');
  if ((next === 'cancelled' || ['completed', 'cancelled'].includes(task.status)) && !isManager(principal) && !(task.creatorId === principal.userId && task.ownerId === principal.userId && next === 'in_progress')) throw new AppError(403, 'הפעולה דורשת הרשאת מנהל');
  if (next === 'completed' && task.requiresReview && !(task.creatorId === principal.userId && task.ownerId === principal.userId) && (task.status !== 'pending_review' || !isManager(principal))) throw new AppError(403, 'המשימה דורשת בדיקה ואישור של מנהל לפני השלמה');
}
export function localDate(now: Date = new Date(), timeZone = 'Asia/Jerusalem') { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function isOverdue(task: { status: string; dueDate: string | null }, today = localDate()) { return Boolean(task.dueDate && task.dueDate < today && !['completed', 'cancelled'].includes(task.status)); }
export function calculateMetrics(tasks: Array<{ status: string; dueDate: string | null; priority: string }>, today = localDate()) { return { open: tasks.filter(t => !['completed','cancelled'].includes(t.status)).length, overdue: tasks.filter(t => isOverdue(t,today)).length, blocked: tasks.filter(t => t.status === 'blocked').length, urgent: tasks.filter(t => t.priority === 'urgent' && !['completed','cancelled'].includes(t.status)).length, completed: tasks.filter(t => t.status === 'completed').length }; }
