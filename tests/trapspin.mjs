// TRAPPING TURNS THE BALL ROUND YOU — and anybody can knock it off you.
//
// Two changes to the same mechanic, asked for together:
//   1. a trapped ball SWINGS to where you are aiming instead of snapping there. A
//      ball at six o'clock takes a beat to come round to twelve, which is what makes
//      turning to pass something you commit to rather than something you toggle;
//   2. a trapped ball is STEALABLE by any OPPONENT, at any time, with no protection at
//      all — including mid-swing. Holding it is a risk you are taking, not a lock.
//      ⚠️ Opponents only, and that qualification was measured rather than assumed: an
//      unrestricted steal let team-mates strip each other, which turned every carry
//      into a scrum between players who are supposed to be helping and showed up as
//      the bots' difficulty ladder inverting.
//
// ⚠️ THE DEFECT the steal half fixes, and why it needed a code change rather than
// just a rule: the carrier re-plants the ball on their own bearing EVERY STEP, so
// another player's kick added velocity that was overwritten on the very next frame.
// The trap was absolute no matter what anybody did.
//
// ⚠️ MEASUREMENT TRAPS, both of which cost a run here:
//   · `applyHumanInput` reads the pad every step, so setting `p.kick` or `p.faceX`
//     directly on a human seat is overwritten before it does anything. Every body
//     driven here is `ctrl:'none'` and driven through `handleBallControl` by hand, or
//     the fields are re-set inside the step loop.
//   · "the ball moved round" is not "the ball SWUNG". A snap also moves it round, in
//     one frame. What separates them is the ball being part-way there on the frames
//     in between, so the angle is sampled every step and the path is measured.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport:{ width:900, height:900 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear();
  localStorage.setItem('magnetball.firstrun','1'); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(() => {
  const M = window.__magnet; const o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const TAU = Math.PI * 2;
  const norm = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

  // A world with nobody driving anything, so `applyHumanInput` cannot fight the test.
  const stage = () => {
    M.sel.trapOff = false; M.sel.magnet = 0; M.sel.mode = '2v2'; M.sel.lobby = 'off';
    M.setMatchSeed(3); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    w.players.forEach(q => { q.ctrl = 'none'; q.inX = 0; q.inY = 0; q.kick = false;
                             q.vx = 0; q.vy = 0; q.trap = false; q.trapUsed = false;
                             q.tapArmed = false; q.trapAng = null;
                             q.x = w.bounds.halfW * 0.9; q.y = w.bounds.halfL * 0.9; });
    return w;
  };
  // Carry `p0` with the ball parked at a bearing of `fromAng`, aiming at `aimAng`.
  // ⚠️ Driven through `handleBallControl` directly, one call per step, because that
  // is the function under test and `step()` would re-read pads over the top of it.
  const carry = (w, carrier, fromAng, aimAng, steps) => {
    const ball = w.ball;
    carrier.x = 0; carrier.y = 0; carrier.vx = 0; carrier.vy = 0;
    const hold = carrier.r + ball.r + 2;
    ball.x = Math.cos(fromAng) * hold; ball.y = Math.sin(fromAng) * hold;
    ball.vx = 0; ball.vy = 0;
    carrier.faceX = Math.cos(aimAng); carrier.faceY = Math.sin(aimAng);
    carrier.kick = true; carrier.trap = false; carrier.trapUsed = false;
    carrier.tapArmed = false; carrier.trapAng = null; carrier.chargeT = 0;
    // ⚠️ MEASUREMENT TRAP, and it cost a run: holding KICK does not trap on the first
    // frame. `TAP_HOLD` is 0.14s — nine frames of "is this a tap or a hold?" — during
    // which the ball has not moved at all. A short run measured entirely inside that
    // window, so the swing looked like it had a rate of zero and a release looked like
    // it fired from the starting bearing. The path therefore starts at the frame the
    // trap actually engages, and `steps` counts swing frames rather than calls.
    // ⚠️ And `steps` must stay under `TRAP.max` (0.5s = 30 frames) or the trap fires
    // by itself part-way through the measurement — which read as "the carrier is not
    // carrying" and as "a player across the pitch stole the ball", neither of which
    // was happening.
    const path = [];
    let guard = 0;
    while (!carrier.trap && guard++ < 60) M.handleBallControl(w, carrier, ball, false);
    path.push(+Math.atan2(ball.y - carrier.y, ball.x - carrier.x).toFixed(4));
    for (let i = 0; i < steps; i++){
      M.handleBallControl(w, carrier, ball, false);
      path.push(+Math.atan2(ball.y - carrier.y, ball.x - carrier.x).toFixed(4));
    }
    return path;
  };

  // ---- 1. it SWINGS, and it takes the short way round ---------------------
  {
    const w = stage();
    const c = w.players[0];
    // Six o'clock to twelve: half a turn, the case the request named.
    const from = Math.PI/2, aim = -Math.PI/2;
    const path = carry(w, c, from, aim, 25);
    o.rateDeclared = M.TRAP.spin;
    o.startAngle = +path[0].toFixed(2);
    o.endAngle = +path[path.length-1].toFixed(2);
    o.arrived = Math.abs(norm(path[path.length-1] - aim)) < 0.05;
    // ⚠️ A SNAP would be at the aim on frame one. The swing is measured by requiring
    // several frames in which the ball is neither where it started nor where it is
    // going — "it moved round" is true of a snap too.
    o.midFrames = path.filter(a => Math.abs(norm(a - from)) > 0.15 &&
                                   Math.abs(norm(a - aim))  > 0.15).length;
    o.swings = o.midFrames >= 5;
    // ...and monotonically, so it does not wobble or overshoot.
    let backsteps = 0, prev = path[0];
    for (const a of path){ const d = norm(a - prev); if (d > 0.001) backsteps++; prev = a; }
    o.backsteps = backsteps;
    o.turnsOneWay = backsteps === 0;
    // ⚠️ The SHORT way. From +90° to −90° through 180° is the same distance either
    // way, so this is measured from a bearing where the two differ: 170° to −170° is
    // 20° the short way and 340° the long way.
    const wrap = carry(w, c, Math.PI*0.944, -Math.PI*0.944, 6);
    o.wrapPeak = +Math.max(...wrap.map(a => Math.abs(a))).toFixed(3);
    o.wrapCrossedPi = wrap.some(a => Math.abs(a) > Math.PI * 0.98);
    o.takesTheShortWay = o.wrapCrossedPi;
    // The rate is what TRAP.spin says it is, to within a frame.
    const q = carry(w, c, 0, Math.PI*0.9, 3);
    o.perFrame = +Math.abs(norm(q[1] - q[0])).toFixed(4);
    o.rateMatches = Math.abs(o.perFrame - M.TRAP.spin/60) < 1e-3;
  }

  // ---- 2. the ball fires WHERE YOU CAN SEE IT, not along your facing ------
  // ⚠️ These were the same direction while the trap snapped; now they differ for as
  // long as the swing lasts, and firing along the facing would send the ball
  // somewhere it visibly is not.
  {
    const w = stage();
    const c = w.players[0], ball = w.ball;
    carry(w, c, Math.PI/2, -Math.PI/2, 6);          // let go part-way round
    const held = Math.atan2(ball.y - c.y, ball.x - c.x);
    o.releasedFrom = +held.toFixed(3);
    o.aimWas = +(-Math.PI/2).toFixed(3);
    o.stillSwinging = Math.abs(norm(held - (-Math.PI/2))) > 0.3;
    M.releaseTrap(w, c, ball);
    const went = Math.atan2(ball.vy, ball.vx);
    o.wentTowards = +went.toFixed(3);
    o.firesWhereItPoints = Math.abs(norm(went - held)) < 0.05;
    o.notAlongFacing = Math.abs(norm(went - (-Math.PI/2))) > 0.2;
    o.trapCleared = c.trap === false && c.trapAng == null && !ball._trappedBy;
  }

  // ---- 3. ANYBODY CAN KNOCK IT OFF YOU -----------------------------------
  {
    const w = stage();
    // ⚠️ An OPPONENT. The steal is deliberately opponent-only — a team-mate jogging
    // past and stripping the ball off you is nobody's idea of "no protection", and
    // with bots on both sides it turned every carry into a scrum. `w.players[1]` is
    // not reliably on the other side, so the thief is picked by team.
    const c = w.players[0];
    const thief = w.players.find(q => q.team !== c.team), ball = w.ball;
    carry(w, c, 0, 0, 10);                          // settled, carrying
    o.isCarrying = c.trap === true && ball._trappedBy === c;
    const at = [ball.x, ball.y];
    // The thief walks up and presses KICK.
    thief.x = ball.x + 6; thief.y = ball.y + 6; thief.vx = 0; thief.vy = 0;
    thief.faceX = 1; thief.faceY = 0; thief.kick = true; thief.kickUsed = false;
    thief.trap = false; thief.trapUsed = false; thief.tapArmed = false;
    M.handleBallControl(w, thief, ball, false);
    o.trapBroken = c.trap === false && ball._trappedBy !== c;
    // ⚠️ ...and it STAYS broken while the carrier is still holding KICK. A steal that
    // lasts one frame is not a steal: `trapUsed` latches until they let go.
    let reTrapped = false;
    for (let i = 0; i < 40; i++){
      M.handleBallControl(w, c, ball, false);
      if (c.trap) { reTrapped = true; break; }
    }
    o.staysBroken = !reTrapped;
    // ...and the ball actually leaves.
    for (let i = 0; i < 20; i++) M.step(w);
    o.ballMoved = Math.hypot(ball.x - at[0], ball.y - at[1]) > 20;
    o.ballFreeAfter = ball._trappedBy == null || ball._trappedBy !== c;
  }
  // ⚠️ ...including MID-SWING, which is the case "no protection" specifically rules
  // out protecting. A build that shielded the swing would pass everything above.
  {
    const w = stage();
    const c = w.players[0];
    const thief = w.players.find(q => q.team !== c.team), ball = w.ball;
    carry(w, c, Math.PI/2, -Math.PI/2, 5);          // part-way round
    o.midSwing = c.trap === true &&
                 Math.abs(norm(Math.atan2(ball.y-c.y, ball.x-c.x) - (-Math.PI/2))) > 0.3;
    thief.x = ball.x + 6; thief.y = ball.y + 6; thief.vx = 0; thief.vy = 0;
    thief.kick = true; thief.kickUsed = false; thief.trap = false;
    thief.trapUsed = false; thief.tapArmed = false;
    M.handleBallControl(w, thief, ball, false);
    o.stealableMidSwing = c.trap === false;
  }
  // ...and a player OUT OF RANGE cannot steal — the reach is a reach, not a whole pitch.
  {
    const w = stage();
    const c = w.players[0];
    const far = w.players.find(q => q.team !== c.team), ball = w.ball;
    carry(w, c, 0, 0, 10);
    far.x = ball.x + 200; far.y = ball.y + 200; far.kick = true; far.kickUsed = false;
    far.trap = false; far.trapUsed = false; far.tapArmed = false;
    M.handleBallControl(w, far, ball, false);
    o.farCannotSteal = c.trap === true;
  }
  // ⚠️ ...and a TEAM-MATE cannot. "No protection" is about the opposition: with bots on
  // both sides an unrestricted steal turned every carry into a scrum between players
  // who are supposed to be helping each other, and the bots' own difficulty ladder
  // inverted. Measured with a body on the SAME side, in exactly the position that
  // strips it when the teams differ.
  {
    const w = stage();
    const c = w.players[0];
    const mate = w.players.find(q => q !== c && q.team === c.team);
    const ball = w.ball;
    carry(w, c, 0, 0, 10);
    o.hasAMate = !!mate;
    mate.x = ball.x + 6; mate.y = ball.y + 6; mate.vx = 0; mate.vy = 0;
    mate.kick = true; mate.kickUsed = false; mate.trap = false;
    mate.trapUsed = false; mate.tapArmed = false;
    M.handleBallControl(w, mate, ball, false);
    o.mateCannotSteal = c.trap === true;
  }

  // ...and YOU do not steal from yourself, which the same branch has to not do.
  {
    const w = stage();
    const c = w.players[0], ball = w.ball;
    carry(w, c, 0, 0, 10);
    const before = c.trap;
    M.handleBallControl(w, c, ball, false);
    o.selfDidNotBreak = before === true && c.trap === true;
  }

  M.sel.mode = '1v1'; M.setMatchSeed(null);
  return o;
});

