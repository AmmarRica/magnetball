// THE GAP — a hole in the middle of Faceoff Orbit that players cannot walk into.
//
// Asked for with a drawing: a box in the middle of the pitch, and two long curved arrows
// showing that to reach the other end you have to go ROUND it. It is the first field
// entry in the file that changes the PHYSICS rather than just the rectangle, so what has
// to be pinned here is not "the setting exists" but four separate behaviours, each of
// which is satisfied by a build that gets the other three wrong:
//
//   1. a player cannot get in                — and that alone is true of a solid pitch;
//   2. both channels are passable end to end — and that alone is true of no gap at all;
//   3. the ball bounces off it and never rests inside;
//   4. bots can still play the match, which is what §3 of the change exists for.
//
// ⚠️ TWO MEASUREMENT TRAPS ARE RECORDED HERE, both of which produced confident nonsense
// on the first run:
//
//   • **Park the ball somewhere LEGAL.** Dumped at 9e3 to keep it out of the way,
//     `clampBallInside` drags it into a net, a goal is scored, `resetKickoff` teleports
//     every body to its mark, and every reading afterwards is of a match that restarted
//     mid-probe. The first run of the containment probe reported a player walking clean
//     through a block; it had been teleported to its kickoff spot on the far side.
//   • **"Stuck" is not "standing still."** A bot holding a formation spot is stationary,
//     and that is football. The metric has to be a body PRESSED on a gap face WITH ITS
//     OWN TARGET SOMEWHERE ELSE — measured on speed alone it reads a goalie, and the
//     figure it gives has no baseline you can argue from.
//
// ⚠️ The bot numbers below are a COMPARISON against the same build with the gap handling
// switched off, never an absolute. An absolute threshold here is a number tuned until it
// passed. Measured over three 90-second 3v3 bot matches:
//
//     worst continuous pin against a face   1.7s   vs   6.5s
//     share of bot-time pinned              0.34%  vs   4.25%
//     goals over the sweep                     6   vs      7
//
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

// ===================================================== the spec, and its reach ==
const t = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();

  // ⚠️ INERT EVERYWHERE ELSE. `gapRects` returning [] is what makes every helper —
  // `gapPush`, `gapBlocks`, `drawGap`, the bot detour — a no-op on the other 32 fields,
  // so this is the check that says the feature cannot have changed the rest of the game.
  o.withGaps = Object.keys(M.FIELDS).filter(k => M.gapRects(M.FIELDS[k]).length);
  o.fieldCount = Object.keys(M.FIELDS).length;
  o.rects = M.gapRects(M.FIELDS.faceoff);

  const f = M.FIELDS.faceoff, g = o.rects[1];
  // The three invariants the fractions have to satisfy, stated as the reasons rather
  // than as the numbers — retuning `gap` is allowed, breaking these is not.
  o.channel = f.W / 2 - g.x1;
  o.channelTakesTwo = o.channel >= 2 * (M.PLAYER ? M.PLAYER.r * 2 : 30);
  o.slotClearsCircle = g.y0 - M.CENTER_R >= 15;
  o.blocksInsideThePitch = g.y1 < f.L / 2 && g.x1 < f.W / 2;
  o.symmetric = o.rects[0].y0 === -g.y1 && o.rects[0].y1 === -g.y0 &&
                o.rects[0].x0 === g.x0 && o.rects[0].x1 === g.x1;

  // ⚠️ Filed under Other, which is what was asked for. `other` was already written as a
  // genuine catch-all for "a shape that does not exist yet", so this is that case.
  o.shape = M.fieldShape(M.FIELDS.faceoff);
  o.classicShape = M.fieldShape(M.FIELDS.classic);

  // Geometry, from the real builder.
  M.sel.mode = '1v1'; M.sel.controllers = 'off'; M.sel.kickoffRule = 'off'; M.sel.lobby = 'off';
  M.sel.field = 'faceoff'; M.setMatchSeed(3); M.startMatch();
  const w = M.world;
  o.gapWalls = w.walls.filter(x => x.isGap).length;
  o.solidWalls = w.walls.filter(x => !x.ballOnly).length;
  o.everyGapWallIsSolid = w.walls.filter(x => x.isGap).every(x => !x.ballOnly);
  o.boundaryStillBallOnly = w.walls.filter(x => !x.isGap).every(x => !!x.ballOnly);
  M.sel.field = 'classic'; M.startMatch();
  o.classicSolidWalls = M.world.walls.filter(x => !x.ballOnly).length;
  return o;
});

