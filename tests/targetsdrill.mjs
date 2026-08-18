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
  // ⚠️ Through `drillTop`, never `drillBest.targets` — a drill keeps its best THREE runs
  // now, so that slot holds a record rather than a bare number. One reader, one shape.
  o.bestAfterThree = M.drillTop('targets');

  // ⚠️ A WORSE run must not overwrite the record. This is the assertion that catches
  // the `t < prev` comparison every other drill uses.
  M.startDrill('targets'); w = M.world;
  shoot(w, -1);
  w.drill.elapsed = w.drill.timed - 0.01;
  for (let k=0;k<8;k++) M.step(w);
  o.oneScored = w.drill.scored;
  o.bestAfterWorse = M.drillTop('targets');
  o.worseRunKeepsTheRecord = o.bestAfterWorse === o.bestAfterThree;
  o.subSaysKeptBest = /best 3 goals/.test((document.querySelector('#overlay p')||{}).textContent||'');

  // ...and a BETTER one does replace it.
  M.startDrill('targets'); w = M.world;
  for (let i=0;i<5;i++) shoot(w, i % 2 ? 1 : -1);
  w.drill.elapsed = w.drill.timed - 0.01;
  for (let k=0;k<8;k++) M.step(w);
  o.fiveScored = w.drill.scored;
  o.bestAfterBetter = M.drillTop('targets');
  o.betterRunTakesTheRecord = o.bestAfterBetter === o.fiveScored && o.fiveScored > o.bestAfterThree;

  // ---- 5b. IT IS ACTUALLY ON THE SCREEN -----------------------------------
  // ⚠️ THE DEFECT THIS BLOCK EXISTS FOR, and everything above passed while it was live:
  // this suite drove `step()` and read world state, and never once looked at the canvas.
  // `renderDrill` draws `w.bounds` as a single `strokeRect` plus gates, zones, cones and
  // `wl.draw` walls — and `buildGeometry` produces none of those. So the goals were in
  // the physics and NOWHERE ON THE SCREEN: the goal line ran solid straight across both
  // mouths, the five spawn spots were invisible, the readout said `0/0`, and the drill
  // was a box with a ball in it and nothing to aim at. Mechanics passing is not the
  // drill working.
  {
    M.startDrill('targets'); const ww = M.world;
    M.render();
    const cv = document.getElementById('game');
    const g2 = cv.getContext('2d');
    const D = Math.min(window.devicePixelRatio || 1, 2.5);
    // ⚠️ Scan a BOX and count, never sample one point: these are thin strokes, and a
    // point-sample lands between them and reads "nothing drawn" on a correct build.
    const inked = (wx0, wy0, wx1, wy1) => {
      const x0 = Math.round(Math.min(M.wx(wx0), M.wx(wx1)) * D), x1 = Math.round(Math.max(M.wx(wx0), M.wx(wx1)) * D);
      const y0 = Math.round(Math.min(M.wy(wy0), M.wy(wy1)) * D), y1 = Math.round(Math.max(M.wy(wy0), M.wy(wy1)) * D);
      const w2 = Math.max(1, x1-x0), h2 = Math.max(1, y1-y0);
      const dat = g2.getImageData(x0, y0, w2, h2).data;
      // The court is one flat colour; anything that is not it is something drawn.
      const c0 = g2.getImageData(Math.round(M.wx(0)*D), Math.round(M.wy(60)*D), 1, 1).data;
      let n = 0;
      for (let i = 0; i < dat.length; i += 4){
        if (Math.abs(dat[i]-c0[0]) + Math.abs(dat[i+1]-c0[1]) + Math.abs(dat[i+2]-c0[2]) > 24) n++;
      }
      return n;
    };
    const bb = ww.bounds;
    // ⚠️ MEASURED AS A DIFF OF TWO RENDERS, and the first version of this was wrong in a
    // way worth writing down. It counted pixels "not the court colour" inside a box round
    // the goal mouth — but the mouth box straddles the goal line, so half of it is the
    // page background, which is never the court colour. The region therefore read as
    // heavily inked whatever was drawn, and the sabotage that removed the goals entirely
    // passed: the plain `strokeRect` fallback even puts a line across the mouth. Same for
    // the net pocket, which is background all the way through.
    // Rendering once with the goals on and once with them off and counting what CHANGED
    // measures the thing itself, and is immune to whatever is behind it.
    const shot = () => { M.render(); return g2.getImageData(0, 0, cv.width, cv.height).data; };
    const withGoals = shot();
    ww.drillGoalsOpen = false;
    const without = shot();
    ww.drillGoalsOpen = true;
    M.render();
    const changed = (wx0, wy0, wx1, wy1) => {
      const x0 = Math.round(Math.min(M.wx(wx0), M.wx(wx1)) * D), x1 = Math.round(Math.max(M.wx(wx0), M.wx(wx1)) * D);
      const y0 = Math.round(Math.min(M.wy(wy0), M.wy(wy1)) * D), y1 = Math.round(Math.max(M.wy(wy0), M.wy(wy1)) * D);
      let n = 0;
      for (let y = Math.max(0,y0); y < Math.min(cv.height, y1); y++)
        for (let x = Math.max(0,x0); x < Math.min(cv.width, x1); x++){
          const i = (y*cv.width + x)*4;
          if (Math.abs(withGoals[i]-without[i]) + Math.abs(withGoals[i+1]-without[i+1])
            + Math.abs(withGoals[i+2]-without[i+2]) > 24) n++;
        }
      return n;
    };
    o.inkTopMouth = changed(-bb.gh, -bb.halfL - 8, bb.gh, -bb.halfL + 8);
    o.inkBotMouth = changed(-bb.gh,  bb.halfL - 8, bb.gh,  bb.halfL + 8);
    o.inkTopNet   = changed(-bb.gh, -bb.halfL - bb.net - 4, bb.gh, -bb.halfL - 6);
    // ⚠️ The mouth MARKING is measured as real ink, not as a diff, and the reason is the
    // second measurement mistake in this block. The diff's baseline is `drillGoalsOpen =
    // false`, which is not "nothing drawn" — it is the plain `strokeRect` fallback, and
    // that draws a line straight ACROSS the mouth. So a diff in the middle of the mouth
    // is large whether the marking is there or not (the two renders differ either way),
    // and removing the marking passed. Verified by running that sabotage.
    // Counting pixels that are neither court nor page-background isolates drawn ink: the
    // box is two units either side of the goal line, so with nothing drawn it holds only
    // court below and background above.
    const inkOnly = (wx0, wy0, wx1, wy1) => {
      const x0 = Math.round(Math.min(M.wx(wx0), M.wx(wx1)) * D), x1 = Math.round(Math.max(M.wx(wx0), M.wx(wx1)) * D);
      const y0 = Math.round(Math.min(M.wy(wy0), M.wy(wy1)) * D), y1 = Math.round(Math.max(M.wy(wy0), M.wy(wy1)) * D);
      const dat = g2.getImageData(x0, y0, Math.max(1,x1-x0), Math.max(1,y1-y0)).data;
      const court = g2.getImageData(Math.round(M.wx(0)*D), Math.round(M.wy(60)*D), 1, 1).data;
      const bg = g2.getImageData(2, Math.round(cv.height/2), 1, 1).data;
      const far = (d2, i, c) => Math.abs(d2[i]-c[0]) + Math.abs(d2[i+1]-c[1]) + Math.abs(d2[i+2]-c[2]) > 30;
      let n = 0;
      for (let i = 0; i < dat.length; i += 4) if (far(dat,i,court) && far(dat,i,bg)) n++;
      return n;
    };
    o.inkMouthMiddle = inkOnly(-bb.gh/3, -bb.halfL - 2, bb.gh/3, -bb.halfL + 2);
    o.mouthIsMarked = o.inkMouthMiddle > 10;
    o.goalsAreDrawn = o.inkTopMouth > 20 && o.inkBotMouth > 20;
    o.netIsDrawn = o.inkTopNet > 10;
    // ...and the five spots are visible, each one individually. These sit on flat court,
    // so the court-relative `inked` helper above is honest for them.
    o.spotInk = [];
    for (let i = 0; i < M.TARGET_SPOTS.length; i++){
      const t = M.targetSpot(ww, i);
      o.spotInk.push(inked(t.x - 34, t.y - 34, t.x + 34, t.y + 34));
    }
    o.allSpotsDrawn = o.spotInk.every(n => n > 10);
    // A control: bare court between the spots must be clean, or "ink everywhere" would
    // pass the spot check for the wrong reason.
    o.inkEmpty = inked(bb.halfW * 0.15, bb.halfL * 0.62, bb.halfW * 0.30, bb.halfL * 0.72);
    o.emptyIsClean = o.inkEmpty < 8;
    // ...and the same control for the diff: bare court must be IDENTICAL between the two
    // renders, so the goal numbers above cannot be picking up an unrelated repaint.
    o.diffEmpty = changed(bb.halfW * 0.15, bb.halfL * 0.62, bb.halfW * 0.30, bb.halfL * 0.72);
    o.diffIsLocal = o.diffEmpty === 0;
    // The readout says GOALS, not `0/0`. A points drill has no `total`, so the shared
    // readout claimed the drill was complete and empty at the same time. Asserted on the
    // flag the renderer branches on — reading text back off a canvas is not something
    // this suite can do honestly, and a flag check with the branch beside it is better
    // than a pixel check dressed up as one.
    o.readoutHigh = !!ww.drill.def.high;
  }

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

  // ---- ⚠️ THE PLAYER CANNOT LEAVE THE PITCH ------------------------------
  // A player must never end up off the screen, in any mode. `integrate`'s clamp used to sit
  // behind `if (!w.drillMode)`, which was safe only for as long as every drill called
  // `drillBoundary()` and got four solid walls that held a body in by collision. This drill
  // does not — it calls the match's own `buildGeometry` so its goals cannot drift from a
  // real one's, and every boundary that produces is `ballOnly`, which contains the ball and
  // deliberately lets a player step out. So there was nothing holding the player on the
  // pitch at all: you could walk off the edge and never come back.
  // ⚠️ Driven by holding the STICK, through `stepDrill`, for long enough to be well past
  // the touchline if nothing stopped it — not by placing the body outside and calling the
  // clamp, which would pass on a build where the clamp is never reached.
  {
    for (const key of ['targets', 'straight_up']){
      M.startDrill(key);
      const ww = M.world, q = ww.players[0];
      const bd = ww.bounds;
      const out = { key, halfW: bd.halfW, halfL: bd.halfL };
      for (const [ix, iy, tag] of [[1,0,'right'], [-1,0,'left'], [0,1,'down'], [0,-1,'up']]){
        q.x = 0; q.y = 0; q.vx = q.vy = 0;
        // 900 steps at full stick is several pitch-lengths of travel.
        for (let i = 0; i < 900; i++){ M.pads.p1.dx = ix; M.pads.p1.dy = iy; M.stepDrill(ww); }
        out[tag] = [Math.round(q.x), Math.round(q.y)];
      }
      M.pads.p1.dx = 0; M.pads.p1.dy = 0;
      // Every finishing position inside the pitch plus the step-out margin, with a little
      // slack for the margin itself.
      out.held = ['right','left','down','up'].every(t =>
        Math.abs(out[t][0]) <= bd.halfW + 40 && Math.abs(out[t][1]) <= bd.halfL + 40);
      o['walk_' + key] = out;
    }
    o.playerHeldIn = o.walk_targets.held && o.walk_straight_up.held;
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
ok('the GOALS are actually drawn, at both ends', r.goalsAreDrawn,
   `ink on the mouths: top ${r.inkTopMouth}, bottom ${r.inkBotMouth} — the goals were in the physics and nowhere on the screen`);
ok('...including the net pocket', r.netIsDrawn, `net ink ${r.inkTopNet}`);
ok('...and the mouth is marked as the thing to shoot at', r.mouthIsMarked,
   `${r.inkMouthMiddle} ink across the middle of the mouth — the posts alone keep the wide check green, and the diff baseline draws a line there too, so this is the only one that sees the marking`);
ok('all five spawn spots are drawn', r.allSpotsDrawn,
   `per-spot ink ${JSON.stringify(r.spotInk)} — fixed spots are pointless if you cannot see the route`);
ok('...and empty court is still empty', r.emptyIsClean,
   `${r.inkEmpty} ink on bare court, so the checks above could be passing on noise`);
ok('...and the goal diff is local to the goals', r.diffIsLocal,
   `${r.diffEmpty} pixels changed on bare court between the two renders`);
ok('the drill is flagged as scored-on-points, so the readout says goals', r.readoutHigh);
ok('every other drill still has a sealed goal mouth', r.otherDrillSealed);
ok('...and clampBallInside still hauls its ball back inside', r.otherDrillContained,
   `a ball placed past the goal line stayed at y=${r.otherDrillBallY} — the mouth is open on a drill that expects a closed box`);
ok('THE PLAYER CANNOT WALK OFF THE PITCH', r.playerHeldIn,
   `holding the stick for 900 steps ended at ${JSON.stringify(r.walk_targets)} on Break the Targets and ${JSON.stringify(r.walk_straight_up)} on a walled drill — this drill builds the match's own geometry, whose boundaries are all ballOnly and let a player through on purpose, and integrate's clamp used to skip drill mode entirely. A player must never leave the view, in any mode`);
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL targetsdrill\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS targetsdrill');