ok('the ball SWINGS round rather than snapping', r.swings,
   `only ${r.midFrames} frames part-way between start and aim — a snap arrives on frame one`);
ok('...and gets there', r.arrived, `ended at ${r.endAngle}`);
ok('...turning one way, without wobble', r.turnsOneWay, `${r.backsteps} frames went backwards`);
ok('...at the declared rate', r.rateMatches,
   `moved ${r.perFrame} rad in a frame against TRAP.spin/60 = ${(r.rateDeclared/60).toFixed(4)}`);
ok('...taking the SHORT way round the wrap', r.takesTheShortWay,
   'from 170° to −170° it went the long way — the ±π wrap is not being normalised');
ok('a release part-way round is genuinely part-way round', r.stillSwinging,
   `held at ${r.releasedFrom} with the aim at ${r.aimWas}`);
ok('...and the ball fires where you can SEE it pointing', r.firesWhereItPoints,
   `went ${r.wentTowards}, ball was at ${r.releasedFrom}`);
ok('...not along your facing', r.notAlongFacing,
   'a ball fired somewhere it visibly is not is the one thing a player cannot forgive');
ok('...and the trap is cleared', r.trapCleared);
ok('carrying works at all', r.isCarrying);
ok('ANYBODY can knock a trapped ball off you', r.trapBroken,
   'the carrier re-plants the ball every step, so a kick that does not break the trap is overwritten next frame');
ok('...and it stays broken while they hold KICK', r.staysBroken,
   'the carrier re-trapped immediately — a steal that lasts one frame is not a steal');
ok('...and the ball actually leaves', r.ballMoved && r.ballFreeAfter);
ok('a trapped ball is stealable MID-SWING too', r.stealableMidSwing,
   '"no protection" specifically rules out shielding the swing');
ok('...but not from across the pitch', r.farCannotSteal);
ok('the fixture has a team-mate to test with', r.hasAMate);
ok('...and a TEAM-MATE cannot strip you', r.mateCannotSteal,
   'an unrestricted steal turns every carry into a scrum between players on the same side, and it inverted the bot difficulty ladder');
ok('...and you do not steal from yourself', r.selfDidNotBreak);
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL trapspin\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS trapspin');
