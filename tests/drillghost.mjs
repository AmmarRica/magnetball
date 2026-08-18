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
// ⚠️ THE MACHINE THAT PLAYS A DRILL (`drillAutoPad`) is the instrument the drill timings
// are tuned against, and its coverage is asserted as a FLOOR rather than as "all of them":
// it is a reactive controller against two dozen hand-designed obstacle courses, and the
// honest claim is which ones it can finish, not that it can finish everything. What the
// suite does hold absolutely is that it never THROWS and never leaves a drill in a broken
// state — a tuning instrument that crashes on drill nineteen is worse than none.
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
