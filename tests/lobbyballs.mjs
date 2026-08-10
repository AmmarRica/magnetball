// WARM-UP BALLS — one per half, one more per person, and a wall down the middle.
//
// The lobby is where you test a stick, and you cannot test a stick without a ball.
// One ball between six people is a queue. So each half gets its own, plus one more
// per person waiting, and a wall along the halfway line keeps a half's balls on that
// half — otherwise the room is one scramble across the middle and nobody can stand
// still long enough to pick a side.
//
// Four things are held here, and the THIRD is the one that would matter:
//   1. the count follows the room — it grows when somebody joins mid-lobby, which is
//      the "one ball per joining player" half of the ask, and a count taken once at
//      `enterWarmup` would miss every late arrival;
//   2. the wall actually contains a ball — driven with real velocity across the line,
//      not asserted from the fact that a wall object exists;
//   3. ⚠️ NOTHING LEAKS INTO THE MATCH. A wall across the middle of a live pitch is
//      unplayable and a spare ball is a second thing to chase. `clearLobbyProps` is
//      called from `resetKickoff` rather than from `lobbyStart` precisely so that it
//      is on EVERY path into play, and this suite comes at that from three
//      directions: pressing Start, the idle auto-start, and a fresh `startMatch`;
//   4. players are NOT stopped by it — the wall is `ballOnly`, and walking into a
//      half is the entire mechanism for choosing a side. A wall that held players
//      would make the lobby unusable while looking like it worked.
//
// ⚠️ MEASUREMENT TRAP recorded up front: do not check containment by reading
// `w.walls` for a `lobbyWall` entry. That measures that an object was pushed onto an
// array, which is not the same claim as "the ball stays on its half" — the wall could
// be zero-length, on the wrong axis, or not `ballOnly`, and the array check passes on
// all three. Every assertion below drives the physics and reads a position.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };
const clean2 = x => x && x.walls === 0 && x.lobbyBalls === 0;

