// THE SCORE AS BALLS BEHIND THE GOALS — the second score readout, and its toggle.
//
// Asked for from a picture of another game: "instead of showing a number, have circles
// behind both goals indicating the score. The circles show 3 empty if the game is first
// to 3 and then they fill up with soccer balls as a team scores. Circles need to be
// small." So there are five separate claims here and they fail in different ways:
//
//   1. THE SHIPPED GAME IS UNCHANGED. `scoreStyle` defaults to `num`, and every check
//      below that reads "with pips on" is worth nothing if turning them on was not a
//      choice. This is checked FIRST, for the reason `tests/sprint.mjs` records: every
//      other block sets the setting by hand, so all of them would pass on a build that
//      shipped the wrong default.
//   2. THE ROW IS DRAWN AND IT FILLS. Measured as a DIFFERENCE against the same frame
//      with the style set back to `num` — a goal already has a frame, a diamond mesh and
//      two posts within a few pixels of where the pips go, so an absolute ink count in
//      that band reads well above zero on a build that draws no pips at all.
//   3. THE COUNT IS THE RULE. `goalsTarget` where the match has one; the shipped length
//      is a TIMED five minutes and has none, so there the row is what has been scored
//      plus one empty. A row of N empties on a timed match would claim a target the
//      rules do not have.
//   4. EACH END IS ITS OWN SIDE'S SCORE. Scoring for team 0 must change the band behind
//      team 0's goal and leave the other one alone — a build that reads the wrong team,
//      or paints both ends from one score, looks identical from `w.score`.
//   5. SMALL, AND ON EVERY COURT. Measured in DRAWN PIXELS across all 34 fields with a
//      floor AND a ceiling — see that block for why a ratio against the ball, which is
//      what was written first and is what this file's decoy rule would suggest, reads
//      2.99 on Leviathan on a perfectly good build.
//
// ⚠️ MEASUREMENT TRAP, and it produced a false result first: the pips are a few pixels
// across and sit outside the pitch, so a band sampled from world coordinates has to go
// through `screenPt(wx(x), wy(y))` — `wx`/`wy` alone are PRE-rotation, and `sel.orient`
// answers 'h' on any wide window, which puts the ends at the LEFT and RIGHT of the canvas
// rather than the top and bottom. A probe that assumed screen-down was world +y measured
// the middle of the pitch and reported no pips on a build that draws them perfectly.
//
// ⚠️ MEASUREMENT TRAP: `juiceReset()` before any pixel reading that follows a match with
// goals in it. `flash` is module-level juice decayed only in `loop()`, so a headless
// probe leaves a full-screen wash in the last scorer's colour over every later frame.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (c, msg) => { if (!c) fails.push(msg); };

