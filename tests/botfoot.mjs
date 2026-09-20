// BOT FOOTBALL — the turbo, the pass, the run, the mark and the keeper, each a function
// of the tier. Asked for as "allow them to use the turbo and have them be different
// difficulty and mimic real soccer where they play by passing and setting up plays".
//
// ⚠️ MEASURED AT THE SHIPPED FEEL (one-touch), which is the game a player gets. The three
// pinned suites (`botai`, `botplans`, `botstuck`) guard the AI at its own tuning and
// `proladder` guards the ladder at both; this file is about what the football LOOKS like.
// Every claim here is a difference between two tiers taken in the same run, never an
// absolute — a rookie that passes as well as Insane and an Insane that sprints as often as
// a rookie are the two ways "the tiers differ" stops being true.
//
// What the baseline read before any of this, all-bot 3v3 at the shipped feel, four
// two-minute matches a tier: rookie 0 passes aimed and 0% sprint; Normal aimed HALF its
// kicks at a mate and fewer than a fifth arrived (median closest approach to the mate
// 277 units — the kick adds to the ball's own momentum and nobody allowed for it); Insane
// aimed 44% at the goal from anywhere on a 760 pitch whose strike coasts 315.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
p.on('pageerror', e => errors.push(e.message));
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  M.sel.mode = '3v3'; M.sel.length = '5'; M.sel.lobby = 'off';
  M.sel.controllers = 'off'; M.sel.autoReplay = false; M.sel.botPlan = 'standard';
  o.trapOff = M.world ? null : undefined;
  const allBots = (diff, seed) => {
    M.setMatchSeed(seed); M.sel.diff = diff; M.startMatch();
    const w = M.world; w.players.forEach(q => { q.ctrl = 'bot'; }); w.state = 'play'; w.stateT = 1;
    return w;
  };

  // ---- 1. THE TURBO, BY TIER. Counted as the physics' own `sprinting` flag with the body
  // further from the ball than `sprintNear` — a wind-up press at contact can never count.
  const sprintOf = (diff) => {
    let far = 0, spent = 0, ticks = 0, lowest = 1;
    for (const seed of [11, 22]){
      const w = allBots(diff, seed);
      for (let i = 0; i < 3600; i++){
        M.step(w); if (w.state === 'over') break;
        for (const q of w.players){
          ticks++;
          if (q.sprinting && Math.hypot(q.x - w.ball.x, q.y - w.ball.y) > M.BOT.sprintNear) far++;
          if (q.spent) spent++;
          if (q.stam != null) lowest = Math.min(lowest, q.stam);
        }
      }
    }
    return { far, spentPct: +(100 * spent / ticks).toFixed(2), lowest: +lowest.toFixed(2) };
  };
  o.sprint = { rookie: sprintOf('rookie'), normal: sprintOf('normal'), insane: sprintOf('insane') };
  o.rookieNeverSprints = o.sprint.rookie.far === 0;
  o.normalSprints = o.sprint.normal.far > 100;
  o.insaneSprintsMore = o.sprint.insane.far > o.sprint.normal.far * 1.5;
  // The reserve is the judgement: it rises with the tier, so Insane never runs itself tired.
  o.reserveRises = M.botSkill(M.DIFF.insane).reserve > M.botSkill(M.DIFF.normal).reserve &&
                   M.botSkill(M.DIFF.normal).reserve > M.botSkill(M.DIFF.rookie).reserve;
  o.insaneNeverSpent = o.sprint.insane.spentPct < 1;
  o.trapOff = !!M.world.trapOff;

  // ---- 2. A PASS REACHES THE MATE IT WAS MEANT FOR. For every kick aimed at a mate, how
  // close the ball then comes to that mate (wherever he runs) before somebody else touches
  // it — the kick adds to the ball's own momentum, and an aim that ignores that misses by
  // however fast the ball was rolling. Measured as a median over whole matches, Normal and
  // Insane (a rookie never aims at a mate). Before the momentum allowance and the reach
  // existed this read **277** at Normal; the allowance alone took it to 120 and the reach
  // (which stops the hoofs being called passes) to the thirties.
  // ⚠️ Against the MATE, not the aim point: a through ball is aimed ahead of him on purpose.
  const missOf = (diff) => {
    const misses = [];
    for (const seed of [11, 22]){
      const w = allBots(diff, seed);
      let lastT = -1, open = null;
      for (let i = 0; i < 3600; i++){
        M.step(w); if (w.state === 'over') break;
        const bl = w.ball;
        if (open){ open.best = Math.min(open.best, Math.hypot(bl.x - open.who.x, bl.y - open.who.y)); open.n++; }
        if (bl.lastKicker && bl.lastKickT !== lastT){
          if (open) misses.push(open.best);
          lastT = bl.lastKickT; const k = bl.lastKicker;
          open = (k.aiKind === 'pass' && k.aiWho && k.aiWho !== k) ? { who: k.aiWho, best: 1e9, n: 0 } : null;
        }
        if (open && open.n > 120){ misses.push(open.best); open = null; }
      }
    }
    misses.sort((a, c) => a - c);
    return { n: misses.length, median: +(misses[misses.length >> 1] || 0).toFixed(1) };
  };
  o.miss = { normal: missOf('normal'), insane: missOf('insane') };
  o.passesGoWhereAimed = o.miss.insane.n >= 15 && o.miss.normal.n >= 15 &&
                         o.miss.insane.median < 60 && o.miss.normal.median < 60;

  // ⚠️ The momentum allowance in the stance (`skill.comp`) is NOT checkable here, and a
  // protractor probe for it was written, measured and deleted: an Insane bot left to run
  // in and strike a ball rolling at 3 a step lands 30–39° off its aim with the allowance
  // and 32–38° without, because the strike cone (`strikeEnter`) and the bot's own carry
  // swamp one kick. What sees it is the LADDER over a match — +137 against +71 pooled on
  // the same 84 matches — which is `tests/proladder.mjs`' job. The figure above is held
  // by the REACH.

  // ---- 3. A SHOT PAYS THE REACH. Direct probe: Insane on the ball deep in its own half,
  // a keeper on the far line and a mate open upfield, picks the pass; the same bot inside
  // range of an open goal shoots. Nothing blocks either lane — what decides it is the
  // range against the keeper. ⚠️ The keeper is load-bearing: at an EMPTY net the reach is
  // mostly forgiven (`reachOpen`), because a ball arriving dead still rolls in there.
  {
    const w = allBots('insane', 33);
    const me = w.players.find(q => q.team === 1), mates = w.players.filter(q => q.team === 1);
    const att = me.team === 0 ? -1 : 1, halfL = w.field.L / 2;
    const opp = w.players.filter(q => q.team !== me.team);
    for (const q of opp){ q.x = -180; q.y = -att * halfL * 0.9; q.vx = q.vy = 0; }
    opp[0].x = 0; opp[0].y = att * (halfL - 30);              // a keeper on the far line
    for (const q of mates){ q.vx = q.vy = 0; }
    const mate = mates.find(q => q !== me), third = mates.find(q => q !== me && q !== mate);
    third.x = 150; third.y = -att * halfL * 0.85;
    // Deep: the ball 560 from the goal line, the mate 170 up the pitch in space.
    w.ball.x = 0; w.ball.y = -att * (halfL - 200); w.ball.vx = w.ball.vy = 0;
    me.x = 0; me.y = w.ball.y - att * 30;
    mate.x = 90; mate.y = w.ball.y + att * 170;
    const skill = M.botSkill(w.diff);
    const deep = M.botPickAim(w, me, w.ball, mates, skill);
    // Close: the ball 140 from the goal line, the keeper gone, mouth open.
    opp[0].x = -180; opp[0].y = -att * halfL * 0.9;
    w.ball.y = att * (halfL - 140); me.y = w.ball.y - att * 30; mate.y = w.ball.y - att * 120;
    const close = M.botPickAim(w, me, w.ball, mates, skill);
    o.reach = { deep: deep.kind, close: close.kind, coastFree: +(M.BOT.passReach).toFixed(2) };
    o.deepIsAPass = deep.kind === 'pass';
    o.closeIsAShot = close.kind === 'goal';
  }

  // ---- 4. THE KEEPER COMES OFF ITS LINE, by tier. Same world, same ball, `w.diff` swapped.
  {
    const w = allBots('insane', 44);
    for (let i = 0; i < 120; i++) M.step(w);
    const gk = w.players.find(q => q.team === 1 && q.aiRole === 'goalie');
    o.keeper = { found: !!gk };
    if (gk){
      const att = gk.team === 0 ? -1 : 1, halfL = w.field.L / 2, lineY = -att * halfL;
      w.ball.x = 10; w.ball.y = lineY + att * 150; w.ball.vx = 0; w.ball.vy = -att * 2;
      const sv = w.diff;
      w.diff = M.DIFF.insane; const hi = M.botFormationSpot(w, gk, 'defend');
      w.diff = M.DIFF.rookie; const lo = M.botFormationSpot(w, gk, 'defend');
      w.diff = sv;
      o.keeper.insaneOut = +Math.abs(hi.y - lineY).toFixed(1);
      o.keeper.rookieOut = +Math.abs(lo.y - lineY).toFixed(1);
      o.keeper.base = +(halfL * M.BOT.slotDepth.goalie).toFixed(1);
      // ...and never past the ball.
      o.keeper.short = (w.ball.y - hi.y) * att > 0;
    }
    o.keeperComesOut = !!gk && o.keeper.insaneOut > o.keeper.base + 12 && o.keeper.short;
    o.rookieKeeperStays = !!gk && Math.abs(o.keeper.rookieOut - o.keeper.base) < 1;
  }

  // ---- 5. A DEFENDER MARKS TIGHTER, by tier. One defender, one mark, `w.diff` swapped
  // round a manual `runBot` (the `botplans` harness), measured as the distance from the
  // target it walks to, to the man it is marking.
  {
    M.sel.mode = '4v4';
    const w = allBots('insane', 55);
    for (let i = 0; i < 150; i++) M.step(w);
    // ⚠️ Not the presser: the one body pressing the carrier does not shade to a mark at all,
    // so on a run where the defender happens to be it the two tiers read identical.
    const d = w.players.find(q => q.team === 1 && q.aiRole === 'defender' && q.aiMark && w.ai[1].press !== q);
    o.mark = { found: !!d };
    if (d){
      const walk = (diff) => {
        const sv = w.diff; w.diff = M.DIFF[diff];
        d.aiLag = 0; d.aiT = 1;
        for (let i = 0; i < 8; i++) M.runBot(w, d);
        w.diff = sv;
        return d.aiMark ? +Math.hypot(d.aiTarget.x - d.aiMark.x, d.aiTarget.y - d.aiMark.y).toFixed(1) : null;
      };
      o.mark.insane = walk('insane'); o.mark.rookie = walk('rookie');
      o.mark.w = { rookie: +M.botSkill(M.DIFF.rookie).mark.toFixed(2), insane: +M.botSkill(M.DIFF.insane).mark.toFixed(2) };
    }
    o.insaneMarksTighter = !!d && o.mark.insane != null && o.mark.rookie != null && o.mark.insane < o.mark.rookie * 0.85;
    M.sel.mode = '3v3';
  }

  // ---- 6. GIVE AND GO. Watch an Insane match for a pass; on the tick it leaves the boot
  // the passer must start running, goal-side of the mate it went to.
  {
    let seen = 0, ran = 0, goalSide = 0;
    for (const seed of [11, 22]){
      const w = allBots('insane', seed);
      let lastT = -1;
      for (let i = 0; i < 3600 && seen < 12; i++){
        M.step(w); if (w.state === 'over') break;
        const bl = w.ball;
        if (bl.lastKicker && bl.lastKickT !== lastT){
          lastT = bl.lastKickT; const k = bl.lastKicker;
          if (k.aiKind === 'pass' && k.aiWho && k.aiWho !== k){
            seen++;
            const who = k.aiWho, att = k.team === 0 ? -1 : 1;
            // The run is set on the kick's own tick; the TARGET it names only takes over
            // once the passer stops being the chaser (roles re-match every `roleTicks`), so
            // follow it for half a second and read where it is heading once it has.
            let hit = false, everRan = false;
            for (let j = 0; j < 60; j++){ M.step(w);
              if (k.aiRunT > 0) everRan = true;
              if (k.aiRunT > 0 && k.aiRole !== 'chaser' && k.aiRunTo === who &&
                  (k.aiTarget.y - who.y) * att > 40) hit = true; }
            if (everRan) ran++;
            if (hit) goalSide++;
          }
        }
      }
    }
    o.giveAndGo = { seen, ran, goalSide };
    // Half, not all: a pass that goes straight in clears the kick record (`creditScorer`)
    // before the passer's next decision can read it, and a possession lost on the next
    // touch cancels the run on the same tick. Measured 8–12 of 12 across the builds of
    // this batch; sabotaged (`runTicks` 0) it reads 0 of 12.
    o.passerKeepsRunning = seen >= 6 && ran >= seen * 0.5;
    // ...and the run only takes over the target once the passer stops being the chaser,
    // which after a pass it often still is for the whole 90 ticks: 2–5 of 12, against 0.
    o.runIsGoalSide = goalSide >= 2;
  }

  // ---- 7. THE FOOTBALL DIFFERS BY TIER, at the shipped feel. Share of kicks aimed at a
  // mate, and share of kicks that were the second of two by the same side (a completed
  // pass, by the match record's own rule), rookie against Insane.
  const footOf = (diff) => {
    let kicks = 0, passAim = 0, seq = 0, goals = 0;
    for (const seed of [11, 22]){
      const w = allBots(diff, seed);
      let lastK = null, lastT = -1;
      for (let i = 0; i < 3600; i++){
        M.step(w); if (w.state === 'over') break;
        const bl = w.ball;
        if (bl.lastKicker && bl.lastKickT !== lastT){
          const k = bl.lastKicker; kicks++;
          if (k.aiKind === 'pass') passAim++;
          if (lastK && lastK !== k && lastK.team === k.team && (w.matchT - lastT) < 4) seq++;
          lastK = k; lastT = bl.lastKickT;
        }
      }
      goals += w.score[0] + w.score[1];
    }
    return { kicks, passAimPct: +(100 * passAim / Math.max(1, kicks)).toFixed(0), seqPct: +(100 * seq / Math.max(1, kicks)).toFixed(0), goals };
  };
  o.foot = { rookie: footOf('rookie'), normal: footOf('normal'), insane: footOf('insane') };
  o.rookieNeverPasses = o.foot.rookie.passAimPct === 0;
  // ⚠️ The bar is a FLOOR well under what is measured (Normal 26–50%, Insane 19–35% across
  // builds of this batch; the shipped build reads 26 / 19, or 31 / 23 in this suite's own
  // seeded matches), because which candidate wins a given kick moves with every
  // tuning change; what must not move is that the passing tiers pass and the rookie does
  // not. The baseline's 46% at Insane was hoofs filed as passes, which the reach ended.
  o.insanePasses = o.foot.insane.passAimPct >= 15 && o.foot.normal.passAimPct >= 15;
  // ⚠️ A FINDING, written down rather than asserted round: the chain of two same-side
  // kicks reads rookie 19%, Normal 31%, Insane 24% here — Insane shoots and banks more
  // than Normal from the positions its runs get it into, so it strings fewer together.
  // What is pinned is the half that is a ladder claim: both passing tiers keep it better
  // than the tier that cannot pass at all.
  o.passingTiersKeepIt = o.foot.normal.seqPct > o.foot.rookie.seqPct && o.foot.insane.seqPct > o.foot.rookie.seqPct;
  o.everyTierScores = ['rookie', 'normal', 'insane'].every(t => o.foot[t].goals >= 1);

  M.sel.diff = 'normal'; M.setMatchSeed(null);
  return o;
});

