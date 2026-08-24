// MATCH HISTORY, KEPT MATCH REPLAYS, CONTROLLER RUMBLE, AND UNDOING ONE CUP TIE.
//
// Four small features that arrived together, each with one claim that is invisible from
// a screenshot and easy to get backwards:
//
// ⚠️ **THE HISTORY IS A THIRD KIND OF RECORD.** `stats` is one flat object of lifetime
//    numbers; `NAMEBOOK` is one aggregate per name. Neither can say what HAPPENED, and
//    that is what a log is for. The trap is the overlap with "guests have no record":
//    that rule is about `stats`, the device owner's own tally, and a log of what this
//    machine played is exactly where the other names belong.
//
// ⚠️ **THE TWO REPLAY CAPS ARE SEPARATE.** A goal clip is ~40KB and a whole match ~800KB,
//    so one pooled cap let a busy session of goals silently evict the matches somebody
//    was keeping. Measured here as a real eviction, not as a config value.
//
// ⚠️ **RUMBLE IS NOT SCREEN SHAKE.** Its dial is deliberately outside the Screen shake &
//    effects toggle and outside `motionOK()`, the same argument hit stop already won: a
//    wobbling picture is a vestibular problem and a buzz in your hands is not on the
//    screen at all. And every hook is a site that already plays a SOUND — never inside a
//    collision, because `predictsGoal` re-runs those on scratch copies.
//
// ⚠️ **UNDOING A TIE CLEARS ITS DESCENDANTS ONLY.** Unlock already exists for "start the
//    draw again"; wiping the rest of the round would throw away results other people
//    earned, which is the opposite of an undo.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport:{ width:1000, height:1000 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(async () => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(res => setTimeout(res, ms));

  // ==========================================================================
  //  1. MATCH HISTORY
  // ==========================================================================
  o.emptyAtFirst = M.matchLog.length === 0;
  M.sel.lobby = 'off'; M.sel.autoReplay = false; M.sel.mode = '2v2';
  M.sel.keepMatches = '3';
  const play = (score, seed) => {
    M.setMatchSeed(seed); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 1;
    for (let i = 0; i < 350; i++) M.step(w);
    w.score = score.slice();
    M.endMatch(w); M.finishMatch(w);
    return w;
  };
  const w1 = play([3, 1], 41); await wait(200);
  o.oneRow = M.matchLog.length === 1;
  const row = M.matchLog[0];
  o.rowScore = (row.sc || []).join('-');
  o.rowKeepsTeamOrder = row.sc[0] === w1.score[0] && row.sc[1] === w1.score[1];
  o.rowRes = row.res;
  o.rowRp = row.rp;
  o.rowKnowsTheMode = row.mode === '2v2' && row.per === 2;
  // ⚠️ Newest FIRST in storage — the screen never reverses a hundred rows and the cap
  // drops the oldest with one `length =`.
  play([0, 2], 42); await wait(200);
  play([1, 1], 43); await wait(200);
  o.order = M.matchLog.map(x => x.res).join('');
  o.newestFirst = o.order === 'dlw';
  o.form = M.matchLogForm(3).join('');
  o.formIsTheOrder = o.form === o.order;

  // ⚠️ A DRILL, A SPECTATED MATCH AND THE ATTRACT DEMO ARE NOT MATCHES ANYBODY PLAYED,
  // and `noteMatch` refuses all three. Checked through the real function rather than by
  // running a drill, because what is under test is the refusal itself.
  {
    const before = M.matchLog.length;
    const fake = k => { const w = M.world; const was = w[k]; w[k] = true;
                        const got = M.noteMatch(w, 5, 'w'); w[k] = was; return got; };
    o.refusesDemo  = fake('demo') === null;
    o.refusesDrill = fake('drillMode') === null;
    o.refusesWatch = fake('watch') === null;
    o.refusedAllThree = M.matchLog.length === before;
  }

  // ---- the screen ----------------------------------------------------------
  M.openStats(); M.buildMatchLog(); await wait(400);
  const host = $('matchLogList');
  o.uiRows = host.querySelectorAll('div[style*="border-top"]').length;
  o.uiMatchesModel = o.uiRows === M.matchLog.length;
  o.uiSubCountsThem = /3 played/.test($('matchLogSub').textContent);
  // ⚠️ Built as NODES, never innerHTML: a row carries names typed by a person.
  o.nameIsNotMarkup = (() => {
    M.matchLog[0].who = ['<img src=x onerror=1>'];
    M.buildMatchLog();
    const bad = $('matchLogList').querySelector('img');
    M.matchLog[0].who = ['You'];
    return !bad;
  })();

  // ==========================================================================
  //  2. KEPT MATCH REPLAYS
  // ==========================================================================
  M.buildMatchLog(); await wait(400);
  {
    const lib = await M.repLibAll();
    const matches = lib.filter(x => x.kind === 'match');
    o.keptCount = matches.length;
    o.keptRespectsTheDial = matches.length === M.matchKeepN();
    // Every kept replay is one the history knows about, and the newest rows are the ones
    // that have one — that is what "the last few" means.
    const ids = new Set(matches.map(x => x.id));
    o.newestRowsHaveReplays = M.matchLog.slice(0, matches.length).every(x => ids.has(x.rep));
  }
  // ⚠️ Turning the dial DOWN trims immediately. Leaving seven big files on disk until the
  // next match is the setting not doing what it says — and on a phone those seven are the
  // reason somebody turned it down.
  M.sel.keepMatches = '0';
  await M.repLibTrim();
  o.zeroTrimsAll = (await M.repLibAll()).filter(x => x.kind === 'match').length === 0;
  M.sel.keepMatches = '5';

  // ⚠️ AND THE HISTORY SURVIVES ITS REPLAY BEING TRIMMED. The row keeps the id for ever
  // and the library keeps only the last few, so most rows point at a replay that is gone —
  // a Watch button that fails is worse than no button.
  M.buildMatchLog(); await wait(400);
  o.rowsAfterTrim = $('matchLogList').querySelectorAll('div[style*="border-top"]').length;
  o.watchBtnsAfterTrim = $('matchLogList').querySelectorAll('button').length;
  o.rowsOutliveReplays = o.rowsAfterTrim === M.matchLog.length && o.watchBtnsAfterTrim === 0;

  // ==========================================================================
  //  3. RUMBLE
  // ==========================================================================
  o.rumbleDefault = M.defaultSel().rumble;
  o.rumbleHasASlider = !!$('rumble');
  // ⚠️ NOT under Screen shake, and not under reduced motion — a buzz in your hands is not
  // motion on the screen. Both are asserted, because either alone passes on a build that
  // gates it on the other.
  M.sel.juice = false;
  o.liveWithShakeOff = M.rumbleOn();
  M.sel.juice = true;
  o.motionOKisFalseWithJuiceOff = (() => { M.sel.juice = false; const v = M.motionOK();
                                           M.sel.juice = true; return v === false; })();
  // ...and the dial really is the off switch.
  M.sel.rumble = 0; o.zeroIsOff = !M.rumbleOn();
  M.sel.rumble = 70; o.dialReads = Math.round(M.rumbleAmt() * 100) === 70;
  // ⚠️ NO PAD, NO THROW. `padIndex` is -1 for touch and keyboard seats, an arcade panel is
  // a virtual pad with nothing behind it, and Safari and Firefox have no actuator at all —
  // so every one of these has to be a quiet no-op rather than an exception on every kick.
  o.safeWithoutHardware = (() => {
    try { M.padRumble(-1, 'kick', 1); M.padRumble(0, 'kick', 1); M.padRumble(9, 'goal', 1);
          M.padRumble(0, 'nosuchkind', 1); M.rumbleAll(M.world, 'wall', 1); M.rumbleGoal();
          return true; } catch(e){ return e.message; }
  })();
  // ⚠️ RENDER-AND-FEEL ONLY: the sim may not be able to tell whether a pad is buzzing.
  // Hashed over 900 steps with the dial at both ends.
  const hashWorld = () => {
    const w = M.world; let h = 0;
    const push = v => { h = (h * 31 + Math.round((v || 0) * 1e6)) >>> 0; };
    push(w.ball.x); push(w.ball.y); push(w.ball.vx); push(w.ball.vy);
    for (const q of w.players){ push(q.x); push(q.y); push(q.vx); push(q.vy); }
    push(w.score[0]); push(w.score[1]);
    return h;
  };
  const runHash = amt => { M.sel.rumble = amt; M.setMatchSeed(77); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 1;
    for (let i = 0; i < 900; i++) M.step(w); return hashWorld(); };
  o.hashOff = runHash(0); o.hashFull = runHash(100);
  o.rumbleIsInert = o.hashOff === o.hashFull;
  M.sel.rumble = 70;

  // ==========================================================================
  //  4. UNDO ONE CUP TIE
  // ==========================================================================
  M.cup.size = 8; M.cupFill(); M.cupLock(true);
  M.cup.won = [0, 1, 0, 1, 0, 0, 1];                 // the whole bracket played out
  M.cup.cups = 1;
  o.champBeforeUndo = M.cupChampion();
  // Undo QF2 (round 0, seat 1). It feeds SF1 (index 4), which feeds the Final (index 6).
  // QF1, QF3, QF4 and SF2 are somebody else's results and must survive.
  o.undid = M.cupUndo(1);
  o.doneAfter = M.cupMatches().filter(m => m.done).map(m => m.i).join(',');
  o.keptTheOthers = o.doneAfter === '0,2,3,5';
  o.champGone = M.cupChampion() === null;
  // ⚠️ Un-winning the tournament gives the trophy back, or replaying the final counts the
  // same tournament twice.
  o.trophyReturned = M.cup.cups === 0;
  // ...and it only touches a tie that was actually played.
  o.undoNeedsAResult = M.cupUndo(1) === false && M.cupUndo(99) === false;

  M.sel.keepMatches = '5'; M.sel.mode = '1v1'; M.setMatchSeed(null);
  return o;
});

