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
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nsmooth OK');
