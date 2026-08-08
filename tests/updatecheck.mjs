// "Update available": noticing a new build, and asking before taking it.
//
// ⚠️ WHY IT COMPARES `VERSION` AND NOT THE SERVICE WORKER: a deploy here is a new
// index.html, and sw.js barely ever changes — so `registration.update()` fires
// `updatefound` for almost none of them, and an SW-based check would cheerfully report "up
// to date" through every real release. This fetches the page and reads its VERSION, which
// is exactly the thing that changes.
//
// ⚠️ And the reason it exists at all: an installed PWA has no reload button and no address
// bar. A player looking at the app has no way to pick up a new build except killing it from
// the app switcher.
//
// Served from a real HTTP server with the real page, because the whole feature is a fetch
// of itself — a file:// page cannot do that, and stubbing the fetch would test the stub.
// Five things are held:
//   1. It reads its OWN version correctly. The regex's source text appears in the reply
//      before the real declaration, so a sloppy pattern matches itself.
//   2. A changed version on disk raises the screen, naming both versions.
//   3. It NEVER appears over a live match — it waits for the menu or the result.
//   4. "Later" does not nag again for that version; a genuinely newer one still asks.
//   5. Offline it never offers something a reload could not deliver — and note that it does
//      not FAIL offline, it answers from the service worker's cache. See that block.
import { chromium, LAUNCH } from './_browser.mjs';
import { serve } from './_serve.mjs';
import { readFile, writeFile, mkdtemp, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A throwaway copy of the real site, so the version can be edited under the running page.
const root = await mkdtemp(join(tmpdir(), 'mb-upd-'));
await mkdir(join(root, 'settings'), { recursive: true });
const SRC = await readFile('index.html', 'utf8');
await writeFile(join(root, 'index.html'), SRC);
await copyFile('sw.js', join(root, 'sw.js'));
await copyFile('settings/index.html', join(root, 'settings', 'index.html'));
await copyFile('manifest.json', join(root, 'manifest.json'));
await copyFile('icon.svg', join(root, 'icon.svg'));

const VER_RE = /const VERSION = '([^']+)'/;
const BASE_VER = SRC.match(VER_RE)[1];
const setVersion = (v) => writeFile(join(root, 'index.html'), SRC.replace(VER_RE, `const VERSION = '${v}'`));

const srv = await serve(root);
const b = await chromium.launch(LAUNCH);
const ctx = await b.newContext();
const p = await ctx.newPage();
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load|favicon/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{ window.__MAGNETDEBUG = true; });
await p.goto(srv.url + '/index.html');
await p.waitForTimeout(900);

const o = {};
o.runningVersion = await p.evaluate(()=> window.__magnet.VERSION);
o.servedSameBuild = o.runningVersion === BASE_VER;

// ---- 1. it reads its OWN version, not its own regex ------------------------
// ⚠️ THE TRAP: this file fetches itself, so the pattern's source text is in the reply
// BEFORE the real declaration. A pattern that allows anything after the quote matches the
// `\s*` in its own source and reports a version of "\s*".
o.selfRead = await p.evaluate(async ()=>{
  const M=window.__magnet;
  const txt = await (await fetch('./index.html', { cache:'reload' })).text();
  return M.updParseVersion(txt);
});
o.readsOwnVersion = o.selfRead === o.runningVersion;
// ...and a reply with no version at all is null rather than a crash or a false positive.
o.parseGuards = await p.evaluate(()=>{
  const M=window.__magnet;
  return [M.updParseVersion(''), M.updParseVersion('<html>nothing here</html>'),
          M.updParseVersion(null)].every(v => v === null);
});

// ---- the same build must NOT raise anything --------------------------------
o.sameBuildQuiet = await p.evaluate(async ()=>{
  const M=window.__magnet;
  const v = await M.updCheck(true);
  return { found: v, modal: !document.getElementById('updModal').classList.contains('hidden'),
           pending: M.updFound };
});
o.quietWhenCurrent = o.sameBuildQuiet.found === o.runningVersion &&
                     o.sameBuildQuiet.modal === false && !o.sameBuildQuiet.pending;

// ---- 2. a new build on disk raises the screen ------------------------------
await setVersion('99991231.0101AM');
o.newBuild = await p.evaluate(async ()=>{
  const M=window.__magnet;
  const v = await M.updCheck(true);
  const el = document.getElementById('updModal');
  return { found: v, shown: !el.classList.contains('hidden'),
           text: (document.getElementById('updVers').textContent || '').replace(/\s+/g,' ').trim(),
           hasNow: !!document.getElementById('updNow'), hasLater: !!document.getElementById('updLater') };
});
o.raisesScreen = o.newBuild.found === '99991231.0101AM' && o.newBuild.shown;
// ⚠️ BOTH versions named. "An update is available" with no numbers cannot be acted on or
// checked afterwards — the player has no way to tell whether the reload worked.
o.namesBothVersions = o.newBuild.text.includes('99991231.0101AM') &&
                      o.newBuild.text.includes(o.runningVersion);