ok('the history starts empty', r.emptyAtFirst);
ok('a finished match writes one row', r.oneRow && r.rowRes === 'w' && r.rowRp > 0,
   JSON.stringify({ res:r.rowRes, rp:r.rowRp }));
ok('...with the score in TEAM order', r.rowKeepsTeamOrder, r.rowScore +
   ' — the scorebug is colour-coded red-then-blue and read that way all match; the W/L carries the perspective');
ok('...and what was played', r.rowKnowsTheMode);
ok('newest first', r.newestFirst, r.order);
ok('...which is also the form guide', r.formIsTheOrder, r.form + ' vs ' + r.order);
ok('a demo, a drill and a spectated match are not logged',
   r.refusesDemo && r.refusesDrill && r.refusesWatch && r.refusedAllThree,
   JSON.stringify({ demo:r.refusesDemo, drill:r.refusesDrill, watch:r.refusesWatch }));
ok('the screen shows every row', r.uiMatchesModel, r.uiRows + ' drawn');
ok('...and counts them', r.uiSubCountsThem);
ok('a typed name cannot be markup', r.nameIsNotMarkup,
   'rows carry names typed by a person, which is the trap mapClean and buildNameBook both record');
ok('the last few matches are kept as replays', r.keptRespectsTheDial,
   r.keptCount + ' kept against a dial of 3');
