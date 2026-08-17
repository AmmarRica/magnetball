// SPRINT — a stamina ring you spend and have to earn back.
//
// ⚠️ SPRINTING IS PUSHING THE STICK ALL THE WAY, not a button, and that is a design
// constraint rather than a preference: `padKickHeld` is "every button kicks" with three
// exclusions, so a sprint button would have to be carved out of the kick set on some
// pads and not others, and a touch player has no second button at all. Full tilt is one
// gesture a pad, a D-pad, an arrow key and a thumb on the rim can all make.
//
// ⚠️ SPENT IS LATCHED, and without that the feature does not exist. "Slow while the ring
// is not full", read literally, slows you on the second frame of the first run — so the
// checks below measure that a sprint really does last `sprintSecs()` at FULL speed and
// only then drops to the tired multiplier.
//
// ⚠️ AND IT IS OFF BY DEFAULT, because it changes how every body on the pitch moves.
// The determinism check is what proves the default costs nothing.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };
const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|ERR_TUNNEL/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  o.defaultOff = M.defaultSel().sprint === 'off';

  // ---- 1. off is genuinely off ------------------------------------------------
  M.sel.sprint = 'off';
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(7); M.startMatch();
  {
    const w = M.world; w.state = 'play'; w.stateT = 2;
    const me = w.players[0];
    // ⚠️ Driven through `pads.p1`, never by writing `p.inX` — the pad is read every
    // step and a directly-set stick is overwritten before `integrate` ever sees it.
    // This is the trap CLAUDE.md records, and it cost this suite its first run.
    M.pads.p1.dx = 1; M.pads.p1.dy = 0;
    for (let i = 0; i < 600; i++) M.step(w);
    M.pads.p1.dx = 0;
    o.offKeepsFullStamina = me.stam === 1 && !me.spent;
  }

  // ---- 2. a run at full tilt drains, and lasts as long as the dial says --------
  M.sel.sprint = 'on';
  M.sel.feel.sprintSecs = 200;      // 2.00s, stored in hundredths
  M.sel.feel.sprintRefill = 400;    // 4.00s
  M.sel.feel.sprintSlow = 50;       // half speed when spent
  o.secs = M.sprintSecs(); o.refill = M.sprintRefill(); o.slow = M.sprintSlow();

  M.setMatchSeed(7); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = w.players[0];
  me.x = 0; me.y = 0; me.vx = me.vy = 0; me.stam = 1; me.spent = false;
  let emptiedAt = -1;
  const speeds = [];
  M.pads.p1.dx = 1; M.pads.p1.dy = 0;    // full tilt, held
  for (let i = 0; i < 600; i++){
    M.step(w);
    if (emptiedAt < 0 && me.stam <= 0) emptiedAt = i;
    speeds.push(Math.hypot(me.vx, me.vy));
  }
  o.emptiedAt = emptiedAt;
  o.emptiedAtSecs = +(emptiedAt/60).toFixed(2);
  // ⚠️ Measured against the DIAL, not a constant, so retuning the default cannot
  // silently break the claim that the slider is what decides it.
  o.lastsTheDial = Math.abs(emptiedAt/60 - M.sprintSecs()) < 0.2;
  o.spentAfter = me.spent === true;
  // Top speed before it emptied vs after — the tired multiplier, measured.
  const before = Math.max.apply(null, speeds.slice(30, emptiedAt));
  const after = Math.max.apply(null, speeds.slice(emptiedAt + 120));
  o.fullSpeed = +before.toFixed(3);
  o.tiredSpeed = +after.toFixed(3);
  o.tiredIsTheDial = Math.abs(after/before - M.sprintSlow()) < 0.06;

  // ---- 3. ...and standing still earns it back ---------------------------------
  let refilledAt = -1;
  M.pads.p1.dx = 0; M.pads.p1.dy = 0;
  for (let i = 0; i < 900; i++){
    M.step(w);
    if (refilledAt < 0 && me.stam >= 1) refilledAt = i;
  }
  o.refilledAt = refilledAt;
  o.refilledAtSecs = +(refilledAt/60).toFixed(2);
  o.refillIsTheDial = refilledAt >= 0 && Math.abs(refilledAt/60 - M.sprintRefill()) < 0.3;
  o.rested = me.spent === false;
  // ⚠️ And full speed is BACK. Without this the check above passes on a build that
  // simply never lets you off the tired multiplier again.
  me.vx = me.vy = 0;
  const back = [];
  M.pads.p1.dx = 1;
  for (let i = 0; i < 60; i++){ M.step(w); back.push(Math.hypot(me.vx, me.vy)); }
  o.speedComesBack = Math.max.apply(null, back) > o.tiredSpeed * 1.3;

  // ---- 4. easing OFF the stick is not a sprint --------------------------------
  me.stam = 1; me.spent = false;
  M.pads.p1.dx = 0.5; M.pads.p1.dy = 0;
  for (let i = 0; i < 600; i++) M.step(w);
  M.pads.p1.dx = 0;
  o.joggingIsFree = me.stam === 1 && !me.spent;

  // ---- 5. bots get the same ring ----------------------------------------------
  M.setMatchSeed(11); M.sel.mode = '4v4'; M.startMatch();
  {
    const w2 = M.world; w2.state = 'play'; w2.stateT = 2;
    for (let i = 0; i < 1800; i++) M.step(w2);
    const bots = w2.players.filter(q => q.ctrl === 'bot');
    o.botsHaveStamina = bots.every(q => typeof q.stam === 'number');
    o.someBotGotTired = bots.some(q => q.stam < 0.999);
  }
  M.sel.sprint = 'off'; M.sel.mode = '1v1';
  return o;
});

