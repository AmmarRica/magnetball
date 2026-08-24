// EVERY TAB IS REACHABLE BY THE INPUT THE MACHINE ACTUALLY HAS.
//
// ⚠️ THE BUG THIS EXISTS FOR: `#jumpBar` and `.subtabs` are one row that scrolls
// SIDEWAYS, with the scrollbar hidden (`scrollbar-width: none`). On a phone that is
// right — you swipe the row with a thumb. On a DESKTOP it left everything past the
// right-hand edge reachable by no input the machine has: a mouse has no sideways
// gesture, a wheel scrolls the page rather than a horizontal box, and there was no bar
// to drag. Measured at 1280×900 before the fix: EIGHT of the twelve jump chips off the
// edge (Theme, Display, Sound, Game Feel, Replays, VJ Mode, About, Online), 4 of 7
// theme slots, 4 of 7 player panes, 3 of 6 sound categories, 2 of 5 Game Feel panes.
// A sub-pane has no other route in, so those settings were unreachable outright.
//
// ⚠️ MEASUREMENT TRAP, and it is why every existing suite passed over this. `menunav`
// and `taptargets` both press a chip by calling `scrollIntoView()` first and then
// hit-testing — which SCROLLS THE ROW FOR YOU, so a chip no human could reach measures
// as perfectly pressable. Nothing here may scroll a chip row. The horizontal scroll
// offset is asserted to be zero at the end of each pass, so a probe that quietly
// scrolls one fails rather than passing for the wrong reason.
//
// ⚠️ And it is pinned from BOTH ends: the phone must KEEP the single scrolling row.
// Wrapping there is two pinned rows eating the screen the tabs exist to save, so a
// build that simply wraps everywhere passes the desktop half and is a regression.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const look = async (opts) => {
  const p = await b.newPage(opts);
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => {
    const M = window.__magnet, rows = [];
    const list = [['jumpBar', document.getElementById('jumpBar')]];
    for (const t of document.querySelectorAll('.subtabs')) list.push(['subtabs:' + t.dataset.tabs, t]);
    for (const [name, el] of list){
      if (!el) continue;
      // A card's chips only lay out once its card is open.
      const card = el.closest('.card');
      if (card && card.dataset.sec) M.openSection(card.dataset.sec);
      const chips = [...el.children].filter(c => c.offsetParent !== null);
      if (!chips.length) continue;
      // ⚠️ Scroll the ROW into view, never a CHIP. Vertical scrolling is a gesture every
      // device has, and with several cards opened in turn a later row is simply below
      // the fold — which is not the defect. `scrollIntoView` walks the scrollable
      // ANCESTORS, so calling it on the row moves the page and leaves the row's own
      // `scrollLeft` alone; calling it on a chip would scroll the row sideways for us,
      // which is the trap in the header.
      el.scrollIntoView({ block: 'center' });
      const unreachable = [];
      for (const c of chips){
        // ⚠️ NO scrollIntoView. The whole question is whether it is reachable WITHOUT
        // one, and calling it is what made every earlier suite blind to this.
        const r2 = c.getBoundingClientRect();
        const offEdge = r2.right > innerWidth + 0.5 || r2.left < -0.5 ||
                        r2.bottom > innerHeight + 0.5 || r2.top < -0.5;
        const hit = offEdge ? null : document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
        const pressable = !!hit && (hit === c || c.contains(hit) || hit.contains(c));
        if (!pressable) unreachable.push(c.textContent.trim().slice(0, 18) + (offEdge ? ' [off-edge]' : ' [covered]'));
      }
      // ⚠️ The rule this replaces named a specific fear — "two pinned rows put half the
      // chips behind the section header and let the pane's tiles through the gap" — so
      // it is measured rather than assumed. The row is opaque; sample right across its
      // box and nothing underneath it may surface.
      const rb = el.getBoundingClientRect();
      let seeThrough = 0;
      for (let gx = 0; gx <= 10; gx++) for (let gy = 0; gy <= 4; gy++){
        const x = rb.left + 2 + (rb.width - 4) * gx / 10, y = rb.top + 2 + (rb.height - 4) * gy / 4;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        const h = document.elementFromPoint(x, y);
        if (h && h !== el && !el.contains(h)) seeThrough++;
      }
      rows.push({ name, chips: chips.length, unreachable, seeThrough,
                  wrapped: new Set(chips.map(c => Math.round(c.getBoundingClientRect().top))).size > 1,
                  overflowsX: el.scrollWidth > el.clientWidth + 1,
                  scrolled: el.scrollLeft,          // must stay 0 — see the trap above
                  pinnedPx: el.offsetHeight });
    }
    return rows;
  });
  await p.close();
  return r;
};