const p = await b.newPage({ viewport:{ width:1280, height:900 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear();
  localStorage.setItem('magnetball.firstrun','1'); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const cv = document.getElementById('game'), c2 = cv.getContext('2d');
  // The canvas is authored at device pixels; every coordinate below comes out of
  // `screenPt`, which is CSS pixels, so it has to be scaled up to index the buffer.
  const DPR = Math.max(1, cv.width / cv.clientWidth);

  // ---- 1. the shipped default ---------------------------------------------
  o.defaultStyle = M.defaultSel().scoreStyle;
  o.tiles = document.querySelectorAll('#scorePick .opt').length;
  // ⚠️ The ROW's own display, not the tile count — the tiles are built whether or not the
  // row is shown, so a build that hid the picker everywhere would leave a tile count of 2
  // and the "hidden on a phone" pairing in block 6 would pass on the toggle being
  // unreachable. Caught by sabotage.
  o.pickerShown = getComputedStyle(document.getElementById('scoreStyleRow')).display !== 'none';

  // A frozen match: nothing moves behind a pixel reading, and no bot can wander into
  // the band being sampled. `ctrl:'none'` plus a parked ball is `tests/floaters.mjs`'
  // staging rule.
  const stage = (over) => {
    M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.juice = false; M.sel.adsOn = 'off';
    M.sel.length = 'g3'; M.sel.field = 'classic'; M.sel.kickoffRule = 'off';
    M.sel.popups = 'off'; M.sel.scoreStyle = 'pips';
    Object.assign(M.sel, over || {});
    M.setMatchSeed(11); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (const q of w.players){ q.x = 0; q.y = 0; q.vx = q.vy = 0; q.ctrl = 'none'; }
    w.ball.x = 0; w.ball.y = 0; w.ball.vx = w.ball.vy = 0;
    M.juiceReset(); M.computeCam();
    return w;
  };
  const frame = () => { M.computeCam(); M.render();
                        return c2.getImageData(0, 0, cv.width, cv.height).data; };
  // Changed pixels between two frames, optionally only inside a screen-space box.
  const diff = (a, ref, box) => {
    let n = 0;
    const x0 = box ? Math.max(0, box.x0) : 0, x1 = box ? Math.min(cv.width-1, box.x1) : cv.width-1;
    const y0 = box ? Math.max(0, box.y0) : 0, y1 = box ? Math.min(cv.height-1, box.y1) : cv.height-1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){
      const i = (y*cv.width + x)*4;
      if (Math.abs(a[i]-ref[i]) + Math.abs(a[i+1]-ref[i+1]) + Math.abs(a[i+2]-ref[i+2]) > 24) n++;
    }
    return n;
  };
  // The box a goal's pip row occupies, in DEVICE pixels, through screenPt — see the
  // header's first trap. Generous across the row and tight along it.
  const bandOf = (w, sign) => {
    const bb = w.bounds;
    const row = M.pipRow(w, sign < 0 ? 1 : 0);
    const yW = sign*(bb.halfL + bb.net + row.out);
    const pt = M.screenPt(M.wx(0), M.wy(yW));
    const rr = row.r * M.cam.s, wide = Math.max(14, rr*10);
    return { x0: Math.round((pt[0]-wide)*DPR), x1: Math.round((pt[0]+wide)*DPR),
             y0: Math.round((pt[1]-wide)*DPR), y1: Math.round((pt[1]+wide)*DPR) };
  };

  {
    // Read the scorebug at the DEFAULT before anything touches the setting.
    M.sel.scoreStyle = M.defaultSel().scoreStyle;
    stage({ scoreStyle: M.defaultSel().scoreStyle });
    M.syncScorebug();
    o.defaultShowsDigits = getComputedStyle(document.getElementById('scoreR')).display !== 'none';
  }

  // ---- 2. the row is drawn, and it fills ----------------------------------
  {
    const w = stage();
    const bandA = bandOf(w, 1), bandB = bandOf(w, -1);
    M.sel.scoreStyle = 'num'; const off = frame();
    M.sel.scoreStyle = 'pips';
    w.score[0] = 0; w.score[1] = 0; const s0 = frame();
    w.score[0] = 1;                 const s1 = frame();
    w.score[0] = 3;                 const s3 = frame();
    o.emptyRow = diff(s0, off, bandA);
    o.oneScored = diff(s1, off, bandA);
    o.fullRow  = diff(s3, off, bandA);
    // Two draws of one state must be identical, or every number above is noise.
    o.sameTwice = diff(frame(), s3, null);
    // ---- 4. the other end is that side's own score ------------------------
    o.otherEndAtZero = diff(s3, s0, bandB);
    o.thisEndMoved   = diff(s3, s0, bandA);
    w.score[1] = 2; const t2 = frame();
    o.otherEndFollows = diff(t2, s3, bandB);
    o.thisEndHeld     = diff(t2, s3, bandA);
  }

  // ---- 3. the count is the rule -------------------------------------------
  {
    let w = stage({ length:'g3' }); o.slotsG3 = M.pipSlots(w, 0);
    w = stage({ length:'g5' });     o.slotsG5 = M.pipSlots(w, 0);
    w = stage({ length:'5'  });
    o.slotsTimed0 = M.pipSlots(w, 0);
    w.score[0] = 4; o.slotsTimed4 = M.pipSlots(w, 0);
    o.timedHasNoTarget = (w.goalsTarget|0) === 0;
  }

  // ---- 5. small, on every court -------------------------------------------
  {
    const rows = [];
    for (const fk of Object.keys(M.FIELDS)){
      const w = stage({ field: fk });
      // ⚠️ READ OFF `pipRow`, THE FUNCTION THE PAINTER USES, never re-derived here. The
      // first version wrote the radius out again in this file and a sabotage that dropped
      // the mouth cap from the game left every check green — the suite was measuring its
      // own copy of a formula the game had stopped using. Rule 6.
      const at = (sc) => { w.score[0] = sc; return M.pipRow(w, 0); };
      const three = at(2);                         // timed: score + 1 = 3 slots
      // ⚠️ AND THE CAP IS EXERCISED WHERE IT ACTUALLY BINDS. At three slots it never
      // does — `rNet*net` is far under the mouth budget on every court — so a fit check
      // taken only there passes on a build with no cap at all.
      const many = at(12);                         // 13 slots, where the mouth budget bites
      rows.push({ f: fk,
                  pipPx: +(three.r*M.cam.s).toFixed(2),
                  ballPx: +(w.ball.r*M.cam.s).toFixed(2),
                  ratio: +(three.r/w.ball.r).toFixed(3),
                  fitsMouth: three.width <= w.bounds.gh*2 + 0.01,
                  manyFits: many.width <= w.bounds.gh*2 + 0.01,
                  capBinds: many.r < M.PIPS.rNet*w.bounds.net - 1e-9 });
      w.score[0] = 0;
    }
    o.capBindsOn = rows.filter(x => x.capBinds).length;
    o.courts = rows.length;
    o.manyMisses = rows.filter(x => !x.manyFits).map(x => x.f);
    o.smallest = rows.reduce((a, x) => x.pipPx < a.pipPx ? x : a);
    o.biggest  = rows.reduce((a, x) => x.pipPx > a.pipPx ? x : a);
    o.widestRatio = rows.reduce((a, x) => Math.max(a, x.ratio), 0);
    o.mouthMisses = rows.filter(x => !x.fitsMouth).map(x => x.f);
    o.minPipPx = o.smallest.pipPx;
    o.maxPipPx = o.biggest.pipPx;
  }

  // ---- the digits, and the one predicate that decides -----------------------
  {
    stage(); M.syncScorebug();
    o.pipsHideDigits = getComputedStyle(document.getElementById('scoreR')).display === 'none';
    o.clockStays = getComputedStyle(document.getElementById('clock')).display !== 'none';
    M.sel.scoreStyle = 'num'; M.syncScorebug();
    o.numbersShowDigits = getComputedStyle(document.getElementById('scoreR')).display !== 'none';
    // ⚠️ Training's `#scoreB` is that mode's practice-goal counter rather than a score, so
    // the pips stand down there and the digits must NOT be taken away. This is the claim
    // that says the class is written off `pipsDrawn` and not off `sel.scoreStyle`.
    M.sel.scoreStyle = 'pips'; M.sel.mode = 'train'; M.startMatch(); M.syncScorebug();
    o.trainKeepsDigits = getComputedStyle(document.getElementById('scoreR')).display !== 'none';
    o.trainNoPips = !M.pipsDrawn(M.world);
  }

  // ---- the camera, and the boards getting out of the way --------------------
  {
    const w = stage({ adsOn:'off' });
    M.sel.scoreStyle = 'num'; M.computeCam(); const off = M.cam.s;
    M.sel.scoreStyle = 'pips'; M.computeCam(); const on = M.cam.s;
    o.camNoAdsOff = +off.toFixed(4); o.camNoAdsOn = +on.toFixed(4);
    o.depth = +M.pipDepth(w).toFixed(2);

    stage({ adsOn:'on' });
    M.sel.scoreStyle = 'num'; M.computeCam(); const adsOff = M.cam.s;
    const endNum = M.adSlotRects(M.world).filter(q => q.along === 'x')
                    .reduce((a, q) => Math.max(a, Math.abs(q.y)), 0);
    const sideNum = M.adSlotRects(M.world).filter(q => q.along === 'y')
                    .reduce((a, q) => Math.max(a, Math.abs(q.x)), 0);
    M.sel.scoreStyle = 'pips'; M.computeCam(); const adsOn = M.cam.s;
    const endPip = M.adSlotRects(M.world).filter(q => q.along === 'x')
                    .reduce((a, q) => Math.max(a, Math.abs(q.y)), 0);
    const sidePip = M.adSlotRects(M.world).filter(q => q.along === 'y')
                    .reduce((a, q) => Math.max(a, Math.abs(q.x)), 0);
    o.camAdsNum = +adsOff.toFixed(4); o.camAdsPips = +adsOn.toFixed(4);
    o.adsCostPct = +(((adsOff - adsOn)/adsOff)*100).toFixed(2);
    o.endBoardsMoved = +(endPip - endNum).toFixed(2);
    o.sideBoardsMoved = +(sidePip - sideNum).toFixed(2);
    o.pipDepthAds = +M.pipDepth(M.world).toFixed(2);
    // ⚠️ **MOVING THE BOARDS AND HOLDING THEM ARE TWO CHANGES AND A SABOTAGE PROVED IT.**
    // Leaving `computeCam` on `adReach` — so the frame is fitted as though the pips were
    // not there — still moves the boards out and still passes every check above, and what
    // it does is push the outermost hoarding off the edge of the canvas. So the claim is
    // measured where it shows: the far side of the outermost END board, through
    // `screenPt`, has to land inside the canvas with its own margin to spare.
    const farEnd = (w) => {
      const rects = M.adSlotRects(w).filter(q => q.along === 'x');
      let worst = Infinity;
      for (const q of rects){
        const fy = q.y + Math.sign(q.y)*q.depth/2;
        const pt = M.screenPt(M.wx(q.x), M.wy(fy));
        worst = Math.min(worst, pt[0], pt[1], cv.clientWidth - pt[0], cv.clientHeight - pt[1]);
      }
      return +worst.toFixed(1);
    };
    M.sel.scoreStyle = 'num';  M.computeCam(); o.boardMarginNum  = farEnd(M.world);
    M.sel.scoreStyle = 'pips'; M.computeCam(); o.boardMarginPips = farEnd(M.world);
  }

  // ---- render only ---------------------------------------------------------
  {
    const hash = (style) => {
      M.sel.scoreStyle = style;
      M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.length = '5'; M.sel.field = 'classic';
      M.setMatchSeed(7); M.startMatch();
      const w = M.world; w.state = 'play'; w.stateT = 2;
      let h = 0;
      for (let i = 0; i < 900; i++){
        M.step(w);
        if (i % 30 === 0) M.render();
        for (const q of w.players) h = (h*31 + Math.round(q.x*1e3) + Math.round(q.y*1e3))|0;
        h = (h*31 + Math.round(w.ball.x*1e3) + Math.round(w.ball.y*1e3))|0;
      }
      return h + '|' + w.score.join('-') + '|' + w.aiTick;
    };
    o.hashNum = hash('num');
    o.hashPips = hash('pips');
  }
  return o;
});

