import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { getDb } from "./db";
import * as s from "./schema";
import { AppError, assertWrite, isManager, type Principal } from "./policy";
import {
  documentFolders,
  documentExtensions,
  MAX_DOCUMENT_BYTES,
} from "../lib/document-folders";

const attachmentInput = z
  .object({
    filename: z
      .string()
      .min(1)
      .max(200)
      .refine(
        (name) =>
          [...name].every(
            (character) =>
              character.charCodeAt(0) >= 32 &&
              character.charCodeAt(0) !== 127 &&
              character !== "\\" &&
              character !== "/",
          ),
        "שם הקובץ אינו תקין",
      ),
    contentBase64: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      ),
  })
  .strict();
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
  folderId: z
    .string()
    .refine(
      (value) => documentFolders.some((folder) => folder.id === value),
      "התיקייה אינה קיימת",
    ),
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
function scope(p: Principal) {
  return and(
    eq(s.documentEntries.organizationId, p.organizationId),
    p.role === "admin" ? sql`false` : undefined,
  );
}
function decodeFiles(attachments: z.infer<typeof attachmentInput>[]) {
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
  if (files.reduce((sum, file) => sum + file.byteSize, 0) > MAX_DOCUMENT_BYTES)
    throw new AppError(413, "אפשר להעלות עד 3 מ״ב בסך הכול בכל שמירה");
  return files;
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
    folders: documentFolders,
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
  const files = decodeFiles(attachments);
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
    if (files.length)
      await tx.insert(s.documentAttachments).values(
        files.map((file) => ({
          ...file,
          id: randomUUID(),
          entryId: entry.id,
        })),
      );
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
  const files = decodeFiles(data.attachments);
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
    if (before.creatorId !== p.userId && !isManager(p))
      throw new AppError(403, "רק יוצר המסמך או מנהל יכולים לערוך אותו");
    const existingFiles = await tx
      .select({ id: s.documentAttachments.id })
      .from(s.documentAttachments)
      .where(eq(s.documentAttachments.entryId, id));
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
