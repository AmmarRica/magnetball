// The RESULT SCREEN ON A PHONE — it has to be reachable, and it has to be readable.
//
// ⚠️ WHAT THIS SUITE EXISTS FOR. A 3v3 result on a 390x844 phone measured 1087px of
// content inside an 844px window, and #overlay was a `justify-content: center` flex
// column with `overflow: visible`. Both halves of that are fatal together:
//   · centring an overflowing column pushes the top OUT of the box, so the title sat
//     at y = -271 with no way to reach it;
//   · `overflow: visible` means nothing scrolls, so the Restart / Warm-up / Main Menu
//     buttons at y = 845..1046 could not be pressed either.
// A touch-only player who finished a match was stuck on that screen until the 30s
// auto-advance fired. `scrollTop = 9999` measured 0.
//
// And it was TOO MUCH: computeAwards is a stack of `topBy` calls, so one player who
// ran the match took ALL EIGHT ribbons — half a phone screen spent saying one thing
// eight times.
//
// So four things are held here, and the first two are the ones that make the screen
// usable at all:
//   1. nothing is parked ABOVE the viewport — no child of #overlay has a negative top;
//   2. every action button can actually be pressed — on screen, and not behind
//      anything, after scrolling if need be;
//   3. one player cannot hold more than AWARD_PER_PLAYER ribbons;
//   4. the per-player table folds on a phone and opens on a tap, losing nothing.
//
// ⚠️ MEASUREMENT TRAP: "is the button visible" cannot be `getBoundingClientRect().top
// < innerHeight`. The overlay scrolls, so a button below the fold is reachable and
// therefore fine — what is NOT fine is a button that cannot be brought into view or
// that something else covers. Both are measured by scrolling to it and then asking
// `elementFromPoint` at its centre.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [];
const fails = [];
const ok = (name, cond, extra) => { if (!cond) fails.push(name + (extra ? ' — ' + extra : '')); };

// One dominant player on team 1: the screenshot that started this. Every `topBy` in
// computeAwards resolves to the same body, which is exactly the eight-ribbon case.
const TALLY = [
  { goals:1, saves:0, assists:1, clears:2, passKey:1, posts:0, hardest:6.4, shots:3,  touches:44 },
  { goals:0, saves:1, assists:0, clears:1, passKey:0, posts:0, hardest:5.0, shots:1,  touches:31 },
  { goals:0, saves:0, assists:0, clears:0, passKey:0, posts:0, hardest:0,   shots:0,  touches:22 },
  { goals:5, saves:9, assists:3, clears:9, passKey:7, posts:2, hardest:9.9, shots:15, touches:120 },
  { goals:0, saves:1, assists:0, clears:1, passKey:0, posts:0, hardest:4.1, shots:1,  touches:18 },
  { goals:1, saves:0, assists:0, clears:0, passKey:1, posts:1, hardest:7.2, shots:10, touches:40 },
];

async function openResult(w, h, mobile){
  const p = await b.newPage({ viewport:{ width:w, height:h }, deviceScaleFactor: mobile?2:1,
                              isMobile: !!mobile, hasTouch: !!mobile });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  await p.evaluate((T) => {
    const M = window.__magnet;
    const dm = document.getElementById('dmCollect'); if (dm) dm.click();   // daily-reward modal out of the way
    M.setMatchSeed(9); M.sel.mode = '3v3'; M.startMatch();
    const w2 = M.world; w2.state = 'play'; w2.stateT = 1;
    w2.players.forEach((q,i) => Object.assign(q.ms, T[i]));
    w2.score = [2, 6];
    M.endMatch(w2); M.finishMatch(w2);
  }, TALLY);
  // ⚠️ MEASUREMENT TRAP: wait for the SLAM to finish before measuring anything.
  // The result title runs `@keyframes slam`, which starts at `scale(2.6)` — and
  // `getBoundingClientRect()` reports the TRANSFORMED box, so mid-animation a title
  // laid out correctly at y=24 measures y=-16 and the "nothing above the viewport"
  // check fails on a screen with nothing wrong with it. The desktop case caught it
  // because a wide layout finishes building sooner and was still sampled inside the
  // half-second; the phone case passed on timing luck alone.
  await p.evaluate(() => Promise.all(
    document.getElementById('overlay').getAnimations({ subtree:true }).map(a => a.finished.catch(()=>{}))
  ));
  await p.waitForTimeout(120);
  return p;
}

