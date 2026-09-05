// WHAT THE GAME FEELS LIKE OUT OF THE BOX — the freeze-frame off, and both float dials down.
//
// Three shipped defaults changed together, all reported as one complaint about how the game
// moves: a freeze-frame that "looks like it is lagging", a ball that floats, and a player
// that floats. Measured on the build before this — 2v2, one minute of real bot match:
//   hit stop     fired 6 times, freezing 12 whole frames of the loop
//   player float 1.223s to lose 95% of its speed
//   ball float   6.216s claimed, 5.767s measured against the real step loop
//
// ⚠️ EVERY CLAIM HERE IS PAIRED WITH A CONTROL, because each one is satisfied by a build
// that deleted the feature outright rather than changing which default you get:
//   "no freeze"      ← also true if the dial is dead. So the dial is turned UP and the
//                      freeze has to come back.
//   "stops sooner"   ← also true of a build that ignores the dial. So the OLD value is put
//                      back and the old time has to come back.
//
// ⚠️ WHAT THIS SUITE CANNOT SEE, WRITTEN DOWN RATHER THAN PAPERED OVER. Nine sabotages of
// the defaults, the dial, the preset coupling and all three fold guards are each caught by
// their own check here. The tenth is NOT: removing the fold's "this device already has
// settings" guard passes everything, because with today's values neither fold branch
// matches a fresh install and `saveSel()` is never reached. That guard is a backstop
// against a pairing — an old value coming BACK as a shipped default — and the other half
// of that pairing (S1) is caught. It was live five minutes before it was written: the fold
// originally fired on a fresh install, wrote `magnetball.sel`, and would have made the
// first-run lineup dead code on the very first frame.
//
// ⚠️ THE FLOAT IS MEASURED AGAINST THE REAL STEP LOOP, never `stopSecs`' own arithmetic —
// a readout verified against its own formula proves only that the formula is idempotent.
// The coast harness is `surfacefeel`', including its two recorded traps: the position is
// re-pinned every step (or the body leaves the court and the run measures a WALL) and every
// OTHER body is re-parked every step (or `integrate`'s clamp drags the bots back and they
// chase the pinned ball, and the block measures the AI instead of the damping).
import { chromium, LAUNCH } from './_browser.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let bad = 0;
const ok = (name, cond, note) => { if (!cond){ bad++; console.log('  ' + name + (note ? ' — ' + note : '')); } };

const b = await chromium.launch(LAUNCH);
const errs = [];
async function open(seed){
  const p = await b.newPage({ viewport:{width:1280,height:800} });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
  if (seed) await p.addInitScript(seed);
  await p.goto('file://' + join(ROOT, 'index.html'));
  await p.waitForTimeout(500);
  return p;
}

// The values this build ships, and the ones it shipped before. The OLD pair is written out
// because it is history — nothing in the game knows it any more and nothing can derive it.
const WAS = { hitStop: 2, pdamp: 960, bdamp: 992 };