// ---- 6. NOT ON A PHONE ----------------------------------------------------------
// Asked for after the feature shipped: "don't apply this method of score showing on
// mobile". The reason is a measurement rather than a preference — on a 390×844 handset
// `cam.s` is 0.656 against a desktop's 1.350, so a pip on Classic is drawn at 3.44px with
// a 1.6px pentagon inside it, against 7.09px. Small was the ask; a smear is not.
//
// ⚠️ **THE CONTROL IS THE DESKTOP PAGE ABOVE, IN THE SAME RUN.** "No pips on a phone" is
// equally true of a build that draws none anywhere, which is the whole feature deleted —
// so every claim here is paired with the desktop numbers, and a sabotage that makes
// `pipsDrawn` answer false everywhere reddens block 2 rather than this one.
//
// ⚠️ **AND THE PICKER IS CHECKED SEPARATELY FROM THE DRAW.** They are two changes: a build
// that stands the pips down and leaves the tile pressable is a dead control, and a build
// that hides the tile and still draws them is worse. Sabotaging either alone reddens only
// its own check.
const mp = await b.newPage({ viewport:{ width:390, height:844 }, deviceScaleFactor:3,
                             hasTouch:true, isMobile:true });
mp.on('pageerror', e => errors.push('phone: ' + e.message));
mp.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push('phone: ' + m.text()); });
await mp.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear();
  localStorage.setItem('magnetball.firstrun','1'); });
