// THE BALL AS A ROLLING SPHERE — render only.
//
// The ball already had sphere SHADING: a ground shadow that subtracts the tilt lift and a
// radial highlight fixed up-left. What made it still read flat is that the pattern was
// rotated in 2D, which is a spinning disc, not a rolling ball. The pattern is now mapped
// onto a cylinder-projected sphere and scrolled by the roll, so the markings compress
// toward the limb and go over the horizon.
//
// What this suite holds:
//   1. it is OFF by default — this changes the most-watched object on the pitch, and
//      nobody playing today asked for that;
//   2. on, it genuinely changes the ball, the face changes as it rolls, and the roll
//      follows the DIRECTION OF TRAVEL (rolling right and rolling down differ);
//   3. ⚠️ it is PURE for a given (rot, heading): two draws of one frame must be identical,
//      or a paused ball shimmers at the refresh rate;
//   4. ⚠️ THE SIM IS UNTOUCHED, proved by hashing the world rather than asserted — the
//      same bar `bigcourt`, `goalcam` and `tilt` are held to. A draw must not write to the
//      world either, which is why the roll heading lives in a module variable;
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
  const paint = (on, rot, vx, vy, rad) => {
    M.sel.ball3d = on ? 'on' : 'off';
    cc.fillStyle = '#7f7f7f'; cc.fillRect(0, 0, S, S);
    M.paintBall(cc, CX, CY, rad == null ? R : rad, rot, 'classic', null, vx, vy);
    return cc.getImageData(0, 0, S, S).data;
  };
  const diff = (a, c2) => { let n = 0;
    for (let i = 0; i < a.length; i += 4)
      if (Math.abs(a[i]-c2[i]) + Math.abs(a[i+1]-c2[i+1]) + Math.abs(a[i+2]-c2[i+2]) > 24) n++;
    return n; };

  M.sel.look.ball = 'classic';
  // Warm the texture cache so the first timed/compared paint is like every other.
  paint(true, 0, 8, 0);

  // ---- a control: two identical paints must be identical --------------------
  o.controlDiff = diff(paint(true, 0.4, 8, 0), paint(true, 0.4, 8, 0));
  o.paintIsPure = o.controlDiff === 0;

  // ---- on vs off is a real difference --------------------------------------
  const flat = paint(false, 0.4, 8, 0);
  const sphere = paint(true, 0.4, 8, 0);
  o.onVsOff = diff(flat, sphere);
  o.changesTheBall = o.onVsOff > 300;

  // ---- the face changes as it rolls ---------------------------------------
  o.rollDiff = diff(paint(true, 0, 8, 0), paint(true, 0.8, 8, 0));
  o.rollsWithRot = o.rollDiff > 300;

  // ⚠️ ...and the roll follows the DIRECTION OF TRAVEL. Without this the pattern always
  // scrolls along screen-x, which reads as a ball rolling sideways while flying up the
  // pitch — the exact tell that gives away a fake.
  o.headingDiff = diff(paint(true, 0.6, 8, 0), paint(true, 0.6, 0, 8));
  o.followsHeading = o.headingDiff > 200;
  // A still ball keeps the last heading rather than snapping to zero, so two paints of a
  // stationary ball still agree.
  o.stillIsStable = diff(paint(true, 0.6, 0, 0), paint(true, 0.6, 0, 0)) === 0;

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
  {
    const f = paint(true, 0.30, 8, 0);
    const lum = i => f[i]*0.3 + f[i+1]*0.6 + f[i+2]*0.1;
    // Edges per pixel of width, over rows near the equator where the pattern is widest.
    const density = (fx0, fx1) => {
      const x0 = Math.round(CX + R*fx0), x1 = Math.round(CX + R*fx1);
      let edges = 0, span = 0;
      for (let yy = Math.round(CY - R*0.32); yy <= Math.round(CY + R*0.32); yy++){
        let prev = null;
        for (let xx = x0; xx <= x1; xx++){
          const v = lum((yy*S + xx)*4) > 128 ? 1 : 0;
          if (prev !== null && v !== prev) edges++;
          prev = v; span++;
        }
      }
      return span ? edges / span : 0;
    };
    o.midDensity  = +density(-0.16, 0.16).toFixed(4);
    o.limbDensity = +density(0.74, 0.94).toFixed(4);
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
  o.tinyDiff = diff(paint(false, 0.4, 8, 0, tiny), paint(true, 0.4, 8, 0, tiny));
  o.tinyIsFlat = o.tinyDiff === 0;
  o.minPx = M.BALL3D.minPx;

  // ---- the texture is baked once, and rebuilt when the ink changes ---------
  M.ballTexCache.clear();
  paint(true, 0.2, 8, 0); const after1 = M.ballTexCache.size;
  paint(true, 0.5, 8, 0); paint(true, 0.9, 8, 0);
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
  {
    const t0 = performance.now();
    for (let i = 0; i < 400; i++) paint(true, i*0.02, 8, 0, 11);
    o.smallMs = +((performance.now() - t0) / 400).toFixed(4);
    const t1b = performance.now();
    for (let i = 0; i < 400; i++) paint(true, i*0.02, 8, 0, 60);
    o.bigMs = +((performance.now() - t1b) / 400).toFixed(4);
    o.smallIsCheaper = o.smallMs < o.bigMs * 0.6;
    // The worst case anyone can reach: fourteen lobby balls in one frame.
    M.sel.ball3d = 'on';
    const t2b = performance.now();
    for (let f = 0; f < 150; f++) for (let k = 0; k < 14; k++)
      M.paintBall(cc, CX, CY, 11, f*0.02, 'classic', null, 8, 0);
    o.fourteenMs = +((performance.now() - t2b) / 150).toFixed(3);
    o.worstCaseFitsAFrame = o.fourteenMs < 8;
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
ok('the roll follows the direction of travel', r.followsHeading,
   `${r.headingDiff} px between rolling right and rolling down — without this the pattern always scrolls along screen-x, which is the tell that gives away a fake`);
ok('a stationary ball is stable', r.stillIsStable, 'it keeps the last heading rather than snapping to zero');
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
ok('THE SIM IS BIT-IDENTICAL with it on and off', r.simBitIdentical, r.simSample);
ok('...and a draw does not write to the ball', r.drawLeavesBallAlone,
   `drawing added ${JSON.stringify(r.addedByDraw)} to the ball — the roll heading must live outside the world, or a draw mutates the sim and determinism hashing breaks`);
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL ball3d\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS ball3d');