// ---- 1. a fresh install ----------------------------------------------------------------
{
  const p = await open();
  const r = await p.evaluate(async () => {
    const M = window.__magnet; const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
    // ⚠️ **READ THE DEFAULT ITSELF, not the live `sel`, and a sabotage proved why.**
    // Reverting the shipped value was NOT CAUGHT when this read `sel.hitStop`: the fold
    // below matched the old value on a fresh install and quietly moved it, so the check
    // was measuring the fold rather than what the game ships with. `defaultSel()` is the
    // one thing no fold can reach. (It also exposed the fold writing `magnetball.sel` on a
    // first run, which is how `isFirstRun` detects one — fixed in the same pass.)
    o.hitStop = M.defaultSel().hitStop;
    o.frames = M.hitStopFrames();
    o.pdamp = M.defaultSel().feel.pdamp; o.bdamp = M.defaultSel().feel.bdamp;
    o.liveHitStop = M.sel.hitStop;
    o.firstRunIntact = localStorage.getItem('magnetball.sel') === null;
    // ⚠️ The shipped feel MUST equal FEEL_PRESETS.pro field for field, or the Game Feel
    // card comes up with NEITHER preset tile selected on a game nobody has touched — which
    // reads as "somebody has been in here". `presetMatches` is what the card itself asks.
    o.proSelected = M.presetMatches(M.FEEL_PRESETS.pro);
    o.proPdamp = M.FEEL_PRESETS.pro.pdamp; o.proBdamp = M.FEEL_PRESETS.pro.bdamp;
    // ⚠️ The unset fallback has to agree with the shipped default: a partial `sel` out of an
    // imported save (`applySaveDoc` validates nothing) took the OTHER number, and two
    // answers for one default is the drift this repo keeps recording.
    const keep = M.sel.hitStop; M.sel.hitStop = undefined;
    o.unsetFallback = M.hitStopFrames(); M.sel.hitStop = keep;

    // ---- the freeze, over a real match, at the shipped default and turned up ----------
    const freezeRun = (dial) => {
      M.sel.hitStop = dial; M.sel.autoReplay = false; M.sel.lobby = 'off';
      M.sel.mode = '2v2'; M.sel.length = '5';
      M.setMatchSeed(7); M.startMatch({ lobby:false });
      const w = M.world; w.state = 'play'; w.stateT = 2;
      let fires = 0, frames = 0;
      for (let i = 0; i < 3600; i++){
        M.hitStop = 0; M.step(w);
        if (M.hitStop > 0){ fires++; frames += M.hitStop; }
      }
      return { fires, frames };
    };
    o.shipped = freezeRun(M.sel.hitStop);
    o.turnedUp = freezeRun(6);
    M.sel.hitStop = 0;
    await wait(10);
    return o;
  });
  await p.close();
  console.log('fresh install   hitStop ' + r.hitStop + ' (was ' + WAS.hitStop + ')  ' +
              'pdamp ' + r.pdamp + ' (was ' + WAS.pdamp + ')  bdamp ' + r.bdamp + ' (was ' + WAS.bdamp + ')');
  console.log('freeze/min      shipped ' + JSON.stringify(r.shipped) + '   dial at 6 ' + JSON.stringify(r.turnedUp));

  ok('the freeze-frame ships OFF', r.hitStop === 0 && r.frames === 0 && r.liveHitStop === 0,
     'default ' + r.hitStop + ', live ' + r.liveHitStop);
  // ⚠️ The fold must not have run at all here: writing `magnetball.sel` during the
  // bootstrap makes the first-run lineup dead code on the very first frame.
  ok('a fresh install is not folded, so first-run survives', r.firstRunIntact,
     'magnetball.sel was written before anybody changed a setting');
  ok('...and an unset dial agrees with it', r.unsetFallback === 0, 'fallback ' + r.unsetFallback);
  ok('a whole match freezes not one frame', r.shipped.frames === 0, JSON.stringify(r.shipped));
  // THE CONTROL. Without it, "no freeze" is equally true of a build that deleted hit stop.
  ok('...and the dial still brings it back', r.turnedUp.fires > 0 && r.turnedUp.frames > 0,
     JSON.stringify(r.turnedUp) + ' — this is a default that moved, not a feature removed');
  ok('both float dials came down', r.pdamp < WAS.pdamp && r.bdamp < WAS.bdamp,
     'pdamp ' + r.pdamp + ' bdamp ' + r.bdamp);
  ok('the shipped feel IS the Pro preset', r.proSelected &&
     r.proPdamp === r.pdamp && r.proBdamp === r.bdamp,
     JSON.stringify({ selected: r.proSelected, pro: [r.proPdamp, r.proBdamp], sel: [r.pdamp, r.bdamp] }));
}

