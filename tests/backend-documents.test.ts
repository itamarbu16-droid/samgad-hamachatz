import {grantAccess} from "../src/server/access";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db";
import { seedDemo } from "../src/server/seed";
import { principalFor } from "../src/server/service";
import {
  createDocument,
  createDocumentFolder, duplicateDocument, manageTrackers, getTrackerTrash,
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
  for(const user of users.filter(u=>u.email!=="demo@samgad.example")) await grantAccess(deputy,{email:user.email,level:user.email==="viewer@samgad.example"?"view":"own"});
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
  it("initializes the requested roles idempotently, uses position labels and resolves the deputies group", async () => {
    await getRhythm(deputy);
    const data = await getRhythm(deputy);
    expect(data.groups.map((group) => group.name)).toEqual(
      expect.arrayContaining(unitRoles.map((role) => role.title)),
    );
    expect(
      data.groups.filter((group) => group.id.startsWith("role:")),
    ).toHaveLength(unitRoles.length);
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
    expect(assigned.assigneeIds).toHaveLength(5);
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
    const group = data.groups.find((group) => group.name === "סמ״פ ה׳")!;
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

it("lets deputies fill shared 50-row tracking sheets and preserves names and marks", async () => {
  const rows = Array.from({length:50},()=>({} as Record<string,string>));
  const doc = await createDocument(deputy, input({folderId:"trackers",title:"מעקב פלוגות",body:JSON.stringify({kind:"tracking-table-v1",columns:[],rows})}));
  rows[0] = {"company-a":"שם לבדיקה","company-a:status":"v"};
  rows[49] = {"company-support":"שם נוסף","company-support:status":"x"};
  await updateDocument(contributor,doc.id,{folderId:"trackers",title:"מעקב פלוגות",version:1,body:JSON.stringify({kind:"tracking-table-v1",columns:[],rows})});
  const saved = await getDocument(deputy,doc.id);
  const body = JSON.parse(saved.body);
  expect(body.rows).toHaveLength(50);
  expect(body.rows[0]["company-a:status"]).toBe("v");
  expect(body.rows[49]["company-support:status"]).toBe("x");
  await expect(updateDocument(viewer,doc.id,{folderId:"trackers",title:"מעקב פלוגות",version:2,body:"blocked"})).rejects.toMatchObject({status:403});
  await expect(updateDocument(contributor,doc.id,{folderId:"trackers",title:"שינוי שם אסור",version:2,body:"blocked"})).rejects.toMatchObject({status:403});
});

it('stores scanned and Excel files in trackers and preserves library file permissions',async()=>{
 const bytes=Buffer.from('isolated attachment test');
 const doc=await createDocument(deputy,input({folderId:'trackers',title:'קבצים למעקב',body:'',attachments:[
  {filename:'סריקה.pdf',contentBase64:bytes.toString('base64')},
  {filename:'טבלת-מעקב.xlsx',contentBase64:bytes.toString('base64')},
 ]}));
 const saved=await getDocument(contributor,doc.id);
 expect(saved.folderId).toBe('trackers');expect(saved.attachments).toHaveLength(2);
 for(const file of saved.attachments)expect((await downloadDocument(contributor,file.id)).bytes.equals(bytes)).toBe(true);
 await expect(updateDocument(contributor,doc.id,{folderId:'trackers',title:saved.title,version:1,body:'unauthorized edit'})).rejects.toMatchObject({status:403});
 await updateDocument(deputy,doc.id,{folderId:'trackers',title:saved.title,version:1,body:'תיאור נוסף'});
 expect((await getDocument(deputy,doc.id)).attachments).toHaveLength(2);
 await expect(createDocument(viewer,input({folderId:'trackers',attachments:[{filename:'blocked.pdf',contentBase64:bytes.toString('base64')}]}))).rejects.toMatchObject({status:403});
});

it('duplicates weekly trackers into nested folders, keeps names, optionally resets marks and protects the source',async()=>{
 const folder=await createDocumentFolder(deputy,{name:'מעקבים שבועיים',parent:'trackers',section:'library',clientRequestId:randomUUID()});
 const nested=await createDocumentFolder(deputy,{name:'שעות בטיחות',parent:folder.id,section:'library',clientRequestId:randomUUID()});
 const body=JSON.stringify({kind:'tracking-table-v1',columns:[{id:'company-a',name:'א׳',type:'text'}],rows:[{'company-a':'שם לבדיקה','company-a:status':'v'},{'company-a':'שם נוסף','company-a:status':'x'}]});
 const source=await createDocument(deputy,input({folderId:nested.id,title:'שבוע 43',body}));
 const request={title:'שבוע 44',folderId:folder.id,resetStatuses:true,clientRequestId:randomUUID()};
 const copy=await duplicateDocument(contributor,source.id,request);
 expect((await duplicateDocument(contributor,source.id,request)).id).toBe(copy.id);
 const saved=await getDocument(deputy,copy.id);expect(saved.title).toBe('שבוע 44');expect(saved.folderId).toBe(folder.id);
 expect(JSON.parse(saved.body).rows).toEqual([{'company-a':'שם לבדיקה','company-a:status':''},{'company-a':'שם נוסף','company-a:status':''}]);
 expect((await getDocument(deputy,source.id)).body).toBe(body);
 await updateDocument(contributor,source.id,{folderId:nested.id,title:'שבוע 43',body,version:1});
 const keep=await duplicateDocument(deputy,source.id,{...request,resetStatuses:false,clientRequestId:randomUUID()});
 expect((await getDocument(deputy,keep.id)).body).toBe(body);
 await expect(duplicateDocument(viewer,source.id,{...request,clientRequestId:randomUUID()})).rejects.toMatchObject({status:403});
 await expect(duplicateDocument({...deputy,organizationId:'unrelated'},source.id,{...request,folderId:'trackers',clientRequestId:randomUUID()})).rejects.toMatchObject({status:404});
});
it('duplicates attached files without changing their bytes or the original',async()=>{
 const bytes=Buffer.from('synthetic scan');
 const source=await createDocument(deputy,input({folderId:'trackers',title:'סריקה שבוע 43',body:'',attachments:[{filename:'scan.pdf',contentBase64:bytes.toString('base64')}]}));
 const copy=await duplicateDocument(deputy,source.id,{title:'סריקה שבוע 44',folderId:'trackers',clientRequestId:randomUUID()});
 const detail=await getDocument(deputy,copy.id),original=await getDocument(deputy,source.id);
 expect(detail.attachments[0].id).not.toBe(original.attachments[0].id);
 expect((await downloadDocument(deputy,detail.attachments[0].id)).bytes.equals(bytes)).toBe(true);
});

it('moves a tracker without duplicating it and supports trash and restore with unchanged file bytes',async()=>{
 const folder=await createDocumentFolder(deputy,{name:'בטיחות בדרכים',parent:'trackers',section:'library',clientRequestId:randomUUID()});
 const bytes=Buffer.from('synthetic road safety scan');
 const doc=await createDocument(deputy,input({folderId:'trackers',title:'מעקב רכב',body:'שמות וסימונים',attachments:[{filename:'scan.pdf',contentBase64:bytes.toString('base64')}]}));
 const file=(await getDocument(deputy,doc.id)).attachments[0];
 await manageTrackers(deputy,{action:'move',folderId:folder.id,items:[{id:doc.id,version:1}]});
 const moved=await getDocument(deputy,doc.id);expect(moved.folderId).toBe(folder.id);expect(moved.body).toBe('שמות וסימונים');expect(moved.attachments[0].id).toBe(file.id);
 expect((await getDocuments(deputy)).entries.filter(e=>e.id===doc.id)).toHaveLength(1);
 await expect(manageTrackers(deputy,{action:'trash',items:[{id:doc.id,version:1}]})).rejects.toMatchObject({status:409});
 await manageTrackers(deputy,{action:'trash',items:[{id:doc.id,version:2}]});
 expect((await getDocuments(deputy)).entries.some(e=>e.id===doc.id)).toBe(false);await expect(downloadDocument(deputy,file.id)).rejects.toMatchObject({status:404});
 expect((await getTrackerTrash(deputy)).some(e=>e.id===doc.id)).toBe(true);
 await manageTrackers(deputy,{action:'restore',items:[{id:doc.id,version:3}]});
 expect((await getDocument(deputy,doc.id)).folderId).toBe(folder.id);expect((await downloadDocument(deputy,file.id)).bytes.equals(bytes)).toBe(true);
});
it('rejects unauthorized moves and deletes, and rolls back a batch when any version conflicts',async()=>{
 const a=await createDocument(deputy,input({folderId:'trackers',title:'בדיקת רכב א'})),b=await createDocument(deputy,input({folderId:'trackers',title:'בדיקת רכב ב'}));
 await expect(manageTrackers(contributor,{action:'trash',items:[{id:a.id,version:1}]})).rejects.toMatchObject({status:403});
 await expect(manageTrackers(viewer,{action:'move',folderId:'trackers',items:[{id:a.id,version:1}]})).rejects.toMatchObject({status:403});
 await expect(manageTrackers({...deputy,organizationId:'another'}, {action:'trash',items:[{id:a.id,version:1}]})).rejects.toMatchObject({status:404});
 await expect(manageTrackers(deputy,{action:'move',folderId:'orders',items:[{id:a.id,version:1}]})).rejects.toMatchObject({status:422});
 await expect(manageTrackers(deputy,{action:'trash',items:[{id:a.id,version:1},{id:b.id,version:9}]})).rejects.toMatchObject({status:409});
 expect((await getDocument(deputy,a.id)).version).toBe(1);
});
