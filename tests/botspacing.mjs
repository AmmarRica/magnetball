// SPACING: A DEFENDER COVERS THE NEXT MAN, AND TWO DEFENDERS NEVER MARK ONE — asked for as
// "I want the game to resemble soccer more so spacing is more important".
//
// ⚠️ MEASURED FIRST, all-bot matches at the shipped feel (numbers in CLAUDE.md): the default
// 3v3 was already spread (a team's two outfield bots ~250 units apart, within 70 of each other
// 5% of the time), and the clumping lived in the bigger games — a team had two outfield
// bodies within 70 units of each other a THIRD of the time at 4v4 and 94% at 6v6. Taken apart
// by role, the biggest single source at 4v4 was the defender doubling the ball carrier with
// its own chaser, and at 6v6 it was both defenders marking the same man.
// Every claim below is a DIFFERENCE against the same match with `coverAt` pushed past the top
// of the ladder (nobody covers) in the same run, never an absolute.
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
  M.sel.length = '5'; M.sel.lobby = 'off';
  M.sel.controllers = 'off'; M.sel.autoReplay = false; M.sel.botPlan = 'standard';
  const withBot = (ov, fn) => { const sv = {}; for (const k in ov){ sv[k] = B[k]; B[k] = ov[k]; }
    try { return fn(); } finally { Object.assign(B, sv); } };
  // there is no 6v6 mode key: a bigger side is `MODES['4v4'].per` raised and put back
  const allBots = (diff, seed, per) => {
    const was = M.MODES['4v4'].per; M.MODES['4v4'].per = per || 4;
    M.sel.mode = '4v4'; M.setMatchSeed(seed); M.sel.diff = diff; M.startMatch({ lobby: false });
    M.MODES['4v4'].per = was;
    const w = M.world; w.players.forEach(q => { q.ctrl = 'bot'; }); w.state = 'play'; w.stateT = 1;
    return w;
  };
  o.ladder = Object.keys(M.DIFF).map(k => M.botSkill(M.DIFF[k]).cover);

  // ---- 1. STAGED: our chaser is on their carrier, a second attacker stands free. A covering
  // defender takes the free man; a rookie (no cover) takes the carrier, which is the double
  // team. Every body but the five named is parked out of the way and the AI is frozen.
  const staged = (diff) => {
    const w = allBots(diff, 3);
    const us = w.players.filter(q => q.team === 1), them = w.players.filter(q => q.team === 0);
    const [chaser, def] = us, [carrier, free] = them;
    const park = (q, x, y) => { q.x = q._px = x; q.y = q._py = y; q.vx = q.vy = 0; };
    w.players.forEach((q, i) => park(q, -200 + i * 20, 360));
    w.ball.x = 0; w.ball.y = 40; w.ball.vx = w.ball.vy = 0;
    park(carrier, 0, 60); park(chaser, 0, 20); park(free, 150, 150); park(def, 60, -200);
    M.botAssignRoles(w, 1);
    chaser.aiRole = 'chaser'; def.aiRole = 'defender'; w.ai[1].press = chaser;
    us.forEach(q => { if (q !== chaser && q !== def) q.aiRole = 'support'; });
    def.aiMark = null; def.aiT = 1; def.aiLag = 0; w.ai[1].tick = w.aiTick; w.ai[1].roleT = 99;
    M.runBot(w, def);
    return def.aiMark === free ? 'free' : def.aiMark === carrier ? 'carrier' : String(def.aiMark && w.players.indexOf(def.aiMark));
  };
  o.stagedInsane = staged('insane');
  o.stagedRookie = staged('rookie');

  // ---- 2. OVER MATCHES: how often a team has two outfield bodies within 70 units, and how
  // often two defenders share one mark. Sampled every tenth step of play.
  const sample = (diff, per, seeds, ov) => withBot(ov || {}, () => {
    let cl = 0, cn = 0, same = 0, sn = 0, mm = 0, mn = 0;
    for (const seed of seeds){
      const w = allBots(diff, seed, per);
      for (let i = 0; i < 3600; i++){ M.step(w); if (w.state === 'over') break;
        if (w.state !== 'play' || i % 10) continue;
        for (const t of [0, 1]){
          const of = w.players.filter(q => q.team === t && q.aiRole !== 'goalie');
          let c = false;
          for (const q of of){ let md = 1e9;
            for (const m of of) if (m !== q) md = Math.min(md, Math.hypot(m.x - q.x, m.y - q.y));
            mm += md; mn++; if (md < 70) c = true; }
          cl += c ? 1 : 0; cn++;
          const defs = of.filter(q => q.aiRole === 'defender' && q.aiMark);
          if (defs.length >= 2){ sn++; if (defs.some((d, k) => defs.some((e, j) => j > k && e.aiMark === d.aiMark))) same++; }
        }
      }
    }
    return { clump: +(100 * cl / cn).toFixed(1), mateMin: Math.round(mm / mn), sameMark: +(100 * same / Math.max(1, sn)).toFixed(1) };
  });
  const S = [11, 22, 33, 44, 55, 66];
  o.n4 = sample('normal', 4, S);  o.n4off = sample('normal', 4, S, { coverAt: 9 });
  o.i6 = sample('insane', 6, S.slice(0, 4)); o.i6off = sample('insane', 6, S.slice(0, 4), { coverAt: 9 });
  o.r6 = sample('rookie', 6, S.slice(0, 2));

  // ---- 3. THE LADDER AT 4v4: Insane over Rookie, both ways round, pooled. Covering is a
  // tier skill BECAUSE of this: handed to every tier it read Insane-over-Rookie +72 → +24
  // pooled over 168 matches, and gated it reads +103 (90s, two seed sets).
  const h2h = (A, Bt, seed, plan) => {
    const w = allBots(Bt, seed);
    w.plan = [M.BOT_PLANS[plan], M.BOT_PLANS[plan]]; M.botAssignRoles(w, 0); M.botAssignRoles(w, 1);
    const a = w.players.filter(q => q.team === 0);
    a.forEach(q => { q.aiFrozen = true; });
    for (let i = 0; i < 90 * 60; i++){
      const sv = w.diff; w.diff = M.DIFF[A];
      a.forEach(q => { q.aiFrozen = false; M.runBot(w, q); q.aiFrozen = true; });
      w.diff = sv; M.step(w); if (w.state === 'over') break;
    }
    return w.score.slice();
  };
  // ⚠️ SEVEN PLANS, NOT ONE, and ninety seconds: a 4v4 scores about two goals a minute
  // between these two, and the standard plan alone over six seeds read +2 on 30 goals — a
  // coin. Pooled it is a reading; per plan it is still noise, so only the pool is asserted.
  let gd = 0, goals = 0;
  for (const plan of Object.keys(M.BOT_PLANS)) for (const seed of [1201, 1302, 1403, 1504, 1605, 1706]){
    const f = h2h('rookie', 'insane', seed, plan), rv = h2h('insane', 'rookie', seed, plan);
    gd += (f[1] - f[0]) + (rv[0] - rv[1]); goals += f[0] + f[1] + rv[0] + rv[1];
  }
  o.ladder4 = { gd, goals };

  // ---- 4. Same seed, same match.
  const hash = () => { const w = allBots('insane', 77, 6); for (let i = 0; i < 900; i++) M.step(w);
    return w.players.map(q => q.x.toFixed(6) + ',' + q.y.toFixed(6)).join('|'); };
  o.deterministic = hash() === hash();
  M.sel.diff = 'normal'; M.setMatchSeed(null);
  return o;
});
console.log(JSON.stringify(r, null, 1));

