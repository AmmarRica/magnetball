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

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ desk, narrow, phone }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL chipreach\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS chipreach');
