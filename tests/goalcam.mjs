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
  // ⚠️ Measured against the DIAL, not a magic multiple. This read `cam.s > base * 2`,
  // which was only ever true because the shipped default happened to be 5x: the moment
  // the default became a 5% push it failed a camera that was working perfectly. What
  // "it zoomed" means is that the scale grew by most of what the dial asked for — and
  // that a bigger dial gives a bigger push is `dialChangesPeak` further down.
  o.zoomGrowth = +(M.cam.s / base).toFixed(4);
  o.zoomedNotJustPanned = M.cam.s > base * (1 + (M.goalZoom() - 1) * 0.9);

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
  // ⚠️ RESET FIRST, and the absence of this was a latent false pass. The block above
  // leaves the camera pushed in and easing out, and `goalCamStart` bailing on
  // `sel.juice` cannot undo a push that is already live — so this block was measuring
  // the PREVIOUS block's camera and calling it a juice-off failure. It happened to
  // pass only because 90 steps used to be long enough to drain `t` at the old
  // `outSecs` of 0.5s; the release is 1.1s now, `t` was still 0.09 at the end, and the
  // assertion fired on a build with nothing wrong with it. A test that depends on one
  // constant's value to isolate the next case is not isolating anything.
  // ⚠️ **THIS ASSERTION IS DELIBERATELY THE OTHER WAY UP NOW, and the old one is the
  // defect it was pinning.** The goal camera used to bail on `motionOK()`, which made the
  // Goal zoom slider a DEAD CONTROL whenever Screen shake & effects was off: you could
  // drag it 1.0× → 8.0×, watch the readout change, and nothing on the pitch would move.
  // Reported as wanting the zoom without the shake. The two are different kinds of motion
  // — a shake is the picture thrown about at random, a push-in is a slow move toward what
  // you are already looking at — which is the same split hit stop and rumble already have.
  M.goalCamReset();
  M.sel.juice = false;
  w = start();          // start() leaves sel.juice alone, so this stays off
  w.ball.lastKicker = w.players[0];
  M.scoreGoal(w, 0);
  for (let i=0;i<20;i++){ M.step(w); M.advanceGoalCam(w); }
  M.computeCam();
  o.zoomWithoutShake = M.goalCam.t > 0.5 && M.cam.s > base * 1.05;
  o.zoomWithoutShakeAt = { t: +M.goalCam.t.toFixed(3), s: +(M.cam.s / base).toFixed(3) };

  // ...and the SLIDER is what turns it off, with the shake toggle left OFF throughout so
  // this cannot pass by the old coupling coming back.
  M.goalCamReset();
  const zoomWas = M.sel.goalZoom;
  M.sel.goalZoom = Math.round(M.GOALCAM.zoomMin * 100);   // the "off" end of the dial
  w = start();
  w.ball.lastKicker = w.players[0];
  M.scoreGoal(w, 0);
  for (let i=0;i<20;i++){ M.step(w); M.advanceGoalCam(w); }
  M.computeCam();
  o.sliderOffFlat = M.goalCam.t === 0 && Math.abs(M.cam.s - base) < 1e-9;
  o.sliderSaysOff = M.goalZoomLabel() === 'off';
  M.sel.goalZoom = zoomWas;
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
  // ⚠️ `null` for either dial means "leave it at the shipped default" — and it has to
  // go through `defaultSel()` rather than a number typed in here, or every retune of
  // GOALCAM leaves this suite quietly restoring a value that is no longer the default.
  const dial = (zoomPct, spdPct) => {
    const z=document.getElementById('goalZoom'), sp=document.getElementById('goalZoomSpd');
    const d = M.defaultSel();
    z.value = zoomPct == null ? d.goalZoom : zoomPct; z.oninput();
    sp.value = spdPct == null ? d.goalZoomSpd : spdPct; sp.oninput();
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
  // 0.40s at 60Hz is 24 steps; the 0.10s default takes 6.
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
  dial(null, null);         // back to the shipped defaults, whatever they currently are

  // ---- FAST IN, SLOW OUT — the asymmetry IS the feature --------------------
  // ⚠️ Asserted as a RATIO against the two constants rather than as two magic numbers,
  // so a retune can move both and this still means something. A camera that leaves as
  // fast as it arrives reads as a twitch; the whole point of the third tuning was that
  // it snaps in and drifts out. And `inSecs` is a dial while `outSecs` is not, so the
  // relationship has to hold with the dial at BOTH ends of its range.
  o.inOutRatio = +(M.GOALCAM.outSecs / M.GOALCAM.inSecs).toFixed(2);
  o.outIsSlower = M.GOALCAM.outSecs > M.GOALCAM.inSecs * 3;
  {
    const secsOut = M.GOALCAM.outSecs;
    dial(null, 5);   const fastest = M.goalZoomSecs();      // dial pinned at its quickest
    dial(null, 300); const slowest = M.goalZoomSecs();      // ...and its slowest
    dial(null, null);
    o.dialRange = [fastest, slowest, secsOut];
    // The dial's fastest setting must still be faster than the release; at its slowest
    // the player has deliberately asked for a slow push, and that is theirs to have.
    o.outSlowerThanFastestDial = secsOut > fastest;
  }
  // ⚠️ ...and it must actually be visible by DEFAULT, which is the thing that was
  // wrong: the previous default was a 5% push, i.e. a setting nobody could see.
  o.defaultZoom = M.goalZoom();
  o.defaultIsVisible = M.goalZoom() >= 1.4;

  // ---- the release must not DRAG the view across the pitch -----------------
  // ⚠️ `resetKickoff` teleports every body to its kickoff formation, and the camera
  // follows its subject's live position — so a scorer standing in the net one frame and
  // on the halfway line the next hauls the whole view with them, mid-drift-out. At a 5%
  // push that shift was invisible; at 1.8x over 1.1s it is a lurch, and it would read as
  // the retune being wrong rather than as a separate bug. The camera lets go of the
  // player when the push starts coming out and holds the spot instead.
  {
    M.goalCamReset(); M.sel.juice = true;
    const w4 = start();
    const scorer = w4.players[0];
    w4.ball.lastKicker = scorer;
    M.scoreGoal(w4, 0);
    for (let i=0;i<20;i++){ M.step(w4); M.advanceGoalCam(w4); }
    M.computeCam(); const heldOx = M.cam.ox, heldOy = M.cam.oy;
    o.followsWhilePushed = M.goalCam.p === scorer;
    // Now leave the goal state and TELEPORT the scorer the length of the pitch — the
    // worst case `resetKickoff` can produce, done explicitly so the check does not
    // depend on where that seed's formation happens to put them.
    w4.state = 'kickoff';
    M.advanceGoalCam(w4);                       // one step: this is where it lets go
    o.dropsTheSubject = M.goalCam.p === null;
    scorer.x = -w4.bounds.halfW * 0.9; scorer.y = -w4.bounds.halfL * 0.9;
    M.computeCam();
    o.panJump = Math.round(Math.hypot(M.cam.ox - heldOx, M.cam.oy - heldOy));
    // A few px of drift is the zoom easing out. Hundreds is the subject dragging it.
    o.noSnapOnRelease = o.panJump < 12;
  }

  M.goalCamReset(); M.sel.goalZoom = null; M.sel.goalZoomSpd = null; M.setMatchSeed(null);
  return o;
});

