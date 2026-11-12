const CACHE = 'roadlens-shell-v6';
const SHELL = ['./manifest.webmanifest', './mobile-app.css', './assets/lensy-mascot.svg'];

async function cameraOrLibraryResponse(response) {
  if (!response || !response.ok) return response;
  const html = await response.text();
  // Without `capture`, mobile browsers can offer both camera and photo library.
  const updated = html.replace(/\s+capture=("|')environment\1/gi, '');
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('content-range');
  return new Response(updated, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(SHELL).catch(() => undefined);
      try {
        const response = await fetch('./index.html', { cache: 'no-store' });
        const updated = await cameraOrLibraryResponse(response);
        if (updated && updated.ok) await cache.put('./index.html', updated);
      } catch (_) {
        // The app shell can still install when the network is unavailable.
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim().then(() => caches.keys()).then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const request = event.request;
  const url = new URL(request.url);

  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(cameraOrLibraryResponse).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) =>
      cached || fetch(request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
