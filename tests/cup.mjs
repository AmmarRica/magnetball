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
  // ⚠️ Deliberately a BIG mode, because the claim is that a tie ignores it: at 3v3 the
  // pitch used to come out as one human beside two robots facing three more, which is not
  // a match between two entrants.
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
  // ⚠️ THE TEAM-SIZE STEPPER IS GONE TOO, and that is not tidying: a tie is two ENTRANTS,
  // so its size is 1v1 by definition — a stepper there is a control whose only power is to
  // put back the robots the tie exists to keep off the pitch. It was also unusable in a
  // lite lobby, where with no letters above them the `+` and `−` landed on top of each
  // other and the size could be raised and never lowered. The bot-skill row STAYS: play
  // the bracket on your own and the opponent is a bot, so how good it is still matters.
  o.liteKeptBotSkill = o.diffPads > 0;
  o.liteHasNoStepper = o.steppers === 0 && w.kb && w.kb.stepper === false;
  // ⚠️ AFTER the lobby — see the trap at the top of this file.
  M.lobbyStart(w);
  o.rosterN = w.players.length;
  o.oneASide = w.players.filter(q => q.team === 0).length === 1
            && w.players.filter(q => q.team === 1).length === 1;
  o.modeDuringTie = M.sel.mode;
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

  // ⚠️ ...and the player's own size comes BACK. `startCupMatch` borrows `sel.mode`, so a
  // tie that kept it would silently resize every match afterwards.
  o.modeAfter = M.sel.mode;
  // ==========================================================================
  //  7. A BRACKET OF PEOPLE
  // ==========================================================================
  // ⚠️ **THIS IS WHAT THE TOURNAMENT IS FOR IN A ROOM.** Countries make a bracket
  // legible on a first run, but the game is local multiplayer and the entrant people
  // actually want on the tree is each other. The country path above and this one share
  // every line of bracket maths — `cupMatches`, `cupUndo`, `cupNext`, the renderer, the
  // ticker — because an entrant is an ID and only `cupEntrant` knows how to read it.
  M.cupLock(false);
  M.cup.kind = 'people'; M.cup.people = [];
  o.peopleStartEmpty = M.cupRoster().length === 0;
  for (const n of ['Kai', 'Rio', 'Nova', 'Ash', 'Zed']) M.cupAddPerson(n);
  o.peopleRoster = M.cupRoster().join(',');
  // ⚠️ Names are unique CASE-INSENSITIVELY, the rule `nameKey` already uses — "kai" and
  // "Kai" are one person at a cabinet, and a bracket holding both is unreadable.
  o.dupeRejected = M.cupAddPerson('kai') === false && M.cupAddPerson('KAI ') === false;
  o.blankRejected = M.cupAddPerson('   ') === false && M.cupAddPerson('') === false;
  // ...and typed text cannot be markup, the rule `mapClean` records.
  M.cupAddPerson('<img src=x>');
  o.strippedMarkup = M.cupRoster().every(n => !/[<>&]/.test(n));
  M.cup.people = M.cup.people.filter(n => !/img/.test(n));

  // ⚠️ **ANY NUMBER FROM TWO UPWARDS, and the leftovers get a BYE.** A party has however
  // many people it has — five is as likely as eight — so the bracket is the next power of
  // two and the empty seats walk their occupant through round one. Without this the
  // feature would only work for the party that happens to number exactly 4, 8 or 16.
  M.buildCupScreen();
  o.sizeFor5 = M.cupSize();
  { const ms = M.cupMatches();
    o.byes5 = ms.filter(m => m.bye).length;
    o.byeWinners = ms.filter(m => m.bye).map(m => m.winner).join(',');
    o.playable5 = ms.filter(m => m.ready && !m.done).length; }
  // ⚠️ ONE bye, not three. Five in an eight-bracket leaves three seats empty, but two of
  // those pair with EACH OTHER and are a slot nobody reaches — only the fifth entrant is
  // actually walking the first round. The screen used to say "3 byes", which promised two
  // people a free round they were never getting.
  o.fiveMakesEight = o.sizeFor5 === 8 && o.byes5 === 1 && o.playable5 === 2
                  && o.byeWinners === 'Zed';
  o.subSaysOneBye = /1 bye\b/.test($('cupSub') ? $('cupSub').textContent : '');
  o.sizeFor2 = (() => { const was = M.cup.people.slice();
    M.cup.people = ['A', 'B']; const n = M.cupSize(); const ms = M.cupMatches();
    const r = n === 2 && ms.length === 1 && M.cupRoundName(0) === 'Final';
    M.cup.people = was; return r; })();

  // ⚠️ **A BYE IS ROUND ZERO ONLY**, and getting this wrong is not subtle: in round 0 an
  // empty seat is an entrant who never existed, but in every later round it is a match
  // that HAS NOT BEEN PLAYED YET. Applied everywhere, winning your semi-final walked you
  // past the final and the screen announced you as champion with half the draw unplayed.
  { const was = M.cup.people.slice();
    M.cup.people = ['Kai', 'Rio', 'Nova', 'Ash'];      // a clean 4, no byes at all
    M.cup.won = [1];                                    // Rio wins the first semi
    const ms = M.cupMatches();
    const fin = ms.find(m => m.round === 1);
    o.finalIsNotABye = !fin.bye && !fin.done && fin.winner === null;
    o.noEarlyChampion = M.cupChampion() === null;
    o.stillToPlay = (M.cupNext() || {}).i;
    M.cup.people = was; M.cup.won = []; }

  // ---- the tie itself: two people, one body each, no filler ---------------
  M.cup.people = ['Kai', 'Rio', 'Nova', 'Ash'];
  M.cup.won = []; M.cup.locked = true;
  M.sel.mode = '6v6';                                   // deliberately big — a tie ignores it
  M.startCupMatch(0);
  await new Promise(res => setTimeout(res, 300));
  { const w2 = M.world;
    M.lobbyStart(w2);
    o.peopleN = w2.players.length;
    o.peopleNames = w2.players.map(q => q.name).join(' v ');
    o.peopleAreTheEntrants = o.peopleNames === 'Kai v Rio';
    o.peopleColoursDiffer = w2.players[0].color !== w2.players[1].color;
    // ⚠️ ONE BODY A SIDE means the only bot that can exist is the opponent when you are
    // playing the bracket on your own. With two controllers there is none at all.
    o.peopleBots = w2.players.filter(q => q.ctrl === 'bot').length;
    o.noFiller = o.peopleN === 2 && o.peopleBots <= 1;
    w2.state = 'play'; w2.stateT = 1; w2.score = [0, 3];
    M.endMatch(w2); M.finishMatch(w2);
    o.peopleTitle = (document.querySelector('#overlay h2') || {}).textContent || '';
    o.peopleResult = M.cup.won[0] === 1;
    // ⚠️ A people bracket feeds the NAME BOOK for free, because the bodies carry the
    // entrants' names and `recordResult` already files every human by name. Nothing here
    // had to be written for that, and it is the reason this is worth more than countries.
    o.bookHasEntrant = M.nameBookTable().some(x => x.name === 'Kai' || x.name === 'Rio'); }

  // ...and switching back to countries finds the country draw exactly as it was left.
  M.cupLock(false);
  M.cup.kind = 'country'; M.cupFill();
  o.countryDrawIntact = M.cupRoster().length > 0 && M.cupRoster().every(k => !!M.cupTeam(k));
  o.rostersAreSeparate = M.cup.people.length === 4 && M.cup.teams.length > 0;
  M.cup.kind = 'country';

  // ==========================================================================
  //  8. SWAPPING A TEAM IN, MID-TOURNAMENT
  // ==========================================================================
  // ⚠️ **THE RESULTS SURVIVE, AND THAT IS THE WHOLE POINT.** England wins a semi-final and
  // then has to leave; France takes their place and inherits the run. Unlock is the
  // opposite operation — it clears the results by design — so doing this through Unlock
  // would throw away the very thing that makes it worth having.
  // ⚠️ It is nearly free because `cup.won` stores which SIDE went through, never which
  // entrant, so re-reading the tree with a new id in the seeding is the whole feature.
  M.cup.kind = 'country'; M.cup.size = 4;
  M.cup.teams = ['usa', 'mexico', 'argentina', 'england'];
  M.cupLock(true); M.cup.won = [0, 1];                  // USA through, England through
  M.openCup(); M.buildCupScreen();
  o.finalBefore = (() => { const f = M.cupMatches().find(m => m.round === 1);
                           return f.a + ' v ' + f.b; })();
  // ⚠️ REACHABLE WHILE LOCKED. A substitution is a mid-tournament event; offering it only
  // on the unlocked draw would mean unlocking to reach it.
  o.swapOfferedLocked = $('cupSwapBtn').style.display !== 'none';
  $('cupSwapBtn').click();
  o.swapOutChips = [...$('cupSwapOut').querySelectorAll('.cupchip')].map(c => c.textContent.trim()).join(',');
  // Nothing to pick until you have said who is leaving — a list of replacements with no
  // slot to put them in is a list that does nothing.
  o.swapNeedsAnOut = /Pick who is leaving/.test($('cupSwapIn').textContent);
  [...$('cupSwapOut').querySelectorAll('.cupchip')].find(c => /England/.test(c.textContent)).click();
  o.swapChoices = [...$('cupSwapIn').querySelectorAll('.cupchip')].length;
  [...$('cupSwapIn').querySelectorAll('.cupchip')].find(c => /France/.test(c.textContent)).click();
  o.rosterAfterSwap = M.cupRoster().join(',');
  o.finalAfter = (() => { const f = M.cupMatches().find(m => m.round === 1);
                          return f.a + ' v ' + f.b; })();
  o.wonAfterSwap = JSON.stringify(M.cup.won);
  o.stayedLocked = M.cup.locked;
  o.inheritedTheRun = o.finalBefore === 'usa v england' && o.finalAfter === 'usa v france'
                   && o.wonAfterSwap === '[0,1]' && o.stayedLocked;
  // ...and nobody may be in the draw twice, the same rule a new entrant follows.
  o.swapRefusesDupe = M.cupReplace('usa', 'mexico') === false;
  o.swapRefusesUnknown = M.cupReplace('nobody-at-all', 'brazil') === false;
  M.cupLock(false);

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
ok('...but keeps the bot-skill row', r.liteKeptBotSkill, `diff=${r.diffPads}`);
ok('...and has no team-size stepper', r.liteHasNoStepper,
   `steppers=${r.steppers} — a tie is 1v1 by definition, and the only thing that control could do is field the bots the tie exists to keep off`);
