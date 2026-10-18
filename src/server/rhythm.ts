import {authorizedMember} from "./access";
import {expandRoleGroups,roleName} from "../lib/unit-roles";
import {purgeCompletedTasks} from "./task-archive";
import {queueTaskNotification} from "./notifications";
import {getPins} from './task-pins';
import { and, eq, inArray, sql, lt } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { ensureUnitRoleGroups } from "./unit-roles";
import { getDb, type Database } from "./db";
import * as s from "./schema";
import {
  AppError,
  assertWrite,
  isManager,
  canEditAll,
  localDate,
  type Principal,
} from "./policy";
import {
  addDays,
  frequencies,
  monthEnd,
  occurrenceDates,
  rhythmUrgent,
  type Frequency,
} from "../lib/rhythm";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Item = typeof s.rhythmItems.$inferSelect;
type Occurrence = typeof s.rhythmOccurrences.$inferSelect;
const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T12:00:00Z");
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "יש להזין תאריך תקין");
const emailsInput = z
  .array(z.string().trim().toLowerCase().email())
  .max(100)
  .default([]);
const itemInput = z
  .object({
    clientRequestId: z.string().uuid(),
    title: z.string().trim().min(2).max(160),
    category: z.enum(["task", "point"]).default("task"),
    description: z.string().trim().max(5000).default(""),
    important: z.boolean().default(false),
    manualUrgent: z.boolean().default(false),
    frequency: z.enum(Object.keys(frequencies) as [Frequency, ...Frequency[]]).default("once"),
    hasDeadline: z.boolean().optional(),
    recipientIds: z.array(z.string().min(1)).max(100).default([]),
    startDate: dateInput.optional(),
    endDate: dateInput.nullable().default(null),
    completionMode: z.enum(["individual", "shared"]).default("individual"),
    emails: emailsInput,
    groupIds: z.array(z.string().min(1)).max(30).default([]),
  })
  .strict();
const groupInput = z
  .object({
    clientRequestId: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    emails: emailsInput,
  })
  .strict();
