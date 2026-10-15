import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import * as s from "./schema";
import { type Principal } from "./policy";
import { getWorkspace } from "./service";
import { getRhythm } from "./rhythm";
import { getDocuments } from "./documents";
import { documentFolders } from "../lib/document-folders";
import { isPersonalItem } from "../lib/unit-roles";
export async function searchWorkspace(p: Principal, query: unknown) {
  const q = z.string().trim().min(1).max(200).parse(query).toLowerCase();
  const [workspace, rhythm, documents] = await Promise.all([getWorkspace(p), getRhythm(p), getDocuments(p)]);
  const matches = (value: string) => value.toLowerCase().includes(q);
  const db = await getDb();
  const bodyMatches = p.role === "admin" ? [] : await db.select({
    id: s.documentEntries.id
  }).from(s.documentEntries).where(and(eq(s.documentEntries.organizationId, p.organizationId), eq(s.documentEntries.archived, false), sql`position(${q} in lower(${s.documentEntries.body})) > 0`));
  const ids = new Set(bodyMatches.map(row => row.id));
  const results = [...workspace.tasks.filter(t => matches(`${t.title} ${t.description}`)).map(t => ({
    id: t.id,
    title: t.title,
    kind: "משימה",
    href: `/?view=tasks&task=${encodeURIComponent(t.id)}`
  })), ...rhythm.items.filter(t => !t.archived && matches(`${t.title} ${t.description}`)).map(t => {
    const row = rhythm.occurrences.find(r => r.itemId === t.id);
    return {
      id: t.id,
      title: t.title,
      kind: t.category === "point" ? "נקודה לעיסוק" : "משימה",
      href: `/?view=${isPersonalItem(t, p.userId) ? "personal" : "tasks"}&rhythmFilter=all${t.category === "point" ? "&tab=points" : ""}${row ? `&occurrence=${encodeURIComponent(row.id)}` : ""}`
    };
  }), ...documents.entries.filter(t => ids.has(t.id) || matches(`${t.title} ${t.preview} ${t.attachments.map(f => f.filename).join(" ")}`)).map(t => {
    const folder = documentFolders.find(f => f.id === t.folderId);
    return {
      id: t.id,
      title: t.title,
      kind: folder?.section === "records" ? "סיכום" : "מסמך",
      href: `/?view=${folder?.section === "records" ? "records" : "library"}&entry=${encodeURIComponent(t.id)}`
    };
  })];
  return {
    results: results.slice(0, 100),
    total: results.length
  };
}
