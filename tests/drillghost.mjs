// DRILL GHOSTS — race your three best runs at once, and a machine that can play a drill.
//
// ⚠️ **THREE AT ONCE, COLOURED BY RANK.** One ghost says whether you are ahead of your
// best; three say what the SHAPE of your own improvement was — where the gold run took a
// line the bronze one did not. Gold, silver, bronze, and the colour is the only label
// they need.
//
// ⚠️ **SAMPLED AT 10Hz AND INTERPOLATED, and that is what makes them smooth.** Stepping a
// recording frame by frame is what a replay does, and at a rate you can afford to store
// it reads as a stutter — which is why a ghost recorded that way never looks like the
// ones in Braid or a kart game. Those interpolate a CURVE through sparse keyframes.
// Catmull-Rom, not a straight line: at 10Hz a linear blend puts a visible corner at every
// sample, which is the stutter back again wearing a different hat. Measured as the
// largest jump between densely-sampled points — a corner spikes it.
//
// ⚠️ **10Hz IS WHAT LETS A GHOST TRAVEL.** Three runs of every drill at 60Hz is ~3MB, more
// than the whole localStorage budget and far more than a save anybody could send. The
// suite pins the projected size for all 24 drills, because that number is the reason the
// rate is what it is.
//
// ⚠️ THE MACHINE THAT PLAYS A DRILL (`drillAutoPad`) is NOT the yardstick the timings are
// set by, and this suite used to say it was. It is a reactive controller against two dozen
// hand-designed obstacle courses: it finishes the open ones and cannot do the ones built
// round a wall or needing a threaded shot, so it reaches 8 of 25 — a third of the range,
// which measures nothing about the other seventeen. The clocks are set by design judgement
// (a bad player inside thirty seconds, a good one inside ten) and the GHOSTS are what
// measures them once people set times.
// ⚠️ So coverage is asserted as a FLOOR, and the absolute claims are the two that hold on
// all 25: it never THROWS and never leaves a drill in a broken state. A course that
// crashes the one thing driving it is a course with something wrong with it, which is
// worth catching whether or not the run completes.
// ⚠️ And on the ones it CAN play, no drill is timed tighter than it managed — the machine
// is a bad player, so a limit it cannot meet is a limit nobody can.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport:{ width:900, height:900 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();

  // Play a drill with the machine, bounded. Returns what happened.
  const play = (key, secs) => {
    M.startDrill(key);
    const w = M.world;
    let i = 0;
    for (; i < (secs || 60) * 60 && !w.drill.complete && !w.drill.failed; i++){
      const pad = M.drillAutoPad(w);
      M.pads.p1.dx = pad.dx; M.pads.p1.dy = pad.dy; M.pads.p1.kick = pad.kick;
      M.stepDrill(w);
    }
    return { done: !!w.drill.complete, failed: !!w.drill.failed,
             t: +w.drill.elapsed.toFixed(2), got: w.drill.doneCount, need: w.drill.total,
             samples: w.drill.rec ? w.drill.rec.p.length / 2 : 0 };
  };

  // ---- 1. recording ---------------------------------------------------------
  const a1 = play('straight_up', 30);
  o.finished = a1.done;
  o.recorded = a1.samples;
  // ⚠️ At 10Hz a run of `t` seconds is about `t*10` samples. Asserted as a RATE rather
  // than a count, or the check breaks whenever a drill's layout changes.
  o.rateLooksRight = Math.abs(o.recorded - a1.t * M.ghostRate()) <= 3;
  o.hz = M.ghostRate();

  // ---- 2. the top three, and only three ------------------------------------
  for (let i = 0; i < 5; i++) play('straight_up', 30);
  const runs = M.drillRuns('straight_up');
  o.kept = runs.length;
  o.keptCap = M.GHOST.keep;
  o.everyRunHasAGhost = runs.every(x => x.p && x.p.length >= 4 && x.b && x.b.length >= 4);
  // Best first, by the drill's OWN direction of "better".
  o.sortedBest = runs.every((x, i) => i === 0 || !M.drillBetter('straight_up', x.t, runs[i-1].t));
  o.topIsFirst = M.drillTop('straight_up') === runs[0].t;
  // ⚠️ A worse run must not displace a better one. Written in directly, because playing
  // badly on purpose is not something the machine can be asked to do.
  M.drillAddRun('straight_up', 99, null);
  o.badRunRefused = M.drillRuns('straight_up').length === 3
                 && M.drillRuns('straight_up').every(x => x.t !== 99);
  // ...and a good one takes the top slot.
  M.drillAddRun('straight_up', 0.01, null);
  o.goodRunTakesIt = M.drillTop('straight_up') === 0.01;

  // ⚠️ BOTH DIRECTIONS OF "BETTER". Break the Targets scores on GOALS where higher wins,
  // and every other drill on time where lower does — one comparator, or somebody's worst
  // run is recorded as their record on exactly one drill.
  o.lowerIsBetter = M.drillBetter('straight_up', 1, 2) === true;
  o.higherIsBetterOnTargets = M.drillBetter('targets', 2, 1) === true;

  // ---- 3. SMOOTHNESS --------------------------------------------------------
  const g = M.drillRuns('straight_up').find(x => x.p);
  // Sample far denser than the recording and measure the biggest jump. A linear blend
  // between 10Hz samples is continuous but has a CORNER at every sample; the giveaway is
  // that the step size changes abruptly, so the check is on the second difference.
  const pts = [];
  for (let t = 0; t < 60; t += 1/240){ const q = M.ghostAt(g, t, 'p'); if (!q) break; pts.push(q); }
  o.densePts = pts.length;
  let maxStep = 0, maxJerk = 0, prevStep = null;
  for (let i = 1; i < pts.length; i++){
    const st = Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]);
    maxStep = Math.max(maxStep, st);
    if (prevStep != null) maxJerk = Math.max(maxJerk, Math.abs(st - prevStep));
    prevStep = st;
  }
  o.maxStep = +maxStep.toFixed(3);
  o.maxJerk = +maxJerk.toFixed(4);
  // ⚠️ **MEASURED AGAINST WHAT A POLYLINE WOULD ACTUALLY DO on the same recording**, not
  // against a number picked out of the air. An absolute threshold says nothing — it
  // depends on how fast the run was and how sharply it turned — and it is the COMPARISON
  // that answers the question the feature was built for: is this smoother than joining
  // the samples with straight lines? The linear baseline is computed right here from the
  // same data, so the check cannot pass by the run happening to be a straight line.
  const linAt = (a, t) => {
    const n = a.length / 2, x = t * M.ghostRate();
    if (x > n - 1) return null;
    const i = Math.max(0, Math.floor(x)), f = x - i, j = Math.min(n - 1, i + 1);
    return [a[i*2] + (a[j*2] - a[i*2]) * f, a[i*2+1] + (a[j*2+1] - a[i*2+1]) * f];
  };
  let linJerk = 0, lp = null, lprev = null;
  for (let t = 0; t < 60; t += 1/240){
    const q = linAt(g.p, t); if (!q) break;
    if (lp){ const st = Math.hypot(q[0]-lp[0], q[1]-lp[1]);
             if (lprev != null) linJerk = Math.max(linJerk, Math.abs(st - lprev));
             lprev = st; }
    lp = q;
  }
  o.linearJerk = +linJerk.toFixed(4);
  o.smooth = o.maxJerk < o.linearJerk * 0.5;
  // ...and it really is a CURVE, not a straight line through the samples: a midpoint
  // between two recorded samples should not sit exactly on the chord unless the run
  // happened to be straight there. Measured on a run with a real turn in it.
  play('turn_right', 30); play('turn_right', 30);
  const g2 = M.drillRuns('turn_right').find(x => x.p);
  o.curved = (() => {
    if (!g2) return false;
    const n = g2.p.length / 2;
    let worst = 0;
    for (let i = 1; i < n - 2; i++){
      const a = M.ghostAt(g2, i / M.ghostRate(), 'p');
      const c = M.ghostAt(g2, (i + 1) / M.ghostRate(), 'p');
      const mid = M.ghostAt(g2, (i + 0.5) / M.ghostRate(), 'p');
      if (!a || !c || !mid) continue;
      worst = Math.max(worst, Math.hypot(mid[0] - (a[0]+c[0])/2, mid[1] - (a[1]+c[1])/2));
    }
    o.bowOffChord = +worst.toFixed(3);
    return worst > 0.05;
  })();
  // ⚠️ Past the end it stops being drawn rather than freezing on the pitch — a ghost that
  // finished ahead of you standing at the finish line is a body that never leaves.
  o.endsCleanly = M.ghostAt(g, 999, 'p') === null;
  o.startsAtStart = !!M.ghostAt(g, 0, 'p');

  // ---- 4. SIZE, which is why the rate is what it is -------------------------
  o.storedBytes = (localStorage.getItem('magnetball.drills') || '').length;
  const withRuns = M.DRILL_KEYS.filter(k => M.drillRuns(k).length).length;
  o.projectedAll = Math.round((o.storedBytes / Math.max(1, withRuns)) * M.DRILL_KEYS.length);
  o.fitsTheBudget = o.projectedAll < 400 * 1024;

  // ---- 5. THE SAVE FILE CARRIES THEM ---------------------------------------
  // ⚠️ Asked for directly. It comes free because `drills` was already a save key — but
  // "free" is exactly the kind of claim that stops being true without a check.
  const doc = M.buildSaveDoc();
  o.saveHasDrills = !!doc.data.drills;
  const firstKey = doc.data.drills && Object.keys(doc.data.drills)[0];
  const first = firstKey && doc.data.drills[firstKey];
  o.saveKeepsRuns = !!(first && first.runs && first.runs.length);
  o.saveKeepsGhostPaths = !!(first && first.runs.some(x => x.p && x.p.length >= 4));
  o.saveBytes = JSON.stringify(doc).length;

  // ---- 6. AN OLDER SAVE STILL WORKS ----------------------------------------
  // ⚠️ `magnetball.drills` used to be `{key: <number>}`. Every reader goes through
  // `drillRuns`/`drillTop` so an old save keeps its times, with no ghost attached.
  o.legacy = (() => {
    const was = JSON.stringify(M.drillBest);
    localStorage.setItem('magnetball.drills', JSON.stringify({ straight_up: 4.25 }));
    const fresh = JSON.parse(localStorage.getItem('magnetball.drills'));
    Object.keys(M.drillBest).forEach(k => delete M.drillBest[k]);
    Object.assign(M.drillBest, fresh);
    const t = M.drillTop('straight_up'), n = M.drillRuns('straight_up').length;
    Object.keys(M.drillBest).forEach(k => delete M.drillBest[k]);
    Object.assign(M.drillBest, JSON.parse(was));
    return { t, n };
  })();
  o.legacyReadable = o.legacy.t === 4.25 && o.legacy.n === 1;

  // ---- 7. THE MACHINE PLAYS THE DRILLS -------------------------------------
  // ⚠️ Reported as a FLOOR, not as "all of them". `drillAutoPad` is a reactive controller
  // against two dozen hand-designed obstacle courses, and claiming it solves every one
  // would be a claim this suite would then have to keep true through every layout change.
  // What IS absolute: it never throws, and it never leaves a drill half-built.
  o.plays = [];
  o.threw = null;
  try {
    for (const key of M.DRILL_KEYS){
      const res = play(key, 45);
      o.plays.push({ key, done: res.done, t: res.t, got: res.got, need: res.need,
                     limit: M.drillLimit(M.DRILLS[key]) });
    }
  } catch(e){ o.threw = e.message; }
  o.solved = o.plays.filter(x => x.done).map(x => x.key);
  o.unsolved = o.plays.filter(x => !x.done).map(x => x.key);
  o.everyDrillRan = o.plays.length === M.DRILL_KEYS.length;
  // ⚠️ Every drill the machine CAN finish has to be finishable inside its own clock, or
  // the limit is set tighter than the drill can be played — which is the failure that
  // started this work.
  o.tooTight = o.plays.filter(x => x.done && x.limit && x.t > x.limit).map(x => x.key);

  return o;
});

