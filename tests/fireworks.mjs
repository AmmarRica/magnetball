// FIREWORKS FOR THE GOAL THAT WINS IT — and the kickoff toss, and touch-to-start.
//
// Three small things that share one property: each is easy to write a test for that
// passes on the broken build, so each check below is the one that does not.
//
// ⚠️ FIREWORKS MUST NOT RUN ON AN ORDINARY GOAL. "Fireworks appeared" is true of a build
// that fires them every time, which is the thing this replaced — every goal got the same
// confetti and then the pitch went quiet, so the one that won the match looked exactly
// like the one that made it 1-0. The check is the DIFFERENCE between the two.
//
// ⚠️ THE KICKOFF TOSS MUST NOT COME OUT OF `w.rng`. A pinned seed has to reproduce the
// whole match, and taking a number out of the shared stream to decide a kickoff would
// shift every bot decision after it. Checked by forcing the toss both ways on one seed
// and requiring the rest of the world to be bit-identical — which a `w.rng()` draw
// cannot be.
//
// ⚠️ A TOUCH STARTS THE MATCH, and the body must never press KICK. The ball is frozen at
// kickoff, so walking into it did nothing at all: the body went through the thing it was
// standing on and the match sat waiting for a button.
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

// ================================================================ fireworks ==
const fw = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.sel.autoReplay = false; M.sel.juice = true;

  // A goal, scored by hand, at a chosen scoreline. `goalsTarget` decides whether it wins.
  const score = (target, already) => {
    M.setMatchSeed(3); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    w.goalsTarget = target; w.score = [already, 0];
    M.scoreGoal(w, 0);
    // ⚠️ Captured HERE, not after the loop. `resetKickoff` clears `finalGoal` when the
    // celebration ends, and the match-ending `endMatch` is on a wall-clock setTimeout that
    // a synchronous step loop never reaches — so sampling at the end reads `false` on a
    // perfectly good winning goal.
    const finalGoal = !!w.finalGoal;
    // Ride the celebration, which is where the shells go up.
    let peak = 0, sparks = 0;
    for (let i = 0; i < 240; i++){
      M.step(w); M.advanceFireworks(w);
      peak = Math.max(peak, w.fwT || 0);
      sparks = Math.max(sparks, M.fx.length);
    }
    return { peak: +peak.toFixed(2), sparks, finalGoal, state: w.state };
  };

  // ⚠️ THE COMPARISON IS THE CHECK. An ordinary goal (1-0 in a first-to-5) and the goal
  // that wins it (4-0 → 5) are scored the same way and differ only in whether the match
  // is over.
  o.ordinary = score(5, 0);
  o.winning  = score(5, 4);

  // ...and the show survives the whistle. `step()` keeps integrating through `over` while
  // `endRamp` winds the rate down, so the two halves of one celebration stay one thing.
  M.setMatchSeed(3); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  w.goalsTarget = 5; w.score = [4, 0];
  M.scoreGoal(w, 0);
  M.endMatch(w);
  let ranDuringOver = 0;
  for (let i = 0; i < 120; i++){
    M.step(w); M.advanceFireworks(w);
    if (w.state === 'over' && (w.fwT || 0) > 0) ranDuringOver++;
  }
  o.ranDuringOver = ranDuringOver;

  // ⚠️ CLEARED on a restart, so no match inherits an unfinished show.
  M.startFireworks(w);
  o.armed = (w.fwT || 0) > 0;
  M.resetKickoff(w);
  o.clearedByKickoff = (w.fwT || 0) === 0;

  // ⚠️ SPAWNED FROM THE STEP LOOP, off `fxRnd` — never from a draw (a 144Hz screen would
  // run the show 2.4x fast; the trails rule) and never from `w.rng` (how many sparks flew
  // would then perturb every later bot decision). Both are checked at the source, because
  // neither is visible from outside.
  const src = M.advanceFireworks.toString();
  o.usesFxRnd = /fxRnd\(/.test(src);
  o.noWorldRng = !/w\.rng|\brnd\(/.test(src.replace(/fxRnd\(/g, ''));
  o.notInADraw = !/advanceFireworks/.test(M.render.toString());
  return o;
});

// ============================================================ the kickoff toss ==
const toss = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // Deterministic, and it varies: a toss that always answers the same is not a toss.
  const seeds = Array.from({ length: 40 }, (_, i) => i * 7 + 1);
  const draws = seeds.map(s => M.kickoffToss(s));
  o.zeros = draws.filter(d => d === 0).length;
  o.ones  = draws.filter(d => d === 1).length;
  o.onlyTeams = draws.every(d => d === 0 || d === 1);
  o.deterministic = seeds.every(s => M.kickoffToss(s) === M.kickoffToss(s));

  // ⚠️ IT MUST NOT TOUCH `w.rng`. Forced both ways on ONE seed, the rest of the match has
  // to be bit-identical — which it cannot be if the toss took a number out of the stream
  // the bots read. This is the assertion that a "the toss varies" check cannot make.
  const hash = kick => {
    M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
    M.setMatchSeed(21); M.startMatch();
    const w = M.world;
    w.kickTeam = kick;                       // the only difference
    w.state = 'play'; w.stateT = 2;
    let h = 0;
    for (let i = 0; i < 900; i++){
      M.step(w);
      for (const q of w.players) h = (h * 31 + Math.round(q.x * 1000) + Math.round(q.y * 1000)) | 0;
    }
    return h;
  };
  o.hashA = hash(0); o.hashB = hash(1);
  o.streamUntouched = o.hashA === o.hashB;

  // ...and a real match kicks off from the toss rather than from a constant.
  const kicked = [];
  for (const s of [1, 2, 3, 4, 5, 6, 7, 8]){
    M.setMatchSeed(s); M.startMatch();
    kicked.push(M.world.kickTeam);
  }
  o.matchKickTeams = kicked;
  o.matchVaries = new Set(kicked).size === 2;
  return o;
});

