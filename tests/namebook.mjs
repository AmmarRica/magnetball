// A RECORD PER NAME — the arcade cabinet's book, kept on this device.
//
// The NAME is the identity, the way a cabinet works: you put your name in and the machine
// remembers what that name did. It pairs with the lobby keyboard, where you spell your
// name with your feet before walking on.
//
// ⚠️ IT IS NOT `stats`. That is one flat object of numbers for the device's owner, and it
// cannot answer "who has played on this machine" — which is the whole question here. Both
// are updated, and the checks below hold them apart.
//
// ⚠️ EVERY human on the pitch gets a record, each judged by THEIR OWN side's scoreline, so
// a 2v2 gives two wins and two losses rather than one of each.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };
const p = await b.newPage({ viewport: { width: 1000, height: 1000 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|ERR_TUNNEL/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const book = () => JSON.parse(localStorage.getItem(M.NAMEBOOK.key) || '{}');
  localStorage.removeItem(M.NAMEBOOK.key);
  Object.keys(M.nameBook).forEach(k => delete M.nameBook[k]);

  // ---- a win, a loss and a draw for one name -----------------------------------
  const R = 1100;
  M.noteNameResult('Rosalind', 1, 3, 1, { goals: 2, assists: 1, saves: 0 }, R, 1);
  M.noteNameResult('Rosalind', 0, 0, 2, { goals: 0, assists: 0, saves: 3 }, R, 2);
  M.noteNameResult('Rosalind', 0.5, 1, 1, null, R, 3);
  const ros = book()[M.nameKey('Rosalind')];
  o.rec = ros;
  o.counts = ros.played === 3 && ros.wins === 1 && ros.losses === 1 && ros.draws === 1;
  o.goalsFor = ros.gf === 4 && ros.ga === 4;
  o.perMatchStatsKept = ros.goals === 2 && ros.assists === 1 && ros.saves === 3;
  o.streakReset = ros.streak === 0 && ros.best === 1;
  o.hasRating = ros.mmr !== 1000 && ros.mmrPeak >= ros.mmr;

  // ⚠️ CASE AND SPACES are one person at a cabinet, but the name is STORED as first typed.
  M.noteNameResult('  rosalind ', 1, 5, 0, null, R, 4);
  o.oneEntry = Object.keys(book()).length === 1;
  o.storedAsTyped = book()[M.nameKey('ROSALIND')].name === 'Rosalind';
  o.foldedCounts = book()[M.nameKey('Rosalind')].played === 4;

  // ⚠️ A name the game made up is NOT recorded — filing every anonymous match under one
  // entry makes the book a lie the moment two people share the device.
  M.noteNameResult('You', 1, 9, 0, null, R, 5);
  M.noteNameResult('', 1, 9, 0, null, R, 6);
  M.noteNameResult('   ', 1, 9, 0, null, R, 7);
  o.anonymousIgnored = Object.keys(book()).length === 1;

  // ---- the rating is the SAME Elo the device record uses ------------------------
  o.sharedStep = M.mmrStep(1000, 1100, 1) === (() => {
    const exp = 1/(1+Math.pow(10,(1100-1000)/400));
    return Math.max(100, Math.round(1000 + 32*(1-exp)));
  })();

  // ---- ranked best first, and the cap drops the LEAST RECENT -------------------
  for (let i = 0; i < M.NAMEBOOK.max + 6; i++)
    M.noteNameResult('P' + i, i % 2 ? 1 : 0, 1, 0, null, R, 100 + i);
  o.capped = Object.keys(book()).length <= M.NAMEBOOK.max;
  // Rosalind played at t=4, long before the filler, so she is the one who ages out.
  o.oldestWent = !book()[M.nameKey('Rosalind')];
  const tbl = M.nameBookTable();
  o.sortedByRating = tbl.every((x, i) => i === 0 || tbl[i-1].mmr >= x.mmr);
  return o;
});

// ============================ a real match writes one record per human ==
const live = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  localStorage.removeItem(M.NAMEBOOK.key);
  Object.keys(M.nameBook).forEach(k => delete M.nameBook[k]);
  M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
  M.setMatchSeed(12); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  // Two named humans, one a side, so a decided match has to give one win and one loss.
  w.players[0].ctrl = 'human1'; w.players[0].name = 'Ada';   w.players[0].team = 0;
  w.players[1].ctrl = 'human2'; w.players[1].name = 'Grace'; w.players[1].team = 1;
  w.score[0] = 3; w.score[1] = 1;
  const before = JSON.parse(localStorage.getItem('magnetball.stats') || '{}').played || 0;
  M.recordResult(w);
  const bk = JSON.parse(localStorage.getItem(M.NAMEBOOK.key) || '{}');
  o.names = Object.keys(bk).sort();
  o.ada = bk[M.nameKey('Ada')];
  o.grace = bk[M.nameKey('Grace')];
  o.bothRecorded = !!o.ada && !!o.grace;
  // ⚠️ Judged by THEIR OWN side: the 3-1 is a win for team 0 and a loss for team 1.
  o.sidesRespected = o.ada && o.grace && o.ada.wins === 1 && o.grace.losses === 1 &&
                     o.ada.gf === 3 && o.grace.gf === 1;
  // ...and the device's own record still moved, because these are two different things.
  o.deviceStillCounts = (JSON.parse(localStorage.getItem('magnetball.stats')||'{}').played||0) === before + 1;
  o.noBots = Object.keys(bk).length === 2;
  return o;
});