ok('...and they are the newest ones', r.newestRowsHaveReplays);
ok('turning the count to 0 trims immediately', r.zeroTrimsAll,
   'leaving the files on disk until the next match is the setting not doing what it says');
ok('a history row outlives its replay', r.rowsOutliveReplays,
   JSON.stringify({ rows:r.rowsAfterTrim, watch:r.watchBtnsAfterTrim }) +
   ' — the row keeps the id for ever, so a Watch button has to be offered only when the replay is still there');
ok('rumble defaults on, with a slider', r.rumbleDefault === 15 && r.rumbleHasASlider, String(r.rumbleDefault));
ok('...and is NOT under Screen shake', r.liveWithShakeOff && r.motionOKisFalseWithJuiceOff,
   'a buzz in your hands is not motion on the screen — the same argument hit stop already won; the second half proves the check is not vacuous');
ok('...with 0 as the off switch', r.zeroIsOff && r.dialReads);
ok('no pad, no throw', r.safeWithoutHardware === true, String(r.safeWithoutHardware));
ok('rumble cannot reach the sim', r.rumbleIsInert,
   r.hashOff + ' vs ' + r.hashFull + ' over 900 steps at 0% and 100%');
ok('undoing a tie clears its descendants', r.undid && r.champGone, r.doneAfter);
ok('...and NOTHING else', r.keptTheOthers,
   r.doneAfter + ' — Unlock already exists for starting the draw again; wiping the round would throw away results other people earned');
ok('...and gives the trophy back', r.trophyReturned);
ok('...and only touches a tie that was played', r.undoNeedsAResult);
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL history\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS history');
