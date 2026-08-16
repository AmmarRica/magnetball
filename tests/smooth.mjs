// Motion has to look the same on every screen and stay smooth between sim steps.
//
// Two separate things are checked, because they failed for two different reasons:
//
//  1. Render motion state must advance per STEP, not per frame. Trails, screen
//     shake and the goal flash all used to tick inside a draw, so a 144Hz monitor
//     ran them ~2.4x faster than a 60Hz one: the identical match showed a ball
//     streak of 69 world units instead of 190, and half the disc dots.
//  2. Between steps the ball and players are drawn interpolated (ix/iy), so
//     anything anchored to them has to use the interpolated position too — the
//     streak used to start at the last sampled step and came unstuck from the ball
//     by most of a ball diameter at speed.
//
// Frame PACING is deliberately not asserted here: measured rAF jitter on this
// engine is about +-0.1ms (p05..p99 = 16.60..16.80ms), so there is nothing to
// smooth, and a test that pretended otherwise would just encode a strawman.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const STEP=1/60;
  M.sel.autoReplay=false; M.sel.orient='v'; M.applyDisplayMode(); await wait(150);

  // ---- 1) Same sim, different refresh rate --------------------------------
  // Run a fixed number of SIM STEPS while varying how many frames are rendered
  // around them, exactly as loop() would at that refresh rate.
  const atHz = hz => {
    M.sel.mode='2v2'; M.sel.kickoffRule='off'; M.setMatchSeed(7); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2; M.computeCam(); M.resetTrails();
    w.players.forEach((q,i)=>{ q.x=-150+i*30; q.y=-60; q.vx=0; q.vy=0; });
    w.ball.x=-150; w.ball.y=0; w.ball.vx=14; w.ball.vy=0;
    M.shake = 6; M.flash = 0.9;                    // a goal's worth of juice, decaying
    let acc=0, steps=0, frames=0, shake=0, flash=0;
    while (steps < 120){
      acc += 1/hz;
      let n=0;
      while (acc >= STEP && n < 5){ M.step(w); M.advanceTrails(w); M.decayJuice(); acc-=STEP; steps++; n++; }
      // Read the juice while it is still mid-decay — by step 120 everything has
      // reached 0 and comparing zeroes would prove nothing.
      if (steps >= 12 && !shake){ shake = M.shake; flash = M.flash; }
      M.renderAlpha = Math.max(0, Math.min(1, acc/STEP));
      M.render(); M.renderAlpha = 1; frames++;
    }
    let span=0; const bt=M.ballTrail;
    for (let i=1;i<bt.length;i++) span += Math.hypot(bt[i].x-bt[i-1].x, bt[i].y-bt[i-1].y);
    return { frames, steps, pts: bt.length, span:+span.toFixed(1),
             dots: M.discTrails.map(h=>h.length).join(','),
             shake:+shake.toFixed(4), flash:+flash.toFixed(4) };
  };
  const hz = [60,90,120,144].map(h=>({h, ...atHz(h)}));
  o.byHz = hz;
  // The point of the test: frame counts differ, everything else is identical.
  o.frameCountsDiffer = new Set(hz.map(x=>x.frames)).size === hz.length;
  o.sameSteps  = new Set(hz.map(x=>x.steps)).size === 1;
  o.sameSpan   = new Set(hz.map(x=>x.span)).size === 1;
  o.sameDots   = new Set(hz.map(x=>x.dots)).size === 1;
  o.sameShake  = new Set(hz.map(x=>x.shake)).size === 1;
  o.sameFlash  = new Set(hz.map(x=>x.flash)).size === 1;
  // ...and that there was actually something to compare. A streak of zero length
  // and no dots would satisfy every equality above.
  o.streakReal = hz[0].span > 60 && hz[0].pts >= 10;
  o.dotsReal   = hz[0].dots.split(',').some(n => +n >= 4);
  o.juiceReal  = hz[0].shake > 0 && hz[0].shake < 6 && hz[0].flash > 0 && hz[0].flash < 0.9;

  // Known-bad probe: decaying once per FRAME is the bug that shipped. At 144Hz
  // that is ~29 ticks by the time the sim has taken 12 steps, not 12 — if the two
  // came out the same, this suite could not see the thing it exists for.
  const decayed = (v, n, floor, k) => { for (let i=0;i<n;i++) v = v>floor ? v*k : 0; return v; };
  o.perStepShake  = +decayed(6, 12, 0.3, 0.85).toFixed(4);
  o.perFrameShake = +decayed(6, Math.round(12*144/60), 0.3, 0.85).toFixed(4);
  o.probeSeesFrameDecay = Math.abs(o.perFrameShake - o.perStepShake) > 1e-4
                       && Math.abs(hz[3].shake - o.perStepShake) < 1e-4;

  // ---- 2) The streak starts where the ball is DRAWN ------------------------
  // Mid-step the ball is drawn interpolated, behind the sim position. The streak
  // used to start at the sim position, so it poked out AHEAD of the ball by most
  // of a step of travel. Probe both sides of the drawn ball, well outside its
  // radius: ahead must be clean, behind must be inked.
  M.sel.mode='1v1'; M.setMatchSeed(7); M.startMatch();
  const w=M.world; w.state='play'; w.stateT=2; M.computeCam(); M.resetTrails();
  w.players.forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; });   // park everyone off-pitch
  w.ball.x=-80; w.ball.y=200; w.ball.vx=0; w.ball.vy=-30; w.ball.lastKickTeam=0;
  const cv=document.getElementById('game'), c2=cv.getContext('2d');
  const DPR = cv.width / cv.clientWidth;
  const px = (wxv,wyv) => { const [sx,sy]=M.screenPt(M.wx(wxv), M.wy(wyv));
    const d=c2.getImageData(Math.round(sx*DPR), Math.round(sy*DPR), 1, 1).data; return [d[0],d[1],d[2]]; };
  const diff=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]);
  for (let i=0;i<6;i++){ M.step(w); M.advanceTrails(w); }
  const bx = w.ball.x, br = w.ball.r;
  const ALPHA = 0.06;                             // barely into the step: ball far behind the sim
  M.renderAlpha = ALPHA;
  const sampleY = w.ball.y, drawnY = M.iy(w.ball);
  o.stepTravel = +Math.abs(sampleY - drawnY).toFixed(2);
  o.ballR = +br.toFixed(1);
  // Reference frame: identical, minus the streak. Emptying the path in place
  // makes drawBallTrail bail out without disturbing the ball.
  const saved = M.ballTrail.map(q=>({x:q.x, y:q.y}));
  M.ballTrail.length = 0;
  M.renderAlpha = ALPHA; M.render();
  const refAhead  = px(bx, sampleY);              // where the old streak head sat
  const refBehind = px(bx, drawnY + br*2.5);      // squarely along the path
  for (const q of saved) M.ballTrail.push(q);
  M.renderAlpha = ALPHA; M.render(); M.renderAlpha = 1;
  o.inkAhead  = diff(refAhead,  px(bx, sampleY));
  o.inkBehind = diff(refBehind, px(bx, drawnY + br*2.5));
  // The probe only means something if the sample sits outside the drawn ball.
  o.probeOutsideBall = o.stepTravel > br*1.6;
  o.streakStartsAtDrawnBall = o.probeOutsideBall && o.inkBehind > 12 && o.inkAhead <= 12;

  // ---- 3) Interpolation is doing its job ----------------------------------
  // On-screen judder: |d[i]-d[i-1]| / mean|d| along the ball's path. A stepped
  // (un-interpolated) ball on a 144Hz screen sits still for two frames then jumps.
  const judder = xs => { const d=[]; for(let i=1;i<xs.length;i++) d.push(xs[i]-xs[i-1]);
    const dd=[]; for(let i=1;i<d.length;i++) dd.push(Math.abs(d[i]-d[i-1]));
    const md=d.reduce((s,v)=>s+Math.abs(v),0)/d.length;
    return { j: dd.reduce((s,v)=>s+v,0)/dd.length/md, frozen: d.filter(v=>Math.abs(v)<1e-9).length, n:d.length }; };
  const path = hzv => {
    M.sel.mode='1v1'; M.setMatchSeed(7); M.startMatch();
    const w2=M.world; w2.state='play'; w2.stateT=2;
    w2.players.forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; });
    w2.ball.x=-190; w2.ball.y=0; w2.ball.vx=5; w2.ball.vy=0;
    const lerp=[], raw=[]; let acc=0;
    for (let i=0;i<Math.round(hzv*2);i++){
      acc += 1/hzv;
      let n=0; while (acc >= STEP && n < 5){ M.step(w2); acc-=STEP; n++; }
      M.renderAlpha = Math.max(0, Math.min(1, acc/STEP));
      lerp.push(M.ix(w2.ball)); M.renderAlpha = 1; raw.push(w2.ball.x);
    }
    return { lerp: judder(lerp), raw: judder(raw) };
  };
  const at144 = path(144);
  o.judder144    = +at144.lerp.j.toFixed(4);
  o.judder144Raw = +at144.raw.j.toFixed(4);
  o.frozen144    = at144.lerp.frozen;
  o.frozen144Raw = at144.raw.frozen;
  // Interpolated motion is continuous; the raw sim position is not. If these two
  // ever come out equal, ix() has quietly stopped interpolating.
  o.interpSmoother = o.judder144 < o.judder144Raw / 20;
  o.interpNoFreeze = o.frozen144 <= 2 && o.frozen144Raw > 50;

  M.resetTrails();
  return o;
});

