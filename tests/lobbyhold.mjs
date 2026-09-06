// HOLD START FOR FIVE SECONDS — anybody in warm-up can force the kickoff.
//
// Only the host's press started a match, so a room where player one had wandered off or
// put their pad down had no way out but the 30-second idle clock. A tap still means "I am
// ready"; a HOLD means "we are going".
//
// ⚠️ MEASUREMENT TRAPS, all three hit while writing this:
//  1. **Diff the SAME frame, drawn twice.** Comparing a frame mid-hold against one grabbed
//     seventy steps earlier measures the whole lobby moving — balls, bots walking on, the
//     idle countdown — and reports a ring around everybody. Render once, zero the hold,
//     render again, diff those.
//  2. **Pull the bodies apart first.** Everyone spawns within a couple of body-lengths of
//     halfway, so one player's annulus runs straight through another's ring.
//  3. **A background track makes the check vacuous.** A full-circle track behind the arc
//     is a complete ring at every value, so the probe reads ~180 of 180 angles at 25% and
//     at 90% alike. That is the trap `tests/sprint.mjs` records; the ring is the arc alone.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await p.addInitScript(() => {
  window.__MAGNETDEBUG = true;
  const mk = i => ({ axes: [0,0,0,0], buttons: Array.from({length:17}, () => ({pressed:false, value:0})),
                     connected: true, index: i, id: 'Stub Pad (STANDARD GAMEPAD)', mapping: 'standard' });
  window.__pads = [mk(0), mk(1)];
  navigator.getGamepads = () => window.__pads;
});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.controllers = 'on'; M.sel.lobby = 'on'; M.sel.orient = 'v'; M.sel.length = '5';
  // ⚠️ A suite that samples pixels has to say which palette it is sampling.
  M.sel.look.palette = 'grass';
  M.setMatchSeed(7); M.startMatch({ lobby: true });
  const w = M.world;
  o.inWarmup = w.state === 'warmup';
  const humans = w.players.filter(x => x.ctrl !== 'bot');
  const host = M.lobbyHost(w), other = humans.find(x => x !== host);
  o.twoSeats = !!other && humans.length >= 2;
  if (!o.twoSeats) return o;
  o.holdSecs = M.LOBBY.holdStart;

  const START = 9;
  const down = v => { window.__pads[other.padIndex].buttons[START] = { pressed: !!v, value: v ? 1 : 0 }; };
  const run = n => { for (let i = 0; i < n; i++) M.step(w); };

  // ---- the clock -----------------------------------------------------------
  down(true); run(1);                       // the press edge
  o.edgeIsReady = w.lobby.ready.size === 1; // a TAP still means "I am ready"
  o.edgeNoHold = M.startHoldFrac(other) === 0;
  run(75);                                  // 1.25s
  o.at25 = +M.startHoldFrac(other).toFixed(2);
  run(75);                                  // 2.5s
  o.at50 = +M.startHoldFrac(other).toFixed(2);
  o.stillWarmupAt50 = w.state === 'warmup';
  // ⚠️ It ZEROES on release rather than decaying — otherwise a player could tap their way
  // to a kickoff, which is the opposite of what five seconds is for.
  down(false); run(1);
  o.releaseZeroes = M.startHoldFrac(other) === 0;
  o.stillWarmupAfterRelease = w.state === 'warmup';
  // ...and a full five seconds really does start it.
  down(true); run(1 + 301);
  o.fullStarts = w.state !== 'warmup';
  o.startedInto = w.state;
  return o;
});