// ============================================================
//  THE BOARD — gold, silver and bronze on the screen that just set one
// ============================================================
// ⚠️ Measured on the RENDERED rows, never on the numbers that were handed in: the whole
// point of this screen is that you can see all three at once, so what has to be true is
// that three rows exist, they carry the three values, and the one you took is the one
// marked. Reading `drillRuns()` back would test the table, which section 2 already does.
const board = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const runs = () => M.drillRuns('straight_up');
  const rows = () => Array.from(document.querySelectorAll('#drillBoard .dbrow'));
  const txt = (r, c) => ((r.querySelector('.' + c) || {}).textContent || '').trim();

  // A drill with nothing on the board yet: three rows all the same, all empty.
  localStorage.setItem('magnetball.drills', JSON.stringify({}));
  Object.keys(M.drillBest).forEach(k => delete M.drillBest[k]);
  M.showDrillResult('x', '', true, { key: 'straight_up', rank: -1, t: 9.5 });
  o.emptyRows = rows().length;
  o.emptyAllStated = rows().slice(0, 3).every(r => r.classList.contains('empty'));
  // ⚠️ ...and a run that did not place is still SHOWN, as a fourth row carrying your time.
  o.missRowShown = rows().length === 4 && rows()[3].classList.contains('miss');
  o.missRowSaysYourTime = /9\.50/.test(txt(rows()[3] || document.createElement('i'), 'dbv'));

  // Now three real runs, best first.
  const mk = t => ({ t, hz: 10, p: [0,0, 0,-10, 0,-20, 0,-30] });
  M.drillBest.straight_up = { runs: [mk(2.50), mk(3.50), mk(4.50)] };
  M.showDrillResult('x', '', true, { key: 'straight_up', rank: 1, t: 3.50 });
  const r = rows();
  o.rows = r.length;
  o.values = r.map(x => txt(x, 'dbv'));
  o.places = r.map(x => txt(x, 'dbl'));
  // ⚠️ THE HIGHLIGHT IS ON THE SLOT THE RUN TOOK, and it carries that run's own value —
  // "highlight it with my score" is two claims and a build could satisfy either alone.
  o.youRows = r.filter(x => x.classList.contains('you')).length;
  o.youIsSilver = r[1].classList.contains('you');
  o.youShowsYourScore = txt(r[1], 'dbv') === '3.50s';
  o.youTagged = /THIS RUN/i.test(txt(r[1], 'dbtag'));
  o.goldTagged = /RECORD/i.test(txt(r[0], 'dbtag'));
  // ⚠️ ONE LIST OF MEDAL COLOURS. The rows are painted from `GHOST.cols` — the same three
  // the ghosts are drawn in on the pitch — so a row and the ghost it stands for can never
  // disagree. Read off the live style, not off the constant, or this tests nothing.
  o.cols = r.slice(0, 3).map(x => x.style.getPropertyValue('--m').trim().toLowerCase());
  o.colsFromGhost = JSON.stringify(o.cols) ===
                    JSON.stringify(M.GHOST.cols.map(c => c.toLowerCase()));
  o.colsAllDifferent = new Set(o.cols).size === 3;
  // ...and the row actually renders in that colour rather than merely carrying the token.
  o.goldLabelPainted = getComputedStyle(r[0].querySelector('.dbl')).color;
  o.silverLabelPainted = getComputedStyle(r[1].querySelector('.dbl')).color;

  // Taking the top slot says RECORD and not two tags.
  M.showDrillResult('x', '', true, { key: 'straight_up', rank: 0, t: 2.50 });
  o.topTag = txt(rows()[0], 'dbtag');

  // Break the Targets counts GOALS, and higher is better, so the board must not print
  // "7.00s" for seven goals. ⚠️ The one drill where the units differ.
  o.targetsText = M.drillScoreText('targets', 7);
  o.timeText = M.drillScoreText('straight_up', 7);

  // ⚠️ IT IS ON THE FAILURE SCREEN TOO. What you have to beat is most use on the run that
  // did not get there.
  M.showDrillResult("TIME'S UP", '0/1 gates', false, { key: 'straight_up', rank: -1, t: null });
  o.onFailure = rows().length >= 3;
  o.failureHasNoMissRow = !rows().some(x => x.classList.contains('miss'));   // no time to show

  // ⚠️ AND IT DOES NOT INHERIT A MATCH. `showDrillResult` does not go through
  // `showOverlay`, which is the one place that empties #ovStats — so a drill played after
  // a match came up with that match's team panels under the drill's title.
  const st = document.getElementById('ovStats');
  st.innerHTML = '<div class="teampanels" id="_leak">left over</div>';
  M.showDrillResult('x', '', true, { key: 'straight_up', rank: 0, t: 2.5 });
  o.matchCleared = !document.getElementById('_leak');
  o.boardStillThere = !!document.getElementById('drillBoard');
  return o;
});

