import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db";
import { seedDemo } from "../src/server/seed";
import { principalFor } from "../src/server/service";
import {
  createDocument,
  getDocuments,
  getDocument,
  updateDocument,
  downloadDocument,
} from "../src/server/documents";
import { getRhythm, createRhythmItem } from "../src/server/rhythm";
import { unitRoles, isPersonalItem } from "../src/lib/unit-roles";
import { documentFolders, descendants } from "../src/lib/document-folders";
import * as s from "../src/server/schema";
import { localDate, type Principal } from "../src/server/policy";
let deputy: Principal, contributor: Principal, viewer: Principal;
const input = (extra: object = {}) => ({
  clientRequestId: randomUUID(),
  folderId: "meeting-safety",
  title: "סיכום ישיבת בדיקה",
  body: "טקסט סינתטי לבדיקה בלבד",
  ...extra,
});
beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  process.env.PGLITE_DATA_DIR = "memory://";
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET =
    "isolated-test-secret-for-documents-123456789";
  process.env.DEMO_PASSWORD = "isolated-test-password-123456";
  process.env.DEMO_EMAIL = "demo@samgad.example";
  await seedDemo();
  const users = await (await getDb()).select().from(s.user);
  const p = (email: string) => {
    const user = users.find((user) => user.email === email)!;
    return principalFor(user.id, user.name);
  };
  deputy = await p("demo@samgad.example");
  contributor = await p("contributor@samgad.example");
  viewer = await p("viewer@samgad.example");
}, 60000);
afterAll(closeDb);
describe("library and summary documents", () => {
  it("provides exactly the requested folder hierarchy, without inventing a fifth meeting", () => {
    expect(
      documentFolders.filter((folder) => folder.parent === "meetings"),
    ).toHaveLength(4);
    expect(descendants("formats")).toEqual([
      "formats",
      "formats-meetings",
      "formats-general",
    ]);
    expect(
      documentFolders
        .filter((folder) => folder.parent === "inspections")
        .map((folder) => folder.name),
    ).toEqual(["ביקורת נשקייה", "ביקורת בונקר", "ביקורת כ״ס"]);
  });
  it("persists text and file bytes, returns metadata without content, and rejects another tenant", async () => {
    const bytes = Buffer.from("%PDF-1.4\nSynthetic document bytes");
    const entry = await createDocument(
      deputy,
      input({
        attachments: [
          { filename: "סיכום.pdf", contentBase64: bytes.toString("base64") },
        ],
      }),
    );
    const detail = await getDocument(deputy, entry.id);
    expect(detail.body).toBe("טקסט סינתטי לבדיקה בלבד");
    expect(detail.attachments).toHaveLength(1);
    expect(detail.attachments[0]).not.toHaveProperty("contentBase64");
    expect(
      (await downloadDocument(viewer, detail.attachments[0].id)).bytes.equals(
        bytes,
      ),
    ).toBe(true);
    const alien = { ...deputy, organizationId: "unrelated-organization" };
    expect((await getDocuments(alien)).entries).toHaveLength(0);
    await expect(getDocument(alien, entry.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      downloadDocument(alien, detail.attachments[0].id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getDocument({ ...deputy, role: "admin" }, entry.id),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("supports text-only and file-only summaries; deduplicates create retries and protects edits", async () => {
    const body = input({
      folderId: "inspection-armory",
      body: "",
      attachments: [
        {
          filename: "סיכום.txt",
          contentBase64: Buffer.from("synthetic").toString("base64"),
        },
      ],
    });
    const first = await createDocument(contributor, body),
      retry = await createDocument(contributor, body);
    expect(first.id).toBe(retry.id);
    await expect(
      createDocument(contributor, { ...body, title: "שינוי תוכן" }),
    ).rejects.toMatchObject({ status: 409 });
    const edited = await updateDocument(contributor, first.id, {
      title: "סיכום מעודכן",
      folderId: "inspection-bunker",
      body: "המשך סינתטי",
      version: 1,
    });
    expect((await getDocument(contributor, edited.id)).folderId).toBe(
      "inspection-bunker",
    );
    await expect(
      updateDocument(contributor, first.id, {
        title: "ישן",
        folderId: "inspection-bunker",
        body: "תוכן",
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(createDocument(viewer, input())).rejects.toMatchObject({
      status: 403,
    });
    const privateEdit = await createDocument(deputy, input());
    await expect(
      updateDocument(contributor, privateEdit.id, {
        title: "עריכה",
        folderId: "meeting-safety",
        body: "תוכן",
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects unknown folders, empty documents, unsafe filenames and oversized/invalid file bodies", async () => {
    await expect(
      createDocument(deputy, input({ folderId: "invented-folder" })),
    ).rejects.toThrow();
    await expect(createDocument(deputy, input({ body: "" }))).rejects.toThrow();
    await expect(
      createDocument(
        deputy,
        input({
          attachments: [
            {
              filename: "unsafe.html",
              contentBase64: Buffer.from("synthetic").toString("base64"),
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      createDocument(
        deputy,
        input({
          attachments: [{ filename: "../file.pdf", contentBase64: "YWJjZA==" }],
        }),
      ),
    ).rejects.toThrow();
    await expect(
      createDocument(
        deputy,
        input({
          attachments: [{ filename: "file.pdf", contentBase64: "!!!!" }],
        }),
      ),
    ).rejects.toThrow();
  });
});
describe("canonical role groups and category split", () => {
  it("initializes the nine roles idempotently, uses position labels and resolves the deputies group", async () => {
    await getRhythm(deputy);
    const data = await getRhythm(deputy);
    expect(data.groups.map((group) => group.name)).toEqual(
      expect.arrayContaining(unitRoles.map((role) => role.title)),
    );
    expect(
      data.groups.filter((group) => group.id.startsWith("role:")),
    ).toHaveLength(9);
    expect(data.people.map((person) => person.name)).not.toEqual(
      expect.arrayContaining(["נועה כהן", "איתי לוי"]),
    );
    const group = data.groups.find((group) => group.name === "סמ״פים (קבוצה)")!;
    const assigned = await createRhythmItem(deputy, {
      clientRequestId: randomUUID(),
      title: "משימת סמ״פים",
      frequency: "once",
      startDate: localDate(),
      groupIds: [group.id],
    });
    expect(assigned.assigneeIds).toHaveLength(6);
    expect(isPersonalItem(assigned, deputy.userId)).toBe(false);
    const personal = await createRhythmItem(deputy, {
      clientRequestId: randomUUID(),
      title: "משימה אישית",
      frequency: "once",
      startDate: localDate(),
    });
    expect(isPersonalItem(personal, deputy.userId)).toBe(true);
  });
  it("does not silently turn an unconfigured role into a private assignment", async () => {
    const data = await getRhythm(deputy);
    const group = data.groups.find((group) => group.name === "סמ״פ ג׳")!;
    await (await getDb())
      .update(s.rhythmGroups)
      .set({ emails: [] })
      .where(eq(s.rhythmGroups.id, group.id));
    await expect(
      createRhythmItem(deputy, {
        clientRequestId: randomUUID(),
        title: "שיוך לא מוגדר",
        frequency: "once",
        startDate: localDate(),
        groupIds: [group.id],
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