// ============================================ off changes NOTHING at all ==
// ⚠️ The point of a default-off gameplay switch: with it off the world must be bit
// identical to a build that never had it. Hashed over 900 steps.
const det = await p.evaluate(() => {
  const M = window.__magnet;
  const run = () => {
    M.sel.mode = '3v3'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
    M.setMatchSeed(23); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (let i = 0; i < 900; i++) M.step(w);
    return w.players.map(q => `${q.x.toFixed(6)},${q.y.toFixed(6)}`).join('|') +
           `#${w.ball.x.toFixed(6)},${w.ball.y.toFixed(6)}#${w.score.join('-')}`;
  };
  M.sel.sprint = 'off'; const a = run();
  M.sel.sprint = 'off'; const b2 = run();
  M.sel.sprint = 'on';  const c = run();
  M.sel.sprint = 'off';
  return { stable: a === b2, onDiffers: a !== c, sample: a.slice(0, 60) };
});

// ==================================================== the ring, in pixels ==
// ⚠️ Measured as RENDERED INK, never from the flag — a "stamina exists" check passes on
// a build that draws nothing at all.
// ⚠️ And measured as a DIFFERENCE against the same body drawn rested, per probe angle.
// The disc already has a guide ring and a rim within a few pixels of this radius, so an
// absolute ink count reads 65 of 120 with no stamina ring drawn at all — which is the
// trap this file exists to avoid. The arc is whatever is inked when draining and is not
// inked when rested; a full circle would show up as no difference.
// ⚠️ THE PALETTE IS PINNED, because a suite that samples pixels has to say which one it
// is sampling — grass puts mown stripes exactly where this is looking.
const ring = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.applyTheme('neon');
  M.sel.sprint = 'on';
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(7); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = w.players[0];
  const cv = document.getElementById('game'), c = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const STEPA = 3, N = 360/STEPA;
  const scan = () => {
    M.computeCam(); M.render();
    const s = M.cam.s, rr = me.r * s * M.cam.body * M.SPRINT.ring;
    const cx = M.wx(me.x), cy = M.wy(me.y);
    const on = [];
    for (let k = 0; k < N; k++){
      const t = (k*STEPA - 90) * Math.PI/180;
      const px = Math.round((cx + Math.cos(t)*rr) * dpr), py = Math.round((cy + Math.sin(t)*rr) * dpr);
      if (px < 0 || py < 0 || px >= cv.width || py >= cv.height){ on.push(false); continue; }
      const d = c.getImageData(px, py, 1, 1).data;
      on.push(d[0] + d[1] + d[2] > 200);
    }
    return on;
  };
  me.x = 0; me.y = 0; me.vx = me.vy = 0;
  me.stam = 1; me.spent = false;  const rest = scan();
  me.stam = 0.5; me.spent = false; const half = scan();
  me.stam = 0.02; me.spent = true; const low  = scan();
  const extra = a => a.map((v, k) => v && !rest[k]);
  const eh = extra(half), el = extra(low);
  const count = a => a.reduce((n, v) => n + (v ? 1 : 0), 0);
  o.restInk = count(rest); o.halfExtra = count(eh); o.lowExtra = count(el);
  o.probes = N;
  // ⚠️ Drawn only when there is something to say: rested adds nothing over the disc.
  o.hiddenWhenRested = count(extra(rest)) === 0;
  o.shownWhenDrained = o.halfExtra > N*0.20;
  // ...an ARC, not a full circle: half stamina must leave a real gap.
  o.isAnArcNotACircle = o.halfExtra < N*0.72;
  // ...and it SHRINKS as the ring drains, which is the whole of "progress bar".
  o.shrinksAsItDrains = o.lowExtra < o.halfExtra;
  // ⚠️ ...starting at TWELVE O'CLOCK and sweeping like a clock hand. Index 0 is
  // straight up, so the inked run has to begin there.
  o.startsAtTwelve = eh[0] === true && eh[1] === true;
  M.sel.sprint = 'off';
  return o;
});
await p.close();

