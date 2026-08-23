// Magnetball service worker — offline + installable.
const CACHE = 'magnetball-v6';   // v6 precaches the /vj route; v5 evicted the old app icon
// './settings/' is the panel route — a stub that fetches index.html, so both need
// to be cached for the settings window to open offline.
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg', './settings/', './settings/index.html', './vj/', './vj/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for the page/HTML so a new build shows up immediately when online,
// falling back to cache when offline. Cache-first for other static assets.
//
// ⚠️ HTML IS DECIDED BY THE URL, NOT JUST THE REQUEST MODE. The /settings route is a
// stub that pulls the real page in with `fetch('../index.html')`. That is not a
// navigation and its Accept header is */*, so mode/accept alone classified it as a
// static asset and served it CACHE-FIRST — pinning /settings to whatever index.html
// happened to be precached at install and making every subsequent deploy invisible
// there until CACHE was bumped. (`{cache:'no-cache'}` on that fetch is an HTTP cache
// directive; it does not bypass a service worker.) Anything that IS an HTML document
// goes network-first however it was asked for.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  let path = '';
  try { path = new URL(e.request.url).pathname; } catch (_) {}
  const isHTML = e.request.mode === 'navigate' ||
    (e.request.headers.get('accept') || '').includes('text/html') ||
    /\.html?$/i.test(path) || path.endsWith('/');

  if (isHTML) {
    e.respondWith(
      fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => { try { c.put(e.request, copy); } catch (_) {} });
        return resp;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => { try { c.put(e.request, copy); } catch (_) {} });
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
