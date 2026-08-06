// THE RULE: a screenshot should tell you what happened in the last three seconds.
//
// That makes trails a claim about TIME, and it is the claim this suite holds. The
// old ones were capped in world units and in dot count — 12 dots at 9-unit spacing,
// 320 units of ball streak — so the faster you moved the LESS time your trail
// represented, exactly backwards. Measured at top speed a player's tail was 108
// units (0.47s) and the ball's was 320 (0.17s): a screenshot of a sprint showed a
// stub of it.
//
// ⚠️ Three seconds is NOT achievable for the ball and this suite says so rather than
// pretending. At the 32/step cap that is 5760 world units, 7.6 lengths of a classic
// pitch, which would wrap the pitch seven times over. The ball keeps a three second
// HISTORY, a length capped against the pitch, and a linger so a shot is still
// legible after it has been saved. The players get the full three seconds.
//
// ⚠️ Measurement trap: drive the player through pads.p1, never by setting inX/inY —
// applyHumanInput rewrites those every step. And measure top speed by the PEAK over
// a run, not the value at the end: the first attempt read 0.147/step because the
// player had already been stopped by the boundary clamp.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  // A long pitch, so a sprint has room to reach top speed without hitting a wall.
  M.sel.mode='1v1'; M.sel.kickoffRule='off'; M.sel.field='marathon';
  M.setMatchSeed(3); M.startMatch();
  const w=M.world; w.state='play'; w.stateT=2;
  const me=w.players[0];
  w.players.slice(1).forEach(q=>{ q.x=9999; q.y=9999; });
  w.ball.x=9999; w.ball.y=9999; w.ball.vx=0; w.ball.vy=0;

  // ---- how fast can things actually go? ------------------------------------
  me.x=0; me.y=560; me.vx=0; me.vy=0;
  M.resetTrails();
  M.pads.p1.dx=0; M.pads.p1.dy=-1;
  let peak=0;
  for(let i=0;i<200;i++){ M.step(w); M.advanceTrails(w); peak=Math.max(peak, Math.hypot(me.vx,me.vy)); }
  M.pads.p1.dy=0;
  o.playerUnitsPerSec = Math.round(peak*60);
  o.ballUnitsPerSec = w.ballCap*60;

  // ---- the player tail really is TRAIL_SECS long ---------------------------
  const hist = M.discTrails[0];
  o.dashes = hist.length;
  o.oldestSecs = +(Math.max(...hist.map(d=>d.age))/60).toFixed(2);
  o.declaredSecs = M.TRAIL_SECS;
  o.coversTheWindow = Math.abs(o.oldestSecs - M.TRAIL_SECS) < 0.2;
  // ...and it is a real distance on the pitch, not a stub.
  const span = Math.hypot(hist[0].x-hist[hist.length-1].x, hist[0].y-hist[hist.length-1].y);
  o.tailUnits = Math.round(span);
  o.tailSecsOfTravel = +(o.tailUnits/o.playerUnitsPerSec).toFixed(2);
  o.tailIsSeconds = o.tailSecsOfTravel > 2.0;
  // The OLD design, for the record: 12 dots x 9 units.
  o.oldTailUnits = 108;
  o.oldTailSecs = +(108/o.playerUnitsPerSec).toFixed(2);
  o.beatsTheOldDesign = o.tailUnits > o.oldTailUnits * 3;
  // Bounded: a 3s window at DOT_EVERY spacing is a known number of dashes.
  o.dashCap = M.DOT_MAX;
  o.boundedCount = hist.length <= M.DOT_MAX;

  // ---- a standing player does NOT stack the window on one spot -------------
  M.resetTrails();
  me.vx=0; me.vy=0;
  for(let i=0;i<240;i++){ M.step(w); M.advanceTrails(w); }
  o.dashesWhenStill = M.discTrails[0].length;
  o.stillIsQuiet = o.dashesWhenStill <= 2;

  // ---- dashes carry a HEADING, and are shorter than the gap between them ---
  // A dash longer than the sample gap merges into a solid line — the first version
  // did exactly that and drew a continuous stroke instead of dashes.
  M.resetTrails();
  me.x=0; me.y=560; me.vx=0; me.vy=0;
  M.pads.p1.dy=-1;
  for(let i=0;i<200;i++){ M.step(w); M.advanceTrails(w); }
  M.pads.p1.dy=0;
  const h2 = M.discTrails[0];
  o.everyDashHasHeading = h2.every(d => typeof d.dx === 'number' && typeof d.dy === 'number' &&
    Math.abs(Math.hypot(d.dx,d.dy) - 1) < 1e-6);
  // ⚠️ Assert the RELATIONSHIP across the speed range, not one pair of samples. A
  // single pair can be short for reasons that have nothing to do with the rule —
  // the first version read a 2.7u gap off two dashes laid while the player was
  // still winding up, and reported a merge that does not happen at speed.
  const dashAt = sp => 2 * Math.max(M.DASH_MIN, Math.min(M.DASH_MAX, sp * M.DASH_PER_SPD));
  const gapAt  = sp => M.DOT_EVERY * sp;
  const fast = 3.8;                                   // measured player top speed
  o.sampleGap = +gapAt(fast).toFixed(1); o.dashLen = +dashAt(fast).toFixed(1);
  // ...and check the real history agrees, using its MEDIAN gap rather than its last.
  const gaps = [];
  for (let k=1;k<h2.length;k++) gaps.push(Math.hypot(h2[k].x-h2[k-1].x, h2[k].y-h2[k-1].y));
  gaps.sort((a2,b2)=>a2-b2);
  o.medianGap = +gaps[gaps.length>>1].toFixed(1);
  o.topSpeedSample = +Math.max(...h2.map(d=>d.sp)).toFixed(2);
  o.readsAsDashes = dashAt(fast) < gapAt(fast) * 0.9 &&
                    dashAt(o.topSpeedSample) < o.medianGap * 0.95;
  // ...and at a crawl they overlap into a clump, which is the low-speed look.
  const slowSp = 0.4;
  const slowGap = M.DOT_EVERY * slowSp;
  const slowDash = 2 * Math.max(M.DASH_MIN, Math.min(M.DASH_MAX, slowSp * M.DASH_PER_SPD));
  o.slowGap = +slowGap.toFixed(1); o.slowDash = +slowDash.toFixed(1);
  o.stacksWhenSlow = slowDash > slowGap;

  // ---- the ball: three seconds of HISTORY, a pitch-relative streak ----------
  o.ballHistorySecs = +(M.BALL_PATH/60).toFixed(2);
  o.ballHistoryIsTheWindow = Math.abs(o.ballHistorySecs - M.TRAIL_SECS) < 0.02;
  M.sel.field='classic'; M.setMatchSeed(3); M.startMatch();
  const w2=M.world; w2.state='play'; w2.stateT=2;
  w2.players.forEach(q=>{ q.x=9999; q.y=9999; });
  M.resetTrails();
  // Across the pitch, where there is no goal to score in.
  w2.ball.x=-180; w2.ball.y=0; w2.ball.vx=28; w2.ball.vy=0;
  for(let i=0;i<12;i++){ M.step(w2); M.advanceTrails(w2); }
  o.driveAtSpeed = +M.ballDrive.toFixed(2);
  o.buildsUp = M.ballDrive > 0.7;
  o.streakUnits = Math.round(w2.field.L * M.BALL_LEN_PITCH);
  o.streakVsPitch = M.BALL_LEN_PITCH;
  o.beatsOldStreak = o.streakUnits > 320;
  // ⚠️ THE HONEST LIMIT, asserted so nobody later "fixes" it to three seconds.
  o.threeSecondBallUnits = Math.round(o.ballUnitsPerSec * 3);
  o.threeSecondBallPitches = +(o.threeSecondBallUnits / w2.field.L).toFixed(1);
  o.threeSecondsIsImpossible = o.threeSecondBallPitches > 5;

  // ---- ...and the streak LINGERS instead of blinking off -------------------
  w2.ball.vx=0; w2.ball.vy=0;
  const decay=[];
  for(let i=0;i<110;i++){ M.step(w2); M.advanceTrails(w2); if(i%18===0) decay.push(+M.ballDrive.toFixed(2)); }
  o.decay = decay;
  o.lingersAfterTheShot = decay[1] > 0.05;      // ~0.3s later, still visible
  o.goesAwayEventually = decay[decay.length-1] === 0;
  o.holdSecs = M.BALL_HOLD;

  // ---- still step-locked ---------------------------------------------------
  // The whole point of sampling in the step loop: a 144Hz screen must not run the
  // window fast. Two draws must not age a single dash.
  M.resetTrails();
  for(let i=0;i<40;i++){ M.step(w2); M.advanceTrails(w2); }
  const before = M.discTrails.map(h=>h.length).join(',');
  const ageBefore = (M.discTrails[0][0]||{}).age;
  M.render(); M.render(); M.render();
  o.drawsDontAge = M.discTrails.map(h=>h.length).join(',') === before &&
                   (M.discTrails[0][0]||{}).age === ageBefore;

  M.sel.field='classic'; M.setMatchSeed(null);
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.coversTheWindow, `the player tail is ${r.oldestSecs}s, not the declared ${r.declaredSecs}s`);
ok(r.tailIsSeconds, `at top speed the tail is only ${r.tailSecsOfTravel}s of travel (${r.tailUnits} units)`);
ok(r.beatsTheOldDesign, `the tail (${r.tailUnits}u) is no better than the old ${r.oldTailUnits}u design`);
ok(r.boundedCount, `${r.dashes} dashes exceeds the ${r.dashCap} the window allows`);
ok(r.stillIsQuiet, `a standing player left ${r.dashesWhenStill} dashes stacked on one spot`);
ok(r.everyDashHasHeading, 'a dash has no recorded heading, so it cannot be drawn along the travel');
ok(r.readsAsDashes, `dash ${r.dashLen}u in a ${r.sampleGap}u gap — they merge into a solid line`);
ok(r.stacksWhenSlow, `at a crawl a ${r.slowDash}u dash in a ${r.slowGap}u gap does not overlap, so the slow look is lost`);
ok(r.ballHistoryIsTheWindow, `the ball keeps ${r.ballHistorySecs}s of history, not ${r.declaredSecs}s`);
ok(r.buildsUp, `the ball streak did not build at speed: drive ${r.driveAtSpeed}`);
ok(r.beatsOldStreak, `the streak (${r.streakUnits}u) is no longer than the old fixed 320u`);
ok(r.threeSecondsIsImpossible, `three seconds of ball is ${r.threeSecondBallPitches} pitch lengths — if this ever fails, the cap is wrong`);
ok(r.lingersAfterTheShot, `the streak vanished the moment the ball slowed: ${JSON.stringify(r.decay)}`);
ok(r.goesAwayEventually, `the streak never fades out: ${JSON.stringify(r.decay)}`);
ok(r.drawsDontAge, 'a DRAW aged the trail — a 144Hz screen would run the window fast');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ntrail3s OK');