ok('a tie is one body a side, whatever mode was set', r.oneASide && r.rosterN === 2,
   `${r.rosterN} on the pitch with sel.mode "${r.modeDuringTie}" — it was 3v3 going in`);
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
ok('...and your own match size', r.modeAfter === '3v3', `sel.mode came back as ${r.modeAfter}`);
ok('an ordinary match after a tie is in your own colours', r.noColourLeak, r.afterWalkOut);
ok('...and your own faceplate', r.noFlagLeak);
ok('...and gets the full lobby back', r.liteIsNotSticky,
   `letters=${r.normalLetters} shirts=${r.normalShirts}`);
ok('a people roster starts empty and takes names', r.peopleStartEmpty && r.peopleRoster === 'Kai,Rio,Nova,Ash,Zed', r.peopleRoster);
ok('...uniquely, ignoring case', r.dupeRejected, '"kai" and "Kai" are one person at a cabinet');
ok('...never blank', r.blankRejected);
ok('...and never markup', r.strippedMarkup, 'a name is typed by a person — the rule mapClean records');
ok('five people make an eight-bracket with three byes', r.fiveMakesEight,
   JSON.stringify({ size:r.sizeFor5, byes:r.byes5, playable:r.playable5, through:r.byeWinners }) +
   ' — without byes the feature only works for a party that happens to number exactly 4, 8 or 16');
