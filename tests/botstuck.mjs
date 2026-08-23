// A BALL RESTING ON THE BOARDS USED TO FREEZE THE CHASER FOR EVER.
//
// ⚠️ IT IS A DEAD END, NOT A HICCUP, and that distinction is the whole design of the fix.
// The strike waypoint sits behind the ball along the aim; for a ball on the touchline that
// point is outside the pitch, so `runBot`'s clamp drags it back to a spot the bot is
// already standing on. `botArrive` then reports "arrived" and writes a ZERO stick, while
// `align` (0.66 in the measured case) never reaches `strikeEnter` (0.85), so the bot can
// never commit to a strike either. Measured before the fix: 23 of 28 resting places round
// the boundary froze the chaser for 877 of 900 steps with the ball untouched.
//
// ⚠️ RANDOMNESS WOULD NOT HAVE FIXED IT. The bot sits in a stable equilibrium — a nudge is
// walked straight back out of — so a jitter would have made the freeze intermittent rather
// than gone, and intermittent is the version that cannot be tested. What breaks it is
// noticing that nothing is happening and doing what a person does with a ball pinned on
// the line: barge in and hit it off the boards.
//
// ⚠️ THE METRIC IS TIME TO FREE THE BALL, never "the bot stood still". Once the stalemate
// breaks the match carries on, and a bot legitimately stands still plenty in ordinary
// play — measuring stillness after the fix measures football, and the first version of
// this suite reported 474 still frames on a perfectly good build.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };
const p = await b.newPage({ viewport: { width: 900, height: 900 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|ERR_TUNNEL/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

// ================================ every resting place round the boundary ==
const sweep = await p.evaluate(() => {
  const M = window.__magnet, rows = [];
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(4); M.startMatch();
  const w0 = M.world;
  const hw = w0.bounds.halfW, hl = w0.bounds.halfL, br = w0.ball.r;
  const spots = [];
  for (const sy of [-1, 1]) for (const fx of [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9])
    spots.push({ tag: `Y${sy > 0 ? '+' : '-'}@${fx}`, x: hw*fx, y: sy*(hl - br - 0.5) });
  for (const sx of [-1, 1]) for (const fy of [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9])
    spots.push({ tag: `X${sx > 0 ? '+' : '-'}@${fy}`, x: sx*(hw - br - 0.5), y: hl*fy });
  for (const s of spots){
    M.setMatchSeed(4); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    const me = w.players[0], bot = w.players.find(q => q.ctrl === 'bot');
    // ⚠️ The human is parked and never kicks, so everything that happens is the bot's,
    // and anything that lands in the BOT's own net is an own goal.
    me.x = 0; me.y = 0; me.vx = me.vy = 0;
    w.ball.x = s.x; w.ball.y = s.y; w.ball.vx = w.ball.vy = 0;
    bot.x = s.x - Math.sign(s.x)*26; bot.y = s.y - Math.sign(s.y)*26; bot.vx = bot.vy = 0;
    const b0 = { x: w.ball.x, y: w.ball.y };
    let freedAt = -1, worstOut = 0;
    for (let i = 0; i < 900; i++){
      M.step(w);
      if (freedAt < 0 && Math.hypot(w.ball.x - b0.x, w.ball.y - b0.y) > 20) freedAt = i;
      // ⚠️ The escape skips the target clamp, so this is where a body leaving the VIEW
      // would show up. `integrate` still holds everything to bounds + 20.
      worstOut = Math.max(worstOut, Math.abs(bot.x) - hw, Math.abs(bot.y) - hl);
    }
    rows.push({ tag: s.tag, freedAt, own: w.score[bot.team === 1 ? 0 : 1],
                out: +worstOut.toFixed(1) });
  }
  const freed = rows.filter(r => r.freedAt >= 0).map(r => r.freedAt).sort((a, b2) => a - b2);
  return { total: rows.length,
           neverFreed: rows.filter(r => r.freedAt < 0).map(r => r.tag),
           worstFree: freed[freed.length - 1], medianFree: freed[freed.length >> 1],
           ownGoals: rows.reduce((a, r) => a + r.own, 0),
           worstOutside: Math.max.apply(null, rows.map(r => r.out)),
           rows };
});

// =========================================== it does not fire in ordinary play ==
const normal = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode = '4v4'; M.sel.lobby = 'off'; M.sel.autoReplay = false; M.sel.length = '5';
  M.setMatchSeed(9); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  let ticksStuck = 0, samples = 0, maxRun = 0;
  for (let i = 0; i < 3600; i++){
    M.step(w);
    for (const q of w.players){
      if (q.ctrl !== 'bot') continue;
      samples++;
      if ((q.aiStuckT || 0) > M.BOT.stuckTicks) ticksStuck++;
      maxRun = Math.max(maxRun, q.aiStuckT || 0);
    }
  }
  o.share = +(ticksStuck / Math.max(1, samples)).toFixed(4);
  o.maxRun = maxRun;
  o.goals = w.score[0] + w.score[1];
  // ⚠️ A minute of 4v4 has to produce football, or "the breaker never fires" is true of a
  // match where nothing happened at all.
  o.matchHappened = o.goals > 0;
  return o;
});

// ============================================================ determinism ==
const det = await p.evaluate(() => {
  const M = window.__magnet;
  const run = () => {
    M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.setMatchSeed(31); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    w.ball.x = w.bounds.halfW - w.ball.r - 0.5; w.ball.y = w.bounds.halfL*0.4;
    w.ball.vx = w.ball.vy = 0;
    for (let i = 0; i < 1200; i++) M.step(w);
    return w.players.map(q => `${q.x.toFixed(6)},${q.y.toFixed(6)},${q.aiStuckT|0}`).join('|') +
           `#${w.ball.x.toFixed(6)},${w.ball.y.toFixed(6)}#${w.score.join('-')}`;
  };
  const a = run(), b2 = run();
  return { same: a === b2, sample: a.slice(0, 80) };
});
await p.close();

// -------------------------------------------------------------------- report --
ok('EVERY resting place round the boundary gets freed', sweep.neverFreed.length === 0,
   `${sweep.neverFreed.length} of ${sweep.total} never freed: ${JSON.stringify(sweep.neverFreed)} — before the fix 23 of 28 froze the chaser for 877 of 900 steps with the ball untouched`);
ok('...quickly', sweep.worstFree <= 200,
   `worst ${sweep.worstFree} steps (${(sweep.worstFree/60).toFixed(2)}s), median ${sweep.medianFree}`);
ok('...without scoring an own goal', sweep.ownGoals === 0,
   `${sweep.ownGoals} — the escape kick drops the own-goal guard on purpose, because a ball wedged on the boards has no "behind" that is on the pitch, so this is the check that keeps that honest`);
ok('...and without a body leaving the pitch', sweep.worstOutside <= 20.5,
   `${sweep.worstOutside} units past the line — the escape skips the TARGET clamp, and integrate's bounds+20 is what still holds a body in the view`);

ok('it stays out of the way in ordinary play', normal.share < 0.02,
   `bots were in the escape for ${(normal.share*100).toFixed(2)}% of body-ticks over a minute of 4v4 (longest run ${normal.maxRun} ticks)`);
ok('...and that minute was a real match', normal.matchHappened,
   `${normal.goals} goals — "the breaker never fires" is also true of a match where nothing happened`);

ok('the fix is deterministic', det.same,
   `${det.sample} — the escape is counted, never rolled: a random jitter would make the freeze intermittent rather than fixed, and intermittent is the version nobody can test`);

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ sweep: { ...sweep, rows: sweep.rows.filter(r => r.own > 0 || r.freedAt < 0) }, normal, det }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL botstuck\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS botstuck');
