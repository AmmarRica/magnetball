// Mini Golf: eight holes, scored in TOUCHES.
//
// ⚠️ THE HARD PART IS WHAT COUNTS AS A TOUCH, and every obvious answer is exploitable.
// Counting frames of contact makes a dribble sixty touches; counting one contact EVENT
// makes a dribble ONE touch, so you can walk the ball round the whole course and go round
// in eight. Golf's own rule is the way out — you may only play the ball when it is at rest
// — so while it rolls the player is a ghost to it, and every impulse given to a resting
// ball is one touch whether it came from a kick or from a shoulder.
//
// So the four claims worth holding, and none of them is "the drill exists":
//   1. One impulse is one touch, however many steps the ball then takes to stop.
//   2. A body PUSH costs a touch as well, or the count means nothing.
//   3. A rolling ball cannot be touched at all — measured against the control that a
//      RESTING one can, in the same run, or "the ball ignored me" is equally true of a
//      build where the player never collides with it.
//   4. The eight courses are playable geometry: nothing is laid out inside a wall.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:520,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(()=>{
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const G = M.GOLF, HOLES = M.GOLF_HOLES;

  // ---- the round is eight holes, and the world is a golf world ------------
  M.startDrill('golf');
  let w = M.world, d = w.drill;
  o.holeCount = HOLES.length;
  // ⚠️ `total` has to be the HOLE count. `startDrill` normally reads gates-plus-zones,
  // which here is the one cup on the current hole — so the generic finish test would end
  // the round on the first putt.
  o.totalIsHoles = d.total === HOLES.length;
  o.isGolfWorld = w.golf === true && w.magnet === 0 && w.trapOff === true;
  // ⚠️ The green is the one number golf overrides, and it must actually be on the ball.
  o.greenApplied = Math.abs(w.ball.damp - G.damp) < 1e-9;

  // ---- 1. ONE IMPULSE IS ONE TOUCH ---------------------------------------
  const settle = (n) => { let k = 0;
    while (k < (n||1200) && Math.hypot(w.ball.vx, w.ball.vy) > G.rest){ M.step(w); k++; }
    return k; };
  const park = () => { const q = w.players[0]; q.x = 9e3; q.y = 9e3; q.vx = q.vy = 0;
                       q.inX = 0; q.inY = 0; q.kick = false; };
  // Struck by hand, which is what a kick comes to — the counter watches the BALL.
  park();
  w.ball.vx = 0; w.ball.vy = -6;
  const s0 = d.strokes;
  M.step(w);
  o.oneImpulseCounts = d.strokes === s0 + 1;
  const rolled = settle();
  o.settledIn = +(rolled/60).toFixed(2);
  o.stillOneTouch = d.strokes === s0 + 1;      // ...for all the steps it took to stop

  // ---- 3. A ROLLING BALL CANNOT BE TOUCHED, against the resting control ----
  // ⚠️ Both halves in the same run and the same place. "The ball went through me" is also
  // true of a build where the player never collides with the ball at all, which would be a
  // different and worse game.
  // ⚠️ **MEASURED AS A DIFFERENCE AGAINST THE SAME STEP WITH THE PLAYER PARKED AWAY, and
  // an absolute reading is WRONG rather than merely weak — the first version of this check
  // failed on a perfectly good build.** The ball is damped every step, so a ball rolling at
  // 5 loses 0.175 of velocity on its own; read absolutely that is "the player moved it by
  // 0.175" on a build where the player was nowhere near it. What the player contributed is
  // the difference between the two runs, and only the same step twice can say.
  // ⚠️ **AND THE ROLLING CASE HAS TO BE ALREADY ROLLING BEFORE THE PLAYER ARRIVES.** The
  // counter is an edge, so injecting a velocity into a settled ball IS the strike and
  // counts a touch — the fixture's own, not the player's. So the rolling case takes a
  // priming step with nobody near the ball (that is the shot), and only the step AFTER it
  // is measured.
  const bump = (ballSpeed, withPlayer, prime) => {
    const q = w.players[0], bl = w.ball;
    bl.x = 0; bl.y = 0; bl.px = 0; bl.py = 0; bl.vx = 0; bl.vy = ballSpeed;
    park();
    if (prime) M.step(w);                        // the strike, taken by nobody
    if (withPlayer){ q.x = bl.x; q.y = bl.y + q.r + bl.r - 3;   // overlapping, just behind
                     q.vx = 0; q.vy = -1.2; q.inX = 0; q.inY = -1; q.kick = false; }
    const s = d.strokes;
    M.step(w);
    return { vx: bl.vx, vy: bl.vy, strokes: d.strokes - s };
  };
  const contribution = (speed, prime) => {
    const withP = bump(speed, true, prime); settle();
    const noP   = bump(speed, false, prime); settle();
    return { moved: Math.hypot(withP.vx - noP.vx, withP.vy - noP.vy), strokes: withP.strokes };
  };
  const atRest  = contribution(0, false);
  // ⚠️ **THE ROLLING CASE HAS TO PUT THE PLAYER IN THE BALL'S PATH, and standing BEHIND it
  // measures nothing — a sabotage proved it.** `moveBall` advances the ball and THEN
  // collides, so a ball leaving a body at five units a step is already clear by the first
  // sub-step: with the gate deleted the probe still read zero, which is a check that cannot
  // see the defect it exists for. The ball has to RUN INTO the player, which is also the
  // case that actually matters — chasing your own shot and getting in its way.
  const blockTest = (withPlayer) => {
    const q = w.players[0], bl = w.ball;
    bl.x = 0; bl.y = 0; bl.px = 0; bl.py = 0; bl.vx = 0; bl.vy = -5;
    park();
    M.step(w);                                   // the strike, taken by nobody
    const s = d.strokes;
    for (let k = 0; k < 14; k++){
      if (withPlayer){ q.x = 0; q.y = -46; q.vx = 0; q.vy = 0; q.inX = 0; q.inY = 0; q.kick = false; }
      M.step(w);
    }
    return { vx: bl.vx, vy: bl.vy, y: bl.y, strokes: d.strokes - s };
  };
  const blocked = blockTest(true);  settle();
  const clear   = blockTest(false); settle();
  const rolling = { moved: Math.hypot(blocked.vx - clear.vx, blocked.vy - clear.vy),
                    strokes: blocked.strokes };
  o.rollingRanInto = Math.round(blocked.y) < -40;   // it really did reach the body
  o.restingBumpMoves = atRest.moved;
  o.rollingBumpMoves = rolling.moved;
  // ⚠️ **2 + 3 TOGETHER.** A push of a resting ball has to move it AND cost a touch, and a
  // push of a rolling one has to do neither.
  o.pushCostsATouch = atRest.moved > 0.2 && atRest.strokes === 1;
  o.rollingIsUntouchable = rolling.moved < 0.05 && rolling.strokes === 0;

  // ---- ...AND YOU CANNOT KICK ONE EITHER -----------------------------------
  // ⚠️ **TWO READERS, TWO CHECKS.** `ballPlayable` gates `moveBall`'s collision AND
  // `integrate`'s ball-control pass, and a sabotage of the second alone leaves every check
  // above green: the ball would be un-shovable and still kickable, which is a rolling ball
  // you can strike again for free. Driven through `pads.p1`, because that is the path a
  // thumb takes — writing `p.kick` is overwritten by `applyHumanInput` on the next step.
  {
    M.startDrill('golf'); w = M.world; d = w.drill;
    const kickTry = (speed) => {
      const q = w.players[0], bl = w.ball;
      bl.x = 0; bl.y = 0; bl.px = 0; bl.py = 0; bl.vx = 0; bl.vy = speed;
      // ⚠️ **THE REACH BEYOND THE BODY IS ONLY 3.75 UNITS at the shipped Kick reach dial**,
      // so a body parked "just outside contact" at +6 is out of kicking range entirely and
      // the check reads as the kick being broken. Derived from `w.kickRange` rather than
      // guessed, or this goes stale the day that default moves again.
      const gap = q.r + bl.r + Math.max(0.5, w.kickRange * 0.3);
      q.x = 0; q.y = gap; q.vx = 0; q.vy = 0;
      M.pads.p1.dx = 0; M.pads.p1.dy = 0; M.pads.p1.kick = false;
      M.step(w);                                   // release edge, so the next press fires
      const before = Math.hypot(bl.vx, bl.vy);
      M.pads.p1.kick = true;
      for (let k = 0; k < 3; k++){ q.x = 0; q.y = bl.y + gap; M.step(w); }
      M.pads.p1.kick = false;
      return Math.hypot(bl.vx, bl.vy) - before;
    };
    o.kickAtRest = +kickTry(0).toFixed(2);
    settle();
    o.kickRolling = +kickTry(-5).toFixed(2);
    settle();
    // A resting ball must gain real speed from a kick; a rolling one must only ever LOSE
    // speed, because the green is the only thing acting on it.
    o.kickWorksAtRest = o.kickAtRest > 1;
    o.noKickWhileRolling = o.kickRolling < 0;
  }

  // ---- lip-out: crossing the cup at speed is not holing out ---------------
  {
    M.startDrill('golf'); w = M.world; d = w.drill;
    const cup = w.zones[0], bl = w.ball;
    bl.x = cup.x; bl.y = cup.y; bl.px = bl.x; bl.py = bl.y; bl.vx = 0; bl.vy = -8;
    w.players[0].x = 9e3; w.players[0].y = 9e3;
    M.step(w);
    o.lipOut = d.hole === 0 && !w.zones[0].done;
  }

  // ---- holing out advances the hole and RE-LAYS the course ----------------
  {
    M.startDrill('golf'); w = M.world; d = w.drill;
    const cup0 = { x: w.zones[0].x, y: w.zones[0].y };
    // Two touches on hole one, then drop it in at rest.
    w.players[0].x = 9e3; w.players[0].y = 9e3;
    w.ball.vx = 0; w.ball.vy = -6; M.step(w); settle();
    w.ball.vx = 0; w.ball.vy = -6; M.step(w); settle();
    o.holeStrokesBefore = d.holeStrokes;
    o.totalBefore = d.strokes;
    const cupNow = w.zones[0];
    w.ball.x = cupNow.x; w.ball.y = cupNow.y; w.ball.vx = 0; w.ball.vy = 0;
    M.step(w);
    o.advanced = d.hole === 1;
    o.newCourse = w.zones[0] && (w.zones[0].x !== cup0.x || w.zones[0].y !== cup0.y);
    // ⚠️ The HOLE count resets and the ROUND total does not — that is the whole shape of a
    // scorecard, and one owner writing both is what stops them drifting.
    o.holeStrokesReset = d.holeStrokes === 0;
    o.totalKept = d.strokes === o.totalBefore;
    // ...and the tee is back under the ball rather than wherever the last hole ended.
    o.teedUp = Math.abs(w.ball.x - M.GOLF_HOLES[1].bx) < 1 &&
               Math.abs(w.ball.y - M.GOLF_HOLES[1].by) < 1;
    // ⚠️ The old course is GONE, not standing on the new one. Hole 2 has one wall of its
    // own plus the four boundary segments.
    o.wallsRelaid = w.walls.length === 4 + (M.GOLF_HOLES[1].walls || []).length;
  }

  // ---- a whole round finishes, and is recorded in TOUCHES -----------------
  {
    localStorage.removeItem('magnetball.drills');
    localStorage.removeItem('magnetball.drillruns');
    M.startDrill('golf'); w = M.world; d = w.drill;
    w.players[0].x = 9e3; w.players[0].y = 9e3;
    let guard = 0;
    while (!d.complete && guard++ < 60){
      // One touch per hole: strike it, let it settle, then drop it in.
      w.ball.vx = 0; w.ball.vy = -3; M.step(w); settle();
      const cup = w.zones[0];
      if (!cup) break;
      w.ball.x = cup.x; w.ball.y = cup.y; w.ball.vx = 0; w.ball.vy = 0;
      M.step(w);
    }
    o.roundCompletes = !!d.complete;
    o.roundHoles = d.hole;
    o.roundStrokes = d.strokes;
    o.recorded = M.drillTop('golf');
    o.recordIsTouches = o.recorded === d.strokes;
    o.scoreWords = M.drillScoreText('golf', 11);
    o.saysTouches = /touch/.test(o.scoreWords);
    // ⚠️ Lower wins — a round of 20 must not beat a round of 12, which is the trap the
    // one comparator exists for and which Break the Targets points the other way.
    o.lowerWins = M.drillBetter('golf', 12, 20) === true;
    // ⚠️ NO GHOST is recorded, deliberately: a ghost is indexed by elapsed TIME and golf
    // is scored in strokes, so one racing you through a round paces nothing anybody is
    // measuring — and GHOST.maxSecs would cut it off part way round in any case.
    o.noGhost = (M.drillRuns('golf')[0] || {}).p == null;
  }

  // ---- 4. the eight courses are playable geometry -------------------------
  // ⚠️ Eight hand-authored courses is exactly where a typo drops a cup inside a wall, and
  // nothing else here would notice: the drill would simply be impossible.
  {
    const HW = 220, HL = 380, PR = 15, BR = 10;
    const segDist = (px, py, ax, ay, bx, by) => {
      const dx = bx-ax, dy = by-ay, L = dx*dx + dy*dy;
      let t = L ? ((px-ax)*dx + (py-ay)*dy) / L : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (ax + dx*t), py - (ay + dy*t));
    };
    const bad = [];
    HOLES.forEach((h, i) => {
      const tag = (i+1) + ' ' + h.name;
      const inside = (x, y, r) => Math.abs(x) <= HW - r && Math.abs(y) <= HL - r;
      if (!inside(h.cup.x, h.cup.y, h.cup.r)) bad.push(tag + ': cup outside the pitch');
      if (!inside(h.bx, h.by, BR)) bad.push(tag + ': tee outside the pitch');
      if (!inside(h.bx, h.by + 46, PR)) bad.push(tag + ': the player stands outside the pitch');
      if (!(h.par >= 2)) bad.push(tag + ': no par');
      // The cup has to be reachable: no wall through it, and no cone sitting in it.
      for (const q of (h.walls || []))
        if (segDist(h.cup.x, h.cup.y, q[0], q[1], q[2], q[3]) < h.cup.r + BR)
          bad.push(tag + ': a wall runs through the cup');
      for (const c of (h.cones || []))
        if (Math.hypot(c[0]-h.cup.x, c[1]-h.cup.y) < h.cup.r + 9 + BR)
          bad.push(tag + ': a cone sits in the cup');
      // ...and the tee has to be clear of everything, or you start inside an obstacle.
      for (const q of (h.walls || []))
        if (segDist(h.bx, h.by, q[0], q[1], q[2], q[3]) < BR + PR + 10)
          bad.push(tag + ': the tee is against a wall');
      for (const c of (h.cones || []))
        if (Math.hypot(c[0]-h.bx, c[1]-h.by) < BR + 9 + PR)
          bad.push(tag + ': a cone is on the tee');
      // The whole point is a JOURNEY: teeing off on top of the cup is not a hole.
      if (Math.hypot(h.cup.x - h.bx, h.cup.y - h.by) < 200) bad.push(tag + ': the cup is on the tee');
    });
    o.courseFaults = bad;
    o.coursesSound = bad.length === 0;
    // ...and every one of them actually LAYS OUT, with a cup on the pitch.
    M.startDrill('golf'); w = M.world;
    const laid = [];
    for (let i = 0; i < HOLES.length; i++){
      M.golfLay(w, i);
      laid.push(w.zones.length === 1 && w.walls.length >= 4);
    }
    o.everyHoleLays = laid.every(Boolean);
  }

  // ---- nothing else in the game changed ----------------------------------
  // ⚠️ `ballPlayable` answers TRUE for everything that is not a golf ball, so a match and
  // every other drill are what they always were. Checked at a speed well above GOLF.rest,
  // which is the only value at which a leak could show.
  {
    M.sel.mode = '1v1'; M.setMatchSeed(4); M.startMatch();
    const mw = M.world; mw.state = 'play'; mw.stateT = 2;
    mw.ball.vx = 9; mw.ball.vy = 0;
    o.matchBallPlayable = M.ballPlayable(mw, mw.ball) === true;
    M.startDrill('straight_up');
    const dw = M.world; dw.ball.vx = 9; dw.ball.vy = 0;
    o.otherDrillPlayable = M.ballPlayable(dw, dw.ball) === true;
  }
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.holeCount === 8, `the round is ${r.holeCount} holes, not the eight that were asked for`);
ok(r.totalIsHoles, 'the drill total is not the hole count — startDrill reads gates-plus-zones, which here is the ONE cup on the current hole, so the round would finish on the first putt');
ok(r.isGolfWorld, 'a golf world must set `golf`, take the magnet off and go one-touch: a magnet ACCELERATES the ball, which is the one thing that stops "speed crossed rest upward" meaning "somebody touched it", and a trap glues the ball to your feet and carries it');
ok(r.greenApplied, 'the green was not applied to the ball — at the shipped glide a struck ball takes over six seconds to stop, and eight holes of waiting for it is not a game');
ok(r.oneImpulseCounts, 'striking the ball did not count a touch');
ok(r.stillOneTouch, `one strike counted more than one touch over the ${r.settledIn}s it took to settle — a touch is an IMPULSE, not a frame of movement`);
ok(r.pushCostsATouch, `a body push of a resting ball moved it by ${r.restingBumpMoves} and cost ${r.pushCostsATouch ? 1 : 'no'} touch — pushing has to cost the same as striking, or you can walk the ball round the course and go round in eight`);
ok(r.rollingRanInto, 'the rolling ball never reached the player, so the block check below measures nothing');
ok(r.rollingIsUntouchable, `a rolling ball was moved by ${r.rollingBumpMoves} when the player walked into it — you may only play the ball at rest, which is the whole rule that stops a dribble being free. The resting control moved ${r.restingBumpMoves} in the same run, so this is not a build where the player simply never touches the ball`);
ok(r.kickWorksAtRest, `KICK on a resting ball added ${r.kickAtRest} of speed — if it does nothing, the check below passes on a build where the kick is broken outright`);
ok(r.noKickWhileRolling, `KICK on a ROLLING ball added ${r.kickRolling} of speed. ballPlayable has two readers — moveBall's collision and integrate's ball control — and a sabotage of the second alone leaves every other check green: a ball you cannot shove but can still strike again for free`);
ok(r.lipOut, 'a ball crossing the cup at speed counted as holed — that is the lip-out rule, and without it a long shot scores because it happened to pass over on its way to the far wall');
ok(r.advanced && r.newCourse, `holing out did not lay the next course: advanced ${r.advanced}, new cup ${r.newCourse}`);
ok(r.wallsRelaid, 'the old course was still standing on the new one — golfLay REPLACES the walls, or hole eight is played over seven other holes');
ok(r.teedUp, 'the next hole did not tee the ball up, so you play it from wherever the last one ended');
ok(r.holeStrokesReset && r.totalKept, `the scorecard is wrong: this hole reads ${r.holeStrokesReset ? 0 : 'not reset'} and the round total ${r.totalKept ? 'held' : 'moved'} — the hole count resets and the round total does not`);
ok(r.roundCompletes, `the round did not finish: ${r.roundHoles} of 8 holes`);
ok(r.recordIsTouches, `the round recorded ${r.recorded} against ${r.roundStrokes} touches actually taken — the record has to be the score, not the clock`);
ok(r.saysTouches, `the board reads "${r.scoreWords}" — drillScoreText is the one place that knows a drill's unit, and golf's is touches`);
ok(r.lowerWins, 'fewer touches did not beat more — drillBetter points two ways and golf is the low one, so a bad round would be recorded as the record');
ok(r.noGhost, 'a ghost was recorded for a golf round: a ghost is indexed by elapsed TIME and golf is scored in strokes, so it would pace something nobody is measuring');
ok(r.coursesSound, 'course faults: ' + JSON.stringify(r.courseFaults));
ok(r.everyHoleLays, 'some hole did not lay out with a cup and a boundary');
ok(r.matchBallPlayable && r.otherDrillPlayable, `ballPlayable leaked out of golf: match ${r.matchBallPlayable}, other drill ${r.otherDrillPlayable} — it has to answer TRUE for everything that is not a golf ball, or a fast ball becomes untouchable in an ordinary game`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ngolf OK');
