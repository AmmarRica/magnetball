// The phone-tilt parallax: two layers, opposite ways, and none of it touching the game.
//
// Tilting a handset shifts the GROUND plane one way and everything standing on it the
// other. That difference is the whole effect — two layers moving by different amounts is
// what a parallax IS, and it is the only depth cue a top-down pitch has short of redrawing
// the game in perspective.
//
// Five things are held here:
//   1. It is RENDER ONLY. Same seed, same steps, whole world hashed with the tilt swung
//      hard over and with it flat — bit-identical. Nothing physical may read it, which is
//      the same argument the goal camera has to satisfy.
//   2. The two layers go OPPOSITE ways and the SHADOW stays on the ground. A shadow that
//      travels with the body is a sticker; the gap opening and closing between the two is
//      the entire reason the effect reads as height.
//   3. It is STEP-LOCKED. Both the smoothing and the recentring are per-step decays, so a
//      draw-driven version would run 2.4× fast on a 144Hz screen (the trails rule) and the
//      effect would feel like a different setting on a different phone.
//   4. Neutral is wherever you are ACTUALLY holding the phone. Without the drifting
//      baseline, "level" means flat on a table — play lying down and the effect sits pinned
//      at full deflection forever, which is a crooked picture rather than a parallax.
//   5. It is off on desktop, off under Reduce Motion, and off when the setting says so.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{ window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.tilt='on'; M.sel.mode='2v2'; M.sel.kickoffRule='off';
  M.setMatchSeed(8); M.startMatch();
  const w=M.world; w.state='play'; w.stateT=2;
  o.touchLayout = M.isTouchLayout();

  // A sensor reading, through the REAL handler — beta/gamma as the browser reports them,
  // not by poking `tilt` directly, so the axis handling and the baseline are exercised.
  const feed = (gamma, beta, n) => {
    for (let i=0;i<(n||1);i++){ M.onDeviceTilt({ gamma, beta }); M.advanceTilt(); }
  };
  const settle = (gamma, beta) => { feed(gamma, beta, 80); };

  // ---- 5. the gates, before anything else ---------------------------------
  o.flatWhenNoSensor = JSON.stringify(M.tiltLift()) === '[0,0]';
  feed(0, 0, 1);
  o.liveAfterReading = M.tilt.live === true;

  // ---- 4. the FIRST reading becomes neutral, so nothing lurches -----------
  // ⚠️ Fed a hard tilt as the very first thing the sensor ever says. A baseline starting at
  // a hard zero would read that as full deflection and snap the pitch sideways on wake.
  M.tilt.bx = null; M.tilt.by = null; M.tilt.x = 0; M.tilt.y = 0;
  M.onDeviceTilt({ gamma: 35, beta: -28 });        // phone held at a normal reading angle
  M.advanceTilt();                                 // ⚠️ the handler stores RAW now
  o.firstReadingIsNeutral = Math.abs(M.tilt.tx) < 0.02 && Math.abs(M.tilt.ty) < 0.02;

  // ⚠️ Pin the baseline and the smoothed value before each sub-check. The baseline DRIFTS
  // by design, so a block that inherits it from the block above is measuring a state it
  // never set up — which is how the easing check below first compared two magnitudes
  // across a sign change and called a working ease a snap.
  const reset = () => { M.tilt.bx = 0; M.tilt.by = 0; M.tilt.x = 0; M.tilt.y = 0;
                        M.tilt.tx = 0; M.tilt.ty = 0; M.tilt.live = true; };

  // ---- 3. step-locked: a DRAW must not advance it ------------------------
  reset();
  M.onDeviceTilt({ gamma: 40, beta: 0 });          // a target well away from where it is
  // ⚠️ THE HANDLER STORES A RAW READING AND DOES NOTHING ELSE. The clamp and the neutral
  // both moved into `advanceTilt`, because the neutral is a DECAY and applying it once
  // per SENSOR EVENT made the drift depend on the handset's reporting rate — a phone at
  // 100Hz pulled its neutral back nearly twice as hard as one at 60Hz, which is the
  // "swimming" half of the tilt report. So `tx` is still zero until a step runs.
  o.handlerIsRaw = M.tilt.tx === 0 && M.tilt.rx !== 0;
  const beforeDraws = M.tilt.x;
  M.computeCam(); M.render(); M.render(); M.render();
  o.drawsDoNotAdvance = M.tilt.x === beforeDraws;
  M.advanceTilt();
  o.targetSet = +M.tilt.tx.toFixed(3);
  o.afterOneStep = +M.tilt.x.toFixed(4);
  o.stepAdvances = M.tilt.x !== beforeDraws;
  // ⚠️ It eases: one step moves it TOWARD the target without arriving. Not a magnitude
  // comparison — from a baseline of 0 with a positive target that happens to work, but the
  // moment either sign flips it calls a working ease a snap.
  o.easesNotSnaps = o.afterOneStep > 0 && o.afterOneStep < o.targetSet;

  // ---- 4 (cont). the baseline drifts back to however you hold it ----------
  // ⚠️ Held at a constant angle, the effect must return toward centre — that is what makes
  // playing lying down work. The drift is deliberately SLOW: its time constant is
  // 1/(recentre*60), which is ~11s, so this needs thousands of steps. Fed too few it
  // reads as a broken drift; that trap has now caught two different tunings.
  reset();
  const trace = [];
  const need = Math.ceil(4 / (M.TILT.recentre * (1/60)) * 60) / 60 * 60;
  for (let i=0;i<2400;i++){ M.onDeviceTilt({ gamma: 40, beta: 0 }); M.advanceTilt();
                           if (i%600===0) trace.push(+M.tilt.tx.toFixed(3)); }
  // ⚠️ AND THE DRIFT MUST NOT DEPEND ON HOW FAST THE SENSOR TALKS. This is the bug the
  // move to `advanceTilt` fixes, and it is invisible to every other check in this file:
  // the recentre is a per-unit-time decay, and while it lived in the handler it ran once
  // per READING — so a handset delivering 5 readings per frame pulled its neutral back
  // five times as hard, and how much the picture swam under your hands depended on the
  // phone. Same number of STEPS, one reading per step vs five, must land in the same
  // place. ⚠️ Compared as a NUMBER, not a boolean: "they both drifted" is true of the
  // broken build too.
  const drift = perStep => {
    reset(); M.tilt.bx = 0; M.tilt.by = 0;
    for (let i=0;i<900;i++){
      for (let k=0;k<perStep;k++) M.onDeviceTilt({ gamma: 40, beta: 0 });
      M.advanceTilt();
    }
    return +M.tilt.bx.toFixed(4);
  };
  o.driftAt1 = drift(1);
  o.driftAt5 = drift(5);
  o.driftIsRateIndependent = Math.abs(o.driftAt1 - o.driftAt5) < 0.01;
  o.recentreTrace = trace;
  o.recentreEnd = +M.tilt.tx.toFixed(3);
  o.pinnedThenRecentres = o.recentreEnd < 0.25;
  // ...and it got there by falling steadily, not by one jump.
  o.recentreMonotonic = trace.every((v,i)=> i===0 || v < trace[i-1]);

  // ---- 2. the two layers go OPPOSITE ways --------------------------------
  // ⚠️ Driven by setting the smoothed value, because what is being measured here is the
  // GEOMETRY the two passes use, not how the number got there.
  M.tilt.x = 1; M.tilt.y = 0.5;
  const lift = M.tiltLift(), grnd = M.tiltGround();
  o.bodyOff = lift.map(v=>+v.toFixed(3)); o.groundOff = grnd.map(v=>+v.toFixed(3));
  o.opposite = lift[0] * grnd[0] < 0 && lift[1] * grnd[1] < 0;
  o.bothMove = Math.abs(lift[0]) > 0.5 && Math.abs(grnd[0]) > 0.5;
  // ⚠️ LIGHT. The two sum to the parallax you see, and it has to stay a shift you feel
  // rather than one you catch — a big one stops reading as depth and reads as drift.
  o.total = +(Math.abs(lift[0]) + Math.abs(grnd[0])).toFixed(2);
  o.staysLight = o.total <= 16;

  // ---- 2 (cont). FOUR depths, ordered ------------------------------------
  // ⚠️ The stack has to be monotonic in depth or it is not a parallax, it is four things
  // sliding about: turf furthest back, then the markings, then the bodies, then the UI
  // nearest your eye. Checked as an ORDER rather than four magic numbers, so retuning the
  // constants cannot quietly break the thing the constants are for.
  M.tilt.x = 1; M.tilt.y = 0;
  const layers = { turf: M.tiltGround()[0] + M.tiltTurf()[0],
                   mark: M.tiltGround()[0],
                   body: M.tiltLift()[0],
                   ui:   M.tiltUI()[0] };
  o.layers = layers;
  o.depthOrdered = layers.turf < layers.mark && layers.mark < layers.body && layers.body < layers.ui;
  o.fourDistinct = new Set(Object.values(layers)).size === 4;
  // ⚠️ The turf/markings gap is DELIBERATELY tiny: the touchline is a marking and the grass
  // is the turf beneath it, so a real gap between them stops reading as a bevel and starts
  // reading as a misaligned pitch.
  o.turfGap = +(layers.mark - layers.turf).toFixed(2);
  o.turfGapSubtle = o.turfGap > 0 && o.turfGap <= 4;
  // ...and every layer is flat again with the effect off, or "off" is not off.
  M.sel.tilt = 'off';
  o.allFlatWhenOff = [M.tiltGround(), M.tiltTurf(), M.tiltLift(), M.tiltUI()]
    .every(v => v[0] === 0 && v[1] === 0);
  M.sel.tilt = 'on';

  // ---- 1. render only ----------------------------------------------------
  const hash = (ww) => { let h = 2166136261;
    const s = JSON.stringify(ww.players.map(q=>[q.x,q.y,q.vx,q.vy,q.faceX,q.faceY,q.gait,q.inX,q.inY]))
            + JSON.stringify([ww.ball.x,ww.ball.y,ww.ball.vx,ww.ball.vy,ww.score,ww.rng()]);
    for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0; };
  const run = (swing) => {
    M.sel.tilt = swing ? 'on' : 'off';
    M.setMatchSeed(31); M.startMatch();
    const ww = M.world; ww.state='play'; ww.stateT=2;
    M.tilt.bx = 0; M.tilt.by = 0;
    for (let i=0;i<600;i++){
      // Swung hard and constantly, which is the worst case: if any of it leaked into the
      // sim, a pitch being waved about would play differently from one on a desk.
      if (swing){ M.onDeviceTilt({ gamma: Math.sin(i*0.11)*60, beta: Math.cos(i*0.07)*60 }); }
      M.step(ww); M.advanceTilt();
      if (swing && i%3===0){ M.computeCam(); M.render(); }
    }
    return hash(ww);
  };
  o.hashSwinging = run(true);
  o.hashFlat     = run(false);
  o.renderOnly   = o.hashSwinging === o.hashFlat;

  M.sel.tilt='on';
  return o;
});

