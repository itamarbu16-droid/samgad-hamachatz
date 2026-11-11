import { and, eq, isNull, or, lt, sql } from "drizzle-orm";
import { getDb } from "./db";
import * as s from "./schema";
import { appUrl } from "./app-url";
import { isPersonalItem } from "../lib/unit-roles";
import { addDays } from "../lib/rhythm";
import { localDate } from "./policy";
import { rhythmCompleted } from "./rhythm";

/** Bounded, persistent outbox. Provider failures leave the message available for the next run. */
export async function flushRhythmMail() {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM)
    return { configured: false, sent: 0, failed: 0 };
  const db = await getDb();
  let sent = 0,
    failed = 0;
  const cutoff = new Date(Date.now() - 5 * 60_000);
  const pending = await db
    .select()
    .from(s.rhythmMail)
    .where(
      and(
        isNull(s.rhythmMail.sentAt),
        isNull(s.rhythmMail.skippedAt),
        or(isNull(s.rhythmMail.claimedAt), lt(s.rhythmMail.claimedAt, cutoff)),
      ),
    )
    .limit(50);
  for (const message of pending) {
    // Resend idempotency keys expire after 24h. Unknown outcomes older than that
    // require reconciliation instead of a potentially duplicate automatic send.
    if (
      message.firstAttemptAt &&
      Date.now() - message.firstAttemptAt.getTime() >= 23 * 60 * 60_000
    ) {
      failed++;
      continue;
    }
    const [claim] = await db
      .update(s.rhythmMail)
      .set({
        claimedAt: new Date(),
        attempts: sql`${s.rhythmMail.attempts} + 1`,
      })
      .where(
        and(
          eq(s.rhythmMail.id, message.id),
          isNull(s.rhythmMail.sentAt),
          isNull(s.rhythmMail.skippedAt),
          or(
            isNull(s.rhythmMail.claimedAt),
            lt(s.rhythmMail.claimedAt, cutoff),
          ),
        ),
      )
      .returning();
    if (!claim) continue;
    try {
      const [record] = await db
        .select({
          item: s.rhythmItems,
          occurrence: s.rhythmOccurrences,
          email: s.user.email,
          member: s.memberships,
        })
        .from(s.rhythmOccurrences)
        .innerJoin(
          s.rhythmItems,
          eq(s.rhythmItems.id, s.rhythmOccurrences.itemId),
        )
        .innerJoin(s.user, eq(s.user.id, message.recipientId))
        .innerJoin(
          s.memberships,
          and(
            eq(s.memberships.userId, s.user.id),
            eq(s.memberships.organizationId, s.rhythmItems.organizationId),
          ),
        )
        .where(eq(s.rhythmOccurrences.id, message.occurrenceId));
      if (
        !record ||
        record.item.archived ||
        record.item.category === "point" ||
        (message.kind === "deadline" && !record.item.hasDeadline) ||
        !record.member.active ||
        ["viewer", "admin"].includes(record.member.role) ||
        !record.item.assigneeIds.includes(message.recipientId) ||
        rhythmCompleted(record.item, record.occurrence, message.recipientId)
      ) {
        await db
          .update(s.rhythmMail)
          .set({ skippedAt: new Date() })
          .where(eq(s.rhythmMail.id, message.id));
        continue;
      }
      const urgent = record.item.manualUrgent || (record.item.hasDeadline && record.occurrence.dueDate <= addDays(localDate(), 1));
      const prefix =
        message.kind === "deadline"
          ? "תזכורת לתג״ב"
          : urgent
            ? "משימה חדשה ודחופה"
            : "משימה חדשה";
      const url = new URL("/", appUrl());
      url.searchParams.set(
        "view",
        isPersonalItem(record.item, message.recipientId) ? "personal" : "tasks",
      );
      url.searchParams.set("month", record.occurrence.dueDate.slice(0, 7));
      url.searchParams.set("occurrence", record.occurrence.id);
      // One recipient per request: never disclose a group's email addresses to its members.
      const payload = claim.payload || {
        from: process.env.MAIL_FROM,
        to: [record.email],
        subject: `${prefix}: ${record.item.title}`,
        text: `${prefix}\n\n${record.item.title}\n${record.item.description}\n\n${record.item.hasDeadline ? `תאריך גמר ביצוע: ${record.occurrence.dueDate}` : "ללא מועד סיום"}\n\nפתיחת המשימה: ${url}`,
      };
      // Persist an immutable provider request before sending, so retries use the
      // same payload even if the task title or application URL changes.
      await db
        .update(s.rhythmMail)
        .set({ payload, firstAttemptAt: claim.firstAttemptAt || new Date() })
        .where(eq(s.rhythmMail.id, message.id));
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `rhythm/${message.id}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Mail provider rejected request");
      await db
        .update(s.rhythmMail)
        .set({ sentAt: new Date() })
        .where(eq(s.rhythmMail.id, message.id));
      sent++;
    } catch {
      failed++;
      // Retain the lease for five minutes rather than repeatedly hammering the provider.
      console.error("Rhythm mail delivery failed", { messageId: message.id });
    }
  }
  return { configured: true, sent, failed };
}