const p = await b.newPage({ viewport:{ width:900, height:900 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(() => {
  const M = window.__magnet; const o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const allBalls = w => (w.extraBalls && w.extraBalls.length) ? [w.ball, ...w.extraBalls] : [w.ball];
  const lobbyWalls = w => w.walls.filter(x => x.lobbyWall).length;

  const warmup = (mode) => {
    M.sel.display='auto'; M.applyDisplayMode();
    M.sel.lobby='touch'; M.sel.mode = mode || '2v2';
    M.setMatchSeed(3); M.startMatch();
    return M.world;
  };

  // ---- 1. the count follows the room --------------------------------------
  let w = warmup('1v1');
  o.oneHuman = allBalls(w).length;
  o.declaredForOne = M.lobbyBallCount(w);
  o.countMatchesDeclared = o.oneHuman === o.declaredForOne;
  // Both halves are stocked before anybody has picked a side.
  o.topHalf = allBalls(w).filter(x => x.y < 0).length;
  o.botHalf = allBalls(w).filter(x => x.y > 0).length;
  o.bothHalvesStocked = o.topHalf >= 1 && o.botHalf >= 1;
  // ⚠️ Somebody JOINS. `lobbyHumans` is what the count reads, so promoting a bot to a
  // human seat is the same event as a pad waking up, without needing a fake gamepad.
  const bot = w.players.find(q => q.ctrl === 'bot');
  bot.ctrl = 'gamepad'; bot.padIndex = 3;
  M.step(w);
  o.afterJoin = allBalls(w).length;
  o.joinBringsABall = o.afterJoin === o.oneHuman + 1;
  // ...and a ball already in play is not teleported home by that.
  const rolling = w.extraBalls.find(x => x.lobbyBall);
  rolling.x = 17; rolling.y = -33; rolling.vx = 2;
  const wasAt = [rolling.x, rolling.y];
  bot.ctrl = 'bot';                       // ...and somebody leaves
  M.step(w);
  o.afterLeave = allBalls(w).length;
  o.leavingTakesABall = o.afterLeave === o.oneHuman;
  o.movedBallLeftAlone = w.extraBalls.includes(rolling)
    ? (rolling.x !== wasAt[0] || rolling.vx === 2) : 'removed';
  o.capped = M.lobbyBallCount({ ...w, players: new Array(40).fill(0).map(()=>({ctrl:'human1'})) }) <= M.LOBBY.ballMax;

  // ---- 2. the wall contains a ball ----------------------------------------
  // ⚠️ Driven, not asserted. A ball is placed on the top half and fired hard at the
  // line; after a second of sim it must still be on the top half.
  w = warmup('2v2');
  o.wallsWhileWarming = lobbyWalls(w);
  const probe = w.extraBalls.find(x => x.lobbyBall) || w.ball;
  probe.x = 0; probe.y = -120; probe.vx = 0; probe.vy = 14;      // straight at halfway
  // Nobody may touch it: park every body far away for this measurement.
  w.players.forEach(q => { q.x = w.bounds.halfW * 0.95; q.y = -w.bounds.halfL * 0.95;
                           q.vx = 0; q.vy = 0; q.ctrl = 'none'; });
  // ⚠️ Sampled over the WHOLE run, not read off the last frame. The ball bounces,
  // travels back, and `damp` bleeds the speed away — so by frame 60 `vy` is a small
  // number of either sign and the final-frame reading is a coin toss. What is being
  // claimed is that it came back off the wall at all, which is a thing that happens
  // once, early.
  let maxY = probe.y, minVy = 0;
  for (let i=0;i<60;i++){ M.step(w); maxY = Math.max(maxY, probe.y); minVy = Math.min(minVy, probe.vy); }
  o.ballDeepest = +maxY.toFixed(1);
  o.ballBestReturn = +minVy.toFixed(2);
  // Its own radius past the line is the wall doing its job; a pitch-length away is not.
  o.wallHoldsTheBall = maxY <= probe.r + 1;
  // Fired at 14; anything above a token nudge back is a real bounce rather than a stop.
  o.ballBouncedBack = minVy < -3;

  // ---- 3. ...but NOT a player ---------------------------------------------
  // The wall is `ballOnly`, and walking into a half is how you choose a side. A wall
  // that held players would make the lobby unusable while looking correct.
  w = warmup('2v2');
  const me = M.lobbyHumans(w)[0];
  me.x = 0; me.y = -80; me.vx = 0; me.vy = 0;
  for (let i=0;i<90;i++){ M.pads.p1.dx = 0; M.pads.p1.dy = 1; M.step(w); }
  M.pads.p1.dx = 0; M.pads.p1.dy = 0;
  o.playerEndedAt = Math.round(me.y);
  o.playerWalksThrough = me.y > 20;
  o.stillWarming = w.state === 'warmup';

  // ---- 4. NOTHING LEAKS INTO THE MATCH ------------------------------------
  // Three separate ways out of the lobby, because the cleanup lives in `resetKickoff`
  // exactly so that it is not tied to any one of them.
  const leak = (how) => {
    const ww = warmup('2v2');
    const before = lobbyWalls(ww);
    how(ww);
    return { before, walls: lobbyWalls(ww), state: ww.state,
             balls: allBalls(ww).length,
             lobbyBalls: (ww.extraBalls||[]).filter(x => x.lobbyBall).length,
             ballAtCentre: ww.ball.x === 0 && ww.ball.y === 0 };
  };
  o.viaStart = leak(ww => M.lobbyStart(ww));
  o.viaAutoStart = leak(ww => { for (let i=0;i<60*40;i++){ if (ww.state !== 'warmup') break; M.step(ww); } });
  o.viaRestart = leak(ww => { M.sel.lobby='on'; M.sel.display='auto'; M.applyDisplayMode();
                              M.setMatchSeed(3); M.startMatch(); Object.assign(ww, M.world); });
  // ⚠️ ...and the STRUCTURAL claim, tested directly rather than inferred from the three
  // above. Every exit that exists today happens to run through `lobbyStart` or build a
  // brand-new world, so moving the cleanup out of `resetKickoff` and into `lobbyStart`
  // passes all three — measured, not assumed. What the placement actually buys is a
  // guarantee about paths that do not exist yet, and the only way to assert that is to
  // call `resetKickoff` on a warming world and require it to have swept up by itself.
  o.viaResetOnly = leak(ww => { M.resetKickoff(ww); ww.state = 'kickoff'; });
  const clean = x => x.walls === 0 && x.lobbyBalls === 0 && x.state !== 'warmup';
  o.startLeavesNothing   = clean(o.viaStart);
  o.autoLeavesNothing    = clean(o.viaAutoStart);
  o.restartLeavesNothing = o.viaRestart.walls === 0 && o.viaRestart.lobbyBalls === 0;
  o.matchHasOneBall = o.viaStart.balls === 1 && o.viaStart.ballAtCentre;

  // ⚠️ And the ball is genuinely free to cross the middle once play starts — the
  // wall being absent from an array is not the same claim as the ball getting through.
  {
    const ww = M.world;
    M.sel.lobby='on'; M.setMatchSeed(3); M.startMatch();
    const w2 = M.world; w2.state='play'; w2.stateT=2;
    w2.players.forEach(q => { q.x = w2.bounds.halfW*0.95; q.y = -w2.bounds.halfL*0.95; q.ctrl='none'; });
    w2.ball.x = 0; w2.ball.y = -120; w2.ball.vx = 0; w2.ball.vy = 14;
    for (let i=0;i<60;i++) M.step(w2);
    o.inPlayBallY = Math.round(w2.ball.y);
    o.crossesInPlay = w2.ball.y > 60;
    void ww;
  }

  M.sel.lobby='on'; M.sel.mode='1v1'; M.setMatchSeed(null);
  return o;
});

ok('the ball count matches what lobbyBallCount declares', r.countMatchesDeclared,
   `${r.oneHuman} on the pitch vs ${r.declaredForOne} declared`);
ok('both halves are stocked before anyone picks a side', r.bothHalvesStocked,
   `${r.topHalf} top / ${r.botHalf} bottom`);
ok('somebody joining brings a ball with them', r.joinBringsABall,
   `${r.oneHuman} -> ${r.afterJoin}`);
ok('...and leaving takes one away', r.leavingTakesABall, `${r.afterJoin} -> ${r.afterLeave}`);
ok('a ball being dribbled is not teleported home by the resync', r.movedBallLeftAlone !== false,
   String(r.movedBallLeftAlone));
ok('the count is capped', r.capped);
ok('warm-up puts exactly one wall on halfway', r.wallsWhileWarming === 1, String(r.wallsWhileWarming));
ok('the wall keeps a ball on its own half', r.wallHoldsTheBall,
   `fired at the line and reached y=${r.ballDeepest}`);
ok('...and the ball comes back off it', r.ballBouncedBack,
   `fired at vy=14 and the best return was vy=${r.ballBestReturn}`);
ok('a PLAYER still walks straight through it', r.playerWalksThrough,
   `walked into the far half and ended at y=${r.playerEndedAt}`);
ok('the lobby is still running after that walk', r.stillWarming);
ok('pressing Start leaves no wall and no spare balls', r.startLeavesNothing, JSON.stringify(r.viaStart));
ok('the idle auto-start leaves no wall and no spare balls', r.autoLeavesNothing, JSON.stringify(r.viaAutoStart));
ok('a fresh startMatch leaves no wall and no spare balls', r.restartLeavesNothing, JSON.stringify(r.viaRestart));
ok('a started match has one ball, on the centre spot', r.matchHasOneBall, JSON.stringify(r.viaStart));
ok('resetKickoff ALONE sweeps the props up', clean2(r.viaResetOnly),
   'the cleanup is tied to one particular exit rather than to the path into play: ' + JSON.stringify(r.viaResetOnly));
ok('in play the ball crosses the middle freely', r.crossesInPlay,
   `fired at halfway and got to y=${r.inPlayBallY}`);
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL lobbyballs\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS lobbyballs');