// ---------------------------------------------------------------- PHONE
{
  const p = await openResult(390, 844, true);

  // ---- 1. the screen scrolls, and nothing is stranded above it ------------
  const box = await p.evaluate(() => {
    const ov = document.getElementById('overlay'), cs = getComputedStyle(ov);
    ov.scrollTop = 0;
    return {
      overflowY: cs.overflowY,
      justify: cs.justifyContent,
      scrollH: ov.scrollHeight, clientH: ov.clientHeight,
      // ⚠️ The whole bug in one number. With `justify-content: center` and content
      // taller than the box, the FIRST child's top goes negative and is unreachable.
      minTop: Math.min(...[...ov.children].filter(c => c.getBoundingClientRect().height > 0)
        .map(c => c.getBoundingClientRect().top)),
    };
  });
  ok('phone: overlay scrolls', /auto|scroll/.test(box.overflowY), 'overflow-y is ' + box.overflowY);
  ok('phone: centring is safe', /safe/.test(box.justify) || box.scrollH <= box.clientH,
     'justify-content is ' + box.justify);
  ok('phone: nothing above the viewport', box.minTop >= -1, 'topmost child at y=' + box.minTop);

  // ---- 2. every action can be pressed, folded AND unfolded ----------------
  // ⚠️ Measured by scrolling to the control and hit-testing its centre, not by asking
  // whether it happens to be on screen — the screen scrolls, so "below the fold" is a
  // fine place for a button to be. Unreachable or covered is not.
  // ⚠️ And over the buttons the screen actually OFFERS, not a hard-coded three. Warm-up
  // is deliberately absent on a phone with no controller (there is no stick to test and
  // no side to walk onto — see `warmupUseful`), so naming it here would make this suite
  // fail on a screen that is behaving correctly. The count is asserted separately, which
  // is what stops "every offered button works" being satisfied by offering none.
  const reach = async () => p.evaluate(() => {
    const out = {};
    for (const id of ['ovResume','ovRematch','ovMenu']){
      const el = document.getElementById(id);
      if (!el || el.offsetParent === null || getComputedStyle(el).display === 'none') continue;
      el.scrollIntoView({ block:'center' });
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      out[id] = (r.top >= 0 && r.bottom <= innerHeight && el.contains(hit)) ? 'ok'
              : (r.top < 0 || r.bottom > innerHeight ? 'offscreen' : 'covered:' + (hit && (hit.id || hit.className)));
    }
    document.getElementById('overlay').scrollTop = 0;
    return out;
  });
  const folded = await reach();
  for (const id of Object.keys(folded)) ok('phone: ' + id + ' pressable', folded[id] === 'ok', folded[id]);
  // The screen still has to answer "what now?" — Restart to play again, Main Menu to
  // leave. Those two are the floor whatever else is hidden.
  ok('phone: Restart and Main Menu are both offered',
     folded.ovResume === 'ok' && folded.ovMenu === 'ok', Object.keys(folded).join());

  // ---- 3. one player cannot own the whole ribbon list ---------------------
  const aw = await p.evaluate(() => {
    const M = window.__magnet, list = M.computeAwards(M.world), per = {};
    list.forEach(a => { per[a.p.name] = (per[a.p.name] || 0) + 1; });
    return { cap: M.AWARD_PER_PLAYER, total: list.length, worst: Math.max(0, ...Object.values(per)),
             inDom: document.querySelectorAll('#ovStats .awrow').length,
             labels: list.map(a => a.label) };
  });
  ok('awards: a per-player cap exists', aw.cap >= 1 && aw.cap <= 3, 'cap is ' + aw.cap);
  ok('awards: no player exceeds it', aw.worst <= aw.cap, 'one player holds ' + aw.worst);
  // ⚠️ The point is not "fewer ribbons", it is "not the same name over and over" — a
  // dominant player really did earn eight of these, and the cap has to be what removed
  // them rather than the total cap of 8 happening to bite.
  ok('awards: the dominant run is cut down', aw.total <= 8 && aw.total < 8,
     aw.total + ' ribbons: ' + aw.labels.join(', '));
  ok('awards: the DOM shows what computeAwards returned', aw.inDom === aw.total,
     aw.inDom + ' rows vs ' + aw.total + ' awards');
  // ⚠️ And the ones that survive must be the TOP of the priority order, not an
  // arbitrary two — dropping Golden Boot to keep Woodwork is the wrong two.
  ok('awards: the best two survive', aw.labels[0] === 'Golden Boot',
     'first ribbon is ' + aw.labels[0]);

  // ---- 4. the table folds on a phone, and a tap gets it all back ----------
  const fold = await p.evaluate(() => {
    const M = window.__magnet, host = document.getElementById('ovStats');
    const head = host.querySelector('button.statshead');
    const rows = () => host.querySelectorAll('.statsrow:not(.shead)').length;
    const shown = () => [...host.querySelectorAll('.statsrow:not(.shead)')]
      .filter(r => r.getBoundingClientRect().height > 0).length;
    const o = {
      isButton: !!head,
      tapPx: head ? Math.round(head.getBoundingClientRect().height) : 0,
      startFolded: host.classList.contains('lean'),
      hiddenH: host.getBoundingClientRect().height,
      // ⚠️ Folded must HIDE, never DELETE. The rows stay in the DOM so nothing has to
      // be rebuilt, and so a screen reader / find-in-page still has the numbers.
      rowsInDom: rows(), rowsVisibleFolded: shown(),
      // The score and the ribbons are the RESULT, not a breakdown of it — they stay.
      scoresFolded: [...host.querySelectorAll('.tpscore')].filter(s => s.getBoundingClientRect().height > 0).length,
      ribbonsFolded: [...host.querySelectorAll('.awrow')].filter(s => s.getBoundingClientRect().height > 0).length,
    };
    head.click();
    o.openAfterTap = !host.classList.contains('lean');
    o.rowsVisibleOpen = shown();
    o.openH = host.getBoundingClientRect().height;
    o.flag = M.statsOpen;
    // ...and nothing was lost: every non-zero prose line is still there when open.
    o.prose = [...host.querySelectorAll('.sdid')].map(x => x.textContent).filter(Boolean).length;
    head.click();                                    // back to folded for the height check below
    return o;
  });
  ok('fold: the heading is the control', fold.isButton);
  ok('fold: it is a real touch target', fold.tapPx >= 44, fold.tapPx + 'px tall');
  ok('fold: a phone starts folded', fold.startFolded);
  ok('fold: rows are hidden, not deleted', fold.rowsInDom === 6 && fold.rowsVisibleFolded === 0,
     fold.rowsInDom + ' in DOM, ' + fold.rowsVisibleFolded + ' visible');
  ok('fold: the scores stay', fold.scoresFolded === 2, fold.scoresFolded + ' visible');
  ok('fold: the ribbons stay', fold.ribbonsFolded === aw.total, fold.ribbonsFolded + ' visible');
  ok('fold: a tap opens it', fold.openAfterTap && fold.rowsVisibleOpen === 6 && fold.flag === true,
     JSON.stringify({ open: fold.openAfterTap, rows: fold.rowsVisibleOpen, flag: fold.flag }));
  ok('fold: nothing is lost when open', fold.prose >= 4, fold.prose + ' prose lines');
  ok('fold: folding actually saves height', fold.openH > fold.hiddenH + 150,
     fold.hiddenH + ' folded vs ' + fold.openH + ' open');

  // ---- and the point of all of it: the folded screen FITS ----------------
  const fits = await p.evaluate(() => {
    const ov = document.getElementById('overlay');
    return { scrollH: ov.scrollHeight, clientH: ov.clientHeight };
  });
  ok('phone: the folded result fits one screen', fits.scrollH <= fits.clientH + 2,
     fits.scrollH + 'px of content in ' + fits.clientH + 'px');

  // ---- unfolded it OVERFLOWS, and that is when scrolling has to work ------
  const scrolls = await p.evaluate(() => {
    const ov = document.getElementById('overlay');
    document.querySelector('#ovStats button.statshead').click();   // open the table again
    const scrollH = ov.scrollHeight;
    ov.scrollTop = 99999;
    const bottom = ov.scrollTop + ov.clientHeight;
    const minTop = Math.min(...[...ov.children].filter(c => c.getBoundingClientRect().height > 0)
      .map(c => c.getBoundingClientRect().top + ov.scrollTop));
    ov.scrollTop = 0;
    return { scrollH, clientH: ov.clientHeight, bottom, minTop };
  });
  ok('phone: the open table really does overflow', scrolls.scrollH > scrolls.clientH,
     'nothing to scroll — the fixture stopped exercising this');
  ok('phone: scrolling reaches the bottom', scrolls.bottom >= scrolls.scrollH - 2,
     'stopped at ' + scrolls.bottom + ' of ' + scrolls.scrollH);
  ok('phone: still nothing above the top when open', scrolls.minTop >= -1,
     'topmost child at y=' + scrolls.minTop);

  // and with it open, the buttons still have to be reachable
  const open = await reach();
  for (const id of Object.keys(open)) ok('phone (open): ' + id + ' pressable', open[id] === 'ok', open[id]);

  await p.close();
}

