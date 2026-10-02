// Offline-Hilfe: Seite immer frisch aus dem Netz, bei fehlendem Netz die letzte Version
const CACHE = 'hp-v20';
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './manifest.webmanifest', './icons/icon-192.png'])));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const ok = u.origin === location.origin || ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname);
  if (!ok) return;                     // Datenbank und Gemini nie zwischenspeichern
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(r, c)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('./') : Response.error()))));
});

// Erinnerungen von Mochi (9 und 21 Uhr)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Mochi', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
    tag: 'mochi', renotify: true, data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.includes('/haushaltsplan'));
    return c ? c.focus() : self.clients.openWindow(url);
  }));
});

// Wechselt der Browser die Push-Adresse, sofort neu anmelden und den Eintrag in der Datenbank umschreiben
const VAPID_PUBLIC = 'BEZT0EuXvyh1SQq3sNVMqna4ZjT10R1nTyH6TKr9pJocnHUvcQE27PMnuEnerYX-SGwnONAvvK-MDMS1PpH9w4k';
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    const old = e.oldSubscription && e.oldSubscription.endpoint;
    const sub = e.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC) });
    if (!old) return;
    await fetch('https://kpxsnjrdrawjmsdcefxz.supabase.co/functions/v1/hh-remind?resub=1', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old, sub: sub.toJSON() }) });
  })());
});
