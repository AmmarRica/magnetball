// Goal box occupancy: one keeper, one attacker.
//
// A team could park its whole defence on its own line and a wall of bodies would sit
// there all match; the attack could bury the keeper under a scrum from the other
// side. One of each is allowed inside a goal box now.
//
// ⚠️ The box is EXACTLY the region the pitch draws — the net pocket plus its mirror
// in front of the goal line, which tests/goalbox.mjs pixel-checks on all 30 fields.
// The rule reads its geometry from w.bounds rather than re-deriving it, and this
// suite checks the enforced edge against the drawn edge: a rule enforced somewhere
// other than where the line is drawn is worse than no rule, because the player is
// being pushed off a line that is not there.
//
// ⚠️ Measurement trap: do NOT leave the AI running while measuring the rule. Bots
// chase the ball, so they walk out of the box on their own and every number reads as
// the rule working. Park the ball, set ctrl to something with no input handler, and
// what is left is the rule and nothing else. (The first version of this suite parked
// the ball at 1e4, which sent every bot sprinting at the corner and reported that
// zero attackers could enter — which was the bots leaving, not the rule.)
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

  const start = (boxRule, mode) => {
    M.sel.mode = mode || '4v4'; M.sel.kickoffRule='off'; M.sel.boxRule = boxRule;
    M.setMatchSeed(3); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2;
    return w;
  };
  const freeze = w => { w.players.forEach(q=>{ q.ctrl='none'; }); w.ball.x=0; w.ball.y=0; w.ball.vx=0; w.ball.vy=0; };
  const geom = w => ({ gh:w.field.goal/2, front:w.bounds.halfL-w.bounds.net, halfL:w.bounds.halfL });
  const inBox = (q, sign, g) => Math.abs(q.x) < g.gh + q.r && sign*q.y > g.front - q.r;
  const pack = (w, team, sign, g) => w.players.filter(q=>q.team===team)
    .map((q,i)=>{ q.x=(i-1.5)*30; q.y=sign*(g.halfL-8); q.vx=0; q.vy=0; return q; });

  // ---- the wall of defenders becomes one keeper ----------------------------
  let w = start('on'); freeze(w); let g = geom(w);
  let def = pack(w, 0, 1, g);                       // team 0 defends the bottom (+1)
  w.players.filter(q=>q.team===1).forEach(q=>{ q.x=0; q.y=-g.halfL+40; });
  o.defBefore = def.filter(q=>inBox(q,1,g)).length;
  for (let i=0;i<180;i++) M.step(w);
  o.defAfter = def.filter(q=>inBox(q,1,g)).length;
  o.wallBecomesAKeeper = o.defBefore === 4 && o.defAfter === 1;
  // The one left is a real player standing in a sane place, not one wedged in a wall.
  const keeper = def.find(q=>inBox(q,1,g));
  o.keeperOnThePitch = !!keeper && Math.abs(keeper.x) < g.gh + 40 && keeper.y <= g.halfL + w.bounds.net;

  // ---- HALF A SECOND OF GRACE before anything touches you ------------------
  // ⚠️ Being shoved the instant you clip the corner made a run past the goal feel like the
  // pitch was fighting you. Nothing at all may happen for GOALBOX.grace: no shove, no clamp
  // and no tell — a tell in the free window says you are being stopped when you are not.
  //
  // ⚠️ MEASURED AS A DIFFERENTIAL against the rule switched OFF, not against a velocity
  // threshold. `integrate` damps every player every step, so the first version of this check
  // read the runner's vy dropping from 3.2 to 2.9 and called ordinary damping a shove. Two
  // identical runs, rule on and rule off: during the free window the traces must match
  // EXACTLY, and after it they must part.
  const graceSteps = Math.round(M.GOALBOX.grace / (1/60));
  o.graceSecs = M.GOALBOX.grace;
  {
    // ⚠️ `pickIdx` is how the two runs stay comparable. With the rule OFF there is no
    // `w.boxLock` at all — it is never created, because applyGoalBox returns before it — so
    // the off-run cannot find "the non-holder" and has to be told which body to follow.
    const run = (rule, drive, pickIdx) => {
      const w2 = start(rule); freeze(w2); const g2 = geom(w2);
      const d2 = pack(w2, 0, 1, g2);
      w2.players.filter(q=>q.team===1).forEach(q=>{ q.x=0; q.y=-g2.halfL+40; });
      M.step(w2);                                 // one step: the slot gets claimed
      // ⚠️ The SECOND defender is the one under test. The first holds the slot and is never
      // pushed, so measuring it would report the rule working whatever grace did.
      const lock = w2.boxLock || {};
      const holder = d2.find(q => lock['1:0'] === q) || null;
      const idx = pickIdx != null ? pickIdx
                : d2.findIndex(q => q !== holder && inBox(q,1,g2));
      const runner = d2[idx >= 0 ? idx : 0];
      const trace = [];
      for (let i=0;i<graceSteps + 90;i++){
        if (drive && i < graceSteps + 20) runner.vy = 3.2;   // still running in
        M.step(w2);
        trace.push(+runner.y.toFixed(4));
      }
      return { trace, runner, holder, w2, g2, idx,
               depth: trace.map(y => +(y - (g2.front - runner.r)).toFixed(3)) };
    };
    const on  = run('on',  true);
    const off = run('off', true, on.idx);         // the same body, so the traces compare
    o.haveTwoInBox = !!on.holder && on.runner !== on.holder;
    // Identical while the clock is running...
    const win = graceSteps - 1;
    o.graceTraceMatches = on.trace.slice(0, win).every((y, i) => y === off.trace[i]);
    o.wentDeeperDuringGrace = on.depth[win-1] > on.depth[0] + 20;
    // ...and parted after it, or the rule never engages at all.
    o.partsAfterGrace = on.trace.slice(graceSteps + 10)
      .some((y, i) => Math.abs(y - off.trace[graceSteps + 10 + i]) > 1);
    // ⚠️ NO TELEPORT. Clamping straight to GOALBOX.hard the frame the clock expired yanked the
    // player ~80 units back on Classic, because half a second at pace puts them far deeper
    // than the backstop. No single step may move them more than a step of travel.
    let worst = 0;
    for (let i=1;i<on.trace.length;i++) worst = Math.max(worst, Math.abs(on.trace[i]-on.trace[i-1]));
    o.biggestJump = +worst.toFixed(2);
    o.noTeleport = worst < 12;
    // ⚠️ And grace is a DELAY, not a bypass: once the clock is up the runner may not get any
    // deeper, and letting go of the stick has them carried out. Compared against the rule-off
    // run, which keeps sinking to the back of the net.
    const late = on.depth.slice(graceSteps + 20);
    o.deepestAfterGrace = Math.max(...late);
    o.cappedAfterGrace = late[late.length-1] <= o.deepestAfterGrace + 0.01;
    o.carriedOutOnRelease = on.depth[on.depth.length-1] < on.depth[graceSteps + 20] - 5;
    o.offRunSinksDeeper = off.depth[off.depth.length-1] > on.depth[on.depth.length-1] + 10;
    // The clock resets once clear, so a second run in gets its own free window.
    on.runner.x = 0; on.runner.y = 0; on.runner.vy = 0;
    M.step(on.w2);
    o.clockResets = (on.runner.boxT || 0) === 0;
    // And the HOLDER is never on a clock at all — they are not being pushed.
    o.holderNeverOnAClock = (on.holder.boxT || 0) === 0;
  }

  // ---- an attacker may join, and only one ----------------------------------
  let atk = pack(w, 1, 1, g);
  for (let i=0;i<180;i++) M.step(w);
  o.atkIn = atk.filter(q=>inBox(q,1,g)).length;
  o.defStillIn = def.filter(q=>inBox(q,1,g)).length;
  o.oneEach = o.atkIn === 1 && o.defStillIn === 1;
  // ...and the attacker did NOT evict the keeper, which is the whole point.
  o.keeperSurvived = def.find(q=>inBox(q,1,g)) === keeper;

  // ---- the slot is STICKY -------------------------------------------------
  // Recomputing "who is deepest" every step made two defenders trade the slot and
  // shove each other out on alternate frames. The holder keeps it while inside.
  const holder = def.find(q=>inBox(q,1,g));
  let flips = 0, last = holder;
  for (let i=0;i<240;i++){
    M.step(w);
    const now = def.find(q=>inBox(q,1,g));
    if (now && now !== last){ flips++; last = now; }
  }
  o.slotFlips = flips;
  o.slotIsSticky = flips === 0;

  // ---- ...and it is released when the holder leaves ------------------------
  holder.x = 0; holder.y = 0; holder.vx = 0; holder.vy = 0;        // walks out
  const other = def.find(q=>q!==holder);
  other.x = 0; other.y = g.halfL-8; other.vx=0; other.vy=0;
  for (let i=0;i<120;i++) M.step(w);
  o.slotReleased = inBox(other, 1, g);

  // ---- BOTH ends are policed ----------------------------------------------
  w = start('on'); freeze(w); g = geom(w);
  const topDef = w.players.filter(q=>q.team===1);   // team 1 defends the top (-1)
  topDef.forEach((q,i)=>{ q.x=(i-1.5)*30; q.y=-(g.halfL-8); q.vx=0; q.vy=0; });
  w.players.filter(q=>q.team===0).forEach(q=>{ q.x=0; q.y=g.halfL-40; });
  for (let i=0;i<180;i++) M.step(w);
  o.topEndPoliced = topDef.filter(q=>inBox(q,-1,g)).length === 1;

  // ---- the edge enforced is the edge DRAWN --------------------------------
  // Sit a spare defender just outside the drawn front edge and it must be left alone;
  // a hair inside and it must be moved. That is the line on the grass.
  w = start('on'); freeze(w); g = geom(w);
  const d2 = w.players.filter(q=>q.team===0);
  // ⚠️ Spread them in x. Stacked on x=0 the one being pushed out of the box collides
  // with the one outside it, and the probe reports the RULE moving a player it never
  // touched — which is what the first version of this check did.
  d2[0].x = 0;   d2[0].y = g.halfL - 8;                      // the keeper, holds the slot
  d2[1].x = -52; d2[1].y = g.front - d2[1].r - 6;            // clearly OUTSIDE
  d2[2].x =  52; d2[2].y = g.front - d2[2].r + 6;            // clearly INSIDE
  d2[3].x = 1e4; d2[3].y = 1e4;
  w.players.filter(q=>q.team===1).forEach(q=>{ q.x=0; q.y=-g.halfL+40; });
  const y1 = d2[1].y, y2 = d2[2].y;
  for (let i=0;i<90;i++) M.step(w);
  o.outsideUntouched = Math.abs(d2[1].y - y1) < 0.5;
  o.insideMoved = (d2[2].y - y2) < -2;                        // pushed back up the pitch
  o.edgeIsTheDrawnEdge = o.outsideUntouched && o.insideMoved;

  // ---- off means OFF ------------------------------------------------------
  w = start('off'); freeze(w); g = geom(w);
  const off = pack(w, 0, 1, g);
  w.players.filter(q=>q.team===1).forEach(q=>{ q.x=0; q.y=-g.halfL+40; });
  for (let i=0;i<180;i++) M.step(w);
  o.offKeepsTheWall = off.filter(q=>inBox(q,1,g)).length === 4;
  // ...and training is exempt however the setting is set — a drill parks bodies
  // wherever it likes and being shoved out of them is not a rule, it is a bug.
  o.trainExempt = M.boxRuleOn({ boxRule:true, train:true }) === false &&
                  M.boxRuleOn({ boxRule:true, drillMode:true }) === false;

  // ---- it applies DURING PLAY, and nowhere else ---------------------------
  // ⚠️ Two states where shoving people is wrong, and the rule did both before it was
  // gated. The warm-up LOBBY is where you walk about, test your controls and pick a
  // side — being pushed off a spot there reads as the controls breaking. And after
  // the FULL-TIME WHISTLE the pitch is winding down; the match is over.
  // ⚠️ Both checks compare against rule-OFF, and space the bodies clear of each
  // other. Two bodies 26 apart at radius 15 push each other apart, and the lobby
  // walks its own bots on — either reads as the rule if you measure raw movement.
  const stateRun = (rule, prep) => {
    M.sel.mode='4v4'; M.sel.kickoffRule='off'; M.sel.boxRule = rule;
    M.setMatchSeed(3); M.startMatch();
    const ww = M.world;
    // ⚠️ prep FIRST, then place. enterWarmup lines the humans up on the halfway line,
    // so placing before it puts the bodies back where the lobby wants them and the
    // probe measures nothing. (And with no pads connected startMatch goes straight to
    // kickoff — there is no lobby to test unless one is asked for.)
    prep(ww);
    const g2 = geom(ww);
    const side = ww.players.filter(q=>q.team===0);
    side.forEach((q,i)=>{ q.x=(i-1.5)*60; q.y=g2.halfL-10; q.vx=0; q.vy=0; });
    const before = side.map(q=>+q.y.toFixed(2));
    for (let i=0;i<120;i++) M.step(ww);
    return { state: ww.state, moved: side.filter((q,i)=>Math.abs(q.y-before[i])>3).length };
  };
  const lobbyOn  = stateRun('on',  ww=>M.enterWarmup(ww));
  const lobbyOff = stateRun('off', ww=>M.enterWarmup(ww));
  o.lobbyState = lobbyOn.state;
  o.lobbyOn = lobbyOn.moved; o.lobbyOff = lobbyOff.moved;
  o.leavesTheLobbyAlone = lobbyOn.state === 'warmup' && lobbyOn.moved === lobbyOff.moved;
  const overOn  = stateRun('on',  ww=>{ ww.state='play'; ww.stateT=2;
                                        ww.players.forEach(q=>{q.ctrl='none';}); M.endMatch(ww); });
  const overOff = stateRun('off', ww=>{ ww.state='play'; ww.stateT=2;
                                        ww.players.forEach(q=>{q.ctrl='none';}); M.endMatch(ww); });
  o.overState = overOn.state;
  o.overOn = overOn.moved; o.overOff = overOff.moved;
  o.stopsAtTheWhistle = overOn.state === 'over' && overOn.moved === overOff.moved;
  // ...and the predicate says so directly, for anything the states above miss.
  o.gatedOnPlay = M.boxRuleOn({ boxRule:true, state:'play' }) === true &&
                  M.boxRuleOn({ boxRule:true, state:'warmup' }) === false &&
                  M.boxRuleOn({ boxRule:true, state:'over' }) === false &&
                  M.boxRuleOn({ boxRule:true, state:'kickoff' }) === false;

  // ---- it does not wreck the bots ------------------------------------------
  // Bots get shoved by this the same way they get shoved by the kickoff line. What
  // matters is that matches still look like matches: goals still go in, and nobody
  // ends up vibrating on the edge of the box for three minutes.
  const play = (rule) => {
    const ww = start(rule); ww.players.forEach(q=>{ q.ctrl='bot'; });
    let stuck = 0;
    for (let i=0;i<60*120;i++){
      M.step(ww);
      if (i % 60 === 0){ const gg = geom(ww);
        for (const q of ww.players){
          const sign = q.y >= 0 ? 1 : -1;
          if (inBox(q, sign, gg) && Math.hypot(q.vx,q.vy) < 0.05) stuck++;
        } }
    }
    return { score: ww.score.slice(), goals: ww.score[0]+ww.score[1], stuck };
  };
  o.botsOn  = play('on');
  o.botsOff = play('off');
  o.botsStillScore = o.botsOn.goals > 0;
  o.botsNotStuck = o.botsOn.stuck <= o.botsOff.stuck + 6;

  M.sel.boxRule='on'; M.sel.mode='1v1'; M.setMatchSeed(null);
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.wallBecomesAKeeper, `four defenders in the box became ${r.defAfter}, not one`);
ok(r.keeperOnThePitch, 'the surviving keeper ended up somewhere the player never put them');
ok(r.oneEach, `after the attack arrived: ${r.atkIn} attackers and ${r.defStillIn} defenders inside, not one each`);
ok(r.keeperSurvived, 'an arriving attacker evicted the keeper — the two slots are not independent');
ok(r.slotIsSticky, `the slot changed hands ${r.slotFlips} times while nobody left the box — two players are trading it and shoving each other out on alternate frames`);
ok(r.slotReleased, 'the slot was never released after its holder walked out, so the box stayed locked to nobody');
ok(r.topEndPoliced, 'only one end of the pitch is policed');
ok(r.edgeIsTheDrawnEdge, `the enforced edge is not the drawn edge: outside-untouched ${r.outsideUntouched}, inside-moved ${r.insideMoved}`);
ok(r.offKeepsTheWall, 'turning the rule off did not bring the wall back — the setting does nothing');
ok(r.trainExempt, 'the rule applies in training and drills, which park bodies wherever they like');
ok(r.leavesTheLobbyAlone, `the rule shoved people around in the warm-up lobby: ${r.lobbyOn} moved with it on vs ${r.lobbyOff} with it off — the lobby is where you walk about and pick a side`);
ok(r.stopsAtTheWhistle, `the rule was still shoving people during the full-time wind-down: ${r.overOn} moved with it on vs ${r.overOff} off`);
ok(r.gatedOnPlay, 'boxRuleOn is not gated on the play state');
ok(r.haveTwoInBox, 'the grace fixture never got a holder AND a second body into the box, so nothing below is testing the free window');
ok(r.graceTraceMatches, `the rule-on and rule-off runs differ INSIDE the ${r.graceSecs}s free window — nothing may touch you there, and a velocity threshold cannot see this because integrate damps every player every step (that is what the first version of this check mistook for a shove)`);
ok(r.wentDeeperDuringGrace, 'the runner did not actually get deeper during the free window, so it was idled away rather than used');
ok(r.partsAfterGrace, 'the two runs never parted after the free window expired — grace would then be a permanent exemption');
ok(r.noTeleport, `a single step moved the runner ${r.biggestJump} units — clamping straight to GOALBOX.hard the frame the clock expires YANKS them back, because half a second at pace puts a player far deeper than the backstop (~98 units against 16 on Classic)`);
ok(r.cappedAfterGrace, `the runner kept getting deeper after the free window (peak ${r.deepestAfterGrace}) — the shove has to hold the line once it engages`);
ok(r.carriedOutOnRelease, 'letting go of the stick did not have the runner carried out, so the free window is a bypass rather than a delay');
ok(r.offRunSinksDeeper, 'with the rule OFF the runner did not end up deeper than with it on, so the whole comparison is measuring nothing');
ok(r.clockResets, `the grace clock did not reset once the runner was clear (${r.graceSecs}s) — a second run in has to get its own free window`);
ok(r.holderNeverOnAClock, 'the slot HOLDER was put on a grace clock, which only applies to bodies being pushed');
ok(r.botsStillScore, `two minutes of bots with the rule on produced no goals: ${JSON.stringify(r.botsOn)}`);
ok(r.botsNotStuck, `bots are jammed on the box edge: ${r.botsOn.stuck} stuck samples vs ${r.botsOff.stuck} with the rule off`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nboxrule OK');
