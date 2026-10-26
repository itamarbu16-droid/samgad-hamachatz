import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { getDb } from "./db";
import * as s from "./schema";
import { AppError, assertWrite, isManager,canEditAll, type Principal } from "./policy";
import {
  documentFolders,
  documentExtensions,
  MAX_DOCUMENT_BYTES, MAX_DOCUMENT_TOTAL_BYTES, INLINE_DOCUMENT_BYTES,
} from "../lib/document-folders";

import {documentFilename,resolveDocumentUpload} from "./document-uploads";
const inlineAttachmentInput = z
  .object({
    filename: documentFilename,
    contentBase64: z
      .string()
      .min(4)
      .max(Math.ceil(INLINE_DOCUMENT_BYTES / 3) * 4)
      .regex(
        /^[A-Za-z0-9+/]*={0,2}$/,
      ),
  })
  .strict();
const attachmentInput=z.union([inlineAttachmentInput,z.object({uploadId:z.string().uuid()}).strict()]);
const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T12:00:00Z");
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  })
  .nullable();
const fields = {
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().max(100000).default(""),
  folderId: z.string().min(1).max(160),
  documentDate: dateInput.default(null),
  attachments: z.array(attachmentInput).max(5).default([]),
};
const createInput = z
  .object({ ...fields, clientRequestId: z.string().uuid() })
  .strict()
  .refine(
    (value) => value.body.length > 0 || value.attachments.length > 0,
    "יש להוסיף טקסט או קובץ",
  );
