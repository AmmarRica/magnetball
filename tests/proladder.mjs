// ⚠️ **THIS SUITE IS RED ON PURPOSE, AND IT IS THE ONLY HONEST PLACE FOR THAT.**
//
// `defaultSel()` ships the **Pro** preset — asked for, and a deliberate product call. Under
// Pro's movement the bot difficulty ladder collapses: picking a harder tier stops meaning
// anything, and in most team shapes it makes the bots WORSE. Every other bot suite in this
// repo measures the AI at the movement it was tuned against (`pinCasualFeel` in
// `_browser.mjs`), which is right for guarding the AI and wrong as a description of the
// shipped game. This file is the description of the shipped game, and it fails.
//
// ## THE HARNESS IS `tests/botplans.mjs`', DELIBERATELY, AND THE FIRST ONE WAS TOO WEAK
//
// ⚠️ **A MEASUREMENT TRAP THAT PRODUCED A WRONG ANSWER HERE, AND THE REASON THIS FILE IS
// WRITTEN THE WAY IT IS.** The first version of this suite ran its own duels at 45 sim-
// seconds over 24 matches a rung and reported a clean inversion. It scored **17 goals
// across 72 matches** — 0.24 a match — so nearly every match finished 0–0 and the whole
// signal came from the handful that scored. Re-run at 90s over 48 matches the numbers
// changed sign, and re-run again with a different seed set they changed sign a second
// time, on BOTH feels. None of it meant anything.
//
// **A goal difference is only as good as the goals under it.** Before believing any
// ladder number in this repo, look at the goal count in the same object: below about two
// goals a match the sign is a coin toss. `botplans`' harness (2v2, 60s, both orientations)
// scores 45-60 goals per 12 matches, which is where the signal lives.
//
// ## What is measured, at that harness, both feels, in the SAME RUN
//
// Goal difference for the STRONGER tier (insane vs rookie), per team strategy:
//
//   plan       standard  balanced  attack  bus  counter  press  passing   pooled
//   Casual        +18       +17     +22    +16    +11     +11     +12      +107
//   Pro (shipped)  -4        +6     -11     +1     -9      -4      -4       -25
//
// Every plan falls by 20 to 33, and the two arms do not overlap at any plan — which is
// what makes this a finding rather than noise, seven independent measurements agreeing.
//
// ⚠️ **BOTH ARMS RUN HERE, and the casual one is the CONTROL rather than decoration.** A
// suite that only measured the shipped feel could not tell "the ladder is broken" from
// "this harness cannot see a ladder", and the paragraph above is exactly how that goes
// wrong. If the control arm ever stops reading a clear ladder, fix the harness before
// reading the claim.
//
// ## It is the MOVEMENT PAIR, not one-touch — isolated by running each half alone
//
//   trapOff:true with casual numbers   ← identical to Casual. One-touch is innocent.
//   ballcap 46 alone                   ← innocent.
//   pdamp 960 alone (the float)        ← breaks it.
//   accel 12 alone (slow build-up)     ← breaks it.
//
// So both movement numbers hurt and there is no single value to back off.
//
// ## Why, and what would fix it
//
// The cause is already written down one layer along, in the note on the drill machine:
// `botArrive` writes in ACCELERATION space against `w.pAccel`, which is the player's own
// Game Feel setting — "so on a low one it asks for almost no stick". Pro's `accel` is 12
// against Casual's 40. Every tier is slowed, but the higher tiers reposition more, so they
// lose more; the float compounds it, because a bot that overshoots has to come back.
//
// The fix is to retune the steering against the shipped movement, not to change the
// default. When that happens this suite goes green and `pinCasualFeel` can come out of the
// three bot suites. ⚠️ Do NOT pin a feel here and do NOT widen the thresholds — that is
// the "raise the threshold until the check passes" defect this repo already records
// against `tests/sprint.mjs`.
import { chromium, LAUNCH, pinCasualFeel } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const errors = [];

