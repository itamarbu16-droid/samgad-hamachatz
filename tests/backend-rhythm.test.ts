import {grantAccess} from "../src/server/access";
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
  undoRhythm,
  saveRhythmGroup,
  editRhythmItem,
  refreshRhythmSchedule,
} from "../src/server/rhythm";
import {searchWorkspace} from "../src/server/search";
import {createDocument} from "../src/server/documents";
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
  for(const user of users.filter(u=>u.email!=="demo@samgad.example")) await grantAccess(deputy,{email:user.email,level:user.email==="viewer@samgad.example"?"view":"own"});
  companyA = await p("company.a@samgad.example");
  companyB = await p("company.b@samgad.example");
  contributor = await p("contributor@samgad.example");
  viewer = await p("viewer@samgad.example");
}, 60000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await closeDb();
});
describe("private points", () => {
  it("persists points without exposing them to another member or making them urgent", async () => {
    const point = await createRhythmItem(deputy, input({category:"point", title:"נקודה לעיסוק פרטית"}));
    const row = (await getRhythm(deputy)).occurrences.find(r => r.itemId === point.id)!;
    expect(row.urgent).toBe(false);
    expect((await getRhythm(companyA)).items.some(i => i.id === point.id)).toBe(false);
    await completeRhythm(deputy, row.id, {version:1, done:true});
    expect((await getRhythm(deputy)).occurrences.find(r => r.id === row.id)?.done).toBe(true);
  });
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
    expect((await getRhythm(deputy)).occurrences.find(r => r.id === row.id)?.done).toBe(false);
    await expect(completeRhythm(companyA, row.id, {version:2, done:true, review:"approve"})).rejects.toMatchObject({status:403});
    await completeRhythm(deputy, row.id, {version:2, done:true, recipientId:companyA.userId, review:"approve"});
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
    await completeRhythm(companyB, row.id, { version: 3, done: true });
    await completeRhythm(deputy, row.id, {version:4, done:true, recipientId:companyB.userId, review:"approve"});
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
    await completeRhythm(deputy, row.id, {done:false, version:2, recipientId:companyA.userId, review:"reject"});
    expect((await getRhythm(companyA)).occurrences.find(r => r.id === row.id)?.reports).toEqual({});
    await completeRhythm(companyA, row.id, {done:true, version:3});
    await completeRhythm(deputy, row.id, {done:true, version:4, recipientId:companyA.userId, review:"approve"});
    expect(
      (await getRhythm(companyB)).occurrences.find(
        (record) => record.id === row.id,
      ),
    ).toMatchObject({ done: true, completedBy: deputy.userId });
    await expect(
      createRhythmItem(
        companyA,
        input({ emails: ["company.b@samgad.example"] }),
      ),
    ).rejects.toMatchObject({ status: 403 });
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
    await refreshRhythmSchedule(new Date(addDays(today, 20) + "T12:00:00Z"));
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
    expect((await getRhythm(deputy)).occurrences.find(r => r.id === row.id)?.done).toBe(false);
    await expect(completeRhythm(companyA, row.id, {version:2, done:true, review:"approve"})).rejects.toMatchObject({status:403});
    await completeRhythm(deputy, row.id, {version:2, done:true, recipientId:companyA.userId, review:"approve"});
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

describe("quick task entry, optional dates and undo", () => {
  it("creates from a title, retains optional dates, and does not mark undated work overdue", async () => {
    const item=await createRhythmItem(deputy,{clientRequestId:request(),title:"כותרת בלבד"});
    expect(item.hasDeadline).toBe(false);expect(item.assigneeIds).toEqual([deputy.userId]);
    const row=(await getRhythm(deputy)).occurrences.find(r=>r.itemId===item.id)!;
    expect(row.urgent).toBe(false);
    const dated=await editRhythmItem(deputy,item.id,{version:1,startDate:addDays(today,3),hasDeadline:true});
    expect(dated.hasDeadline).toBe(true);
    expect((await getRhythm(deputy)).occurrences.find(r=>r.itemId===item.id)?.dueDate).toBe(addDays(today,3));
    await undoRhythm(deputy,{token:dated.undoToken});
    expect((await getRhythm(deputy)).items.find(r=>r.id===item.id)?.hasDeadline).toBe(false);
  });
  it("converts a private point to an assigned task, keeps its text, and supports undo", async () => {
    const point=await createRhythmItem(deputy,{clientRequestId:request(),title:"נקודה להמרה",category:"point",recipientIds:[deputy.userId]});
    const converted=await editRhythmItem(deputy,point.id,{version:1,category:"task",recipientIds:[companyA.userId],hasDeadline:false});
    expect(converted.id).toBe(point.id);expect(converted.assigneeIds).toEqual([companyA.userId]);
    expect((await getRhythm(companyA)).items.some(r=>r.id===point.id)).toBe(true);
    await undoRhythm(deputy,{token:converted.undoToken});
    expect((await getRhythm(companyA)).items.some(r=>r.id===point.id)).toBe(false);
    expect((await getRhythm(deputy)).items.find(r=>r.id===point.id)?.category).toBe("point");
    await expect(editRhythmItem(contributor,point.id,{version:3,recipientIds:[companyA.userId]})).rejects.toMatchObject({status:404});
  });
  it("undoes a completion once and refuses another actor or a newer version", async () => {
    const item=await createRhythmItem(deputy,{clientRequestId:request(),title:"ביטול ביצוע"});
    const row=(await getRhythm(deputy)).occurrences.find(r=>r.itemId===item.id)!;
    const done=await completeRhythm(deputy,row.id,{version:1,done:true});
    await expect(undoRhythm(companyA,{token:done.undoToken})).rejects.toMatchObject({status:409});
    await undoRhythm(deputy,{token:done.undoToken});
    expect((await getRhythm(deputy)).occurrences.find(r=>r.id===row.id)?.done).toBe(false);
    await expect(undoRhythm(deputy,{token:done.undoToken})).rejects.toMatchObject({status:409});
    const edit=await editRhythmItem(deputy,item.id,{version:1,title:"כותרת חדשה"});
    await editRhythmItem(deputy,item.id,{version:2,title:"עוד שינוי"});
    await expect(undoRhythm(deputy,{token:edit.undoToken})).rejects.toMatchObject({status:409});
  });
  it("expires undo tokens and checks eligibility for direct recipient selection", async () => {
    const item=await createRhythmItem(deputy,{clientRequestId:request(),title:"תוקף ביטול"});
    const edited=await editRhythmItem(deputy,item.id,{version:1,important:true});
    await (await getDb()).update(s.rhythmUndo).set({expiresAt:new Date(0)}).where(eq(s.rhythmUndo.id,edited.undoToken));
    await expect(undoRhythm(deputy,{token:edited.undoToken})).rejects.toMatchObject({status:409});
    await expect(createRhythmItem(contributor,{clientRequestId:request(),title:"אין הרשאה",recipientIds:[companyA.userId]})).rejects.toMatchObject({status:403});
    await expect(createRhythmItem(deputy,{clientRequestId:request(),title:"חשבון לא קיים",recipientIds:["unknown"]})).rejects.toMatchObject({status:403});
  });
  it("applies multiple reports or approvals to one occurrence atomically, with one undo", async () => {
    const item=await createRhythmItem(deputy,input({recipientIds:[companyA.userId,companyB.userId]}));
    const row=(await getRhythm(deputy)).occurrences.find(r=>r.itemId===item.id)!;
    await expect(completeRhythm(companyA,row.id,{version:1,done:true,recipientIds:[companyA.userId,companyB.userId]})).rejects.toMatchObject({status:403});
    expect((await getRhythm(deputy)).occurrences.find(r=>r.id===row.id)?.reports).toEqual({});
    await completeRhythm(deputy,row.id,{version:1,done:true,recipientIds:[companyA.userId,companyB.userId]});
    const approved=await completeRhythm(deputy,row.id,{version:2,done:true,review:"approve",recipientIds:[companyA.userId,companyB.userId]});
    expect((await getRhythm(deputy)).occurrences.find(r=>r.id===row.id)?.done).toBe(true);
    await undoRhythm(deputy,{token:approved.undoToken});
    const restored=(await getRhythm(deputy)).occurrences.find(r=>r.id===row.id)!;
    expect(restored.done).toBe(false);expect(Object.keys(restored.reports)).toHaveLength(2);expect(restored.completions).toEqual({});
  });
  it("searches full document text and private points without leaking another person's private work", async () => {
    const marker="synthetic-search-focus-unique";
    const doc=await createDocument(deputy,{clientRequestId:request(),title:"מסמך לבדיקה",folderId:"orders",body:"a".repeat(400)+marker});
    const point=await createRhythmItem(deputy,{clientRequestId:request(),title:marker,category:"point"});
    const secret=await createRhythmItem(companyA,{clientRequestId:request(),title:marker+" private"});
    const found=await searchWorkspace(deputy,marker);
    expect(found.results.map(r=>r.id)).toContain(doc.id);expect(found.results.map(r=>r.id)).toContain(point.id);
    expect(found.results.map(r=>r.id)).not.toContain(secret.id);
    expect(found.results.find(r=>r.id===doc.id)?.href).toContain("entry=");
    expect(found.results.find(r=>r.id===point.id)?.href).toContain("tab=points");
    expect(JSON.stringify(found)).not.toContain("contentBase64");
    await expect(searchWorkspace({...deputy,organizationId:"other-org"},marker)).rejects.toThrow();
  });
});

it('replays uncertain offline completion and item edits idempotently',async()=>{
  const item=await createRhythmItem(deputy,input());
  const data=await getRhythm(deputy,today.slice(0,7));
  const occurrence=data.occurrences.find(row=>row.itemId===item.id)!;
  const report={version:occurrence.version,done:true,clientRequestId:randomUUID()};
  const first=await completeRhythm(deputy,occurrence.id,report);
  const replay=await completeRhythm(deputy,occurrence.id,report);
  expect(replay.version).toBe(first.version);expect(replay.undoToken).toBe(first.undoToken);
  const edit={version:item.version,title:'עריכה לאחר ניתוק',clientRequestId:randomUUID()};
  const edited=await editRhythmItem(deputy,item.id,edit);
  const repeated=await editRhythmItem(deputy,item.id,edit);
  expect(repeated.version).toBe(edited.version);
});