// ---- the FPS readout ---------------------------------------------------------
// ⚠️ Frame rate is the ONE thing here that is deliberately NOT step-locked. Everything else in
// this suite exists because a draw-driven timer runs fast on a fast screen — but the sim rate
// is pinned at 1/60 by design, so a step-locked frame counter would read a flat 60 on every
// machine and answer nothing at all. It is fed wall-clock deltas and must follow them.
const fpsR = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const feed = (hz, n) => { for (let i=0;i<n;i++) M.trackFps(1/hz); return M.fps; };
  feed(100, 400); o.at100 = Math.round(M.fps);
  feed(30, 400);  o.at30  = Math.round(M.fps);
  o.tracksWallClock = o.at100 > 90 && o.at100 < 110 && o.at30 > 27 && o.at30 < 33;
  // Smoothed: a run of identical frames must not swing the reading about.
  feed(60, 400);
  const seen = [];
  for (let i=0;i<30;i++){ M.trackFps(1/60); seen.push(M.fps); }
  o.jitter = +(Math.max(...seen) - Math.min(...seen)).toFixed(3);
  o.smoothed = o.jitter < 1;
  // ...and it is drawn directly above the version tag, only while the debug readout is on.
  M.sel.mode='1v1'; M.setMatchSeed(5); M.startMatch();
  const w=M.world; w.state='play'; w.stateT=2;
  const cv=document.getElementById('game'), cc=cv.getContext('2d');
  const DPR=cv.width/cv.clientWidth;
  // The version line's own row, and the row one line above it.
  const rowInk = (dy) => {
    const y = Math.round((cv.clientHeight - M.debugFloor() - 4 + dy) * DPR);
    const d = cc.getImageData(0, Math.max(0, Math.min(cv.height-1, y)), Math.round(200*DPR), 1).data;
    let n=0; for (let k=0;k<d.length;k+=4) if (d[k]+d[k+1]+d[k+2] > 90) n++;
    return n;
  };
  M.sel.debug = false; M.computeCam(); M.render();
  const offAbove = rowInk(-16);
  M.sel.debug = true;  M.computeCam(); M.render();
  const onAbove = rowInk(-16);
  o.hiddenWithoutDebug = offAbove === 0;
  o.shownWithDebug = onAbove > 6;
  // The fps row sits ABOVE the version, i.e. at a smaller y.
  o.fpsBottom = -16; o.verTop = 0;
  o.aboveVersion = o.fpsBottom < o.verTop && o.shownWithDebug;
  M.sel.debug = false;
  return o;
});

