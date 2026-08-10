// BREAK THE TARGETS — sixty seconds, score as many as you can, either goal.
//
// The only drill scored on POINTS rather than on time, and the only one with real
// goals. Both of those cut across assumptions the drill framework already had, and
// each one produced a real defect while this was being built:
//
//   ⚠️ 1. `clampBallInside` SEALS the goal mouth in drill mode (`gh = -1`, which makes
//      `inGoalX` false everywhere). That is right for every drill scored on gates and
//      zones — a ball vanishing into a net is a ball you have to fetch — and fatal
//      here: the shot bounced off a closed goal line and nothing ever scored. Opened
//      by `w.drillGoalsOpen`, a property of the drill rather than a check on its key.
//   ⚠️ 2. `updateDrill` resets the crossing trail (`b.px/b.py`) part-way down its body.
//      Checked after that line, the segment handed to `segCross` is ZERO LENGTH and no
//      shot crosses anything — measured with the ball sitting in the back of the net
//      and the score still reading 0. The targets branch runs first, and returns.
//      (That defect IS covered: sabotaging the goal-mouth open flag or moving the
//      branch back down fails this suite. The trail cut inside the branch is not —
//      see the note at the respawn check.)
//   ⚠️ 3. `drillBest` compares `t < prev`, because every other drill is "lower is
//      better". Here higher wins, so an unguarded comparison records your WORST run
//      as your record.
//
// Also held: five FIXED spawn spots (the drill is a route you learn, which is the
// whole point of a break-the-targets), the player is never teleported to the next
// ball, and the clock ending is a RESULT rather than a failure.
//
// ⚠️ MEASUREMENT TRAP: `localStorage.clear()` alone makes the page a fresh install,
// which dresses the first match by continent. Irrelevant here but it costs a run to
// work out, so the first-run marker is set in the init script.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport:{ width:900, height:900 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear();
  localStorage.setItem('magnetball.firstrun','1'); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(() => {
  const M = window.__magnet; const o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();

  // Fire the ball at a goal from just inside it, with nobody near it.
  const shoot = (w, sign) => {
    w.players[0].x = w.bounds.halfW * 0.9; w.players[0].y = 0;
    w.players[0].vx = 0; w.players[0].vy = 0;
    const b2 = w.ball;
    b2.x = 0; b2.y = sign * (w.bounds.halfL - 60); b2.vx = 0; b2.vy = sign * 22;
    b2.px = b2.x; b2.py = b2.y;
    for (let k=0;k<14;k++) M.step(w);
  };

  M.startDrill('targets');
  let w = M.world;

  // ---- 1. it is a real pitch with real goals ------------------------------
  o.isDrill = !!w.drillMode;
  o.hasPosts = w.posts.length >= 4;
  o.mouthOpen = !!w.drillGoalsOpen && w.bounds.gh > 0;
  o.timed = w.drill.timed;
  o.startsAtZero = (w.drill.scored || 0) === 0;
  // ⚠️ The seal is still on for every OTHER drill — opening it globally would let the
  // ball escape on the twenty-odd drills that expect a closed box.
  o.spotsDeclared = M.TARGET_SPOTS.length;

  // ---- 2. scoring, at both ends -------------------------------------------
  shoot(w, -1);
  o.afterOne = w.drill.scored;
  const wasSpot = w.drill.spot;
  shoot(w, 1);                                  // the OTHER goal counts too
  o.afterTwo = w.drill.scored;
  o.bothEndsCount = o.afterTwo === 2;
  o.spotAdvanced = w.drill.spot > wasSpot;
  // ...and the ball came back out at one of the five declared spots.
  {
    const s = M.targetSpot(w, w.drill.spot);
    o.respawn = [Math.round(w.ball.x), Math.round(w.ball.y)];
    o.expected = [Math.round(s.x), Math.round(s.y)];
    o.respawnedAtASpot = o.respawn[0] === o.expected[0] && o.respawn[1] === o.expected[1];
    o.respawnStill = w.ball.vx === 0 && w.ball.vy === 0;
  }
  // ...and a respawn is not itself a goal — the ball jumps the length of the pitch,
  // and idling afterwards must not add to the score.
  // ⚠️ Honest note: this one is a REGRESSION GUARD, not a sabotage-sensitive check.
  // Removing the trail cut in `updateDrill` freezes `px/py` at the spawn point rather
  // than double-counting, and no assertion here can tell the difference — verified by
  // running that sabotage. It is kept because the behaviour is worth pinning, not
  // because it is proof the cut is load-bearing.
  {
    const before = w.drill.scored;
    for (let k=0;k<5;k++) M.step(w);
    o.afterRespawnIdle = w.drill.scored;
    o.respawnIsNotAGoal = o.afterRespawnIdle === before;
  }

  // ---- 3. the player is NOT dragged to the next ball -----------------------
  // Walking to it is the drill. Teleporting the player makes it a shooting gallery.
  {
    w.players[0].x = 150; w.players[0].y = 200;
    const at = [w.players[0].x, w.players[0].y];
    shoot(w, -1);
    // `shoot` parks the player itself, so compare against where IT put them.
    o.playerAfter = [Math.round(w.players[0].x), Math.round(w.players[0].y)];
    o.notTeleportedToBall = Math.hypot(o.playerAfter[0] - w.ball.x,
                                       o.playerAfter[1] - w.ball.y) > 50;
    void at;
  }

  // ---- 4. the spots are FIXED, not random ---------------------------------
  // Two fresh runs must lay the balls out identically, or it is not a route you can
  // learn — which is the entire reason a break-the-targets is worth playing twice.
  const layout = () => {
    M.startDrill('targets');
    const ww = M.world;
    const seen = [[Math.round(ww.ball.x), Math.round(ww.ball.y)]];
    for (let i=0;i<6;i++){ M.targetNext(ww); seen.push([Math.round(ww.ball.x), Math.round(ww.ball.y)]); }
    return seen;
  };
  const l1 = layout(), l2 = layout();
  o.layout = l1;
  o.layoutIsFixed = JSON.stringify(l1) === JSON.stringify(l2);
  o.usesAllFive = new Set(l1.map(x => x.join(','))).size === M.TARGET_SPOTS.length;
  o.spotsInsideThePitch = (() => {
    const ww = M.world;
    return l1.every(([x, y]) => Math.abs(x) < ww.bounds.halfW - ww.ball.r &&
                                Math.abs(y) < ww.bounds.halfL - ww.ball.r);
  })();

  // ---- 5. the clock ending is a RESULT, and HIGHER is better ---------------
  M.startDrill('targets'); w = M.world;
  shoot(w, -1); shoot(w, 1); shoot(w, -1);
  o.threeScored = w.drill.scored;
  w.drill.elapsed = w.drill.timed - 0.01;
  for (let k=0;k<8;k++) M.step(w);
  o.completed = w.drill.complete;
  o.notFailed = !w.drill.failed;
  o.title = (document.querySelector('#overlay h2') || {}).textContent || '';
  o.sub = (document.querySelector('#overlay p') || {}).textContent || '';
  o.saysGoals = /3 goals/.test(o.sub);
  o.bestAfterThree = M.drillBest.targets;

  // ⚠️ A WORSE run must not overwrite the record. This is the assertion that catches
  // the `t < prev` comparison every other drill uses.
  M.startDrill('targets'); w = M.world;
  shoot(w, -1);
  w.drill.elapsed = w.drill.timed - 0.01;
  for (let k=0;k<8;k++) M.step(w);
  o.oneScored = w.drill.scored;
  o.bestAfterWorse = M.drillBest.targets;
  o.worseRunKeepsTheRecord = o.bestAfterWorse === o.bestAfterThree;
  o.subSaysKeptBest = /best 3 goals/.test((document.querySelector('#overlay p')||{}).textContent||'');

  // ...and a BETTER one does replace it.
  M.startDrill('targets'); w = M.world;
  for (let i=0;i<5;i++) shoot(w, i % 2 ? 1 : -1);
  w.drill.elapsed = w.drill.timed - 0.01;
  for (let k=0;k<8;k++) M.step(w);
  o.fiveScored = w.drill.scored;
  o.bestAfterBetter = M.drillBest.targets;
  o.betterRunTakesTheRecord = o.bestAfterBetter === o.fiveScored && o.fiveScored > o.bestAfterThree;

  // ---- 6. every OTHER drill still has a sealed goal mouth ------------------
  // ⚠️ Opening it globally would let the ball escape on the twenty-odd drills built
  // on `drillBoundary`, which expect a closed box.
  {
    M.startDrill('long_push');
    const ww = M.world;
    o.otherDrillSealed = !ww.drillGoalsOpen;
    // ⚠️ Measured by calling `clampBallInside` DIRECTLY with the ball already past
    // the line. Firing it at the wall proves nothing: `drillBoundary` puts a solid
    // wall right across the top, so `collideWall` stops the shot long before the
    // clamp is consulted and the ball is contained either way — a sabotage that
    // opened the mouth for every drill passed that version of this check.
    ww.ball.x = 0; ww.ball.y = ww.field.L/2 + 30; ww.ball.vx = 0; ww.ball.vy = 4;
    M.clampBallInside(ww, ww.ball);
    o.otherDrillBallY = Math.round(ww.ball.y);
    o.otherDrillContained = Math.abs(ww.ball.y) < ww.field.L/2;
  }
  return o;
});