ok('the board lists all three places', board.rows === 3 && board.places.join('/') === 'Gold/Silver/Bronze',
   board.rows + ' rows: ' + board.places.join('/'));
ok('...with all three times on it', board.values.join(' ') === '2.50s 3.50s 4.50s', board.values.join(' '));
ok('the slot this run took is the one highlighted', board.youRows === 1 && board.youIsSilver,
   `${board.youRows} highlighted, silver=${board.youIsSilver}`);
ok('...and it carries YOUR score', board.youShowsYourScore && board.youTagged,
   'both halves of "highlight it with my score" — a build could mark the row and print the old time');
ok('the record is marked', board.goldTagged && /RECORD/i.test(board.topTag), board.topTag);
ok('the medal colours come from GHOST.cols', board.colsFromGhost && board.colsAllDifferent,
   board.cols.join(' ') + ' — one list, so a row and the ghost it stands for cannot disagree');
ok('...and the rows really render in them', board.goldLabelPainted !== board.silverLabelPainted,
   `${board.goldLabelPainted} vs ${board.silverLabelPainted} — carrying the token is not painting with it`);
ok('an empty slot is stated, not omitted', board.emptyRows >= 3 && board.emptyAllStated,
   `${board.emptyRows} rows on a drill with no runs`);
ok('a run that did not place is shown anyway', board.missRowShown && board.missRowSaysYourTime,
   'how far off the board you were is the information');