// A desktop mouse: hover and a fine pointer, which is what the media query keys on.
const desk = await look({ viewport: { width: 1280, height: 900 } });
// ...and a narrower desktop window, where the menu is NOT docked.
const narrow = await look({ viewport: { width: 860, height: 900 } });
const phone = await look({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// -------------------------------------------------------------------- report --
for (const [where, rows] of [['desktop', desk], ['narrow desktop', narrow]]){
  ok(`${where}: every chip row was found`, rows.length >= 5, `${rows.length} rows`);
  for (const r of rows){
    ok(`${where} ${r.name}: every chip is reachable WITHOUT scrolling the row`, r.unreachable.length === 0,
       `${r.unreachable.length} of ${r.chips} unreachable: ${JSON.stringify(r.unreachable)} — a mouse has no sideways gesture, so a chip past the right-hand edge of a scrollbar-less row cannot be pressed at all`);
    ok(`${where} ${r.name}: the row does not overflow sideways`, !r.overflowsX,
       'wrapping is what makes them reachable; an overflowing row means the wrap did not apply');
    ok(`${where} ${r.name}: nothing shows through the pinned row`, r.seeThrough === 0,
       `${r.seeThrough} of 55 sample points hit something underneath — the rule this replaces feared exactly that of a wrapped row, so it is measured`);
    ok(`${where} ${r.name}: the probe did not scroll the row itself`, r.scrolled === 0,
       `scrollLeft ${r.scrolled} — scrolling a chip into view is exactly what made every earlier suite blind to this`);
  }
}

// The row that carries the whole menu is the one that was worst hit.
const jd = desk.find(r => r.name === 'jumpBar');
ok('desktop: every jump-bar destination is pressable', jd && jd.chips >= 9 && jd.unreachable.length === 0,
   JSON.stringify(jd) + ' — eight of them were off the edge, including Theme, Sound, Game Feel and About');

// ⚠️ THE OTHER END. A build that wraps everywhere passes everything above and is a
// regression on the device the single scrolling row was designed for.
for (const r of phone){
  ok(`phone ${r.name}: still ONE row`, !r.wrapped,
     `${r.pinnedPx}px tall — these rows are STICKY, so a second pinned row on a 390px phone eats the screen the tabs exist to save`);
}
const jp = phone.find(r => r.name === 'jumpBar');
ok('phone: the jump bar still scrolls sideways rather than wrapping', jp && jp.overflowsX && !jp.wrapped,
   JSON.stringify(jp) + ' — a thumb swipes it, which is the gesture a mouse does not have');

// ============================================================================
//  THE CARD BODY MUST FIT THE PHONE IT IS ON
//
//  ⚠️ THE BUG: `#matchCard` is `display: contents`, so `#matchBody` is a flex ITEM of the
//  scroll column rather than a block inside a card — and `.screen` centres its items, so
//  with no width of its own it shrink-to-fits to MAX-CONTENT. Measured at **531px inside a
//  449px viewport**, centred, hanging off BOTH edges: four pitch tiles off the left and
//  three off the right, with no way to reach any of them. The hero bar above it carries
//  `align-self:center; width:100%; max-width:460px` for exactly this reason; the body never
//  got the same rule, and every other section is a plain `.card`, which has it built in.
//
//  ⚠️ SAME CLASS AS THE CHIP ROWS ABOVE — a control drawn on screen that no input can
//  reach — but a DIFFERENT mechanism, and the chip probes are blind to it: they measure
//  rows, and this is the container the rows sit in. It is worse than an unreachable chip,
//  because the overflow lands on `#setup`, which nobody would think to swipe sideways, and
//  the tiles are cut on BOTH sides at once.
//
//  ⚠️ TWO MEASUREMENTS, because neither is sufficient alone. `scrollWidth - clientWidth`
//  on `#setup` misses a build where an ancestor clips with `overflow:hidden`; tiles-past-
//  the-edge passes on a build where the pane is empty. The tile COUNT is asserted too, so
//  "nothing is off screen" cannot be satisfied by there being nothing.
//
//  ⚠️ The `.subtabs` chips are EXCLUDED from the tile scan on purpose — that row scrolls
//  sideways on a phone by design, which is what the whole first half of this file is about.
//  Including them would make this check contradict the one above it.
// ============================================================================
const fitRows = [];
for (const vw of [320, 360, 390, 412, 449]){
  const p = await b.newPage({ viewport: { width: vw, height: 900 }, isMobile: true, hasTouch: true });
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(800);
  fitRows.push(await p.evaluate(() => {
    const M = window.__magnet, o = { vw: innerWidth, panes: {} };
    M.openSection('match');
    const su = document.getElementById('setup'), mb = document.getElementById('matchBody');
    for (const pane of ['game', 'modes', 'bots', 'pitch', 'players', 'rules']){
      M.showSubTab('match', pane);
      // ⚠️ `.opt` AND `.navtile`: the Modes pane is nav tiles rather than option tiles, and a
      // scan for `.opt` alone reported zero controls there — which the count guard caught,
      // and which is exactly what that guard is for.
      const tiles = [...mb.querySelectorAll('.opt, .navtile')]
        .filter(t => t.offsetParent !== null && !t.closest('.subtabs'));
      const off = tiles.filter(t => { const q = t.getBoundingClientRect();
        return q.width > 0 && (q.left < -0.5 || q.right > innerWidth + 0.5); });
      o.panes[pane] = { tiles: tiles.length, off: off.length,
                        sample: off.slice(0, 3).map(t => (t.textContent || '').trim().slice(0, 10)) };
    }
    M.showSubTab('match', 'pitch');
    o.setupOverflow = su.scrollWidth - su.clientWidth;
    const q = mb.getBoundingClientRect();
    o.bodyLeft = Math.round(q.left); o.bodyRight = Math.round(q.right);
    o.bodyFits = q.left >= -0.5 && q.right <= innerWidth + 0.5;
    return o;
  }));
  await p.close();
}

for (const r of fitRows){
  ok(`phone ${r.vw}: the menu does not overflow sideways`, r.setupOverflow <= 0,
     `#setup scrollWidth exceeds clientWidth by ${r.setupOverflow}px — the column itself is the scroller here, ` +
     'so anything past its edge is reachable by no gesture anybody would try');
  ok(`phone ${r.vw}: the match card body fits the screen`, r.bodyFits,
     `#matchBody spans ${r.bodyLeft}..${r.bodyRight} in a ${r.vw}px viewport — centred and wider than the ` +
     'screen means it is cut on BOTH sides at once');
  for (const [pane, v] of Object.entries(r.panes)){
    // The count guard: "nothing is off screen" is also true of an empty pane.
    ok(`phone ${r.vw}: the ${pane} pane has tiles at all`, v.tiles > 0,
       'without this, the off-screen check below passes on a pane that renders nothing');
    ok(`phone ${r.vw}: no ${pane} tile is off the edge`, v.off === 0,
       `${v.off} of ${v.tiles} off screen, e.g. ${JSON.stringify(v.sample)}`);
  }
}

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ desk, narrow, phone, fitRows }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL chipreach\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS chipreach');
