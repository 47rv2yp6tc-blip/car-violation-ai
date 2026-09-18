const CACHE = 'roadlens-shell-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './upload-fix.js'];
self.addEventListener('install', (event) => { self.skipWaiting(); event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined))); });
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim().then(() => caches.keys()).then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const request = event.request;
  if (new URL(request.url).pathname.includes('/api/')) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && new URL(request.url).origin === self.location.origin) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); }
    return response;
  }).catch(() => caches.match('./index.html'))));
});
