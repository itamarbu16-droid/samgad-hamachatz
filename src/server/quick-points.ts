import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, type Database } from './db';
import { AppError, canEditAll, type Principal } from './policy';
import { principalFor } from './service';
import { createRhythmItem } from './rhythm';
import { quickPointKeys } from './schema';

const initialized = new WeakMap<Database, Promise<void>>();
async function ensureSchema() {
  const db = await getDb();
  let pending = initialized.get(db);
  if (!pending) {
    pending = db.execute(sql`CREATE TABLE IF NOT EXISTS quick_point_keys (
      user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
      organization_id text NOT NULL REFERENCES organizations(id), token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz, window_started_at timestamptz NOT NULL DEFAULT now(),
      window_count integer NOT NULL DEFAULT 0
    )`).then(() => undefined);
    initialized.set(db, pending);
  }
  try { await pending; } catch (error) { initialized.delete(db); throw error; }
  return db;
}
function assertOwner(p: Principal) {
  if (!canEditAll(p) || p.workspaceOwnerId !== p.userId)
    throw new AppError(403, 'הגדרת קיצור הדרך זמינה לבעל המרחב בלבד');
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function quickPointStatus(p: Principal) {
  assertOwner(p);
  const db = await ensureSchema();
  const [key] = await db.select({ expiresAt: quickPointKeys.expiresAt, lastUsedAt: quickPointKeys.lastUsedAt })
    .from(quickPointKeys).where(and(eq(quickPointKeys.userId, p.userId), eq(quickPointKeys.organizationId, p.organizationId)));
  return { active: Boolean(key && key.expiresAt.getTime() > Date.now()), expiresAt: key?.expiresAt ?? null, lastUsedAt: key?.lastUsedAt ?? null };
}
export async function createQuickPointKey(p: Principal, input: unknown) {
  assertOwner(p);
  z.object({ consent: z.literal(true) }).strict().parse(input);
  const db = await ensureSchema();
  const token = `qp_${randomBytes(32).toString('base64url')}`;
  const now = new Date(), expiresAt = new Date(now.getTime() + 90 * 86400000);
  await db.insert(quickPointKeys).values({ userId: p.userId, organizationId: p.organizationId,
    tokenHash: hash(token), createdAt: now, expiresAt, windowStartedAt: now, windowCount: 0 })
    .onConflictDoUpdate({ target: quickPointKeys.userId, set: { organizationId: p.organizationId,
      tokenHash: hash(token), createdAt: now, expiresAt, lastUsedAt: null, windowStartedAt: now, windowCount: 0 } });
  // Returned once to this authenticated setup page. Never log or save plaintext.
  return { token, expiresAt };
}
export async function revokeQuickPointKey(p: Principal) {
  assertOwner(p);
  const db = await ensureSchema();
  await db.delete(quickPointKeys).where(and(eq(quickPointKeys.userId, p.userId), eq(quickPointKeys.organizationId, p.organizationId)));
  return { revoked: true };
}
export const quickPointInput = z.object({
  text: z.string().trim().min(2).max(5000),
  clientRequestId: z.string().regex(/^[A-Za-z0-9:_-]{8,120}$/),
}).strict();
export async function captureQuickPoint(token: string, input: unknown) {
  if (!/^qp_[A-Za-z0-9_-]{43}$/.test(token)) throw new AppError(401, 'קיצור הדרך אינו מורשה. יש להגדיר אותו מחדש באפליקציה');
  const data = quickPointInput.parse(input);
  const db = await ensureSchema(), now = new Date();
  const [key] = await db.select().from(quickPointKeys).where(and(eq(quickPointKeys.tokenHash, hash(token)), gt(quickPointKeys.expiresAt, now)));
  if (!key) throw new AppError(401, 'קיצור הדרך פג או בוטל. יש להגדיר אותו מחדש באפליקציה');
  const p = await principalFor(key.userId, 'קיצור דרך');
  assertOwner(p);
  if (p.organizationId !== key.organizationId) throw new AppError(403, 'ההרשאה למרחב השתנתה');
  // Atomic sliding window. A token can add at most 30 points per minute.
  const accepted = await db.update(quickPointKeys).set({
    windowCount: sql`CASE WHEN ${quickPointKeys.windowStartedAt} < ${new Date(now.getTime() - 60000)} THEN 1 ELSE ${quickPointKeys.windowCount} + 1 END`,
    windowStartedAt: sql`CASE WHEN ${quickPointKeys.windowStartedAt} < ${new Date(now.getTime() - 60000)} THEN ${now} ELSE ${quickPointKeys.windowStartedAt} END`,
  }).where(and(eq(quickPointKeys.tokenHash, hash(token)), gt(quickPointKeys.expiresAt, now),
    sql`(${quickPointKeys.windowStartedAt} < ${new Date(now.getTime() - 60000)} OR ${quickPointKeys.windowCount} < 30)`)).returning({ userId: quickPointKeys.userId });
  if (!accepted.length) throw new AppError(429, 'יותר מדי בקשות. יש להמתין דקה ולנסות שוב');
  // No target, category, assignee, priority or schedule accepted from the caller.
  const title = data.text.split('\n')[0].slice(0, 160).trim();
  const digest = hash(`${key.tokenHash}:${data.clientRequestId}`);
  const requestId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const item = await createRhythmItem(p, { clientRequestId: requestId,
    title: title.length >= 2 ? title : data.text.slice(0, 160), description: data.text === title ? '' : data.text,
    category: 'point', personal: true, frequency: 'once', hasDeadline: false,
    emails: [], groupIds: [], recipientIds: [], completionMode: 'individual' });
  await db.update(quickPointKeys).set({ lastUsedAt: now }).where(eq(quickPointKeys.tokenHash, hash(token)));
  return { saved: true, id: item.id, message: 'הנקודה נשמרה בנקודות לעיסוק' };
}
