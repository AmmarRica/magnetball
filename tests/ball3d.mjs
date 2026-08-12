// THE BALL AS A ROLLING SPHERE — render only.
//
// The ball already had sphere SHADING: a ground shadow that subtracts the tilt lift and a
// radial highlight fixed up-left. What made it still read flat is that the pattern was
// rotated in 2D, which is a spinning disc, not a rolling ball. The pattern is now mapped
// onto a sphere and scrolled by the roll, so the markings compress toward the limb and go
// over the horizon.
//
// What this suite holds:
//   1. it is OFF by default — this changes the most-watched object on the pitch, and
//      nobody playing today asked for that;
//   2. on, it genuinely changes the ball, the face changes as it rolls, the roll follows
//      the AXIS it was rolled about, and it rolls FORWARDS — a mark on the face travels the
//      way the ball is going, because on a rolling ball the contact point is what stands
//      still. It shipped backwards;
//   2b. ⚠️ the vertical mapping is sin(LATITUDE), which is what an orthographic sphere
//      does. It shipped as latitude itself, so every pattern was piled up at the top and
//      bottom of the circle and pulled apart across the middle — the "terrible texture"
//      this suite had no assertion for at all. Measured by printing ONE mark at a known
//      latitude and finding where on the ball it lands;
//   3. ⚠️ it is PURE for a given (rot, heading): two draws of one frame must be identical,
//      or a paused ball shimmers at the refresh rate;
//   4. ⚠️ THE SIM IS UNTOUCHED, proved by hashing the world rather than asserted — the
//      same bar `bigcourt`, `goalcam` and `tilt` are held to. A draw must not write to the
//      ball either: the roll and its axis are advanced by `advanceBallSpin` in the STEP
//      loop and only read by the painter;
//   4b. the roll is SIGNED about a CANONICAL axis, so a ball rebounding straight off a wall
//      unrolls the way it came instead of the axis flipping and jumping half a turn of
//      texture across the face in one frame;
//   4c. ⚠️ and the FLAT pattern reverses too. `sel.ball3d` is off by default, so the flat
//      look is what nearly everybody sees, and its `rot` was driven by SPEED — a magnitude —
//      so the pattern turned the same way whichever direction the ball was going. A wheel
//      rolling right reads clockwise, and it stayed clockwise when the ball came back left,
//      which is the whole of "the ball rotates the opposite way to where it is rolling".
//      Held from both ends here: the sign of `rot` per direction, AND that a positive `rot`
//      really is clockwise on screen — half the claim each, and neither is the complaint;
//   4d. ⚠️ and the spin advances IN A DRILL. It used to live inline in `step()`, which a
//      drill never runs, so a drill's ball had a frozen pattern however hard it was hit;
//   5. the texture is BAKED once per (look, ink) and rebuilt when the ink changes, because
//      slots mix and the pattern is drawn in the ball's spot colour;
//   6. it falls back to flat below `BALL3D.minPx`, where a mapped texture is just noise.
//
// ⚠️ MEASUREMENT NOTE: the visual checks call `paintBall` onto their OWN canvas rather
// than going through `render()`. That sidesteps the two contaminants that have bitten
// this repo repeatedly — leftover screen shake jitters the whole pitch by `Math.random()`
// every frame, and the first `render()` after `startMatch` builds caches worth thousands
// of changed pixels. A control pair of identical paints is asserted at 0 either way.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear();
  localStorage.setItem('magnetball.firstrun','1'); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(() => {
  const M = window.__magnet; const o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();

  o.defaultIsOff = M.defaultSel().ball3d === 'off';
  o.optionExists = !!document.getElementById('ball3dPick');
  o.optionTiles = document.querySelectorAll('#ball3dPick .opt').length;

  const S = 220, CX = 110, CY = 110, R = 60;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const cc = cv.getContext('2d');
  // (on, roll, axis, radius, look) — `roll` is the signed distance rolled and `axis` the
  // direction it rolled in, both of which the ball now carries (see advanceBallSpin).
  const paint = (on, roll, ax, rad, look) => {
    M.sel.ball3d = on ? 'on' : 'off';
    cc.fillStyle = '#7f7f7f'; cc.fillRect(0, 0, S, S);
    M.paintBall(cc, CX, CY, rad == null ? R : rad, 0, look || 'classic', null, roll, ax || 0);
    return cc.getImageData(0, 0, S, S).data;
  };
  const diff = (a, c2) => { let n = 0;
    for (let i = 0; i < a.length; i += 4)
      if (Math.abs(a[i]-c2[i]) + Math.abs(a[i+1]-c2[i+1]) + Math.abs(a[i+2]-c2[i+2]) > 24) n++;
    return n; };

  M.sel.look.ball = 'classic';
  // Warm the texture cache so the first timed/compared paint is like every other.
  paint(true, 0, 0);

  // ---- a control: two identical paints must be identical --------------------
  o.controlDiff = diff(paint(true, 0.4, 0), paint(true, 0.4, 0));
  o.paintIsPure = o.controlDiff === 0;

  // ---- on vs off is a real difference --------------------------------------
  const flat = paint(false, 0.4, 0);
  const sphere = paint(true, 0.4, 0);
  o.onVsOff = diff(flat, sphere);
  o.changesTheBall = o.onVsOff > 300;

  // ---- the face changes as it rolls ---------------------------------------
  o.rollDiff = diff(paint(true, 0, 0), paint(true, 0.8, 0));
  o.rollsWithRot = o.rollDiff > 300;

  // ⚠️ ...and the roll follows the AXIS it rolled about. Without this the pattern always
  // scrolls along screen-x, which reads as a ball rolling sideways while flying up the
  // pitch — the exact tell that gives away a fake.
  o.axisDiff = diff(paint(true, 0.6, 0), paint(true, 0.6, Math.PI/2));
  o.followsAxis = o.axisDiff > 200;

  // ---- ⚠️ WHICH WAY IT ROLLS, and where a mark LANDS ----------------------
  // Both of these are measured with ONE print at a known place, by overriding the spot
  // table — a mark whose position is known is the only way to say anything about the
  // projection, and with sixteen prints scattered over the sphere you cannot tell which
  // blob is which.
  const keepPrints = M.BALL3D.prints;
  // The mark's box in a rendered frame: pixels clearly darker than the pale ball, inside the
  // disc. Shared, because the same measurement is taken on the sphere and on the flat painter
  // and comparing two differently-derived boxes would compare the two measurements instead.
  const boxOf = (f) => {
    let x0=1e9, y0=1e9, x1=-1, y1=-1, n=0;
    for (let yy = 1; yy < S-1; yy++) for (let xx = 1; xx < S-1; xx++){
      const dx = xx-CX, dy = yy-CY; if (dx*dx + dy*dy > (R-2)*(R-2)) continue;
      const i = (yy*S + xx)*4;
      if (f[i]*0.3 + f[i+1]*0.6 + f[i+2]*0.1 < 110){
        n++; if (xx<x0) x0=xx; if (xx>x1) x1=xx; if (yy<y0) y0=yy; if (yy>y1) y1=yy; }
    }
    return n ? { n, cx:(x0+x1)/2, cy:(y0+y1)/2, w:x1-x0+1, h:y1-y0+1 } : { n:0, w:0, h:0 };
  };
  const onePrint = (roll) => {
    M.BALL3D.prints = [[0, 0, false]];              // one print, unmirrored, at home
    M.ballTexCache.clear();
    return boxOf(paint(true, roll, 0, R, 'period'));   // a single centred dot
  };

  // ⚠️ IT ROLLS FORWARDS. A mark on the face of a rolling ball travels the way the ball is
  // going — the contact point is what stands still — and this shipped scrolling the other
  // way, which is what "rolling in the wrong direction" was. Measured as the sign of the
  // mark's movement, not as a pixel count, because a backwards scroll changes exactly as
  // many pixels as a forwards one and every other check here passed with it wrong.
  {
    const a = onePrint(0), c2 = onePrint(0.30);
    o.markFound = a.n > 20 && c2.n > 20;
    o.markMoved = o.markFound ? +(c2.cx - a.cx).toFixed(1) : 0;
    o.rollsForwards = o.markFound && o.markMoved > 3;
  }

  // ⚠️ A DESIGN FACING YOU LOOKS LIKE ITSELF, which is the asin pre-warp doing its job.
  // The strip is indexed by longitude and the painter puts longitude at screen x = r·sin(lon),
  // so a design laid into the strip linearly comes out stretched by π/2 across the middle of
  // the ball — a round dot rendered as a 1.46:1 oval, and every look visibly not the look you
  // picked. Measured against the FLAT painter, which is the thing it has to agree with.
  {
    const sphere = onePrint(0);
    M.BALL3D.prints = keepPrints; M.ballTexCache.clear();
    const flatDot = boxOf(paint(false, 0, 0, R, 'period'));
    o.restW = sphere.w; o.restH = sphere.h; o.flatW = flatDot.w; o.flatH = flatDot.h;
    o.restFound = sphere.n > 20 && flatDot.n > 20;
    o.restAspect  = o.restFound ? +(sphere.h / sphere.w).toFixed(3) : 0;
    o.restVsFlatW = o.restFound ? +(sphere.w / flatDot.w).toFixed(3) : 0;
    // Round, and the same size the flat painter draws it.
    o.printIsRound = o.restFound && o.restAspect > 0.85 && o.restAspect < 1.18
                  && o.restVsFlatW > 0.85 && o.restVsFlatW < 1.18;
  }

  // ⚠️ TWO PRINTS, AND THEY ARE DIFFERENT — the pattern's period is a FULL turn, not half of
  // one. That is the whole reason the roll direction reads at all: it shipped as sixteen
  // identical prints on a regular 90° grid, and a filmstrip of the ball rolling right was
  // near indistinguishable from one of it rolling left, because the eye locks onto whichever
  // copy is nearest between frames. Half a turn must look DIFFERENT and a full turn must look
  // the same, which is exactly "period 2π".
  {
    const f0 = paint(true, 0, 0, R, 'eight');
    const fh = paint(true, Math.PI, 0, R, 'eight');
    const ff = paint(true, 2*Math.PI, 0, R, 'eight');
    o.halfTurnDiff = diff(f0, fh);
    o.fullTurnDiff = diff(f0, ff);
    o.periodIsAFullTurn = o.halfTurnDiff > 400 && o.fullTurnDiff < 40;
  }
  M.BALL3D.prints = keepPrints; M.ballTexCache.clear();
  paint(true, 0, 0);                                  // re-warm for what follows

  // ---- ⚠️ THE LIMB ACTUALLY COMPRESSES ------------------------------------
  // This is the whole point of the mapping, and nothing above measures it: a plain
  // horizontal scroll of the texture also changes the ball, also changes with rot, and
  // also follows the heading. Verified by sabotage — replacing the sphere's `r*sin(lon)`
  // edges with an even linear spread passed every other check in this file.
  //
  // ⚠️ AND THE OBVIOUS MEASUREMENT DOES NOT WORK. "How many pixels change for a small
  // step of roll, middle of the face versus limb" reads 209 against 199 — nearly equal —
  // on a correct build, because the two effects cancel exactly: near the limb the surface
  // barely MOVES, but the texture there is squashed, so the little it moves crosses many
  // more edges. That version failed the real build and the sabotage alike.
  //
  // What compression actually is, is TEXTURE DENSITY: the same markings occupy less width
  // near the limb, so a scan line crosses more light/dark boundaries per pixel there. That
  // is measured in a single frame and cannot be confounded by motion.
  // ⚠️ AVERAGED OVER TWELVE ROLL PHASES, and that is not belt-and-braces. The pattern is
  // PRINTED at sixteen fixed places on the sphere rather than smeared continuously round
  // it, so whether a given longitude band has any ink in it at all is down to where the
  // roll happens to have stopped — measured on one frame the limb band came back with a
  // density of 0.0138 against 0.0623 in the middle, which reads as the exact opposite of
  // compression and is really just an empty strip of ball.
  {
    const lumOf = (f, i) => f[i]*0.3 + f[i+1]*0.6 + f[i+2]*0.1;
    const density = (f, fx0, fx1) => {
      const x0 = Math.round(CX + R*fx0), x1 = Math.round(CX + R*fx1);
      let edges = 0, span = 0;
      for (let yy = Math.round(CY - R*0.32); yy <= Math.round(CY + R*0.32); yy++){
        let prev = null;
        for (let xx = x0; xx <= x1; xx++){
          const v = lumOf(f, (yy*S + xx)*4) > 128 ? 1 : 0;
          if (prev !== null && v !== prev) edges++;
          prev = v; span++;
        }
      }
      return span ? edges / span : 0;
    };
    let mid = 0, limb = 0;
    for (let k = 0; k < 12; k++){
      const f = paint(true, k * 0.13, 0);
      mid  += density(f, -0.16, 0.16);
      // Both limbs, so a print sitting on one of them cannot decide the answer.
      limb += (density(f, 0.74, 0.94) + density(f, -0.94, -0.74)) / 2;
    }
    o.midDensity  = +(mid/12).toFixed(4);
    o.limbDensity = +(limb/12).toFixed(4);
    o.limbIsCompressed = o.limbDensity > o.midDensity * 1.35;
  }

  // ---- ⚠️ IT ENGAGES AT THE SIZE A PHONE ACTUALLY DRAWS THE BALL -----------
  // The assertion this file was missing, and it mattered: `minPx` was 7 while the ball on
  // a 390x844 viewport on Classic is drawn at 6.56px, so the feature did nothing at all
  // for exactly the people most likely to switch it on. A threshold has to be checked
  // against the real drawn radius, not chosen by eye.
  {
    M.sel.ball3d = 'on'; M.sel.mode = '2v2'; M.sel.lobby = 'off';
    M.setMatchSeed(11); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    M.computeCam();
    o.phoneBallPx = +(w.ball.r * M.cam.s * M.cam.body).toFixed(2);
    o.engagesOnAPhone = M.ballIs3D(o.phoneBallPx);
  }

  // ---- below minPx it falls back to flat -----------------------------------
  const tiny = Math.max(2, M.BALL3D.minPx - 2);
  o.tinyDiff = diff(paint(false, 0.4, 0, tiny), paint(true, 0.4, 0, tiny));
  o.tinyIsFlat = o.tinyDiff === 0;
  o.minPx = M.BALL3D.minPx;

  // ---- the texture is baked once, and rebuilt when the ink changes ---------
  M.ballTexCache.clear();
  paint(true, 0.2, 0); const after1 = M.ballTexCache.size;
  paint(true, 0.5, 0); paint(true, 0.9, 0);
  o.texAfterManyPaints = M.ballTexCache.size;
  o.texBakedOnce = after1 === 1 && o.texAfterManyPaints === 1;
  // ⚠️ Keyed on the INK too: the same look asked for over another palette must not reuse
  // a texture baked in the old spot colour.
  const t1 = M.ballSphereTex('classic', '#111111');
  const t2 = M.ballSphereTex('classic', '#eeeeee');
  o.texPerInk = t1 !== t2;
  // ...and a different look gets its own.
  o.texPerLook = M.ballSphereTex('token', '#111111') !== M.ballSphereTex('classic', '#111111');

  // ---- slices scale with size ---------------------------------------------
  // A fixed count costs the same at 9px as at 70px, and the warm-up lobby fields
  // fourteen balls at once. Measured as cost, not as an internal number.
  // ⚠️ BEST OF THREE, not a single pass. A single timing of this loop swung between 0.28ms
  // and 1.48ms for the same build on the same machine — enough to fail the comparison on its
  // own — because these suites run back to back and the browser is contending for the CPU.
  // The minimum is the least contaminated estimate of a CPU-bound loop's cost.
  {
    const timeAt = (rad) => {
      let best = Infinity;
      for (let t = 0; t < 3; t++){
        const t0 = performance.now();
        for (let i = 0; i < 400; i++) paint(true, i*0.02, 0, rad);
        best = Math.min(best, (performance.now() - t0) / 400);
      }
      return +best.toFixed(4);
    };
    o.smallMs = timeAt(11);
    o.bigMs = timeAt(60);
    o.smallIsCheaper = o.smallMs < o.bigMs * 0.6;
    // The worst case anyone can reach: fourteen lobby balls in one frame.
    M.sel.ball3d = 'on';
    const t2b = performance.now();
    for (let f = 0; f < 150; f++) for (let k = 0; k < 14; k++)
      M.paintBall(cc, CX, CY, 11, 0, 'classic', null, f*0.02, 0);
    o.fourteenMs = +((performance.now() - t2b) / 150).toFixed(3);
    o.worstCaseFitsAFrame = o.fourteenMs < 8;
  }

  // ---- ⚠️ THE ROLL IS SIGNED, ABOUT A LATCHED AXIS ------------------------
  // A ball that rebounds straight off a wall rolls back the way it came. The painter used
  // to take its axis from the live velocity instead, so the instant a bounce flipped the
  // heading by 180° the axis flipped with it and half a turn of texture jumped across the
  // face in a single frame. Driven through the real `advanceBallSpin`, not by poking fields.
  {
    const fake = { ball: { x:0, y:0, vx:6, vy:0, rot:0, spin:0 } };
    for (let i=0;i<10;i++) M.advanceBallSpin(fake);
    const outAx = fake.ball.rollAx, outRoll = fake.ball.roll;
    fake.ball.vx = -6;                              // straight back off a wall
    for (let i=0;i<10;i++) M.advanceBallSpin(fake);
    o.axKept   = Math.abs(fake.ball.rollAx - outAx) < 1e-9;
    o.rollBack = fake.ball.roll < outRoll - 1e-9;
    o.rollUnwinds = o.axKept && o.rollBack;
    // ...but a genuine change of DIRECTION does re-latch, or a ball turning a corner would
    // roll backwards for the rest of the match.
    fake.ball.vx = 0; fake.ball.vy = 6;
    for (let i=0;i<10;i++) M.advanceBallSpin(fake);
    o.axRelatched = Math.abs(fake.ball.rollAx - outAx) > 1;
  }

  // ---- ⚠️ THE RATE IS THE PHYSICAL ONE, ω = v/R ---------------------------
  // Rolling without slipping. It was a magic 0.055 against a radius of 10, so the ball turned
  // at half the rate the ground it covered called for and read as sliding rather than rolling
  // — and no assertion here noticed, which a sabotage of the constant proved.
  // Taken off the ball's OWN radius, so a bigger ball turns less for the same travel.
  {
    const rollFor = (v, rr) => {
      const f = { ball:{ x:0, y:0, vx:v, vy:0, rot:0, spin:0, r:rr } };
      M.advanceBallSpin(f);
      return f.ball.roll;
    };
    o.rollPerStep10 = +rollFor(10, 10).toFixed(4);
    o.rollPerStep20 = +rollFor(10, 20).toFixed(4);
    o.rateIsPhysical = Math.abs(o.rollPerStep10 - 1) < 1e-3          // v/R = 10/10
                    && Math.abs(o.rollPerStep20 - 0.5) < 1e-3;       // v/R = 10/20
  }

  // ---- ⚠️ AND THE FLAT PATTERN REVERSES, WHICH IS THE ONE MOST PEOPLE SEE --
  // `sel.ball3d` is off by default, so `rot` and the flat look are what nearly everybody is
  // looking at — and `rot` was advanced by SPEED, a magnitude, so the pattern turned the
  // same way in every direction. Every direction is driven through the real function.
  {
    const spin = (vx, vy) => {
      const f = { ball:{ x:0, y:0, vx, vy, rot:0, spin:0 } };
      for (let i=0;i<10;i++){ f.ball.vx = vx; f.ball.vy = vy; M.advanceBallSpin(f); }
      return { rot:+f.ball.rot.toFixed(3), ax:+f.ball.rollAx.toFixed(3) };
    };
    const R4 = spin(6,0), L4 = spin(-6,0), D4 = spin(0,6), U4 = spin(0,-6), Q4 = spin(-4,-4);
    o.spinRight = R4.rot; o.spinLeft = L4.rot; o.spinDown = D4.rot; o.spinUp = U4.rot;
    o.rotReverses = R4.rot > 0.3 && L4.rot < -0.3 && D4.rot > 0.3 && U4.rot < -0.3;
    o.rotSymmetric = Math.abs(R4.rot + L4.rot) < 1e-6 && Math.abs(D4.rot + U4.rot) < 1e-6;
    // The axis is canonical — right half-plane — which is what makes the SIGN mean anything.
    // ⚠️ Compared with a 1e-3 slack, because these are rounded to three decimals for the
    // failure message and cos(1.571) is already -3.7e-6. An exact test here is a test of
    // the rounding.
    o.axes = [R4.ax, L4.ax, D4.ax, U4.ax, Q4.ax];
    o.axesCanonical = o.axes.every(a => Math.cos(a) >= -1e-3);
    o.oppositeSameAxis = Math.abs(R4.ax - L4.ax) < 1e-9 && Math.abs(D4.ax - U4.ax) < 1e-9;
  }

  // ⚠️ ...and a POSITIVE rot really is clockwise on screen. Without this half, "right gives
  // a positive rot" says nothing about which way the ball appears to turn — the two halves
  // together are the complaint. Measured with a one-off probe look carrying a single
  // off-centre dot, because every shipped look is either symmetric under rotation or too
  // busy to track. ⚠️ The probe has to apply `rot` ITSELF: each look does its own
  // c.rotate(rot), and a probe that ignored it measured no movement at all and would have
  // called a completely broken build correct.
  {
    M.BALL_LOOKS.__probe = { name:'probe', draw:(c, rr, rot) => {
      c.save(); c.rotate(rot);
      c.beginPath(); c.arc(rr*0.62, 0, rr*0.20, 0, 7); c.fill(); c.restore(); } };
    const dotAngle = (rot) => {
      M.sel.ball3d = 'off';
      cc.fillStyle = '#7f7f7f'; cc.fillRect(0, 0, S, S);
      M.paintBall(cc, CX, CY, R, rot, '__probe');
      const d = cc.getImageData(0, 0, S, S).data;
      let sx = 0, sy = 0, n = 0;
      for (let yy=0; yy<S; yy++) for (let xx=0; xx<S; xx++){
        const dx = xx-CX, dy = yy-CY; if (dx*dx + dy*dy > (R-2)*(R-2)) continue;
        const i = (yy*S + xx)*4;
        if (d[i]*0.2126 + d[i+1]*0.7152 + d[i+2]*0.0722 < 110){ sx+=xx; sy+=yy; n++; }
      }
      return n > 10 ? Math.atan2(sy/n - CY, sx/n - CX) : null;
    };
    const a0 = dotAngle(0), a1 = dotAngle(0.5);
    delete M.BALL_LOOKS.__probe;
    o.dotFound = a0 != null && a1 != null;
    o.dotTurned = o.dotFound ? +(a1 - a0).toFixed(3) : 0;
    // Canvas y points DOWN, so a rising atan2 angle is clockwise on screen.
    o.positiveRotIsClockwise = o.dotFound && o.dotTurned > 0.3 && o.dotTurned < 0.7;
  }

  // ---- ⚠️ AND IT ADVANCES IN A DRILL --------------------------------------
  // This block lived inline in `step()`, which a drill never runs — so in every drill the
  // ball's pattern was frozen solid however hard you hit it. Driven through the real
  // `stepDrill`, because the whole defect was a call site that did not exist.
  {
    M.startDrill('targets');
    const w = M.world;
    w.ball.vx = 9; w.ball.vy = 3;
    const rot0 = w.ball.rot || 0, roll0 = w.ball.roll || 0;
    for (let i=0;i<20;i++){ w.ball.vx = 9; w.ball.vy = 3; M.stepDrill(w); }
    o.drillRot  = +(Math.abs((w.ball.rot||0) - rot0)).toFixed(3);
    o.drillRoll = +(Math.abs((w.ball.roll||0) - roll0)).toFixed(3);
    o.drillBallRolls = o.drillRot > 0.05 && o.drillRoll > 0.05;
  }

  // ---- ⚠️ THE ROLL AXIS IS A DIRECTION ON THE PITCH, NOT ON THE SCREEN ----
  // `rollAx` is stored in the pitch's frame, and `drawOneBall` paints inside `uprightAt`,
  // which has already cancelled the pitch's quarter-turn — so the call site has to add
  // cam.rot back. Without it, in deck view (and under the side camera) the ball rolled
  // ninety degrees across its own direction of travel. Same class of bug as the replay that
  // came back at ninety degrees to the match it was a replay of.
  // ⚠️ Driven through the REAL `drawBall` with the camera set BY HAND, not through render():
  // this suite runs at a 390x844 phone viewport, where a turned pitch fits at a scale that
  // draws the ball about six pixels across — far too small to find a mark's centroid in. The
  // camera is render state, so setting it is exactly what render() would have done.
  {
    const keepP = M.BALL3D.prints;
    M.BALL3D.prints = [[0, 0, false]]; M.ballTexCache.clear();
    M.sel.ball3d = 'on'; M.sel.look.ball = 'period';       // one dot, unambiguous
    M.sel.mode = '2v2'; M.sel.kickoffRule = 'off';
    M.setMatchSeed(4); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (const q of w.players){ q.x = 9000; q.y = 9000; q.vx = q.vy = 0; }
    w.ball.x = 0; w.ball.y = 0; w.ball.vx = 7; w.ball.vy = 0;   // travelling along world +x
    M.advanceBallSpin(w);
    o.deckAx = +(w.ball.rollAx || 0).toFixed(3);

    const gc = document.getElementById('game'), gx = gc.getContext('2d', { willReadFrequently:true });
    const BIG = 46;
    const shoot = (roll) => {
      // The quarter-turn the deck view uses, with a scale big enough to measure.
      M.cam.rot = -Math.PI/2; M.cam.sq = 1; M.cam.body = 1;
      M.cam.s = BIG / w.ball.r; M.cam.ox = gc.width/2; M.cam.oy = gc.height/2;
      gx.fillStyle = '#7f7f7f'; gx.fillRect(0, 0, gc.width, gc.height);
      w.ball.roll = roll; M.markPrev(w); M.renderAlpha = 1;
      // ⚠️ INSIDE pitchXform, exactly as render() calls it. `uprightAt` cancels the pitch's
      // quarter-turn, so calling drawBall with no transform to cancel leaves the frame
      // rotated by -cam.rot and the painter's +cam.rot then nets it back out — the mark came
      // back moving along screen x and this check called a correct build broken.
      gx.save(); M.pitchXform(0, 0); M.drawBall(w); gx.restore();
      const [bx, by] = M.screenPt(M.wx(0), M.wy(0));
      const half = BIG + 4;
      const d = gx.getImageData(Math.round(bx)-half, Math.round(by)-half, half*2, half*2).data;
      let sx = 0, sy = 0, n = 0;
      for (let yy=0; yy<half*2; yy++) for (let xx=0; xx<half*2; xx++){
        const dx = xx-half, dy = yy-half; if (dx*dx + dy*dy > (BIG*0.82)*(BIG*0.82)) continue;
        const i = (yy*half*2 + xx)*4;
        if (d[i]*0.2126 + d[i+1]*0.7152 + d[i+2]*0.0722 < 130){ sx+=dx; sy+=dy; n++; }
      }
      // Where the ball is GOING on screen, read through the same screenPt.
      const A = M.screenPt(M.wx(0), M.wy(0)), B = M.screenPt(M.wx(40), M.wy(0));
      return { n, x: n ? sx/n : 0, y: n ? sy/n : 0, tx: B[0]-A[0], ty: B[1]-A[1] };
    };
    const m0 = shoot(0), m1 = shoot(0.45);
    o.deckMarkPx = m0.n;
    o.deckMarkFound = m0.n > 20 && m1.n > 20;
    if (o.deckMarkFound){
      const mx = m1.x - m0.x, my = m1.y - m0.y, ml = Math.hypot(mx, my) || 1;
      const tl = Math.hypot(m0.tx, m0.ty) || 1;
      o.deckMarkShift = +ml.toFixed(2);
      o.deckAlign = +((mx*m0.tx + my*m0.ty) / (ml*tl)).toFixed(3);
      o.deckTravelIsVertical = Math.abs(m0.ty) > Math.abs(m0.tx) * 4;
    }
    o.rollFollowsScreenTravel = o.deckMarkFound && o.deckMarkShift > 2 && o.deckAlign > 0.7;
    M.BALL3D.prints = keepP; M.ballTexCache.clear();
    M.sel.look.ball = 'classic'; M.computeCam();
  }

  // ---- THE SIM IS UNTOUCHED ------------------------------------------------
  // ⚠️ Hashed, not asserted. Same seed, same steps, once with the sphere on and once off,
  // and the world has to come out bit-identical — the bar bigcourt/goalcam/tilt are held
  // to. Rendering is done inside the loop so a draw that wrote to the world would show.
  const runHash = (on) => {
    M.sel.ball3d = on ? 'on' : 'off';
    M.sel.mode = '2v2'; M.sel.lobby = 'off';
    M.setMatchSeed(11); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (let i = 0; i < 600; i++){ M.step(w); M.render(); }
    return JSON.stringify(w.players.map(q => [q.x, q.y, q.vx, q.vy])
      .concat([[w.ball.x, w.ball.y, w.ball.vx, w.ball.vy, w.ball.rot || 0]]));
  };
  const hOn = runHash(true), hOff = runHash(false);
  o.simBitIdentical = hOn === hOff;
  o.simSample = hOn.slice(0, 60);

  // ⚠️ ...and a DRAW must not write to the ball. The roll heading is deliberately a
  // module variable rather than a field on the ball, because a draw that mutated the world
  // would be reachable from the sim on the very next step — and `tests/determinism.mjs`
  // hashes the whole world, so an extra field breaks reproducibility even if nothing reads
  // it.
  // ⚠️ Compared as the ball's KEY SET with the sphere off and then on, not as a snapshot
  // taken across a run of renders. The rAF loop is live throughout this suite, so by the
  // time a snapshot is taken the loop has already drawn several frames and any field the
  // draw adds is ALREADY there; with no step in between its value then cannot change, and
  // the comparison passes. That version missed the sabotage completely.
  {
    M.sel.ball3d = 'off';
    M.setMatchSeed(11); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (let i = 0; i < 30; i++) M.step(w);
    for (let i = 0; i < 5; i++) M.render();
    const keysOff = Object.keys(w.ball).sort().join(',');
    M.sel.ball3d = 'on';
    for (let i = 0; i < 20; i++) M.render();
    const keysOn = Object.keys(w.ball).sort().join(',');
    o.ballKeys = keysOn.length;
    o.addedByDraw = keysOn.split(',').filter(k => !keysOff.split(',').includes(k));
    o.drawLeavesBallAlone = o.addedByDraw.length === 0;
  }

  M.sel.ball3d = 'off'; M.setMatchSeed(null);
  return o;
});

