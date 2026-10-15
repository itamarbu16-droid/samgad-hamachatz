"use client";
import { useEffect, useState } from 'react';
import { discardPending, offlineStatus, syncPending, type Pending } from '@/lib/offline';
export default function OfflineStatus() {
  const [online, setOnline] = useState(true), [pending, setPending] = useState<Pending[]>([]), [error, setError] = useState(''), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let mounted = true;
    const update = () => { setOnline(navigator.onLine); void offlineStatus().then(q => { if (mounted) setPending(q); }).catch(() => setError('האחסון המקומי אינו זמין בדפדפן הזה')); };
    const sync = () => { update(); void syncPending().catch(() => setError('הסנכרון לא הושלם. יש לנסות שוב')); };
    update();
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(async () => {
        await navigator.serviceWorker.ready;
        const worker = (await navigator.serviceWorker.ready).active;
        if (!worker) return;
        const assets = performance.getEntriesByType('resource').map(entry => entry.name).filter(name => new URL(name).pathname.startsWith('/_next/static/'));
        await new Promise<void>((resolve, reject) => {
          const channel = new MessageChannel();
          const timeout = setTimeout(() => reject(Error('precache timeout')), 15000);
          channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); if (event.data.ok) resolve(); else reject(Error('precache failed')); };
          worker.postMessage({ type: 'PRECACHE', assets }, [channel.port2]);
        });
        if (mounted) setReady(true);
      }).catch(() => setError('ההכנה לפתיחה אופליין לא הושלמה. יש לרענן עם אינטרנט'));
    }
    window.addEventListener('online', sync); window.addEventListener('offline', update); window.addEventListener('samgad:offline', update); window.addEventListener('focus', sync);
    const timer = setInterval(sync, 30000); sync();
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('online', sync); window.removeEventListener('offline', update); window.removeEventListener('samgad:offline', update); window.removeEventListener('focus', sync); };
  }, []);
  if (typeof window !== 'undefined' && window.location.pathname === '/login') return null;
  const message = error || pending.find(q => q.error)?.error;
  return <aside className={`offline-status ${!online || pending.length || message ? 'offline-pending' : ''}`} aria-label="מצב סנכרון">
    <div role="status" aria-live="polite">{!online ? 'ללא אינטרנט · ' : ''}{pending.length ? `נשמר במכשיר · ${pending.length} שינויים ממתינים לסנכרון` : online ? `מסונכרן${ready ? ' · מוכן לפתיחה אופליין' : ''}` : 'מציג מידע שנשמר במכשיר'}</div>
    {message && <p role="alert">{message}</p>}
    {pending.length > 0 && <><button type="button" onClick={() => setExpanded(!expanded)}>הצגת שינויים שמורים</button><button type="button" disabled={!online || busy} onClick={async () => { setBusy(true); try { await syncPending(); } finally { setBusy(false); } }}>{busy ? 'מסנכרן…' : 'נסה לסנכרן'}</button></>}
    {expanded && pending.length > 0 && <div><ul>{pending.map(op => <li key={op.id}><strong>{op.title}</strong>{op.error && <p>{op.error}</p>}<details><summary>פרטי השינוי שנשמר</summary><pre dir="ltr">{JSON.stringify(op.body, null, 2)}</pre></details></li>)}</ul><button type="button" onClick={() => { if (confirm('למחוק את כל השינויים שטרם סונכרנו ולחזור למידע מהשרת? פעולה זו מוחקת את השינויים המקומיים האלה.')) void discardPending(); }}>ביטול השינויים המקומיים</button></div>}
  </aside>;
}