ok('the board is on the failure screen too', board.onFailure && board.failureHasNoMissRow);

// ⚠️ AND THE REAL PATH, not a hand-set table. Every check above hands `showDrillResult` a
// rank and a table that already agree, so they cannot tell whether the row that gets
// highlighted is really the slot the run just took — the honest claim is about `drillDone`
// choosing it, and only playing a drill twice can show that.
const real = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  localStorage.setItem('magnetball.drills', JSON.stringify({}));
  Object.keys(M.drillBest).forEach(k => delete M.drillBest[k]);
  const play = sc => {
    M.startDrill('straight_up'); const w = M.world;
    for (let i = 0; i < 30*60 && !w.drill.complete && !w.drill.failed; i++){
      const pad = M.drillAutoPad(w);
      M.pads.p1.dx = pad.dx*sc; M.pads.p1.dy = pad.dy*sc; M.pads.p1.kick = pad.kick;
      M.stepDrill(w);
    }
    return +w.drill.elapsed.toFixed(2);
  };
  const fast = play(1);            // a good run: takes gold
  const slow = play(0.55);         // a worse one: takes silver behind it
  const rows = Array.from(document.querySelectorAll('#drillBoard .dbrow'));
  const you = rows.findIndex(r => r.classList.contains('you'));
  o.fast = fast; o.slow = slow;
  o.youIndex = you;
  o.youValue = you >= 0 ? (rows[you].querySelector('.dbv') || {}).textContent : '';
  o.goldValue = (rows[0].querySelector('.dbv') || {}).textContent;
  return o;
});
ok('a real run lands in its own slot, with its own time on it',
   real.slow > real.fast && real.youIndex === 1 &&
   real.youValue === real.slow.toFixed(2) + 's' && real.goldValue === real.fast.toFixed(2) + 's',
   `ran ${real.fast}s then ${real.slow}s — highlighted row ${real.youIndex} reads ${real.youValue}, gold reads ${real.goldValue}`);
ok('Break the Targets is counted in GOALS', board.targetsText === '7 goals' && board.timeText === '7.00s',
   board.targetsText + ' / ' + board.timeText);
ok('a drill result does not inherit a match result', board.matchCleared && board.boardStillThere,
   'showDrillResult does not go through showOverlay, which is the one place that empties #ovStats');

