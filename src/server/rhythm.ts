import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { getDb, type Database } from "./db";
import * as s from "./schema";
import {
  AppError,
  assertWrite,
  isManager,
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
    description: z.string().trim().max(5000).default(""),
    important: z.boolean().default(false),
    manualUrgent: z.boolean().default(false),
    frequency: z.enum(Object.keys(frequencies) as [Frequency, ...Frequency[]]),
    startDate: dateInput,
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
    emails: emailsInput.refine((emails) => emails.length > 0),
  })
  .strict();
export function rhythmScope(p: Principal) {
  return and(
    eq(s.rhythmItems.organizationId, p.organizationId),
    p.role === "admin"
      ? sql`false`
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
  if (emails.length && !isManager(p))
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
    const dates = occurrenceDates(
      item.startDate,
      item.frequency as Frequency,
      through,
      item.endDate,
    );
    // Bulk creation also makes concurrent calendar reads harmless.
    for (let index = 0; index < dates.length; index += 100) {
      const inserted = await db
        .insert(s.rhythmOccurrences)
        .values(
          dates
            .slice(index, index + 100)
            .map((dueDate) => ({ id: randomUUID(), itemId: item.id, dueDate })),
        )
        .onConflictDoNothing()
        .returning();
      const messages = inserted.flatMap((row) =>
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
      const urgent = rhythmUrgent(
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
    const due = rows.filter(
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
  const { clientRequestId, emails, groupIds, ...data } = itemInput.parse(input);
  const today = localDate();
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
      { ...data, emails, groupIds },
      async () => {
        const groups = groupIds.length
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
        if (groups.length !== new Set(groupIds).size)
          throw new AppError(404, "אחת הקבוצות אינה זמינה לך");
        const assigned = await resolveEmails(tx, p, [
          ...new Set([...emails, ...groups.flatMap((group) => group.emails)]),
        ]);
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
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    month < addDays(localDate(), -730).slice(0, 7) ||
    month > addDays(localDate(), 1826).slice(0, 7)
  )
    throw new AppError(422, "יש לבחור חודש בטווח המותר");
  const db = await getDb();
  const items = await db.select().from(s.rhythmItems).where(rhythmScope(p));
  const today = localDate();
  const through = monthEnd(
    month > today.slice(0, 7) ? month : today.slice(0, 7),
  );
  await materialize(db, items, through, today);
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
    month,
    today,
    items,
    groups,
    people: members.filter(
      (member) =>
        visibleIds.has(member.id) ||
        eligible.some((person) => person.id === member.id),
    ),
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
          item.creatorId === p.userId ? undefined : p.userId,
        );
        return {
          ...row,
          done,
          urgent: rhythmUrgent(item, row.dueDate, done, today),
        };
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  };
}
export async function completeRhythm(p: Principal, id: string, input: unknown) {
  assertWrite(p);
  const data = z
    .object({
      version: z.number().int().positive(),
      done: z.boolean(),
      recipientId: z.string().optional(),
    })
    .strict()
    .parse(input);
  const db = await getDb();
  return db.transaction(async (tx) => {
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
    const recipientId = data.recipientId || p.userId;
    if (
      !item.assigneeIds.includes(recipientId) ||
      (recipientId !== p.userId && item.creatorId !== p.userId)
    )
      throw new AppError(403, "אין הרשאה לסמן ביצוע עבור משתמש זה");
    if (
      item.completionMode === "shared" &&
      !item.assigneeIds.includes(p.userId) &&
      item.creatorId !== p.userId
    )
      throw new AppError(403, "אין הרשאה לסמן ביצוע");
    const completions = { ...occurrence.completions };
    if (data.done) completions[recipientId] = new Date().toISOString();
    else delete completions[recipientId];
    const isDone =
      item.completionMode === "shared"
        ? data.done
        : item.assigneeIds.every((id) => Boolean(completions[id]));
    const [updated] = await tx
      .update(s.rhythmOccurrences)
      .set({
        completions,
        completedAt: isDone ? new Date() : null,
        completedBy: isDone ? p.userId : null,
        urgent: rhythmUrgent(item, occurrence.dueDate, isDone, localDate()),
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
    return updated;
  });
}
export async function editRhythmItem(p: Principal, id: string, input: unknown) {
  assertWrite(p);
  const data = z
    .object({
      version: z.number().int().positive(),
      title: z.string().trim().min(2).max(160).optional(),
      description: z.string().trim().max(5000).optional(),
      important: z.boolean().optional(),
      manualUrgent: z.boolean().optional(),
      archived: z.boolean().optional(),
    })
    .strict()
    .parse(input);
  const db = await getDb();
  const [item] = await db
    .update(s.rhythmItems)
    .set({ ...data, version: data.version + 1 })
    .where(
      and(
        eq(s.rhythmItems.id, id),
        eq(s.rhythmItems.organizationId, p.organizationId),
        eq(s.rhythmItems.creatorId, p.userId),
        eq(s.rhythmItems.version, data.version),
      ),
    )
    .returning();
  if (!item) throw new AppError(409, "המשימה אינה זמינה או השתנתה. יש לרענן");
  return item;
}
/** Called by the authenticated scheduler; it never requires an open browser. */
export async function refreshRhythmSchedule(now = new Date()) {
  const db = await getDb();
  const items = await db
    .select()
    .from(s.rhythmItems)
    .where(eq(s.rhythmItems.archived, false));
  const today = localDate(now);
  await materialize(db, items, monthEnd(today.slice(0, 7)), today);
}
export { completed as rhythmCompleted };
