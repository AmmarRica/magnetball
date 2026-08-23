// A deploy has to reach /settings, not just the game page.
//
// THE BUG THIS EXISTS FOR: /settings is a stub that pulls the real page in with
// `fetch('../index.html')`. That is not a navigation, and a plain fetch() sends
// `Accept: */*`, so the service worker's "is this HTML?" test — which looked only at
// request.mode and the Accept header — classified it as a static asset and served it
// CACHE-FIRST. The settings page was pinned to whatever index.html was precached at
// install time, and every deploy after that was invisible there until someone bumped
// CACHE. It looked exactly like "the fix didn't work".
//
// `{cache:'no-cache'}` on that fetch does NOT help: it is an HTTP cache directive and
// does not bypass a service worker at all.
//
// So this serves a throwaway site from a temp directory, registers the REAL sw.js,
// changes the file on disk, and asks for it the same way the settings stub does.
// Nothing here trusts the predicate by reading it — it exercises the shipped worker.
import { chromium, LAUNCH } from './_browser.mjs';
import { serve } from './_serve.mjs';
import { mkdtemp, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'mb-sw-'));
await mkdir(join(root, 'settings'), { recursive: true });
await copyFile('sw.js', join(root, 'sw.js'));
await copyFile('settings/index.html', join(root, 'settings', 'index.html'));
// ⚠️ EVERY route in sw.js's ASSETS list must exist on this temp site. The worker's
// install is `caches.addAll(ASSETS)`, and addAll REJECTS on any single 404 — so when
// the /vj route joined the precache list and this fixture did not serve it,
// `navigator.serviceWorker.ready` never resolved and the suite hung the whole parallel
// pool, silently, twice. A new precached route lands HERE in the same commit.
await mkdir(join(root, 'vj'), { recursive: true });
await copyFile('vj/index.html', join(root, 'vj', 'index.html'));
await writeFile(join(root, 'manifest.json'), '{}');
await writeFile(join(root, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
const page = v => `<!doctype html><html><head><title>t</title></head><body>
<p id="marker">BUILD_${v}</p><script>window.__BUILD='${v}';</scr`+`ipt></body></html>`;
await writeFile(join(root, 'index.html'), page('ONE'));

const srv = await serve(root);
const b = await chromium.launch(LAUNCH);
const ctx = await b.newContext();
const p = await ctx.newPage();
const errors=[]; p.on('pageerror',e=>errors.push(e.message));

const o = {};
await p.goto(srv.url + '/');
// Register the real worker and wait until it is actually controlling the page —
// a worker that is merely installed does not intercept anything yet.
o.registered = await p.evaluate(async (base) => {
  const reg = await navigator.serviceWorker.register(base + '/sw.js', { scope: base + '/' });
  await navigator.serviceWorker.ready;
  for (let i=0;i<60 && !navigator.serviceWorker.controller;i++){
    await new Promise(r=>setTimeout(r,100));
    if (!navigator.serviceWorker.controller) location.reload();
    break;
  }
  return !!reg;
}, srv.url);
await p.goto(srv.url + '/');
await p.waitForTimeout(400);
o.controlled = await p.evaluate(()=>!!navigator.serviceWorker.controller);

// Warm the cache exactly the way the settings stub does.
o.firstFetch = await p.evaluate(async ()=>{
  const r = await fetch('./index.html', { cache:'no-cache' });
  return (await r.text()).match(/BUILD_(\w+)/)[1];
});

// --- Deploy. Same URL, new bytes.
await writeFile(join(root, 'index.html'), page('TWO'));

// A navigation sees it (that path was always network-first).
await p.goto(srv.url + '/');
await p.waitForTimeout(250);
o.navigationSees = await p.evaluate(()=>document.getElementById('marker').textContent.split('_')[1]);

// ...and so must a plain fetch(), which is the one that was broken.
o.stubFetchSees = await p.evaluate(async ()=>{
  const r = await fetch('./index.html', { cache:'no-cache' });
  return (await r.text()).match(/BUILD_(\w+)/)[1];
});
// The real settings route, end to end: it fetches ../index.html and writes it out.
const sp = await ctx.newPage();
const sperr=[]; sp.on('pageerror',e=>sperr.push(e.message));
await sp.goto(srv.url + '/settings/');
await sp.waitForTimeout(600);
o.settingsSees = await sp.evaluate(()=>window.__BUILD ||
  (document.getElementById('marker')||{}).textContent || 'none');

// --- Offline still works: that is what the cache was for in the first place.
await srv.close();
await p.waitForTimeout(150);
o.offlineStillServes = await p.evaluate(async ()=>{
  try { const r = await fetch('./index.html', { cache:'no-cache' });
        return /BUILD_/.test(await r.text()); } catch(_){ return false; }
});

o.cacheName = (await (await import('node:fs/promises')).readFile('sw.js','utf8'))
  .match(/const CACHE = '([^']+)'/)[1];

await b.close();
await rm(root, { recursive: true, force: true });

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(o.registered && o.controlled, `the service worker never took control, so nothing here was tested: ${JSON.stringify(o)}`);
ok(o.firstFetch === 'ONE', `the warm-up fetch did not see the first build: ${o.firstFetch}`);
ok(o.navigationSees === 'TWO', `a navigation did not see the new build: ${o.navigationSees}`);
ok(o.stubFetchSees === 'TWO',
   `a plain fetch() served the STALE build (${o.stubFetchSees}) — /settings would be pinned to whatever was precached, and every deploy invisible there`);
ok(o.settingsSees === 'TWO', `the /settings route itself served the stale build: ${o.settingsSees}`);
ok(o.offlineStillServes, 'the page no longer works offline — network-first must still fall back to cache');
ok(sperr.length === 0, 'errors on the settings route: ' + sperr.join(' | '));
ok(errors.length === 0, 'page errors: ' + errors.join(' | '));

console.log(JSON.stringify(o, null, 1));
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nswupdate OK');
