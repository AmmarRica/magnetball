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
import { chromium, LAUNCH, pinCasualFeel } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport: { width: 900, height: 1000 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);
await pinCasualFeel(p);   // see _browser.mjs — the default ships the Pro preset

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

  // ⚠️ **THE INVARIANTS ARE CHECKED ON EVERY GAP FIELD, never on one by name.** The three
  // fractions cannot be shared between courts: the slot has to clear `CENTER_R`, which is
  // an absolute 58 world units, so the fraction it needs RISES as the court gets shorter.
  // Faceoff's `slot: 0.15` is 76.5 units on a 1020 length and only 57 on a 760 one, which
  // is inside the circle — so a second gap court that copied the numbers would be broken
  // in a way no check written against `faceoff` could see.
  o.inv = {};
  for (const k of o.withGaps){
    const f = M.FIELDS[k], rs = M.gapRects(f), g = rs[1];
    o.inv[k] = {
      channel: f.W / 2 - g.x1,
      channelTakesTwo: (f.W / 2 - g.x1) >= 2 * (M.PLAYER ? M.PLAYER.r * 2 : 30),
      slotClearsCircle: g.y0 - M.CENTER_R >= 15,
      blocksInsideThePitch: g.y1 < f.L / 2 && g.x1 < f.W / 2,
      deep: g.y1 - g.y0 > 20,
      symmetric: rs[0].y0 === -g.y1 && rs[0].y1 === -g.y0 && rs[0].x0 === g.x0 && rs[0].x1 === g.x1,
    };
  }

  // ⚠️ Filed under Other, which is what was asked for. `other` was already written as a
  // genuine catch-all for "a shape that does not exist yet", so this is that case.
  o.shapes = {};
  for (const k of o.withGaps) o.shapes[k] = M.fieldShape(M.FIELDS[k]);
  o.classicShape = M.fieldShape(M.FIELDS.classic);

  // Geometry, from the real builder.
  M.sel.mode = '1v1'; M.sel.controllers = 'off'; M.sel.kickoffRule = 'off'; M.sel.lobby = 'off';
  o.geom = {};
  for (const k of o.withGaps){
    M.sel.field = k; M.setMatchSeed(3); M.startMatch();
    const w = M.world;
    o.geom[k] = {
      gapWalls: w.walls.filter(x => x.isGap).length,
      solidWalls: w.walls.filter(x => !x.ballOnly).length,
      everyGapWallIsSolid: w.walls.filter(x => x.isGap).every(x => !x.ballOnly),
      boundaryStillBallOnly: w.walls.filter(x => !x.isGap).every(x => !!x.ballOnly),
    };
  }
  M.sel.field = 'classic'; M.startMatch();
  o.classicSolidWalls = M.world.walls.filter(x => !x.ballOnly).length;
  return o;
});

const GAPS = t.withGaps;
ok('the gap fields are exactly the two shipped ones', GAPS.join(',') === 'faceoff,island',
   JSON.stringify(GAPS) + ` of ${t.fieldCount} — gapRects returning [] is what makes every helper inert on the rest`);
ok('...and Classic has no wall that blocks a player', t.classicSolidWalls === 0,
   `${t.classicSolidWalls} — every boundary wall is ballOnly, and the gap is the only exception anywhere`);
for (const k of GAPS){
  const g = t.geom[k], v = t.inv[k];
  ok(`${k}: the gap is eight walls, all solid to players`,
     g.gapWalls === 8 && g.everyGapWallIsSolid && g.solidWalls === 8, JSON.stringify(g));
  ok(`${k}: ...and the boundary is still ballOnly`, g.boundaryStillBallOnly,
     'the step-out margin has to stay uniform all the way round — the gap is interior, not a board');
  ok(`${k}: the two blocks mirror about the halfway line`, v.symmetric, JSON.stringify(v));
  ok(`${k}: the channels take two bodies abreast`, v.channelTakesTwo,
     `${v.channel} units — any tighter and you cannot get past a defender at all`);
  // ⚠️ The check that catches a second court built by copying Faceoff's fractions: the
  // slot is a FRACTION and the circle it must clear is an ABSOLUTE 58.
  ok(`${k}: the slot clears the centre circle`, v.slotClearsCircle,
     'KICKOFF_CIRCLE_R === CENTER_R: the half-line rule\'s gate IS the drawn circle, so a block over it is a gate nobody can stand in');
  ok(`${k}: the blocks stay inside the pitch`, v.blocksInsideThePitch, JSON.stringify(v));
  ok(`${k}: ...and are deep enough to be a barrier`, v.deep, JSON.stringify(v));
  ok(`${k}: is filed under Other`, t.shapes[k] === 'other', String(t.shapes[k]));
}
ok('...and an ordinary rectangle is still Square', t.classicShape === 'square', t.classicShape);