ok('...and two people make a straight final', r.sizeFor2);
ok('...and the screen counts the byes it will actually hand out', r.subSaysOneBye,
   'three empty seats is not three byes — two of them pair with each other');
ok('a bye is ROUND ZERO only', r.finalIsNotABye && r.noEarlyChampion,
   'winning a semi must not walk you past the final — an empty seat in a later round is a match not yet played, not an entrant who never existed');
ok('...with the OTHER semi next, not the final', r.stillToPlay === 1,
   'next up is match ' + r.stillToPlay + ' — the bracket plays in order, so a semi cannot be skipped');
ok('a people tie fields the two entrants and nobody else', r.noFiller && r.peopleAreTheEntrants,
   `${r.peopleN} on the pitch (${r.peopleNames}), ${r.peopleBots} bot — at 6v6 it used to be one human beside five robots facing six more`);
ok('...in different colours', r.peopleColoursDiffer);
ok('...and the result goes into the bracket', r.peopleResult, r.peopleTitle);
ok('...and into the name book, for free', r.bookHasEntrant,
   'the bodies carry the entrants\' names, so recordResult files them without anything here being written for it');
ok('the two rosters are kept apart', r.rostersAreSeparate && r.countryDrawIntact,
   'switching kinds must not destroy the draw you were arranging in the other');
ok('a team can be swapped in while the bracket is LOCKED', r.swapOfferedLocked && r.swapChoices > 0,
   `${r.swapChoices} replacements offered — a substitution is a mid-tournament event, and reaching it through Unlock would clear the results it exists to keep`);
ok('...and you have to say who is leaving first', r.swapNeedsAnOut);
ok('the replacement INHERITS the run', r.inheritedTheRun,
   `final was "${r.finalBefore}", is now "${r.finalAfter}", results ${r.wonAfterSwap}, locked ${r.stayedLocked} — England won the semi and left, so France is the one in the final`);
ok('...and nobody can be in the draw twice', r.swapRefusesDupe && r.swapRefusesUnknown);
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL cup\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS cup');
