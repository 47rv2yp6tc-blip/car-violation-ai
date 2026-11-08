const CACHE = 'roadlens-shell-v5';
const SHELL = ['./index.html', './manifest.webmanifest', './mobile-app.css', './assets/lensy-mascot.svg', './visit-counter.js'];
const VISIT_SCRIPT = '<script src="/visit-counter.js" defer></script>';

async function injectVisitCounter(response) {
  if (!response || !response.ok) return response;
  const contentType = String(response.headers.get('content-type') || '');
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  if (html.includes('/visit-counter.js')) {
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  const updated = html.includes('</body>')
    ? html.replace('</body>', `${VISIT_SCRIPT}</body>`)
    : `${html}${VISIT_SCRIPT}`;

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('Cache-Control', 'no-store');

  return new Response(updated, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined)));
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
      fetch(request).then(injectVisitCounter).catch(async () => {
        const cached = await caches.match('./index.html');
        return injectVisitCounter(cached);
      })
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
