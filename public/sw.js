const CACHE = 'northcost-v2';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html', './manifest.webmanifest'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.endsWith('sw.js')) return;
  // Pages and the shell go to the network first, so a returning visitor sees
  // refreshed figures instead of a cached build from months ago.
  if (e.request.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('index.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && (u.pathname.endsWith('.geojson') || u.pathname.includes('/assets/'))) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
