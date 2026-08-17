// TOURNAMENT — a single-elimination bracket of countries.
//
// Pick a size, arrange the draw, lock it, and play down the tree. What this suite
// exists to hold is the handful of decisions that are load-bearing rather than
// cosmetic, and each of them was written down because getting it wrong is invisible
// from a screenshot:
//
// ⚠️ THE BRACKET IS DERIVED, never stored. `cup.won` — one 0 or 1 per match, which
//    SIDE went through — is the only state a match writes. Storing the tree as well
//    would be two places to keep in step and the second one goes stale the moment a
//    result is undone, which is exactly what the unlock button does.
// ⚠️ THE COUNTRY IS THE TEAM. Both sides wear their country's flag and colour, and
//    the colours come from a one-match override (`matchTeamCol`) rather than from
//    `sel.teamCol` — because `sel.teamCol` is what the PLAYER picked for themselves
//    and has to survive the cup. Which makes the leak the thing to measure: walk out
//    to the menu mid-tie and the next ordinary match must be in your own colours
//    again.
// ⚠️ THE LOBBY IS LITE. In a tournament you are playing AS a country, so a warm-up
//    offering to rename you and change your shirt is offering to undo the draw. The
//    keyboard and the colour swatches go; the team-size stepper and the bot-skill row
//    stay, because those are about the MATCH and not about how a body looks.
//
// ⚠️ MEASUREMENT TRAP, and it cost a build: the bodies dressed in `startCupMatch` are
// NOT the bodies that take the field. `lobbyStart` mints fresh bots to fill the sides
// and renumbers everyone, so a check that reads the flags straight after
// `startCupMatch` passes on a build where the country is lost the moment anybody
// presses Start. Every dressing check below reads the roster AFTER the lobby.
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
  const M = window.__magnet; const o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  M.CUP.flash = 0.05;                       // the interstitial is not what is under test
  const $ = id => document.getElementById(id);

  // ---- 1. the pool ---------------------------------------------------------
  // ⚠️ Every country in the pool has to have a FLAG that actually draws. A missing
  // key falls back to a grey square, which looks like a rendering bug and is really a
  // team nobody can identify — and it is exactly the failure a new entry introduces.
  o.poolSize = M.CUP_TEAMS.length;
  o.missingFlags = M.CUP_TEAMS.filter(t => !M.FLAGS[t.flag]).map(t => t.flag);
  o.dupeKeys = (() => { const s = new Set(), d = [];
    for (const t of M.CUP_TEAMS){ if (s.has(t.flag)) d.push(t.flag); s.add(t.flag); } return d; })();
  // Asked for by name: USA and Mexico are always in, and in the default draw.
  M.cup.size = 8; M.cupFill();
  o.defaultDraw = M.cup.teams.join(',');
  o.usaAndMexicoIn = M.cup.teams.includes('usa') && M.cup.teams.includes('mexico');
  // The pool has to cover the biggest bracket on offer, or locking 16 leaves empty seats.
  o.poolCoversBiggest = M.CUP_TEAMS.length >= Math.max.apply(null, M.CUP.sizes);

  // ---- 2. the bracket is DERIVED -------------------------------------------
  const shape = n => { M.cup.size = n; M.cupFill(); M.cup.won = [];
    const ms = M.cupMatches();
    return { n, matches: ms.length, rounds: M.cupRounds(),
             first: ms.filter(m => m.round === 0).length,
             ready: ms.filter(m => m.ready).length,
             lastName: M.cupRoundName(M.cupRounds()-1) }; };
  o.shapes = M.CUP.sizes.map(shape);
  // n teams is n-1 matches, log2(n) rounds, and only the first round is playable
  // before anybody has won anything.
  o.shapesRight = o.shapes.every(s => s.matches === s.n - 1
                                   && s.rounds === Math.round(Math.log2(s.n))
                                   && s.first === s.n/2
                                   && s.ready === s.n/2
                                   && s.lastName === 'Final');

  // Winners really do propagate: record a result and the next round fills in.
  M.cup.size = 4; M.cupFill(); M.cup.won = [];
  const seeds = M.cup.teams.slice();
  M.cup.won[0] = 1;                                  // seed 2 goes through
  M.cup.won[1] = 0;                                  // seed 3 goes through
  const fin = M.cupMatches().find(m => m.round === 1);
  o.propagated = fin.a === seeds[1] && fin.b === seeds[2];
  o.finalReady = fin.ready;
  M.cup.won[2] = 0;
  o.champion = M.cupChampion();
  o.championRight = o.champion === seeds[1];
  o.nextWhenDone = M.cupNext();                      // null: nothing left

  // ⚠️ UNLOCKING CLEARS THE RESULTS. The seeding is what the results are ABOUT, so
  // keeping them while the teams move leaves a bracket claiming a side beat somebody
  // they were never drawn against.
  M.cupLock(false);
  o.unlockCleared = M.cup.won.length === 0 && M.cup.locked === false;

  // Reordering the draw changes who meets whom, which is the whole point of the drag.
  M.cup.size = 4; M.cupFill();
  const before = M.cup.teams.slice();
  M.cupMove(0, 3);
  o.moved = M.cup.teams.join(',') !== before.join(',');
  o.moveKeptEveryone = M.cup.teams.slice().sort().join(',') === before.slice().sort().join(',');
  // ...and randomising keeps the same countries, only rearranged.
  const pre = M.cup.teams.slice().sort().join(',');
  M.cupShuffle();
  o.shuffleKeptEveryone = M.cup.teams.slice().sort().join(',') === pre;

  // ---- 3. the screen ------------------------------------------------------
  M.cup.size = 8; M.cupFill(); M.cupLock(false);
  M.openCup(); M.buildCupScreen();
  o.setupShown = $('cupSetupCard').style.display !== 'none';
  o.bracketHiddenUnlocked = $('cupBracketCard').style.display === 'none';
  o.rows = document.querySelectorAll('#cupTeamList .cuprow').length;
  $('cupPlay').click();                              // the button locks it
  o.lockedByButton = M.cup.locked;
  o.cols = document.querySelectorAll('#cupBracket .cupcol').length;
  o.boxes = document.querySelectorAll('#cupBracket .cupm').length;
  o.boxesMatchTheModel = o.boxes === M.cupMatches().length && o.cols === M.cupRounds();
  // ⚠️ THE CONNECTORS ARE VISIBLE. They are `::after` pseudo-elements that stick OUT
  // of a match box, so an `overflow:hidden` on the box clips every line in the
  // bracket — leaving a grid of boxes and no tree, which is not a bracket at all.
  o.boxOverflow = getComputedStyle(document.querySelector('#cupBracket .cupm')).overflow;
  o.connectorsCanShow = !/hidden|clip/.test(o.boxOverflow);
  // ⚠️ AND IT SCROLLS SIDEWAYS rather than wrapping: 16 teams is four columns, which
  // fits no phone, and wrapping destroys the one thing the picture is for.
  M.cup.size = 16; M.cupFill(); M.cupLock(true); M.buildCupScreen();
  // ⚠️ Measured as a REAL overflow in the dock, not just as a declared `overflow-x` —
  // `auto` is also true of a bracket that has quietly been wrapped or squashed to fit,
  // which is the failure the property is there to prevent.
  { const el = $('cupBracket');
    o.bracketW = el.clientWidth; o.bracketScrollW = el.scrollWidth;
    o.bracketH = el.clientHeight;
    o.bracketOverflowX = getComputedStyle(el).overflowX; }
  o.scrollsNotWraps = /auto|scroll/.test(o.bracketOverflowX)
                   && o.bracketScrollW > o.bracketW + 4;

  // ---- 4. a tie: countries on the pitch -----------------------------------
  M.cup.size = 4; M.cupFill(); M.cup.won = []; M.cup.locked = true;
  const draw = M.cup.teams.slice();
  M.sel.mode = '3v3'; M.sel.lobby = 'touch'; M.sel.display = 'auto'; M.applyDisplayMode();
  M.sel.teamCol = ['#4fb45f', '#8a5ae0'];            // the PLAYER's own two colours
  M.startCupMatch(0);
  await new Promise(res => setTimeout(res, 300));
  let w = M.world;
  o.matchStarted = !!w && !!w.cup;
  o.tieIsTheDraw = w.cup.a === draw[0] && w.cup.b === draw[1];
  // The lite lobby: a board with no letters and no shirts, but the match controls kept.
  o.state = w.state;
  o.lite = !!w.lobbyLite;
  o.letters = w.kb ? w.kb.keys.filter(k => k.ch).length : -1;
  o.shirts  = w.kb ? w.kb.keys.filter(k => k.colTeam !== undefined).length : -1;
  o.diffPads = w.kb ? w.kb.keys.filter(k => k.diff).length : -1;
  o.steppers = w.kb ? w.kb.keys.filter(k => k.act).length : -1;
  o.liteStripped = o.lite && o.letters === 0 && o.shirts === 0;
  o.liteKeptMatchControls = o.diffPads > 0 && o.steppers === 2;
  // ⚠️ AFTER the lobby — see the trap at the top of this file.
  M.lobbyStart(w);
  o.rosterN = w.players.length;
  o.flagsOnPitch = [...new Set(w.players.map(q => q.flag))].sort().join(',');
  o.colsOnPitch  = [...new Set(w.players.map(q => q.color))].sort().join(',');
  const cA = M.cupTeam(draw[0]).col, cB = M.cupTeam(draw[1]).col;
  o.everyoneWearsTheirCountry = w.players.every(q => q.flag === (q.team === 0 ? draw[0] : draw[1]));
  o.everyoneWearsTheCountryColour = w.players.every(q => q.color === (q.team === 0 ? cA : cB));
  o.countryColoursNotThePlayers = !/#4fb45f|#8a5ae0/.test(o.colsOnPitch);
  // The ticker is up, and it names what is COMING, not the tie you are standing in.
  o.tickerUp = !$('cupTicker').classList.contains('hidden');
  o.tickerTxt = $('cupTickerTrack').textContent;
  o.tickerSkipsThisTie = !new RegExp(M.cupTeam(draw[0]).name + ' v ' + M.cupTeam(draw[1]).name).test(o.tickerTxt);
  o.tickerNamesTheOther = new RegExp(M.cupTeam(draw[2]).name).test(o.tickerTxt);

  // ---- 5. the result writes into the bracket ------------------------------
  w.state = 'play'; w.stateT = 1; w.score = [0, 4];   // the SECOND country wins
  M.endMatch(w); M.finishMatch(w);
  o.wonAfter = JSON.stringify(M.cup.won);
  o.recordedTheWinner = M.cup.won[0] === 1;
  o.title = (document.querySelector('#overlay h2') || {}).textContent || '';
  o.titleNamesTheWinner = new RegExp(M.cupTeam(draw[1]).name, 'i').test(o.title);
  o.resumeTxt = $('ovResume').textContent;
  o.resumeOffersNext = /Next/.test(o.resumeTxt);
  o.tickerStoppedAtFullTime = $('cupTicker').classList.contains('hidden');
  // ⚠️ AND THE OVERRIDE IS DROPPED. Left set, every match afterwards is played in two
  // countries' colours — which looks like the player's own choice silently changing.
  o.overrideCleared = M.matchTeamCol === null;

  // ---- 6. ...and it cannot leak ------------------------------------------
  // Walking out to the menu mid-tie is the path with nobody to clear it, so the clear
  // lives at the top of `startMatch` rather than being the cup's to remember.
  M.startCupMatch(1);
  await new Promise(res => setTimeout(res, 300));
  o.midTieOverride = JSON.stringify(M.matchTeamCol);
  M.toMenu();
  M.sel.lobby = 'on'; M.startMatch();
  o.afterWalkOut = [...new Set(M.world.players.map(q => q.color))].sort().join(',');
  o.noColourLeak = o.afterWalkOut === ['#4fb45f', '#8a5ae0'].sort().join(',');
  o.noFlagLeak = M.world.players.every(q => q.flag !== draw[0] && q.flag !== draw[1]);
  o.overrideClearedByStartMatch = M.matchTeamCol === null;
  // ...and an ordinary match still gets a FULL lobby back.
  M.sel.lobby = 'touch'; M.startMatch();
  M.enterWarmup(M.world);
  o.normalLetters = M.world.kb.keys.filter(k => k.ch).length;
  o.normalShirts = M.world.kb.keys.filter(k => k.colTeam !== undefined).length;
  o.liteIsNotSticky = o.normalLetters > 20 && o.normalShirts > 0 && !M.world.lobbyLite;

  M.sel.lobby = 'on'; M.sel.mode = '1v1'; M.sel.teamCol = null;
  return o;
});