// ================== the shake OFFSET, not just its amplitude ==================
// ⚠️ REPORTED AS "when hitting kick, it looks like it blinks". The amplitude decayed once
// per STEP — which this suite already checked — while the OFFSET was re-rolled inside
// `render()`, once per DRAW. So on a 144Hz screen the whole pitch was thrown to a new
// random place 2.4 times more often than the shake was tuned for, which is a strobe
// rather than a shake, and two draws of one frame produced two different pictures.
//
// ⚠️ The amplitude check above cannot see this: `shake` decays identically either way.
// What has to be measured is the OFFSET — that it holds still across two draws, and that
// it moves once per step.
const shakeR = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const cv = document.getElementById('game'), c2 = cv.getContext('2d');
  const hash = () => { const d = c2.getImageData(0, 0, cv.width, cv.height).data;
    let h = 0; for (let i = 0; i < d.length; i += 97) h = (h*31 + d[i])|0; return h; };
  M.sel.juice = true;
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(4); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  M.addShake(9);
  // ⚠️ One step FIRST, or the offset is still zero and the two-draw check passes for
  // the wrong reason — it would be comparing two unshaken frames.
  M.decayJuice();
  o.offset = M.shakeXY.map(v => +v.toFixed(3));
  o.offsetIsLive = Math.hypot(o.offset[0], o.offset[1]) > 0.3;
  M.render(); const a = hash();
  M.render(); const b2 = hash();
  o.twoDrawsAgree = a === b2;
  // ...and it really is moving the picture: a frame at a different offset must differ.
  M.decayJuice(); M.render(); const c = hash();
  o.offsetMovesThePicture = c !== a;
  // One new offset per step, and none in between.
  const seen = [];
  for (let i = 0; i < 6; i++){ M.decayJuice(); seen.push(M.shakeXY.join(',')); M.render(); M.render(); }
  o.perStep = seen;
  o.oneRollPerStep = new Set(seen).size === seen.length;
  // It settles to exactly zero rather than leaving the pitch parked off-centre.
  for (let i = 0; i < 90; i++) M.decayJuice();
  o.settled = M.shakeXY.join(',');
  o.settlesAtZero = M.shakeXY[0] === 0 && M.shakeXY[1] === 0;
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.frameCountsDiffer, `the four runs rendered the same number of frames — nothing was varied: ${JSON.stringify(r.byHz.map(x=>x.frames))}`);
ok(r.sameSteps, 'the runs did not cover the same number of sim steps');
ok(r.streakReal, `no streak to compare: ${JSON.stringify(r.byHz[0])}`);
ok(r.dotsReal,   `no disc dots to compare: ${r.byHz[0].dots}`);
ok(r.juiceReal,  `shake/flash never decayed: ${JSON.stringify(r.byHz[0])}`);
ok(r.sameSpan,  `ball streak length depends on refresh rate: ${JSON.stringify(r.byHz.map(x=>[x.h,x.span]))}`);
ok(r.sameDots,  `disc trail length depends on refresh rate: ${JSON.stringify(r.byHz.map(x=>[x.h,x.dots]))}`);
ok(r.sameShake, `screen shake decays with the refresh rate: ${JSON.stringify(r.byHz.map(x=>[x.h,x.shake]))}`);
ok(r.sameFlash, `goal flash decays with the refresh rate: ${JSON.stringify(r.byHz.map(x=>[x.h,x.flash]))}`);
ok(r.probeSeesFrameDecay, `per-frame and per-step decay are indistinguishable here, so this suite cannot see the bug it exists for: perStep ${r.perStepShake}, perFrame ${r.perFrameShake}, measured ${r.byHz[3].shake}`);
ok(r.probeOutsideBall, `streak probe sits inside the drawn ball (step travel ${r.stepTravel} vs radius ${r.ballR}) — it could not tell the two apart`);
ok(r.inkBehind > 12, `no streak drawn behind the ball (ink ${r.inkBehind}) — the ahead-probe would pass vacuously`);
ok(r.streakStartsAtDrawnBall, `streak overshoots the drawn ball: ink ${r.inkAhead} at the sim position, ${r.stepTravel} units ahead of where the ball is drawn`);
ok(r.interpSmoother, `interpolation is not smoothing on-screen motion: judder ${r.judder144} vs raw ${r.judder144Raw}`);
ok(r.interpNoFreeze, `interpolated frames froze: ${r.frozen144}/${r.frozen144Raw} raw`);
ok(fpsR.tracksWallClock, `the FPS meter does not follow wall-clock: fed 100Hz it read ${fpsR.at100}, fed 30Hz ${fpsR.at30} — the SIM rate is fixed at 1/60 by design, so a step-locked counter would read a flat 60 on every machine and answer nothing`);
ok(fpsR.smoothed, `the FPS meter is not smoothed (${fpsR.jitter} spread over steady frames) — a raw per-frame reciprocal jitters by ±8 and is unreadable`);
ok(fpsR.shownWithDebug, 'the frame rate is not drawn while the debug readout is on');
ok(fpsR.hiddenWithoutDebug, 'the frame rate is drawn with the debug readout off');
ok(fpsR.aboveVersion, `the frame rate is not above the version tag (fps row bottom ${fpsR.fpsBottom} vs version top ${fpsR.verTop})`);
ok(shakeR.offsetIsLive, `the shake offset is zero right after a kick (${JSON.stringify(shakeR.offset)}) — the two-draw check below would pass on two unshaken frames`);
ok(shakeR.twoDrawsAgree, 'two draws of ONE frame differ while the screen is shaking — the offset is being rolled in render(), which is the "it blinks on every kick" report: at 144Hz the pitch is thrown somewhere new 2.4x more often than the shake was tuned for');
ok(shakeR.offsetMovesThePicture, 'a new shake offset does not change the picture at all, so the check above is vacuous');
ok(shakeR.oneRollPerStep, `the offset does not move once per step: ${JSON.stringify(shakeR.perStep)}`);
ok(shakeR.settlesAtZero, `the shake settles at ${shakeR.settled} rather than exactly zero, leaving the pitch parked off-centre`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify({ ...r, ...fpsR, shake: shakeR }, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nsmooth OK');