ok('it is OFF by default', r.defaultIsOff);
ok('the toggle exists with both options', r.optionExists && r.optionTiles === 2, String(r.optionTiles));
ok('two identical paints are identical', r.paintIsPure,
   `${r.controlDiff} px differ between two identical paints — every comparison below is measuring that too`);
ok('turning it on changes the ball', r.changesTheBall, `${r.onVsOff} px`);
ok('the face changes as the ball rolls', r.rollsWithRot, `${r.rollDiff} px between two roll phases`);
ok('the roll follows the axis it rolled about', r.followsAxis,
   `${r.axisDiff} px between rolling along x and along y — without this the pattern always scrolls along screen-x, which is the tell that gives away a fake`);
ok('a print was found at all', r.markFound,
   'the single-print probe found no mark, so the direction and latitude checks below prove nothing');
ok('IT ROLLS FORWARDS', r.rollsForwards,
   `a mark on the face moved ${r.markMoved}px for a positive roll — on a rolling ball the contact point is what stands still, so the face travels the way the ball is GOING. It shipped scrolling backwards, and a backwards scroll changes exactly as many pixels as a forwards one, so every other check here passed with it wrong`);
ok('a design facing you looks like ITSELF', r.printIsRound,
   `the sphere drew it ${r.restW}x${r.restH} against the flat painter's ${r.flatW}x${r.flatH} (aspect ${r.restAspect}, width ratio ${r.restVsFlatW}) — the strip is indexed by longitude and the painter puts longitude at r·sin(lon), so a design laid in linearly is stretched by π/2 across the middle of the ball. That rendered a round dot as a 1.46:1 oval and made every look visibly not the look you picked`);