let bad = 0;
const ok = (msg, c, note) => { if (!c){ bad++; console.log('  FAIL ' + msg + (note ? ' — ' + note : '')); } else console.log('  ok   ' + msg); };
ok('covering is a tier skill: Rookie and Easy do not, Normal and up do', JSON.stringify(r.ladder) === JSON.stringify([false, false, true, true, true, true, true]), JSON.stringify(r.ladder));
ok('a covering defender takes the FREE man, not the one our chaser is on', r.stagedInsane === 'free', r.stagedInsane);
ok('...and a rookie still doubles the carrier (the control)', r.stagedRookie === 'carrier', r.stagedRookie);
ok('4v4: a team stands two outfield bodies within 70 units far less often', r.n4.clump < r.n4off.clump * 0.75, JSON.stringify({ on: r.n4, off: r.n4off }));
ok('...and teammates stand further apart', r.n4.mateMin > r.n4off.mateMin + 5, JSON.stringify({ on: r.n4, off: r.n4off }));
ok('6v6: two defenders never mark the same man', r.i6.sameMark < 1, JSON.stringify(r.i6));
ok('...where without covering they do (the control)', r.i6off.sameMark > 10, JSON.stringify(r.i6off));
ok('...and the side clumps less', r.i6.clump < r.i6off.clump * 0.9, JSON.stringify({ on: r.i6, off: r.i6off }));
ok('a rookie side still doubles up', r.r6.sameMark > 10, JSON.stringify(r.r6));
ok('the 4v4 ladder holds: Insane beats Rookie pooled', r.ladder4.gd > 0 && r.ladder4.goals >= 120, JSON.stringify(r.ladder4));
ok('the same seed plays the same match', r.deterministic);
ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(bad ? 'FAIL botspacing' : 'PASS botspacing');
await b.close();
process.exit(bad ? 1 : 0);