// ---------- the two rings, in rendered pixels --------------------------------
const pix = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.controllers = 'on'; M.sel.lobby = 'on'; M.sel.orient = 'v'; M.sel.length = '5';
  M.sel.look.palette = 'grass';
  M.setMatchSeed(7); M.startMatch({ lobby: true });
  const w = M.world;
  const humans = w.players.filter(x => x.ctrl !== 'bot');
  const host = M.lobbyHost(w), other = humans.find(x => x !== host);
  if (!other) return o;
  const cv = document.getElementById('game'), g = cv.getContext('2d');
  const grab = () => g.getImageData(0, 0, cv.width, cv.height).data;

  // TRAP 1: the same frame, drawn twice, with only the hold changed between them.
  const pair = () => {
    const withRing = grab();
    const keep = other.startHold; other.startHold = 0;
    M.render(); const without = grab();
    other.startHold = keep; M.render();
    return [withRing, without];
  };
  const arcAngles = (A, B, px, py, r0, r1) => {
    let n = 0;
    for (let a = 0; a < 360; a += 2)
      for (let rr = r0; rr <= r1; rr += 0.5){
        const x = Math.round(px + Math.cos(a*Math.PI/180)*rr), y = Math.round(py + Math.sin(a*Math.PI/180)*rr);
        if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) continue;
        const i = (y*cv.width + x)*4;
        if (Math.abs(A[i]-B[i]) + Math.abs(A[i+1]-B[i+1]) + Math.abs(A[i+2]-B[i+2]) > 40){ n++; break; }
      }
    return n;                              // of 180 probe angles
  };
  const boxDiff = (A, B, x0, y0, x1, y1) => { let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++){ const i = (y*cv.width + x)*4;
      if (Math.abs(A[i]-B[i]) + Math.abs(A[i+1]-B[i+1]) + Math.abs(A[i+2]-B[i+2]) > 40) n++; }
    return n; };
  // TRAP 2: apart, and with `_px`/`_py` set too or `ix()` interpolates across the pitch.
  const apart = () => {
    host.x = -w.field.W*0.34; host.y = -w.field.L*0.34; host.vx = host.vy = 0;
    host._px = host.x; host._py = host.y;
    other.x = w.field.W*0.34; other.y = w.field.L*0.34; other.vx = other.vy = 0;
    other._px = other.x; other._py = other.y;
  };
  const spot = pl => M.screenPt(M.wx(M.ix(pl)), M.wy(M.iy(pl)));
  const rB = other.r * M.cam.s;

  // ⚠️ The null: two renders with NOTHING changed must be identical, or every number
  // below is measuring the renderer wobbling rather than the ring.
  M.render(); const n1 = grab(); M.render(); const n2 = grab();
  o.renderStable = boxDiff(n1, n2, 0, 0, cv.width, cv.height) === 0;

  const START = 9;
  window.__pads[other.padIndex].buttons[START] = { pressed: true, value: 1 };
  for (let i = 0; i < 1 + 75; i++) M.step(w);          // 1.25s → a quarter
  apart(); M.render();
  o.frac25 = +M.startHoldFrac(other).toFixed(2);
  let [A, B] = pair();
  const cO = spot(other);
  o.ring25 = arcAngles(A, B, cO[0], cO[1], rB*2.0, rB*3.6);
  // ⚠️ It must NOT reach the kick ring, whose radius IS the reach — a promise about the
  // physics, and the stamina gauge is that same ring recoloured. A third arc there would
  // be a third meaning for one circle. The dial's own maximum is 2.0 body radii.
  o.clearOfKickRing = arcAngles(A, B, cO[0], cO[1], rB*1.6, rB*2.05);
  o.corner25 = boxDiff(A, B, cv.width-120, cv.height-120, cv.width, cv.height);

  for (let i = 0; i < 135; i++) M.step(w);             // ~3.5s
  apart(); M.render();
  o.frac70 = +M.startHoldFrac(other).toFixed(2);
  [A, B] = pair();
  const cO2 = spot(other);
  o.ring70 = arcAngles(A, B, cO2[0], cO2[1], rB*2.0, rB*3.6);
  o.corner70 = boxDiff(A, B, cv.width-120, cv.height-120, cv.width, cv.height);
  return o;
});