// ---- THE WIRING, driven through the REAL loop --------------------------------
// ⚠️ EVERYTHING ABOVE CALLS `computeCam()` BY HAND before it samples `cam.s`, and that
// is exactly how this suite passed a build where the goal camera did not work at all.
// `applyGoalCam` lives inside `computeCam`, and `computeCam` was called only from
// `resize()` — so the push never animated in the running game, and a resize landing
// during a celebration multiplied the zoom into `cam.s` and left it there for good.
// On a phone the URL bar showing and hiding fires `resize` constantly, so matches stuck
// at 1.8x at random until the player hit fullscreen. Measured, not theorised: `cam.s`
// held its fitted value through an entire celebration while `goalCam.t` reached 1.
//
// So this block touches `computeCam` NOWHERE. It scores a goal, lets rAF run, and reads
// `cam.s` — which is the only version of this question the player can actually see.
const live = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
live.on('pageerror', e => errors.push(e.message));
await live.addInitScript(()=>{ window.__MAGNETDEBUG=true; localStorage.clear();
  localStorage.setItem('magnetball.firstrun','1'); });
await live.goto('file://' + process.cwd() + '/index.html');
await live.waitForTimeout(900);
const L = await live.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const wait = ms => new Promise(r2=>setTimeout(r2,ms));
  M.sel.juice=true; M.sel.autoReplay=false; M.sel.mode='1v1'; M.sel.lobby='off';
  M.setMatchSeed(9); M.startMatch();
  const w=M.world; w.state='play'; w.stateT=1;
  await wait(80);
  o.base = +M.cam.s.toFixed(5);          // whatever the running game settled on

  w.ball.lastKicker = w.players[0];
  M.scoreGoal(w, 0);
  const seen=[];
  for (let i=0;i<12;i++){ await wait(50); seen.push(M.cam.s); }
  o.peak = +(Math.max(...seen)/o.base).toFixed(3);
  o.animatesUnaided = Math.max(...seen) > o.base*1.05;

  // ⚠️ A RESIZE MID-CELEBRATION — the exact trigger. A phone fires this on its own
  // every time the URL bar slides.
  w.state='goal'; w.stateT=0; M.goalCam.live=true; M.goalCam.t=1;
  window.dispatchEvent(new Event('resize'));
  await wait(60);
  o.midResize = +(M.cam.s/o.base).toFixed(3);
  w.state='kickoff';
  await wait(2200);                       // far longer than GOALCAM.outSecs
  o.settled = +(M.cam.s/o.base).toFixed(3);
  o.releasesAfterResize = M.cam.s <= o.base*1.02;
  o.goalCamT = +M.goalCam.t.toFixed(3);

  // ---- ⚠️ A REPLAY GETS THE ORIGINAL SIZE, AND SO DOES THE MATCH AFTER IT ----
  // `applyGoalCam` stands down while a replay is on screen, but the STEP LOOP is not running
  // either — `loop()` returns immediately — so `advanceGoalCam` never ticks and `goalCam.t`
  // sits frozen at whatever it had reached. The moment the replay ended the loop resumed, the
  // guard stopped applying, and the whole 1.8x push came straight back for a second and a
  // tenth of kickoff. Measured: 1.000 for one frame and 1.799 on the next.
  // ⚠️ Driven through the REAL auto-replay, not by setting `replay.active` by hand: the fix
  // lives on the path that STARTS a replay, so a probe that flipped the flag would sail past
  // it. The buffer is filled first, because the auto-replay does not fire without frames and
  // the whole trace then shows a goal with no replay in it at all.
  M.sel.autoReplay = true;
  M.goalCamReset();
  M.setMatchSeed(3); M.startMatch();
  const w2 = M.world; w2.state='play'; w2.stateT=2;
  await wait(80);
  o.repBase = +M.cam.s.toFixed(5);
  await wait(2500);                                    // let the rolling buffer fill
  w2.ball.x = 0; w2.ball.y = -w2.bounds.halfL + 4; w2.ball.vx = 0; w2.ball.vy = -14;
  w2.ball.lastKicker = w2.players[0];
  let sawGoalZoom = 0, duringReplay = [], afterReplay = [], sawReplay = false, done = false;
  // ⚠️ The SHAKE and the FLASH ride along — but they have to be PUT THERE first, and that
  // is the whole lesson of this block. Both decay in `decayJuice()`, which is step-locked,
  // and `loop()` returns immediately while a replay owns the canvas, so anything they hold
  // when playback starts is frozen for its whole length and discharged over the kickoff.
  // The catch is that on an ordinary goal there is nothing to freeze: shake peaks near 5.8
  // and is at zero within ~430ms, while the replay does not begin until GOALHOLD.replayAt
  // (3.0s). A probe that samples the natural path therefore measures zero on a build with
  // the release and zero on one without it — which is exactly what happened, and the
  // sabotage sailed through four green assertions. What is real is a kick landing late in
  // the celebration (play continues through it), so that is what gets reproduced: the juice
  // is topped back up on the last frame before playback, the way a late shot would.
  let shakeBefore = 0, shakeDuring = [], shakeAfter = [], flashDuring = [], flashAfter = [];
  let injected = false;
  const t0 = performance.now();
  while (performance.now() - t0 < 11000){
    await wait(40);
    const rel = M.cam.s / o.repBase;
    // A late kick, one frame before the replay takes over.
    if (!sawReplay && !injected && w2.state === 'goal' && w2.stateT > M.GOALHOLD.replayAt - 0.12){
      injected = true; M.shake = 6; M.flash = 0.9;
    }
    if (M.replay.active){ sawReplay = true; duringReplay.push(rel);
                          shakeDuring.push(M.shake); flashDuring.push(M.flash); }
    else if (sawReplay){ done = true; afterReplay.push(rel);
                         shakeAfter.push(M.shake); flashAfter.push(M.flash); }
    else { sawGoalZoom = Math.max(sawGoalZoom, rel); shakeBefore = Math.max(shakeBefore, M.shake); }
    if (done && afterReplay.length > 40) break;
  }
  o.sawReplay = sawReplay;
  o.goalZoomBefore = +sawGoalZoom.toFixed(3);
  o.duringReplayMax = duringReplay.length ? +Math.max(...duringReplay).toFixed(3) : 0;
  o.afterReplayMax  = afterReplay.length ? +Math.max(...afterReplay).toFixed(3) : 0;
  o.afterSamples = afterReplay.length;
  // The zoom has to have HAPPENED first, or "no zoom during the replay" is true of a build
  // with the goal camera switched off entirely.
  o.zoomedBeforeTheReplay = o.goalZoomBefore > 1.3;
  o.replayIsOriginalSize  = o.duringReplayMax < 1.02;
  o.matchStaysOriginalSize = o.afterReplayMax < 1.02;
  // ---- ...and so does the SHAKE and the FLASH ----
  o.shakeAtGoal    = +shakeBefore.toFixed(2);
  o.shakeInReplay  = shakeDuring.length ? +Math.max(...shakeDuring).toFixed(2) : 0;
  o.shakeAfter     = shakeAfter.length  ? +Math.max(...shakeAfter).toFixed(2)  : 0;
  o.flashInReplay  = flashDuring.length ? +Math.max(...flashDuring).toFixed(3) : 0;
  o.flashAfter     = flashAfter.length  ? +Math.max(...flashAfter).toFixed(3)  : 0;
  // The goal has to have SHAKEN in the first place, and the late kick has to have LANDED,
  // or every check below is true of a build with Screen shake switched off entirely.
  o.shookAtTheGoal    = o.shakeAtGoal > 1;
  o.lateKickLanded    = injected;
  o.replayIsSteady    = o.shakeInReplay < 0.3 && o.flashInReplay < 0.02;
  o.matchStaysSteady  = o.shakeAfter < 0.3 && o.flashAfter < 0.02;
  // ⚠️ And the juice must still WORK afterwards. `juiceReset()` is a reset, not a
  // switch-off, and a build that simply pinned shake at zero for good would sail through
  // every assertion above — which is most of what they measure.
  M.shake = 0; M.addShake(13);
  o.juiceStillWorks = M.shake > 1;
  M.shake = 0;
  return o;
});
await live.close();

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(L.animatesUnaided, `the push never moved cam.s in the running game (peak ${L.peak}x) — applyGoalCam only runs inside computeCam, and nothing calls that per frame`);
ok(Math.abs(L.peak - 1.8) < 0.15, `the live push peaked at ${L.peak}x, not the 1.8x default`);
ok(L.releasesAfterResize, `a resize during the celebration baked the zoom in: still ${L.settled}x of base two seconds later, with goalCam.t back at ${L.goalCamT} — this is the "stuck zoomed until I hit fullscreen" bug`);
ok(L.sawReplay, `the auto-replay never fired (${L.afterSamples} samples after it), so the two checks below prove nothing — the rolling buffer has to have frames in it`);
ok(L.zoomedBeforeTheReplay, `the goal never zoomed in the first place (peak ${L.goalZoomBefore}x), so "no zoom during the replay" would also be true of a build with the goal camera switched off`);
ok(L.replayIsOriginalSize, `the replay played at ${L.duringReplayMax}x of the fitted size — a replay frames itself`);
ok(L.matchStaysOriginalSize, `the match came back at ${L.afterReplayMax}x and eased out over the kickoff — standing the camera down FOR the replay is only half of it, because the step loop is not running either, so goalCam.t stays frozen and the whole push reapplies the instant the loop resumes`);
ok(L.shookAtTheGoal, `the goal never shook (peak ${L.shakeAtGoal}), so the checks below would also pass with Screen shake switched off entirely`);
ok(L.lateKickLanded, `the late kick was never injected, so "the replay is steady" is measuring the natural path — where shake is already zero three seconds before playback starts, on a build with the release AND on one without it. That is a vacuous pass, and it happened`);
ok(L.replayIsSteady, `the replay played with shake ${L.shakeInReplay} and flash ${L.flashInReplay} still live — decayJuice is step-locked and loop() returns early during playback, so a kick landing late in the celebration is frozen there for the whole replay`);
ok(L.matchStaysSteady, `the match came back with shake ${L.shakeAfter} and flash ${L.flashAfter} — a wobble and a coloured wash discharging over a kickoff, with nothing on screen that caused them`);
ok(L.juiceStillWorks, `a kick after the replay produced no shake at all — juiceReset() is a reset, not a switch-off, and pinning shake at zero would pass every check above`);
ok(r.startsLevel, 'a fresh match did not start on a level camera');
ok(r.live && r.followsTheScorer, 'the goal camera did not latch onto the scorer');
ok(r.stillWithoutStep, 'the push advanced inside a DRAW — a 144Hz screen would run it fast');
ok(r.movesWithStep, `the push never moved when stepped: ${JSON.stringify(r.ramp)}`);
ok(r.stillCelebrating, 'the goal state ended before the push finished, so the peak measured the ease-back');
ok(r.rampIsMonotonic, `the push in is not smooth: ${JSON.stringify(r.ramp)}`);
ok(r.reachesTheZoom, `peaked at ${r.peak}x, expected ${r.declaredZoom}x`);
ok(r.zoomedNotJustPanned, `the camera panned but never actually zoomed: scale grew ${r.zoomGrowth}x against a dial of ${r.declaredZoom}x`);
ok(r.centredOnScorer, `the scorer is not centred: off by ${JSON.stringify(r.scorerOffCentre)}px`);
ok(r.letsGo, `the camera stayed pushed in after the celebration: scale ${r.releasedScale}x`);
ok(r.releasedOx, 'the camera let go of the zoom but not of the pan');
ok(r.standsDownForReplay, `the push stayed up through the instant replay (t ${r.midPush})`);
ok(r.zoomWithoutShake,
   'the camera did NOT push in with Screen shake & effects off — ' + JSON.stringify(r.zoomWithoutShakeAt) +
   '. The zoom is its own dial; riding the shake toggle made the Goal zoom slider a dead control');
