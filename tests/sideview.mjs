// THE SIDE VIEW — a showcase camera for replays and the attract demo.
//
// The pitch turns so goal-to-goal runs left→right, the ground plane is squashed as though
// seen from beside the touchline, and every body stands up off it as a cylinder with the
// ball a real sphere above its own shadow.
//
// What this suite holds:
//   1. it is OFF by default, and off is FLAT — cam.sq exactly 1, and the turn decided by
//      pitchHorizontal() alone, as it was before any of this existed;
//   2. REPLAYS AND THE DEMO ONLY, and never a drill. There is deliberately no "always"
//      option, because `pitchHorizontal()` is what applySeatRotation reads to decide which
//      way a stick points and it is answered on a layout change rather than per frame — so
//      a camera that turned the pitch behind the input's back would hand a player a stick
//      90° wrong. ⚠️ That is measured HERE by driving applySeatRotation with the camera
//      live and requiring every seat's rotation unmoved, not asserted in a comment;
//   3. ⚠️ RECTANGLES SURVIVE, which is the whole reason this is an oblique squash rather
//      than a perspective. Every pitch painter in the file works from a rectangle —
//      drawPitch hands L,T,W,H to drawGrass, to vjPaintVideo and to all fourteen
//      DYN_FIELDS painters — so the projection has to map a rectangle to a rectangle or
//      all fourteen need rewriting. Measured on the pitch corners through screenPt;
//   4. bodies STAND UP: the column of body pixels through a player grows by about the
//      cylinder height, which is a measurement of the standing rather than a re-reading
//      of the constant that produced it;
//   5. ⚠️ the BALL STAYS ROUND while a player's top face does not. A sphere is a circle
//      from every angle, so the ball is the one thing that must not ride the squash — and
//      the contrast between the two is the assertion, because "the ball is round" is also
//      true of a build where nothing is squashed at all;
//   6. bodies paint FAR TO NEAR, including the ball — drawing every disc and then the ball
//      puts the ball in front of a player standing between it and the camera;
//   7. the ground shadow is VISIBLE. The wall is drawn from the top face down and round
//      the bottom of the base ellipse, so it covers the whole footprint: a shadow at the
//      body's own radius is painted over completely, which is how the first build shipped;
//   8. it is RENDER ONLY, proved by hashing the world rather than asserted — the bar
//      `tilt`, `goalcam`, `bigcourt` and `ball3d` are all held to;
//   9. a REPLAY keeps its own framing: computeCam is now reachable from the replay path
//      (it has to refit the camera for the squash), and the goal camera's 1.8× push is
//      frozen at full strength there because the step loop that eases it out is not
//      running — so applyGoalCam must stand down.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:720} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{ window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const all = await p.evaluate(()=>{
  const M = window.__magnet; const o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const setup = document.getElementById('setup'); if (setup) setup.style.display = 'none';

  // ---- 1. off by default, and off is flat --------------------------------
  o.defaultOff = M.sel.sideView === 'off';
  o.tiles = Object.keys(M.SIDEOPT).length;

  M.sel.mode = '2v2'; M.sel.kickoffRule = 'off'; M.sel.popups = 'off';
  M.sel.look = { ...M.sel.look, palette:'grass', field:'none', discs:'none', trail:'none' };
  M.applyTheme('grass');
  M.setMatchSeed(11); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  for (let i=0;i<90;i++) M.step(w);

  M.render();
  o.flatSq   = M.cam.sq;
  o.flatRot  = M.cam.rot;
  o.flatSide = M.sideNow;
  // The turn with the camera off is pitchHorizontal()'s answer and nothing else.
  o.flatRotMatchesPredicate = (M.cam.rot !== 0) === M.pitchHorizontal();

  // ---- 2. the gate: only a replay or the demo ----------------------------
  M.sel.sideView = 'show';
  M.render();
  o.notInAPlainMatch = M.sideNow === false;      // an ordinary live match is untouched
  w.demo = true;  M.render(); o.onInTheDemo = M.sideNow === true;
  w.demo = false; M.render(); o.offAgain    = M.sideNow === false;
  // A replay, through the real flag the replay transport sets.
  M.replay.active = true;  o.onInAReplay = M.sideViewWant() === true;
  M.replay.active = false;
  // ...and never a drill, whatever the flags say.
  w.demo = true; w.drillMode = true; o.offInADrill = M.sideViewWant() === false;
  w.drillMode = false;

  // ⚠️ THE INPUT MUST NOT MOVE. Recorded with the camera live, because that is the case
  // that would break it: pitchHorizontal() is answered on a layout change, so a camera
  // turning the pitch per frame would leave every stick pointing the wrong way.
  const seatRot = () => { M.applySeatRotation(w.players); return w.players.map(q=>q.rotQuarter|0); };
  w.demo = false; M.render();
  const rotFlat = seatRot(); const predFlat = M.pitchHorizontal();
  w.demo = true;  M.render();
  const rotSide = seatRot(); const predSide = M.pitchHorizontal();
  o.seatRotFlat = rotFlat; o.seatRotSide = rotSide;
  o.seatsUnmoved      = JSON.stringify(rotFlat) === JSON.stringify(rotSide);
  o.predicateUnmoved  = predFlat === predSide;
  o.cameraDidTurn     = M.cam.rot !== 0;         // ...while the CAMERA genuinely did turn

  // ---- 3. rectangles survive the projection ------------------------------
  // The pitch's four corners, through the real screenPt (turn + squash). A rectangle maps
  // to a rectangle exactly when the corners land on two distinct x's and two distinct y's.
  const bd = w.bounds;
  const corners = [[-bd.halfW,-bd.halfL],[bd.halfW,-bd.halfL],[bd.halfW,bd.halfL],[-bd.halfW,bd.halfL]]
    .map(([cx,cy]) => M.screenPt(M.wx(cx), M.wy(cy)));
  const rnd = v => Math.round(v*100)/100;
  o.cornerXs = [...new Set(corners.map(c=>rnd(c[0])))].length;
  o.cornerYs = [...new Set(corners.map(c=>rnd(c[1])))].length;
  o.stillARect = o.cornerXs === 2 && o.cornerYs === 2;
  // ...and it is genuinely FORESHORTENED: the drawn box's height/width ratio drops by
  // exactly the squash against the same corners with cam.sq pinned back to 1.
  const boxRatio = () => {
    const cs = [[-bd.halfW,-bd.halfL],[bd.halfW,-bd.halfL],[bd.halfW,bd.halfL],[-bd.halfW,bd.halfL]]
      .map(([cx,cy]) => M.screenPt(M.wx(cx), M.wy(cy)));
    const xs = cs.map(c=>c[0]), ys = cs.map(c=>c[1]);
    return (Math.max(...ys)-Math.min(...ys)) / (Math.max(...xs)-Math.min(...xs));
  };
  const sqLive = M.cam.sq, rSquashed = boxRatio();
  M.cam.sq = 1; const rFlatSameFit = boxRatio(); M.cam.sq = sqLive;
  o.squash = sqLive; o.wantSquash = M.SIDE.sq;
  o.ratioDrop = rSquashed / rFlatSameFit;
  o.foreshortened = Math.abs(o.ratioDrop - M.SIDE.sq) < 0.001;

  // ---- 8. render only ---------------------------------------------------
  // ⚠️ `demo` is TRUE in both runs. It is read from inside step (the crowd is silent in a
  // demo), so switching it is not a control — the only thing that varies is sel.sideView.
  const hash = (ww) => { let h = 2166136261;
    const s = JSON.stringify(ww.players.map(q=>[q.x,q.y,q.vx,q.vy,q.faceX,q.faceY,q.gait,q.inX,q.inY,q.trapAng]))
            + JSON.stringify([ww.ball.x,ww.ball.y,ww.ball.vx,ww.ball.vy,ww.ball.rot,ww.score,ww.rng()]);
    for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0; };
  const run = (mode) => {
    M.sel.sideView = mode;
    M.setMatchSeed(77); M.startMatch();
    const ww = M.world; ww.demo = true; ww.state = 'play'; ww.stateT = 2;
    for (let i=0;i<600;i++){ M.step(ww); if (i%3===0) M.render(); }
    return hash(ww);
  };
  o.hashSide = run('show');
  o.hashFlat = run('off');
  o.renderOnly = o.hashSide === o.hashFlat;

  // ---- 9. a replay keeps its own framing --------------------------------
  M.sel.sideView = 'show';
  M.setMatchSeed(5); M.startMatch();
  const w2 = M.world; w2.demo = true; w2.state = 'play'; w2.stateT = 2;
  for (let i=0;i<60;i++) M.step(w2);
  M.render(); const camNoZoom = M.cam.s;
  // The goal camera latched and eased all the way in, exactly as it is when a replay
  // starts — the step loop that would ease it back out does not run during playback.
  M.goalCamStart(w2, w2.players[0]); M.goalCam.t = 1;
  M.replay.active = false; M.computeCam(); const camZoomed = M.cam.s;
  M.replay.active = true;  M.computeCam(); const camInReplay = M.cam.s;
  M.replay.active = false; M.goalCamReset();
  o.zoomWorksAtAll   = camZoomed > camNoZoom * 1.2;
  o.replayOwnsFraming = Math.abs(camInReplay - camNoZoom) < 0.0001;

  return o;
});

