// WHICH GOALS GET AN AUTO-REPLAY.
//
// `sel.autoReplay` used to replay EVERY goal, and at the shipped default that was most of
// the match: four seeded 5-minute 3v3s at Normal produced 6 / 12 / 15 / 7 goals, and each
// goal costs a 3s hold plus 7.6s of frames at half speed — ~18s off the clock. Measured on
// those four matches, 41 goals: **746s of replay against ~1,500s of play**. A bot's tap-in
// at 0-7 is not what an instant replay is for.
//
// `goalNotable(w, ball, team)` keeps: a PERSON's goal, one struck from a long way out
// (`NOTABLE.far` of the pitch length — the top decile of measured strike distances), one
// that went in off the boards or a post, one that changed the lead or levelled it (which
// includes the first goal of every match), and the goal that decides it. Same four seeds:
// **15 of 41 kept, 273s of replay** — a third of the time, and the goals that are left are
// the ones with a story.
//
// ⚠️ DECIDED WHERE THE GOAL IS SCORED, from what the ball already carries (`kickY`,
// `_banked`, `lastKicker`) — the floaters' rule — and BEFORE `creditScorer` clears the
// kicker chain. `w._goalNotable` is what `autoReplayReady` reads; a path that reaches the
// goal state without writing it reads as notable, so the gate can only hold back a goal it
// has judged.
//
// ⚠️ THE CONTROL IS `'all'` IN THE SAME RUN: "fewer replays" is equally true of a build
// whose replay is broken, so the same tap-in that is held back on the default has to fire
// under 'all'. Each reason is also driven on its own constructed goal, because the share on
// a seeded match is one number and cannot say WHICH rule is dead.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);
const fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const r = await p.evaluate(async () => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const wait = ms => new Promise(res => setTimeout(res, ms));
  o.defaultIsBest = M.defaultSel().autoReplay === true;
  o.tiles = [...document.querySelectorAll('#autoReplayPick .opt')].map(e => e.textContent.trim());

  // ---- the share, on the shipped default, over four seeded matches --------------------
  // ⚠️ autoReplay OFF while stepping — a synchronous loop can never resolve the replay
  // promise (the trap `botai` records) — and the judgement is read off `w._goalNotable`,
  // which scoreGoal writes whatever the setting says.
  M.sel.autoReplay = false; M.sel.mode = '3v3'; M.sel.length = '5';
  let goals = 0, kept = 0;
  for (const seed of [3, 11, 29, 47]){
    M.setMatchSeed(seed); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 1;
    let last = 0, steps = 0;
    while (w.state !== 'over' && steps < 60*420){
      M.step(w); steps++;
      const now = w.score[0] + w.score[1];
      if (now > last){ last = now; goals++; if (w._goalNotable) kept++; }
    }
  }
  o.goals = goals; o.kept = kept;
  o.share = +(kept / Math.max(1, goals)).toFixed(3);
  o.secsPer = 3 + (M.repSecs() + M.REP_TAIL) / 0.5;

  // ---- each reason on its own constructed goal --------------------------------------
  // A fresh 1v1, the score set by hand so the lead rule can be switched off, and a shot
  // rolled in from a chosen spot by a chosen body. Team 0 attacks the TOP goal.
  const fire = (setup) => {
    M.setMatchSeed(5); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    const me = w.players.find(q => q.team === 0), foe = w.players.find(q => q.team === 1);
    // park the bots so nobody else touches it
    w.players.forEach(q => { q.aiFrozen = true; q.inX = q.inY = 0; q.x = 200; q.y = 300; });
    const bl = w.ball, halfL = w.field.L/2;
    w.score = [0, 2];                       // team 0 trailing: its goal changes no lead
    setup(w, bl, me, foe, halfL);
    let steps = 0;
    while (w.state === 'play' && steps < 600){ M.step(w); steps++; }
    return { state: w.state, notable: w._goalNotable, score: w.score.slice() };
  };
  // the kick is noted through the real path: put the ball on the striker's foot, one step
  const strike = (w, bl, who, fromY, vy) => {
    who.x = 0; who.y = fromY + 24; who.ctrl = who.ctrl === 'bot' ? 'bot' : who.ctrl;
    bl.x = 0; bl.y = fromY; bl.vx = 0; bl.vy = 0; bl._banked = false;
    bl.kickX = 0; bl.kickY = fromY;          // what noteKick would have written
    bl.lastKicker = who; bl.lastKickTeam = who.team; bl.lastKickT = w.matchT;
    bl.vy = vy;
  };
  const closeY = h => -h * 0.75;             // a tap-in from a quarter of the half out
  // (a) a bot's tap-in with the lead unchanged: NOT notable
  o.tapIn = fire((w, bl, me, foe, h) => { me.ctrl = 'bot'; strike(w, bl, me, closeY(h), -14); });
  // (b) the same tap-in by a PERSON: notable
  o.human = fire((w, bl, me, foe, h) => { me.ctrl = 'human1'; strike(w, bl, me, closeY(h), -14); });
  // (c) a bot from a long way out: notable
  // `far` is a fraction of the pitch LENGTH (2h); 4 units past the line so it is inside
  o.far = fire((w, bl, me, foe, h) => { me.ctrl = 'bot'; strike(w, bl, me, -h + M.NOTABLE.far * 2 * h + 4, -22); });
  // (d) a bot's tap-in that came off the boards: notable
  o.bank = fire((w, bl, me, foe, h) => { me.ctrl = 'bot'; strike(w, bl, me, closeY(h), -14); bl._banked = true; });
  // (e) a bot's tap-in that LEVELS the match: notable
  o.lead = fire((w, bl, me, foe, h) => { me.ctrl = 'bot'; w.score = [1, 2]; strike(w, bl, me, closeY(h), -14); });
  const scored = x => x.state === 'goal';
  o.allScored = [o.tapIn, o.human, o.far, o.bank, o.lead].every(scored);

  // ---- and the gate is what autoReplayReady reads ----------------------------------
  // ⚠️ THE REAL FRAME LOOP HAS TO RUN: the rolling buffer is captured per FRAME in `loop()`,
  // never in `step()`, so a synchronous probe scores a goal with an empty buffer and the
  // replay cannot fire on any build. Everybody is parked, the page runs for a second and a
  // half, the tap-in is rolled in, and the goal state is left to run past GOALHOLD.replayAt
  // on the wall clock — `goalcam` uses the same shape.
  const runOut = async (setting) => {
    M.sel.autoReplay = setting;
    M.setMatchSeed(5); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    w.players.forEach(q => { q.aiFrozen = true; q.inX = q.inY = 0; q.x = 200; q.y = 300; });
    await wait(1500);
    const me = w.players.find(q => q.team === 0); me.ctrl = 'bot';
    w.score = [0, 2];
    strike(w, w.ball, me, closeY(w.field.L/2), -14);
    let fired = false, t0 = performance.now();
    while (performance.now() - t0 < 5000){
      await wait(50);
      if (M.replay.active){ fired = true; break; }
      if (w.state !== 'play' && w.state !== 'goal') break;   // kicked off again without one
    }
    const notable = w._goalNotable, state = w.state, score = w.score.slice();
    M.replayAbort(); await wait(50);
    return { fired, notable, state, score };
  };
  o.gateBest = await runOut(true);
  o.gateAll  = await runOut('all');
  M.sel.autoReplay = true; M.setMatchSeed(null);
  return o;
});