ok(r.sliderOffFlat,
   'the zoom slider at its "off" end still moved the camera — that end of the dial is the only off switch there is now');
ok(r.sliderSaysOff,
   'the slider does not READ "off" at its floor, so the one way to turn the push off is unlabelled');
ok(r.simBitIdentical, 'the sim diverged with the goal camera running — it is reachable from step()');
ok(r.slidersExist, 'there are no goal-zoom sliders');
ok(r.dialReads, `the sliders did not reach the camera: ${JSON.stringify(r.dialValues)}`);
ok(r.dialChangesPeak, `the zoom dial did not change the peak: ${r.fastPeak}x on a 2.5x setting`);
ok(r.dialChangesSpeed, `the speed dial did not change the push: full at step ${r.fastStepsToFull}, expected under 40 for 0.40s`);
ok(r.oneMeansOff, `1.0x did not mean off (label "${r.zoomOffLabel}")`);
ok(r.clampsWildValues, `out-of-range dial values were obeyed rather than clamped: ${JSON.stringify(r.clamped)}`);
ok(r.outIsSlower, `the push leaves as fast as it arrives (out/in = ${r.inOutRatio}) — it reads as a twitch, not an emphasis`);
ok(r.outSlowerThanFastestDial, `the release is quicker than the dial's quickest push: ${JSON.stringify(r.dialRange)}`);
ok(r.defaultIsVisible, `the DEFAULT push is ${r.defaultZoom}x — a setting nobody can see is the bug this retune exists to fix`);
ok(r.followsWhilePushed, 'the camera did not latch onto the scorer while pushed in');
ok(r.dropsTheSubject, 'the camera kept following its subject into the ease-out');
ok(r.noSnapOnRelease, `the view jumped ${r.panJump}px when the scorer was moved to their kickoff spot — the release is dragging the camera across the pitch`);