// ============================================================================
// A NON-HOST'S TAP IS SEEN — `w.lobby.ready` had ONE writer and NO reader.
//
// ⚠️ MEASURED FIRST, on the build before the fix: the tap toggled a Set that nothing in
// `index.html` ever consulted — the only two readers in the whole repo were this suite's
// own `edgeIsReady` above and one line in `tests/lobby.mjs`, both asserting the Set had
// grown. So the headline said PRESS START TO CONTINUE and, for everybody who is not the
// host, pressing it did nothing anybody could see.
//
// ⚠️ THE PAIR IS THE CHECK. "There is ink above the body" is true of a build with no mark
// at all — the name plate, the hold ring and the body's own rim are all up there — so it is
// measured as a DIFFERENCE against the same frame with the Set emptied, which is the trap
// this file already records for the ring. Paired the other way too: with nobody readied the
// difference must be exactly ZERO, or the probe is reading the lobby moving.
const ready = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.controllers = 'on'; M.sel.lobby = 'on'; M.sel.orient = 'v'; M.sel.length = '5';
  M.sel.look.palette = 'grass';
  M.setMatchSeed(7); M.startMatch({ lobby: true });
  const w = M.world;
  const humans = w.players.filter(x => x.ctrl !== 'bot');
  const host = M.lobbyHost(w), other = humans.find(x => x !== host);
  if (!other) return o;
  // TRAP 2 again: apart, with `_px`/`_py` set, or `ix()` interpolates across the pitch.
  const put = (pl, fx, fy) => { pl.x = w.field.W*fx; pl.y = w.field.L*fy; pl.vx = pl.vy = 0;
                                pl._px = pl.x; pl._py = pl.y; };
  put(host, -0.34, -0.34); put(other, 0.34, 0.34);
  const cv = document.getElementById('game'), g = cv.getContext('2d');
  const grab = () => g.getImageData(0, 0, cv.width, cv.height).data;
  const ringR = (pl) => { const r = pl.r * M.cam.s, rw = Math.max(2, r*0.18);
                          return M.holdRingR(r, rw) + rw/2; };          // the ring's OUTER edge
  const spot = pl => M.screenPt(M.wx(M.ix(pl)), M.wy(M.iy(pl)));
  // Changed pixels within `r1` of a body, optionally excluding everything inside `r0`.
  const nearBody = (A, B, pl, r0, r1) => {
    const c = spot(pl); let n = 0;
    for (let y = Math.floor(c[1]-r1); y <= c[1]+r1; y++)
      for (let x = Math.floor(c[0]-r1); x <= c[0]+r1; x++){
        if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) continue;
        const d = Math.hypot(x-c[0], y-c[1]); if (d > r1 || d < r0) continue;
        const i = (y*cv.width + x)*4;
        if (Math.abs(A[i]-B[i]) + Math.abs(A[i+1]-B[i+1]) + Math.abs(A[i+2]-B[i+2]) > 40) n++;
      }
    return n;
  };
  // The pair: render with the Set as `set` gives it, then as `alt` gives it, and put the
  // real one back. Everything below is a difference between two states of that ONE Set, so
  // the only thing that can move between the frames is the mark.
  const pair = (set, alt) => {
    const keep = new Set(w.lobby.ready);
    const use = s => { w.lobby.ready.clear(); for (const q of s) w.lobby.ready.add(q); };
    use(set); M.render(); const on = grab();
    use(alt); M.render(); const off = grab();
    use(keep); M.render();
    return [on, off];
  };
  const R = ringR(other) * 3;                       // a box comfortably past the mark

  // ⚠️ THE NULL, not a claim about the mark: two renders of the SAME empty Set must be
  // identical, or every number below is measuring the lobby moving between frames rather
  // than anything being drawn. It can never fail on a build that ignores the Set — that is
  // what `hostFollows` is for.
  let [A, B] = pair([], []);
  o.renderStable = nearBody(A, B, other, 0, R);

  // ---- the real path: a non-host taps START ---------------------------------
  const START = 9;
  window.__pads[other.padIndex].buttons[START] = { pressed: true, value: 1 };
  M.step(w);
  window.__pads[other.padIndex].buttons[START] = { pressed: false, value: 0 };
  M.step(w);
  put(host, -0.34, -0.34); put(other, 0.34, 0.34);
  o.tapReadied = w.lobby.ready.has(other);
  o.stillWarmup = w.state === 'warmup';
  [A, B] = pair([other], []);
  o.marked      = nearBody(A, B, other, 0, R);
  // ⚠️ It must clear the HOLD RING, and the two DO appear together — a readied player can
  // lean on the button to force the kickoff. Derived from `holdRingR`, so no constant here
  // is tuned to a zoom or to the reach dial.
  o.insideRing  = nearBody(A, B, other, 0, ringR(other));
  // ⚠️ ...and readying one body marks THAT body and no other.
  o.hostMarked  = nearBody(A, B, host, 0, R);
  // ⚠️ **THE MARK MUST FOLLOW THE SET PER BODY, and checking that needs the OTHER pairing.**
  // A build that ignores the Set and marks everybody draws the same picture in both frames
  // of every pair above, so the differences all read ZERO and `hostMarked === 0` passes for
  // exactly the wrong reason. Adding the host to the Set has to make ink appear on the HOST:
  // that is the one comparison such a build cannot fake, because for it nothing changes.
  [A, B] = pair([other, host], [other]);
  o.hostFollows = nearBody(A, B, host, 0, R);

  // ---- tapping again takes it off ------------------------------------------
  window.__pads[other.padIndex].buttons[START] = { pressed: true, value: 1 };
  M.step(w);
  window.__pads[other.padIndex].buttons[START] = { pressed: false, value: 0 };
  M.step(w);
  put(host, -0.34, -0.34); put(other, 0.34, 0.34);
  o.untapped = w.lobby.ready.has(other);
  // ⚠️ Measured as "the live picture is NOT the readied picture": the frame the Set actually
  // gives now, against the frame it would give with `other` put back in. A difference means
  // the mark really has come off the screen. Asserting the live frame equals itself would be
  // true on every build, which is the shape of the vacuous check one block up.
  [A, B] = pair([...w.lobby.ready], [other]);
  o.clearedOnScreen = nearBody(A, B, other, 0, R);
  return o;
});

