// BOTS DRIBBLE, KEEP THE BALL AND GET OPEN — asked for as "stop them from kicking the ball
// all the time. They should try to dribble and position better. Have them play team sport".
//
// ⚠️ MEASURED FIRST, all-bot 3v3 at the shipped feel, twelve one-minute matches a tier (a
// scratch probe, the numbers are in CLAUDE.md): Normal kicked 47 times a minute, 81% of
// them the instant the ball arrived, the median "shot" was struck 374 units from goal on a
// 760 pitch, a third of passes arrived, and a bot on the ball had a mate free to pass to 3%
// of the time. Every claim below is a DIFFERENCE against the same thing with one piece of
// the change stood down, in the same run, never an absolute.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
p.on('pageerror', e => errors.push(e.message));
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(() => {
  const M = window.__magnet, o = {}, B = M.BOT;
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  M.sel.mode = '3v3'; M.sel.length = '5'; M.sel.lobby = 'off';
  M.sel.controllers = 'off'; M.sel.autoReplay = false; M.sel.botPlan = 'standard';
  const allBots = (diff, seed) => {
    M.setMatchSeed(seed); M.sel.diff = diff; M.startMatch();
    const w = M.world; w.players.forEach(q => { q.ctrl = 'bot'; }); w.state = 'play'; w.stateT = 1;
    return w;
  };
  const withBot = (ov, fn) => { const sv = {}; for (const k in ov){ sv[k] = B[k]; B[k] = ov[k]; }
    try { return fn(); } finally { Object.assign(B, sv); } };
  o.trapOff = !!allBots('normal', 1).trapOff;
  o.everyTierDribbles = Object.keys(M.DIFF).every(k => M.botSkill(M.DIFF[k]).dribble === true);

  // ---- 1. WITH ROOM IN FRONT, A BOT RUNS THE BALL RATHER THAN STRIKING IT. One bot on the
  // ball in its own half, every other body parked in the corners of its OWN end and frozen.
  // Paired with the same setup with the dribble switched off, which kicks: "it did not kick"
  // is otherwise equally true of a bot that never reaches the ball.
  const solo = () => {
    const w = allBots('insane', 7);
    const me = w.players.find(q => q.team === 0);
    const att = -1, halfL = w.field.L / 2, halfW = w.field.W / 2;
    let k = 0;
    for (const q of w.players){ if (q === me) continue;
      q.aiFrozen = true; q.inX = q.inY = 0; q.vx = q.vy = 0;
      q.x = (k++ % 2 ? 1 : -1) * (halfW - 30); q.y = -att * (halfL - 30 - 40 * (k >> 1)); }
    me.x = 0; me.y = 150; me.vx = me.vy = 0;
    w.ball.x = 0; w.ball.y = 120; w.ball.vx = w.ball.vy = 0;
    const y0 = w.ball.y; let kicked = -1, worstGap = 0;
    const kt0 = w.ball.lastKickT;
    for (let i = 0; i < 90; i++){
      M.step(w);
      if (kicked < 0 && w.ball.lastKicker === me && w.ball.lastKickT !== kt0) kicked = i;
      if (i > 20 && kicked < 0) worstGap = Math.max(worstGap, Math.hypot(w.ball.x - me.x, w.ball.y - me.y));
    }
    return { kicked, advanced: +((w.ball.y - y0) * att).toFixed(1), worstGap: +worstGap.toFixed(1), kind: me.aiKind };
  };
  o.solo = solo();
  o.soloOff = withBot({ dribbleAt: 9 }, solo);
  o.runsIt = o.solo.kicked < 0 && o.solo.advanced > 60;
  o.keepsIt = o.solo.kicked < 0 && o.solo.worstGap < 75;
  o.offKicks = o.soloOff.kicked >= 0;

  // ---- 2. A DRIBBLE IS A RACE, NOT A GAP. The same bot with one opponent stood a stride in
  // front of the ball does not pick the run; moved 200 units away to the side, it does.
  {
    const w = allBots('insane', 8);
    const me = w.players.find(q => q.team === 0), mates = w.players.filter(q => q.team === 0);
    const opp = w.players.filter(q => q.team !== 0);
    for (const q of w.players){ q.vx = q.vy = 0; }
    for (const q of opp){ q.x = -150; q.y = 330; }
    for (const q of mates) if (q !== me){ q.x = 150; q.y = 330; }
    me.x = 0; me.y = 40; w.ball.x = 0; w.ball.y = 10; w.ball.vx = w.ball.vy = 0;
    const sk = M.botSkill(w.diff);
    opp[0].x = 0; opp[0].y = -40;
    const shut = M.botPickAim(w, me, w.ball, mates, sk);
    opp[0].x = 200; opp[0].y = 300;
    const free = M.botPickAim(w, me, w.ball, mates, sk);
    o.race = { shut: shut.kind, free: free.kind };
    o.pressureStopsIt = shut.kind !== 'dribble' && free.kind === 'dribble';
  }

  // ---- 3. A PASS INTO TRAFFIC IS NOT PLAYED (`passMinOpen`/`passShutPen`) — measured over
  // matches in block 5, because a single picture cannot isolate it: with nothing better on
  // offer a marked pass still wins, and with the dribble on the run usually wins anyway.
  // What the penalty buys is passes that ARRIVE: Insane 28% → 53% over twelve seeds.

  // ---- 4. THE SUPPORT RUNS TO A CELL NOBODY IS STANDING ON (`wGridFree`). Score the grid
  // once, stand an opponent on the cell it chose, score it again from scratch: the second
  // choice must move away from him. With the term at 0 it stays put — the grid only ever
  // counted TEAMMATES near a cell, so the best spot was routinely one with a marker on it.
  {
    const w = allBots('insane', 10);
    for (let i = 0; i < 40; i++) M.step(w);
    const team = 0, att = -1;
    const sup = w.players.find(q => q.team === team && q.aiRole === 'support');
    o.grid = { found: !!sup };
    if (sup){
      const carrier = w.ai[team].press;
      const opp = w.players.filter(q => q.team !== team);
      for (const q of opp){ q.x = 160; q.y = 360; }     // out of the way, deep in their own end
      const pick = () => { sup.aiSpot = null; w.ai[team].gridWho = 0; M.botUpdateSupportGrid(w, team); return { x: sup.aiSpot.x, y: sup.aiSpot.y }; };
      const first = pick();
      opp[0].x = first.x; opp[0].y = first.y;
      const onOff = withBot({ wGridFree: 0 }, pick);
      const onOn = pick();
      // Distance from the MARKER, both arms measured against the same man in the same place.
      o.grid = { found: true, first, off: onOff, on: onOn,
        dOff: +Math.hypot(onOff.x - opp[0].x, onOff.y - opp[0].y).toFixed(1),
        dOn: +Math.hypot(onOn.x - opp[0].x, onOn.y - opp[0].y).toFixed(1), carrier: !!carrier };
    }
    o.supportAvoidsMarker = !!sup && o.grid.dOn > 80 && o.grid.dOn > o.grid.dOff + 40;
  }

  // ---- 5. OVER WHOLE MATCHES, against the same seeds with the change stood down. Kicks a
  // minute, the share of chaser-time spent dribbling at the ball, how far from goal a shot
  // is struck, and how often a pass arrives (the next touch is a mate's).
  const match = (diff, ov) => withBot(ov, () => {
    let kicks = 0, mins = 0, chT = 0, drT = 0, passes = 0, passOk = 0; const shotD = [];
    for (const seed of [11, 22, 33, 44, 55, 66]){
      const w = allBots(diff, seed);
      let lastKT = -1, pend = null; const near = new Map();
      let steps = 0;
      for (let i = 0; i < 3600; i++){
        M.step(w); steps++; if (w.state === 'over') break;
        if (w.state !== 'play') continue;
        const bl = w.ball;
        for (const q of w.players){
          const inR = Math.hypot(q.x - bl.x, q.y - bl.y) < q.r + bl.r + 12;
          if (inR && !near.get(q) && pend && q !== pend.who){ if (q.team === pend.team) passOk++; pend = null; }
          near.set(q, inR);
          if (q.aiRole === 'chaser'){ chT++; if (q.aiKind === 'dribble' && Math.hypot(q.x - bl.x, q.y - bl.y) < 45) drT++; }
        }
        if (bl.lastKicker && bl.lastKickT !== lastKT){
          lastKT = bl.lastKickT; const k = bl.lastKicker; kicks++; pend = null;
          if (k.aiKind === 'pass'){ passes++; pend = { team: k.team, who: k }; }
          if (k.aiKind === 'goal') shotD.push(Math.hypot(bl.x, bl.y - (k.team === 0 ? -1 : 1) * w.field.L / 2));
        }
      }
      mins += steps / 3600;
    }
    shotD.sort((a, c) => a - c);
    return { kicksPerMin: +(kicks / mins).toFixed(1), dribblePct: +(100 * drT / Math.max(1, chT)).toFixed(1),
             shotMed: Math.round(shotD[shotD.length >> 1] || 0), passOk: +(100 * passOk / Math.max(1, passes)).toFixed(0), passes };
  });
  o.normal = match('normal', {});
  o.normalNoDribble = match('normal', { dribbleAt: 9 });
  o.normalLongShots = match('normal', { shotFarProg: 0 });
  o.fewerKicks = o.normal.kicksPerMin < o.normalNoDribble.kicksPerMin * 0.88;
  o.dribblesInMatches = o.normal.dribblePct > 5 && o.normalNoDribble.dribblePct === 0;
  // Measured 232 against 269 with `shotFarProg` at 0 and 332 with the dribble off; the
  // pre-change build read 374. Both halves move it, so it is held against the nearer one.
  o.insane = match('insane', {});
  o.insaneShutOff = match('insane', { passShutPen: 0 });
  o.passesArrive = o.insane.passOk > o.insaneShutOff.passOk + 8;
  o.shootsFromCloser = o.normal.shotMed < Math.min(o.normalLongShots.shotMed, o.normalNoDribble.shotMed) * 0.9;

  // ---- 6. Same seed, same match: nothing here may roll a number.
  const hash = () => { const w = allBots('insane', 77); for (let i = 0; i < 900; i++) M.step(w);
    return w.players.map(q => q.x.toFixed(6) + ',' + q.y.toFixed(6)).join('|') + '|' + w.ball.x.toFixed(6); };
  o.deterministic = hash() === hash();

  M.sel.diff = 'normal'; M.setMatchSeed(null);
  return o;
});

