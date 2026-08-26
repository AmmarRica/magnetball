// THE CONTROLS, SIMPLIFIED — five things asked for together, because they are one idea:
// you should be able to walk up, pick up whatever is nearest, stand wherever you like, and
// play without configuring anything.
//
//   1. ⚠️ THE KEYBOARD AND THE FIRST CONTROLLER DRIVE THE SAME PLAYER. A pad taking seat one
//      set `ctrl = 'gamepad'`, which silently took the keyboard away — and `pollKeys` was
//      called from inside a DRAW behind "is there a `human1` on the pitch", so with a pad in
//      seat one the keyboard was not even read. Both now land on one body.
//   2. ⚠️ SELECT TURNS YOUR CONTROLS A QUARTER TURN, per pad, persisted. Four people round a
//      screen do not face the same way, and the only previous answer was cocktail's
//      calibration wizard.
//   3. ⚠️ ...AND THE BOTTOM-RIGHT ICON TURNS WITH IT. That row is the only readout there is,
//      so without it you would press SELECT and have to walk to the pitch to find out what
//      it did.
//   4. ⚠️ EVERY BUTTON KICKS, except Start, Select and the D-PAD. The D-pad exclusion is the
//      one that is easy to miss: it is a button as far as the API is concerned, so an
//      unqualified "any button" makes every step you take fire a shot.
//   5. ⚠️ THE LOBBY PROMPTS ARE OFF THE PITCH. They floated over each player's head, which in
//      deck/side view meant a line of text running down the middle of the field.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const withPads = async (n, opts = {}) => {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, ...opts });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
  await p.addInitScript((count) => {
    window.__MAGNETDEBUG = true;
    const mk = i => ({ index: i, id: 'Pad ' + i, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
    const pads = Array.from({ length: count }, (_, i) => mk(i));
    navigator.getGamepads = () => pads;
    window.__pads = pads;
  }, n);
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(900);
  return p;
};

// ================================== 1. keyboard + first pad, one player ==
const p = await withPads(2);
const share = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = M.firstHumanSeat(w);
  o.seatIsPad = me.ctrl === 'gamepad';
  // ⚠️ `pollKeys` is driven explicitly: it runs once per frame in `loop()`, and a
  // synchronous step loop never calls it. Without this the keyboard reads as dead on a
  // build where it works perfectly.
  const run = setup => {
    me.x = 0; me.y = 0; me.vx = 0; me.vy = 0;
    w.players.filter(q => q !== me).forEach(q => { q.x = 9e3; q.y = 9e3; });
    w.ball.x = 9e3; w.ball.y = 9e3;
    setup();
    for (let i = 0; i < 25; i++){ M.pollKeys(); M.step(w); }
    return +me.x.toFixed(1);
  };
  o.stickOnly = run(() => { window.__pads[0].axes[0] = 1; });
  window.__pads[0].axes[0] = 0;
  o.keysOnly = run(() => { M.keys['arrowright'] = true; });
  M.keys['arrowright'] = false;
  o.both = run(() => { window.__pads[0].axes[0] = 1; M.keys['arrowright'] = true; });
  window.__pads[0].axes[0] = 0; M.keys['arrowright'] = false;
  // KICK from either, ORed rather than one winning.
  o.kickPad = (() => { window.__pads[0].buttons[0].pressed = true;
    for (let i = 0; i < 4; i++){ M.pollKeys(); M.step(w); }
    const k = me.kick; window.__pads[0].buttons[0].pressed = false; return k; })();
  o.kickKeys = (() => { M.pads.p1.kick = true;
    for (let i = 0; i < 4; i++) M.step(w);
    const k = me.kick; M.pads.p1.kick = false; return k; })();
  // ⚠️ ...and the SECOND pad's seat is NOT shared with the keyboard, or pressing a key
  // would move two players.
  const others = w.players.filter(q => q.ctrl === 'gamepad' && q !== me);
  o.secondSeatExists = others.length > 0;
  if (others.length){
    const q2 = others[0];
    q2.x = 0; q2.y = 200; q2.vx = 0; q2.vy = 0;
    M.keys['arrowright'] = true;
    for (let i = 0; i < 25; i++){ M.pollKeys(); M.step(w); }
    M.keys['arrowright'] = false;
    o.secondSeatMoved = +Math.abs(q2.x).toFixed(1);
  }
  return o;
});

