// DOWNLOAD THE GAME AND PLAY IT OFFLINE.
//
// The whole game is one HTML file, so "download it" is literally a copy of that file — no
// installer, no runtime, no packaging step. It matters most on Linux, where Firefox has no
// install-as-app at all and Chrome's is inconsistent, and where "just give me the file" is
// the answer that works in every browser on every desktop.
//
// What this suite holds:
//   1. the button is in About, and is actually pressable (not merely present);
//   2. over http it saves a file named for the running VERSION;
//   3. ⚠️ THE SAVED BYTES ARE THE SERVED SOURCE, not the live DOM. This is the whole trap:
//      `document.documentElement.outerHTML` looks like the obvious way to save a page and is
//      wrong — it is the page as it is RIGHT NOW, with every class the menu has toggled and
//      every node the settings screen has built. The suite mutates the DOM first (opens a
//      section, starts a match) and then requires the download to still be byte-identical to
//      what the server sent, which is what a build using outerHTML cannot do;
//   4. ⚠️ AND THE SAVED FILE ACTUALLY PLAYS. "A file was written" is true of any 200 reply,
//      including a captive portal's login page. The copy is opened from file://, with no
//      server and no assets folder beside it, and has to boot and run a match — which is the
//      entire promise being made;
//   5. it REPORTS, both ways: a size on success, and on a file:// page — where there is
//      nothing to fetch and a page cannot fetch itself anyway — it says so on the button
//      rather than sitting there dead.
import { chromium, LAUNCH } from './_browser.mjs';
import { serve } from './_serve.mjs';
import { readFile, writeFile, mkdtemp, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'mb-offl-'));
await mkdir(join(root, 'settings'), { recursive: true });
const SRC = await readFile('index.html', 'utf8');
await writeFile(join(root, 'index.html'), SRC);
await copyFile('sw.js', join(root, 'sw.js'));
await copyFile('settings/index.html', join(root, 'settings', 'index.html'));
await copyFile('manifest.json', join(root, 'manifest.json'));
await copyFile('icon.svg', join(root, 'icon.svg'));
const VERSION = SRC.match(/const VERSION = '([^']+)'/)[1];

const site = await serve(root);
const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

// A place for the download to land.
const dldir = await mkdtemp(join(tmpdir(), 'mb-dl-'));
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });

// ---------------------------------------------------------------- 1, 2, 3 --
const p = await ctx.newPage();
p.on('pageerror', e => errors.push(e.message));
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto(site.url + '/index.html');
await p.waitForTimeout(800);

const ui = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  { const dm = document.getElementById('dmCollect'); if (dm) dm.click(); }
  o.possible = M.offlinePossible();
  M.openLook('about');
  const btn = document.getElementById('offlineBtn');
  o.exists = !!btn;
  o.inAbout = !!document.querySelector('#setup .card[data-sec="about"] #offlineBtn');
  // ⚠️ Scrolled to and hit-tested, because `.click()` does no hit testing and would pass
  // over a control nothing can reach — the #lobbyStartBtn lesson.
  btn.scrollIntoView({ block: 'center' });
  const r = btn.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
  o.pressable = hit === btn || btn.contains(hit);
  o.hitName = hit ? (hit.id || hit.className || hit.tagName) : 'null';
  o.tall = Math.round(r.height);
  // ⚠️ MUTATE THE PAGE before downloading. If the download were built from the live DOM,
  // everything below this line would end up in the file.
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  for (let i = 0; i < 120; i++) M.step(w);
  document.body.classList.add('__probe-marker');
  const scratch = document.createElement('div');
  scratch.id = '__probe_scratch'; scratch.textContent = 'this must not be in the file';
  document.body.appendChild(scratch);
  o.domIsDirty = !!document.getElementById('__probe_scratch');
  return o;
});

const dlp = p.waitForEvent('download', { timeout: 25000 });
await p.evaluate(() => document.getElementById('offlineBtn').click());
const dl = await dlp;
const savedName = dl.suggestedFilename();
const savedPath = join(dldir, savedName);
await dl.saveAs(savedPath);
const saved = await readFile(savedPath, 'utf8');
await p.waitForTimeout(400);
const said = await p.evaluate(() => document.getElementById('offlineBtn').textContent);

