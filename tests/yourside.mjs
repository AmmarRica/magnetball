// WHICH SIDE ARE *YOU* ON — and what happens to the record when it isn't team 0.
//
// ⚠️ THE DEFECT, measured before the fix: every path that reported or recorded a
// result read `w.score[0]` as "mine". Team 0 is not always yours — the warm-up lobby
// hands out sides by which half you walked into, so walking to the top half puts you
// on team 1. A 5-0 win from up there was recorded as a LOSS: RP down, Elo down, the
// streak broken, the goals for and against swapped, the clean sheet credited to the
// other side, and the result screen saying YOU LOSE over a match you had just won.
// The same door reaches Season (a cleared round counted as a failure) and Gauntlet
// (a won round costing a life).
//
// The other half of the question this suite answers: GUESTS DO NOT HAVE RECORDS.
// Every seat but the first is somebody borrowing the device, so a name in the Player
// names box must never end up in the save — and renaming a seat must not reset,
// branch or otherwise touch the one record that does exist.
//
// ⚠️ MEASUREMENT TRAP: do not test this by setting `p.team = 1` by hand and calling
// `recordResult`. That measures the helper against itself. The team has to be assigned
// the way the game assigns it — walk into a half, press Start — or the assertion
// passes on a build where the lobby hands out sides some other way entirely.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport:{ width:900, height:900 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(() => {
  const M = window.__magnet; const o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const me = w => w.players.find(q => q.ctrl === 'human1');

  // Walk into a half in the lobby and press Start — the real mechanism, not a hand
  // assignment. `half` -1 is the top of the pitch, which is team 1's end.
  const matchOn = (half, mode) => {
    M.sel.display='auto'; M.applyDisplayMode();
    M.sel.lobby='touch'; M.sel.mode = mode || '2v2';
    M.setMatchSeed(3); M.startMatch();
    const w = M.world;
    const you = M.lobbyHumans(w)[0];
    you.x = 0; you.y = half * w.field.L/2 * 0.5;
    for (let i=0;i<10;i++) M.step(w);
    M.lobbyStart(w);
    return w;
  };
  const snap = () => ({ w: M.stats.wins, l: M.stats.losses, pts: M.stats.points,
                        mmr: M.stats.mmr, gf: M.stats.gf, ga: M.stats.ga,
                        streak: M.stats.streak, cs: M.stats.cleanSheets || 0 });
  const diff = (a, b2) => ({ w: b2.w-a.w, l: b2.l-a.l, pts: b2.pts-a.pts, mmr: b2.mmr-a.mmr,
                             gf: b2.gf-a.gf, ga: b2.ga-a.ga, streak: b2.streak, cs: b2.cs-a.cs });

  // ---- 1. the lobby really can put you on team 1 --------------------------
  // If this ever stops being true the rest of the suite is measuring nothing, so it
  // is asserted rather than assumed.
  o.bottomHalfTeam = me(matchOn(1)).team;
  o.topHalfTeam    = me(matchOn(-1)).team;
  o.lobbyCanSwapYou = o.topHalfTeam === 1 && o.bottomHalfTeam === 0;
  o.helperAgrees = (() => { const w = matchOn(-1); return M.youTeam(w) === me(w).team; })();

  // ---- 2. a win from the TOP half is recorded as a win ---------------------
  {
    const w = matchOn(-1);                       // you are team 1
    const before = snap();
    w.score = [0, 5];                            // your side, 5-0
    M.recordResult(w);
    o.topWin = diff(before, snap());
    o.topWinCounted = o.topWin.w === 1 && o.topWin.l === 0;
    o.topWinRp = o.topWin.pts > 0;
    o.topWinElo = o.topWin.mmr > 0;
    o.topWinGoals = o.topWin.gf === 5 && o.topWin.ga === 0;
    o.topWinStreak = o.topWin.streak > 0;
    o.topWinCleanSheet = o.topWin.cs === 1;
  }
  // ...and it still gets a LOSS right from up there — a helper that always answered
  // "you won" would pass everything above.
  {
    const w = matchOn(-1);
    const before = snap();
    w.score = [4, 0];                            // the OTHER side, 4-0
    M.recordResult(w);
    o.topLoss = diff(before, snap());
    o.topLossCounted = o.topLoss.l === 1 && o.topLoss.w === 0 && o.topLoss.pts < 0;
    o.topLossGoals = o.topLoss.gf === 0 && o.topLoss.ga === 4;
  }
  // ...and the bottom half is untouched by the fix.
  {
    const w = matchOn(1);
    const before = snap();
    w.score = [3, 1];
    M.recordResult(w);
    o.bottomWin = diff(before, snap());
    o.bottomStillRight = o.bottomWin.w === 1 && o.bottomWin.gf === 3 && o.bottomWin.ga === 1;
  }

  // ---- 3. the RESULT SCREEN agrees with the record -------------------------
  // ⚠️ Read off the rendered title, not off a variable — the screen is the thing the
  // player disputes, and it had its own copy of the team-0 assumption.
  {
    const w = matchOn(-1);
    w.score = [0, 5];
    M.endMatch(w); M.finishMatch(w);
    o.topWinTitle = (document.querySelector('#overlay h2') || {}).textContent || '';
    o.titleSaysWin = /YOU WIN/i.test(o.topWinTitle);
    // ⚠️ ...and the scoreline stays in TEAM order, matching the colour-coded scorebug
    // the player has been watching all match. Reordering it to put your goals first
    // would print a number they never saw.
    o.topWinSub = (document.querySelector('#overlay p') || {}).textContent || '';
    o.subKeepsTeamOrder = /0\s*[–-]\s*5/.test(o.topWinSub);
  }
  {
    const w = matchOn(-1);
    w.score = [5, 0];
    M.endMatch(w); M.finishMatch(w);
    o.topLossTitle = (document.querySelector('#overlay h2') || {}).textContent || '';
    o.titleSaysLose = /YOU LOSE/i.test(o.topLossTitle);
  }

  // ---- 4. Killer Queen decides by forceWin, and that is a team too ---------
  {
    const w = matchOn(-1);
    const before = snap();
    w.forceWin = me(w).team;                     // your side rode the snail home
    w.forceWinBy = 'snail';
    w.score = [6, 1];                            // ...and lost on goals, which is the point
    M.recordResult(w);
    o.kqWin = diff(before, snap());
    o.kqSnailWinCounted = o.kqWin.w === 1 && o.kqWin.l === 0;
    M.finishMatch(w);
    o.kqTitle = (document.querySelector('#overlay h2') || {}).textContent || '';
    o.kqTitleSaysWin = /SNAIL HOME/i.test(o.kqTitle);
    w.forceWin = null; w.forceWinBy = null;
  }

  // ---- 5. GUESTS HAVE NO RECORD -------------------------------------------
  // Only the main player is tracked. Every other seat is somebody borrowing the
  // device, so a name typed into the box must never reach the save, and renaming
  // must not reset or branch the one record there is.
  {
    M.sel.names = 'Ash\nRio\nKit\nNova';
    M.setMatchSeed(3); M.startMatch();
    const w = M.world;
    o.guestNamesApplied = w.players.slice(0, 4).map(q => q.name).join(',');
    const before = snap();
    w.score = [2, 1];
    M.recordResult(w);
    o.afterGuestMatch = diff(before, snap());
    o.statsBlob = JSON.stringify(M.stats);
    o.noGuestInSave = !/Ash|Rio|Kit|Nova/.test(o.statsBlob);
    o.oneRecordOnly = Object.keys(M.stats).every(k => typeof M.stats[k] === 'number');
    // Renaming keeps the record exactly as it was — no reset, no second row.
    const kept = snap();
    M.sel.names = 'Zed\nQuinn\nMax\nLou'; M.saveSel();
    M.setMatchSeed(3); M.startMatch();
    const after = snap();
    o.renameKeepsRecord = JSON.stringify(kept) === JSON.stringify(after);
    o.renameMadeNoNewKeys = Object.keys(M.stats).length === Object.keys(JSON.parse(o.statsBlob)).length;
    M.sel.names = ''; M.saveSel();
  }

  M.sel.lobby='on'; M.sel.mode='1v1'; M.setMatchSeed(null);
  return o;
});