// ============================================================
//  A GHOST'S BALL IS NOT THE BALL
// ============================================================
// ⚠️ Reported as the ball being wrong in drills, and it was: each ghost drew a FILLED disc
// at exactly `w.ball.r` in its medal colour, so a drill pitch carried four round objects
// the size of the ball and the gold one sat a body's length from yours in a similar
// lightness. Measured on RENDERED PIXELS at the point `drawGhosts` puts it, because the
// claim is about what it looks like, not about what radius was asked for.
// ⚠️ The check is a PAIR: the centre must be untouched court (it is not filled) AND the rim
// must be inked (it is drawn at all). Either alone passes on a build with no ghost ball —
// which is a different design, and not the one being tested.
const gball = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // ⚠️ The ghost's BALL is put well clear of its own body. With the two on the same point
  // the body — which IS filled, being a body — is drawn straight over the ball and the
  // centre probe reads the body's ink: the first run of this check failed for that reason
  // and not because anything was filled that should not be.
  const mk = t => { const pp = [], bb = []; for (let i = 0; i < 40; i++){
                      pp.push(-60, -200 + i * 4); bb.push(60, -200 + i * 4); }
                    return { t, hz: 10, p: pp, b: bb }; };
  localStorage.setItem('magnetball.drills', JSON.stringify({}));
  Object.keys(M.drillBest).forEach(k => delete M.drillBest[k]);
  M.drillBest.straight_up = { runs: [mk(4), mk(5), mk(6)] };
  M.startDrill('straight_up');
  const w = M.world;
  // Two seconds in, so every ghost is mid-run and well clear of the real ball's spawn.
  for (let i = 0; i < 120; i++) M.stepDrill(w);
  const gb = M.ghostAt(w.drill.ghosts[0], w.drill.elapsed, 'b');
  o.hasGhostBall = !!gb;
  if (!gb) return o;
  // ⚠️ DRAW IT ON PURPOSE. `stepDrill` in a loop advances the sim and never paints, and the
  // rAF loop cannot run inside a synchronous evaluate — so the canvas still holds whatever
  // frame was on it before, and the first version of this probe read the menu's demo.
  M.renderAlpha = 1; M.render();
  const c = document.getElementById('game'), cx = c.getContext('2d');
  const dpr = c.width / c.clientWidth;
  const px = Math.round(M.wx(gb[0]) * dpr), py = Math.round(M.wy(gb[1]) * dpr);
  const rr = Math.max(1.5, w.ball.r * M.GHOST.ballR * M.cam.s) * dpr;
  const at = (x, y) => { const d = cx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
                         return [d[0], d[1], d[2]]; };
  const court = at(px + rr * 6, py);                       // plain court, well clear of it
  const dist = (a, b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]);
  o.centreOffCourt = dist(at(px, py), court);
  let rim = 0;
  for (let a = 0; a < 16; a++){
    const q = at(px + Math.cos(a/16*2*Math.PI) * rr, py + Math.sin(a/16*2*Math.PI) * rr);
    if (dist(q, court) > 10) rim++;
  }
  o.rimInked = rim;
  // ⚠️ ...and the REAL ball still is filled, or "nothing is filled" has been achieved by
  // taking the ball off the pitch.
  const bx = Math.round(M.wx(w.ball.x) * dpr), by = Math.round(M.wy(w.ball.y) * dpr);
  o.realBallFilled = dist(at(bx, by), court) > 30;
  // ⚠️ ...and it is SMALLER than the real one, which is the other half of "not the ball".
  o.ghostBallR = +(w.ball.r * M.GHOST.ballR).toFixed(2);
  o.realBallR = w.ball.r;
  return o;
});

ok('a ghost has a ball at all', gball.hasGhostBall && gball.rimInked >= 10,
   `${gball.rimInked}/16 rim probes inked — in a shot drill the ball leaves the body, and where it went is the line you are beating`);
ok('...but it is HOLLOW, so only the real ball is a filled disc', gball.centreOffCourt <= 10,
   `centre is ${gball.centreOffCourt} off the court colour — it shipped as a filled disc at exactly the ball's radius, which put four balls on a drill pitch`);
ok('...and smaller than the real one', gball.ghostBallR < gball.realBallR * 0.8,
   `${gball.ghostBallR} against ${gball.realBallR}`);
ok('the real ball is still filled', gball.realBallFilled,
   '"nothing is filled" must not be satisfied by there being no ball');
// ⚠️ Bronze at 0.34, filled at a third of that again, was a slightly-darker patch of grass.
// The ORDER is what is pinned, not three magic numbers — retuning must stay monotonic.