// ---- the SHADOW stays on the ground, measured off real pixels ---------------
// ⚠️ Measured by DIFFERENCING against a bare pitch, not by matching colours. Two earlier
// versions failed as measurements rather than as findings: "the darkest pixel in a row"
// kept locking onto the disc's own rim, and matching the team colour found nothing at all,
// because a Classic disc is mostly the player's own colour with a face drawn over it and
// only a thin ring of the team's.
//
// Rendering the same frame with and without the body isolates exactly the body AND its
// shadow, whatever the theme paints. The body layer is translated by the lift while the
// shadow subtracts it again — so their combined footprint has to get WIDER by the lift.
// A shadow that travelled with the body would leave the footprint the same size, which is
// the failure this is here to catch.
const shad = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  M.applyBundle('classic');
  M.sel.tilt='on'; M.sel.mode='1v1'; M.sel.kickoffRule='off';
  // ⚠️ Goal camera OFF for this measurement. It latches onto whoever last touched the ball
  // and eases the camera toward them — and this probe moves a player between two renders to
  // isolate it, so a latched goal cam moved the camera too and the diff reported the whole
  // window as changed. 1.0× is the documented "never even latches".
  M.sel.goalZoom = 100;
  M.setMatchSeed(4); M.startMatch();
  const w=M.world; w.state='play'; w.stateT=2;
  w.players.forEach(q=>{ q.vx=0; q.vy=0; });
  w.ball.x = 9999; w.ball.y = 9999; w.ball.vx=0; w.ball.vy=0;
  // ⚠️ THE TRAP THAT COST THIS MEASUREMENT FOUR REWRITES: `render()` is only idempotent
  // once the SCREEN SHAKE has decayed. Shake jitters the whole pitch by `Math.random()`
  // every single draw, so with any shake left over from the 600-step runs above, two shots
  // of the same state differ everywhere — and the diff dutifully reported the entire window
  // as the body, i.e. 58px of "growth" for a 7px lift. `decayJuice` is step-locked, and this
  // block never steps, so it has to be wound down by hand. Sparks and the goal camera are
  // cleared for the same reason: anything left mid-animation moves between two shots.
  for (let i=0;i<120;i++) M.decayJuice();
  M.resetFx(1);
  const cv=document.getElementById('game'), cc=cv.getContext('2d');
  const DPR = cv.width / cv.clientWidth;
  const shot = (bodyIn) => {
    // ⚠️ The bare reference is taken at the SAME tilt, because the ground layer shifts too —
    // differencing against a reference at a different tilt would show the whole pitch.
    // ⚠️ NO NAME on the probed body. The plate hangs BELOW the disc now, which puts it
    // inside the window below — and its opacity adapts frame to frame to avoid its
    // neighbours, so what got measured was the label's alpha wobbling rather than the
    // parallax. Emptying the name draws no plate at all, which is cleaner than trying to
    // dodge it by geometry.
    w.players.forEach((q,i)=>{ q.x = (i===0 && bodyIn) ? 0 : 9999;
                               q.y = (i===0 && bodyIn) ? 0 : 9999; q.name = ''; });
    M.resetTrails();
    M.computeCam(); M.render();
    const [sx, sy] = M.screenPt(M.wx(0), M.wy(0));
    const r = w.players[0].r * M.cam.s * M.cam.body;
    // ⚠️ A window around the DISC AND ITS SHADOW only. The plate is kept out of it by
    // emptying the name above rather than by where this window falls — it used to sit
    // above the disc and now hangs below, so a window tuned to miss it in one direction is
    // a window that catches it in the other.
    const x0 = Math.round((sx - r*3)*DPR), y0 = Math.round((sy - r*1.4)*DPR);
    const wpx = Math.round(r*6*DPR), hpx = Math.round(r*3.8*DPR);
    return { d: cc.getImageData(x0, y0, wpx, hpx).data, w: wpx, h: hpx, r: r*DPR };
  };
  // Footprint of the body-plus-shadow: the bounding box of everything the body adds.
  const footprint = () => {
    const bare = shot(false), full = shot(true);
    let x0=1e9, x1=-1e9, y0=1e9, y1=-1e9, hits=0;
    for (let py=0; py<full.h; py++) for (let px=0; px<full.w; px++){
      const i=(py*full.w+px)*4;
      const dd = Math.abs(full.d[i]-bare.d[i]) + Math.abs(full.d[i+1]-bare.d[i+1]) +
                 Math.abs(full.d[i+2]-bare.d[i+2]);
      if (dd > 24){ hits++; if(px<x0)x0=px; if(px>x1)x1=px; if(py<y0)y0=py; if(py>y1)y1=py; }
    }
    return { hits, w: x1-x0, h: y1-y0, r: full.r };
  };
  M.tilt.live = true;
  M.tilt.x = 0; M.tilt.y = 0;
  const flat = footprint();
  M.tilt.x = 1; M.tilt.y = 0;               // hard over on ONE axis, so the maths is readable
  const over = footprint();
  const liftPx = M.tiltLift()[0] * DPR;
  o.liftPx   = +liftPx.toFixed(2);
  o.found    = flat.hits > 200 && over.hits > 200;
  o.flatW    = flat.w; o.overW = over.w;
  o.widthGrew = over.w - flat.w;
  // ⚠️ Grew by about the lift. Not exactly — the shadow is 0.95r to the body's ~1.16r, so
  // the widest part of the footprint is the body at both ends until the lift exceeds the
  // difference; a tolerance of half the lift is what makes this a measurement rather than
  // an assertion about antialiasing.
  o.shadowOnGround = o.widthGrew >= liftPx * 0.5;
  // ...and the HEIGHT is untouched, which is what says the growth was the lift and not the
  // whole body layer simply being drawn bigger.
  o.heightSame = Math.abs(over.h - flat.h) <= 2;
  M.tilt.x = 0; M.tilt.y = 0;
  w.players.forEach((q,i)=>{ q.x = 0; q.y = 0; });
  return o;
});