await p.close();
console.log(JSON.stringify(r, null, 1));

let bad = 0;
const ok = (name, cond, note = '') => { if (!cond){ bad++; console.log('  FAIL ' + name + (note ? ' — ' + note : '')); } };
ok('the shipped feel is one-touch', r.trapOff, 'the dribble is a one-touch behaviour; re-point this file if the default moves');
ok('every tier dribbles', r.everyTierDribbles, '`BOT.dribbleAt` — a rookie that only hoofs is what inverted the 3v3 ladder');
ok('with room in front, a bot runs the ball forward rather than striking it', r.runsIt, JSON.stringify(r.solo));
ok('...and keeps it close while it does', r.keepsIt, JSON.stringify(r.solo) + ' — worst ball-to-body gap once under way');
ok('...where the same bot with the dribble off kicks', r.offKicks, JSON.stringify(r.soloOff));
ok('an opponent in the run shuts the dribble; the same opponent out wide does not', r.pressureStopsIt, JSON.stringify(r.race));
ok('the support runs to a cell nobody is standing on', r.supportAvoidsMarker, JSON.stringify(r.grid));
ok('over whole matches the bots kick less', r.fewerKicks, JSON.stringify({ on: r.normal, off: r.normalNoDribble }));
ok('...and dribble at the ball', r.dribblesInMatches, JSON.stringify({ on: r.normal, off: r.normalNoDribble }));
ok('...and a pass is not played to a marked mate, so more of them arrive', r.passesArrive, JSON.stringify({ on: r.insane, shutOff: r.insaneShutOff }));
ok('...and shoot from closer in', r.shootsFromCloser, JSON.stringify({ on: r.normal, longShots: r.normalLongShots }));
ok('the same seed plays the same match', r.deterministic);
ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(bad ? 'FAIL botdribble' : 'PASS botdribble');
await b.close();
process.exit(bad ? 1 : 0);