ok('...and the shape probe found both', r.restFound, 'no ink in one of the two renders');
ok('the pattern\'s period is a FULL turn', r.periodIsAFullTurn,
   `half a turn differed by ${r.halfTurnDiff}px and a full turn by ${r.fullTurnDiff}px — it shipped as sixteen IDENTICAL prints on a regular 90° grid, which makes the roll direction genuinely ambiguous: a filmstrip of the ball rolling right was near indistinguishable from one of it rolling left, because the eye locks onto whichever copy is nearest between frames. Two prints, and the second turned and mirrored, is what pushes the point where that starts from π/2 radians a frame out to π`);
ok('the limb genuinely compresses', r.limbIsCompressed,
   `pattern edges per pixel: ${r.midDensity} in the middle of the face against ${r.limbDensity} at the limb — on a sphere the markings are squashed there; equal density means this is a flat scroll wearing a circular clip`);
ok('it engages at the size a phone actually draws the ball', r.engagesOnAPhone,
   `the ball draws at ${r.phoneBallPx}px and BALL3D.minPx is ${r.minPx} — the feature would do nothing for the people most likely to turn it on`);
ok(`below ${r.minPx}px it falls back to flat`, r.tinyIsFlat, `${r.tinyDiff} px differ at ${Math.max(2, r.minPx-2)}px`);
ok('the texture is baked once, not per paint', r.texBakedOnce,
   `cache held ${r.texAfterManyPaints} entries after three paints`);