// ============================================================================
// ANY BUTTON HOLDS — "some of my controllers don't have start button".
//
// ⚠️ MEASURED FIRST: of seventeen button indices, exactly ONE (9) did anything at all in
// this room. So a pad without Start could not ready up, could not kick off as host, and
// could not force the kickoff either — the whole feature was behind one switch that plenty
// of pads simply do not have.
//
// ⚠️ THE TAP CANNOT BE WIDENED, and that is a collision rather than an oversight: in
// warm-up the ball is LIVE and KICK is *every* button, which is the whole point of the
// room. "Any button starts the match" is the exact bug `pollLobbyStart`'s own comment
// records — A was bound to both jobs and did the wrong one. The five-second HOLD has no
// such conflict, and it is already SEEN (a filling ring on the body and on the pad's
// corner icon), which is what makes leaning on a button recoverable.
//
// ⚠️ MEASURED ON `startHold`, NEVER ON THE STATE. Holding a D-PAD direction walks the body,
// and walking into a goal is a different, legitimate way to start the match — so a probe
// that watches `w.state` scores D-pad RIGHT as "the hold works" on a build where the D-pad
// is correctly excluded. That false positive was seen: button 15 read HOLD-STARTS on both
// the fixed build AND the one with the hold back on START only.
const any = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const clear = () => { for (const g of window.__pads)
    g.buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })); };
  // One warm-up per button, because a hold leaves state on the body.
  const probe = i => {
    M.setMatchSeed(7); M.startMatch({ lobby: true });
    const w = M.world;
    if (w.state !== 'warmup') return null;
    const humans = w.players.filter(x => x.ctrl !== 'bot');
    const host = M.lobbyHost(w);
    const me = humans.find(x => x !== host) || host;
    clear(); M.step(w); M.step(w);                 // settle, and clear the edge
    window.__pads[me.padIndex].buttons[i] = { pressed: true, value: 1 };
    for (let k = 0; k < 60; k++) M.step(w);        // one second of holding
    const held = +(me.startHold || 0).toFixed(2);
    clear();
    return held;
  };
  o.held = {};
  for (let i = 0; i < 17; i++) o.held[i] = probe(i);
  // ⚠️ And the TAP must still be START-only, or the kick has been taken away — which is
  // the thing the room exists to let you test.
  const tap = i => {
    M.setMatchSeed(7); M.startMatch({ lobby: true });
    const w = M.world;
    const humans = w.players.filter(x => x.ctrl !== 'bot');
    const me = M.lobbyHost(w) || humans[0];
    clear(); M.step(w); M.step(w);
    window.__pads[me.padIndex].buttons[i] = { pressed: true, value: 1 };
    M.step(w); M.step(w);
    clear();
    for (let k = 0; k < 20; k++) M.step(w);
    return w.state !== 'warmup';
  };
  o.tapKickStarts  = tap(0);
  o.tapStartStarts = tap(9);

  // ⚠️ **NOT WHILE STANDING ON THE BOARD.** The lobby keyboard is a control SURFACE — KICK
  // there means "press this key" — and the `+`/`−` squares REPEAT while held, on purpose,
  // so a held button walks a 1v1 up to 11v11. Counting that toward the kickoff makes a
  // deliberate hold on one control fire a different one. `tests/lobbykb.mjs` found this the
  // hard way: its stepper block holds KICK for 300 steps and the match started underneath
  // it, so `w.lobby` was null and the suite threw rather than reporting anything.
  // ⚠️ START must still count from up there, or the board's own START pad stops working
  // for anyone holding rather than tapping.
  const onKey = i => {
    M.setMatchSeed(7); M.startMatch({ lobby: true });
    const w = M.world;
    // ⚠️ A NON-HOST seat, for the same reason the block at the top uses one: the HOST's
    // START tap starts the match on frame one, so there is no hold left to measure and
    // `startHold` reads 0 on a perfectly good build. That false negative was seen.
    const humans = w.players.filter(x => x.ctrl !== 'bot');
    const host = M.lobbyHost(w);
    const me = humans.find(x => x !== host) || host;
    const k = w.kb.keys.find(x => x.act === 1) || w.kb.keys.find(x => x.ch);
    clear(); M.step(w); M.step(w);
    window.__pads[me.padIndex].buttons[i] = { pressed: true, value: 1 };
    for (let n = 0; n < 60; n++){
      me.x = k.x + k.w / 2; me.y = k.y + k.h / 2; me.vx = 0; me.vy = 0;
      M.step(w);
    }
    const held = +(me.startHold || 0).toFixed(2);
    clear();
    return held;
  };
  o.onKeyKick  = onKey(0);
  o.onKeyStart = onKey(9);
  return o;
});