export function rhythmScope(p: Principal) {
  return and(
    eq(s.rhythmItems.organizationId, p.organizationId),
    p.role === "admin"
      ? sql`false`
      : p.guest || p.role==="viewer" ? sql`(${s.rhythmItems.category} <> 'point' AND NOT (${s.rhythmItems.assigneeIds} = jsonb_build_array(${s.rhythmItems.creatorId})))`
      : canEditAll(p) ? sql`(${s.rhythmItems.creatorId} = ${p.userId} OR (${s.rhythmItems.category} <> 'point' AND NOT (${s.rhythmItems.assigneeIds} = jsonb_build_array(${s.rhythmItems.creatorId}))))`
      : sql`(${s.rhythmItems.creatorId} = ${p.userId} OR ${s.rhythmItems.assigneeIds} @> ${JSON.stringify([p.userId])}::jsonb)`,
  );
}
function completed(item: Item, occurrence: Occurrence, userId?: string) {
  if (item.completionMode === "shared") return Boolean(occurrence.completedAt);
  return userId
    ? Boolean(occurrence.completions[userId])
    : item.assigneeIds.every((id) => Boolean(occurrence.completions[id]));
}
async function eligiblePeople(db: Database | Tx, p: Principal) {
  const people = await db
    .select({
      id: s.user.id,
      name: s.user.name,
      email: s.user.email,
      role: s.memberships.role,
      companyId: s.memberships.companyId,
      domainId: s.memberships.domainId,
    })
    .from(s.memberships)
    .innerJoin(s.user, eq(s.memberships.userId, s.user.id))
    .where(
      and(
        eq(s.memberships.organizationId, p.organizationId),
        eq(s.memberships.active, true),
      ),
    );
  return people.filter(
    (person) =>
      !["viewer", "admin"].includes(person.role) &&
      (!p.companyId || !person.companyId || person.companyId === p.companyId) &&
      (!p.domainId || !person.domainId || person.domainId === p.domainId),
  );
}
async function resolveEmails(
  db: Database | Tx,
  p: Principal,
  emails: string[],
) {
  if (emails.length && !canEditAll(p))
    throw new AppError(403, "שיוך לאחרים דורש הרשאת מנהל");
  const people = await eligiblePeople(db, p);
  const ids = new Set<string>();
  for (const email of emails) {
    const person = people.find(
      (person) => person.email.toLowerCase() === email.toLowerCase(),
    );
    if (!person)
      throw new AppError(
        422,
        `הכתובת ${email} אינה משויכת לחשבון פעיל עם הרשאה מתאימה. יש להוסיף את בעל התפקיד לארגון תחילה`,
      );
    ids.add(person.id);
  }
  return [...ids];
}
async function receipt<T>(
  tx: Tx,
  p: Principal,
  requestId: string,
  action: string,
  data: unknown,
  work: () => Promise<T>,
) {
  const key = `${p.organizationId}:${p.userId}:rhythm:${action}:${requestId}`;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
  const inserted = await tx
    .insert(s.mutationReceipts)
    .values({ key, fingerprint })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) {
    const [previous] = await tx
      .select()
      .from(s.mutationReceipts)
      .where(eq(s.mutationReceipts.key, key));
    if (previous.fingerprint !== fingerprint)
      throw new AppError(409, "מזהה הבקשה כבר שימש לפעולה אחרת");
    return previous.result as T;
  }
  const result = await work();
  await tx
    .update(s.mutationReceipts)
    .set({ result })
    .where(eq(s.mutationReceipts.key, key));
  return result;
}
async function materialize(
  db: Database | Tx,
  items: Item[],
  through: string,
  today: string,
) {
  for (const item of items.filter((item) => !item.archived)) {
    const expired=new Set((await db.select().from(s.expiredTaskRecords).where(sql`${s.expiredTaskRecords.taskKey} LIKE ${item.id+':%'}`)).map(r=>r.taskKey));
    const dates = occurrenceDates(
      item.startDate,
      item.frequency as Frequency,
      through,
      item.endDate,
    ).filter(date=>!expired.has(`${item.id}:${date}`));
    // Bulk creation also makes concurrent calendar reads harmless.
    for (let index = 0; index < dates.length; index += 100) {
      const inserted = await db
        .insert(s.rhythmOccurrences)
        .values(
          dates
            .slice(index, index + 100)
            .map((dueDate) => ({ id: randomUUID(), itemId: item.id, dueDate, scheduledDate:dueDate })),
        )
        .onConflictDoNothing()
        .returning();
      const messages = (item.category === "point" ? [] : inserted).flatMap((row) =>
        item.assigneeIds.map((recipientId) => ({
          id: randomUUID(),
          occurrenceId: row.id,
          recipientId,
          kind: "assigned",
        })),
      );
      for (let offset = 0; offset < messages.length; offset += 100)
        await db
          .insert(s.rhythmMail)
          .values(messages.slice(offset, offset + 100))
          .onConflictDoNothing();
    }
    const rows = await db
      .select()
      .from(s.rhythmOccurrences)
      .where(eq(s.rhythmOccurrences.itemId, item.id));
    const makeUrgent: string[] = [],
      clearUrgent: string[] = [];
    for (const row of rows) {
      const urgent = item.category !== "point" && rhythmUrgent(
        item,
        row.dueDate,
        completed(item, row),
        today,
      );
      if (urgent !== row.urgent)
        (urgent ? makeUrgent : clearUrgent).push(row.id);
    }
    if (makeUrgent.length)
      await db
        .update(s.rhythmOccurrences)
        .set({ urgent: true })
        .where(inArray(s.rhythmOccurrences.id, makeUrgent));
    if (clearUrgent.length)
      await db
        .update(s.rhythmOccurrences)
        .set({ urgent: false })
        .where(inArray(s.rhythmOccurrences.id, clearUrgent));
    const due = (item.category === "point" || !item.hasDeadline ? [] : rows).filter(
      (row) => row.dueDate <= addDays(today, 1) && !completed(item, row),
    );
    const assignments = due.length
      ? await db
          .select()
          .from(s.rhythmMail)
          .where(
            and(
              eq(s.rhythmMail.kind, "assigned"),
              inArray(
                s.rhythmMail.occurrenceId,
                due.map((row) => row.id),
              ),
            ),
          )
      : [];
    const sentAssignments = new Map(
      assignments.map((message) => [
        `${message.occurrenceId}:${message.recipientId}`,
        message,
      ]),
    );
    const reminders = due.flatMap((row) =>
      item.assigneeIds
        .filter((id) => {
          if (completed(item, row, id)) return false;
          const assignment = sentAssignments.get(`${row.id}:${id}`);
          return assignment?.sentAt && localDate(assignment.sentAt) < today;
        })
        .map((recipientId) => ({
          id: randomUUID(),
          occurrenceId: row.id,
          recipientId,
          kind: "deadline",
        })),
    );
    for (let index = 0; index < reminders.length; index += 100)
      await db
        .insert(s.rhythmMail)
        .values(reminders.slice(index, index + 100))
        .onConflictDoNothing();
  }
}
export async function createRhythmItem(p: Principal, input: unknown) {
  assertWrite(p);
  const { clientRequestId, emails, groupIds, recipientIds, ...parsed } = itemInput.parse(input);
  const today = localDate();
  const data = {...parsed, startDate: parsed.startDate || today,
    hasDeadline: parsed.frequency !== "once" || (parsed.hasDeadline ?? Boolean(parsed.startDate))};
  if (
    data.startDate < addDays(today, -730) ||
    data.startDate > addDays(today, 1826)
  )
    throw new AppError(
      422,
      "מועד ההתחלה צריך להיות בין שנתיים אחורה לחמש שנים קדימה",
    );
  if (data.endDate && data.endDate < data.startDate)
    throw new AppError(422, "מועד הסיום קודם למועד ההתחלה");
  const db = await getDb();
  return db.transaction((tx) =>
    receipt(
      tx,
      p,
      clientRequestId,
      "create",
      { ...data, emails, groupIds, recipientIds },
      async () => {
        let groups = groupIds.length
          ? await tx
              .select()
              .from(s.rhythmGroups)
              .where(
                and(
                  eq(s.rhythmGroups.organizationId, p.organizationId),
                  eq(s.rhythmGroups.creatorId, p.userId),
                  inArray(s.rhythmGroups.id, groupIds),
                ),
              )
          : [];
        const allGroups = await tx.select().from(s.rhythmGroups).where(and(eq(s.rhythmGroups.organizationId,p.organizationId),eq(s.rhythmGroups.creatorId,p.userId)));
        const allowed = await tx.select({email:s.user.email,name:s.user.name}).from(s.memberships).innerJoin(s.user,eq(s.user.id,s.memberships.userId)).where(and(eq(s.memberships.organizationId,p.organizationId),eq(s.memberships.active,true),authorizedMember(p.organizationId)));
        const expanded = expandRoleGroups(allGroups,allowed);
        groups = groups.map(group=>expanded.find(candidate=>candidate.id===group.id)!);
        if (groups.length !== new Set(groupIds).size)
          throw new AppError(404, "אחת הקבוצות אינה זמינה לך");
        if (groups.some((group) => group.emails.length === 0))
          throw new AppError(
            422,
            "יש לחבר מייל לבעל התפקיד שנבחר לפני שיוך משימה",
          );
        const direct = await resolveRecipientIds(tx, p, recipientIds);
        const assigned = [...new Set([...direct, ...await resolveEmails(tx, p, [
          ...new Set([...emails, ...groups.flatMap((group) => group.emails)]),
        ])])];
        if (data.category === "point" && (assigned.some(id => id !== p.userId) || data.frequency !== "once"))
          throw new AppError(422, "נקודות לעיסוק הן פרטיות וחד פעמיות");
        const [item] = await tx
          .insert(s.rhythmItems)
          .values({
            ...data,
            id: randomUUID(),
            organizationId: p.organizationId,
            creatorId: p.userId,
            assigneeIds: assigned.length ? assigned : [p.userId],
          })
          .returning();
        await materialize(
          tx,
          [item],
          data.startDate > monthEnd(today.slice(0, 7))
            ? data.startDate
            : monthEnd(today.slice(0, 7)),
          today,
        );
        await queueTaskNotification(tx,p,item.assigneeIds,"משימה חדשה שויכה אליך",item.title);
        return item;
      },
    ),
  );
}
export async function saveRhythmGroup(
  p: Principal,
  input: unknown,
  id?: string,
) {
  assertWrite(p);
  if (!isManager(p))
    throw new AppError(403, "ניהול בעלי תפקידים דורש הרשאת מנהל");
  const schema = id
    ? groupInput
        .omit({ clientRequestId: true })
        .extend({ version: z.number().int().positive() })
    : groupInput;
  const data = schema.parse(input);
  const emails = [...new Set(data.emails)];
  const db = await getDb();
  return db.transaction(async (tx) => {
    await resolveEmails(tx, p, emails);
    if (id && "version" in data) {
      const [group] = await tx
        .update(s.rhythmGroups)
        .set({ name: data.name, emails, version: data.version + 1 })
        .where(
          and(
            eq(s.rhythmGroups.id, id),
            eq(s.rhythmGroups.creatorId, p.userId),
            eq(s.rhythmGroups.organizationId, p.organizationId),
            eq(s.rhythmGroups.version, data.version),
          ),
        )
        .returning();
      if (!group)
        throw new AppError(409, "הקבוצה אינה זמינה או השתנתה. יש לרענן");
      return group;
    }
    return receipt(
      tx,
      p,
      (data as z.infer<typeof groupInput>).clientRequestId,
      "group",
      data,
      async () => {
        const [group] = await tx
          .insert(s.rhythmGroups)
          .values({
            id: randomUUID(),
            creatorId: p.userId,
            organizationId: p.organizationId,
            name: data.name,
            emails,
          })
          .returning();
        return group;
      },
    );
  });
}
export async function getRhythm(p: Principal, month = localDate().slice(0, 7)) {
  await purgeCompletedTasks(p.organizationId);
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    month < addDays(localDate(), -730).slice(0, 7) ||
    month > addDays(localDate(), 1826).slice(0, 7)
  )
    throw new AppError(422, "יש לבחור חודש בטווח המותר");
  await ensureUnitRoleGroups(p);
  const db = await getDb();
  const items = await db.select().from(s.rhythmItems).where(rhythmScope(p));
  const today = localDate();
  const through = monthEnd(
    month > today.slice(0, 7) ? month : today.slice(0, 7),
  );
  if(!p.guest) await materialize(db, items, through, today);
  const rows = items.length
    ? await db
        .select()
        .from(s.rhythmOccurrences)
        .where(
          inArray(
            s.rhythmOccurrences.itemId,
            items.map((item) => item.id),
          ),
        )
    : [];
  const members = await db
    .select({ id: s.user.id, name: s.user.name, email: s.user.email })
    .from(s.memberships)
    .innerJoin(s.user, eq(s.memberships.userId, s.user.id))
    .where(
      and(
        eq(s.memberships.organizationId, p.organizationId),
        eq(s.memberships.active, true),
        authorizedMember(p.organizationId),
      ),
    );
  const visibleIds = new Set([
    p.userId,
    ...items.flatMap((item) => [item.creatorId, ...item.assigneeIds]),
  ]);
  const groups = await db
    .select()
    .from(s.rhythmGroups)
    .where(
      and(
        eq(s.rhythmGroups.organizationId, p.organizationId),
        eq(s.rhythmGroups.creatorId, p.userId),
      ),
    );
  const eligible = isManager(p) ? await eligiblePeople(db, p) : [];
  return {
    pinnedTaskKeys:await getPins(p),
    month,
    today,
    items,
    groups: expandRoleGroups(groups.filter(group=>!(group.id.startsWith("role:")&&group.id.endsWith(":hurricane"))), members).filter((group,index,all)=>all.findIndex(other=>roleName(other.name)===roleName(group.name))===index),
    people: members.filter(
      (member) =>
        visibleIds.has(member.id) ||
        eligible.some((person) => person.id === member.id),
    ).map(member=>({...member,email:p.guest?"":member.email})),
    mailConfigured: Boolean(
      process.env.RESEND_API_KEY &&
        process.env.MAIL_FROM &&
        process.env.CRON_SECRET,
    ),
    schedulerPreview: process.env.VERCEL_ENV === "preview",
    occurrences: rows
      .map((row) => {
        const item = items.find((item) => item.id === row.itemId)!;
        // For individual assignments, another person's pending work must not make yours urgent.
        const done = completed(
          item,
          row,
          item.creatorId === p.userId || canEditAll(p) || p.guest || p.role==="viewer" ? undefined : p.userId,
        );
        return {
          ...row,
          done,
          urgent: item.category !== "point" && rhythmUrgent(item, row.dueDate, done, today),
        };
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  };
}
export async function completeRhythm(p: Principal, id: string, input: unknown) {
  assertWrite(p);
  const {clientRequestId, ...data} = z
    .object({
      clientRequestId:z.string().uuid().optional(),
      version: z.number().int().positive(),
      done: z.boolean(),
      recipientId: z.string().optional(),
      recipientIds: z.array(z.string().min(1)).min(1).max(100).optional(),
      review: z.enum(["approve", "reject"]).optional(),
    })
    .strict()
    .parse(input);
  const db = await getDb();
  return db.transaction(async (tx) => receipt(tx,p,clientRequestId || randomUUID(),`occurrence.patch:${id}`,data,async()=>{
    const [record] = await tx
      .select({ item: s.rhythmItems, occurrence: s.rhythmOccurrences })
      .from(s.rhythmOccurrences)
      .innerJoin(
        s.rhythmItems,
        eq(s.rhythmItems.id, s.rhythmOccurrences.itemId),
      )
      .where(and(rhythmScope(p), eq(s.rhythmOccurrences.id, id)));
    if (!record) throw new AppError(404, "המשימה אינה זמינה לך");
    const { item, occurrence } = record;
    const reports = { ...occurrence.reports };
    const completions = { ...occurrence.completions };
    for (const recipientId of [...new Set(data.recipientIds || [data.recipientId || p.userId])]) {
    if (
      !item.assigneeIds.includes(recipientId) ||
      (recipientId !== p.userId && !canEditAll(p))
    )
      throw new AppError(403, "אין הרשאה לסמן ביצוע עבור משתמש זה");
    if (
      item.completionMode === "shared" &&
      !item.assigneeIds.includes(p.userId) &&
      !canEditAll(p)
    )
      throw new AppError(403, "אין הרשאה לסמן ביצוע");
    const assigned = recipientId !== item.creatorId;
    if (data.review) {
      if (!canEditAll(p) || !assigned)
        throw new AppError(403, "רק מקצה המשימה רשאי לאשר ביצוע");
      if (!reports[recipientId] || completions[recipientId])
        throw new AppError(409, "אין דיווח הממתין לאישור");
      if (data.review === "approve") completions[recipientId] = new Date().toISOString();
      else { delete reports[recipientId]; delete completions[recipientId]; }
    } else if (assigned) {
      if (data.done) reports[recipientId] = new Date().toISOString();
      else { delete reports[recipientId]; delete completions[recipientId]; }
    } else {
      if (data.done) completions[recipientId] = new Date().toISOString();
      else delete completions[recipientId];
    }
    }
    const isDone = item.completionMode === "shared"
      ? item.assigneeIds.some((id) => Boolean(completions[id]))
      : item.assigneeIds.every((id) => Boolean(completions[id]));
    const [updated] = await tx
      .update(s.rhythmOccurrences)
      .set({
        reports,
        completions,
        completedAt: isDone ? new Date() : null,
        completedBy: isDone ? p.userId : null,
        urgent: item.category !== "point" && rhythmUrgent(item, occurrence.dueDate, isDone, localDate()),
        version: data.version + 1,
      })
      .where(
        and(
          eq(s.rhythmOccurrences.id, id),
          eq(s.rhythmOccurrences.version, data.version),
        ),
      )
      .returning();
    if (!updated) throw new AppError(409, "הביצוע השתנה. יש לרענן ולנסות שוב");
    await queueTaskNotification(tx,p,[...item.assigneeIds,item.creatorId],data.review?"ביצוע המשימה נבדק":data.done?"דיווח ביצוע משימה":"עדכון במשימה",item.title);
    const undoToken = await rememberUndo(tx, p, "occurrence", id, {occurrences:[occurrence]}, updated.version);
    return {...updated, undoToken};
  }));
}
async function resolveRecipientIds(db: Database | Tx, p: Principal, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.some(id => id !== p.userId) && !canEditAll(p))
    throw new AppError(403, "שיוך לאחרים דורש הרשאת מנהל");
  const eligible = await eligiblePeople(db, p);
  if (unique.some(id => id !== p.userId && !eligible.some(person => person.id === id)))
    throw new AppError(403, "אחד מבעלי התפקידים אינו זמין לשיוך");
  return unique;
}
export async function rememberUndo(tx: Tx, p: Principal, kind: string, entityId: string,
  snapshot: typeof s.rhythmUndo.$inferInsert["snapshot"], expectedVersion: number) {
  const id = randomUUID();
  await tx.delete(s.rhythmUndo).where(lt(s.rhythmUndo.expiresAt,new Date()));
  await tx.insert(s.rhythmUndo).values({id, organizationId:p.organizationId, actorId:p.userId,
    kind, entityId, snapshot, expectedVersion, expiresAt:new Date(Date.now()+60_000)});
  return id;
}
export async function editRhythmItem(p: Principal, id: string, input: unknown) {
  assertWrite(p);
  const {clientRequestId,recipientIds, version, ...data} = z.object({
    clientRequestId:z.string().uuid().optional(), version:z.number().int().positive(), title:z.string().trim().min(2).max(160).optional(),
    description:z.string().trim().max(5000).optional(), important:z.boolean().optional(),
    manualUrgent:z.boolean().optional(), archived:z.boolean().optional(),
    category:z.enum(["task", "point"]).optional(), hasDeadline:z.boolean().optional(),
    startDate:dateInput.optional(), recipientIds:z.array(z.string().min(1)).max(100).optional(),
  }).strict().parse(input);
  const db = await getDb();
  return db.transaction(async tx => receipt(tx,p,clientRequestId || randomUUID(),`item.patch:${id}`,{version,recipientIds,...data},async()=>{
    const [before] = await tx.select().from(s.rhythmItems).where(and(eq(s.rhythmItems.id,id),
      rhythmScope(p)));
    if (!before) throw new AppError(404,"המשימה אינה זמינה לך");
    if (!canEditAll(p) && !before.assigneeIds.includes(p.userId)) throw new AppError(403,"אפשר לערוך רק משימה שהוקצתה לך");
    if (!canEditAll(p) && recipientIds && JSON.stringify(recipientIds)!==JSON.stringify(before.assigneeIds)) throw new AppError(403,"שינוי אחראים דורש הרשאת עריכה כללית");
    if(data.archived!==undefined&&!canEditAll(p)&&before.creatorId!==p.userId)throw new AppError(403,"רק יוצר המשימה או מנהל רשאי למחוק אותה");
    if(!p.manageAccess&&((data.startDate!==undefined&&data.startDate!==before.startDate)||(data.hasDeadline!==undefined&&data.hasDeadline!==before.hasDeadline)))throw new AppError(403,'שינוי תג״ב מחייב בקשת הארכה ואישור מנהל');
    if (before.version !== version) throw new AppError(409,"המשימה השתנתה. יש לרענן");
    const assigneeIds = recipientIds === undefined || JSON.stringify(recipientIds)===JSON.stringify(before.assigneeIds) ? before.assigneeIds :
      (await resolveRecipientIds(tx,p,recipientIds));
    if (!assigneeIds.length) assigneeIds.push(p.userId);
    if(data.category==="point" && before.creatorId!==p.userId)throw new AppError(403,"רק יוצר המשימה יכול להעביר אותה לנקודות פרטיות");
    const next = {...before,...data,assigneeIds};
    if (next.category === "point" && (next.frequency !== "once" || assigneeIds.length !== 1 || assigneeIds[0] !== p.userId))
      throw new AppError(422,"נקודה לעיסוק חייבת להישאר פרטית");
    if (data.startDate && (before.frequency !== "once" || data.startDate < addDays(localDate(),-730) || data.startDate > addDays(localDate(),1826)))
      throw new AppError(422,"אפשר לשנות מועד למשימה חד פעמית בטווח המותר");
    if (before.frequency !== "once" && data.hasDeadline === false) throw new AppError(422,"למשימה חוזרת יש מועדי ביצוע");
    const occurrences = await tx.select().from(s.rhythmOccurrences).where(eq(s.rhythmOccurrences.itemId,id));
    const [item] = await tx.update(s.rhythmItems).set({...data,assigneeIds,version:version+1})
      .where(and(eq(s.rhythmItems.id,id),eq(s.rhythmItems.version,version))).returning();
    if (!item) throw new AppError(409,"המשימה השתנתה. יש לרענן");
    const reassign = JSON.stringify(assigneeIds) !== JSON.stringify(before.assigneeIds);
    for (const row of occurrences) {
      const completions = reassign ? {} : row.completions;
      const reports = reassign ? {} : row.reports;
      const dueDate = data.startDate || row.dueDate;
      const done = !reassign && completed(item,row);
      const [updated] = await tx.update(s.rhythmOccurrences).set({completions,reports,dueDate,scheduledDate:data.startDate||row.scheduledDate,
        completedAt:reassign ? null : row.completedAt, completedBy:reassign ? null : row.completedBy,
        urgent:item.category !== "point" && rhythmUrgent(item,dueDate,done,localDate()),version:row.version+1})
        .where(and(eq(s.rhythmOccurrences.id,row.id),eq(s.rhythmOccurrences.version,row.version))).returning();
      if (!updated) throw new AppError(409,"מצב הביצוע השתנה. יש לרענן");
      if (reassign && item.category !== "point") {
        for (const recipientId of assigneeIds) await tx.insert(s.rhythmMail).values({id:randomUUID(),occurrenceId:row.id,recipientId,kind:"assigned"}).onConflictDoNothing();
      }
    }
    await queueTaskNotification(tx,p,[...item.assigneeIds,item.creatorId],"המשימה עודכנה",item.title);
    const undoToken = await rememberUndo(tx,p,"item",id,{item:before,occurrences},item.version);
    return {...item,undoToken};
  }));
}
export async function undoRhythm(p: Principal, input: unknown) {
  assertWrite(p);
  const {token} = z.object({token:z.string().uuid()}).strict().parse(input);
  const db = await getDb();
  return db.transaction(async tx => {
    const [record] = await tx.delete(s.rhythmUndo).where(and(eq(s.rhythmUndo.id,token),
      eq(s.rhythmUndo.actorId,p.userId),eq(s.rhythmUndo.organizationId,p.organizationId))).returning();
    if (!record || record.expiresAt.getTime() < Date.now()) throw new AppError(409,"זמן ביטול הפעולה עבר");
    if (record.kind === "task") {
      const saved = record.snapshot.task!;
      const [updated] = await tx.update(s.tasks).set({...saved,
        createdAt:new Date(saved.createdAt),updatedAt:new Date(),
        completedAt:saved.completedAt?new Date(saved.completedAt):null,version:record.expectedVersion+1})
        .where(and(eq(s.tasks.id,record.entityId),eq(s.tasks.version,record.expectedVersion))).returning();
      if (!updated) throw new AppError(409,"המשימה השתנתה מאז הפעולה ולכן לא ניתן לבטל");
    }
    if (record.kind === "item") {
      const saved = record.snapshot.item!;
      const {createdAt, ...fields} = saved;
      void createdAt;
      const [updated] = await tx.update(s.rhythmItems).set({...fields,version:record.expectedVersion+1})
        .where(and(eq(s.rhythmItems.id,record.entityId),eq(s.rhythmItems.version,record.expectedVersion))).returning();
      if (!updated) throw new AppError(409,"המשימה השתנתה מאז הפעולה ולכן לא ניתן לבטל");
    }
    for (const saved of record.snapshot.occurrences) {
      const expected = record.kind === "item" ? saved.version+1 : record.expectedVersion;
      const [updated] = await tx.update(s.rhythmOccurrences).set({...saved,
        completedAt:saved.completedAt ? new Date(saved.completedAt) : null,version:expected+1})
        .where(and(eq(s.rhythmOccurrences.id,saved.id),eq(s.rhythmOccurrences.version,expected))).returning();
      if (!updated) throw new AppError(409,"מצב הביצוע השתנה מאז הפעולה ולכן לא ניתן לבטל");
    }
    return {ok:true};
  });
}
/** Called by the authenticated scheduler; it never requires an open browser. */
export async function refreshRhythmSchedule(now = new Date()) {
  await purgeCompletedTasks(undefined,now);
  const db = await getDb();
  const items = await db
    .select()
    .from(s.rhythmItems)
    .where(eq(s.rhythmItems.archived, false));
  const today = localDate(now);
  await materialize(db, items, monthEnd(today.slice(0, 7)), today);
}
export { completed as rhythmCompleted };