// ============================ 2 & 3. SELECT turns the seat, and the icon ==
const rot = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  M.sel.seatRot = {};
  M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = M.firstHumanSeat(w);
  const push = () => {
    me.x = 0; me.y = 0; me.vx = 0; me.vy = 0;
    w.players.filter(q => q !== me).forEach(q => { q.x = 9e3; q.y = 9e3; });
    w.ball.x = 9e3; w.ball.y = 9e3;
    window.__pads[0].axes[0] = 1; window.__pads[0].axes[1] = 0;
    for (let i = 0; i < 25; i++) M.step(w);
    window.__pads[0].axes[0] = 0;
    return Math.round(me.x) + ',' + Math.round(me.y);
  };
  // ⚠️ **THE TURN FIRES ON THE RELEASE NOW, THROUGH THE STEP LOOP.** In a live match SELECT
  // carries two meanings — a TAP turns your controls, a three-second HOLD takes the room to
  // warm-up — so firing on the PRESS edge turned your stick a quarter on the way into every
  // hold, and you arrived in warm-up pointing the wrong way. `pollWarmupHold` owns both,
  // inside `step()`, because three seconds counted in a per-frame poll is 1.25s at 144Hz.
  // ⚠️ So this drives `M.step` rather than calling the poll by hand — which is what the game
  // does, and is the stronger check either way. Reads `M.world`, not the captured `w`: the
  // last block below restarts the match under it.
  const tapSelect = () => {
    window.__pads[0].buttons[8].pressed = true;  M.step(M.world); M.step(M.world);
    window.__pads[0].buttons[8].pressed = false; M.step(M.world); M.step(M.world);
  };
  o.headings = []; o.quarters = [];
  for (let k = 0; k < 5; k++){ o.quarters.push(M.seatRotOf(0)); o.headings.push(push()); tapSelect(); }
  o.fourDistinct = new Set(o.headings.slice(0, 4)).size === 4;
  o.wrapsBack = o.headings[4] === o.headings[0];
  // ⚠️ PER PAD. Pad 1 was never touched and must not have moved.
  o.otherPadUntouched = M.seatRotOf(1) === 0;
  // ⚠️ HELD ACROSS A MATCH — it describes the room, not that kickoff.
  tapSelect();                                  // pad 0 back to a quarter turn
  const before = M.seatRotOf(0);
  M.startMatch();
  o.survivesRestart = M.seatRotOf(0) === before && before !== 0;
  o.savedInSel = (M.sel.seatRot || {})[0] === before;
  M.sel.seatRot = {};
  return o;
});

// The icon row turns with it — measured off the canvas, because that row is the only
// readout the feature has.
const icon = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  M.sel.seatRot = {};
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  // The bottom-right corner, where drawPadFlairs lives.
  const grab = () => { M.render();
    const d = g.getImageData(c.width - 90, c.height - 90, 90, 90).data;
    let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i+1] * 3 + d[i+2] * 7) | 0;
    return h; };
  const a = grab();
  M.bumpSeatRot(0);
  const b2 = grab();
  M.bumpSeatRot(0); M.bumpSeatRot(0); M.bumpSeatRot(0);      // all the way round
  const c4 = grab();
  o.changed = a !== b2;
  o.backAfterFour = a === c4;
  M.sel.seatRot = {};
  return o;
});