await p.close();
console.log(JSON.stringify(r, null, 1));

let bad = 0;
const ok = (name, cond, note = '') => { if (!cond){ bad++; console.log('  FAIL ' + name + (note ? ' — ' + note : '')); } };

ok('the shipped feel is one-touch', r.trapOff, 'this file measures the game a player gets; re-point it if the default moves');
ok('a ROOKIE side never sprints', r.rookieNeverSprints, JSON.stringify(r.sprint.rookie));
ok('a NORMAL side does', r.normalSprints, JSON.stringify(r.sprint.normal) + ' — the turbo is what was asked for');
ok('...and INSANE sprints more', r.insaneSprintsMore, JSON.stringify(r.sprint) + ' — it tracks back and makes runs, Normal only chases');
ok('...while keeping a reserve', r.reserveRises && r.insaneNeverSpent,
   `spent ${r.sprint.insane.spentPct}% of ticks — the reserve rises with the tier, so the top tier never runs itself tired`);

ok('a pass reaches the mate it was meant for', r.passesGoWhereAimed,
   JSON.stringify(r.miss) + ' — median closest approach of the ball to the mate a kick was aimed at; ' +
   'the reach (`BOT.passReach`/`wReach`) is what holds it under 60, and with `wReach` at 0 it reads ~280');