let bad = 0;
const ok = (name, cond, note='') => { if (!cond){ bad++; console.log('  FAIL ' + name + (note ? ' — ' + note : '')); } };

console.log(JSON.stringify({ r, pix }, null, 1));

ok('warm-up came up with two seats', r.inWarmup && r.twoSeats);
ok('the hold is five seconds', r.holdSecs === 5, String(r.holdSecs));
ok('a TAP still just means ready', r.edgeIsReady && r.edgeNoHold,
   'one button carries both, and the tap is the one that must not change');
ok('the ring tracks the clock', Math.abs(r.at25 - 0.25) < 0.03 && Math.abs(r.at50 - 0.5) < 0.03,
   `${r.at25} / ${r.at50} — counted in the step loop, so five seconds is five seconds at any refresh rate`);
ok('halfway through is still warm-up', r.stillWarmupAt50);
ok('releasing ZEROES it, and does not decay', r.releaseZeroes && r.stillWarmupAfterRelease,
   'a decay would let somebody tap their way to a kickoff, which is what five seconds exists to stop');
ok('a full five seconds starts the match', r.fullStarts, 'ended in ' + r.startedInto);

ok('two renders of one frame are identical', pix.renderStable,
   'without this every pixel number below is measuring the renderer, not the ring');
ok('the body ring is an ARC whose length is the progress',
   pix.ring25 > 25 && pix.ring25 < 75 && pix.ring70 > pix.ring25 + 50,
   `${pix.ring25} then ${pix.ring70} of 180 angles at ${pix.frac25} and ${pix.frac70} — a full ring at both would mean a background track is carrying it, which shows no progress at all`);