function isTrackingTable(body:string) {
  try {const value=JSON.parse(body);return value?.kind==='tracking-table-v1'&&Array.isArray(value.columns)&&Array.isArray(value.rows);}
  catch {return false;}
}
function scope(p: Principal) {
  return and(
    eq(s.documentEntries.organizationId, p.organizationId),
    p.role === "admin" ? sql`false` : undefined,
  );
}
function decodeFiles(attachments: z.infer<typeof inlineAttachmentInput>[]) {
  const files = attachments.map((file) => {
    const extension = file.filename
      .split(".")
      .at(-1)
      ?.toLowerCase() as keyof typeof documentExtensions;
    const contentType = documentExtensions[extension];
    if (!contentType)
      throw new AppError(
        422,
        "סוג הקובץ אינו נתמך. ניתן להוסיף PDF, מסמכי Office, טקסט ותמונות",
      );
    const bytes = Buffer.from(file.contentBase64, "base64");
    if (
      !bytes.length ||
      bytes.length > MAX_DOCUMENT_BYTES ||
      bytes.toString("base64") !== file.contentBase64
    )
      throw new AppError(422, "הקובץ אינו תקין או גדול מהמותר");
    return { ...file, contentType, byteSize: bytes.length };
  });
  if (files.reduce((sum, file) => sum + file.byteSize, 0) > INLINE_DOCUMENT_BYTES)
    throw new AppError(413, "יש להעלות קבצים גדולים בחלקים");
  return files;
}
async function resolveFiles(tx:Pick<Awaited<ReturnType<typeof getDb>>,'select'|'update'|'insert'|'delete'>,p:Principal,attachments:z.infer<typeof attachmentInput>[],entryId:string){
 const inline=attachments.filter((f):f is z.infer<typeof inlineAttachmentInput>=>'filename' in f);
 const decoded=decodeFiles(inline);let next=0;
 const files=[];
 for(const attachment of attachments)files.push('uploadId' in attachment?await resolveDocumentUpload(tx,p,attachment.uploadId,entryId):decoded[next++]);
 if(files.reduce((n,f)=>n+f.byteSize,0)>MAX_DOCUMENT_TOTAL_BYTES)throw new AppError(413,'אפשר להעלות עד 100 מ״ב בכל שמירה');
 return files;
}
async function clearUploads(tx:Pick<Awaited<ReturnType<typeof getDb>>,'delete'>,p:Principal,attachments:z.infer<typeof attachmentInput>[]){
 const ids=attachments.flatMap(f=>'uploadId' in f?[f.uploadId]:[]);
 if(ids.length)await tx.delete(s.documentUploads).where(and(inArray(s.documentUploads.id,ids),eq(s.documentUploads.creatorId,p.userId),eq(s.documentUploads.organizationId,p.organizationId)));
}
const attachmentMetadata = {
  id: s.documentAttachments.id,
  entryId: s.documentAttachments.entryId,
  filename: s.documentAttachments.filename,
  contentType: s.documentAttachments.contentType,
  byteSize: s.documentAttachments.byteSize,
};
export async function getDocuments(p: Principal) {
  const db = await getDb();
  const entries = await db
    .select({
      id: s.documentEntries.id,
      folderId: s.documentEntries.folderId,
      title: s.documentEntries.title,
      preview: sql<string>`substring(${s.documentEntries.body}, 1, 240)`,
      documentDate: s.documentEntries.documentDate,
      creatorId: s.documentEntries.creatorId,
      version: s.documentEntries.version,
      updatedAt: s.documentEntries.updatedAt,
    })
    .from(s.documentEntries)
    .where(and(scope(p), eq(s.documentEntries.archived, false)))
    .orderBy(desc(s.documentEntries.updatedAt));
  const attachments = entries.length
    ? await db
        .select(attachmentMetadata)
        .from(s.documentAttachments)
        .where(
          inArray(
            s.documentAttachments.entryId,
            entries.map((entry) => entry.id),
          ),
        )
    : [];
  return {
    folders: await getDocumentFolders(p),
    entries: entries.map((entry) => ({
      ...entry,
      attachments: attachments.filter((file) => file.entryId === entry.id),
    })),
  };
}
export async function getDocument(p: Principal, id: string) {
  const db = await getDb();
  const [entry] = await db
    .select()
    .from(s.documentEntries)
    .where(
      and(
        scope(p),
        eq(s.documentEntries.id, id),
        eq(s.documentEntries.archived, false),
      ),
    );
  if (!entry) throw new AppError(404, "המסמך אינו זמין לך");
  const attachments = await db
    .select(attachmentMetadata)
    .from(s.documentAttachments)
    .where(eq(s.documentAttachments.entryId, id));
  return { ...entry, attachments };
}
export async function createDocument(p: Principal, input: unknown) {
  assertWrite(p);
  const { clientRequestId, attachments, ...data } = createInput.parse(input);
  await assertDocumentFolder(p,data.folderId);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const key = `${p.organizationId}:${p.userId}:document:${clientRequestId}`;
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ ...data, attachments }))
      .digest("hex");
    const receipt = await tx
      .insert(s.mutationReceipts)
      .values({ key, fingerprint })
      .onConflictDoNothing()
      .returning();
    if (!receipt.length) {
      const [previous] = await tx
        .select()
        .from(s.mutationReceipts)
        .where(eq(s.mutationReceipts.key, key));
      if (previous.fingerprint !== fingerprint)
        throw new AppError(409, "מזהה הבקשה כבר שימש למסמך אחר");
      const result = previous.result as { id: string };
      const [visible] = await tx
        .select({ id: s.documentEntries.id })
        .from(s.documentEntries)
        .where(
          and(
            scope(p),
            eq(s.documentEntries.id, result.id),
            eq(s.documentEntries.archived, false),
          ),
        );
      if (!visible) throw new AppError(404, "המסמך אינו זמין לך");
      await clearUploads(tx,p,attachments);
      return result;
    }
    const [entry] = await tx
      .insert(s.documentEntries)
      .values({
        ...data,
        id: randomUUID(),
        organizationId: p.organizationId,
        creatorId: p.userId,
      })
      .returning({ id: s.documentEntries.id });
    const files=await resolveFiles(tx,p,attachments,entry.id);
    if (files.length)
      await tx.insert(s.documentAttachments).values(
        files.map((file) => ({
          ...file,
          id: randomUUID(),
          entryId: entry.id,
        })),
      );
    await clearUploads(tx,p,attachments);
    await tx
      .update(s.mutationReceipts)
      .set({ result: entry })
      .where(eq(s.mutationReceipts.key, key));
    return entry;
  });
}
export async function updateDocument(p: Principal, id: string, input: unknown) {
  assertWrite(p);
  const data = z
    .object({
      ...fields,
      version: z.number().int().positive(),
      archived: z.boolean().optional(),
    })
    .strict()
    .parse(input);
  await assertDocumentFolder(p,data.folderId);
  const trackingFolder = await isTrackingFolder(p,data.folderId);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(s.documentEntries)
      .where(
        and(
          scope(p),
          eq(s.documentEntries.id, id),
          eq(s.documentEntries.archived, false),
        ),
      );
    if (!before) throw new AppError(404, "המסמך אינו זמין לך");
    if (before.creatorId !== p.userId && !isManager(p) && !(trackingFolder && before.folderId === data.folderId && !data.archived && data.title === before.title && isTrackingTable(before.body) && isTrackingTable(data.body)))
      throw new AppError(403, "רק יוצר המסמך או מנהל יכולים לערוך אותו");
    const existingFiles = await tx
      .select({ id: s.documentAttachments.id })
      .from(s.documentAttachments)
      .where(eq(s.documentAttachments.entryId, id));
    const files=await resolveFiles(tx,p,data.attachments,id);
    if (!data.archived && !data.body && !files.length && !existingFiles.length)
      throw new AppError(422, "יש להשאיר טקסט או קובץ במסמך");
    const { version, attachments: _attachments, ...changes } = data;
    void _attachments;
    const [entry] = await tx
      .update(s.documentEntries)
      .set({ ...changes, version: version + 1, updatedAt: new Date() })
      .where(
        and(
          scope(p),
          eq(s.documentEntries.id, id),
          eq(s.documentEntries.version, version),
        ),
      )
      .returning({ id: s.documentEntries.id });
    if (!entry) throw new AppError(409, "המסמך השתנה. יש לרענן ולנסות שוב");
    if (files.length)
      await tx
        .insert(s.documentAttachments)
        .values(
          files.map((file) => ({ ...file, id: randomUUID(), entryId: id })),
        );
    await clearUploads(tx,p,data.attachments);
    return entry;
  });
}
export async function downloadDocument(p: Principal, attachmentId: string) {
  const db = await getDb();
  const [file] = await db
    .select({
      filename: s.documentAttachments.filename,
      contentType: s.documentAttachments.contentType,
      contentBase64: s.documentAttachments.contentBase64,
    })
    .from(s.documentAttachments)
    .innerJoin(
      s.documentEntries,
      eq(s.documentEntries.id, s.documentAttachments.entryId),
    )
    .where(
      and(
        scope(p),
        eq(s.documentEntries.archived, false),
        eq(s.documentAttachments.id, attachmentId),
      ),
    );
  if (!file) throw new AppError(404, "הקובץ אינו זמין לך");
  return { ...file, bytes: Buffer.from(file.contentBase64, "base64") };
}