await mp.goto('file://' + process.cwd() + '/index.html');
await mp.waitForTimeout(900);

const ph = await mp.evaluate(() => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const cv = document.getElementById('game'), c2 = cv.getContext('2d');
  const DPR = Math.max(1, cv.width / cv.clientWidth);

  o.viewMode = M.viewMode();
  o.isTouch = M.isTouchLayout();

  // The picker row, read at boot with nothing called by hand — the wiring, not the helper.
  const row = document.getElementById('scoreStyleRow');
  o.pickerHidden = !!row && getComputedStyle(row).display === 'none';
  o.offered = M.scoreStyleOffered();

  const stage = (over) => {
    M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.juice = false; M.sel.adsOn = 'off';
    M.sel.length = 'g3'; M.sel.field = 'classic'; M.sel.kickoffRule = 'off';
    M.sel.popups = 'off'; M.sel.scoreStyle = 'pips';
    Object.assign(M.sel, over || {});
    M.setMatchSeed(11); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (const q of w.players){ q.x = 0; q.y = 0; q.vx = q.vy = 0; q.ctrl = 'none'; }
    w.ball.x = 0; w.ball.y = 0; w.ball.vx = w.ball.vy = 0;
    M.juiceReset(); M.computeCam();
    return w;
  };
  const frame = () => { M.computeCam(); M.render();
                        return c2.getImageData(0, 0, cv.width, cv.height).data; };
  const diff = (a, ref) => { let n = 0;
    for (let i = 0; i < a.length; i += 4)
      if (Math.abs(a[i]-ref[i]) + Math.abs(a[i+1]-ref[i+1]) + Math.abs(a[i+2]-ref[i+2]) > 24) n++;
    return n; };

  {
    const w = stage();
    o.pipsDrawn = M.pipsDrawn(w);
    o.depth = +M.pipDepth(w).toFixed(2);
    // What the row WOULD have drawn at, for the record: `pipRow` is pure arithmetic and
    // answers whether or not anything is painted, which is what makes it quotable.
    o.wouldBePipPx = +(M.pipRow(w, 0).r * M.cam.s).toFixed(2);
    M.syncScorebug();
    o.digitsShown = getComputedStyle(document.getElementById('scoreR')).display !== 'none';
    o.bugHasPipsClass = document.getElementById('scorebug').classList.contains('pips');
    // Nothing is painted anywhere: the WHOLE frame, not a band — with the pips stood down
    // there is no band to aim at, and a whole-frame diff cannot miss a row drawn somewhere
    // a band probe was not looking.
    w.score[0] = 3; w.score[1] = 2;
    M.sel.scoreStyle = 'num';  const off = frame();
    M.sel.scoreStyle = 'pips'; const on  = frame();
    o.frameUnchanged = diff(on, off);
  }
  // The camera and the hoardings are untouched, which is the whole point of the stand-down
  // living in one predicate: `pipDepth` falls to 0, so neither has a second branch.
  // ⚠️ **AND THE HOARDINGS ARE NOT THERE EITHER ANY MORE**, which is why `adSlotRects` is
  // read through `|| []`: the ads were stood down on a phone in the same batch as this
  // (their words fit at 6.1px there, and sideways at none at all), so the end rows this
  // block was written to watch do not exist. The claim narrows honestly rather than being
  // deleted — with no rows to move, "the boards did not move" is still true and the CAMERA
  // check is the half that carries the weight.
  {
    stage({ adsOn:'on' });
    const endRow = () => (M.adSlotRects(M.world) || []).filter(q => q.along === 'x')
                           .reduce((a, q) => Math.max(a, Math.abs(q.y)), 0);
    M.sel.scoreStyle = 'num';  M.computeCam(); const camNum = M.cam.s; const endNum = endRow();
    M.sel.scoreStyle = 'pips'; M.computeCam(); const camPip = M.cam.s; const endPip = endRow();
    o.camNum = +camNum.toFixed(4); o.camPips = +camPip.toFixed(4);
    o.endBoardsMoved = +(endPip - endNum).toFixed(2);
    o.adRowsOnPhone = (M.adSlotRects(M.world) || []).length;
  }
  return o;
});