// ================================================= it shows, and it travels ==
const ui = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.buildSettings(); M.renderStats();
  const host = document.getElementById('nameBook');
  o.present = !!host;
  o.text = host ? host.textContent : '';
  o.listsBoth = /Ada/.test(o.text) && /Grace/.test(o.text);
  o.showsRecord = /1W/.test(o.text);
  // ⚠️ Built as NODES, never innerHTML: a name is typed by a person.
  const inj = 'Zz<img src=x onerror=1>';
  M.noteNameResult(inj, 1, 1, 0, null, 1100, Date.now());
  M.renderStats();
  o.noMarkupRan = document.getElementById('nameBook').querySelectorAll('img').length === 0;
  // ...and the save file carries the book, so a room's records move with the device.
  o.inSaveKeys = M.SAVEFILE.keys.includes('names');
  o.inSaveDoc = 'names' in M.buildSaveDoc().data;
  return o;
});
await p.close();

// -------------------------------------------------------------------- report --
ok('a name accumulates played / won / lost / drawn', r.counts, JSON.stringify(r.rec));
ok('...goals for and against', r.goalsFor);
ok('...the match stats it earned', r.perMatchStatsKept);
ok('...a streak that resets on a draw', r.streakReset);
ok('...and its own rating', r.hasRating);
ok('case and stray spaces are ONE person', r.oneEntry && r.foldedCounts,
   'at a cabinet "kai", "Kai" and "KAI " are the same player');
ok('...but the name is stored as first typed', r.storedAsTyped, 'the book should show it the way they wrote it');
ok('a made-up name is never recorded', r.anonymousIgnored,
   '"You" is what the game calls somebody who has not said who they are, and filing every anonymous match under one entry makes the book a lie the moment two people share a device');
ok('the rating is the SAME Elo step the device record uses', r.sharedStep,
   'two copies of "how much is a win worth" drift apart');
ok('the book is capped', r.capped);
ok('...and drops the LEAST RECENTLY PLAYED', r.oldestWent,
   'a book that forgets the people who lose is not a record of who played');
ok('...ranked best first', r.sortedByRating);

ok('a real match writes one record per HUMAN', live.bothRecorded && live.noBots,
   JSON.stringify(live.names) + ' — bots must never appear in it');
ok('...each judged by their OWN side', live.sidesRespected,
   JSON.stringify({ ada: live.ada, grace: live.grace }) + ' — a 3-1 is a win for one and a loss for the other');
ok('...and the device record still counts it', live.deviceStillCounts,
   'the two are different questions: one is this device\'s lifetime, the other is who played on it');

ok('the book is shown in the Record card', ui.present && ui.listsBoth && ui.showsRecord, ui.text.slice(0, 120));
ok('...built as nodes, so a typed name cannot inject markup', ui.noMarkupRan);
ok('...and it travels in the game save', ui.inSaveKeys && ui.inSaveDoc);

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ r, live, ui: { ...ui, text: ui.text.slice(0, 200) } }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL namebook\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS namebook');
