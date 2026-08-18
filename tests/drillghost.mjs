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
                     limit: M.DRILLS[key].timed || 0 });
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