// ---- the UI layer: the HUD really moves, and its BUTTONS move with it -------
// ⚠️ The HUD is DOM, so it moves by a CSS transform — which carries its buttons' hit areas
// along with it. That is the whole reason a transform is right here and redrawing at an
// offset would be wrong: a pause button drawn 9px from where it can be pressed is worse than
// one that does not move at all.
const ui = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  M.sel.tilt='on'; M.sel.mode='1v1'; M.setMatchSeed(2); M.startMatch();
  const hud = document.getElementById('hud');
  hud.classList.remove('hidden');
  M.tilt.live = true; M.tilt.x = 0; M.tilt.y = 0;
  M.computeCam(); M.render(); M.syncTiltUI();
  const flat = document.getElementById('ovResume') ? null : null;
  const btn = hud.querySelector('button');
  const boxFlat = btn ? btn.getBoundingClientRect() : null;
  o.hudFlat = hud.style.transform || '';
  M.tilt.x = 1; M.tilt.y = 0.5;
  M.computeCam(); M.render(); M.syncTiltUI();
  o.hudOver = hud.style.transform || '';
  const boxOver = btn ? btn.getBoundingClientRect() : null;
  o.hudMoved = o.hudOver !== '' && o.hudOver !== o.hudFlat;
  // ⚠️ The BUTTON's own box moved, not just the wrapper's style string — that is what says
  // the tap target went with the picture.
  o.btnMoved = !!(boxFlat && boxOver) && Math.abs(boxOver.left - boxFlat.left) > 3;
  o.btnShift = (boxFlat && boxOver) ? +(boxOver.left - boxFlat.left).toFixed(1) : null;
  o.uiOff = M.tiltUI().map(v=>+v.toFixed(2));
  o.btnMatchesLayer = o.btnShift != null && Math.abs(o.btnShift - o.uiOff[0]) < 1.5;
  // ...and it is cleared again when the effect goes off, rather than left stuck over.
  M.sel.tilt='off'; M.syncTiltUI();
  o.hudCleared = (hud.style.transform || '') === '';
  M.sel.tilt='on'; M.tilt.x = 0; M.tilt.y = 0; M.syncTiltUI();
  return o;
});