ok('...one per ink', r.texPerInk, 'slots mix, so a texture baked in the old spot colour would be wrong');
ok('...and one per look', r.texPerLook);
ok('a small ball costs less than a big one', r.smallIsCheaper,
   `${r.smallMs}ms at 11px against ${r.bigMs}ms at 60px — a fixed slice count costs the same at both`);
ok('the worst case still fits a frame', r.worstCaseFitsAFrame,
   `fourteen lobby balls cost ${r.fourteenMs}ms of a 16.6ms frame`);
ok('the roll UNWINDS on a rebound', r.rollUnwinds,
   `axis kept: ${r.axKept}, roll went back: ${r.rollBack} — a ball bouncing straight off a wall rolls back the way it came, and taking the axis from the live velocity instead flips it 180° and jumps half a turn of texture across the face in one frame`);
ok('...but a real change of direction re-latches the axis', r.axRelatched,
   'a ball turning a corner would otherwise roll backwards for the rest of the match');
ok('the roll rate is the PHYSICAL one, v/R', r.rateIsPhysical,
   `travelling 10 units gave ${r.rollPerStep10} rad on a radius-10 ball and ${r.rollPerStep20} on a radius-20 one, against 1 and 0.5 for rolling without slipping — a magic constant here was half the physical rate, so the ball under-turned for the ground it covered and read as sliding`);
