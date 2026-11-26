/* global self, fetch, URL */
'use strict';
const PROTOCOL_VERSION = 1;
const CHECK = '/api/push/manual-device/check';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
// Do not claim clients: this worker has no app-shell or ordinary push duties.
self.addEventListener('message', event => {
  if (event.data?.type === 'samgad-manual-alerts-protocol') event.ports?.[0]?.postMessage({version:PROTOCOL_VERSION});
});
self.addEventListener('push', event => event.waitUntil((async () => {
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    if (typeof subscription?.endpoint !== 'string' || !subscription.endpoint) return;
    const response = await fetch(CHECK, {method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:PROTOCOL_VERSION,endpoint:subscription.endpoint})});
    if (!response.ok) return;
    const result = await response.json();
    if (result?.show !== true) return;
    await self.registration.showNotification('תזכורת אישית',{body:'משימה שלך ממתינה באפליקציה.',tag:'samgad-manual-reminder'});
  } catch { /* A failed check must not show a fallback notification or read another queue. */ }
})()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(new URL('/',self.location.origin).href));
});