ok('exactly one shipped field has a gap', t.withGaps.length === 1 && t.withGaps[0] === 'faceoff',
   JSON.stringify(t.withGaps) + ` of ${t.fieldCount} — gapRects returning [] is what makes every helper inert on the rest`);
ok('...and Classic has no wall that blocks a player', t.classicSolidWalls === 0,
   `${t.classicSolidWalls} — every boundary wall is ballOnly, and the gap is the only exception anywhere`);
ok('the gap is eight walls, all solid to players', t.gapWalls === 8 && t.everyGapWallIsSolid && t.solidWalls === 8,
   JSON.stringify({ gap: t.gapWalls, solid: t.solidWalls }));
ok('...and the boundary is still ballOnly', t.boundaryStillBallOnly,
   'the step-out margin has to stay uniform all the way round — the gap is interior, not a board');
ok('the two blocks mirror about the halfway line', t.symmetric, JSON.stringify(t.rects));
ok('the channels take two bodies abreast', t.channelTakesTwo,
   `${t.channel} units — any tighter and you cannot get past a defender at all on a court this thin`);
ok('the slot clears the centre circle', t.slotClearsCircle,
   'KICKOFF_CIRCLE_R === CENTER_R: the half-line rule\'s gate IS the drawn circle, so a block over it is a gate nobody can stand in');
ok('the blocks stay inside the pitch', t.blocksInsideThePitch, JSON.stringify(t.rects));
ok('a gap field is filed under Other', t.shape === 'other', t.shape);
ok('...and an ordinary rectangle is still Square', t.classicShape === 'square', t.classicShape);

// ============================================ players: kept out, and let round ==
const move = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // ⚠️ The ball is parked somewhere LEGAL and RE-PARKED every step — see the header.
  // Every other body is parked too, or a bot wanders into the body being measured.
  const park = (w) => {
    w.ball.x = 120; w.ball.y = 430; w.ball.vx = 0; w.ball.vy = 0;
    w.players.slice(1).forEach(q => { q.x = -120; q.y = -430; q.vx = 0; q.vy = 0; });
  };
  const fresh = () => {
    M.sel.mode = '1v1'; M.sel.controllers = 'off'; M.sel.kickoffRule = 'off'; M.sel.lobby = 'off';
    M.sel.field = 'faceoff'; M.setMatchSeed(7); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2; park(w); return w;
  };
  const rects = w => M.gapRects(w.field);
  const inGap = (w, x, y) => rects(w).some(g => x > g.x0 && x < g.x1 && y > g.y0 && y < g.y1);
  const drive = (w, me, dx, dy, n) => {
    M.pads.p1.dx = dx; M.pads.p1.dy = dy;
    let entered = 0;
    for (let i = 0; i < n; i++){ M.step(w); park(w); if (inGap(w, me.x, me.y)) entered++; }
    M.pads.p1.dx = 0; M.pads.p1.dy = 0;
    return entered;
  };
  const at = (x, y) => { const w = fresh(), me = w.players[0]; me.x = x; me.y = y; me.vx = 0; me.vy = 0; return [w, me]; };

  { const [w, me] = at(0, 20);   o.fromSlot   = { in: drive(w, me, 0, 1, 600), y: +me.y.toFixed(1), edge: rects(w)[1].y0 }; }
  { const [w, me] = at(0, 400);  o.fromBehind = { in: drive(w, me, 0, -1, 600), y: +me.y.toFixed(1), edge: rects(w)[1].y1 }; }
  { const [w, me] = at(-230, 400); o.atCorner = { in: drive(w, me, 0.7, -0.7, 600) }; }
  for (const [k, x] of [['right', 135], ['left', -135]]){
    const [w, me] = at(x, -400);
    o['channel_' + k] = { in: drive(w, me, 0, 1, 900), y: +me.y.toFixed(1), reached: me.y > w.bounds.halfL - 40 };
  }
  { const [w, me] = at(-135, 0);
    o.acrossSlot = { in: drive(w, me, 1, 0, 600), x: +me.x.toFixed(1), crossed: me.x > 100 }; }
  return o;
});