export async function getDocumentFolders(p:Principal){
 const custom=await (await getDb()).select().from(s.customDocumentFolders).where(eq(s.customDocumentFolders.organizationId,p.organizationId));
 return [...documentFolders,...custom.map(({id,name,parent,section})=>({id,name,parent,section}))];
}
async function assertDocumentFolder(p:Principal,id:string){if(!(await getDocumentFolders(p)).some(f=>f.id===id))throw new AppError(422,'התיקייה אינה קיימת');}
export async function createDocumentFolder(p:Principal,input:unknown){
 if(!canEditAll(p))throw new AppError(403,'יצירת תיקייה דורשת הרשאת מנהל');
 const data=z.object({name:z.string().trim().min(1).max(120),parent:z.string().max(160).nullable().default(null),section:z.enum(['library','records']),clientRequestId:z.string().uuid()}).strict().parse(input);
 const folders=await getDocumentFolders(p);
 if(data.parent&&!folders.some(f=>f.id===data.parent&&f.section===data.section))throw new AppError(422,'תיקיית האב אינה קיימת במרחב שנבחר');
 const db=await getDb();const [existing]=await db.select().from(s.customDocumentFolders).where(and(eq(s.customDocumentFolders.organizationId,p.organizationId),eq(s.customDocumentFolders.clientRequestId,data.clientRequestId)));
 if(existing){if(existing.name!==data.name||existing.parent!==data.parent||existing.section!==data.section)throw new AppError(409,'מזהה הבקשה כבר שימש לתיקייה אחרת');return existing;}
 const [folder]=await db.insert(s.customDocumentFolders).values({...data,id:randomUUID(),organizationId:p.organizationId}).onConflictDoNothing().returning();
 if(!folder) return (await db.select().from(s.customDocumentFolders).where(and(eq(s.customDocumentFolders.organizationId,p.organizationId),eq(s.customDocumentFolders.clientRequestId,data.clientRequestId))))[0];
 return folder;
}