await b.close();

console.log(JSON.stringify(r, null, 1));
console.log('PHONE:', JSON.stringify(ph, null, 1));

// 1 — the shipped game is unchanged, and this is asserted before anything else because
//     every block above set the style by hand and would pass on a wrong default.
ok(r.defaultStyle === 'num',
   `the shipped score readout moved: defaultSel().scoreStyle is ${r.defaultStyle}`);
ok(r.defaultShowsDigits, 'the scorebug has no digits at the shipped default');
ok(r.tiles === 2, `the Score readout picker has ${r.tiles} tiles, expected 2`);

// 2 — the row is drawn, and it fills. Measured as a difference, so every number here is
//     pips and nothing else; paired with "two draws of one state agree" or it is noise.
ok(r.sameTwice === 0,
   `two draws of one state differ by ${r.sameTwice} pixels, so every reading below is noise`);
ok(r.emptyRow > 40,
   `nothing is drawn behind the goal with the Balls readout on: ${r.emptyRow} pixels changed`);
ok(r.oneScored > r.emptyRow + 10,
   `a goal did not fill a slot: empty ${r.emptyRow}, one scored ${r.oneScored}`);
ok(r.fullRow > r.oneScored + 10,
   `the row is not monotone in the score: 0 → ${r.emptyRow}, 1 → ${r.oneScored}, 3 → ${r.fullRow}`);

