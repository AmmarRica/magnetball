// BOT PLAYER TYPES AND TEAM STRATEGIES — a shape, not a ladder.
//
// ⚠️ THE ASSERTION THIS SUITE EXISTS FOR IS THAT A TYPE DOES NOT CHANGE STRENGTH.
// `botSkill` is a LADDER — one 0..1 scalar with every axis derived from it, so a tier can
// only ever be better than the one below. A type is a SHAPE: a poacher is not a better
// anchor, it is a player who does something else. If the two ever mixed, a strategy would
// quietly make one difficulty stronger than the tier above it, which is the exact bug the
// ladder was rebuilt to make impossible — and nothing about the code LOOKS wrong when it
// happens, which is why it has to be measured rather than reviewed.
//
// ⚠️ The second thing measured here is the one that actually bit. `influence` (how hard a
// formation slot is dragged toward the ball) is not a type axis, because bending it makes
// the TARGET move fast and a fast-moving target is a bot that keeps changing direction.
// The first tuning bent it and pushed `botai`'s reversal count to 0.58 against a ceiling
// of 0.5. This suite pins its absence, so it cannot come back as a good idea.
//
// Also held:
//   - `botTypeM` returns 1 (or 0 for the additive aim biases) for anything missing, never
//     `undefined` — an undefined times a BOT value poisons a formation slot silently;
//   - the type follows the ROLE and is re-read when roles are re-matched;
//   - `plan.press` applies only while DEFENDING, which is what makes it a press rather
//     than a second line-height dial;
//   - Mixed never deals both sides the same plan, and never deals `standard`;
//   - the default is `standard`, which carries no types at all;
//   - the picker's tiles are built from the table rather than listed a second time.
import { chromium, LAUNCH, pinCasualFeel } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);
// ⚠️ **PINNED TO THE FEEL THE AI IS TUNED AT, and that is not the same as the feel
// the game SHIPS with.** `defaultSel()` is the Pro preset, whose movement pair (accel 12,
// pdamp 960) collapses the difficulty ladder: measured on `botplans`' own harness, Insane
// against Rookie reads +18 +17 +22 +16 +11 +11 +12 across the seven strategies at the AI's
// tuning and -4 +6 -11 +1 -9 -4 -4 at the shipped default — every plan down by 20 to 33,
// with no overlap between the two arms. What THIS file is for is the AI itself: that the
// ladder, the steering and the plans hold at the movement they were tuned against, so a
// future retune has something to keep. Pinning here would be papering over the defect only
// if nothing else measured it — `tests/proladder.mjs` does, and it is red on purpose.
await pinCasualFeel(p);

// ======================================================== the table itself ==
const t = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  o.types = Object.keys(M.BOT_TYPES);
  o.plans = Object.keys(M.BOT_PLANS);
  o.defaultPlan = M.defaultSel().botPlan;

  // ⚠️ `influence` is NOT a type axis. See the header — this is the axis that broke it.
  o.anyInfluence = o.types.filter(k => M.BOT_TYPES[k].influence != null);
  // ...and nothing in the table may be an ABILITY. A type that is simply better is a bug
  // wearing a name, so the axes are enumerated and anything new has to be argued for here.
  const ALLOWED = new Set(['name', 'desc', 'depth', 'space', 'chase', 'press', 'shot', 'pass']);
  o.strayAxes = [];
  for (const k of o.types)
    for (const f of Object.keys(M.BOT_TYPES[k]))
      if (!ALLOWED.has(f)) o.strayAxes.push(k + '.' + f);

  // ⚠️ A MISSING KEY IS 1, NEVER `undefined`. `allround` carries no numbers at all, and an
  // undefined times a BOT value is NaN — which poisons a formation slot silently instead
  // of failing anywhere anyone would look.
  const bare = { aiType: 'allround' };
  o.missingIsOne = ['depth', 'space', 'chase', 'press'].every(k => M.botTypeM(bare, k) === 1);
  o.missingBiasIsZero = ['shot', 'pass'].every(k => M.botTypeM(bare, k) === 0);
  o.unknownTypeIsOne = M.botTypeM({ aiType: 'nope' }, 'depth') === 1 &&
                       M.botTypeM({}, 'depth') === 1;
  o.everyTypeFinite = o.types.every(k =>
    ['depth', 'space', 'chase', 'press', 'shot', 'pass'].every(f => isFinite(M.botTypeM({ aiType: k }, f))));

  // The aim lean is ADDED to a score, and it is SMALL — it competes with lane, progress
  // and openness, and a big one makes a bot shoot from its own half because it is "a
  // poacher". Anything past this and the type stops being a lean and starts being a rule.
  o.biggestBias = Math.max(...o.types.map(k =>
    Math.max(Math.abs(M.botTypeM({ aiType: k }, 'shot')), Math.abs(M.botTypeM({ aiType: k }, 'pass')))));

  // ⚠️ `standard` is the default and carries NO types: every role maps to a type with no
  // numbers, and line/press are 1, so every multiplier resolves to 1 and this IS the
  // shipped AI. That is what keeps Difficulty the thing that decides how hard a match is.
  const std = M.BOT_PLANS.standard;
  o.stdIsNeutral = std.line === 1 && std.press === 1 &&
                   Object.values(std.roles).every(r => {
                     const ty = M.BOT_TYPES[r];
                     return ['depth', 'space', 'chase', 'press'].every(f => ty[f] == null);
                   });
  // Every plan names a type for every role, and every one of those types exists.
  o.planRolesComplete = o.plans.every(k =>
    ['chaser', 'support', 'defender', 'goalie'].every(r => !!M.BOT_TYPES[M.BOT_PLANS[k].roles[r]]));
  // The picker is BUILT from the table, never a second list.
  o.pickerMatches = o.plans.every(k => M.BOTPLANOPT[k] && M.BOTPLANOPT[k].name === M.BOT_PLANS[k].name);
  o.pickerHasMixed = !!M.BOTPLANOPT.auto;
  return o;
});