// ============================================ players: kept out, and let round ==
// ⚠️ **EVERY PROBE POSITION IS DERIVED FROM THE FIELD, never typed in.** The first version
// used absolute coordinates tuned to Faceoff Orbit — y = ±400 on a court whose half length
// is 510 — and the same numbers on the 760-long Island are past the goal line, so the
// second court would have been "tested" from outside the pitch.
const move = await p.evaluate((keys) => {
  const M = window.__magnet, out = {};
  for (const key of keys){
    const o = {};
    // ⚠️ The ball is parked somewhere LEGAL and RE-PARKED every step — see the header.
    // Every other body is parked too, or a bot wanders into the body being measured.
    const bounds = () => M.world.bounds;
    const park = (w) => {
      const b = w.bounds;
      w.ball.x = b.halfW * 0.7; w.ball.y = b.halfL * 0.85; w.ball.vx = 0; w.ball.vy = 0;
      w.players.slice(1).forEach(q => { q.x = -b.halfW * 0.7; q.y = -b.halfL * 0.85; q.vx = 0; q.vy = 0; });
    };
    const fresh = () => {
      M.sel.mode = '1v1'; M.sel.controllers = 'off'; M.sel.kickoffRule = 'off'; M.sel.lobby = 'off';
      M.sel.field = key; M.setMatchSeed(7); M.startMatch();
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
    const at = (fn) => { const w = fresh(), me = w.players[0]; const s2 = fn(rects(w)[1], w.bounds);
      me.x = s2.x; me.y = s2.y; me.vx = 0; me.vy = 0; return [w, me]; };

    // straight at the near face, from inside the halfway slot
    { const [w, me] = at(g => ({ x: 0, y: g.y0 * 0.25 }));
      o.fromSlot = { in: drive(w, me, 0, 1, 600), y: +me.y.toFixed(1), edge: rects(w)[1].y0 }; }
    // ...and at the far face, from up-field of the block
    { const [w, me] = at((g, b) => ({ x: 0, y: Math.min(b.halfL - 40, g.y1 + 150) }));
      o.fromBehind = { in: drive(w, me, 0, -1, 600), y: +me.y.toFixed(1), edge: rects(w)[1].y1 }; }
    // ...and diagonally at a corner of it
    { const [w, me] = at((g, b) => ({ x: -(b.halfW - 20), y: Math.min(b.halfL - 40, g.y1 + 120) }));
      o.atCorner = { in: drive(w, me, 0.7, -0.7, 600) }; }
    // both channels, end to end. ⚠️ Paired with the checks above on purpose: "a player
    // cannot enter the gap" is equally true of a pitch nobody can cross at all.
    for (const [nm, sgn] of [['right', 1], ['left', -1]]){
      const [w, me] = at((g, b) => ({ x: sgn * (g.x1 + b.halfW) / 2, y: -(b.halfL - 60) }));
      o['channel_' + nm] = { in: drive(w, me, 0, 1, 1200), y: +me.y.toFixed(1),
                             reached: me.y > w.bounds.halfL - 60 };
    }
    // ...and across the halfway slot, which is what keeps the kickoff spot reachable
    { const [w, me] = at((g, b) => ({ x: -(g.x1 + b.halfW) / 2, y: 0 }));
      const started = me.x;
      o.acrossSlot = { in: drive(w, me, 1, 0, 900), x: +me.x.toFixed(1),
                       crossed: me.x > -started * 0.6 }; }
    out[key] = o;
  }
  return out;
}, GAPS);

for (const k of GAPS){
  const m = move[k];
  ok(`${k}: a player driven at a block is stopped by it`,
     m.fromSlot.in === 0 && m.fromSlot.y < m.fromSlot.edge, JSON.stringify(m.fromSlot));
  ok(`${k}: ...from the far side too`,
     m.fromBehind.in === 0 && m.fromBehind.y > m.fromBehind.edge, JSON.stringify(m.fromBehind));
  ok(`${k}: ...and driven diagonally at a corner`, m.atCorner.in === 0, JSON.stringify(m.atCorner));
  ok(`${k}: the right-hand channel runs end to end`,
     m.channel_right.in === 0 && m.channel_right.reached, JSON.stringify(m.channel_right));
  ok(`${k}: ...and so does the left-hand one`,
     m.channel_left.in === 0 && m.channel_left.reached, JSON.stringify(m.channel_left));
  ok(`${k}: the slot crosses from one channel to the other`,
     m.acrossSlot.in === 0 && m.acrossSlot.crossed,
     JSON.stringify(m.acrossSlot) + ' — the slot is what keeps the kickoff spot reachable');
}

// ================================================= the ball, and the kickoff ==
const ball = await p.evaluate((keys) => {
  const M = window.__magnet, out = {};
  for (const key of keys){
    const o = {};
    M.sel.mode = '1v1'; M.sel.controllers = 'off'; M.sel.lobby = 'off';
    M.sel.field = key; M.setMatchSeed(9); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    const rs = M.gapRects(w.field), g = rs[1], b = w.bounds;
    const inGap = (x, y) => rs.some(r => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1);
    // Fired at every face, at and beyond the speed cap, from positions derived from the
    // court. ⚠️ Never STARTED inside — the first run seeded a shot at (0,-95), which is in
    // a block, and reported 800 frames "inside" as though the wall had failed.
    const far = b.halfL * 0.8, wide = b.halfW * 0.85, near = g.y0 * 0.5;
    const shots = [[0,-far,0,30], [0,far,0,-30], [-wide,-far,26,20], [wide,far,-26,-20],
                   [0,-near,0,-30], [-wide,0,30,4], [0,near,4,30],
                   [0,-far,0,60], [-wide,-far,45,32]];
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
    out[key] = o;
  }
  return out;
}, GAPS);

for (const k of GAPS){
  const bl = ball[k];
  ok(`${k}: the probe never starts the ball inside a block`, bl.startedInside === 0, `${bl.startedInside}`);
  ok(`${k}: the ball bounces off the gap and never rests in it`, bl.inside === 0,
     `${bl.inside} frames inside over ${bl.shots} shots × 900 steps at and above the speed cap`);
  ok(`${k}: nobody kicks off inside the gap, at any roster size`, bl.badStarts.length === 0,
     JSON.stringify(bl.badStarts) + ' — layTeam pushes the mark out, and homeX/homeY is written from the pushed spot');
}

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

  // The warm-up lobby row, at every side size the stepper can reach, on EVERY gap court.
  o.lobbySpots = [];
  for (const key of Object.keys(M.FIELDS).filter(x => M.gapRects(M.FIELDS[x]).length)){
    const f = M.FIELDS[key];
    const stub = { field: f, bounds: { halfW: f.W / 2, halfL: f.L / 2 } };
    for (let cnt = 1; cnt <= 8; cnt++)
      for (let i = 0; i < cnt; i++)
        for (const team of [0, 1]){
          const sp = M.lobbySpotFor(stub, team, i, cnt);
          if (inGap(stub, sp.x, sp.y)) o.lobbySpots.push([key, cnt, i, team]);
        }
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

// ============================= a theme may name the pitch it was drawn for ==
// ⚠️ Reported as *"I selected the theme and I can't see the correct pitch"*. The theme and
// the court share the name `faceoff` and are different tables reached from different cards:
// `THEME_BUNDLES.faceoff.field` is a DYN_FIELDS PAINTER, `FIELDS.faceoff` is the court with
// the gap. Picking the theme painted the sky and left you on Classic.
const theme = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const tileH = (re) => {
    const t = [...document.querySelectorAll('#fields .opt')].find(x => re.test(x.textContent));
    return t ? +t.getBoundingClientRect().height.toFixed(0) : -1;
  };
  M.openLook('match'); if (M.showSubTab) M.showSubTab('match', 'pitch');

  // Only bundles that were drawn FOR a court carry one. Everything else is a treatment
  // that works on any rectangle and must never move somebody's pitch.
  o.withPitch = M.bundleKeys().map(k => [k, M.bundlePitch(k)]).filter(x => x[1]);

  // ⚠️ Start on Classic AND with the shape row stuck on a different tab. That second half
  // is the real trap: `fieldShapeNow()` is sticky once a chip has been tapped, so a theme
  // that moves `sel.field` into another group can leave the tile it just selected HIDDEN.
  M.sel.field = 'classic'; M.saveSel(); M.refreshPitchTiles();
  M.setFieldShapeTab('square');
  o.hiddenBefore = tileH(/Faceoff/i);
  const n0 = document.querySelectorAll('#toasts .toast').length;
  M.applyBundle('faceoff');
  o.toasts = document.querySelectorAll('#toasts .toast').length - n0;
  o.toastText = [...document.querySelectorAll('#toasts .toast')].map(x => x.textContent).slice(-1)[0] || '';
  o.field = M.sel.field;
  o.tab = [...document.querySelectorAll('#fieldShapes .sel')].map(x => x.dataset.shape)[0];
  o.visibleAfter = tileH(/Faceoff/i);
  o.markedSelected = ![...document.querySelectorAll('#fields .opt.sel')]
    .every(x => !/Faceoff/i.test(x.textContent));

  // Picking it again while already there writes nothing and says nothing.
  const n1 = document.querySelectorAll('#toasts .toast').length;
  M.applyBundle('faceoff');
  o.secondToast = document.querySelectorAll('#toasts .toast').length - n1;

  // ⚠️ THE IDENTITY INVARIANT: the pitch is something a bundle DOES, not part of what it
  // IS. Folded into `bundleSlots`, changing your court afterwards would silently rename
  // your theme to Custom.
  o.bundleBefore = M.currentBundle();
  M.selectField('island');
  o.bundleAfterPitchChange = M.currentBundle();
  o.fieldAfter = M.sel.field;

  // ...and a bundle with no pitch leaves the court exactly where it is.
  const plain = M.bundleKeys().find(k => !M.bundlePitch(k) && k !== 'faceoff');
  M.applyBundle(plain);
  o.plainBundle = plain; o.fieldAfterPlain = M.sel.field;
  return o;
});