// ---- the fold, and the fresh install it must not touch ---------------------------------
// ⚠️ `autoReplayReady` used to read `motionOK()`, which is `!!sel.juice`, and `juice` ships
// FALSE — so at the shipped default NOTHING above could ever fire and the picker was a dead
// control. It is uncoupled now (the goal-zoom precedent), which means a device that turned
// the shake off and has therefore never seen an auto-replay would be handed one at every
// notable goal. `magnetball.replayfold` moves such a device's picker to Off, once. Both of
// its arms are true of a FRESH install, so the `magnetball.sel` guard is the whole of what
// keeps a new player's feature on — checked here from both sides.
// ⚠️ Its own page per case: the main page's init script clears storage on EVERY load, so a
// value planted before a reload is gone before the bootstrap can read it (the first version
// of this block measured a fresh install five times and called two of them a broken fold).
const foldRun = async (stored, pre) => {
  const q = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await q.addInitScript(({ stored, pre }) => {
    window.__MAGNETDEBUG = true; localStorage.clear();
    if (stored) localStorage.setItem('magnetball.sel', JSON.stringify(stored));
    if (pre) localStorage.setItem('magnetball.replayfold', '1');
  }, { stored, pre });
  await q.goto('file://' + process.cwd() + '/index.html'); await q.waitForTimeout(600);
  const o = await q.evaluate(() => ({ auto: window.__magnet.sel.autoReplay, juice: window.__magnet.sel.juice,
                                      selKey: !!localStorage.getItem('magnetball.sel'),
                                      stamped: !!localStorage.getItem('magnetball.replayfold') }));
  await q.close();
  return o;
};
const fold = {
  fresh:    await foldRun(null, false),
  effOff:   await foldRun({ juice: false, autoReplay: true }, false),
  chose:    await foldRun({ juice: false, autoReplay: 'all' }, false),
  effOn:    await foldRun({ juice: true, autoReplay: true }, false),
  already:  await foldRun({ juice: false, autoReplay: true }, true),
};