export async function isTrackingFolder(p:Principal,id:string){
 const folders=await getDocumentFolders(p);const visited=new Set<string>();
 let current:string|null=id;
 while(current&&!visited.has(current)){if(current==='trackers')return true;visited.add(current);current=folders.find(f=>f.id===current)?.parent??null;}
 return false;
}
export async function duplicateDocument(p:Principal,id:string,input:unknown){
 assertWrite(p);
 const data=z.object({title:z.string().trim().min(2).max(160),folderId:z.string().min(1).max(160),resetStatuses:z.boolean().default(true),clientRequestId:z.string().uuid()}).strict().parse(input);
 await assertDocumentFolder(p,data.folderId);
 if(!await isTrackingFolder(p,data.folderId))throw new AppError(422,'יש לבחור תיקייה במעקבים');
 const original=await getDocument(p,id);
 if(!await isTrackingFolder(p,original.folderId))throw new AppError(422,'ניתן לשכפל פריטים מתוך המעקבים');
 const db=await getDb();
 return db.transaction(async tx=>{
  const [source]=await tx.select().from(s.documentEntries).where(and(scope(p),eq(s.documentEntries.id,id),eq(s.documentEntries.archived,false)));
  if(!source)throw new AppError(404,'המסמך אינו זמין לך');
  if(source.folderId!==original.folderId)throw new AppError(409,'המסמך הועבר. יש לרענן ולנסות שוב');
  const key=`${p.organizationId}:${p.userId}:duplicate-document:${data.clientRequestId}`;
  const fingerprint=createHash('sha256').update(JSON.stringify({id,...data})).digest('hex');
  const receipt=await tx.insert(s.mutationReceipts).values({key,fingerprint}).onConflictDoNothing().returning();
  if(!receipt.length){const [previous]=await tx.select().from(s.mutationReceipts).where(eq(s.mutationReceipts.key,key));if(previous.fingerprint!==fingerprint)throw new AppError(409,'מזהה הבקשה כבר שימש להעתקה אחרת');return previous.result as {id:string};}
  let body=source.body;
  if(data.resetStatuses&&isTrackingTable(body)){
   const table=JSON.parse(body);
   table.rows=table.rows.map((row:Record<string,string>)=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,key.endsWith(':status')?'':value])));
   body=JSON.stringify(table);
  }
  const [entry]=await tx.insert(s.documentEntries).values({id:randomUUID(),organizationId:p.organizationId,creatorId:p.userId,folderId:data.folderId,title:data.title,body,documentDate:null}).returning({id:s.documentEntries.id});
  const files=await tx.select().from(s.documentAttachments).where(eq(s.documentAttachments.entryId,id));
  if(files.length)await tx.insert(s.documentAttachments).values(files.map(file=>({id:randomUUID(),entryId:entry.id,filename:file.filename,contentType:file.contentType,byteSize:file.byteSize,contentBase64:file.contentBase64})));
  await tx.update(s.mutationReceipts).set({result:entry}).where(eq(s.mutationReceipts.key,key));
  return entry;
 });
}

