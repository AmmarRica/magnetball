// COPY SETTINGS — the ones you CHANGED, to the clipboard.
//
// Asked for as "a place to export current settings so I can paste it here to make it the
// default", and then "have the button that does that put it into clipboard". `Export save`
// already wrote a FILE, and it writes everything this device knows about you — settings,
// record, unlocks, maps, drill times, a run in progress — which is the wrong shape for that
// errand twice over: it is a download rather than a paste, and it buries the six settings
// somebody moved in fifty keys plus their whole career.
//
// ⚠️ THE CLAIM IS WHAT LANDS ON THE CLIPBOARD, not that a function exists. The button is
// PRESSED — and pressed by hit-testing its centre with `elementFromPoint`, never `.click()`,
// which does no hit testing and would pass over a control nothing can reach (the
// `#lobbyStartBtn` lesson). The clipboard is then read back through the real API.
//
// ⚠️ MEASUREMENT NOTE: `navigator.clipboard` needs a SECURE CONTEXT and this suite runs on
// `file://`, where it is simply absent — which is exactly why `copyText` has the
// `execCommand` fallback. So the page is served over http from a temp dir and the origin is
// granted clipboard permission, or the check would measure the fallback on every run and
// never touch the path a real player uses.
import { chromium, LAUNCH } from './_browser.mjs';
import { serve } from './_serve.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const site = await serve(process.cwd());
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: site.url });
const p = await ctx.newPage();
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
await p.goto(site.url + '/index.html');
await p.waitForTimeout(900);

// Open About so the button is laid out and reachable.
await p.evaluate(() => {
  const M = window.__magnet;
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  M.openSection('about');
});
await p.waitForTimeout(250);

// ---- the diff itself, before anything is touched ---------------------------
const fresh = await p.evaluate(() => {
  const M = window.__magnet;
  return { n: M.settingsChangedCount(), text: M.settingsText() };
});

// ---- press it with nothing changed ----------------------------------------
const press = async () => {
  const r = await p.evaluate(() => {
    const el = document.getElementById('selCopyBtn');
    if (!el) return { reachable: false };
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return { reachable: false, w: b.width, h: b.height };
    el.scrollIntoView({ block: 'center' });
    return { reachable: true };
  });
  if (!r.reachable) return { reachable: false };
  const box = await p.locator('#selCopyBtn').boundingBox();
  const cx = box.x + box.width/2, cy = box.y + box.height/2;
  const hit = await p.evaluate(([x, y]) => {
    const t = document.elementFromPoint(x, y), el = document.getElementById('selCopyBtn');
    return !!(t && el && (t === el || el.contains(t)));
  }, [cx, cy]);
  await p.mouse.click(cx, cy);
  await p.waitForTimeout(250);
  const label = await p.locator('#selCopyBtn').textContent();
  return { reachable: true, hit, label };
};

const empty = await press();

// ---- change some settings, in nested groups as well as at the top level ----
await p.evaluate(() => {
  const M = window.__magnet;
  M.sel.magnet = 45;
  M.sel.rumble = 80;
  M.sel.feel.pdamp = 902;          // one leaf of thirteen
  M.sel.look.palette = 'neon';     // one slot of six
  M.saveSel();
});
const changed = await press();
const clip = await p.evaluate(() => navigator.clipboard.readText());

const shape = await p.evaluate(() => {
  const M = window.__magnet;
  const d = M.selDiff(M.sel, M.defaultSel());
  return {
    n: M.settingsChangedCount(),
    topKeys: Object.keys(d).sort(),
    feelKeys: d.feel ? Object.keys(d.feel) : [],
    lookKeys: d.look ? Object.keys(d.look) : [],
    // an array must travel WHOLE, not half of one
    arrayWhole: (() => {
      const keep = M.sel.teamCol;
      M.sel.teamCol = ['#e05a5a', '#00ff00'];          // only the second differs
      const dd = M.selDiff(M.sel, M.defaultSel());
      const got = dd.teamCol;
      M.sel.teamCol = keep;
      return Array.isArray(got) && got.length === 2 && got[0] === '#e05a5a';
    })(),
    // a key the defaults have never heard of is a real difference
    unknownKept: (() => {
      M.sel.__madeUp = 'x';
      const dd = M.selDiff(M.sel, M.defaultSel());
      delete M.sel.__madeUp;
      return dd.__madeUp === 'x';
    })(),
  };
});

let parsed = null, parseErr = '';
try { parsed = JSON.parse(clip); } catch(e){ parseErr = e.message; }

await ctx.close();
await site.close();

// -------------------------------------------------------------------- report --
ok('the button is on the page and pressable', changed.reachable && changed.hit,
   JSON.stringify(changed) + ' — .click() does no hit testing, so this asks the document what is actually at the button\'s centre');

ok('a device nobody has touched copies NOTHING, and says so', fresh.n === 0 && /Nothing changed/i.test(empty.label || ''),
   `${fresh.n} changed on a fresh device, button said "${empty.label}" — a tick over an empty object is a button that lied`);

ok('WHAT LANDS ON THE CLIPBOARD IS THE JSON', !!parsed && typeof parsed === 'object',
   `clipboard was ${JSON.stringify(String(clip).slice(0, 80))}${parseErr ? ' — ' + parseErr : ''}`);
ok('...and it carries the settings that were changed', !!parsed &&
   parsed.magnet === 45 && parsed.rumble === 80 &&
   parsed.feel && parsed.feel.pdamp === 902 && parsed.look && parsed.look.palette === 'neon',
   JSON.stringify(parsed));
ok('...and the button says how many', /Copied 4 settings/.test(changed.label || ''),
   `"${changed.label}" — leaves, not top-level keys: one moved slider inside feel is not thirteen`);

// ⚠️ READ OFF THE CLIPBOARD, never off `selDiff`. A sabotage that copied the WHOLE of
// `sel` passed every check when these read the helper: a full dump contains the four
// changed values too, so "the four are in there" says nothing at all. What separates a
// diff from a dump is the key set of what LANDED.
const clipKeys = parsed ? Object.keys(parsed).sort() : [];
const clipFeel = parsed && parsed.feel ? Object.keys(parsed.feel) : [];
const clipLook = parsed && parsed.look ? Object.keys(parsed.look) : [];
ok('IT IS A DIFF, not the whole of sel', clipKeys.join(',') === 'feel,look,magnet,rumble',
   JSON.stringify(clipKeys) + ' — a full dump of ~50 keys makes somebody find the four that moved by eye');
ok('...and it goes DEEP', clipFeel.length === 1 && clipLook.length === 1,
   `feel carried ${JSON.stringify(clipFeel)} and look ${JSON.stringify(clipLook)} — a nested group must carry only its changed leaves`);
ok('...but an ARRAY travels whole', shape.arrayWhole,
   'teamCol is a pair, and half a pair means nothing');
ok('...and a key the defaults never had is kept', shape.unknownKept,
   'a legacy value or a typo in a shared sheet is a real difference on this device');

ok('nothing personal or career-shaped is in it', !!parsed &&
   !('stats' in parsed) && !('granted' in parsed) && !('drills' in parsed),
   JSON.stringify(Object.keys(parsed || {})) + ' — that is what Export save is for');

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ fresh: fresh.n, empty, changed, shape, clip: String(clip).slice(0, 200) }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL copysettings\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS copysettings');