o.hasBothButtons = o.newBuild.hasNow && o.newBuild.hasLater;

// ---- 4. "Later" stops the nagging, but a NEWER build still asks ------------
// ⚠️ The no-nag rule covers the AUTOMATIC checks, which fire on every return to the app.
// A MANUAL press is the player asking, and a button that knowingly answers nothing is worse
// than one that repeats itself — so that path deliberately re-offers, and both are checked.
o.later = await p.evaluate(async ()=>{
  const M=window.__magnet;
  M.updLater();
  const hidAfter = document.getElementById('updModal').classList.contains('hidden');
  M.updLast = 0;                                  // clear the throttle: this is the AUTO path
  await M.updCheck();
  const autoBack = !document.getElementById('updModal').classList.contains('hidden');
  await M.updCheck(true);                         // ...but pressing the button asks again
  const manualBack = !document.getElementById('updModal').classList.contains('hidden');
  return { hidAfter, autoBack, manualBack, seen: M.updSeen };
});
o.laterHides = o.later.hidAfter && o.later.seen === '99991231.0101AM';
o.laterDoesNotNag = o.later.autoBack === false;
o.manualReAsks = o.later.manualBack === true;
await setVersion('99991231.0202AM');            // a genuinely newer one
o.newerAsksAgain = await p.evaluate(async ()=>{
  await window.__magnet.updCheck(true);
  return !document.getElementById('updModal').classList.contains('hidden');
});
await p.evaluate(()=>{ window.__magnet.updHide(); window.__magnet.updFound = null; window.__magnet.updSeen = null; });

// ---- 3. it never lands over a live match -----------------------------------
// ⚠️ A modal mid-play steals the ball out of your hands. Held until the menu, the pause
// screen or the result — the menu's own attract demo counts as the menu.
o.match = await p.evaluate(async ()=>{
  const M=window.__magnet; const r={};
  M.sel.mode='2v2'; M.sel.kickoffRule='off'; M.setMatchSeed(4); M.startMatch();
  const w=M.world; w.state='play'; w.stateT=2; w.demo=false;
  r.canShowDuringPlay = M.updCanShow();
  const v = await M.updCheck(true);
  r.foundAnyway = v;                              // the CHECK still runs; only the screen waits
  r.hiddenDuringPlay = document.getElementById('updModal').classList.contains('hidden');
  r.heldPending = M.updFound === v;
  // ...and it appears the moment the match is over.
  w.state='over';
  r.canShowWhenOver = M.updCanShow();
  M.updMaybeShow();
  r.shownAfter = !document.getElementById('updModal').classList.contains('hidden');
  return r;
});
o.waitsForAGoodMoment = o.match.canShowDuringPlay === false && o.match.hiddenDuringPlay &&
                        o.match.heldPending && o.match.canShowWhenOver && o.match.shownAfter;
// The attract demo behind the menu is the menu, not a match.
o.demoCountsAsMenu = await p.evaluate(()=>{
  const M=window.__magnet;
  M.world.state='play'; M.world.demo = true;
  const ok = M.updCanShow();
  M.world.demo = false;
  return ok;
});
await p.evaluate(()=>{ window.__magnet.updHide(); window.__magnet.updFound=null; window.__magnet.updSeen=null; });

// ---- the throttle: automatic checks do not hammer the server ---------------
let hits = 0;
p.on('request', r => { if (/index\.html$/.test(r.url())) hits++; });
o.autoThrottled = await p.evaluate(async ()=>{
  const M=window.__magnet;
  const a = await M.updCheck();       // one goes through...
  const b2 = await M.updCheck();      // ...the rest inside the window do not
  const c = await M.updCheck();
  return { a: a !== null, b: b2, c };
});
o.throttleHolds = o.autoThrottled.b === null && o.autoThrottled.c === null;
// ...and a MANUAL check always goes, because the player just asked.
o.manualAlwaysGoes = await p.evaluate(async ()=> (await window.__magnet.updCheck(true)) !== null);

// ---- 5. offline ------------------------------------------------------------
// ⚠️ A DISCOVERY WORTH RECORDING: offline this does not fail, it answers from the SERVICE
// WORKER'S CACHE — the worker is network-first for HTML and falls back to its cached page.
// That is right rather than a hole: a reload falls back to the same cached copy, so a version
// found this way really is installable. Which means the honest offline property is not "it
// says nothing" but "it never offers something a reload could not deliver" — so the cache is
// first put in step with the running build, and THEN the network is cut.
await setVersion(BASE_VER);
await p.evaluate(async ()=>{ const M=window.__magnet;
  M.updHide(); M.updFound=null; M.updSeen=null; await M.updCheck(true); });