ok('the lobby really does hand you team 1 from the top half', r.lobbyCanSwapYou,
   `top=${r.topHalfTeam} bottom=${r.bottomHalfTeam} — the rest of this suite measures nothing otherwise`);
ok('youTeam agrees with where the lobby actually put you', r.helperAgrees);
ok('a 5-0 win from the top half is a WIN', r.topWinCounted, JSON.stringify(r.topWin));
ok('...and pays RP', r.topWinRp, `RP moved ${r.topWin && r.topWin.pts}`);
ok('...and Elo', r.topWinElo, `MMR moved ${r.topWin && r.topWin.mmr}`);
ok('...with the goals the right way round', r.topWinGoals, JSON.stringify(r.topWin));
ok('...the streak going up', r.topWinStreak, `streak ${r.topWin && r.topWin.streak}`);
ok('...and the clean sheet credited to you', r.topWinCleanSheet, JSON.stringify(r.topWin));
ok('a 4-0 defeat from the top half is still a LOSS', r.topLossCounted, JSON.stringify(r.topLoss));
ok('...with those goals the right way round too', r.topLossGoals, JSON.stringify(r.topLoss));
ok('the bottom half is unchanged by the fix', r.bottomStillRight, JSON.stringify(r.bottomWin));
ok('the result screen says YOU WIN for a win from the top half', r.titleSaysWin, `it said "${r.topWinTitle}"`);
ok('...and the scoreline stays in team order, matching the scorebug', r.subKeepsTeamOrder, r.topWinSub);
ok('...and still says YOU LOSE for a defeat', r.titleSaysLose, `it said "${r.topLossTitle}"`);
ok('a Killer Queen snail win from the top half is a win', r.kqSnailWinCounted, JSON.stringify(r.kqWin));
ok('...and the screen says so', r.kqTitleSaysWin, `it said "${r.kqTitle}"`);
ok('guest names reach the pitch', /Ash/.test(r.guestNamesApplied || ''), r.guestNamesApplied);
ok('...but never the save', r.noGuestInSave, r.statsBlob);
ok('there is ONE record, all numbers — no per-guest branch', r.oneRecordOnly, r.statsBlob);
ok('renaming leaves the record alone', r.renameKeepsRecord);
ok('...and adds no keys', r.renameMadeNoNewKeys);
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL yourside\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS yourside');