// ============================================================================
//  THE MIGRATION FOR AN EXISTING SHAKE-OFF INSTALL
//
//  ⚠️ Uncoupling the zoom from the shake toggle changes what a player ALREADY PLAYING
//  sees: somebody with effects off has never had a goal camera, and would suddenly get a
//  1.8× push at every goal, unasked — the opposite of what turning effects off meant. So
//  their dial is moved once to the value that reproduces today's game, where it is now
//  visible and reversible rather than being overridden behind their back.
//
//  ⚠️ THREE CASES, and each is a different answer:
//    · effects off + an UNTOUCHED zoom  → folded to off (what they see today, preserved)
//    · effects off + a zoom they SET    → left alone (they were being denied it; that is
//                                          the bug being fixed, not a preference to keep)
//    · effects ON                       → left alone, obviously
//
//  ⚠️ And it is ONE-SHOT. Unlike a pure key rename this is reversible by hand, so an
//  unguarded fold would silently switch the zoom back off the next morning for anybody who
//  turned it on. Measured by turning it back on and reloading again.
// ============================================================================
const foldCase = async (seed) => {
  const q = await b.newPage({ viewport:{ width:900, height:900 } });
  q.on('pageerror', e => errors.push(e.message));
  await q.addInitScript(()=>{ window.__MAGNETDEBUG = true; });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(500);
  // Write the "old install" storage, with no fold key, then reload into the new build.
  await q.evaluate(seed);
  await q.reload(); await q.waitForTimeout(700);
  const first = await q.evaluate(() => ({ zoom: window.__magnet.sel.goalZoom,
                                          label: window.__magnet.goalZoomLabel(),
                                          key: localStorage.getItem('magnetball.zoomfold') }));
  // ⚠️ A SECOND reload is the whole one-shot claim. Turn the zoom back on by hand first —
  // if the fold re-ran it would take it away again, which is the failure mode.
  await q.evaluate(() => { window.__magnet.sel.goalZoom = 180; window.__magnet.saveSel(); });
  await q.reload(); await q.waitForTimeout(700);
  const second = await q.evaluate(() => window.__magnet.sel.goalZoom);
  await q.close();
  return { first, second };
};

