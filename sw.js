// Offline-Hilfe: Seite immer frisch aus dem Netz, bei fehlendem Netz die letzte Version
const CACHE = 'hp-v3';
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