ok('from deep, a pass beats the hoof at goal', r.deepIsAPass, JSON.stringify(r.reach) + ' — a shot from beyond the coast arrives dead; with `BOT.wReach` at 0 this picks the goal');
ok('...and in range, the shot wins', r.closeIsAShot, JSON.stringify(r.reach));

ok('an Insane keeper comes off its line for a ball bearing down', r.keeperComesOut, JSON.stringify(r.keeper));
ok('...and a rookie keeper stays on it', r.rookieKeeperStays, JSON.stringify(r.keeper));
ok('an Insane defender marks tighter than a rookie', r.insaneMarksTighter, JSON.stringify(r.mark));
ok('a passer keeps running after the pass', r.passerKeepsRunning, JSON.stringify(r.giveAndGo));
ok('...goal-side of the mate it played to', r.runIsGoalSide, JSON.stringify(r.giveAndGo));

ok('a rookie never aims at a mate', r.rookieNeverPasses, JSON.stringify(r.foot.rookie));
ok('the passing tiers aim at a mate', r.insanePasses, JSON.stringify(r.foot) + ' — baseline read 46% aimed at Insane and almost none arriving; this is aimed AND meant (see the miss check)');
ok('...and both passing tiers keep the ball better than a rookie', r.passingTiersKeepIt, JSON.stringify(r.foot));
ok('every tier still scores', r.everyTierScores, JSON.stringify(r.foot) + ' — "they pass more" is also true of a side that never shoots');
ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(bad ? 'FAIL botfoot' : 'PASS botfoot');
await b.close();
process.exit(bad ? 1 : 0);