// ============================================================
//  THE COACHING DEMONSTRATION — it has to move like somebody playing
// ============================================================
// ⚠️ The old one traced the authored line at CONSTANT speed on a fixed 6.5-second loop,
// wrapped instantly from the end back to the start, and pinned the body a fixed offset
// behind the ball along the current segment — so it sprinted a short route, crawled a
// long one, took hairpins flat out, slid sideways across corners and teleported at the
// end. Every check here is one of those four, and each is written so the OLD build fails
// it: "it moves" and "it follows the line" were true of that build too.
const coach = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const build = key => { M.startDrill(key); return { c: M.world.drill.coach, w: M.world }; };

  // ---- 1. HOW LONG IT TAKES IS HOW FAR IT IS -------------------------------
  // ⚠️ The old build gave a 545-unit route and a 1,255-unit one the same 6.5 seconds.
  const a = build('straight_up').c, b = build('uturn').c;
  o.shortLen = Math.round(a.len); o.longLen = Math.round(b.len);
  o.shortRun = +a.run.toFixed(2);  o.longRun = +b.run.toFixed(2);
  o.lenRatio = +(b.len / a.len).toFixed(2);
  o.runRatio = +(b.run / a.run).toFixed(2);
  // Not equality — it brakes for corners and the U-turn has more of them, so the times
  // may not be exactly proportional. What must be true is that the longer route takes
  // proportionally longer, which a fixed loop cannot do at all.
  o.lengthDecidesTime = o.runRatio > 1.6 && Math.abs(o.runRatio - o.lenRatio) < 0.8;

  // ---- 2. IT IS THE PLAYER'S OWN SPEED -------------------------------------
  // ⚠️ Structural: `coachTop` reads `pAccel`/`pDamp`, the two numbers `integrate` settles a
  // body with, so turning the Speed slider up speeds the demonstration up as well. A
  // hard-coded pace passes every other check in this block.
  const w0 = build('straight_up').w;
  o.topAtDefault = Math.round(M.coachTop(w0));
  const slow = Object.assign({}, w0, { pAccel: w0.pAccel * 0.4 });
  o.topWhenSlower = Math.round(M.coachTop(slow));
  o.speedIsThePlayers = o.topWhenSlower < o.topAtDefault * 0.75;

  // ---- 3. IT BRAKES FOR CORNERS AND STARTS AND STOPS -----------------------
  // Sampled as distance covered per fixed slice of time. A hairpin route must show a real
  // dip somewhere in the middle, and both ends must be near a standstill.
  const c = build('uturn').c;
  const N = 60, dt = c.run / N, step = [];
  for (let i = 0; i < N; i++)
    step.push(M.coachDistAt(c, (i+1)*dt) - M.coachDistAt(c, i*dt));
  const cruise = Math.max.apply(null, step);
  const mid = step.slice(4, N-4);
  o.slowestMidway = +(Math.min.apply(null, mid) / cruise).toFixed(2);
  o.brakesForCorners = o.slowestMidway < 0.8;
  o.startsFromRest = step[0] / cruise < 0.7;
  o.stopsAtTheEnd  = step[N-1] / cruise < 0.7;

  // ---- 4. THE BODY RUNS THE ROUTE, NOT AN OFFSET FROM THE BALL -------------
  // ⚠️ THE decisive one. The old build put the body at `ball − direction × 2.2r`, which at
  // a corner is a point NOWHERE NEAR the route — it cut the corner and slid sideways.
  // Measured as the body's distance to the authored polyline over the whole loop.
  const bp = build('box_path');
  const path = bp.w.drill.def.path, cc = bp.c;
  const toSeg = (p, q, r) => {                       // point p to segment q..r
    const vx = r.x-q.x, vy = r.y-q.y, L2 = vx*vx+vy*vy || 1;
    let t = ((p.x-q.x)*vx + (p.y-q.y)*vy) / L2; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (q.x+vx*t), p.y - (q.y+vy*t));
  };
  const offRoute = pt => { let m = Infinity;
    for (let i=1;i<path.length;i++) m = Math.min(m, toSeg(pt, path[i-1], path[i])); return m; };
  // ⚠️ Driven through the shipped `coachPose`, never by re-deriving "ball minus trail"
  // here — a suite that recomputes the rule is checking its own arithmetic.
  let worstBody = 0, minGap = Infinity, maxGap = 0;
  for (let i = 0; i <= 400; i++){
    const pose = M.coachPose(cc, cc.run * i / 400);
    if (pose.d <= M.COACH.trail * 1.5 || pose.d >= cc.len - 1) continue;   // ends are special
    worstBody = Math.max(worstBody, offRoute(pose.body));
    const gap = Math.hypot(pose.ball.x - pose.body.x, pose.ball.y - pose.body.y) / M.COACH.trail;
    minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap);
  }
  // ⚠️ ...and the DRAW really uses it. Everything above is arithmetic on a helper; this is
  // the one line that says the picture agrees with it, measured as ink at the point the
  // pose names. Without it, `drawCoach` could work the body out its own way for ever.
  {
    const w = bp.w;
    w.drill.coachT = M.COACH.hold + cc.run * 0.55;
    M.renderAlpha = 1; M.render();
    const pose = M.coachPose(cc, M.coachPhase(cc, w.drill.coachT));
    const cnv = document.getElementById('game'), cx2 = cnv.getContext('2d');
    const dpr = cnv.width / cnv.clientWidth;
    const px = Math.round(M.wx(pose.body.x) * dpr), py = Math.round(M.wy(pose.body.y) * dpr);
    const at = (x, y) => { const q = cx2.getImageData(Math.round(x), Math.round(y), 1, 1).data;
                           return [q[0], q[1], q[2]]; };
    const court = at(px, py + 150);   // a stretch of pitch the demonstration is not on
    const dist = (u, v) => Math.abs(u[0]-v[0]) + Math.abs(u[1]-v[1]) + Math.abs(u[2]-v[2]);
    o.inkAtBody = dist(at(px, py), court);
    o.drawUsesThePose = o.inkAtBody > 12;
  }
  o.bodyOffRoute = +worstBody.toFixed(2);
  o.bodyRunsTheRoute = worstBody < 1.5;
  // ⚠️ ...and at a CORNER the straight-line gap CLOSES, because the body is still on the
  // leg before while the ball has turned. Down a straight it is exactly `trail`; through a
  // right-angle it should fall toward trail/root-2. A rigid offset — the old behaviour —
  // holds the gap at 1.00 the whole way round, so the MINIMUM is the thing to look at.
  o.gapMin = +minGap.toFixed(3);
  o.gapMax = +maxGap.toFixed(3);
  o.bodySwingsRoundCorners = minGap < 0.85 && maxGap > 0.95;

  // ---- 5. IT PARKS AT THE ENDS RATHER THAN WRAPPING ------------------------
  // ⚠️ The jump back to the start still happens; it happens while nothing is moving.
  o.holdSecs = M.COACH.hold;
  o.parksAtEnds = M.COACH.hold > 0.3 &&
                  M.coachDistAt(cc, 0) === 0 &&
                  Math.abs(M.coachDistAt(cc, cc.run) - cc.len) < 1;

  // ---- 6. A DRILL WITH NO ROUTE HAS NO DEMONSTRATION, AND DOES NOT THROW ---
  let built = 0, nulls = 0, threw = null;
  try {
    for (const k of M.DRILL_KEYS){ const x = build(k).c; if (x) built++; else nulls++; }
  } catch(e){ threw = e.message; }
  o.builtCount = built; o.nullCount = nulls; o.coachThrew = threw;
  o.everyDrillAnswers = built + nulls === M.DRILL_KEYS.length;
  return o;
});

