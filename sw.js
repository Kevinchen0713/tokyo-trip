const CACHE = 'tokyo-trip-v2';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const APP_SHELL = new Set(['./', './index.html']);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // let live API calls go straight to network
  if (e.request.method !== 'GET') return;

  const path = './' + url.pathname.replace(/^\//, '').replace(/^tokyo-trip\//, '');
  const isShell = e.request.mode === 'navigate' || APP_SHELL.has(path);

  if (isShell) {
    // Network-first for the app shell: GitHub Pages sets a 10-minute HTTP
    // cache, so a stale-while-revalidate fetch can silently keep re-caching
    // an old build. Force a real network hit, and only fall back to the
    // cache when actually offline.
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