// -------------------------------------------------------------------- report --
ok('sprint is OFF by default', r.defaultOff, 'it changes how every body on the pitch moves');
ok('...and off means the ring never moves', r.offKeepsFullStamina);

ok('a run at full tilt lasts exactly as long as the dial says', r.lastsTheDial,
   `emptied at ${r.emptiedAtSecs}s against a dial of ${r.secs}s`);
ok('...at FULL speed the whole way', r.fullSpeed > r.tiredSpeed,
   `${r.fullSpeed} then ${r.tiredSpeed} — "slow while the ring is not full" read literally slows you on the second frame of the first run, which is not a sprint`);
ok('...then the tired multiplier is the dial', r.tiredIsTheDial,
   `${(r.tiredSpeed/r.fullSpeed).toFixed(3)} against a dial of ${r.slow}`);
ok('...and it latches until the ring is FULL again', r.spentAfter);

ok('standing still earns it back on its own dial', r.refillIsTheDial,
   `full again after ${r.refilledAtSecs}s against a dial of ${r.refill}s`);
ok('...and the speed really comes back', r.speedComesBack && r.rested,
   `${r.tiredSpeed} then a peak of the recovered run — without this, "it refills" is true of a build that never lets you off the tired speed`);
ok('easing off the stick is not a sprint', r.joggingIsFree,
   'half a push has to cost nothing, or there is no choice being made');

ok('bots carry the same ring', r.botsHaveStamina && r.someBotGotTired,
   'a tired human playing a side that never gets tired is a handicap, not a mechanic');

ok('with sprint off the world is unchanged', det.stable, det.sample);
ok('...and with it on it is a different match', det.onDiffers,
   'if switching it on changes nothing then nothing was wired up');

ok('the ring is not drawn when you are rested', ring.hiddenWhenRested,
   `${ring.restInk} of ${ring.probes} probe angles inked with a full ring — a permanent ring round every body is furniture`);
ok('...is drawn when it is draining', ring.shownWhenDrained,
   `${ring.halfExtra} of ${ring.probes} angles inked over the rested baseline`);
ok('...as an ARC, not a full circle', ring.isAnArcNotACircle,
   `${ring.halfExtra} of ${ring.probes} at half stamina — a progress bar that is always a full ring shows no progress`);
ok('...that SHRINKS as it drains', ring.shrinksAsItDrains,
   `${ring.halfExtra} at half, ${ring.lowExtra} at empty`);
ok('...sweeping from twelve o\'clock', ring.startsAtTwelve,
   'it is a clock, and a clock hand starts at the top');

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ r, det, ring }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL sprint\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS sprint');