ok('a player driven at a block is stopped by it', move.fromSlot.in === 0 && move.fromSlot.y < move.fromSlot.edge,
   JSON.stringify(move.fromSlot));
ok('...from the far side too', move.fromBehind.in === 0 && move.fromBehind.y > move.fromBehind.edge,
   JSON.stringify(move.fromBehind));
ok('...and driven diagonally at a corner', move.atCorner.in === 0, JSON.stringify(move.atCorner));
// ⚠️ Paired with the checks above on purpose. "A player cannot enter the gap" is equally
// true of a pitch nobody can cross at all, which is the build this must not become.
ok('the right-hand channel runs end to end', move.channel_right.in === 0 && move.channel_right.reached,
   JSON.stringify(move.channel_right));
ok('...and so does the left-hand one', move.channel_left.in === 0 && move.channel_left.reached,
   JSON.stringify(move.channel_left));
ok('the slot crosses from one channel to the other', move.acrossSlot.in === 0 && move.acrossSlot.crossed,
   JSON.stringify(move.acrossSlot) + ' — the slot is what keeps the kickoff spot reachable');

// ================================================= the ball, and the kickoff ==
const ball = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode = '1v1'; M.sel.controllers = 'off'; M.sel.lobby = 'off';
  M.sel.field = 'faceoff'; M.setMatchSeed(9); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const inGap = (x, y) => M.gapRects(w.field).some(g => x > g.x0 && x < g.x1 && y > g.y0 && y < g.y1);
  // Fired at every face, at and beyond the speed cap. ⚠️ Never STARTED inside — the first
  // run of this seeded a shot at (0,-95), which is in a block, and reported 800 frames
  // "inside" as though the wall had failed.
  const shots = [[0,-400,0,30], [0,400,0,-30], [-260,-260,26,20], [260,260,-26,-20],
                 [0,-40,0,-30], [-260,0,30,4], [0,40,4,30], [0,-400,0,60], [-260,-260,45,32]];
  let inside = 0, startedInside = 0;
  for (const [x, y, vx, vy] of shots){
    if (inGap(x, y)){ startedInside++; continue; }
    w.ball.x = x; w.ball.y = y; w.ball.vx = vx; w.ball.vy = vy;
    for (let i = 0; i < 900; i++){ M.moveBall(w, w.ball, []); if (inGap(w.ball.x, w.ball.y)) inside++; }
  }
  o.shots = shots.length; o.inside = inside; o.startedInside = startedInside;

  // Kickoff at every roster size: nobody, and no ball, starts in a block.
  o.badStarts = [];
  for (const mode of ['1v1', '2v2', '3v3', '4v4', '5v5', '6v6']){
    M.sel.mode = mode; M.setMatchSeed(21); M.startMatch();
    const w2 = M.world;
    if (inGap(w2.ball.x, w2.ball.y)) o.badStarts.push(mode + ':ball');
    w2.players.forEach((q, i) => { if (inGap(q.x, q.y)) o.badStarts.push(`${mode}:p${i}`); });
    // ...and the mark they are held on at kickoff is the pushed one, or applyKickoffLine
    // walks them straight back into the wall.
    w2.players.forEach((q, i) => { if (inGap(q.homeX, q.homeY)) o.badStarts.push(`${mode}:home${i}`); });
  }
  return o;
});