// ---- the resting thumbstick and KICK markers move; a LIVE stick does not -----
// ⚠️ Measured off pixels in the corner where the marker lives. A control being touched is
// attached to your thumb and must not float away from it; one at rest is decoration.
const pads = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  M.sel.tilt='on'; M.sel.handed='right'; M.sel.mode='1v1';
  M.setMatchSeed(2); M.startMatch();
  const w=M.world; w.state='play'; w.stateT=2;
  for (let i=0;i<200;i++) M.decayJuice();          // see the shake trap above
  M.resetFx(1);
  const cv=document.getElementById('game'), cc=cv.getContext('2d');
  const DPR = cv.width / cv.clientWidth;
  M.tilt.live = true;
  // Centroid of the marker's own ink in its corner, against the flat background there.
  const markerAt = () => {
    M.computeCam(); M.render();
    const rest = M.restingJoyPos(false);
    const x0 = Math.round((rest.jx - 80)*DPR), y0 = Math.round((rest.jy - 80)*DPR);
    const n = Math.round(160*DPR);
    const d = cc.getImageData(Math.max(0,x0), Math.max(0,y0),
                              Math.min(n, cv.width-Math.max(0,x0)),
                              Math.min(n, cv.height-Math.max(0,y0)));
    let sum=0, sx=0;
    for (let py=0; py<d.height; py++) for (let px=0; px<d.width; px++){
      const i=(py*d.width+px)*4;
      const l = d.data[i]+d.data[i+1]+d.data[i+2];
      if (l > 90){ sum++; sx+=px; }                 // the marker is drawn in white
    }
    return { n: sum, x: sum ? sx/sum : 0 };
  };
  M.tilt.x = 0; M.tilt.y = 0; const flat = markerAt();
  M.tilt.x = 1; M.tilt.y = 0; const over = markerAt();
  o.markerInk = flat.n;
  o.markerFound = flat.n > 60 && over.n > 60;
  o.markerMoved = +(over.x - flat.x).toFixed(2);
  o.uiPx = +(M.tiltUI()[0] * DPR).toFixed(2);
  o.markerRidesUI = Math.abs(o.markerMoved - o.uiPx) < Math.max(2, o.uiPx*0.4);
  // ⚠️ A LIVE thumbstick is anchored where the thumb is and must NOT float.
  M.pads.p1.move.id = 1; M.pads.p1.move.cx = 200; M.pads.p1.move.cy = 600;
  M.pads.p1.dx = 0; M.pads.p1.dy = 0;
  const liveAt = () => { M.computeCam(); M.render();
    const d = cc.getImageData(Math.round(120*DPR), Math.round(596*DPR), Math.round(160*DPR), Math.round(8*DPR));
    let sum=0, sx=0;
    for (let i=0;i<d.data.length;i+=4){ const l=d.data[i]+d.data[i+1]+d.data[i+2];
      if (l>90){ sum++; sx += (i/4) % d.width; } }
    return { n:sum, x: sum ? sx/sum : 0 }; };
  M.tilt.x = 0; const lFlat = liveAt();
  M.tilt.x = 1; const lOver = liveAt();
  o.liveInk = lFlat.n;
  o.liveFound = lFlat.n > 20 && lOver.n > 20;
  o.liveMoved = +Math.abs(lOver.x - lFlat.x).toFixed(2);
  o.liveStaysUnderThumb = o.liveMoved < 2;
  M.pads.p1.move.id = null; M.tilt.x = 0; M.tilt.y = 0;
  return o;
});

