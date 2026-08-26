// Magnetball service worker — offline + installable.
const CACHE = 'magnetball-v7';   // v7: the panel route is /menu (v6 precached /vj)
// './menu/' is the panel route — a stub that fetches index.html, so both need to be
// cached for the menu window to open offline.
// ⚠️ './settings/' is the OLD name of that route and is still precached on purpose: it
// is now a one-line redirect to ../menu/, and somebody with the old URL bookmarked (or
// an install carrying the v6 cache) has to be able to follow it while offline. Dropping
// it would turn a working bookmark into a blank page on exactly the devices that were
// using the feature before it was renamed.
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg',
                './menu/', './menu/index.html', './settings/', './settings/index.html',
                './vj/', './vj/index.html'];

// ⚠️ **ONE MISSING FILE MUST NOT COST THE WHOLE INSTALL.** `cache.addAll` is atomic: it
// rejects the entire promise if ANY request fails, so a single 404 in this list leaves
// the worker uninstalled and the game with no offline support at all — and every asset
// here is optional to a *working* page. That is not hypothetical: the legacy `./settings/`
// redirect is precached for the sake of old bookmarks, and a deploy that dropped it (or a
// test harness that copies only the files it cares about) would take the whole install
// down with it. Measured while renaming the route: the install promise never settled and
// `navigator.serviceWorker.ready` hung for sixteen minutes.
// Each entry is fetched on its own and a failure is swallowed, so the worker installs with
// whatever it could get and the network-first path covers the rest.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
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
// ⚠️ HTML IS DECIDED BY THE URL, NOT JUST THE REQUEST MODE. The /menu route is a
// stub that pulls the real page in with `fetch('../index.html')`. That is not a
// navigation and its Accept header is */*, so mode/accept alone classified it as a
// static asset and served it CACHE-FIRST — pinning /menu to whatever index.html
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