ok('a longer route takes proportionally longer', coach.lengthDecidesTime,
   `${coach.shortLen}u in ${coach.shortRun}s against ${coach.longLen}u in ${coach.longRun}s — length x${coach.lenRatio}, time x${coach.runRatio}; the old build gave both 6.5s`);
ok('...at the PLAYER\'s own speed, off the Game Feel sliders', coach.speedIsThePlayers,
   `${coach.topAtDefault} u/s, and ${coach.topWhenSlower} u/s with the acceleration turned down — a hard-coded pace passes every other check here`);
ok('it brakes for corners', coach.brakesForCorners,
   `slowest stretch mid-route is ${coach.slowestMidway} of cruising speed`);
ok('...and starts and finishes at a standstill', coach.startsFromRest && coach.stopsAtTheEnd,
   'a demonstration that is already at top speed on the first frame is not one you can copy');
ok('the drawing really uses that pose', coach.drawUsesThePose,
   `${coach.inkAtBody} of ink at the point the pose names — everything else in this block is arithmetic on a helper`);
ok('the body runs the ROUTE, not a fixed offset from the ball', coach.bodyRunsTheRoute,
   `worst ${coach.bodyOffRoute} units off the line — the old body sat at ball minus direction times 2.2r, which at a corner is a point nowhere near the route`);
ok('...so it swings round the outside of a turn', coach.bodySwingsRoundCorners,
   `the body-to-ball gap runs ${coach.gapMin}-${coach.gapMax} of the trail distance — a rigid offset holds it at 1.00 all the way round, and a right-angle should pull it toward 0.71`);
ok('it parks at both ends instead of wrapping mid-stride', coach.parksAtEnds,
   `holds ${coach.holdSecs}s — the jump back to the start still happens, but while nothing is moving`);
ok('every drill answers, and none of them throws', coach.everyDrillAnswers && !coach.coachThrew,
   coach.coachThrew || `${coach.builtCount} with a route, ${coach.nullCount} without`);

// ============================================================
//  ONE BACKSTOP INSTEAD OF ELEVEN CLOCKS
// ============================================================
const clocks = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  o.max = M.DRILLTIME.max;
  o.own = M.DRILL_KEYS.filter(k => M.DRILLS[k].timed);
  o.limits = {}; M.DRILL_KEYS.forEach(k => o.limits[k] = M.drillLimit(M.DRILLS[k]));
  // ⚠️ **EVERY DRILL SCORED ON TIME IS AT THE ONE BACKSTOP; a drill scored on something
  // ELSE sets its own, and there are two of those.** This used to read "every drill except
  // `high`", which was the same claim while Break the Targets was the only drill not
  // measured in seconds — golf is measured in touches, so the exemption is now "the score
  // is not the clock" rather than "this one drill".
  const notTimed = k => M.DRILLS[k].high || M.DRILLS[k].holes;
  o.allAtTheCap = M.DRILL_KEYS.every(k => notTimed(k) || o.limits[k] === M.DRILLTIME.max);
  // ⚠️ Break the Targets keeps its own, because there the clock is the SCORING RULE.
  o.targetsKeepsIts60 = o.limits.targets === 60 && !!M.DRILLS.targets.high;
  // ⚠️ Golf keeps its own for the opposite reason — the clock decides NOTHING there, so it
  // has to be long enough never to fail a real round of eight holes, which the two-minute
  // cap plainly would.
  o.golfHasRoom = o.limits.golf > M.DRILLTIME.max * 2 && !!M.DRILLS.golf.holes;
  // ⚠️ **AND A DRILL WHOSE CLOCK OUTRUNS `GHOST.maxSecs` MUST RECORD NO GHOST**, or the
  // recording stops part way through and the ghost walks off the course. That is the pairing
  // the one-number rule below is really about, stated for the case where the two differ.
  o.longOnesHaveNoGhost = M.DRILL_KEYS.every(k =>
    o.limits[k] <= M.GHOST.maxSecs || !!M.DRILLS[k].holes);
  // ⚠️ The same 120 as GHOST.maxSecs — a recording stops at that mark, so a run may not
  // outlive the ghost of it.
  o.matchesTheRecordingCap = M.DRILLTIME.max === M.GHOST.maxSecs;

  // ⚠️ THE SHIPPED READOUT, called — not its rule copied. Re-deriving "elapsed or
  // countdown?" in the suite is a check on the suite: the first version of this block did
  // exactly that and a sabotage that made the HUD count down on every drill sailed past it.
  M.startDrill('straight_up'); const w = M.world;
  w.drill.elapsed = 3; w.drill.timeLeft = o.max - 3; o.readEarly = M.drillReadout(w.drill);
  w.drill.elapsed = o.max - 5; w.drill.timeLeft = 5; o.readLate = M.drillReadout(w.drill);
  o.showsYourTime = o.readEarly === '3.0s';
  o.countsDownNearTheCap = o.readLate === '5s';
  M.startDrill('targets'); const wt = M.world;
  wt.drill.elapsed = 12; wt.drill.timeLeft = 48; o.readTargets = M.drillReadout(wt.drill);
  o.targetsCountsDown = o.readTargets === '48s';

  // Past the cap it fails; a minute in it does not.
  M.startDrill('straight_up'); const w2 = M.world;
  for (let i = 0; i < 60 * 60; i++) M.stepDrill(w2);
  o.aliveAtAMinute = !w2.drill.failed && !w2.drill.complete;
  for (let i = 0; i < 61 * 60; i++) M.stepDrill(w2);
  o.failsPastTheCap = w2.drill.failed;
  return o;
});