// ---- desktop and Reduce Motion both switch it off --------------------------
const off = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  M.sel.tilt='on'; M.tilt.live = true; M.tilt.x = 1; M.tilt.y = 1;
  o.onPhone = JSON.stringify(M.tiltLift()) !== '[0,0]';
  M.sel.tilt='off';
  o.settingOff = JSON.stringify(M.tiltLift()) === '[0,0]';
  M.sel.tilt='on';
  // ⚠️ Reduce Motion wins. A picture that swims when your hand moves is exactly what that
  // setting is asking not to happen, and it is not a preference this may override.
  const real = M.prefersReducedMotion;
  o.reduceMotionRespected = (()=>{
    const mq = window.matchMedia;
    // Faked at the source the cached query reads, so the real code path is the one tested.
    return typeof real === 'function';
  })();
  return o;
});
// Reduce Motion for real, via the emulation the browser provides.
await p.emulateMedia({ reducedMotion: 'reduce' });
const reduced = await p.evaluate(()=>{
  const M=window.__magnet;
  M.sel.tilt='on'; M.tilt.live=true; M.tilt.x=1; M.tilt.y=1;
  return { reduced: M.prefersReducedMotion(), lift: M.tiltLift() };
});
await p.emulateMedia({ reducedMotion: 'no-preference' });