// ---------------------------------------------------------------- DESKTOP
// ⚠️ The fold is a PHONE answer to a PHONE problem. A wide screen has the room and
// must not have the scoresheet taken away from it.
{
  const p = await openResult(1280, 900, false);
  const wide = await p.evaluate(() => {
    const host = document.getElementById('ovStats'), ov = document.getElementById('overlay');
    return {
      folded: host.classList.contains('lean'),
      rowsVisible: [...host.querySelectorAll('.statsrow:not(.shead)')]
        .filter(r => r.getBoundingClientRect().height > 0).length,
      minTop: Math.min(...[...ov.children].filter(c => c.getBoundingClientRect().height > 0)
        .map(c => c.getBoundingClientRect().top)),
      overflowY: getComputedStyle(ov).overflowY,
    };
  });
  ok('desktop: starts open', !wide.folded);
  ok('desktop: all six rows shown', wide.rowsVisible === 6, wide.rowsVisible + ' visible');
  ok('desktop: nothing above the viewport', wide.minTop >= -1, 'topmost child at y=' + wide.minTop);
  ok('desktop: the overlay can still scroll if it needs to', /auto|scroll/.test(wide.overflowY));
  await p.close();
}

await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
if (fails.length){ console.log('FAIL resultfit\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS resultfit');