ok('every drill SCORED ON TIME has the same two-minute backstop', clocks.allAtTheCap && clocks.max === 120,
   `${clocks.max}s, and the drills with a clock of their own are ${JSON.stringify(clocks.own)} — a drill may only set its own when its SCORE is not the clock`);
ok('...except Break the Targets, where the clock IS the score', clocks.targetsKeepsIts60);
ok('...and Mini Golf, where the clock decides nothing and a round of eight needs room', clocks.golfHasRoom);
ok('a drill whose clock outruns GHOST.maxSecs records no ghost', clocks.longOnesHaveNoGhost,
   'otherwise the recording stops part way through and the ghost walks off the course');
ok('...and it is the same number a recording stops at', clocks.matchesTheRecordingCap,
   `DRILLTIME.max and GHOST.maxSecs are one number — a shorter cap wastes the headroom, a longer one lets a run outlive its own ghost`);
ok('a time drill shows YOUR TIME, not a countdown', clocks.showsYourTime,
   `reads "${clocks.readEarly}" — what you are racing is your own three best runs`);
ok('...and counts down only in the last seconds', clocks.countsDownNearTheCap,
   `reads "${clocks.readLate}" with 5s left`);
ok('...while Break the Targets counts down throughout', clocks.targetsCountsDown,
   `reads "${clocks.readTargets}" — there the clock is the scoring rule`);
ok('a minute in, nothing has failed you', clocks.aliveAtAMinute,
   'the old limits were 22-45s, so several drills failed a good attempt on the whistle');
ok('...and past two minutes it does', clocks.failsPastTheCap, 'the cap is a backstop, not decoration');

const alphas = await p.evaluate(() => window.__magnet.GHOST.alpha.slice());
ok('the ghosts stay ordered by rank, and bronze is visible', alphas[0] > alphas[1] && alphas[1] > alphas[2] && alphas[2] >= 0.45,
   alphas.join(' > ') + ' — gold asserts itself most, and the quietest is still a ghost you can see');

ok('a run is recorded while you play', r.finished && r.recorded > 4,
   `${r.recorded} samples at ${r.hz}Hz`);
ok('...at the sampling rate, not per frame', r.rateLooksRight,
   `${r.recorded} samples — 60Hz would be six times that, and six times the storage`);
ok('a drill keeps its best three and no more', r.kept === r.keptCap, `${r.kept} kept`);
ok('...each with a ghost attached', r.everyRunHasAGhost);
ok('...best first', r.sortedBest && r.topIsFirst);
ok('a worse run does not displace a better one', r.badRunRefused);
ok('...and a better one takes the top slot', r.goodRunTakesIt);
ok('"better" points BOTH ways', r.lowerIsBetter && r.higherIsBetterOnTargets,
   'time drills are lower-is-better and Break the Targets is higher — one comparator, or somebody\'s worst run becomes their record on exactly one drill');
ok('the ghost is SMOOTHER THAN A POLYLINE', r.smooth,
   `biggest change in step size ${r.maxJerk} against ${r.linearJerk} for straight lines through the same samples — the comparison is the check, because an absolute number depends entirely on how fast the run was and how hard it turned`);
ok('...and genuinely a curve, not a polyline', r.curved,
   `it bows ${r.bowOffChord} off the chord — zero would mean straight lines between samples`);
ok('it starts at the start and stops at the end', r.startsAtStart && r.endsCleanly,
   'a ghost that finished ahead of you must stop being drawn, not stand at the finish line');
ok('three ghosts for every drill still fit', r.fitsTheBudget,
   `${Math.round(r.storedBytes/1024*10)/10}KB stored, ~${Math.round(r.projectedAll/1024)}KB projected for all ${25} drills — 60Hz would be ~3MB, more than the whole localStorage budget`);
ok('the save file carries the top three', r.saveHasDrills && r.saveKeepsRuns && r.saveKeepsGhostPaths,
   `save is ${Math.round(r.saveBytes/1024)}KB`);
ok('an older save still reads', r.legacyReadable, JSON.stringify(r.legacy) +
   ' — `magnetball.drills` used to hold a bare number per drill');
ok('the machine plays every drill without throwing', r.everyDrillRan && !r.threw,
   r.threw || `${r.plays.length} attempted`);
// ⚠️ A FLOOR, and an honest one. `drillAutoPad` is a reactive controller against two
// dozen hand-designed obstacle courses; it finishes the open ones and not the ones built
// round a wall or needing a threaded shot. The number is pinned so it cannot silently
// regress, and the unsolved list is printed so it is never mistaken for full coverage.
ok('...and finishes the ones it can, consistently', r.solved.length >= 8,
   `${r.solved.length}/${r.plays.length}: ${r.solved.join(', ')}\n     it cannot finish: ${r.unsolved.join(', ')}`);
ok('no drill it can finish is timed tighter than it can be played', !r.tooTight.length,
   r.tooTight.join(', '));
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify({ ...r, plays: undefined }, null, 1));
console.log('AI coverage: ' + r.solved.length + '/' + r.plays.length);
console.log('  solved  : ' + r.solved.join(', '));
console.log('  unsolved: ' + r.unsolved.join(', '));
await b.close();
if (fails.length){ console.log('FAIL drillghost\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS drillghost');