// 4 — each end is its own side's score. Both directions, or "the far end did not move"
//     is equally true of a build that draws one end and nothing at the other.
ok(r.thisEndMoved > 10,
   `scoring for team 0 changed nothing behind team 0's goal (${r.thisEndMoved})`);
ok(r.otherEndAtZero === 0,
   `team 0 scoring changed the row behind team 1's goal by ${r.otherEndAtZero} pixels — ` +
   `each end shows the score of the side that DEFENDS it`);
ok(r.otherEndFollows > 10,
   `team 1 scoring changed nothing behind team 1's goal (${r.otherEndFollows})`);
ok(r.thisEndHeld === 0,
   `team 1 scoring moved team 0's row by ${r.thisEndHeld} pixels`);

// 3 — the count is the rule, and the shipped length is the one with no target.
ok(r.slotsG3 === 3, `first to 3 drew ${r.slotsG3} slots`);
ok(r.slotsG5 === 5, `first to 5 drew ${r.slotsG5} slots`);
ok(r.timedHasNoTarget, 'the timed length grew a goalsTarget — the rest of this block is vacuous');
ok(r.slotsTimed0 === 1 && r.slotsTimed4 === 5,
   `a timed match should show what has been scored plus one empty: 0-0 drew ${r.slotsTimed0}, ` +
   `4 drew ${r.slotsTimed4}`);

// 5 — small, and on every court, measured in DRAWN PIXELS with both a floor and a
//     ceiling. Either bound alone is vacuous: a floor is met by a row of dinner plates
//     and a ceiling by a row of nothing.
//     ⚠️ **A RATIO AGAINST THE BALL WAS WRITTEN FIRST AND IT IS THE WRONG INSTRUMENT.**
//     It read 2.99 on Leviathan on a perfectly good build, because the ball is an
//     ABSOLUTE world size (r 10 on every court) while the pips are a fraction of the net
//     so that they stay legible when `cam.s` collapses. The two therefore diverge by the
//     court's whole size range and the ratio says nothing about either. It is also the
//     wrong RULE: the decoy argument it borrows is about things on the PITCH, and these
//     stand beyond the net where the ad boards are already deeper than the ball is wide.
//     What "the circles need to be small" actually means is a number of pixels.
ok(r.minPipPx >= 4,
   `the smallest drawn pip is ${r.minPipPx}px (on ${r.smallest.f}) — a readout nobody can read`);
ok(r.maxPipPx <= 10,
   `the biggest drawn pip is ${r.maxPipPx}px (on ${r.biggest.f}) — "the circles need to be small"`);
ok(r.mouthMisses.length === 0,
   `the row is wider than the goal it belongs to on: ${JSON.stringify(r.mouthMisses)}`);
// ⚠️ The fit check below is only worth having where the cap is what is doing the fitting.
// At three slots `rNet*net` is under the mouth budget on every court in the table, so a
// row measured only there fits on a build with no cap at all. Courts whose mouth is
// generous relative to their net still do not need it at thirteen, which is fine — what
// has to be true is that the branch is exercised SOMEWHERE and that nothing overflows.
ok(r.capBindsOn > 0,
   `the mouth cap binds on none of the ${r.courts} courts even at thirteen slots, so the ` +
   `fit check below cannot see a build that dropped it`);
ok(r.manyMisses.length === 0,
   `a long timed match runs the row past the goal it belongs to on: ${JSON.stringify(r.manyMisses)}`);

