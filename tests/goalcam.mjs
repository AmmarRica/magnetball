// The goal camera: push in on whoever scored, then ease back out.
//
// It is a RENDER effect. The three things that matter are that it moves the camera
// and nothing else, that it is step-locked (a 144Hz screen must not run the push
// 2.4× fast — the same trap the trails and the dynamic fields already document),
// and that it always lets go. A camera that sticks zoomed in is unrecoverable
// without a restart.
//
// ⚠️ Measurement trap: computeCam() applies the push, so cam.s has to be sampled
// AFTER calling it, and compared against the same match with the push at zero —
// not against a hard-coded number, which changes with viewport and field.
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
  // ⚠️ Does NOT touch sel.juice — an earlier version set it to true here, which
  // silently undid the "effects off" case two lines after it turned them off.
  const start = () => { M.sel.mode='2v2'; M.sel.autoReplay=false;
    M.setMatchSeed(3); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2; return w; };

  // ---- a fresh match starts on a level camera ------------------------------
  M.sel.juice = true;
  let w = start();
  // ⚠️ The camera centres on the PITCH viewport, not the canvas: cam.ox is
  // `padL + availW/2`, which is offset by the docked side panel and by the HUD
  // headroom. Comparing the scorer against the canvas centre read 186px off — which
  // is exactly the dock width — and looked like broken centring maths.
  M.computeCam(); const base = M.cam.s, baseOx = M.cam.ox, baseOy = M.cam.oy;
  o.startsLevel = M.goalCam.t === 0 && M.goalCam.live === false;
  o.baseScale = +base.toFixed(4);

  // ---- it pushes in on the SCORER ------------------------------------------
  const scorer = w.players[0];
  scorer.x = -120; scorer.y = -210; scorer.vx = 0; scorer.vy = 0;
  w.ball.lastKicker = scorer;
  M.scoreGoal(w, 0);
  o.live = M.goalCam.live === true;
  o.followsTheScorer = M.goalCam.p === scorer;
  // Step-locked: a render must NOT advance it. Draw twice and check it hasn't moved.
  const tBefore = M.goalCam.t;
  M.render(); M.render(); M.computeCam(); M.render();
  o.stillWithoutStep = M.goalCam.t === tBefore;
  // ...and it does move when stepped.
  // ⚠️ Stop before the goal state does. It lasts 1.8s (108 steps) and the push takes
  // GOALCAM.inSecs (69) — sampling at 120 measured the ease-BACK and read 3.59x.
  const steps = Math.ceil(M.goalZoomSecs() * 60) + 10;
  o.pushSteps = steps;
  const ramp = [];
  for (let i=0;i<steps;i++){
    M.step(w); M.advanceGoalCam(w);
    if (i%12===0){ M.computeCam(); ramp.push(+(M.cam.s/base).toFixed(2)); }
  }
  o.stillCelebrating = w.state === 'goal';
  o.ramp = ramp;
  o.movesWithStep = ramp[ramp.length-1] > ramp[0];
  o.rampIsMonotonic = ramp.every((v,i)=> i===0 || v >= ramp[i-1] - 0.01);
  M.computeCam();
  o.peak = +(M.cam.s/base).toFixed(2);
  // Read the DIAL, not the default — they are the same out of the box, which would
  // let a slider that does nothing pass this.
  o.reachesTheZoom = Math.abs(o.peak - M.goalZoom()) < 0.05;
  o.declaredZoom = M.goalZoom();

  // ...and the scorer really is in the middle of the view.
  {
    const [sx,sy] = M.screenPt(M.wx(scorer.x), M.wy(scorer.y));
    o.dockPad = M.uiPadLeft || 0;
    o.scorerOffCentre = [Math.round(sx - baseOx), Math.round(sy - baseOy)];
    o.centredOnScorer = Math.abs(o.scorerOffCentre[0]) < 24 && Math.abs(o.scorerOffCentre[1]) < 24;
  }
  // The push has to be a ZOOM, not just a pan — the pitch must genuinely be bigger.
  o.zoomedNotJustPanned = M.cam.s > base * 2;

  // ---- it always lets go ----------------------------------------------------
  w.state = 'kickoff';
  for (let i=0;i<200;i++){ M.step(w); M.advanceGoalCam(w); }
  M.computeCam();
  o.releasedScale = +(M.cam.s/base).toFixed(4);
  o.releasedOx = Math.abs(M.cam.ox - baseOx) < 0.01;
  o.letsGo = M.goalCam.t === 0 && M.goalCam.live === false && Math.abs(M.cam.s - base) < 1e-9;

  // ---- a replay owns the framing, so the push must stand down --------------
  M.sel.juice = true;
  w = start();
  w.ball.lastKicker = w.players[0];
  M.scoreGoal(w, 0);
  for (let i=0;i<40;i++){ M.step(w); M.advanceGoalCam(w); }
  const midPush = M.goalCam.t;
  const realReplay = M.replay.active;
  M.replay.active = true;                       // pretend the instant replay started
  w.state = 'goal';                             // ...while the state is still 'goal'
  for (let i=0;i<60;i++){ M.advanceGoalCam(w); }
  o.midPush = +midPush.toFixed(2);
  o.standsDownForReplay = M.goalCam.t < midPush;
  M.replay.active = realReplay;

  // ---- effects off means no camera move at all -----------------------------
  M.sel.juice = false;
  w = start();          // start() leaves sel.juice alone, so this stays off
  w.ball.lastKicker = w.players[0];
  M.scoreGoal(w, 0);
  for (let i=0;i<90;i++){ M.step(w); M.advanceGoalCam(w); }
  M.computeCam();
  o.juiceOffFlat = M.goalCam.t === 0 && Math.abs(M.cam.s - base) < 1e-9;
  M.sel.juice = true;

  // ---- ZERO SIM IMPACT ------------------------------------------------------
  // The camera must not be reachable from the sim. Same seed, same steps, with the
  // push running and with it disabled — the world has to be bit-identical.
  const snap = ww => JSON.stringify(ww.players.map(q=>[q.x,q.y,q.vx,q.vy])
    .concat([[ww.ball.x, ww.ball.y]]));
  // Both runs have juice ON — that dial also drives shake and hit-stop, so toggling
  // it would compare two different things. The only difference here is whether the
  // camera is allowed to move.
  M.sel.juice = true;
  let w2 = start(); w2.ball.lastKicker = w2.players[0]; M.scoreGoal(w2, 0);
  for (let i=0;i<300;i++){ M.step(w2); M.advanceGoalCam(w2); M.computeCam(); }
  const on = snap(w2);
  let w3 = start(); w3.ball.lastKicker = w3.players[0]; M.scoreGoal(w3, 0);
  for (let i=0;i<300;i++){ M.step(w3); M.goalCam.t = 0; M.computeCam(); }
  o.simBitIdentical = snap(w3) === on;
  o.simSample = on.slice(0, 50);

  // ---- the two dials actually drive it -------------------------------------
  const dial = (zoomPct, spdPct) => {
    const z=document.getElementById('goalZoom'), sp=document.getElementById('goalZoomSpd');
    z.value = zoomPct; z.oninput(); sp.value = spdPct; sp.oninput();
  };
  o.slidersExist = !!document.getElementById('goalZoom') && !!document.getElementById('goalZoomSpd');
  dial(250, 40);
  o.dialValues = [M.goalZoom(), M.goalZoomSecs()];
  o.dialLabels = [document.getElementById('goalZoomVal').textContent,
                  document.getElementById('goalZoomSpdVal').textContent];
  o.dialReads = Math.abs(M.goalZoom()-2.5) < 1e-9 && Math.abs(M.goalZoomSecs()-0.4) < 1e-9;
  // A smaller zoom really does peak smaller, and a faster speed really is faster.
  M.sel.juice = true;
  M.goalCamReset();
  let wd = start(); wd.ball.lastKicker = wd.players[0]; M.scoreGoal(wd, 0);
  M.computeCam(); const dBase = M.cam.s / (1 + (M.goalZoom()-1)*0);   // t is 0 here
  let hitFullAt = -1;
  for (let i=0;i<120 && hitFullAt<0;i++){ M.step(wd); M.advanceGoalCam(wd); if (M.goalCam.t >= 1) hitFullAt = i; }
  M.computeCam();
  o.fastPeak = +(M.cam.s/dBase).toFixed(2);
  o.fastStepsToFull = hitFullAt;
  o.dialChangesPeak = Math.abs(o.fastPeak - 2.5) < 0.05;
  // 0.40s at 60Hz is 24 steps; the 1.15s default would take 69.
  o.dialChangesSpeed = hitFullAt >= 0 && hitFullAt < 40;
  // ...and 1.0x is genuinely OFF — the camera must not even latch.
  dial(100, 115);
  M.goalCamReset();
  let wo = start(); wo.ball.lastKicker = wo.players[0]; M.scoreGoal(wo, 0);
  for (let i=0;i<60;i++){ M.step(wo); M.advanceGoalCam(wo); }
  M.computeCam();
  o.zoomOffLabel = document.getElementById('goalZoomVal').textContent;
  o.oneMeansOff = M.goalCam.live === false && M.goalCam.t === 0 && o.zoomOffLabel === 'off';
  // Out-of-range values are clamped, not obeyed — /settings can push anything across.
  M.sel.goalZoom = 99999; M.sel.goalZoomSpd = -5;
  o.clamped = [M.goalZoom(), M.goalZoomSecs()];
  o.clampsWildValues = M.goalZoom() === M.GOALCAM.zoomMax && M.goalZoomSecs() === M.GOALCAM.spdMin;
  dial(500, 115);

  M.goalCamReset(); M.setMatchSeed(null);
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.startsLevel, 'a fresh match did not start on a level camera');
ok(r.live && r.followsTheScorer, 'the goal camera did not latch onto the scorer');
ok(r.stillWithoutStep, 'the push advanced inside a DRAW — a 144Hz screen would run it fast');
ok(r.movesWithStep, `the push never moved when stepped: ${JSON.stringify(r.ramp)}`);
ok(r.stillCelebrating, 'the goal state ended before the push finished, so the peak measured the ease-back');
ok(r.rampIsMonotonic, `the push in is not smooth: ${JSON.stringify(r.ramp)}`);
ok(r.reachesTheZoom, `peaked at ${r.peak}x, expected ${r.declaredZoom}x`);
ok(r.zoomedNotJustPanned, 'the camera panned but never actually zoomed');
ok(r.centredOnScorer, `the scorer is not centred: off by ${JSON.stringify(r.scorerOffCentre)}px`);
ok(r.letsGo, `the camera stayed pushed in after the celebration: scale ${r.releasedScale}x`);
ok(r.releasedOx, 'the camera let go of the zoom but not of the pan');
ok(r.standsDownForReplay, `the push stayed up through the instant replay (t ${r.midPush})`);
ok(r.juiceOffFlat, 'the camera still moved with Screen shake & effects off');
ok(r.simBitIdentical, 'the sim diverged with the goal camera running — it is reachable from step()');
ok(r.slidersExist, 'there are no goal-zoom sliders');
ok(r.dialReads, `the sliders did not reach the camera: ${JSON.stringify(r.dialValues)}`);
ok(r.dialChangesPeak, `the zoom dial did not change the peak: ${r.fastPeak}x on a 2.5x setting`);
ok(r.dialChangesSpeed, `the speed dial did not change the push: full at step ${r.fastStepsToFull}, expected under 40 for 0.40s`);
ok(r.oneMeansOff, `1.0x did not mean off (label "${r.zoomOffLabel}")`);
ok(r.clampsWildValues, `out-of-range dial values were obeyed rather than clamped: ${JSON.stringify(r.clamped)}`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ngoalcam OK');