// ============================================================
//  Pixels: standing bodies, a round ball, depth order, a shadow
// ============================================================
// ⚠️ EVERY measurement here is a DIFFERENCE against the same pitch with the body taken
// away, never a colour match or an absolute luminance. The first version of this block
// scanned outwards from a body until the pixels stopped matching the one it started on,
// and read the grass MOW STRIPES as the edge of a shadow — it reported the ground at the
// base of a cylinder as *brighter* than open pitch. Grass has bands, every field has
// markings, and a body can be standing on either. tests/README.md records the same trap
// under three other suites.
const px = await p.evaluate(()=>{
  const M = window.__magnet; const o = {};
  const cv = document.getElementById('game'), c = cv.getContext('2d', { willReadFrequently:true });

  M.sel.popups = 'off'; M.sel.juice = false; M.sel.mode = '2v2'; M.sel.kickoffRule = 'off';
  M.sel.look = { ...M.sel.look, palette:'grass', field:'none', discs:'none', trail:'none', ball:'classic' };
  M.applyTheme('grass');
  M.setMatchSeed(3); M.startMatch();
  const w = M.world; w.demo = true; w.state = 'play'; w.stateT = 2;

  const FAR = 90000;                       // parked off the canvas entirely
  const park = (i, x, y) => { const q = w.players[i]; q.x = x; q.y = y; q.vx = q.vy = 0;
                              q.trap = null; q.kick = false; q.chargeT = 0; };
  // ⚠️ Shake is zeroed and the trails and sparks cleared before EVERY snapshot. Shake
  // jitters the whole pitch by a Math.random() amount per render, and two suites here have
  // measured that as thousands of pixels of difference between two identical draws.
  const settle = () => {
    M.resetTrails(); M.resetFx(); M.resetWear();
    for (let i=0;i<90;i++) M.decayJuice();
    M.markPrev(w); M.renderAlpha = 1; M.render(); M.render();
  };
  const HALF = 90;
  const snap = (cx, cy) => c.getImageData(Math.round(cx)-HALF, Math.round(cy)-HALF, HALF*2, HALF*2);
  const W = HALF*2;
  const diffBox = (A, B) => {
    const m = new Uint8Array(W*W);
    let x0=1e9, y0=1e9, x1=-1, y1=-1, n=0;
    for (let i=0;i<A.data.length;i+=4){
      const d = Math.abs(A.data[i]-B.data[i]) + Math.abs(A.data[i+1]-B.data[i+1]) + Math.abs(A.data[i+2]-B.data[i+2]);
      if (d > 18){ const q = i/4, qx = q % W, qy = (q / W) | 0;
        m[q] = 1; n++; if (qx<x0) x0=qx; if (qx>x1) x1=qx; if (qy<y0) y0=qy; if (qy>y1) y1=qy; }
    }
    return n ? { m, n, w: x1-x0+1, h: y1-y0+1, top: y0 } : { m, n:0, w:0, h:0, top:0 };
  };
  // ⚠️ CONTIGUOUS through the body's own centre, not the bounding box. drawOneDisc draws a
  // NAME PLATE seven pixels above the disc, so a bounding box is a plate plus a gap plus a
  // disc — measured that way a perfectly round disc came back at an aspect of 1.70, and
  // every squash ratio taken against it was meaningless. The plate is separated by clear
  // pitch, so a run that has to stay joined to the centre stops at the disc's own edge.
  const runAt = (m, cx, cy) => {
    const at = (x, y) => (x>=0 && y>=0 && x<W && y<W) ? m[y*W+x] : 0;
    if (!at(cx, cy)) return { w:0, h:0 };
    let l=cx, r=cx, t=cy, bo=cy;
    while (at(l-1, cy)) l--;
    while (at(r+1, cy)) r++;
    while (at(cx, t-1)) t--;
    while (at(cx, bo+1)) bo++;
    return { w: r-l+1, h: bo-t+1 };
  };

  // The player and the ball go to spots far apart on SCREEN — the camera looks across the
  // pitch, so screen x comes from world y — and everybody else off the canvas, so one
  // region can be differenced without another body wandering into it.
  const PY = -150, BY = 150;
  const place = (on) => {
    park(0, on ? -60 : FAR, on ? PY : FAR);
    park(1, FAR, FAR); park(2, FAR, FAR); park(3, FAR, FAR);
    w.ball.x = on ? 60 : FAR; w.ball.y = on ? BY : FAR;
    w.ball.vx = w.ball.vy = 0; w.ball.rot = 0;
  };

  // A body and a ball, measured with the ground shadow and the cylinder switched off, so
  // the box IS the art and nothing else. Both are exported objects, so the suite can pin
  // them the way the renderer will read them.
  const measure = (mode, h, shadow) => {
    const keepH = M.SIDE.h, keepS = M.SIDE.shadow;
    M.SIDE.h = h; M.SIDE.shadow = shadow;
    M.sel.sideView = mode;
    place(false); settle();
    const pAt = M.screenPt(M.wx(-60), M.wy(PY)), bAt = M.screenPt(M.wx(60), M.wy(BY));
    const pBase = snap(pAt[0], pAt[1]), bBase = snap(bAt[0], bAt[1]);
    place(true); settle();
    const pr = w.players[0].r * M.cam.s * M.cam.body, br = w.ball.r * M.cam.s * M.cam.body;
    const body = diffBox(snap(pAt[0], pAt[1]), pBase);
    const ball = diffBox(snap(bAt[0], bAt[1]), bBase);
    // The region is centred on the GROUND point; the art is a lift above it.
    const out = { body, ball, s: M.cam.s, sq: M.cam.sq, pr, br,
                  bodyRun: runAt(body.m, HALF, HALF - Math.round(mode === 'off' ? 0 : M.sideLift(pr))),
                  ballRun: runAt(ball.m, HALF, HALF - Math.round(mode === 'off' ? 0 : M.sideLift(br))) };
    delete out.body.m; delete out.ball.m;
    M.SIDE.h = keepH; M.SIDE.shadow = keepS;
    return out;
  };

  // 1. flat view: a disc is a circle and a ball is a circle.
  o.flat = measure('off', 0, 0);
  // 2. side view with the cylinder flattened: the GROUND PLANE's squash, on the art itself.
  o.lying = measure('show', 0, 0);
  // 3. side view as it ships.
  o.stand = measure('show', M.SIDE.h, 0);

  o.flatDiscAspect  = o.flat.bodyRun.h  / o.flat.bodyRun.w;
  o.lyingDiscAspect = o.lying.bodyRun.h / o.lying.bodyRun.w;
  o.flatBallAspect  = o.flat.ballRun.h  / o.flat.ballRun.w;
  o.lyingBallAspect = o.lying.ballRun.h / o.lying.ballRun.w;

  // ⚠️ THE ART HAS TO BE WHERE screenPt SAYS IT IS, and this is asserted BEFORE anything
  // that measures it. The pixel probes are anchored on screenPt, while what actually gets
  // drawn goes through pitchXform — two separate expressions of one projection. Sabotaging
  // the squash out of pitchXform alone left screenPt still claiming the squash: the aspect
  // probes then landed on bare grass, came back 0 wide, and the suite failed on a NaN
  // ratio in the *ball* assertion, which points nowhere near the break. It is also a real
  // invariant in its own right — drawFloaters, drawSubPrompts and the name-plate overlap
  // test all place things by screenPt, so a drift between the two puts every label
  // somewhere its body is not.
  o.foundAtAnchor = o.flat.bodyRun.w > 2 && o.flat.ballRun.w > 2
                 && o.lying.bodyRun.w > 2 && o.lying.ballRun.w > 2;

  // ---- 5. the ball stays ROUND while a disc lying on the plane does not ----
  o.discRideRatio = o.lyingDiscAspect / o.flatDiscAspect;
  o.ballRideRatio = o.lyingBallAspect / o.flatBallAspect;
  o.planeIsSquashed = Math.abs(o.discRideRatio - M.SIDE.sq) < 0.16;
  o.ballStaysRound  = o.ballRideRatio > 0.86;

  // ---- 4. the body STANDS UP ---------------------------------------------
  o.liftPx    = M.sideLift(o.stand.pr);
  o.grew      = o.stand.body.h - o.lying.body.h;
  o.topRose   = o.lying.body.top - o.stand.body.top;
  o.standsUp  = o.grew > o.liftPx*0.7 && o.topRose > o.liftPx*0.7;
  // ...and the ball rises off its own spot too, or it is a sphere sunk in the turf.
  o.ballRose  = o.lying.ball.top - o.stand.ball.top;
  o.ballLiftPx = M.sideLift(o.stand.br);
  o.ballRises = o.ballRose > o.ballLiftPx*0.6;

  // ---- 7. the ground shadow is VISIBLE outside the wall -------------------
  // ⚠️ Measured as the pixels the shadow ALONE changes, with everything else identical.
  // The wall is drawn from the top face down and round the bottom of the base ellipse, so
  // it covers the whole footprint: a shadow at the body's own radius is painted over
  // completely and changes nothing at all, which is how the first build shipped.
  M.sel.sideView = 'show';
  const keepS = M.SIDE.shadow;
  M.SIDE.shadow = 0; place(true); settle();
  const noShadow = snap(M.screenPt(M.wx(-60), M.wy(PY))[0], M.screenPt(M.wx(-60), M.wy(PY))[1]);
  M.SIDE.shadow = keepS; place(true); settle();
  const withShadow = snap(M.screenPt(M.wx(-60), M.wy(PY))[0], M.screenPt(M.wx(-60), M.wy(PY))[1]);
  o.shadowPixels = diffBox(withShadow, noShadow).n;
  o.shadowReads  = o.shadowPixels > o.stand.pr * 4;

  // ---- 6. FAR TO NEAR, the BALL INCLUDED ---------------------------------
  // ⚠️ The ball is the case that matters and the reason this replaces drawDiscs AND
  // drawBall rather than sitting between them: every disc first and then the ball puts
  // the ball in front of a player who is standing between it and the camera.
  // TWO-SIDED, because "the ball is hidden" is also true of a build that never draws it.
  // Put a player on the centre spot, then the ball just BEHIND him (must be covered) and
  // just IN FRONT of him (must show) — each measured as whether the pixel at the ball's
  // own drawn centre changes at all against the same frame with the ball taken away.
  const at = (x, y) => { const d = c.getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0],d[1],d[2]]; };
  const moved = (a, bb) => Math.abs(a[0]-bb[0]) + Math.abs(a[1]-bb[1]) + Math.abs(a[2]-bb[2]) > 24;
  M.sel.sideView = 'show';
  const DEPTH = 10;                                  // world units along the depth axis
  const s0 = M.screenPt(M.wx(0), M.wy(0)), s1 = M.screenPt(M.wx(DEPTH), M.wy(0));
  // Which way depth runs is READ, never assumed: bigger screen y is nearer the camera, and
  // which world axis that is depends on the quarter-turn.
  const behindX = s1[1] < s0[1] ? DEPTH : -DEPTH, frontX = -behindX;
  o.depthAxisReadable = Math.abs(s1[1] - s0[1]) > 2;
  const ballSpot = (bxw) => {
    const g = M.screenPt(M.wx(bxw), M.wy(0));
    return [g[0], g[1] - M.sideLift(w.ball.r * M.cam.s * M.cam.body)];
  };
  park(0, 0, 0); park(1, FAR, FAR); park(2, FAR, FAR); park(3, FAR, FAR);
  w.ball.x = FAR; w.ball.y = FAR; settle();
  const behindAt = ballSpot(behindX), frontAt = ballSpot(frontX);
  const baseBehind = at(behindAt[0], behindAt[1]), baseFront = at(frontAt[0], frontAt[1]);
  w.ball.x = behindX; w.ball.y = 0; settle();
  o.ballBehindShows = moved(baseBehind, at(behindAt[0], behindAt[1]));
  w.ball.x = frontX;  w.ball.y = 0; settle();
  o.ballFrontShows  = moved(baseFront,  at(frontAt[0], frontAt[1]));
  o.depthOrdered = o.ballFrontShows && !o.ballBehindShows;

  M.sel.sideView = 'off';
  return o;
});