// ============================================== press applies only defending ==
const press = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode = '4v4'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
  M.sel.botPlan = 'press';                       // the biggest press multiplier in the table
  M.setMatchSeed(11); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 1;
  for (let i = 0; i < 90; i++) M.step(w);
  const d = w.players.filter(q => q.team === 1).find(q => q.aiRole === 'defender');
  o.found = !!d;
  if (d){
    // ⚠️ Measured against the BALL, because that is what press does: it drags the slot
    // toward it. Comparing the two phases for one body is the whole claim — "press is a
    // press and not a second line-height dial".
    const atk = M.botFormationSpot(w, d, 'attack');
    const def = M.botFormationSpot(w, d, 'defend');
    const dist = s => Math.hypot(s.x - w.ball.x, s.y - w.ball.y);
    o.attackDist = Math.round(dist(atk));
    o.defendDist = Math.round(dist(def));
    // ...and a plan that does NOT press must not collapse the same way.
    M.sel.botPlan = 'bus';
    M.setMatchSeed(11); M.startMatch();
    const w2 = M.world; w2.state = 'play'; w2.stateT = 1;
    for (let i = 0; i < 90; i++) M.step(w2);
    const d2 = w2.players.filter(q => q.team === 1).find(q => q.aiRole === 'defender');
    const dist2 = s => Math.hypot(s.x - w2.ball.x, s.y - w2.ball.y);
    o.busAttack = Math.round(dist2(M.botFormationSpot(w2, d2, 'attack')));
    o.busDefend = Math.round(dist2(M.botFormationSpot(w2, d2, 'defend')));
  }
  M.sel.botPlan = 'standard';
  return o;
});

// ================================================== the type follows the role ==
const roles = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode = '4v4'; M.sel.botPlan = 'balanced'; M.sel.lobby = 'off';
  M.setMatchSeed(3); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 1;
  for (let i = 0; i < 300; i++) M.step(w);
  const plan = M.botPlanOf(w, 1);
  const team = w.players.filter(q => q.team === 1 && q.ctrl === 'bot');
  o.everyBotTyped = team.every(q => !!q.aiType);
  o.matchesRole = team.every(q => q.aiType === plan.roles[q.aiRole]);
  // ⚠️ RE-READ when the role changes. A plan is keyed by role, and roles are re-matched
  // every few ticks by who is nearest what — so a type pinned at kickoff would describe a
  // player who is no longer doing that job. Force a role change and check the type moved.
  const q0 = team[0], was = { role: q0.aiRole, type: q0.aiType };
  q0.aiRole = q0.aiRole === 'defender' ? 'support' : 'defender';
  M.botAssignRoles(w, 1);
  o.wasRole = was.role; o.wasType = was.type;
  o.nowRole = q0.aiRole; o.nowType = q0.aiType;
  o.reReadOnRoleChange = q0.aiType === plan.roles[q0.aiRole];
  M.sel.botPlan = 'standard';
  return o;
});