// ------------------------------------------------------------------- 4 --
// The copy has to BOOT AND PLAY from file://, with no server and no assets beside it.
// ⚠️ Missing artwork logs ERR_FILE_NOT_FOUND per file, which is the documented graceful
// fallback and not a fault — so console noise is filtered to real script errors here.
const q = await ctx.newPage();
const qerr = [];
q.on('pageerror', e => qerr.push('PAGEERROR ' + e.message));
q.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/ERR_FILE_NOT_FOUND|Failed to load resource|favicon|manifest|sw\.js/i.test(t)) return;
  qerr.push(t);
});
await q.addInitScript(() => { window.__MAGNETDEBUG = true; });
await q.goto('file://' + savedPath);
await q.waitForTimeout(1200);
const off = await q.evaluate(() => {
  const M = window.__magnet;
  if (!M) return { booted: false };
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(3); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const x0 = w.ball.x, y0 = w.ball.y;
  let moved = false;
  for (let i = 0; i < 600; i++){
    M.step(w);
    if (Math.abs(w.ball.x - x0) + Math.abs(w.ball.y - y0) > 5) moved = true;
  }
  M.render();
  // Real ink on the canvas, not just "no exception".
  const c = document.getElementById('game');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4 * 211) if (d[i] + d[i+1] + d[i+2] > 60) lit++;
  return {
    booted: true, version: M.VERSION, moved, lit,
    players: w.players.length,
    // ...and none of the probe's mess came with it.
    cleanOfProbe: !document.getElementById('__probe_scratch') &&
                  !document.body.classList.contains('__probe-marker'),
    // ---- 5. it says what it is instead of offering a download it cannot do ----
    possible: M.offlinePossible(),
    btnText: document.getElementById('offlineBtn').textContent,
  };
});
await q.close();
await p.close();

// -------------------------------------------------------------- report --
ok('the download button is in About', ui.exists && ui.inAbout, JSON.stringify(ui));
ok('...and is actually pressable', ui.pressable,
   `a press at its centre landed on ${ui.hitName} — .click() does no hit testing, so it would pass over a control nothing can reach`);
ok('...at a real size', ui.tall >= 30, `${ui.tall}px`);
ok('it is offered over http', ui.possible);
ok('the probe really did dirty the DOM first', ui.domIsDirty,
   'without that, "the file is the source" is true of a build using outerHTML too');
ok('a file is saved, named for the build', /^magnetball-.*\.html$/.test(savedName) && savedName.indexOf(VERSION) >= 0,
   savedName);
ok('...and it is the SERVED SOURCE, byte for byte', saved.length === SRC.length && saved === SRC,
   `${saved.length} bytes saved against ${SRC.length} served — outerHTML would save the page as it is right now, with the match running and every menu class toggled`);
ok('...carrying none of the probe\'s changes', saved.indexOf('__probe_scratch') < 0,
   'the live DOM leaked into the file');
ok('the button reports the size', /saved/i.test(said) && /KB/.test(said),
   `button read ${JSON.stringify(said)} — a download button that says nothing reads as broken`);

ok('THE SAVED COPY BOOTS from file://', off.booted, JSON.stringify(off));
ok('...as the same build', off.version === VERSION, `${off.version} vs ${VERSION}`);
ok('...and PLAYS a match with no server', off.moved && off.players === 2,
   `${JSON.stringify({ moved: off.moved, players: off.players })} — "a file was written" is true of a captive portal's login page too; this is the promise being made`);
ok('...and draws the pitch', off.lit > 20, `${off.lit} lit samples`);
ok('...with none of the probe in it', off.cleanOfProbe, JSON.stringify(off));
ok('the offline copy knows it is one', off.possible === false && /offline copy/i.test(off.btnText),
   `button read ${JSON.stringify(off.btnText)} — a page on file:// cannot fetch itself, so the button must say so rather than fail silently`);

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
ok('no script errors on the offline copy', qerr.length === 0, qerr.slice(0, 3).join(' | '));

console.log(JSON.stringify({ ui, savedName, savedKB: Math.round(saved.length/1024), said, off }, null, 1));
await b.close();
await site.close();
if (fails.length){ console.log('FAIL offline\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS offline');