// ================================================== 4. every button kicks ==
const kick = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  M.sel.pad = Object.assign({}, M.sel.pad, { kick: null });   // no hand binding
  const g = () => navigator.getGamepads()[0];
  const press = i => { window.__pads[0].buttons[i].pressed = true;
                       const k = M.padKickHeld(g());
                       window.__pads[0].buttons[i].pressed = false; return k; };
  o.byIndex = Array.from({ length: 17 }, (_, i) => press(i));
  o.startNo  = o.byIndex[9] === false;
  o.selectNo = o.byIndex[8] === false;
  o.dpadNo   = [12, 13, 14, 15].every(i => o.byIndex[i] === false);
  o.restYes  = o.byIndex.every((v, i) => M.KICK_NEVER.has(i) ? v === false : v === true);
  // ⚠️ A HAND BINDING STILL WINS. "Any button" is the default for somebody who has not
  // chosen; somebody who has, has.
  M.sel.pad = Object.assign({}, M.sel.pad, { kick: 3 });
  o.boundOnly = press(3) === true && press(0) === false;
  M.sel.pad = Object.assign({}, M.sel.pad, { kick: null });
  return o;
});
// ============================================================================
// 6. HOLD SELECT FOR THREE SECONDS AND THE ROOM GOES TO WARM-UP, with a ring.
//
// SELECT already opened warm-up from a MENU — and only from a menu, and only for the FIRST
// pad. Mid-match it was a quarter turn and nothing else, so a room that wanted to change
// sides, sizes or shirts had to finish the match or reach for a mouse.
//
// ⚠️ MEASUREMENT TRAPS, all of them hit here or in `tests/lobbyhold.mjs` first:
//  1. **Diff the SAME frame drawn twice.** A frame grabbed before the hold started measures
//     the whole match moving and reports a ring around everybody.
//  2. **Pull the bodies apart, and set `_px`/`_py` with the position** — the ring is drawn
//     through `ix`/`iy`, so a teleport without them interpolates across the pitch.
//  3. **Drive `step`, never the poll.** The clock lives in the step loop precisely so three
//     seconds is three seconds at 144Hz; a probe calling the poll by hand measures a
//     function rather than the feature.
const hold = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.orient = 'v'; M.sel.seatRot = {};
  M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.length = '5';
  M.setMatchSeed(4); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  o.secs = M.LOBBY.holdWarm;
  const seats = w.players.filter(q => q.ctrl === 'gamepad').map(q => q.padIndex);
  o.padSeats = seats;
  const sel = (i, v) => { window.__pads[i].buttons[8].pressed = !!v; };
  const run = n => { for (let k = 0; k < n; k++) M.step(M.world); };

  // ⚠️ **PAD ONE, NOT PAD ZERO.** "All players can hold select" is the ask, and the idle
  // branch this grew out of is deliberately first-pad-only — so driving pad 0 would pass on
  // a build that kept that restriction.
  const rotWas = M.seatRotOf(1);
  sel(1, true); run(2);
  o.armed = M.selHoldFrac(1) > 0;
  run(88);                                   // ~1.5s in
  o.fracHalf = +M.selHoldFrac(1).toFixed(2);
  o.stillPlayingHalfway = M.world.state === 'play';
  run(120);                                  // past three seconds
  o.wentToWarmup = M.world.state === 'warmup';
  // ⚠️ ...and it must NOT have turned your controls on the way in. That was the whole
  // reason the quarter turn moved to the release: you arrived in warm-up pointing the
  // wrong way, which is the one thing this button exists to get right.
  o.holdDidNotTurn = M.seatRotOf(1) === rotWas;
  sel(1, false);

  // ⚠️ The TAP still turns, and still does NOT go to warm-up — taking a meaning away
  // without leaving the old one is not a fix.
  M.setMatchSeed(4); M.startMatch();
  const w2 = M.world; w2.state = 'play'; w2.stateT = 2;
  const was = M.seatRotOf(0);
  sel(0, true); run(6); sel(0, false); run(6);
  o.tapTurns = M.seatRotOf(0) !== was;
  o.tapStaysInMatch = M.world.state === 'play';

  // ⚠️ **THE TURN IS LIVE IN MORE PLACES THAN THE HOLD, AND CONFLATING THEM WAS A REAL
  // REGRESSION.** The first build gated both on `warmupHoldOn`, which stands down in
  // warm-up and in drills — so SELECT stopped turning your controls in the ONE room built
  // for standing somewhere, and in every drill. `tests/lobby.mjs` and `tests/deckstick.mjs`
  // both caught the warm-up half; nothing covered the drill, so it is covered here.
  // ⚠️ `lobby` was set to 'off' at the top of this block, so asking for the room without
  // putting it back lands in `kickoff` and the branch below never runs — which reads as a
  // silent pass, since an undefined result is falsy in one direction and absent in the other.
  M.sel.lobby = 'on';
  M.setMatchSeed(4); M.startMatch({ lobby: true });
  o.reachedWarmup = M.world.state === 'warmup';
  if (o.reachedWarmup){
    const wr = M.seatRotOf(0);
    sel(0, true); run(4); sel(0, false); run(4);
    o.warmupTapTurns = M.seatRotOf(0) !== wr;
    // ...and the HOLD stands down there: you are already in the room, and the ring would
    // sit on top of the five-second START ring saying something else.
    sel(0, true); run(220); sel(0, false); run(2);
    o.warmupHoldInert = M.world.state === 'warmup' && M.selHoldFrac(0) === 0;
  }
  M.startDrill(Object.keys(M.DRILLS)[0]);
  const dr = M.seatRotOf(0);
  sel(0, true); run(4); sel(0, false); run(4);
  o.drillTapTurns = M.seatRotOf(0) !== dr;
  o.drillStillADrill = !!M.world.drillMode;
  sel(0, true); run(220); sel(0, false); run(2);
  o.drillHoldInert = !!M.world.drillMode;
  M.sel.seatRot = {};
  return o;
});