ok('...and it stays clear of the kick ring', pix.clearOfKickRing <= 4,
   `${pix.clearOfKickRing} angles inked at the reach radius — that circle is a promise about the physics`);
ok('the controller icon carries the same fill', pix.corner25 > 20 && pix.corner70 > pix.corner25 + 40,
   `${pix.corner25} then ${pix.corner70} pixels — the corner row is the only readout for somebody looking at their own hands`);

// ---- a non-host's tap is seen ----------------------------------------------
console.log(JSON.stringify({ ready }, null, 1));
ok('a non-host START tap readies them and starts nothing', ready.tapReadied && ready.stillWarmup);
ok('two renders of one empty Set are identical', ready.renderStable === 0,
   ready.renderStable + ' pixels differ with nothing changed — the null, without which every ' +
   'number below is measuring the lobby moving between frames');
ok('a readied body carries a mark', ready.marked > 40,
   ready.marked + ' pixels — measured as a difference against the same frame with the Set ' +
   'cleared, because the plate, the rim and the ring are all up there on every build');
ok('...clear of the hold ring it can appear beside', ready.insideRing === 0,
   ready.insideRing + ' pixels inside the ring radius — a readied player can then lean on ' +
   'the button to force the kickoff, so the two really do draw together');
ok('...and readying one body marks only that body', ready.hostMarked === 0,
   ready.hostMarked + ' pixels on the host, who did not tap');
ok('...and the mark FOLLOWS the Set, per body', ready.hostFollows > 40,
   ready.hostFollows + ' pixels on the host once the host is added — a build that ignores ' +
   'the Set and marks everybody draws the same picture in both halves of every other pair ' +
   'here, so they all read zero and the host check passes for exactly the wrong reason');
ok('tapping again takes it off, on screen as well as in the Set',
   !ready.untapped && ready.clearedOnScreen > 40,
   `set=${ready.untapped} diff=${ready.clearedOnScreen} — a toggle that only ever goes on ` +
   'is a mark you cannot correct');

// ---- any button holds ------------------------------------------------------
const DPAD = [12, 13, 14, 15];
const face = Object.keys(any.held).map(Number).filter(i => !DPAD.includes(i));
const heldFace = face.filter(i => any.held[i] > 0.5);
const heldDpad = DPAD.filter(i => any.held[i] > 0.5);
ok('EVERY button counts toward the hold, not just START',
   heldFace.length === face.length,
   'dead after a second of holding: ' + face.filter(i => !(any.held[i] > 0.5)).join(', ') +
   ' — of seventeen indices exactly ONE used to do anything in this room, which is what ' +
   '"some of my controllers don\'t have start button" costs');
ok('...and the D-PAD does not', heldDpad.length === 0,
   'held on ' + heldDpad.join(', ') + ' — a direction is a button as far as the Gamepad API ' +
   'is concerned, so counting it makes every step you take a request to kick off');
ok('...while a TAP of a kick button still does nothing', !any.tapKickStarts,
   'the ball is live in warm-up and KICK is every button — widening the tap is the exact ' +
   'bug where A was bound to both jobs and did the wrong one');
ok('...and a tap of START still starts it', any.tapStartStarts,
   'taking a meaning away without leaving the old one is not a fix');
ok('a kick button does NOT hold while you are standing on the board', any.onKeyKick === 0,
   'startHold reached ' + any.onKeyKick + ' — the +/- squares repeat while KICK is held so a ' +
   '1v1 can be walked up to 11v11, and counting that toward the kickoff makes a deliberate ' +
   'hold on one control fire a different one');
ok('...while START still does', any.onKeyStart > 0.5,
   'startHold reached ' + any.onKeyStart + ' — the board has its own START pad, and standing ' +
   'on the keyboard must not disarm a real Start button');

ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));
console.log(JSON.stringify({ any }, null, 1));
console.log(bad ? 'FAIL lobbyhold' : 'PASS lobbyhold');
await b.close();
process.exit(bad ? 1 : 0);