// ========================================================== Mixed deals fairly ==
const mixed = await p.evaluate(() => {
  const M = window.__magnet, o = { pairs: [], same: 0, sawStandard: 0 };
  M.sel.botPlan = 'auto';
  for (let seed = 1; seed <= 24; seed++){
    const [a, c] = M.botDrawPlans({ seed });
    o.pairs.push(a.name + '/' + c.name);
    if (a === c) o.same++;
    if (a.name === 'Standard' || c.name === 'Standard') o.sawStandard++;
  }
  o.distinctPairs = new Set(o.pairs).size;
  // Deterministic: the same seed deals the same hand, twice.
  const one = M.botDrawPlans({ seed: 99 }), two = M.botDrawPlans({ seed: 99 });
  o.deterministic = one[0] === two[0] && one[1] === two[1];
  // ...and an explicit pick gives BOTH sides that plan.
  M.sel.botPlan = 'bus';
  const forced = M.botDrawPlans({ seed: 5 });
  o.explicitBothSides = forced[0] === M.BOT_PLANS.bus && forced[1] === M.BOT_PLANS.bus;
  M.sel.botPlan = 'standard';
  return o;
});

// ============================================================================
//  A TYPE MUST NOT CHANGE STRENGTH
// ============================================================================
// ⚠️ THE HEADLINE CHECK, and it is not the one this suite was first written with. The
// first version asserted that no plan beats the stock AI — "a shape, not a strength" —
// and the measurement said otherwise: Park the bus finishes about +16 on goal difference
// over twelve matches and Counter about -9. Three tuning rounds could not close it,
// because the lever is `depth`: a body sitting deep defends its own goal, which in this
// game simply wins more matches, and depth is also most of what makes a strategy a
// strategy. The two cannot be separated by tuning, so the claim was wrong rather than the
// numbers, and the menu no longer makes it either.
//
// What IS guaranteed, and what is pinned here, is that **the difficulty ladder still
// holds inside every plan**. That is the invariant that matters: Difficulty is the
// control a player reaches for, and a shape that inverted it would make picking Pro mean
// less than picking a strategy. Rookie must lose to Insane under every shape in the table.
//
// ⚠️ Played BOTH WAYS ROUND and summed, which cancels side bias exactly rather than
// hoping it averages out. It does not: a mirror check written first scored "All-out
// attack" at -8 and "Park the bus" at +6 over four seeds, measuring whichever half of the
// pitch the seeds happened to favour and saying nothing at all about the plan.
// ⚠️ Goal difference, not win/loss: a 3-0 and a 1-0 are the same "win" and very different
// facts, and over a handful of seeds the coarser measure is mostly noise.
const ladder = await p.evaluate(async () => {
  const M = window.__magnet, out = [];
  M.sel.mode = '2v2'; M.sel.length = '5'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
  M.sel.botPlan = 'standard';
  // ⚠️ There is no per-team difficulty on the world — both benches read `w.diff` — so the
  // weaker side is driven by SWAPPING `w.diff` around a manual `runBot` call, which is the
  // same technique `tests/botai.mjs` uses for its own ladder. Without it this measures one
  // tier against itself and passes happily on a build where the ladder is completely flat.
  const h2h = (A, B, plan, seed, secs) => {
    M.setMatchSeed(seed); M.sel.diff = B;
    M.startMatch();
    const w = M.world;
    w.plan = [M.BOT_PLANS[plan], M.BOT_PLANS[plan]];       // same shape on both sides
    M.botAssignRoles(w, 0); M.botAssignRoles(w, 1);
    w.state = 'play'; w.stateT = 1;
    const a = w.players.filter(q => q.team === 0);
    a.forEach(q => { q.ctrl = 'bot'; q.aiFrozen = true; });
    w.players.filter(q => q.team === 1).forEach(q => { q.ctrl = 'bot'; });
    for (let i = 0; i < secs * 60; i++){
      const sv = w.diff; w.diff = M.DIFF[A];
      a.forEach(q => { q.aiFrozen = false; M.runBot(w, q); q.aiFrozen = true; });
      w.diff = sv; M.step(w);
      if (w.state === 'over') break;
    }
    return { t0: w.score[0], t1: w.score[1] };
  };
  for (const plan of Object.keys(M.BOT_PLANS)){
    let gd = 0, goals = 0;
    for (const seed of [9000, 9211, 9422, 9633, 9844, 10055]){
      const f = h2h('rookie', 'insane', plan, seed, 60);   // strong on team 1
      const r = h2h('insane', 'rookie', plan, seed, 60);   // strong on team 0
      gd += (f.t1 - f.t0) + (r.t0 - r.t1);                 // + means the STRONG tier is ahead
      goals += f.t0 + f.t1 + r.t0 + r.t1;
    }
    out.push({ plan, gd, goals });
  }
  M.sel.diff = 'normal'; M.setMatchSeed(null);
  return out;
});