// ============================================================
//  The control is in the menu and survives a reload
// ============================================================
const ui = await p.evaluate(()=>{
  const M = window.__magnet; const o = {};
  M.openSection('feel');
  const host = document.getElementById('sideViewPick');
  o.exists = !!host;
  o.tiles = host ? host.querySelectorAll('.opt').length : 0;
  o.inGameFeel = !!(host && host.closest('.card') && host.closest('.card').dataset.sec === 'feel');
  M.sel.sideView = 'show'; M.saveSel();
  return o;
});
await p.reload();
await p.waitForTimeout(700);
const afterReload = await p.evaluate(()=> window.__magnet.sel.sideView);

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };

ok(all.defaultOff, `the side view is not off by default (${all.tiles} tiles, default ${all.defaultOff}) — it turns the pitch a quarter-turn and stands every body up, which is not something that should arrive`);
ok(all.flatSq === 1, `cam.sq was ${all.flatSq} with the camera off — off has to be exactly flat, or every ordinary match is being drawn through a projection nobody asked for`);
ok(all.flatSide === false, 'sideNow was already true before the setting was touched');
ok(all.flatRotMatchesPredicate, `with the camera off the turn (${all.flatRot}) disagrees with pitchHorizontal() — off must leave the camera exactly as it was`);