ok('the probe never starts the ball inside a block', ball.startedInside === 0, `${ball.startedInside}`);
ok('the ball bounces off the gap and never rests in it', ball.inside === 0,
   `${ball.inside} frames inside over ${ball.shots} shots × 900 steps at and above the speed cap`);
ok('nobody kicks off inside the gap, at any roster size', ball.badStarts.length === 0,
   JSON.stringify(ball.badStarts) + ' — layTeam pushes the mark out, and homeX/homeY is written from the pushed spot');

// ============================== nothing may be PLACED inside a block ==
// ⚠️ **A BLOCK IS A BARRIER, NOT A CONTAINER, and this is the sharpest thing the suite
// holds.** `collideWall` bails at `dist >= d.r`, so four segments only ever act within one
// radius of a face — a body put down in the MIDDLE of a block is touched by none of them
// and sits there for the rest of the match, with no backstop anywhere (`clampBallInside`
// is a rectangle test and never claimed to know about interior shape). Spawning is the
// only way in, so every place that puts a body on the pitch has to push out of the gap.
// Measured on Faceoff Orbit before the guards: **three of the six Killer Lobsters berries
// spawned inside**, half the mode's objective permanently unreachable, and the warm-up
// lobby's row sits at exactly `±L/2 * 0.30`, which is inside a block.
const placed = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const inGap = (w, x, y) => M.gapRects(w.field).some(g => x > g.x0 && x < g.x1 && y > g.y0 && y < g.y1);

  // Killer Lobsters: the berries are placed off `w.rng`, so this is a real draw.
  M.sel.mode = 'kq'; M.sel.field = 'faceoff'; M.sel.lobby = 'off';
  M.sel.controllers = 'off'; M.sel.autoReplay = false;
  o.berryFrames = 0; o.berrySeeds = [];
  for (const seed of [55, 71, 93]){
    M.setMatchSeed(seed); M.startMatch();
    const w = M.world; w.players.forEach(q => q.ctrl = 'bot'); w.state = 'play'; w.stateT = 1;
    let atSpawn = 0;
    for (const e of (w.extraBalls || [])) if (inGap(w, e.x, e.y)) atSpawn++;
    for (let i = 0; i < 60 * 45; i++){
      M.step(w); if (w.state === 'over') break;
      for (const e of (w.extraBalls || [])) if (!e.banked && inGap(w, e.x, e.y)) o.berryFrames++;
    }
    o.berrySeeds.push(atSpawn);
  }

  // The warm-up lobby row, at every side size the stepper can reach.
  o.lobbySpots = [];
  const stub = { field: M.FIELDS.faceoff, bounds: { halfW: 170, halfL: 510 } };
  for (let cnt = 1; cnt <= 8; cnt++)
    for (let i = 0; i < cnt; i++)
      for (const team of [0, 1]){
        const sp = M.lobbySpotFor(stub, team, i, cnt);
        if (inGap(stub, sp.x, sp.y)) o.lobbySpots.push([cnt, i, team]);
      }

  // ...and a real lobby, settled: no body ends up standing in a block.
  M.sel.mode = '4v4'; M.sel.lobby = 'on';
  M.setMatchSeed(31); M.startMatch();
  const w2 = M.world;
  if (M.enterWarmup && w2.state !== 'warmup') M.enterWarmup(w2);
  for (let i = 0; i < 60 * 20 && w2.state === 'warmup'; i++) M.step(w2);
  o.lobbyState = w2.state;
  o.lobbyStuck = w2.players.filter(q => inGap(w2, q.x, q.y)).length
               + (w2.extraBalls || []).filter(e => inGap(w2, e.x, e.y)).length;
  return o;
});

ok('no berry spawns inside the gap', placed.berrySeeds.every(n => n === 0),
   JSON.stringify(placed.berrySeeds) + ' of 6 per match — three of six before placeBerry pushed out');