// One arm. `casual` decides whether the AI's own tuning is pinned over the shipped default.
async function arm(casual){
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  if (casual) await pinCasualFeel(p);
  const out = await p.evaluate(() => {
    const M = window.__magnet, o = {};
    // ⚠️ `sel.length` pinned: the goals-based default ends a match at three goals, which is
    // invisible to a person and load-bearing for anything measured over a whole match.
    // ⚠️ Auto-replay OFF: `playReplay` returns a promise a synchronous step loop can never
    // resolve, so the goal state just keeps ticking — the trap `botai` records losing 910
    // of 3,600 steps to.
    M.sel.mode = '2v2'; M.sel.length = '5'; M.sel.lobby = 'off';
    M.sel.controllers = 'off'; M.sel.autoReplay = false; M.sel.botPlan = 'standard';
    o.isPro = M.presetMatches(M.FEEL_PRESETS.pro);
    o.feel = JSON.parse(JSON.stringify(M.sel.feel));

    // ⚠️ There is no per-team difficulty on the world — both benches read `w.diff` — so the
    // weaker side is driven by SWAPPING `w.diff` around a manual `runBot` call. Without it
    // this measures one tier against itself and passes on a completely flat ladder.
    // Copied from `botplans`' harness rather than invented, so the two agree by construction.
    const h2h = (A, B, plan, seed, secs) => {
      M.setMatchSeed(seed); M.sel.diff = B;
      M.startMatch();
      const w = M.world;
      w.plan = [M.BOT_PLANS[plan], M.BOT_PLANS[plan]];      // same shape on both sides
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

    o.plans = []; o.pooled = 0; o.goals = 0; o.inverted = [];
    for (const plan of Object.keys(M.BOT_PLANS)){
      let gd = 0, goals = 0;
      for (const seed of [9000, 9422, 9844]){
        const f = h2h('rookie', 'insane', plan, seed, 60);  // strong on team 1
        const r = h2h('insane', 'rookie', plan, seed, 60);  // strong on team 0
        gd += (f.t1 - f.t0) + (r.t0 - r.t1);                // + means the STRONG tier is ahead
        goals += f.t0 + f.t1 + r.t0 + r.t1;
      }
      o.plans.push({ plan, gd, goals });
      o.pooled += gd; o.goals += goals;
      if (gd <= 0) o.inverted.push(plan + ' ' + gd);
    }
    M.sel.diff = 'normal'; M.setMatchSeed(null);
    return o;
  });
  await p.close();
  return out;
}

const pro = await arm(false);
const cas = await arm(true);

let bad = 0;
const ok = (name, cond, note = '') => { if (!cond){ bad++; console.log('  FAIL ' + name + (note ? ' — ' + note : '')); } };
const table = a => a.plans.map(x => `${x.plan} ${x.gd >= 0 ? '+' : ''}${x.gd}`).join(', ');

console.log(JSON.stringify({ pro, cas }, null, 1));
console.log('  PRO    ' + table(pro) + '  → pooled ' + pro.pooled + ' over ' + pro.goals + ' goals');
console.log('  CASUAL ' + table(cas) + '  → pooled ' + cas.pooled + ' over ' + cas.goals + ' goals');

// ---- controls: without these the claim below is unreadable ------------------------
ok('the shipped default IS the Pro preset', pro.isPro,
   JSON.stringify(pro.feel) + ' — if the default has moved, this suite needs re-pointing, not re-reading');
ok('...and the pinned arm is NOT', !cas.isPro,
   'the control arm must actually differ, or both arms measure the same thing');
// ⚠️ A goal difference is only as good as the goals under it. Two a match is the floor
// below which the sign is a coin toss — the trap the header records.
ok('both arms scored enough to read a sign', pro.goals >= 2 * 42 && cas.goals >= 2 * 42,
   `pro ${pro.goals}, casual ${cas.goals} goals over 42 matches each — under ~2 a match the sign is noise`);
// ⚠️ THE HARNESS CONTROL. If this fails, the harness stopped being able to see a ladder
// at all and the claim below means nothing either way — fix this first.
ok('the harness can see a ladder at the AI\'s own tuning',
   cas.pooled > 40 && cas.inverted.length === 0,
   `pooled ${cas.pooled}, inverted [${cas.inverted.join(' | ')}] — the control arm is what separates ` +
   '"the ladder is broken" from "this harness cannot measure a ladder"');

// ---- the claim, at the SHIPPED feel. Red today. ----------------------------------
ok('THE DIFFICULTY LADDER SURVIVES THE SHIPPED DEFAULT', pro.inverted.length === 0,
   `Insane failed to beat Rookie under ${pro.inverted.length} of ${pro.plans.length} strategies ` +
   `[${pro.inverted.join(' | ')}] — the same measurement at the AI's own tuning inverts none of them`);
ok('...and the stronger tier is ahead overall', pro.pooled > 0,
   `pooled goal difference ${pro.pooled} across ${pro.plans.length} strategies, against ${cas.pooled} ` +
   'at the AI\'s own tuning — what moved is the movement, not the AI');

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(bad ? 'FAIL proladder' : 'PASS proladder');
await b.close();
process.exit(bad ? 1 : 0);
