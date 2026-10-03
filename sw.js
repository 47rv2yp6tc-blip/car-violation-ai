const CACHE = 'roadlens-shell-v3';
const SHELL = ['./index.html', './manifest.webmanifest', './upload-fix.js'];
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined))
  );
});
self.addEventListener('activate', (event) => event.waitUntil(
  self.clients.claim().then(() => caches.keys()).then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const request = event.request;
  const url = new URL(request.url);
  // Don't interfere with API calls
  if (url.pathname.includes('/api/')) return;

  // For navigations, prefer network first then fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && url.origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match('./index.html'))));
});
