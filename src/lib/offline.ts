// Durable, account-scoped outbox. Authentication tokens never enter browser storage.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>; // API snapshots contain heterogeneous entity records.
export type Pending = { id: string; url: string; method: string; body: Row; title: string; error?: string };
type State = { user: Row; snapshots: Record<string, Row>; queue: Pending[] };
const DB = 'samgad-offline-v1';
const ACTIVE = 'samgad-offline-account';
let fallbackLock: Promise<unknown> = Promise.resolve();
export function locked<T>(fn: () => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request(DB, fn);
  const next = fallbackLock.then(fn, fn); fallbackLock = next.catch(() => {}); return next;
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('accounts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error('לא ניתן לשמור במכשיר. בדקו שהדפדפן מאפשר אחסון מקומי'));
  });
}
async function read(account?: string): Promise<State | null> {
  const user = account || localStorage.getItem(ACTIVE); if (!user) return null;
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('accounts'); const r = tx.objectStore('accounts').get(user);
    r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error);
  }); } finally { db.close(); }
}
async function write(state: State) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('accounts', 'readwrite'); tx.objectStore('accounts').put(state, state.user.id);
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(Error('השמירה במכשיר נכשלה. השינוי לא נשמר'));
  }); } finally { db.close(); }
  window.dispatchEvent(new Event('samgad:offline'));
}
const json = (body: unknown, status = 200, queued = false) => Response.json(body, { status, headers: queued ? { 'X-Samgad-Queued': '1' } : {} });
const queueable = (url: string, method: string) => method === 'POST' && ['/api/tasks', '/api/rhythm/items'].includes(url) || method === 'PATCH' && /^\/api\/(tasks|rhythm\/(items|occurrences))\/[^/]+$/.test(url);
async function network(url: string, init?: RequestInit) {
  return fetch(url, { ...init, signal: init?.signal || AbortSignal.timeout(12000) });
}
export function project(snapshot: Row, queue: Pending[], user: Row): Row {
  const data = structuredClone(snapshot);
  for (const op of queue) {
    const b = op.body, id = op.url.split('/').pop()!, now = new Date().toISOString();
    if (op.url.startsWith('/api/tasks') && data.tasks) {
      if (op.method === 'POST') data.tasks.unshift({ ...b, id: `local-${op.id}`, creatorId: user.id, status: 'open', priority: 'normal', dueDate: null, description: '', comments: [], createdAt: now, updatedAt: now, version: 1, ...b });
      else { const row = data.tasks.find((r: Row) => r.id === id); if (row) {
        const status = b.status === 'completed' && row.status !== 'pending_review' && row.ownerId !== row.creatorId && user.id !== row.creatorId && !user.permissions?.editAll ? 'pending_review' : b.status || row.status;
        Object.assign(row, b, { status, version: b.version + 1 });
      } }
    }
    if (op.url.startsWith('/api/rhythm/items') && data.items) {
      if (op.method === 'POST') {
        const item = { description: '', frequency: 'once', completionMode: 'individual', category: 'task', hasDeadline: false, archived: false, important: false, manualUrgent: false, endDate: null, ...b, id: `local-${op.id}`, creatorId: user.id, assigneeIds: b.recipientIds?.length ? b.recipientIds : [user.id], version: 1 };
        data.items.unshift(item);
        data.occurrences.unshift({ id: `local-${op.id}`, itemId: item.id, dueDate: b.startDate || data.today, done: false, urgent: item.manualUrgent, version: 1, reports: {}, completions: {}, completedAt: null, completedBy: null });
      } else {
        const row = data.items.find((r: Row) => r.id === id);
        if (row) {
          const reassign = b.recipientIds && JSON.stringify(b.recipientIds) !== JSON.stringify(row.assigneeIds);
          Object.assign(row, b, { assigneeIds: b.recipientIds || row.assigneeIds, version: b.version + 1 });
          for (const o of data.occurrences.filter((r: Row) => r.itemId === id)) {
            o.version++; if (b.startDate) o.dueDate = b.startDate;
            if (reassign) Object.assign(o, { reports: {}, completions: {}, done: false });
          }
        }
      }
    }
    if (op.url.startsWith('/api/rhythm/occurrences/') && data.occurrences) {
      const row = data.occurrences.find((r: Row) => r.id === id), item = row && data.items.find((r: Row) => r.id === row.itemId);
      if (!row || !item) continue;
      for (const recipient of b.recipientIds || [b.recipientId || user.id]) {
        if (b.review === 'reject' || !b.done) { delete row.reports[recipient]; delete row.completions[recipient]; }
        else if (b.review === 'approve' || recipient === item.creatorId) row.completions[recipient] = b.review === 'approve' ? row.reports[recipient] || now : typeof b.performedOn === 'string' ? b.performedOn + 'T12:00:00+02:00' : now;
        else row.reports[recipient] = typeof b.performedOn === 'string' ? b.performedOn + 'T12:00:00+02:00' : now;
      }
      row.done = item.completionMode === 'shared' ? item.assigneeIds.some((x: string) => row.completions[x]) : item.assigneeIds.every((x: string) => row.completions[x]);
      row.version = b.version + 1;
    }
  }
  return data;
}
export async function offlineStatus() { const state = await read(); return state?.queue || []; }
export async function clearOffline() {
  await locked(async () => {
    const state = await read(); if (state?.queue.length) throw Error('יש שינויים שממתינים לסנכרון. יש לסנכרן לפני יציאה');
    const db = await database(); await new Promise<void>((resolve, reject) => { const tx = db.transaction('accounts', 'readwrite'); if (state) tx.objectStore('accounts').delete(state.user.id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); localStorage.removeItem(ACTIVE);
  });
}
export async function discardPending() {
  await locked(async () => { const state = await read(); if (state) { state.queue = []; await write(state); } });
  window.dispatchEvent(new Event('samgad:saved'));
}
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return locked(async () => {
    let state = await read(); const method = init?.method || 'GET';
    if (method === 'GET') {
      let response: Response;
      try { if (!navigator.onLine) throw Error("offline"); response = await network(url, init); }
      catch {
        if (state?.snapshots[url]) return json(project(state.snapshots[url], state.queue, state.user));
        return json({ error: 'המידע הזה טרם נשמר במכשיר. יש לפתוח אותו פעם אחת עם אינטרנט' }, 503);
      }
      if (response.ok) {
        const body = await response.clone().json();
        if (url === '/api/workspace') {
          if (!state || state.user.id !== body.user.id) state = await read(body.user.id) || { user: body.user, snapshots: {}, queue: [] };
          state.user=body.user;
          localStorage.setItem(ACTIVE, body.user.id);
        }
        if (state && (url === '/api/workspace' || url.startsWith('/api/rhythm?') || url === '/api/documents')) { state.snapshots[url] = body; await write(state); return json(project(body, state.queue, state.user)); }
      }
      // A real auth rejection must never be masked by cached account data.
      return response;
    }
    if (!queueable(url, method)) {
      if (!navigator.onLine) return json({ error: 'לפעולה הזאת דרוש אינטרנט. משימות ונקודות לעיסוק זמינות גם אופליין' }, 503);
      return network(url, init);
    }
    if (!state) return json({ error: 'יש לפתוח את מרחב העבודה עם אינטרנט לפני עבודה אופליין' }, 503);
    if (url.includes('/local-') && !state.queue.some(q => `local-${q.id}` === url.split('/').pop() && q.method === 'POST')) return json({ error: 'יש להתחבר לאינטרנט כדי לרענן את המשימה שסונכרנה' }, 409);
    const body = JSON.parse(String(init?.body || '{}'));
    body.clientRequestId ||= crypto.randomUUID();
    const op: Pending = { id: crypto.randomUUID(), url, method, body, title: body.title || 'עדכון ביצוע / משימה' };
    // Persist before attempting any network request; a closed tab cannot lose this edit.
    const hadPending = state.queue.length > 0;
    state.queue.push(op); await write(state);
    if (navigator.onLine && !hadPending) {
      try {
        const response = await network(url, { ...init, body: JSON.stringify(body) });
        if (response.ok || response.status < 500) {
          await response.clone().json(); // Acknowledgement includes the body, not just delivered headers.
          state.queue = state.queue.filter(q => q.id !== op.id); await write(state);
          return response;
        }
      } catch { /* The durable outbox retains requests with uncertain delivery. */ }
    }
    queueMicrotask(() => void syncPending().catch(() => {}));
    return json({ queued: true }, 200, true);
  });
}
export async function syncPending() {
  if (!navigator.onLine) return;
  await locked(async () => {
    const state = await read(); if (!state?.queue.length) return;
    // Check account identity before replay, even if cookies changed in another tab.
    let identity: Response;
    try { identity = await network('/api/workspace', { cache: 'no-store' }); } catch { return; }
    if (!identity.ok) { state.queue[0].error = identity.status === 401 ? 'יש להתחבר מחדש כדי לסנכרן; השינויים שמורים במכשיר' : 'לא ניתן לאמת הרשאות. השינויים נשמרו'; await write(state); return; }
    const workspace = await identity.json();
    if (workspace.user.id !== state.user.id) { state.queue[0].error = 'השינויים שייכים לחשבון אחר. יש לחזור לחשבון המקורי'; await write(state); return; }
    while (state.queue.length) {
      const op = state.queue[0]; let response: Response;
      try { response = await network(op.url, { method: op.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op.body) }); }
      catch { return; }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        op.error = response.status === 409 ? 'המשימה השתנתה במכשיר אחר. השינוי המקומי נשמר לבירור ולא דורס את השינוי בשרת' : body.error || 'הסנכרון לא הושלם. השינוי שמור במכשיר';
        await write(state); return;
      }
      const result = await response.json();
      const temporaryId = `local-${op.id}`;
      let realId: string | undefined, occurrenceId: string | undefined;
      if (op.method === 'POST') {
        realId = result.item?.id || result.task?.id;
        if (!realId) { op.error = 'לא התקבל אישור שמירה תקין מהשרת'; await write(state); return; }
        if (op.url === '/api/rhythm/items') {
          try {
            const month = String(op.body.startDate || new Date().toISOString()).slice(0,7);
            const refreshed = await network(`/api/rhythm?month=${month}`, { cache: 'no-store' });
            if (!refreshed.ok) return;
            const rhythm = await refreshed.json();
            occurrenceId = rhythm.occurrences.find((row: Row) => row.itemId === realId)?.id;
            if (!occurrenceId && state.queue.some(q => q.url === `/api/rhythm/occurrences/${temporaryId}`)) return;
          } catch { return; } // Keep the idempotent create until dependent local IDs can be resolved.
        }
        for (const pending of state.queue.slice(1)) {
          if (pending.url.endsWith(`/${temporaryId}`)) pending.url = pending.url.slice(0,-temporaryId.length) + (pending.url.includes('/occurrences/') ? occurrenceId : realId);
        }
      }
      // Reflect confirmed updates locally before removing their durable outbox entry.
      for (const key of Object.keys(state.snapshots)) {
        const snapshot = project(state.snapshots[key], [op], state.user);
        if (realId) {
          for (const row of snapshot.tasks || []) if (row.id === temporaryId) Object.assign(row, result.task);
          for (const row of snapshot.items || []) if (row.id === temporaryId) Object.assign(row, result.item);
          for (const row of snapshot.occurrences || []) if (row.itemId === temporaryId) { row.itemId = realId; if (occurrenceId) row.id = occurrenceId; }
        }
        state.snapshots[key] = snapshot;
      }
      state.queue.shift(); await write(state);
    }
    // Replace optimistic IDs and versions with server-authoritative snapshots.
    await Promise.allSettled(Object.keys(state.snapshots).map(async key => {
      const r = await network(key, { cache: 'no-store' }); if (r.ok) state.snapshots[key] = await r.json();
    }));
    await write(state); window.dispatchEvent(new Event('samgad:saved'));
  });
}
