/* global self, caches, fetch, URL, Response */
/* Only the public app shell and immutable assets enter Cache Storage.
 * Private API data and the outbox live in the account-scoped IndexedDB store. */
const SHELL = 'samgad-shell-v4';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(['/', '/login', '/deputies', '/deputies/login', '/deputies/manifest.webmanifest', '/icon.svg', '/manifest.webmanifest', '/brand/605-art.jpg', '/brand/605-icon-180.png', '/brand/605-icon-192.png', '/brand/605-icon-512.png'])));
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
  if (url.pathname.startsWith('/_next/static/') || ['/icon.svg', '/manifest.webmanifest', '/deputies/manifest.webmanifest', '/brand/605-art.jpg', '/brand/605-icon-180.png', '/brand/605-icon-192.png', '/brand/605-icon-512.png'].includes(url.pathname)) {
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
