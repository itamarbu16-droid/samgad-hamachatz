/* global self, caches, fetch, URL, Response */
/* Only the public app shell and immutable assets enter Cache Storage.
 * Private API data and the outbox live in the account-scoped IndexedDB store. */
const SHELL = 'romach-75-shell-v2';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(['/', '/login', '/deputies', '/deputies/login', '/deputies/manifest.webmanifest', '/icon.svg', '/manifest.webmanifest', '/brand/75-crest.png?v=2', '/brand/75-crest.png?v=2', '/brand/75-crest.png?v=2', '/brand/75-crest.png?v=2'])));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('samgad-shell-') && key !== SHELL).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate' && ['/', '/login', '/deputies', '/deputies/login'].includes(url.pathname)) {
    event.respondWith(fetch(req).then(response => {
      if (response.ok && !response.redirected) { const copy = response.clone(); event.waitUntil(caches.open(SHELL).then(cache => cache.put(url.pathname, copy))); }
      return response;
    }).catch(async () => (await caches.match(url.pathname)) || Response.error()));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || ['/icon.svg', '/manifest.webmanifest', '/deputies/manifest.webmanifest', '/brand/75-crest.png?v=2', '/brand/75-crest.png?v=2', '/brand/75-crest.png?v=2', '/brand/75-crest.png?v=2'].includes(url.pathname)) {
    event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
      if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(SHELL).then(cache => cache.put(req, copy))); }
      return response;
    })));
  }
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'PRECACHE') return;
  const assets = event.data.assets.filter(name => { const url = new URL(name); return url.origin === self.location.origin && url.pathname.startsWith('/_next/static/'); });
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(assets)).then(() => event.ports[0]?.postMessage({ ok: true })).catch(() => event.ports[0]?.postMessage({ ok: false })));
});

// An empty authenticated Web Push wakes this worker. Event details are fetched
// using this device's current authenticated session, never embedded in a token.
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  try{
   const response=await fetch('/api/push/events',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error('session');
   const rows=await response.json();
   if(!rows.length)return self.registration.showNotification('רומח',{body:'יש עדכון באפליקציה',icon:'/brand/75-crest.png?v=2',data:{url:'/deputies'}});
   for(const row of rows)await self.registration.showNotification(row.title,{body:row.body,tag:row.id,icon:'/brand/75-crest.png?v=2',data:{url:row.url}});
   await fetch('/api/push/events',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:rows.map(r=>r.id)})});
  }catch{await self.registration.showNotification('רומח',{body:'פתח את האפליקציה כדי לראות עדכונים',icon:'/brand/75-crest.png?v=2',data:{url:'/deputies'}});}
 })());
});
self.addEventListener('notificationclick',event=>{event.notification.close();const target=new URL(event.notification.data?.url||'/deputies',self.location.origin);if(target.origin!==self.location.origin)return;event.waitUntil(self.clients.openWindow(target.href));});