export async function getTrackerTrash(p:Principal){
 const folders=await getDocumentFolders(p);
 const trackingIds=new Set<string>(['trackers']);let changed=true;
 while(changed){changed=false;for(const f of folders)if(f.parent&&trackingIds.has(f.parent)&&!trackingIds.has(f.id)){trackingIds.add(f.id);changed=true;}}
 return (await (await getDb()).select({id:s.documentEntries.id,title:s.documentEntries.title,version:s.documentEntries.version,creatorId:s.documentEntries.creatorId,folderId:s.documentEntries.folderId}).from(s.documentEntries).where(and(scope(p),eq(s.documentEntries.archived,true),inArray(s.documentEntries.folderId,[...trackingIds])))).filter(row=>isManager(p)||row.creatorId===p.userId);
}
export async function manageTrackers(p:Principal,input:unknown){
 assertWrite(p);
 const data=z.object({action:z.enum(['move','trash','restore']),items:z.array(z.object({id:z.string().min(1),version:z.number().int().positive()}).strict()).min(1).max(100),folderId:z.string().min(1).max(160).optional()}).strict().parse(input);
 if(new Set(data.items.map(item=>item.id)).size!==data.items.length)throw new AppError(422,'פריט נבחר יותר מפעם אחת');
 if(data.action==='move'&&(!data.folderId||!await isTrackingFolder(p,data.folderId)))throw new AppError(422,'יש לבחור תיקייה במעקבים');
 const folders=await getDocumentFolders(p);const trackingIds=new Set<string>(['trackers']);let changed=true;
 while(changed){changed=false;for(const f of folders)if(f.parent&&trackingIds.has(f.parent)&&!trackingIds.has(f.id)){trackingIds.add(f.id);changed=true;}}
 const db=await getDb();
 return db.transaction(async tx=>{
  const rows=await tx.select({id:s.documentEntries.id,version:s.documentEntries.version,creatorId:s.documentEntries.creatorId,folderId:s.documentEntries.folderId,archived:s.documentEntries.archived}).from(s.documentEntries).where(and(scope(p),inArray(s.documentEntries.id,data.items.map(i=>i.id))));
  if(rows.length!==data.items.length)throw new AppError(404,'אחד המעקבים אינו זמין לך');
  const results=[];
  for(const item of data.items){
   const row=rows.find(row=>row.id===item.id)!;
   if(!trackingIds.has(row.folderId))throw new AppError(422,'הפעולה זמינה למעקבים בלבד');
   if(!isManager(p)&&row.creatorId!==p.userId)throw new AppError(403,'רק יוצר המעקב או מנהל רשאים להעביר ולמחוק אותו');
   if(row.version!==item.version||row.archived!==(data.action==='restore'))throw new AppError(409,'המעקב השתנה. יש לרענן ולנסות שוב');
   const [updated]=await tx.update(s.documentEntries).set({...(data.action==='move'?{folderId:data.folderId!}:{archived:data.action==='trash'}),version:row.version+1,updatedAt:new Date()}).where(and(scope(p),eq(s.documentEntries.id,row.id),eq(s.documentEntries.version,item.version),eq(s.documentEntries.archived,row.archived))).returning({id:s.documentEntries.id,version:s.documentEntries.version});
   if(!updated)throw new AppError(409,'המעקב השתנה. יש לרענן ולנסות שוב');
   results.push(updated);
  }
  return {items:results};
 });
}