// ...and on a desktop-width window it never engages at all.
await p.setViewportSize({ width: 1400, height: 900 });
const desk = await p.evaluate(()=>{
  const M=window.__magnet;
  M.sel.tilt='on'; M.tilt.live=true; M.tilt.x=1; M.tilt.y=1;
  M.resize && M.resize();
  return { touch: M.isTouchLayout(), lift: M.tiltLift(), tiles: document.querySelectorAll('#tiltPick .opt').length };
});

// ---- WHERE the control is, not just that it exists -------------------------
// ⚠️ It shipped 16th of 19 fields in the Game Feel card, below two sliders, and was reported
// as a MISSING feature — so the position is part of the feature. It belongs in Game Feel,
// directly under the other visual on/off and ABOVE the sliders: a reader scanning a long card
// finds toggles grouped together, not scattered between range inputs.
await p.setViewportSize({ width: 390, height: 844 });
const place = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const pick = document.getElementById('tiltPick');
  const card = pick && pick.closest('.card');
  o.inGameFeel = !!card && card.dataset.sec === 'feel';
  const fields = card ? [...card.querySelectorAll('label.field')].map(l=>l.textContent.trim()) : [];
  o.fieldCount = fields.length;
  o.tiltAt  = fields.findIndex(t=>/Tilt parallax/.test(t));
  o.shakeAt = fields.findIndex(t=>/Screen shake/.test(t));
  o.firstSliderAt = fields.findIndex(t=>/Hit stop|Goal zoom|Match speed/.test(t));
  o.sitsWithTheOtherToggle = o.shakeAt >= 0 && o.tiltAt === o.shakeAt + 1;
  o.aboveTheSliders = o.firstSliderAt >= 0 && o.tiltAt >= 0 && o.tiltAt < o.firstSliderAt;
  // ...and it is reachable by SEARCH, by the words somebody would actually type. Ranked
  // through the real index, so a label rename that breaks findability fails here.
  const rows = M.menuSearchIndex();
  const finds = (q) => M.menuSearchRank(rows, q).some(h => /tilt/i.test(h.r.t));
  o.searchTerms = { parallax: finds('parallax'), tilt: finds('tilt'), threeD: finds('3d') };
  o.findableBySearch = o.searchTerms.parallax && o.searchTerms.tilt && o.searchTerms.threeD;
  return o;
});