ok('...and none is stranded in one', placed.berryFrames === 0,
   `${placed.berryFrames} berry-frames inside over three matches — a block cannot eject a body deeper than one radius`);
ok('no warm-up lobby spot is inside the gap', placed.lobbySpots.length === 0,
   JSON.stringify(placed.lobbySpots) + ' — the row sits at ±L/2 * 0.30, which is inside a block on this court');
ok('...and a settled lobby leaves nobody in one', placed.lobbyStuck === 0 && placed.lobbyState === 'warmup',
   JSON.stringify({ stuck: placed.lobbyStuck, state: placed.lobbyState }) +
   ' — walkTo sets position directly on a body integrate is ghosting, so it walks straight in');

// ================================================== bots can still play it ==
// ⚠️ A COMPARISON, run twice in one page. An absolute pin-time threshold here is a number
// tuned until it passed, and the interesting failure — the fix making things WORSE — is
// invisible without the other side. That happened: the first detour aimed at the block's
// NEAR corner, which is a place a bot ARRIVES at, so it stood there with the block still
// between it and its target and the worst pin went from 18.6s to 51s.
//
// ⚠️ The "off" side needs no debug switch in the shipped game, and that falls out of the
// one-reader design: `w.field` IS the `FIELDS` entry, and `buildGeometry` has already
// copied the eight walls into `w.walls` by the time the match starts — so deleting
// `.gap` after `startMatch` leaves the PHYSICS exactly as it is and turns off precisely
// the things that ask the field at run time, which is the bot handling. The rects are
// captured first, because the metric needs them after they are gone.
const bots = await p.evaluate(async () => {
  const M = window.__magnet;
  M.sel.mode = '3v3'; M.sel.length = '5'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
  M.sel.diff = 'normal'; M.sel.controllers = 'off'; M.sel.botPlan = 'standard'; M.sel.field = 'faceoff';
  const spec = M.FIELDS.faceoff.gap;
  const run = (seed, off) => {
    M.FIELDS.faceoff.gap = spec;
    M.setMatchSeed(seed); M.startMatch();
    const w = M.world; w.players.forEach(q => q.ctrl = 'bot');
    w.state = 'play'; w.stateT = 1;
    const rs = M.gapRects(w.field);
    if (off) delete M.FIELDS.faceoff.gap;    // walls stay; only the run-time readers stop
    // Pinned: on a face, not moving, AND its own target is somewhere else. See the header.
    const pinned = q => Math.hypot(q.vx, q.vy) < 0.3
      && q.aiTarget && Math.hypot(q.aiTarget.x - q.x, q.aiTarget.y - q.y) > 40
      && rs.some(g => q.x > g.x0 - q.r - 3 && q.x < g.x1 + q.r + 3 && q.y > g.y0 - q.r - 3 && q.y < g.y1 + q.r + 3);
    const streak = w.players.map(() => 0);
    let worst = 0, pinnedSteps = 0, steps = 0, minY = 0, maxY = 0;
    for (let i = 0; i < 60 * 90; i++){
      M.step(w); steps++;
      if (w.state === 'over') break;
      if (w.state !== 'play') continue;
      minY = Math.min(minY, w.ball.y); maxY = Math.max(maxY, w.ball.y);
      w.players.forEach((q, j) => {
        if (pinned(q)){ streak[j]++; pinnedSteps++; } else streak[j] = 0;
        worst = Math.max(worst, streak[j]);
      });
    }
    const hl = w.bounds.halfL;
    return { goals: w.score[0] + w.score[1], worst: +(worst / 60).toFixed(1),
             pin: +(100 * pinnedSteps / (steps * w.players.length)).toFixed(2),
             reach: [minY / hl, maxY / hl] };
  };
  const sweep = (off) => {
    const rs = [101, 202, 303].map(s => run(s, off));
    return { goals: rs.reduce((a, r) => a + r.goals, 0),
             worst: Math.max(...rs.map(r => r.worst)),
             pin: +(rs.reduce((a, r) => a + r.pin, 0) / rs.length).toFixed(2),
             // ⚠️ Over the SWEEP, not per match. A 2-0 in which the losing side never got
             // out of its own half is a real football result, and requiring both ends of
             // every single match makes this a check on the seeds.
             bothEnds: Math.min(...rs.map(r => r.reach[0])) < -0.8 &&
                       Math.max(...rs.map(r => r.reach[1])) > 0.8 };
  };
  const live = sweep(false);
  const off = sweep(true);
  M.FIELDS.faceoff.gap = spec;
  return { live, off, restored: !!M.FIELDS.faceoff.gap };
});