ok('only a bundle drawn for a court names one', theme.withPitch.length === 1 && theme.withPitch[0][0] === 'faceoff',
   JSON.stringify(theme.withPitch) + ' — every other look is a treatment that works on any rectangle');
ok('picking the theme puts you on its pitch', theme.field === 'faceoff', theme.field);
ok('...and says so', theme.toasts === 1 && /Faceoff Orbit/.test(theme.toastText),
   JSON.stringify({ n: theme.toasts, text: theme.toastText }) + ' — a setting that moves under your hand is worse than one you had to find');
ok('...and the picker follows it', theme.tab === 'other' && theme.visibleAfter > 0 && theme.markedSelected,
   JSON.stringify({ tab: theme.tab, before: theme.hiddenBefore, after: theme.visibleAfter }) +
   ' — fieldShapeNow() is sticky, so without clearing it the tile just selected stays hidden');
ok('...and the tile really was hidden to begin with', theme.hiddenBefore === 0,
   `${theme.hiddenBefore}px — if it was visible anyway the check above proves nothing`);
ok('picking it again while already there is silent', theme.secondToast === 0, `${theme.secondToast} toasts`);
ok('changing the pitch afterwards does NOT rename the theme', theme.bundleAfterPitchChange === 'faceoff',
   `${theme.bundleBefore} -> ${theme.bundleAfterPitchChange} — the pitch is what a bundle DOES, not what it IS`);
ok('...and the pitch really did change', theme.fieldAfter === 'island', theme.fieldAfter);
ok('a bundle with no pitch leaves your court alone', theme.fieldAfterPlain === 'island',
   `${theme.plainBundle} moved it to ${theme.fieldAfterPlain}`);

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

console.log(JSON.stringify({ t, move, ball, placed, bots, drawn, theme, tab }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL gapfield\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS gapfield');