ok('the drill runs', r.isDrill);
ok('it is built on a real pitch, with posts', r.hasPosts);
ok('the goal mouth is OPEN for this drill', r.mouthOpen,
   'clampBallInside seals it in drill mode, so nothing can ever score');
ok('it is a 60-second drill', r.timed === 60, String(r.timed));
ok('it starts on nothing', r.startsAtZero);
ok('there are five spawn spots', r.spotsDeclared === 5, String(r.spotsDeclared));
ok('a shot into a goal scores', r.afterOne === 1, String(r.afterOne));
ok('...and the other goal counts too', r.bothEndsCount, `${r.afterOne} then ${r.afterTwo}`);
ok('...and the next ball appears at a declared spot', r.respawnedAtASpot,
   `came out at ${JSON.stringify(r.respawn)}, expected ${JSON.stringify(r.expected)}`);
ok('...standing still', r.respawnStill);
ok('the respawn itself is not counted as a goal', r.respawnIsNotAGoal,
   'the ball jumps the length of the pitch, so an uncut trail scores every ball twice');
ok('the player is not dragged to the next ball', r.notTeleportedToBall,
   'walking to it is the drill; teleporting makes it a shooting gallery');
ok('the five spots are FIXED across runs', r.layoutIsFixed, JSON.stringify(r.layout));
ok('...and all five are used', r.usesAllFive, JSON.stringify(r.layout));
ok('...and all five are inside the pitch', r.spotsInsideThePitch, JSON.stringify(r.layout));
ok('the clock running out COMPLETES the drill', r.completed && r.notFailed,
   `title "${r.title}" — time running out is the end of the drill, not a failure`);
ok('...and the result is stated in goals', r.saysGoals, r.sub);
ok('the record is the score', r.bestAfterThree === r.threeScored,
   `scored ${r.threeScored}, recorded ${r.bestAfterThree}`);
ok('a WORSE run does not overwrite the record', r.worseRunKeepsTheRecord,
   `scored ${r.oneScored} and the record went ${r.bestAfterThree} -> ${r.bestAfterWorse}: HIGHER is better here, unlike every other drill`);
ok('...and it says so', r.subSaysKeptBest, r.sub);
ok('a BETTER run does take it', r.betterRunTakesTheRecord,
   `scored ${r.fiveScored}, record ${r.bestAfterBetter}`);
ok('every other drill still has a sealed goal mouth', r.otherDrillSealed);
ok('...and clampBallInside still hauls its ball back inside', r.otherDrillContained,
   `a ball placed past the goal line stayed at y=${r.otherDrillBallY} — the mouth is open on a drill that expects a closed box`);
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL targetsdrill\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS targetsdrill');