// ---- the ring, in rendered pixels ------------------------------------------
const ring = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.orient = 'v'; M.sel.seatRot = {}; M.sel.look.palette = 'grass';
  M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.length = '5';
  M.setMatchSeed(4); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = w.players.find(q => q.ctrl === 'gamepad' && q.padIndex === 0);
  if (!me) return { noSeat: true };
  const cv = document.getElementById('game');
  const put = (q, x, y) => { q.x = x; q.y = y; q.vx = 0; q.vy = 0; q._px = x; q._py = y; };
  const apart = () => {
    put(me, 0, 0);
    w.players.filter(q => q !== me).forEach((q, i) => put(q, (i % 2 ? 1 : -1) * 9e3, 9e3));
    put(w.ball, 9e3, -9e3);
  };
  const shot = () => { apart(); M.render();
    const c = cv.getContext('2d');
    return c.getImageData(0, 0, cv.width, cv.height); };
  // ⚠️ THE CONTROL IS THE SAME FRAME WITH THE HOLD ZEROED, taken in the same run at the
  // same camera. A body already carries a guide ring, a rim and (at rest) nothing else,
  // so an absolute ink count out at 3.4 radii reads the pitch, not the arc.
  const annulus = (A, B, cx, cy, r0, r1) => {
    let hit = 0;
    for (let k = 0; k < 180; k++){
      const a = k / 180 * Math.PI * 2;
      for (let r = r0; r <= r1; r += 1){
        const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
        if (x < 0 || y < 0 || x >= A.width || y >= A.height) continue;
        const i = (y * A.width + x) * 4;
        if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i+1] - B.data[i+1]) +
            Math.abs(A.data[i+2] - B.data[i+2]) > 40){ hit++; break; }
      }
    }
    return hit;
  };
  const sel = (i, v) => { window.__pads[i].buttons[8].pressed = !!v; };
  const run = n => { for (let k = 0; k < n; k++) M.step(M.world); };

  sel(0, true); run(46);                    // ~25% of three seconds
  o.frac25 = +M.selHoldFrac(0).toFixed(2);
  const A = shot();
  // ⚠️ Two renders of ONE frame must be identical, or every number below is measuring the
  // renderer wobbling rather than the ring.
  const A2 = shot();
  o.renderStable = annulus(A, A2, 0, 0, 0, 0) === 0 &&
                   A.data.length === A2.data.length &&
                   (() => { for (let i = 0; i < A.data.length; i += 997)
                              if (A.data[i] !== A2.data[i]) return false; return true; })();
  const keep = M.selHoldFrac(0);
  const c0 = M.screenPt(M.wx(me.x), M.wy(me.y));
  const rB = me.r * M.cam.s;
  // the control: same frame, hold stood down
  sel(0, false); M.pollWarmupHold(M.world);
  const Z = shot();
  o.ring25 = annulus(A, Z, c0[0], c0[1], rB * 3.0, rB * 3.8);
  o.keep25 = +keep.toFixed(2);

  sel(0, true); run(2); run(130);           // ~72%
  o.frac70 = +M.selHoldFrac(0).toFixed(2);
  const C = shot();
  sel(0, false); M.pollWarmupHold(M.world);
  const Z2 = shot();
  o.ring70 = annulus(C, Z2, c0[0], c0[1], rB * 3.0, rB * 3.8);
  // ⚠️ And it must stay clear of the KICK RING, which is a promise about the physics.
  o.clearOfKickRing = annulus(C, Z2, c0[0], c0[1], rB * M.kickRingMul() * 0.96,
                                                   rB * M.kickRingMul() * 1.04);
  M.sel.seatRot = {};
  return o;
});

