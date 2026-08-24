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
  o.ring25 = arcAngles(A, B, cO[0], cO[1], rB*2.5, rB*3.3);
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
  o.ring70 = arcAngles(A, B, cO2[0], cO2[1], rB*2.5, rB*3.3);
  o.corner70 = boxDiff(A, B, cv.width-120, cv.height-120, cv.width, cv.height);
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

ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));
console.log(bad ? 'FAIL lobbyhold' : 'PASS lobbyhold');
await b.close();
process.exit(bad ? 1 : 0);