ok(all.notInAPlainMatch, 'the side view engaged in an ordinary live match — it is a showcase camera, and a body in front of the ball is good television and a bad time on the ball');
ok(all.onInTheDemo, 'the side view did not engage for the idle attract match, which is the one place a player can go and look at it');
ok(all.offAgain, 'sideNow stayed true after the demo flag was cleared — it is answered once per frame, so a stale true means half a frame squashed and half of it flat');
ok(all.onInAReplay, 'the side view did not engage for a replay, which is what it is for');
ok(all.offInADrill, 'the side view engaged for a DRILL — a drill is neither a replay nor a demo, and renderDrill draws none of this');

ok(all.cameraDidTurn, `the camera did not turn with the side view live (rot ${all.flatRot}) — a side view of a portrait pitch that was not turned is a view of one goal, so nothing below is testing a side view`);
ok(all.seatsUnmoved, `a seat's input rotation moved with the camera: ${JSON.stringify(all.seatRotFlat)} → ${JSON.stringify(all.seatRotSide)} — applySeatRotation reads pitchHorizontal(), which is answered on a LAYOUT change and not per frame, so a camera that turns the pitch behind its back hands a player a stick 90° wrong`);
ok(all.predicateUnmoved, 'pitchHorizontal() itself changed answer with the camera live — the camera has to set cam.rot directly, precisely so this predicate stays the input\'s business');