ok('bots score on the gap pitch', bots.live.goals > 0, JSON.stringify(bots.live));
// ⚠️ This one catches the waypoint version, and nothing else did: swapping `aiTarget` for
// a corner pulled the chaser off the ball whenever its run happened to clip a block, and
// scoring fell from 7 goals over the sweep to 1 while every containment check stayed green.
ok('...and the steering does not cost them the game', bots.live.goals * 2 >= bots.off.goals,
   `${bots.live.goals} goals with the gap steering, ${bots.off.goals} without`);
ok('...and work the ball to both ends', bots.live.bothEnds, JSON.stringify(bots.live));
ok('the gap steering keeps bots off the faces', bots.live.pin * 3 < bots.off.pin,
   `pinned ${bots.live.pin}% of bot-time with it, ${bots.off.pin}% without — a comparison, never a tuned threshold`);
ok('...and no bot is pinned for long', bots.live.worst * 3 < bots.off.worst,
   `worst continuous pin ${bots.live.worst}s with it, ${bots.off.worst}s without`);
ok('the comparison is not vacuous', bots.off.pin > 1,
   `${bots.off.pin}% — with the steering off bots MUST press on the faces, or this check proves nothing`);

// ========================================================= it is drawn, visibly ==
// ⚠️ Measured as a DIFFERENCE against the same frame with the gap taken off the field,
// never as an absolute ink count: the pitch already carries mown stripes, a halfway line
// and a centre circle, and an absolute reading of the middle of the court is mostly those.
const drawn = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const cv = document.getElementById('game'), c = cv.getContext('2d');
  const frame = (pal, withGap) => {
    const save = M.FIELDS.faceoff.gap;
    if (!withGap) delete M.FIELDS.faceoff.gap;
    M.sel.look.palette = pal; M.sel.look.field = 'none'; M.applyTheme(pal);
    M.sel.mode = '1v1'; M.sel.controllers = 'off'; M.sel.lobby = 'off'; M.sel.field = 'faceoff';
    M.setMatchSeed(4); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    w.players.forEach(q => { q.x = 9e4; q.y = 9e4; });     // bodies off, or they are the difference
    w.ball.x = 9e4; w.ball.y = 9e4;
    M.computeCam(); M.render();
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    if (!withGap) M.FIELDS.faceoff.gap = save;
    return d;
  };
  const probe = (pal) => {
    const rs = M.gapRects(M.FIELDS.faceoff);
    const g = rs[1];
    const a = frame(pal, true), bF = frame(pal, false);
    // sample points: inside a block, and in the slot (which must NOT have changed)
    const pts = { block: [], slot: [] };
    for (let i = 1; i < 8; i++)
      for (let j = 1; j < 4; j++)
        pts.block.push([g.x0 + (g.x1 - g.x0) * i / 8, g.y0 + (g.y1 - g.y0) * j / 4]);
    for (let i = 1; i < 8; i++) pts.slot.push([g.x0 + (g.x1 - g.x0) * i / 8, 0]);
    const diff = (list) => {
      let n = 0, worstContrast = 0;
      for (const [x, y] of list){
        const sx = Math.round(M.wx(x)), sy = Math.round(M.wy(y));
        const k = (sy * document.getElementById('game').width + sx) * 4;
        const d0 = Math.abs(a[k] - bF[k]) + Math.abs(a[k+1] - bF[k+1]) + Math.abs(a[k+2] - bF[k+2]);
        // ⚠️ 10, not a round-looking 24: two identical renders differ by EXACTLY zero, so
        // any positive threshold detects "something is drawn here" — and the sample points
        // that land under a hatch stroke came back at 30 against a bare-court difference of
        // 98, which left a 24 with no margin at all and failed three points at random.
        if (d0 > 10) n++;
        worstContrast = Math.max(worstContrast, d0);
      }
      return { n, of: list.length, worstContrast };
    };
    return { block: diff(pts.block), slot: diff(pts.slot) };
  };
  o.faceoff = probe('faceoff');
  o.grass = probe('grass');
  o.chalk = probe('chalk');           // ⚠️ a LIGHT palette: TH.fieldBg is pale there, which
                                      // is why the block carries a TH.obstacle stroke too
  // the picker tile draws it from the same gapRects
  const tc = document.createElement('canvas'); tc.width = tc.height = 128;
  const t2 = tc.getContext('2d');
  M.drawFieldPreview(t2, M.FIELDS.faceoff, 128, 128, 'stripes');
  const withT = t2.getImageData(0, 0, 128, 128).data;
  const save = M.FIELDS.faceoff.gap; delete M.FIELDS.faceoff.gap;
  M.drawFieldPreview(t2, M.FIELDS.faceoff, 128, 128, 'stripes');
  const noT = t2.getImageData(0, 0, 128, 128).data;
  M.FIELDS.faceoff.gap = save;
  let tileDiff = 0;
  for (let i = 0; i < withT.length; i += 4)
    if (Math.abs(withT[i] - noT[i]) + Math.abs(withT[i+1] - noT[i+1]) + Math.abs(withT[i+2] - noT[i+2]) > 24) tileDiff++;
  o.tileDiff = tileDiff;
  return o;
});