await p.close();

// -------------------------------------------------------------------- report --
ok('there is no `influence` type axis', t.anyInfluence.length === 0,
   `${t.anyInfluence.join(', ')} still bend it — it drags a formation slot toward the ball, so bending it makes the TARGET move fast, and a fast target is a bot that oscillates: the first tuning measured 0.58 reversals against botai's ceiling of 0.5`);
ok('...and no type carries an ability axis', t.strayAxes.length === 0,
   `${t.strayAxes.join(', ')} — accuracy, reaction or speed here would be a second difficulty dial hidden inside a personality, and a "Poacher" that is simply a worse player is a bug wearing a name`);
ok('a missing multiplier is 1, never undefined', t.missingIsOne && t.unknownTypeIsOne,
   'an undefined times a BOT value is NaN, which poisons a formation slot silently instead of failing where anyone would look');
ok('...and a missing aim bias is 0', t.missingBiasIsZero);
ok('...and every type resolves finite on every axis', t.everyTypeFinite);
ok('the aim lean stays a lean', t.biggestBias <= 0.2,
   `biggest bias ${t.biggestBias} — it is ADDED to a score that already carries lane, progress and openness, and a big one makes a bot shoot from its own half because it is "a poacher"`);

ok('the default plan is `standard`', t.defaultPlan === 'standard', t.defaultPlan);
ok('...and `standard` carries no types at all', t.stdIsNeutral,
   'it has to reproduce the shipped AI bit for bit, so that picking Difficulty stays the thing that decides how hard a match is');
ok('every plan fills every role with a real type', t.planRolesComplete);
ok('the picker is built from the table', t.pickerMatches && t.pickerHasMixed,
   'names and blurbs read, never copied — or a plan can be renamed in one place and keep its old name in the menu');

ok('press pulls the line toward the ball when DEFENDING', press.found && press.defendDist < press.attackDist,
   JSON.stringify(press));
ok('...and a plan that does not press does not collapse as far', press.found &&
   (press.attackDist - press.defendDist) > (press.busAttack - press.busDefend),
   `${JSON.stringify(press)} — press applies only while defending, which is what makes it a press rather than a second line-height dial`);

ok('every bot carries a type', roles.everyBotTyped && roles.matchesRole, JSON.stringify(roles));
ok('...and it is RE-READ when the role changes', roles.reReadOnRoleChange,
   `${roles.wasRole}/${roles.wasType} → ${roles.nowRole}/${roles.nowType} — a plan is keyed by role and roles are re-matched every few ticks, so a type pinned at kickoff describes a player who is no longer doing that job`);

ok('Mixed never deals both sides the same plan', mixed.same === 0,
   `${mixed.same} of 24 draws matched — two independent draws off one seed handed both teams the same plan often enough to look broken, and identical shapes is the one outcome Mixed exists to rule out`);
ok('...and never deals `standard`', mixed.sawStandard === 0,
   `${mixed.sawStandard} draws included Standard — it is the "leave the AI alone" entry, so dealing it would make Mixed sometimes mean no shape at all`);
ok('...and varies across seeds', mixed.distinctPairs >= 6, `${mixed.distinctPairs} distinct pairs in 24 draws`);
ok('...deterministically', mixed.deterministic, 'a pinned seed has to reproduce the whole match');
ok('an explicit pick gives both sides that plan', mixed.explicitBothSides);

const played = ladder.every(l => l.goals >= 6);
const inverted = ladder.filter(l => l.gd <= 0);
ok('every plan actually plays football', played,
   `${JSON.stringify(ladder)} — a plan that barely scores makes the ladder check below vacuous`);
ok('THE DIFFICULTY LADDER HOLDS INSIDE EVERY PLAN', inverted.length === 0,
   `${inverted.map(l => l.plan + ' ' + l.gd).join(', ')} — Insane failed to beat Rookie under that shape, over 12 matches with the sides swapped (${JSON.stringify(ladder)}). Difficulty is the control a player reaches for; a strategy that inverts it makes picking Pro mean less than picking a shape.`);

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ t, press, roles, mixed, ladder }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL botplans\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS botplans');