await p.close();

// ============================================ 5. lobby prompts off the pitch ==
const four = await withPads(4);
const lob = await four.evaluate(() => {
  const M = window.__magnet, o = {};
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  // ⚠️ MEASURED ON A PALETTE WHOSE PLATE IS NOT THE PITCH. On grass, `TH.nameBg` is within
  // a few points of the turf, so a colour probe counts the whole field and reports 106,082
  // "plate pixels" across the middle of the play — which reads as "the prompts are still on
  // the pitch" on a build where they are plainly below it. The claim being tested is about
  // POSITION and is palette-independent, so the palette is chosen to make the probe work.
  M.applyBundle('neon');
  M.sel.mode = '4v4'; M.setMatchSeed(5); M.startMatch();
  const w = M.world;
  o.inWarmup = w.state === 'warmup';
  M.render();
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  // The pitch, including the net pocket the prompts also have to clear.
  const back = w.field.L / 2 + (w.field.net || 0);
  const yb = M.screenPt(M.wx(0), M.wy(back))[1];
  const yt = M.screenPt(M.wx(0), M.wy(-back))[1];
  o.pitchLo = Math.round(Math.min(yt, yb));
  o.pitchHi = Math.round(Math.max(yt, yb));
  // ⚠️ THE ROW'S OWN y, not a colour probe. The prompt plates and the players' NAME
  // plates are drawn in the same colour, and the name plates are legitimately on the
  // pitch — so counting plate-coloured pixels over the play measures the wrong feature
  // entirely (1,265 of them on a build where the prompts are plainly below the field).
  // `drawLobby` records where it put the row; this checks that against the pitch.
  o.promptY = w.lobby._promptY;
  o.canvasH = c.height;
  // ...and that something was actually drawn down there, so the coordinate is not just a
  // number nobody used.
  const hex = (M.TH.nameBg || '#000000').replace('#', '');
  const nr = parseInt(hex.slice(0, 2), 16), ng = parseInt(hex.slice(2, 4), 16), nb = parseInt(hex.slice(4, 6), 16);
  const band = (y0, y1) => {
    const top = Math.max(0, Math.round(y0)), h = Math.min(Math.round(y1 - y0), c.height - top);
    if (h <= 0) return 0;
    const d = g.getImageData(0, top, c.width, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (Math.abs(d[i] - nr) + Math.abs(d[i+1] - ng) + Math.abs(d[i+2] - nb) < 18) n++;
    return n;
  };
  // ⚠️ THERE IS NO PROMPT ROW ANY MORE. It was a line of plates under the touchline
  // reading "P1 START = KICK OFF · P2 START = READY · …", one per person — a row that
  // grew with the room, sitting between the pitch and the keyboard, saying the same
  // two words four times. What it was for is answered once by the headline above the
  // pitch. So what is measured now is that it is GONE and that the headline took over.
  o.promptRowGone = w.lobby._promptY == null;
  // ⚠️ And the headline is centred on the COURT, not on the canvas: `cw/2` is the
  // middle of the drawing surface and the menu dock takes a bite out of one side of
  // it, so with the dock open the headline sat well left of the pitch and of the
  // scorebug above it. Everything in this lobby is placed around the court.
  // ⚠️ Read from where `drawLobby` says it PUT the line, never from a colour probe —
  // the same lesson `_promptY` records just above: the countdown, the hint and the
  // theme's own backdrop all live in that band.
  o.headMid = Math.round(w.lobby._headX);
  o.courtMid = Math.round(M.screenPt(M.wx(0), M.wy(0))[0]);
  o.headlineFollowsTheCourt = Math.abs(o.headMid - o.courtMid) < 2;
  return o;
});
await four.close();

// ===================================================== the defaults, reset ==
const bare = await withPads(0);
const def = await bare.evaluate(() => {
  const M = window.__magnet, d = M.defaultSel();
  M.sel.mode = '4v4'; M.sel.lobby = 'off'; M.startMatch();
  return {
    palette: d.look.palette,
    livePalette: M.sel.look.palette,
    profileFlag: M.defaultProfile().flag,
    // ⚠️ Every bot wears a NUMBER, not a country. The first-run continent lineup used to
    // dress a brand-new install in flags, which is the opposite of "players are numbered".
    botFlags: M.world.players.filter(q => q.ctrl === 'bot').map(q => q.flag),
  };
});
await bare.close();

// -------------------------------------------------------------------- report --
ok('a pad takes seat one', share.seatIsPad);
ok('...and the STICK moves it', share.stickOnly > 5, `${share.stickOnly}`);
ok('...and so does the KEYBOARD, at the same time', share.keysOnly > 5,
   `${share.keysOnly} — a pad in seat one used to set ctrl='gamepad', and pollKeys was called from a draw behind "is there a human1", so the keyboard was not even read`);
ok('...without doubling the speed', Math.abs(share.both - share.stickOnly) < 2,
   `stick ${share.stickOnly}, both ${share.both} — the merge takes the louder axis, never the sum`);
ok('...and KICK works from either', share.kickPad && share.kickKeys,
   JSON.stringify({ pad: share.kickPad, keys: share.kickKeys }));
ok('...and the SECOND pad\'s seat is not shared', share.secondSeatExists && share.secondSeatMoved < 1,
   `moved ${share.secondSeatMoved} — the keyboard joins the first seat only, or a keypress drives two players`);

ok('SELECT gives four distinct headings', rot.fourDistinct, JSON.stringify(rot.headings));
ok('...and the fourth press comes back round', rot.wrapsBack, JSON.stringify(rot.headings));
ok('...per pad, not globally', rot.otherPadUntouched);
ok('...and it survives the next match', rot.survivesRestart && rot.savedInSel,
   'standing the right way round is something you told the game about the ROOM, not about that kickoff');
ok('the controller icon turns with the seat', icon.changed,
   'that row is the only readout this feature has — without it you press SELECT and have to walk to the pitch to see what happened');
ok('...and comes back after four', icon.backAfterFour);

ok('START does not kick', kick.startNo);
ok('SELECT does not kick', kick.selectNo, 'it turns your controls, and a button cannot be both');
ok('the D-PAD does not kick', kick.dpadNo,
   'it is a button as far as the API is concerned, so an unqualified "any button kicks" fires a shot on every step you take');
ok('...and EVERY other button does', kick.restYes, JSON.stringify(kick.byIndex));
ok('...unless one is bound by hand', kick.boundOnly,
   '"any button" is the default for somebody who has not chosen, not an override of somebody who has');

ok('the lobby is up with four pads', lob.inWarmup);
ok('the per-player prompt row is GONE', lob.promptRowGone,
   `_promptY is ${lob.promptY} — a row that grows with the room, between the pitch and the keyboard, saying the same two words once per person`);
ok('...and the headline is centred on the COURT', lob.headlineFollowsTheCourt !== false,
   `headline at ${lob.headMid}, court centre ${lob.courtMid} — cw/2 is the middle of the canvas, and the menu dock takes a bite out of one side of it`);


ok('the default theme is grass', def.palette === 'grass' && def.livePalette === 'grass',
   `${def.palette} — a plain green pitch is what a football game looks like before you have chosen anything, and it is what a reset gives back`);
ok('...and you are numbered', /^num\d$/.test(def.profileFlag), def.profileFlag);
ok('...and so is every bot', def.botFlags.length > 0 && def.botFlags.every(f => /^num\d$/.test(f)),
   `${JSON.stringify(def.botFlags)} — the first-run continent lineup dressed a fresh install in country flags, which is the opposite of "players are numbered"`);

ok('holding SELECT for three seconds goes to warm-up', hold.wentToWarmup && hold.secs === 3,
   JSON.stringify(hold));
ok('...and ANY pad can do it, not just the first', hold.padSeats.includes(1) && hold.armed,
   JSON.stringify({ seats: hold.padSeats, armed: hold.armed }) +
   ' — the idle branch this grew out of is deliberately first-pad-only, so a probe driving pad 0 would pass on a build that kept that');
ok('...the clock is real, and halfway is still a match', Math.abs(hold.fracHalf - 0.5) < 0.05 && hold.stillPlayingHalfway,
   JSON.stringify({ frac: hold.fracHalf, playing: hold.stillPlayingHalfway }) +
   ' — counted in the step loop, so three seconds is three seconds at any refresh rate');
ok('...and the hold does NOT turn your controls on the way in', hold.holdDidNotTurn,
   'firing the quarter turn on the press edge meant arriving in warm-up with the stick a quarter wrong, which is the one thing this button exists to get right');
ok('a TAP still turns them, and stays in the match', hold.tapTurns && hold.tapStaysInMatch,
   JSON.stringify({ turns: hold.tapTurns, stayed: hold.tapStaysInMatch }));
ok('the warm-up branch actually reached warm-up', hold.reachedWarmup,
   'otherwise the two checks below are absent rather than false, which reads as a pass');
ok('...and the turn is still live in WARM-UP and in a DRILL', hold.warmupTapTurns && hold.drillTapTurns,
   JSON.stringify({ warmup: hold.warmupTapTurns, drill: hold.drillTapTurns }) +
   ' — gating the turn on the same condition as the hold took SELECT away in the one room built for standing somewhere, and in every drill');
ok('...while the HOLD stands down in both', hold.warmupHoldInert && hold.drillHoldInert && hold.drillStillADrill,
   JSON.stringify({ warmup: hold.warmupHoldInert, drill: hold.drillHoldInert }) +
   ' — you are already in the room, and a drill is not a match to leave');

ok('two renders of one frame are identical', ring.renderStable,
   'without this every pixel number below is measuring the renderer, not the ring');
ok('a ring fills round the player while SELECT is held',
   ring.ring25 > 20 && ring.ring25 < 80 && ring.ring70 > ring.ring25 + 40,
   JSON.stringify({ at: ring.frac25, ring25: ring.ring25, at2: ring.frac70, ring70: ring.ring70 }) +
   ' of 180 angles — measured as a DIFFERENCE against the same frame with the hold stood down, because a body already carries a guide ring and a rim; and an arc whose length does not grow is a progress bar that shows no progress');
ok('...and it stays clear of the kick ring', ring.clearOfKickRing <= 4,
   ring.clearOfKickRing + ' angles inked at the reach radius — that circle is a promise about the physics');

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ share, rot, icon, kick, lob, def, hold, ring }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL seatcontrols\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS seatcontrols');