ok('every country in the pool has a flag that draws', !r.missingFlags.length, r.missingFlags.join(','));
ok('...and none is listed twice', !r.dupeKeys.length, r.dupeKeys.join(','));
ok('...and the pool fills the biggest bracket on offer', r.poolCoversBiggest, `${r.poolSize} teams`);
ok('USA and Mexico are in the default draw', r.usaAndMexicoIn, r.defaultDraw);
ok('the bracket derives correctly at every size', r.shapesRight, JSON.stringify(r.shapes));
ok('a winner propagates into the next round', r.propagated && r.finalReady);
ok('...and the last one standing is the champion', r.championRight, r.champion);
ok('...with nothing left to play', r.nextWhenDone === null, JSON.stringify(r.nextWhenDone));
ok('unlocking clears the results', r.unlockCleared,
   'the seeding is what the results are about — keeping them while the teams move is a bracket telling lies');
ok('dragging a team reorders the draw', r.moved && r.moveKeptEveryone);
ok('randomising keeps the same countries', r.shuffleKeptEveryone);
ok('the setup card is what you see unlocked', r.setupShown && r.bracketHiddenUnlocked && r.rows === 8);
ok('the play button locks it', r.lockedByButton);
ok('the drawn bracket matches the model', r.boxesMatchTheModel, `${r.boxes} boxes / ${r.cols} cols`);
ok('the connectors are not clipped away', r.connectorsCanShow,
   `.cupm overflow is "${r.boxOverflow}" — an ::after that sticks out of the box is the only thing making it a tree`);