// ---- 2. how long things actually take to stop, on the real loop ------------------------
{
  const p = await open();
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    const coast = (who, dampMilli) => {
      M.sel.pitch = 'normal'; M.sel.mode = '1v1'; M.sel.kickoffRule = 'off'; M.sel.sprint = 'off';
      M.sel.feel = who === 'ball' ? { bdamp: dampMilli } : { pdamp: dampMilli };
      M.setMatchSeed(5); M.startMatch();
      const w = M.world; w.state = 'play'; w.stateT = 2;
      w.players.forEach((q, i) => { q.x = (i%2?1:-1) * 9e3; q.y = 9e3; q.vx = q.vy = 0;
                                    q.inX = 0; q.inY = 0; q.kick = false; });
      const body = who === 'ball' ? w.ball : w.players[0];
      body.x = 0; body.y = 0;
      if (who !== 'ball'){ w.ball.x = 9e3; w.ball.y = 9e3; w.ball.vx = 0; w.ball.vy = 0; }
      body.vx = 8; body.vy = 0;
      const v0 = Math.hypot(body.vx, body.vy), px = body.x, py = body.y;
      let n = 0;
      while (n < 4000 && Math.hypot(body.vx, body.vy) > v0 * 0.05){
        M.step(w); n++;
        for (const q of w.players){
          if (q === body) continue;
          q.x = 9e3; q.y = 9e3; q.vx = 0; q.vy = 0; q.inX = 0; q.inY = 0; q.kick = false;
        }
        if (who !== 'ball'){ w.ball.x = 9e3; w.ball.y = 9e3; w.ball.vx = 0; w.ball.vy = 0; }
        body.x = px; body.y = py;
      }
      return +(n / 60).toFixed(3);
    };
    // ⚠️ **TOP SPEED, and this is the check that catches a float change slowing the
    // player.** A body settles at `v = a·d/(1−d)` under full stick, so `pdamp` sets the
    // COAST and the TOP SPEED with one number: dropping it to kill the float and stopping
    // there made the player 35% slower (2.88 -> 1.88), which nobody asked for.
    const topSpeed = (accel, pdamp) => {
      M.sel.pitch='normal'; M.sel.mode='1v1'; M.sel.kickoffRule='off'; M.sel.sprint='off';
      M.sel.feel = { accel, pdamp };
      M.setMatchSeed(5); M.startMatch();
      const w = M.world; w.state='play'; w.stateT=2;
      const me = w.players[0];
      w.ball.x=9e3; w.ball.y=9e3; w.ball.vx=w.ball.vy=0;
      let best = 0;
      for (let i=0;i<400;i++){
        M.pads.p1.dx=1; M.pads.p1.dy=0;
        for (const q of w.players) if (q!==me){ q.x=9e3; q.y=9e3; q.vx=q.vy=0; }
        w.ball.x=9e3; w.ball.y=9e3;
        me.x=0; me.y=0;                       // pinned: the velocity is what is measured
        M.step(w);
        best = Math.max(best, Math.hypot(me.vx, me.vy));
      }
      M.pads.p1.dx=0;
      return +best.toFixed(2);
    };
    const d = M.defaultSel().feel;
    return {
      playerNow: coast('player', d.pdamp), playerWas: coast('player', 960),
      ballNow:   coast('ball',   d.bdamp), ballWas:   coast('ball',   992),
      topNow:    topSpeed(d.accel, d.pdamp), topWas: topSpeed(12, 960),
    };
  });
  await p.close();
  const cut = (a, b2) => Math.round((1 - a / b2) * 100);
  console.log('player float    ' + r.playerWas + 's -> ' + r.playerNow + 's  (-' + cut(r.playerNow, r.playerWas) + '%)');
  console.log('ball float      ' + r.ballWas + 's -> ' + r.ballNow + 's  (-' + cut(r.ballNow, r.ballWas) + '%)');

  ok('the player stops sooner than it did', r.playerNow < r.playerWas * 0.9,
     r.playerNow + 's against ' + r.playerWas + 's');
  ok('the ball stops sooner than it did', r.ballNow < r.ballWas * 0.9,
     r.ballNow + 's against ' + r.ballWas + 's');
  // THE CONTROL, in the same run: the old numbers still produce the old times, so what
  // moved is the shipped VALUE and not the physics reading a different dial.
  ok('...and the old values still give the old times',
     Math.abs(r.playerWas - 1.22) < 0.25 && Math.abs(r.ballWas - 5.77) < 0.6,
     'player ' + r.playerWas + 's, ball ' + r.ballWas + 's');
  // A ball that never stops is not "less floaty", it is a different bug.
  ok('the ball still coasts rather than stopping dead', r.ballNow > 1.0, r.ballNow + 's');
  // ⚠️ **AND THE PLAYER IS NOT SLOWER, which is the whole reason `accel` moved with
  // `pdamp`.** "Floats less" is a request about the COAST, not about the top speed, and
  // one number sets both — so without this the fix silently takes a third of the pace off
  // every player on the pitch.
  console.log('top speed       ' + r.topWas + ' -> ' + r.topNow +
              '  (' + (r.topNow >= r.topWas ? '+' : '') + Math.round((r.topNow/r.topWas-1)*100) + '%)');
  ok('the player is no slower than it was', Math.abs(r.topNow / r.topWas - 1) < 0.06,
     'top speed ' + r.topWas + ' -> ' + r.topNow + ' — lowering the float without raising the ' +
     'acceleration takes a third of the pace off, which is not what was asked for');
}