ok('the default is BEST goals', r.defaultIsBest, JSON.stringify(r.tiles));
ok('the picker offers Best / Every / Off', r.tiles.length === 3, JSON.stringify(r.tiles));
ok('that was a match with goals in it', r.goals >= 20, `${r.goals} goals over four matches`);
ok('the default keeps well under every goal', r.share <= 0.6 && r.kept >= 4,
   `${r.kept} of ${r.goals} kept (${r.share}) — ${(r.secsPer * r.goals).toFixed(0)}s of replay under 'all' against ${(r.secsPer * r.kept).toFixed(0)}s`);
ok('every constructed goal actually went in', r.allScored, JSON.stringify({ tapIn: r.tapIn, human: r.human, far: r.far, bank: r.bank, lead: r.lead }));
ok('a bot tap-in with the lead unchanged is NOT replayed', r.tapIn.notable === false, JSON.stringify(r.tapIn));
ok('...the same goal by a PERSON is', r.human.notable === true, JSON.stringify(r.human));
ok('...a bot from long range is', r.far.notable === true, JSON.stringify(r.far));
ok('...a bot off the boards is', r.bank.notable === true, JSON.stringify(r.bank));
ok('...and a bot levelling the match is', r.lead.notable === true, JSON.stringify(r.lead));
ok('autoReplayReady holds the tap-in back on the default', r.gateBest.fired === false && r.gateBest.notable === false,
   JSON.stringify(r.gateBest));
ok("...and 'all' replays it, so the gate is what changed and not the replay", r.gateAll.fired === true,
   JSON.stringify(r.gateAll) + ' — "fewer replays" is equally true of a build whose replay is broken');
ok('a FRESH install keeps Best goals and writes no save', fold.fresh.auto === true && !fold.fresh.selKey && fold.fresh.stamped,
   JSON.stringify(fold.fresh) + ' — both arms of the fold are true of a fresh install, so only the magnetball.sel guard keeps the feature on and isFirstRun alive');
ok('an effects-off device that never saw a replay is folded to Off', fold.effOff.auto === false && fold.effOff.stamped,
   JSON.stringify(fold.effOff) + ' — it has never had one, and Off is the honest label for that');
ok("...but a device that CHOSE 'all' keeps it", fold.chose.auto === 'all', JSON.stringify(fold.chose));
ok('...and an effects-on device is untouched', fold.effOn.auto === true, JSON.stringify(fold.effOn));
ok('...and the fold is one-shot', fold.already.auto === true, JSON.stringify(fold.already) + ' — stamped already, so a picker turned back on stays on');
ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL notable\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS notable');
