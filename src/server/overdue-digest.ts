import { and, eq, lt, sql } from 'drizzle-orm';
import { getDb } from './db';
import * as s from './schema';
import { localDate } from './policy';

// Both UTC offsets are scheduled; only the matching Israel-time hour runs.
export function digestSlot(now: Date): 'morning' | 'evening' | null {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23',
  }).format(now));
  return hour === 8 ? 'morning' : hour === 18 ? 'evening' : null;
}

export async function queueOverdueDigests(now = new Date()) {
  const slot = digestSlot(now);
  if (!slot) return { queued: 0 };
  const db = await getDb(), today = localDate(now);
  const workspaces = await db.select().from(s.workspaceSettings);
  let queued = 0;
  for (const workspace of workspaces) {
    const [owner] = await db.select().from(s.memberships).where(and(
      eq(s.memberships.organizationId, workspace.organizationId),
      eq(s.memberships.userId, workspace.ownerId), eq(s.memberships.active, true),
    ));
    if (!owner) continue;
    const members = await db.select({id:s.memberships.userId, name:s.user.name})
      .from(s.memberships).innerJoin(s.user, eq(s.user.id,s.memberships.userId))
      .where(and(eq(s.memberships.organizationId,workspace.organizationId),eq(s.memberships.active,true)));
    const names = new Map(members.map(member=>[member.id, member.name]));
    const personal: string[] = [], others: string[] = [];
    const tasks = await db.select().from(s.tasks).where(and(
      eq(s.tasks.organizationId,workspace.organizationId), lt(s.tasks.dueDate,today),
      sql`${s.tasks.status} NOT IN ('completed','cancelled','pending_review')`,
    ));
    for (const task of tasks) {
      if (task.ownerId === workspace.ownerId) personal.push(task.title);
      // Other people's private tasks stay private.
      else if (task.ownerId !== task.creatorId && names.has(task.ownerId))
        others.push(`${names.get(task.ownerId)}: ${task.title}`);
    }
    const occurrences = await db.select().from(s.rhythmOccurrences)
      .innerJoin(s.rhythmItems,eq(s.rhythmItems.id,s.rhythmOccurrences.itemId))
      .where(and(eq(s.rhythmItems.organizationId,workspace.organizationId),
        eq(s.rhythmItems.archived,false),eq(s.rhythmItems.hasDeadline,true),
        eq(s.rhythmItems.category,'task'),lt(s.rhythmOccurrences.dueDate,today)));
    for (const {rhythm_items:item,rhythm_occurrences:occurrence} of occurrences) {
      if (item.completionMode === 'shared' && occurrence.completedAt) continue;
      const remaining = item.assigneeIds.filter(id=>!occurrence.completions[id] && !occurrence.reports[id]);
      if (remaining.includes(workspace.ownerId)) personal.push(item.title);
      const isPrivate = item.assigneeIds.length===1 && item.assigneeIds[0]===item.creatorId;
      if (!isPrivate) {
        const assignees = remaining.filter(id=>id!==workspace.ownerId && names.has(id));
        if (assignees.length) others.push(`${assignees.map(id=>names.get(id)).join(', ')}: ${item.title}`);
      }
    }
    for (const [kind, entries, title, url] of [
      ['personal',personal,'המשימות שלך באיחור','/?view=personal'],
      ['others',slot==='morning'?others:[],'משימות באיחור אצל האחרים','/?view=tasks'],
    ] as const) {
      if (!entries.length) continue;
      // Stable IDs make retries and concurrent scheduler calls idempotent.
      queued += await db.transaction(async tx=>{
        const id=`overdue:${workspace.organizationId}:${workspace.ownerId}:${today}:${kind==='others'?'daily':slot}:${kind}`;
        const inserted = await tx.insert(s.overdueDigestRuns).values({id})
          .onConflictDoNothing().returning({id:s.overdueDigestRuns.id});
        if (!inserted.length) return 0;
        await tx.insert(s.pushEvents).values({id,
          organizationId:workspace.organizationId,recipientId:workspace.ownerId,title,
          body:`${entries.length} משימות באיחור · ${entries.join(' · ')}`.slice(0,180),url,
        });
        return 1;
      });
    }
  }
  await db.delete(s.overdueDigestRuns).where(lt(s.overdueDigestRuns.createdAt,new Date(now.getTime()-35*86400000)));
  return { queued };
}