// ---- 3. a device already carrying the old feel is moved on, ONCE -----------------------
// ⚠️ WITHOUT THE FOLD THE CHANGE REACHES NOBODY WHO HAS EVER OPENED THE MENU, which
// includes the person who reported it: a factory default only ever meets a fresh install.
{
  const OLD = JSON.stringify({ trapOff:true, magnet:0, hitStop:2,
    feel:{ accel:12, pdamp:960, ballcap:46, kick:55, bdamp:992, trap:50 } });
  const p = await open(`localStorage.setItem('magnetball.sel', ${JSON.stringify(OLD)})`);
  const r = await p.evaluate(() => ({
    hitStop: window.__magnet.sel.hitStop, accel: window.__magnet.sel.feel.accel,
    pdamp: window.__magnet.sel.feel.pdamp, bdamp: window.__magnet.sel.feel.bdamp,
    stamped: localStorage.getItem('magnetball.feelfold') === '1',
    written: (JSON.parse(localStorage.getItem('magnetball.sel')||'{}').feel||{}).pdamp,
  }));
  await p.close();
  console.log('old install     -> hitStop ' + r.hitStop + ' pdamp ' + r.pdamp + ' bdamp ' + r.bdamp);
  ok('an untouched old install is moved on', r.hitStop === 0 && r.pdamp === 940 && r.bdamp === 988,
     JSON.stringify(r));
  // ⚠️ `accel` travels with `pdamp` or the fold ships the slower player to exactly the
  // devices that were playing happily before.
  ok('...and the acceleration travels with the damping', r.accel === 18, 'accel ' + r.accel);
  // ⚠️ Written to storage, not only to memory: without the save the next launch — its key
  // now stamped — would hand the old feel straight back.
  ok('...and the move is SAVED, not just in memory', r.written === 940, 'stored pdamp ' + r.written);
  ok('...and the key is stamped so it is one-shot', r.stamped);
}

// ---- 4. ...and a device that CHOSE something keeps it ----------------------------------
// A fold that overwrites a deliberate choice is not a fix, it is a setting changing behind
// somebody's back. Both halves are guarded separately, so this pins both.
{
  const MINE = JSON.stringify({ trapOff:true, magnet:0, hitStop:9,
    feel:{ accel:12, pdamp:880, ballcap:46, kick:55, bdamp:992, trap:50 } });
  const p = await open(`localStorage.setItem('magnetball.sel', ${JSON.stringify(MINE)})`);
  const r = await p.evaluate(() => ({
    hitStop: window.__magnet.sel.hitStop,
    pdamp: window.__magnet.sel.feel.pdamp, bdamp: window.__magnet.sel.feel.bdamp,
  }));
  await p.close();
  console.log('tuned install   -> hitStop ' + r.hitStop + ' pdamp ' + r.pdamp + ' bdamp ' + r.bdamp);
  ok('a chosen hit stop survives the fold', r.hitStop === 9, 'got ' + r.hitStop);
  ok('a tuned feel survives the fold untouched', r.pdamp === 880 && r.bdamp === 992,
     JSON.stringify(r) + ' — presetMatches must refuse a feel that is not the old preset exactly');
}

// ---- 5. and it does not run twice ------------------------------------------------------
{
  const seeded = JSON.stringify({ trapOff:true, magnet:0, hitStop:2,
    feel:{ accel:12, pdamp:960, ballcap:46, kick:55, bdamp:992, trap:50 } });
  const p = await open(`localStorage.setItem('magnetball.sel', ${JSON.stringify(seeded)});` +
                       `localStorage.setItem('magnetball.feelfold','1')`);
  const r = await p.evaluate(() => ({
    hitStop: window.__magnet.sel.hitStop, pdamp: window.__magnet.sel.feel.pdamp,
  }));
  await p.close();
  ok('a stamped device is left exactly as it is', r.hitStop === 2 && r.pdamp === 960,
     JSON.stringify(r) + ' — one-shot, or somebody who sets the old feel back on purpose is folded out of it the next morning');
}

ok('no page errors', errs.length === 0, errs.slice(0,3).join(' | '));
await b.close();
console.log(bad ? '\nFAIL shippedfeel' : '\nPASS shippedfeel');
process.exit(bad ? 1 : 0);
