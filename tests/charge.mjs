// HOLD TO KICK HARDER — the wind-up, as a control.
//
// It has always been in the physics at a fixed 0.6s for up to +90%, and was the one part
// of the kick the menu never admitted to.
//
// ⚠️ THE POINT OF THIS SUITE IS THE SIX CALL SITES. Each of them used to carry its own
// copy of `1 + (chargeT / CHARGE.max) * CHARGE.bonus` — a trap release, a one-touch, a
// snail boot, a body check and two draws — so a switch that had to reach all six would
// very plausibly have reached five, and the one left behind would keep charging
// invisibly. "The setting exists and the number changes" is true of that build too, so
// this drives every path that fires a ball and compares it charged against uncharged.
//
// Also held:
//   - TWO controls, not one: a slider with an "off" at one end cannot say "never charge",
//     because zero seconds means INSTANT full power, which is the opposite;
//   - `CHARGE.max` is the DEFAULT the slider is born at, not the value the game reads —
//     `chargeSecs()` is what the physics and the wind-up ring both go through;
//   - the wind-up ring does not promise power that is not coming;
//   - the dial really changes how long the wind-up takes, measured in the sim.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const o = await p.evaluate(() => {
  const M = window.__magnet, o = {};

  // ------------------------------------------------------- the two controls --
  o.defaultOn   = M.defaultSel().charge === 'on';
  o.defaultMs   = M.defaultSel().chargeMs;
  o.bornAtConst = M.defaultSel().chargeMs === M.CHARGE.max * 1000;
  o.optCount    = Object.keys(M.CHARGEOPT).length;
  // ⚠️ `chargeSecs()` is the reader, and it CLAMPS — a value synced in from /settings or
  // left by an older build must not push the wind-up out of range.
  M.sel.chargeMs = 999999; o.clampHigh = M.chargeSecs();
  M.sel.chargeMs = -5;     o.clampLow  = M.chargeSecs();
  M.sel.chargeMs = null;   o.nullFallsBack = M.chargeSecs() === M.CHARGE.max;
  M.sel.chargeMs = 600; M.sel.charge = 'on';

  // ⚠️ OFF is not "zero seconds". Zero would be INSTANT full power, the opposite of what
  // the switch is for — so the switch has to exist separately from the slider.
  const full = { chargeT: M.chargeSecs() };
  o.mulCharged = M.chargeMul(full);
  M.sel.charge = 'off';
  o.mulOff = M.chargeMul(full);
  o.fracOff = M.chargeFrac(full);
  M.sel.charge = 'on';
  // A short dial reaches full power sooner: the same held time is worth more.
  M.sel.chargeMs = 1800; const slow = M.chargeMul({ chargeT: 0.6 });
  M.sel.chargeMs = 300;  const fast = M.chargeMul({ chargeT: 0.6 });
  o.dialMatters = fast > slow + 0.3;
  o.slowMul = +slow.toFixed(3); o.fastMul = +fast.toFixed(3);
  M.sel.chargeMs = 600;

  // ============================================================================
  //  THE SIX CALL SITES
  // ============================================================================
  // Each one is driven twice — wound up, and not — with everything else identical, and
  // the charged shot has to travel faster. Then the whole thing again with the switch
  // OFF, where the two must come out the SAME: that is the half that catches a site
  // still carrying its own copy of the formula.
  const speedAfter = (setup, held) => {
    M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
    M.setMatchSeed(4); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    const me = w.players[0];
    w.players[1].x = 9e4; w.players[1].y = 9e4;      // the opponent is not part of this
    return setup(w, me, held);
  };

  // 1) TRAP RELEASE — hold KICK to carry, let go to shoot.
  const trapShot = held => speedAfter((w, me) => {
    me.x = 0; me.y = 100; me.vx = 0; me.vy = 0; me.faceX = 0; me.faceY = -1;
    w.ball.x = 0; w.ball.y = 100 - (me.r + w.ball.r + 2); w.ball.vx = 0; w.ball.vy = 0;
    me.trap = true; me.trapAng = -Math.PI / 2; me.chargeT = held; me.kick = true;
    M.releaseTrap(w, me, w.ball);
    return Math.hypot(w.ball.vx, w.ball.vy);
  });

  // 2) ONE-TOUCH — the instant kick, with trapping switched off.
  const oneTouch = held => speedAfter((w, me) => {
    // ⚠️ `trapOff` is captured onto the world at startMatch, so setting `sel` after the
    // whistle changes nothing — the body traps instead of shooting and both readings come
    // out at zero, which looks exactly like "the wind-up does nothing".
    w.trapOff = true;
    me.x = 0; me.y = 100; me.vx = 0; me.vy = 0; me.faceX = 0; me.faceY = -1;
    w.ball.x = 0; w.ball.y = 100 - (me.r + w.ball.r + 1); w.ball.vx = 0; w.ball.vy = 0;
    me.chargeT = held; me.kick = true; me.kickUsed = false; me.trapUsed = false;
    M.handleBallControl(w, me, w.ball, false);
    return Math.hypot(w.ball.vx, w.ball.vy);
  });

  // 3) BODY CHECK — the shove, which carries its own share of the wind-up.
  const bodyCheck = held => speedAfter((w, me) => {
    // ⚠️ The shove has its own setting and its own once-per-press latch.
    M.sel.kickPush = 'on';
    const foe = w.players[1];
    me._pushUsed = false; me._pushCool = 0;
    foe.x = 0; foe.y = 100 - (me.r * 2 + 1); foe.vx = 0; foe.vy = 0;
    me.x = 0; me.y = 100; me.vx = 0; me.vy = -3; me.faceX = 0; me.faceY = -1;
    me.chargeT = held; me.kick = true;
    M.handleKickPush(w, me);
    return Math.hypot(foe.vx, foe.vy);
  });

  // 4) THE SNAIL — kickable, and heavy, and it takes the wind-up too.
  const snailBoot = held => {
    M.sel.mode = 'kq'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
    M.setMatchSeed(4); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    const sn = (w.extraBalls || []).find(x => x.isSnail);
    if (!sn) return null;
    const me = w.players[0];
    sn.x = 0; sn.y = 0; sn.vx = 0; sn.vy = 0;
    me.x = 0; me.y = me.r + sn.r + 1; me.vx = 0; me.vy = 0; me.faceX = 0; me.faceY = -1;
    me.chargeT = held; me.kick = true; me.snailKicked = false;
    M.handleSnailKick(w, me, false);
    return Math.hypot(sn.vx, sn.vy);
  };

  const sites = { trapShot, oneTouch, bodyCheck, snailBoot };
  const FULL = M.chargeSecs();
  o.on = {}; o.off = {};
  M.sel.charge = 'on';
  for (const k of Object.keys(sites)) o.on[k] = { cold: sites[k](0), hot: sites[k](FULL) };
  M.sel.charge = 'off';
  for (const k of Object.keys(sites)) o.off[k] = { cold: sites[k](0), hot: sites[k](FULL) };
  M.sel.charge = 'on';

  // 5 & 6) THE TWO DRAWS. Both go through `chargeFrac`, so with the switch off the ring
  // must not appear at all — a ring closing round a player who is holding KICK to TRAP
  // promises power that is not coming.
  // ⚠️ The ring is painted by `drawOneDisc`, which is where the per-body drawing lives —
  // reading `drawDiscs` finds the loop and none of the drawing, so the gate check passed
  // over an ungated ring.
  o.ringSrc = (M.drawOneDisc || M.drawDiscs).toString();
  o.ringGated = /chargeOn\(\)\s*&&/.test(o.ringSrc);
  o.noRawFormula = !/chargeT\s*\/\s*CHARGE\.max/.test(o.ringSrc);

  // ⚠️ And the file-wide check that makes the four measurements above complete: NOBODY
  // still carries their own copy of the formula. A site that does would pass a
  // charged-vs-uncharged comparison and ignore the switch entirely.
  const srcs = [M.releaseTrap, M.handleBallControl, M.handleKickPush, M.handleSnailKick,
                M.drawDiscs, M.drawOneDisc, M.step].filter(Boolean)
                .map(f => f.toString()).join('\n');
  o.noCopies = !/chargeT\s*\/\s*CHARGE\.max/.test(srcs);
  // ...and the winding-up itself is capped by the DIAL, not by the constant.
  o.windUpUsesDial = /Math\.min\(chargeSecs\(\)/.test(M.step.toString());

  // ---------------------------------------- the wind-up really takes that long --
  // Measured in the sim rather than read off `sel`: hold KICK and count the steps until
  // the charge tops out.
  const stepsToFull = ms => {
    M.sel.chargeMs = ms;
    M.sel.mode = '1v1'; M.sel.lobby = 'off';
    M.setMatchSeed(4); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    const me = w.players[0];
    me.x = 0; me.y = 300; w.ball.x = 0; w.ball.y = -300;    // nowhere near the ball
    M.pads.p1.kick = true;
    let n = 0;
    for (; n < 400; n++){ M.step(w); if (me.chargeT >= M.chargeSecs() - 1e-6) break; }
    M.pads.p1.kick = false;
    return n;
  };
  o.steps300  = stepsToFull(300);
  o.steps1800 = stepsToFull(1800);
  M.sel.chargeMs = 600;
  M.setMatchSeed(null);
  return o;
});