ok('the FLAT pattern reverses with direction', r.rotReverses,
   `rot after ten steps: right ${r.spinRight}, left ${r.spinLeft}, down ${r.spinDown}, up ${r.spinUp} — sel.ball3d is off by DEFAULT, so the flat look is what nearly everybody sees, and its rot was driven by SPEED, a magnitude. The pattern turned the same way whichever direction the ball went, which is the whole of "the ball rotates the opposite way to where it is rolling"`);
ok('...by exactly as much, both ways', r.rotSymmetric,
   `right ${r.spinRight} against left ${r.spinLeft} — a ball that goes out and comes back must arrive with its pattern where it started`);
ok('...about a CANONICAL axis', r.axesCanonical && r.oppositeSameAxis,
   `axes ${JSON.stringify(r.axes)} — the axis has to point into the same half-plane whichever way the ball is going, or the sign of the roll means nothing and opposite directions both come out positive`);
ok('a positive rot IS clockwise on screen', r.positiveRotIsClockwise,
   `a mark turned ${r.dotTurned} rad for a rot of +0.5 — without this half, "right gives a positive rot" says nothing about which way the ball appears to turn, and the two halves together are the complaint`);
ok('the probe dot was found at all', r.dotFound,
   'the rotation-direction probe found no mark, so the check above proves nothing');
