const CACHE = 'tokyo-trip-v3';
// Third-party assets the app needs to work underground / offline: the
// Leaflet map library, Google Fonts, and OSM map tiles you've already
// viewed. Live API calls (weather, FX, Overpass, routing) still go
// straight to the network.
const RUNTIME = 'tokyo-trip-runtime-v1';
const RUNTIME_HOSTS = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'tile.openstreetmap.org'];
const MAX_RUNTIME_ENTRIES = 1500;

function isRuntimeAsset(url){
  return RUNTIME_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
}

async function trimRuntime(){
  const c = await caches.open(RUNTIME);
  const keys = await c.keys();
  for(let i = 0; i < keys.length - MAX_RUNTIME_ENTRIES; i++) await c.delete(keys[i]);
}
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const APP_SHELL = new Set(['./', './index.html']);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  if (url.origin !== self.location.origin) {
    if (!isRuntimeAsset(url)) return; // let live API calls go straight to network
    // Cache-first: these URLs are versioned or effectively immutable.
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(e.request, copy)).then(trimRuntime);
        }
        return res;
      }))
    );
    return;
  }

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