ok(all.stillARect, `the pitch corners landed on ${all.cornerXs} x's and ${all.cornerYs} y's — a rectangle must map to a rectangle, because drawPitch hands L,T,W,H to drawGrass, to vjPaintVideo and to all fourteen DYN_FIELDS painters. This is the whole reason the projection is an oblique squash and not a perspective`);
ok(all.foreshortened, `the drawn pitch box foreshortened by ${all.ratioDrop} against SIDE.sq of ${all.wantSquash} (cam.sq was ${all.squash}) — if the ratio has not dropped, the ground plane is not tilted and this is just the deck view`);

ok(all.renderOnly, `the world differs with the side view on (${all.hashSide}) and off (${all.hashFlat}) — this may move where things are DRAWN and nothing else`);

ok(all.zoomWorksAtAll, `the goal camera did not zoom at all (${all.zoomWorksAtAll}), so the replay-framing check below proves nothing`);
ok(all.replayOwnsFraming, 'a replay inherited the goal camera\'s push — computeCam is reachable from the replay path now (it has to refit for the squash) and goalCam.t is frozen at 1 there, because the step loop that eases it out is not running');

ok(px.flat.body.n > 40 && px.flat.ball.n > 20, `the difference probe found no body (${px.flat.body.n}px) or no ball (${px.flat.ball.n}px) in the flat view, so nothing below is measuring either`);
ok(px.stand.body.n > 40 && px.stand.ball.n > 20, `the difference probe found no body (${px.stand.body.n}px) or no ball (${px.stand.ball.n}px) in the side view`);
ok(px.foundAtAnchor, `no art was found at the point screenPt named (flat disc ${px.flat.bodyRun.w}px, flat ball ${px.flat.ballRun.w}px, squashed disc ${px.lying.bodyRun.w}px, squashed ball ${px.lying.ballRun.w}px) — pitchXform and screenPt are two expressions of one projection, and if they disagree then every label placed by screenPt is somewhere its body is not. Nothing measured below means anything either`);
ok(Math.abs(px.flatDiscAspect - 1) < 0.2, `a disc is not round in the flat view (aspect ${px.flatDiscAspect.toFixed(3)}) — the squash measurements below are ratios against this, so they prove nothing if the baseline is already skewed`);