// ========================================================== a touch starts it ==
const touch = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
  M.setMatchSeed(9); M.startMatch();
  const w = M.world;
  w.state = 'kickoff'; w.stateT = 0.9;          // past the settling period
  const me = w.players[0];
  w.players[1].x = 9e4; w.players[1].y = 9e4;
  // ⚠️ KICK IS NEVER PRESSED. That is the whole point — the old rule was a button press,
  // and the ball being frozen meant walking into it did nothing at all.
  M.pads.p1.kick = false;
  me.x = w.ball.x; me.y = w.ball.y + me.r + w.ball.r + M.KICKOFF_TOUCH * 0.5;
  o.startedOnTouch = false;
  for (let i = 0; i < 60; i++){ M.step(w); if (w.state === 'play'){ o.startedOnTouch = true; break; } }

  // ...and standing WELL AWAY does not start it, or the check above means nothing.
  M.setMatchSeed(9); M.startMatch();
  const w2 = M.world; w2.state = 'kickoff'; w2.stateT = 0.9;
  w2.players.forEach(q => { q.x = 9e4; q.y = 9e4; });
  M.pads.p1.kick = false;
  o.stayedWaiting = true;
  for (let i = 0; i < 60; i++){ M.step(w2); if (w2.state === 'play'){ o.stayedWaiting = false; break; } }
  o.margin = M.KICKOFF_TOUCH;
  M.setMatchSeed(null);
  return o;
});

await p.close();

// -------------------------------------------------------------------- report --
ok('the winning goal sets off fireworks', fw.winning.peak > 0 && fw.winning.finalGoal,
   JSON.stringify(fw.winning));
ok('...and an ORDINARY goal does NOT', fw.ordinary.peak === 0 && !fw.ordinary.finalGoal,
   `${JSON.stringify(fw.ordinary)} — "fireworks appeared" is true of a build that fires them on every goal, which is exactly what this replaced`);
ok('...with visibly more going on', fw.winning.sparks > fw.ordinary.sparks + 20,
   `${fw.ordinary.sparks} particles on an ordinary goal against ${fw.winning.sparks} on the winner`);
ok('the show carries through the whistle', fw.ranDuringOver > 10,
   `${fw.ranDuringOver} steps of it during 'over' — step() keeps integrating while endRamp winds the rate down, so the celebration and the wind-down are one thing`);
ok('an unfinished show never survives a kickoff', fw.armed && fw.clearedByKickoff);
ok('shells are spawned off fxRnd, not the sim stream', fw.usesFxRnd && fw.noWorldRng,
   'drawing from w.rng would make how many sparks flew perturb every later bot decision');
ok('...and not from a draw', fw.notInADraw,
   'a 144Hz screen would run the whole show 2.4x fast — the trails rule');

ok('the toss answers a team', toss.onlyTeams && toss.deterministic);
ok('...and both of them', toss.zeros >= 12 && toss.ones >= 12,
   `${toss.zeros} / ${toss.ones} over 40 seeds`);
ok('...and a real match uses it', toss.matchVaries,
   `${JSON.stringify(toss.matchKickTeams)} — it was hard-coded to team 1 for the first whistle of every match ever played`);
ok('THE TOSS TAKES NOTHING OUT OF w.rng', toss.streamUntouched,
   `world hashes ${toss.hashA} vs ${toss.hashB} with the toss forced each way on one seed — a pinned seed has to reproduce the whole match, and a draw from the shared stream would shift every bot decision after it`);

ok('a TOUCH starts the match', touch.startedOnTouch,
   `KICK was never pressed and the margin is ${touch.margin} — the ball is frozen at kickoff, so walking into it used to do nothing at all`);
ok('...and standing away does not', touch.stayedWaiting,
   'without this the touch check passes on a build that starts the match on its own');

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ fw, toss, touch }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL fireworks\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS fireworks');