ok('the turned-pitch probe is actually turned', r.deckTravelIsVertical,
   `the ball's on-screen travel came out mostly horizontal, so the quarter-turn is not in play and the check below proves nothing`);
ok('a mark was found on the turned pitch', r.deckMarkFound, `${r.deckMarkPx} dark pixels inside the ball`);
ok('the roll follows the ball\'s SCREEN travel, turned pitch included', r.rollFollowsScreenTravel,
   `a mark moved ${r.deckMarkShift}px at cos ${r.deckAlign} to the ball's own on-screen direction — rollAx is a direction on the PITCH and uprightAt has already cancelled the quarter-turn, so without adding cam.rot back the ball rolled ninety degrees across its own travel. Same class of bug as the replay that came back at ninety degrees to its match`);
ok('the ball ROLLS IN A DRILL', r.drillBallRolls,
   `rot moved ${r.drillRot} and roll moved ${r.drillRoll} over twenty drill steps — the spin used to be inline in step(), which a drill never runs, so a drill's ball had a frozen pattern however hard it was hit`);
ok('THE SIM IS BIT-IDENTICAL with it on and off', r.simBitIdentical, r.simSample);
ok('...and a draw does not write to the ball', r.drawLeavesBallAlone,
   `drawing added ${JSON.stringify(r.addedByDraw)} to the ball — the roll heading must live outside the world, or a draw mutates the sim and determinism hashing breaks`);
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL ball3d\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS ball3d');