const foldOff  = await foldCase(() => { localStorage.removeItem('magnetball.zoomfold');
  localStorage.setItem('magnetball.sel', JSON.stringify({ juice:false, goalZoom:180 })); });
const foldKept = await foldCase(() => { localStorage.removeItem('magnetball.zoomfold');
  localStorage.setItem('magnetball.sel', JSON.stringify({ juice:false, goalZoom:400 })); });
const foldOn   = await foldCase(() => { localStorage.removeItem('magnetball.zoomfold');
  localStorage.setItem('magnetball.sel', JSON.stringify({ juice:true, goalZoom:180 })); });

ok(foldOff.first.zoom === 100 && foldOff.first.label === 'off',
   'effects-off with an untouched zoom was not folded to off — ' + JSON.stringify(foldOff.first) +
   ', so a player who turned effects off gets a 1.8x push they never asked for');
ok(foldOff.first.key === '1', 'the fold key was not stamped, so the fold would run again every launch');
ok(foldOff.second === 180,
   'the fold ran a SECOND time and took the zoom back off (' + foldOff.second + ') — it is reversible by ' +
   'hand, so an unguarded fold silently undoes the player every morning');
ok(foldKept.first.zoom === 400,
   'a zoom the player deliberately SET was folded away (' + foldKept.first.zoom + ') — they were being denied ' +
   'it, which is the bug being fixed rather than a preference to preserve');
ok(foldOn.first.zoom === 180,
   'an effects-ON install had its zoom changed (' + foldOn.first.zoom + ') — nothing about it was ever broken');

ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify({ ...r, live: L }, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ngoalcam OK');