await p.close();

// -------------------------------------------------------------------- report --
ok('there are TWO controls', o.optCount === 2 && o.defaultOn,
   `${o.optCount} states — "how long" and "whether" are different questions, and a slider with an off at one end cannot say the second: zero seconds means INSTANT full power, the opposite`);
ok('the slider is born at CHARGE.max', o.bornAtConst,
   `${o.defaultMs}ms against ${o.defaultMs} — the constant is the default the dial starts at, not the value the game reads`);
ok('chargeSecs() clamps and defaults', o.clampHigh <= 2 && o.clampLow >= 0.1 && o.nullFallsBack,
   JSON.stringify({ high: o.clampHigh, low: o.clampLow, nul: o.nullFallsBack }));
ok('a wound-up kick is worth more', o.mulCharged > 1.5, `${o.mulCharged}×`);
ok('...and OFF is exactly 1', o.mulOff === 1 && o.fracOff === 0,
   `${o.mulOff}× — off must be the normal kick, not a fast charge`);
ok('the dial changes what a held second is worth', o.dialMatters,
   `0.6s held is ${o.slowMul}× on a 1.8s dial and ${o.fastMul}× on a 0.3s one`);

for (const [k, label] of [['trapShot', 'a trap release'], ['oneTouch', 'a one-touch'],
                          ['bodyCheck', 'a body check'], ['snailBoot', 'booting the snail']]){
  const on = o.on[k], off = o.off[k];
  if (on.cold === null){ ok(`${label} was reachable`, false, 'setup did not produce the body'); continue; }
  ok(`${label} is harder when wound up`, on.hot > on.cold * 1.2,
     `${on.cold.toFixed(2)} cold against ${on.hot.toFixed(2)} charged`);
  ok(`...and IGNORES the wind-up when the switch is off`, Math.abs(off.hot - off.cold) < 1e-6,
     `${off.cold.toFixed(3)} against ${off.hot.toFixed(3)} with charging OFF — this is the half that catches a call site still carrying its own copy of the formula, because the charged-vs-uncharged check above passes on that build too`);
}

ok('no call site carries its own copy of the formula', o.noCopies,
   'six sites each had one, so a switch that had to reach all six would have reached five and the one left behind would keep charging invisibly');
ok('the wind-up ring is gated on the switch', o.ringGated,
   'with charging off the ring would still close round a player holding KICK to trap, promising power that is not coming');
ok('...and neither draw carries the raw formula', o.noRawFormula);
ok('the wind-up itself is capped by the DIAL', o.windUpUsesDial,
   'capping chargeT at CHARGE.max would let the dial move the multiplier while the charge still topped out at 0.6s');

ok('a short dial tops out sooner, measured in the sim', o.steps300 < o.steps1800 &&
   o.steps300 > 0 && o.steps1800 > o.steps300 * 3,
   `${o.steps300} steps at 300ms against ${o.steps1800} at 1800ms — read off the world, not off sel`);

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify(o, null, 1));
await b.close();
if (fails.length){ console.log('FAIL charge\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS charge');