ok(px.planeIsSquashed, `a disc lying on the ground plane came out at ${px.discRideRatio.toFixed(3)} of its flat aspect on a plane the camera set to ${px.lying.sq} — if the art on the plane is not foreshortened then the ground is not tilted, and "the ball is round" below is also true of a build with no side view at all`);
ok(px.ballStaysRound, `the ball came out at ${px.ballRideRatio.toFixed(3)} of its flat aspect on a plane squashed to ${px.lying.sq} — a sphere is a circle from EVERY angle, so the ball is the one thing that must not ride the squash. Squashed it reads as a discus, and it is the object everybody on the pitch is tracking`);

ok(px.liftPx > 4, `the cylinder height came out at ${px.liftPx.toFixed(1)}px, too small to measure — nothing below is testing a cylinder`);
ok(px.standsUp, `the body grew ${px.grew}px and its top rose ${px.topRose}px for a ${px.liftPx.toFixed(1)}px cylinder — a body that does not stand up off its own footprint is a squashed disc lying on the grass`);
ok(px.ballRises, `the ball rose ${px.ballRose}px for a ${px.ballLiftPx.toFixed(1)}px lift — a sphere resting in the turf has no shadow gap, and the gap is the only thing that says "off the ground"`);

ok(px.shadowReads, `switching the ground shadow off changed ${px.shadowPixels} pixels — the wall is drawn from the top face down and round the bottom of the base ellipse, so it covers the whole footprint. A shadow at the body's own radius is painted over completely and changes nothing at all, which is exactly how the first build shipped`);

ok(px.depthAxisReadable, 'the two depth probes landed on the same screen row, so neither check below proves anything');
ok(px.ballFrontShows, 'a ball standing IN FRONT of a player did not show at all, so "the ball behind him is hidden" below is also true of a build that never draws the ball');
ok(px.depthOrdered, `a ball BEHIND a player was still drawn over him (front shows ${px.ballFrontShows}, behind shows ${px.ballBehindShows}) — bodies have to paint far to near, and that includes the ball, which is the whole reason this replaces drawDiscs AND drawBall instead of sitting between them`);

ok(ui.exists, 'there is no Replay camera control in the menu, so the feature is unreachable');
ok(ui.tiles === 2, `the Replay camera control has ${ui.tiles} tiles`);
ok(ui.inGameFeel, 'the Replay camera control is not in the Game Feel card, where the other presentation toggles live');
ok(afterReload === 'show', `the choice did not survive a reload: ${afterReload}`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify({ all, px, ui, afterReload }, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nsideview OK');