// the digits, and the one predicate
ok(r.pipsHideDigits, 'the Balls readout left the digits in the scorebug as well');
ok(r.clockStays, 'the clock went with the digits — it is the one thing the pips cannot say');
ok(r.numbersShowDigits, 'the Numbers readout has no digits');
ok(r.trainNoPips && r.trainKeepsDigits,
   `training lost its practice-goal counter: pips ${!r.trainNoPips}, digits ${r.trainKeepsDigits}`);

// the camera
ok(r.camNoAdsOff === r.camNoAdsOn,
   `the Balls readout costs pitch scale with the boards down (${r.camNoAdsOff} → ${r.camNoAdsOn}); ` +
   `at ${r.depth} world units the row is inside the 30-unit brim and should be free`);
ok(r.endBoardsMoved > 1 && Math.abs(r.endBoardsMoved - r.pipDepthAds) < 0.01,
   `the end hoardings did not move out by exactly the pip row's depth: moved ${r.endBoardsMoved}, ` +
   `row is ${r.pipDepthAds} deep — one owner, or a board lands on the score`);
ok(r.sideBoardsMoved === 0,
   `the touchline hoardings moved by ${r.sideBoardsMoved} — the pips are only at the ends`);
ok(r.boardMarginPips > 0,
   `the outermost end hoarding is ${r.boardMarginPips}px outside the canvas with the Balls ` +
   `readout on (${r.boardMarginNum}px of margin with it off) — the boards were moved out ` +
   `and the camera was not told, so a board nobody can see is a feature that does not exist`);

// render only
ok(r.hashNum === r.hashPips,
   `the score readout changed the match: ${r.hashNum} vs ${r.hashPips}`);

// 6 — not on a phone. Each of these is paired with the desktop page's own numbers above,
//     which is what stops "no pips here" being satisfied by the feature being deleted.
ok(ph.viewMode === 'mobile' && ph.isTouch,
   `the phone context is not a phone layout (${ph.viewMode}) — the rest of this block is vacuous`);
ok(!ph.pipsDrawn,
   `the Balls readout is still drawn on a phone, where a pip comes out ${ph.wouldBePipPx}px across ` +
   `against ${r.smallest.pipPx}-${r.biggest.pipPx}px on a desktop`);
ok(ph.digitsShown && !ph.bugHasPipsClass,
   `a phone lost its scorebug digits (shown ${ph.digitsShown}, .pips ${ph.bugHasPipsClass}) — ` +
   `standing the row down has to give the numbers back, or there is no score on screen at all`);
ok(ph.frameUnchanged === 0,
   `${ph.frameUnchanged} pixels differ between the two readouts on a phone — something is ` +
   `still being painted`);
ok(ph.depth === 0 && ph.endBoardsMoved === 0 && ph.camNum === ph.camPips,
   `the phone still pays for a row it does not draw: depth ${ph.depth}, boards moved ` +
   `${ph.endBoardsMoved}, camera ${ph.camNum} → ${ph.camPips}`);
ok(ph.pickerHidden && !ph.offered,
   `the Score readout picker is still on the menu on a phone (display shown: ${!ph.pickerHidden}) — ` +
   `a tile that sets a value nothing acts on is a dead control`);
// The other half of that pairing: it must still be THERE on a desktop, or "hidden on a
// phone" is satisfied by a build that hid it everywhere and the toggle is unreachable.
ok(r.pickerShown,
   'the Score readout picker is hidden on a desktop too — the toggle is unreachable');

console.log('COST: with the boards up the Balls readout costs ' + r.adsCostPct +
            '% of pitch scale (' + r.camAdsNum + ' → ' + r.camAdsPips + '); with them down, nothing.');
console.log('PIPS: ' + r.smallest.pipPx + 'px on ' + r.smallest.f + ', ' +
            r.biggest.pipPx + 'px on ' + r.biggest.f + '; against the ball it runs ' + r.widestRatio + ' at the extreme, which is why that is not the bar — see the block header.');
console.log('ERRORS:', errors.length ? errors : 'none');
if (errors.length) fails.push('console/page errors: ' + errors.slice(0,3).join(' | '));
console.log(fails.length ? 'FAILED: ' + JSON.stringify(fails, null, 1) : 'RESULT: ALL PASS');
process.exit(fails.length ? 1 : 0);