await ctx.setOffline(true);
o.offline = await p.evaluate(async ()=>{
  const M=window.__magnet;
  let threw = false, v = 'unset';
  try { v = await M.updCheck(true); } catch(e){ threw = true; }
  return { threw, v, running: M.VERSION,
           shown: !document.getElementById('updModal').classList.contains('hidden') };
});
o.offlineIsSilent = o.offline.threw === false && o.offline.v === o.offline.running &&
                    o.offline.shown === false;
await ctx.setOffline(false);

// ---- the manual button is reachable and says what it is ---------------------
o.button = await p.evaluate(()=>{
  const bt = document.getElementById('updCheckBtn');
  if (!bt) return null;
  const cs = getComputedStyle(bt);
  return { text: bt.textContent.trim(), visible: cs.display !== 'none' && cs.visibility !== 'hidden',
           inMenu: !!bt.closest('#setup') };
});
o.buttonUsable = !!o.button && o.button.visible && o.button.inMenu && /check/i.test(o.button.text);

// ---- and Update actually reloads, onto the new build ------------------------
await setVersion('99991231.0303AM');
await p.evaluate(()=>{ window.__magnet.updSeen = null; });
await p.evaluate(async ()=>{ await window.__magnet.updCheck(true); });
o.beforeReload = await p.evaluate(()=> window.__magnet.VERSION);
await Promise.all([
  p.waitForNavigation({ waitUntil: 'load' }),
  p.evaluate(()=> document.getElementById('updNow').click()),
]);
await p.waitForTimeout(900);
o.afterReload = await p.evaluate(()=> window.__magnet && window.__magnet.VERSION);
o.updateLandedOnNewBuild = o.afterReload === '99991231.0303AM' && o.beforeReload !== o.afterReload;

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(o.servedSameBuild, `the served copy reports ${o.runningVersion} but the source says ${BASE_VER}`);
ok(o.readsOwnVersion, `reading its own page gave "${o.selfRead}" instead of "${o.runningVersion}" — the pattern's own source text is in the reply BEFORE the real declaration, so a loose regex matches itself and every check reports a new build`);
ok(o.parseGuards, 'an empty or version-less reply did not come back as null');
ok(o.quietWhenCurrent, `checking against the SAME build raised something: ${JSON.stringify(o.sameBuildQuiet)}`);
ok(o.raisesScreen, `a changed version on the server did not raise the screen: ${JSON.stringify(o.newBuild)}`);
ok(o.namesBothVersions, `the screen does not name both versions ("${o.newBuild.text}") — "an update is available" with no numbers cannot be acted on, and afterwards the player has no way to tell whether the reload worked`);
ok(o.hasBothButtons, 'the screen has no Update and Later pair');
ok(o.laterHides, `Later did not dismiss and record the version: ${JSON.stringify(o.later)}`);
ok(o.laterDoesNotNag, 'the same version came back on an AUTOMATIC check after Later — being asked twice about one build is what teaches people to dismiss update prompts unread, and this fires on every return to the app');
ok(o.manualReAsks, 'pressing "check for updates" after Later answered nothing — the player is asking, and a button that knowingly says nothing is worse than one that repeats itself');
ok(o.newerAsksAgain, 'a genuinely NEWER build did not ask again, so Later silenced it for good');
ok(o.waitsForAGoodMoment, `it does not wait for a good moment: ${JSON.stringify(o.match)} — a modal landing mid-play steals the ball out of your hands`);
ok(o.demoCountsAsMenu, "the menu's own attract demo was treated as a live match, so the screen could never appear on the menu");
ok(o.throttleHolds, `automatic checks are not throttled: ${JSON.stringify(o.autoThrottled)} — this fires on every return to the app`);
ok(o.manualAlwaysGoes, 'a MANUAL check was swallowed by the throttle, so pressing the button could do nothing at all');
ok(o.offlineIsSilent, `offline it did not stay quiet with the cache in step: ${JSON.stringify(o.offline)} — the check falls back to the SERVICE WORKER'S cached page, so with nothing newer cached it must read the running version and say nothing`);
ok(o.buttonUsable, `the manual check button is not usable: ${JSON.stringify(o.button)} — an installed PWA has no reload button, so this is the only way to ASK`);
ok(o.updateLandedOnNewBuild, `Update did not land on the new build: ${o.beforeReload} → ${o.afterReload}`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(o, null, 1));
await b.close(); await srv.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nupdatecheck OK');
