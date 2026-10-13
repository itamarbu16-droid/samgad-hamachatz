import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db";
import { seedDemo } from "../src/server/seed";
import { principalFor } from "../src/server/service";
import {
  createRhythmItem,
  getRhythm,
  completeRhythm,
  saveRhythmGroup,
  editRhythmItem,
  refreshRhythmSchedule,
} from "../src/server/rhythm";
import { flushRhythmMail } from "../src/server/rhythm-mail";
import { GET as runCron } from "../src/app/api/cron/rhythm/route";
import { occurrenceDates, rhythmUrgent, addDays } from "../src/lib/rhythm";
import { localDate, type Principal } from "../src/server/policy";
import * as s from "../src/server/schema";
let deputy: Principal,
  companyA: Principal,
  companyB: Principal,
  contributor: Principal,
  viewer: Principal;
const today = localDate(),
  request = () => randomUUID();
const input = (extra: object = {}) => ({
  clientRequestId: request(),
  title: "פעולת בדיקה",
  frequency: "once",
  startDate: today,
  ...extra,
});
beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  process.env.PGLITE_DATA_DIR = "memory://";
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET = "isolated-test-secret-for-rhythm-123456789";
  process.env.DEMO_PASSWORD = "isolated-test-password-123456";
  process.env.DEMO_EMAIL = "demo@samgad.example";
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.CRON_SECRET;
  await seedDemo();
  const users = await (await getDb()).select().from(s.user);
  const p = (email: string) => {
    const user = users.find((user) => user.email === email)!;
    return principalFor(user.id, user.name);
  };
  deputy = await p("demo@samgad.example");
  companyA = await p("company.a@samgad.example");
  companyB = await p("company.b@samgad.example");
  contributor = await p("contributor@samgad.example");
  viewer = await p("viewer@samgad.example");
}, 60000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await closeDb();
});
describe("calendar and priority rules", () => {
  it("preserves the monthly anchor through February and leap years", () => {
    expect(occurrenceDates("2026-01-31", "monthly", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(occurrenceDates("2024-02-29", "annual", "2028-02-29")).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
    expect(occurrenceDates("2026-12-27", "fortnightly", "2027-01-31")).toEqual([
      "2026-12-27",
      "2027-01-10",
      "2027-01-24",
    ]);
    expect(
      occurrenceDates("2026-01-01", "quarterly", "2027-01-01", "2026-07-01"),
    ).toHaveLength(3);
    expect(
      occurrenceDates("2026-01-01", "semiannual", "2027-01-01"),
    ).toHaveLength(3);
  });
  it("does not make future routines urgent just because month-end is near", () => {
    const item = { manualUrgent: false, frequency: "daily" };
    expect(rhythmUrgent(item, "2026-10-30", false, "2026-10-24")).toBe(false);
    expect(rhythmUrgent(item, "2026-10-24", false, "2026-10-24")).toBe(true);
    expect(rhythmUrgent(item, "2026-10-25", false, "2026-10-24")).toBe(true);
    expect(rhythmUrgent(item, "2026-10-23", true, "2026-10-24")).toBe(false);
  });
});
describe("private and assigned persisted workflows", () => {
  it("keeps personal records private even from a deputy and rejects guessed IDs", async () => {
    const task = await createRhythmItem(
      contributor,
      input({ important: true }),
    );
    const own = await getRhythm(contributor);
    const row = own.occurrences.find((row) => row.itemId === task.id)!;
    expect(
      (await getRhythm(deputy)).items.some((item) => item.id === task.id),
    ).toBe(false);
    expect((await getRhythm(viewer)).items).toHaveLength(0);
    await expect(
      completeRhythm(deputy, row.id, {
        version: 1,
        done: true,
        recipientId: contributor.userId,
      }),
    ).rejects.toMatchObject({ status: 404 });
    const done = await completeRhythm(contributor, row.id, {
      version: 1,
      done: true,
    });
    expect(done.completedBy).toBe(contributor.userId);
    await expect(
      completeRhythm(contributor, row.id, { version: 1, done: false }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(createRhythmItem(viewer, input())).rejects.toMatchObject({
      status: 403,
    });
  });
  it("deduplicates retries and rejects changed request content", async () => {
    const body = input();
    const first = await createRhythmItem(deputy, body),
      second = await createRhythmItem(deputy, body);
    expect(second.id).toBe(first.id);
    await expect(
      createRhythmItem(deputy, { ...body, title: "תוכן שונה" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("resolves group emails once and tracks each assigned person separately", async () => {
    const group = await saveRhythmGroup(deputy, {
      clientRequestId: request(),
      name: "קבוצת בדיקה",
      emails: ["company.a@samgad.example", "company.b@samgad.example"],
    });
    const item = await createRhythmItem(
      deputy,
      input({ groupIds: [group.id], completionMode: "individual" }),
    );
    expect(item.assigneeIds).toHaveLength(2);
    const row = (await getRhythm(companyA)).occurrences.find(
      (row) => row.itemId === item.id,
    )!;
    expect(
      (await getRhythm(contributor)).items.some(
        (record) => record.id === item.id,
      ),
    ).toBe(false);
    await expect(
      completeRhythm(companyA, row.id, {
        version: 1,
        done: true,
        recipientId: companyB.userId,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await completeRhythm(companyA, row.id, { version: 1, done: true });
    expect(
      (await getRhythm(companyA)).occurrences.find(
        (record) => record.id === row.id,
      ),
    ).toMatchObject({ done: true, urgent: false });
    expect(
      (await getRhythm(companyB)).occurrences.find(
        (record) => record.id === row.id,
      ),
    ).toMatchObject({ done: false, urgent: true });
    expect(
      (await getRhythm(deputy)).occurrences.find(
        (record) => record.id === row.id,
      )?.done,
    ).toBe(false);
    await completeRhythm(companyB, row.id, { version: 2, done: true });
    expect(
      (await getRhythm(deputy)).occurrences.find(
        (record) => record.id === row.id,
      )?.done,
    ).toBe(true);
    await saveRhythmGroup(
      deputy,
      { name: group.name, emails: ["company.a@samgad.example"], version: 1 },
      group.id,
    );
    expect(
      (await getRhythm(deputy)).items.find((record) => record.id === item.id)
        ?.assigneeIds,
    ).toHaveLength(2);
  });
  it("shared completion closes for everybody, records actor and rejects assignment escalation", async () => {
    const item = await createRhythmItem(
      deputy,
      input({
        emails: ["company.a@samgad.example", "company.b@samgad.example"],
        completionMode: "shared",
      }),
    );
    const row = (await getRhythm(companyA)).occurrences.find(
      (row) => row.itemId === item.id,
    )!;
    await completeRhythm(companyA, row.id, { done: true, version: 1 });
    expect(
      (await getRhythm(companyB)).occurrences.find(
        (record) => record.id === row.id,
      ),
    ).toMatchObject({ done: true, completedBy: companyA.userId });
    await expect(
      createRhythmItem(
        companyA,
        input({ emails: ["company.b@samgad.example"] }),
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      createRhythmItem(
        contributor,
        input({ emails: ["company.a@samgad.example"] }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createRhythmItem(deputy, input({ emails: ["unknown@samgad.example"] })),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("materializes separate daily occurrences once and preserves completion across months and archival", async () => {
    const item = await createRhythmItem(
      deputy,
      input({
        frequency: "daily",
        startDate: addDays(today, -3),
        endDate: addDays(today, 2),
      }),
    );
    await Promise.all([getRhythm(deputy), getRhythm(deputy)]);
    let rows = (await getRhythm(deputy)).occurrences.filter(
      (row) => row.itemId === item.id,
    );
    expect(rows).toHaveLength(6);
    await completeRhythm(deputy, rows[0].id, {
      version: rows[0].version,
      done: true,
    });
    await refreshRhythmSchedule(new Date(addDays(today, 35) + "T12:00:00Z"));
    rows = (await getRhythm(deputy)).occurrences.filter(
      (row) => row.itemId === item.id,
    );
    expect(rows[0].done).toBe(true);
    await editRhythmItem(deputy, item.id, { version: 1, archived: true });
    expect(
      (await getRhythm(deputy)).occurrences.filter(
        (row) => row.itemId === item.id,
      ),
    ).toHaveLength(6);
  });
});
describe("mail and scheduler", () => {
  it("rejects unauthenticated cron access and leaves mail queued when unconfigured", async () => {
    const response = await runCron(
      new Request("http://localhost/api/cron/rhythm"),
    );
    expect(response.status).toBe(401);
    expect(await flushRhythmMail()).toMatchObject({
      configured: false,
      sent: 0,
    });
  });
  it("sends one private request per recipient, skips completed work and generates only one deadline reminder", async () => {
    const future = addDays(today, 3);
    const item = await createRhythmItem(
      deputy,
      input({
        startDate: future,
        emails: ["company.a@samgad.example", "company.b@samgad.example"],
      }),
    );
    const db = await getDb();
    // Materialize a next-month date too if this test happens near month-end.
    const row = (await getRhythm(deputy, future.slice(0, 7))).occurrences.find(
      (row) => row.itemId === item.id,
    )!;
    process.env.RESEND_API_KEY = "synthetic-not-a-real-key";
    process.env.MAIL_FROM = "Synthetic <sender@samgad.example>";
    const delivery = vi.fn(async () => Response.json({ id: "synthetic" }));
    vi.stubGlobal("fetch", delivery);
    await flushRhythmMail();
    const sent = await db
      .select()
      .from(s.rhythmMail)
      .where(eq(s.rhythmMail.occurrenceId, row.id));
    expect(sent.filter((message) => message.sentAt)).toHaveLength(2);
    for (const call of delivery.mock.calls) {
      const options = (call as unknown[])[1] as RequestInit;
      expect(JSON.parse(options.body as string).to).toHaveLength(1);
      expect(
        (options.headers as Record<string, string>)["Idempotency-Key"],
      ).toMatch(/^rhythm\//);
    }
    const count = delivery.mock.calls.length;
    await flushRhythmMail();
    expect(delivery.mock.calls.length).toBe(count);
    await db
      .update(s.rhythmMail)
      .set({ sentAt: new Date(addDays(today, -2) + "T12:00:00Z") })
      .where(eq(s.rhythmMail.occurrenceId, row.id));
    await completeRhythm(companyA, row.id, { version: 1, done: true });
    await refreshRhythmSchedule(new Date(addDays(today, 2) + "T12:00:00Z"));
    await refreshRhythmSchedule(new Date(addDays(today, 2) + "T12:00:00Z"));
    const reminders = await db
      .select()
      .from(s.rhythmMail)
      .where(
        and(
          eq(s.rhythmMail.occurrenceId, row.id),
          eq(s.rhythmMail.kind, "deadline"),
        ),
      );
    expect(reminders).toHaveLength(1);
    expect(reminders[0].recipientId).toBe(companyB.userId);
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
  });
});