ok('...and 16 teams scrolls sideways rather than wrapping', r.scrollsNotWraps, `overflow-x ${r.bracketOverflowX}, ${r.bracketScrollW}px of content in ${r.bracketW}px`);
ok('a tie starts on the drawn pair', r.matchStarted && r.tieIsTheDraw);
ok('the tournament lobby has no keyboard and no shirts', r.liteStripped,
   `lite=${r.lite} letters=${r.letters} shirts=${r.shirts}`);
ok('...but keeps the match controls', r.liteKeptMatchControls, `diff=${r.diffPads} steppers=${r.steppers}`);
ok('every body on the pitch wears its country', r.everyoneWearsTheirCountry, r.flagsOnPitch);
ok('...and its country\'s colour', r.everyoneWearsTheCountryColour, r.colsOnPitch);
ok('...not the colours the player picked for themselves', r.countryColoursNotThePlayers, r.colsOnPitch);
ok('the ticker runs once the match does', r.tickerUp);
ok('...naming the ties to come, not the one on screen', r.tickerSkipsThisTie && r.tickerNamesTheOther,
   r.tickerTxt.slice(0, 120));
ok('the result writes which side went through', r.recordedTheWinner, r.wonAfter);
ok('...and the screen names them', r.titleNamesTheWinner, `it said "${r.title}"`);
ok('...and offers the next tie', r.resumeOffersNext, r.resumeTxt);
ok('the ticker stops at full time', r.tickerStoppedAtFullTime);
ok('the colour override is dropped at full time', r.overrideCleared);
ok('...and by startMatch, so walking out mid-tie cannot leak it', r.overrideClearedByStartMatch,
   `mid-tie it was ${r.midTieOverride}`);
ok('an ordinary match after a tie is in your own colours', r.noColourLeak, r.afterWalkOut);
ok('...and your own faceplate', r.noFlagLeak);
ok('...and gets the full lobby back', r.liteIsNotSticky,
   `letters=${r.normalLetters} shirts=${r.normalShirts}`);
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL cup\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS cup');
