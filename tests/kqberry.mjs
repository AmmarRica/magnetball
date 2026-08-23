// Killer Lobsters berries + hive.
//
// A berry is a floaty purple body you shepherd into the end you attack. Reaching it
// BANKS the berry into that side's hive instead of scoring; fill every cell and the
// match is won outright, the same shape as the snail.
//
// ⚠️ THE TRAP THIS SUITE EXISTS FOR: the first version parked a banked berry at
// (99999, 99999) — the way the code parks anything it wants ignored. That does not
// work here, because clampBallInside is a hard containment backstop and dragged it
// straight back onto the pitch on the very next step, where it re-entered the goal
// and banked again. A banked berry is out of play by FLAG, and the flag has to be
// honoured by integrate, by the ball-vs-ball pass, by checkGoal and by the draw.
//
// ⚠️ SECOND TRAP: berries are spawned from w.rng, and w.rng is seeded by botInit().
// Spawned before that call they fell back to Math.random and the opening layout was
// different every match — a determinism hole that a normal "does it run" test sails
// straight past. Two matches on the same seed are compared position by position.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const berries = w => w.extraBalls.filter(x=>x.isBerry);
  const start = seed => { M.sel.mode='kq'; M.sel.length='5'; M.setMatchSeed(seed); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2; return w; };

  // ---- they exist, they are in play, and they are not the ball ------------
  let w = start(7);
  o.count = berries(w).length;
  o.declaredCount = M.BERRY.count;
  o.hive0 = JSON.stringify(w.hive);
  o.snailStillThere = w.extraBalls.some(x=>x.isSnail);
  o.notTheBall = !w.ball.isBerry;
  // Spawned off the goals and off the centre spot, mirrored top and bottom.
  const ys = berries(w).map(x=>x.y);
  o.bothHalves = ys.some(y=>y<0) && ys.some(y=>y>0);
  const halfL = w.field.L/2;
  o.offTheGoals = berries(w).every(x=> Math.abs(x.y) > halfL*(M.BERRY.ringMin-0.01) &&
                                       Math.abs(x.y) < halfL*(M.BERRY.ringMax+0.01));

  // ---- DETERMINISM: same seed, same opening layout -------------------------
  // This is the one that catches a Math.random fallback firing.
  const layout = s => { const ww = start(s); return berries(ww).map(x=>[x.x,x.y,x.bob]); };
  const a1 = JSON.stringify(layout(11));
  const a2 = JSON.stringify(layout(11));
  const a3 = JSON.stringify(layout(12));
  o.sameSeedSameLayout = a1 === a2;
  o.differentSeedDiffers = a1 !== a3;
  // ...and a whole match plays out identically, berries and all.
  const play = s => { const ww = start(s); for (let i=0;i<60*40;i++) M.step(ww);
    return JSON.stringify({ hive:ww.hive, score:ww.score,
      b: berries(ww).map(x=>[+x.x.toFixed(6), +x.y.toFixed(6), !!x.banked]) }); };
  o.replaysIdentically = play(21) === play(21);

  // ---- the hive is actually DRAWN inside the goal ---------------------------
  // Pixel-sampled, because "there is a draw call for it" is not the same claim.
  // ⚠️ Run this BEFORE anything that ends a match: a hive win latches the goal
  // camera, and a zoomed pitch puts the far goal off the sampled canvas entirely —
  // which reads as "the hive is not drawn" and is nothing of the kind.
  // ⚠️ Average a patch, never one pixel. A cell is a handful of pixels across and
  // the net mesh runs right through it, so a single sample lands on a mesh line
  // often enough to flake.
  const cv = document.getElementById('game'), c2 = cv.getContext('2d');
  const DPR = cv.width / cv.clientWidth;
  // COUNT pixels that are actually berry-purple, rather than scoring "purple-ness".
  // ⚠️ A "how violet is this" score does not work here: the goal frame is red at one
  // end and cyan at the other, an empty cell is outlined in the team colour, and the
  // anti-aliasing where red meets cyan reads as violet as the real thing. What the
  // hive draws is a solid fill of exactly BERRY.hue, so count that and nothing else.
  const isHue = (r2,g2,b2,hex) => {
    const n2 = parseInt(hex.slice(1),16);
    return Math.abs(r2-((n2>>16)&255)) + Math.abs(g2-((n2>>8)&255)) + Math.abs(b2-(n2&255)) < 90;
  };
  const cellInk = (x,y) => {
    const [sx,sy]=M.screenPt(M.wx(x), M.wy(y));
    const px = Math.round(sx*DPR), py = Math.round(sy*DPR), n = 5;
    const d = c2.getImageData(px-n, py-n, n*2+1, n*2+1).data;
    let hits = 0;
    for (let k=0;k<d.length;k+=4) if (isHue(d[k], d[k+1], d[k+2], M.BERRY.hue)) hits++;
    return hits;
  };
  w = start(7);
  M.goalCamReset();
  w.players.forEach(q=>{ q.x=1e4; q.y=1e4; });        // nothing in front of the goal
  w.ball.x=1e4; w.ball.y=1e4;
  berries(w).forEach(q=>{ q.x=1e4; q.y=1e4; });
  // Mirror the draw's row layout rather than assuming one row — the hive is 12 cells
  // in rows of BERRY.cellRow, and a probe that assumes a single row samples the grass.
  const gh = w.field.goal/2;
  const per = Math.min(M.BERRY.cellRow, M.BERRY.cells);
  const rows = Math.ceil(M.BERRY.cells / per);
  const gap = (gh*2)/per, rowGap = w.bounds.net/(rows+1);
  const cellX = i => -gh + gap*((i % per)+0.5);
  const cellRowY = i => -(w.bounds.halfL + rowGap*(((i/per)|0)+1));   // top pocket
  const cellY = cellRowY(0);
  // ⚠️ Settle the camera first. computeCam() eases toward its target on every draw,
  // so the first render after a startMatch is a subpixel or two off where the next
  // one lands — enough to move a sample of a mark this small.
  w.hive[0]=0; w.hive[1]=0;
  for (let i=0;i<8;i++) M.render();
  o.emptyTop  = cellInk(cellX(0), cellY);
  o.emptyNext = cellInk(cellX(1), cellY);
  o.emptyBot  = cellInk(cellX(0), -cellY);
  w.hive[0] = 1; M.render();
  o.filledTop = cellInk(cellX(0), cellY);
  o.nextTop   = cellInk(cellX(1), cellY);
  o.stillEmptyBot = cellInk(cellX(0), -cellY);
  o.topFills = o.emptyTop === 0 && o.filledTop > 6;
  o.onlyOneFilled = o.nextTop === 0;
  o.farGoalUntouched = o.stillEmptyBot === 0;
  // ...and the OTHER goal has its own hive, owned by the team attacking it.
  w.hive[1] = M.BERRY.cells; M.render();
  o.filledBot = cellInk(cellX(0), -cellY);
  o.botFills  = o.emptyBot === 0 && o.filledBot > 6;

  // ---- a berry BANKS, it does not score ------------------------------------
  w = start(7);
  const before = w.score.slice();
  const berry = berries(w)[0];
  berry.x = 0; berry.y = -w.field.L/2 + 2; berry.vx = 0; berry.vy = -1;
  M.step(w);
  o.banked = !!berry.banked;
  o.hiveWent = JSON.stringify(w.hive);
  o.scoreUnchanged = w.score[0]===before[0] && w.score[1]===before[1];
  // The end you ATTACK, same as the snail and the ball: the top goal is team 0's.
  o.banksForTheAttacker = w.hive[0] === 1 && w.hive[1] === 0;

  // ---- ...and being banked really does take it out of play -----------------
  // The bug: clampBallInside dragged a parked berry back onto the pitch and it
  // banked again, and again, and again.
  const px = berry.x, py = berry.y, hiveAt = w.hive[0];
  for (let i=0;i<40;i++) M.step(w);
  o.stayedPut = berry.x === px && berry.y === py;
  o.didNotRebank = w.hive[0] === hiveAt;
  o.stillInsideThePitch = Math.abs(berry.x) < w.field.W && Math.abs(berry.y) < w.field.L*1.2;
  // A player standing on it can't bat it either.
  const near = w.players[0];
  near.x = berry.x; near.y = berry.y + 4; near.vx = 0; near.vy = 8;
  for (let i=0;i<10;i++) M.step(w);
  o.playerCannotMoveIt = berry.x === px && berry.y === py;
  // Nor is it drawn out in the void.
  M.render();
  o.drewClean = true;

  // ---- it comes back --------------------------------------------------------
  const respawnSteps = Math.ceil(M.BERRY.respawn*60) + 20;
  for (let i=0;i<respawnSteps;i++) M.step(w);
  o.respawned = !berry.banked;
  o.respawnedOnThePitch = Math.abs(berry.y) < halfL && Math.abs(berry.x) < w.field.W/2;
  o.respawnDidNotStreak = berry._px === berry.x && berry._py === berry.y;

  // ---- fill the hive and the match is won outright --------------------------
  w = start(7);
  const bs = berries(w);
  w.hive[1] = M.BERRY.cells - 1;
  const last = bs[0];
  last.banked = false; last.x = 0; last.y = w.field.L/2 - 2; last.vx = 0; last.vy = 1;
  M.step(w);
  o.hiveFull = w.hive[1] === M.BERRY.cells;
  o.forceWin = w.forceWin;
  o.wonByHive = w.forceWinBy === 'hive';
  o.wonForTheRightTeam = w.forceWin === 1;
  // The result screen must not claim the snail did it.
  M.endMatch(w); M.finishMatch(w);
  const t = (document.getElementById('ovTitle')||{}).textContent || '';
  o.title = t;
  o.saysHive = /HIVE/i.test(t) && !/SNAIL/i.test(t);
  const ov = document.getElementById('overlay'); if (ov) ov.classList.add('hidden');

  // ---- the bob is STEP-LOCKED, not draw-locked ------------------------------
  // Ticked in a draw it would wobble 2.4x fast on a 144Hz screen (the trails rule).
  w = start(7);
  const bb = berries(w)[0];
  const bobStart = bb.bob;
  M.render(); M.render(); M.render();
  o.drawsDontBob = bb.bob === bobStart;
  M.step(w);
  o.stepDoesBob = bb.bob !== bobStart;

  // ---- bots contest berries, without the mode becoming a delivery job -------
  // ⚠️ THE BALANCE TRAP, recorded because three tunings went past it. An ungated
  // runner drove berries the length of the pitch uncontested and 7 of 8 bot matches
  // ended on a full hive inside 90 seconds with the ball barely involved. Raising
  // the cell count only made the same foregone race longer; what fixed it was
  // restricting a bot to FINISHING a berry already near the hive (BOT.berryLastLeg)
  // and spawning them in the middle third. So this checks both directions: bots must
  // bank berries at all, and a full hive must not be a formality.
  // ⚠️ AUTO-REPLAY OFF. This is a synchronous `for` loop of `M.step()` with no `await` in
  // it, so a `playReplay()` promise can never resolve inside one — the goal state just keeps
  // ticking and the match burns steps celebrating instead of playing. Same contamination
  // `botai` was measured losing 910 of 3,600 steps a duel to.
  M.sel.autoReplay = false;
  const kqRun = (seed, secs) => {
    const ww = start(seed); ww.players.forEach(q=>{ q.ctrl='bot'; });
    let i = 0;
    for (; i<60*secs && ww.forceWin == null && ww.state !== 'over'; i++) M.step(ww);
    return { hive: ww.hive.slice(), goals: ww.score[0]+ww.score[1],
             by: ww.forceWinBy || null, secs: Math.round(i/60) };
  };
  // ⚠️ EIGHT runs and a PROPORTION, not four and an all-or-nothing threshold.
  // Determinism here is same-engine only (see docs/DETERMINISM-AUDIT.md): a pinned seed
  // reproduces bit-exactly in ONE browser build, and cross-engine equality is explicitly
  // not a goal. CI runs a different Chromium from any dev machine, so the trajectories
  // diverge — measured, seed 1 gives hive [6,5] locally and [6,7] on CI — and an
  // `every(secs > 120)` over four samples sits right on top of the noise. It failed on CI
  // for four consecutive merges to main with one run landing at 118s, while passing every
  // time locally, which is the worst kind of red: real-looking, unreproducible, and
  // eventually ignored.
  // ⚠️ And the metric is HOW MANY matches a hive decides, not how fast one fills. Both
  // builds were measured, eight seeds each:
  //     shipping                      2/8 hive wins, earliest 176s, 20 goals
  //     berryRunners 4 + lastLeg 9.0  8/8 hive wins, earliest 109s, 17 goals
  // ⚠️ TIMING IS THE WRONG AXIS, and that is the whole reason this was red on CI. The
  // broken build's collapse is slower than the original 90-second one, so a "hive inside
  // 120s" rule caught only 2 of its 8 runs and read as almost healthy — while CI's own
  // noise on the SHIPPING build produced a hive win at 118s and failed the same rule. The
  // count separates them cleanly: 2 against 8, so a ceiling of half fails the broken build
  // by four runs and leaves the shipping one two clear. The 60-second floor below is a
  // sanity bound, not the discriminator — the broken build survives it.
  const runs = [1,2,3,4,5,6,7,8].map(s2 => kqRun(s2, 300));
  M.sel.autoReplay = true;
  o.botRuns = runs;
  o.botsBankBerries = runs.some(x => x.hive[0] + x.hive[1] >= 6);
  const hiveWins = runs.filter(x => x.by === 'hive').length;
  o.hiveWins = hiveWins + '/' + runs.length;
  o.hiveNotAFormality = hiveWins <= runs.length / 2 &&
                        runs.every(x => x.by !== 'hive' || x.secs > 60);
  o.footballStillHappens = runs.reduce((a,x)=>a+x.goals,0) >= runs.length;
  // Only one runner a side, or the football collapses.
  const ww = start(9); ww.players.forEach(q=>{ q.ctrl='bot'; });
  let maxRunners = 0;
  for (let i=0;i<60*60;i++){
    M.step(ww);
    for (const t of [0,1]) maxRunners = Math.max(maxRunners,
      ww.players.filter(q=>q.team===t && q.aiBerry).length);
  }
  o.maxRunners = maxRunners;
  o.oneRunnerASide = maxRunners <= M.BOT.berryRunners;
  // ...and never the chaser or the goalie: the chaser IS the match, and pulling the
  // goalie for an errand left an empty net every time a berry drifted goalward.
  o.neverChaserOrGoalie = ww.players.every(q => !q.aiBerry ||
    (q.aiRole !== 'chaser' && q.aiRole !== 'goalie'));
  // A dead berry must not stay latched, or a bot escorts a hole in the pitch.
  o.noStaleTargets = ww.players.every(q => !q.aiBerry || M.berryLive(ww, q.aiBerry));

  // ---- and none of this leaks into a normal match ---------------------------
  M.sel.mode='1v1'; M.setMatchSeed(3); M.startMatch();
  const nw = M.world; nw.state='play'; nw.stateT=2;
  o.noBerriesInNormal = !(nw.extraBalls||[]).some(x=>x.isBerry);
  o.noHiveInNormal = nw.hive == null;
  for (let i=0;i<120;i++) M.step(nw);
  M.render();

  M.sel.mode='1v1'; M.setMatchSeed(null);
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.count === r.declaredCount, `${r.count} berries in play, not the declared ${r.declaredCount}`);
ok(r.snailStillThere, 'the snail vanished when berries were added — Killer Lobsters still needs both');
ok(r.notTheBall, 'the match ball is flagged as a berry');
ok(r.bothHalves, 'every berry spawned in one half — they are meant to be mirrored');
ok(r.offTheGoals, 'a berry spawned outside the spawn ring, on a goal or the centre spot');
ok(r.sameSeedSameLayout, 'the same seed gave a DIFFERENT opening berry layout — the spawn is not on w.rng');
ok(r.differentSeedDiffers, 'two different seeds gave the identical layout — the spawn is not seeded at all');
ok(r.replaysIdentically, 'a 40s match on the same seed did not replay identically with berries in play');
ok(r.banked, 'a berry reaching the goal did not bank');
ok(r.scoreUnchanged, `a berry SCORED instead of banking: ${r.hiveWent}`);
ok(r.banksForTheAttacker, `a berry banked into the wrong hive: ${r.hiveWent}`);
ok(r.stayedPut, 'a banked berry moved — it is supposed to be out of play until it respawns');
ok(r.didNotRebank, 'a banked berry banked AGAIN — clampBallInside is dragging it back into the goal');
ok(r.stillInsideThePitch, 'a banked berry ended up outside the world');
ok(r.playerCannotMoveIt, 'a player batted a banked berry — it is not out of the collision pass');
ok(r.respawned, `a banked berry never came back after ${'BERRY.respawn'} seconds`);
ok(r.respawnedOnThePitch, 'a respawned berry came back off the pitch');
ok(r.respawnDidNotStreak, 'a respawn left stale _px/_py, so ix/iy would streak it across the pitch');
ok(r.hiveFull && r.wonForTheRightTeam, `a full hive did not win the match: hive full ${r.hiveFull}, forceWin ${r.forceWin}`);
ok(r.wonByHive, 'a hive win was not tagged, so the result screen cannot tell it from a snail win');
ok(r.saysHive, `the result screen said "${r.title}" for a hive win`);
ok(r.topFills, `a filled hive cell is not drawn in the goal: ${r.filledTop} vs empty ${r.emptyTop}`);
ok(r.onlyOneFilled, `one banked berry filled more than one cell: ${r.nextTop}`);
ok(r.farGoalUntouched, `filling one goal's hive lit the other one up: ${r.emptyBot}`);
ok(r.botFills, `the far goal has no hive drawn: ${r.filledBot} vs empty ${r.emptyBot}`);
ok(r.drawsDontBob, 'a DRAW advanced the berry bob — a 144Hz screen would wobble it fast');
ok(r.stepDoesBob, 'the berry bob does not advance in step() at all, so it never floats');
ok(r.botsBankBerries, `bots never banked a berry in four 5-minute matches: ${JSON.stringify(r.botRuns)}`);
ok(r.hiveNotAFormality, `${r.hiveWins} bot matches ended on a full hive — the mode is a delivery job again. a build that lets bots courier berries scores 8 of 8 here and the shipping one 2 of 8, so the ceiling is half, plus nothing at all inside a minute: ${JSON.stringify(r.botRuns)}`);
ok(r.footballStillHappens, `four matches produced almost no goals — the berries have eaten the football: ${JSON.stringify(r.botRuns)}`);
ok(r.oneRunnerASide, `${r.maxRunners} bots on berry duty at once, cap is ${'BOT.berryRunners'}`);
ok(r.neverChaserOrGoalie, 'the chaser or the goalie was sent on a berry errand');
ok(r.noStaleTargets, 'a bot is still escorting a berry that has been banked or removed');
ok(r.noBerriesInNormal, 'berries showed up in a normal 1v1');
ok(r.noHiveInNormal, 'a normal match built a hive');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nkqberry OK');