for (const pal of ['faceoff', 'grass', 'chalk']){
  const d = drawn[pal];
  ok(`the gap is drawn on ${pal}`, d.block.n === d.block.of,
     `${d.block.n}/${d.block.of} sample points changed — measured as a difference against the same frame with no gap`);
  ok(`...and it is VISIBLE against that court`, d.block.worstContrast >= 60,
     `peak channel difference ${d.block.worstContrast} — a hex says nothing about what alpha did to it`);
  ok(`...and the slot is left as court on ${pal}`, d.slot.n === 0,
     `${d.slot.n}/${d.slot.of} — the halfway slot must stay open or the kickoff spot is inside the wall`);
}
ok('the picker tile draws the gap too', drawn.tileDiff > 200,
   `${drawn.tileDiff} pixels — a tile showing a plain rectangle would be offering a pitch you do not get`);

// =========================================================== the Other tab ==
const tab = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.openLook('match'); if (M.showSubTab) M.showSubTab('match', 'pitch');
  M.setFieldShapeTab('other');
  const tiles = [...document.querySelectorAll('#fields .opt')];
  const tile = tiles.find(x => /Faceoff/i.test(x.textContent));
  o.tagged = tile && tile.dataset.shape;
  o.visibleUnderOther = tile ? tile.getBoundingClientRect().height > 0 : false;
  M.setFieldShapeTab('square');
  o.hiddenUnderSquare = tile ? tile.getBoundingClientRect().height === 0 : false;
  o.stillInTheDom = tiles.length === Object.keys(M.FIELDS).length;
  M.setFieldShapeTab('other');
  return o;
});

ok('the Faceoff tile is tagged other', tab.tagged === 'other', String(tab.tagged));
ok('...and shows under the Other tab', tab.visibleUnderOther);
ok('...and is hidden under Square', tab.hiddenUnderSquare);
ok('...with every tile still in the DOM', tab.stillInTheDom);

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ t, move, ball, bots, drawn, tab }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL gapfield\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS gapfield');