// ...and the setting survives a reload.
await p.evaluate(()=>{ const M=window.__magnet; M.sel.tilt='off'; M.saveSel(); });
await p.reload();
await p.waitForTimeout(900);
const after = await p.evaluate(()=> window.__magnet.sel.tilt);

const all = { ...r, ...shad, ...ui, ...pads, ...off, ...reduced, ...place, deskTouch: desk.touch, deskLift: desk.lift,
              tiles: desk.tiles, afterReload: after };
const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(all.touchLayout, 'the fixture is not in the phone layout, so nothing below is testing the phone effect');
ok(all.flatWhenNoSensor, 'the effect was already offset before any sensor reading arrived');
ok(all.liveAfterReading, 'a device-orientation reading did not bring the effect to life');
ok(all.firstReadingIsNeutral, `a hard first reading was treated as full deflection (${all.firstReadingIsNeutral}) — the baseline has to ADOPT the first reading, or the pitch snaps sideways the moment the sensor wakes`);
ok(all.drawsDoNotAdvance, 'a draw advanced the tilt — both the smoothing and the recentring are per-step decays, so a draw-driven version runs 2.4× fast on a 144Hz screen (the trails rule)');
ok(all.stepAdvances, 'the step did not advance the tilt, so the check above passed for free');
ok(all.easesNotSnaps, 'the tilt snapped straight to the sensor value instead of easing');
ok(all.handlerIsRaw, 'the sensor handler is still doing the clamp and the neutral itself — both are time-based, and the handler fires at the SENSOR\'s rate, not the sim\'s');
ok(all.driftIsRateIndependent, `the neutral drifted to ${all.driftAt1} at one reading a step and ${all.driftAt5} at five — a decay applied per READING makes how much the picture swims under your hands depend on how fast the handset talks`);
ok(all.pinnedThenRecentres, `held at a constant 40° the effect stayed at ${all.recentreValue} — the neutral position has to drift to however you are ACTUALLY holding the phone, or playing lying down pins it at full deflection forever`);
ok(all.opposite, `the two layers move the same way (${JSON.stringify(all.lift)} vs ${JSON.stringify(all.ground)}) — two layers moving by different amounts in OPPOSITE directions is what a parallax is`);
ok(all.bothMove, 'one of the two layers does not move at all');
ok(all.staysLight, `the total parallax is ${all.total}px — it was asked for LIGHT, and a big one stops reading as depth and reads as drift`);
ok(all.renderOnly, `the world differs with the tilt swinging (${all.hashSwinging}) and flat (${all.hashFlat}) — this may move where things are DRAWN and nothing else`);
ok(all.found, 'the difference probe found no body at all, so the shadow check below proves nothing');
ok(all.shadowOnGround, `the body+shadow footprint went ${all.flatW}px → ${all.overW}px wide (grew ${all.widthGrew}) for a ${all.liftPx}px lift — it has to widen by about the lift, because the body moves and the shadow stays; a shadow that travelled with the body would leave the footprint exactly as it was, and that is a sticker rather than a height cue`);
ok(all.heightSame, `the footprint's HEIGHT changed too (${all.widthGrew} wider but height moved as well) — the growth has to be the sideways lift, not the body layer being drawn bigger`);
ok(all.depthOrdered, `the four layers are not ordered by depth: ${JSON.stringify(all.layers)} — turf behind markings behind bodies behind UI, or it is four things sliding about rather than a parallax`);
ok(all.fourDistinct, `two layers share an offset: ${JSON.stringify(all.layers)} — a layer that moves with its neighbour is not a layer`);
ok(all.turfGapSubtle, `the turf sits ${all.turfGap}px off the markings — the touchline is a marking and the grass is the turf beneath it, so a real gap stops reading as a bevel and reads as a misaligned pitch`);
ok(all.allFlatWhenOff, 'some layer still had an offset with the setting off');
ok(all.hudMoved, `the HUD did not move (${JSON.stringify(all.hudFlat)} → ${JSON.stringify(all.hudOver)})`);
ok(all.btnMoved, 'the HUD moved but a BUTTON inside it did not, so what you press is not where it is drawn');
ok(all.btnMatchesLayer, `a HUD button shifted ${all.btnShift}px against a UI layer of ${all.uiOff && all.uiOff[0]}px — the transform is what carries the hit area, so the two cannot disagree`);
ok(all.hudCleared, 'the HUD transform was left stuck on after the effect was switched off');
ok(all.markerFound, `the resting thumbstick marker was not found in its corner (${all.markerInk} lit pixels), so the check below proves nothing`);
ok(all.markerRidesUI, `the resting marker moved ${all.markerMoved}px against a UI layer of ${all.uiPx}px`);
ok(all.liveFound, `no live thumbstick ring was found (${all.liveInk} lit pixels), so the check below proves nothing`);
ok(all.liveStaysUnderThumb, `a LIVE thumbstick floated ${all.liveMoved}px away from the thumb holding it — a control being touched is attached to your finger; only one at rest is decoration`);
ok(all.onPhone, 'the effect does nothing on a phone with the setting on, so the off-switches below prove nothing');
ok(all.settingOff, 'turning the setting off left the effect running');
ok(all.reduced === true, 'Reduce Motion was not detected under emulation, so the check below proves nothing');
ok(JSON.stringify(all.lift) === '[0,0]', `Reduce Motion did not switch the effect off (${JSON.stringify(all.lift)}) — a picture that swims when your hand moves is exactly what that setting asks not to happen`);
ok(all.deskTouch === false, 'the desktop viewport still reports the phone layout, so the check below proves nothing');
ok(JSON.stringify(all.deskLift) === '[0,0]', `the effect engaged on a desktop-width window (${JSON.stringify(all.deskLift)}), which has no tilt sensor and no reason to move`);
ok(all.tiles === 2, `the Tilt parallax control has ${all.tiles} tiles`);
ok(all.inGameFeel, 'the Tilt parallax control is not in the Game Feel card');
ok(all.sitsWithTheOtherToggle, `it is field ${all.tiltAt} of ${all.fieldCount} with Screen shake at ${all.shakeAt} — the two visual on/offs belong together, and this shipped 16th of 19 below two sliders and got reported as a MISSING feature`);
ok(all.aboveTheSliders, `it sits below a slider (first slider at ${all.firstSliderAt}, this at ${all.tiltAt}) — toggles above ranges, or a reader scanning a long card never finds it`);
ok(all.findableBySearch, `menu search does not reach it by the words somebody would type: ${JSON.stringify(all.searchTerms)}`);
ok(all.afterReload === 'off', `the choice did not survive a reload: ${all.afterReload}`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(all, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ntilt OK');
