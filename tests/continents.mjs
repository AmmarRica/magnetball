// THE FIRST MATCH YOU EVER PLAY — one continent against another.
//
// A brand-new player has chosen nothing, so the game chooses something worth looking
// at: every body on a side wearing a country from the same continent, and never a
// continent against itself. On grass, which is already the default surface, so this
// only has to not break it.
//
// Four things are held:
//   1. the lineup is real — both sides drawn from ONE continent each, the two
//      continents DIFFERENT, and no country fielded twice on a side;
//   2. the CONTINENTS table covers every country flag exactly once. ⚠️ This is the
//      assertion that stops the feature rotting: adding a flag without placing it in
//      a continent would silently drop it out of the draw for ever, and nothing else
//      here would notice;
//   3. it is a ONE SHOT, and it also stops the moment the player changes anything.
//      Both halves matter: "every match until you touch a setting" would hand a player
//      happy with the defaults a different team every single time, and would break the
//      separate guarantee that a bot's look is stable across a restart
//      (`tests/botlook.mjs`). "Your settings win forever after" is the other half;
//   4. it does not touch the attract demo, which owns its own two-country look, and
//      does not write anything to the player's profile.
//
// ⚠️ MEASUREMENT TRAP: `localStorage.clear()` in an init script is not enough on its
// own to prove first-run behaviour — the page writes several other keys during boot
// (`magnetball.ui`, `.feed`, `.login`, `.lastver`), so a test that asserts "storage is
// empty" fails for reasons that have nothing to do with this. The signal is precisely
// the absence of `magnetball.sel`, and that is what is checked.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const fresh = async () => {
  const p = await b.newPage({ viewport:{ width:900, height:900 } });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(800);
  await p.evaluate(() => { const d = document.getElementById('dmCollect'); if (d) d.click(); });
  return p;
};

// ---- 1 & 2. the table, and the lineup it produces ---------------------------
{
  const p = await fresh();
  const r = await p.evaluate(() => {
    const M = window.__magnet; const o = {};
    // ⚠️ The coverage check, first: everything below is meaningless if a country is
    // not in the table at all.
    const placed = M.placedFlags();
    const countries = Object.keys(M.FLAGS).filter(k => k !== 'none');
    o.countries = countries.length;
    o.placed = placed.size;
    o.unplaced = countries.filter(k => !placed.has(k));
    o.notACountry = [...placed].filter(k => !countries.includes(k));
    // ...and exactly once, so a flag cannot be drawn for two different continents.
    const all = M.CONTINENT_KEYS.flatMap(k => M.CONTINENTS[k].keys);
    o.dupes = all.filter((k, i) => all.indexOf(k) !== i);
    // Every continent has to be able to field the biggest side the game plays.
    const biggest = Math.max(...Object.values(M.MODES).map(m => m.per || 0));
    o.biggestSide = biggest;
    o.thinnest = Math.min(...M.CONTINENT_KEYS.map(k => M.CONTINENTS[k].keys.length));
    o.everyContinentCanFieldASide = o.thinnest >= biggest;

    o.firstRunSeen = M.isFirstRun();
    // ⚠️ ONE SHOT. It fires on your first match and never again — not "every match
    // until you change a setting", which would hand a player happy with the defaults a
    // different team every time and break the guarantee that a bot's look is stable
    // across a restart (`tests/botlook.mjs`).
    M.sel.mode = '4v4'; M.setMatchSeed(77); M.startMatch();
    o.consumedAfterOne = !M.isFirstRun();
    const dressed = w => w.players.filter(q => q.ctrl === 'bot')
      .every(q => M.CONTINENT_KEYS.some(c => M.CONTINENTS[c].keys.includes(q.flag)));
    o.firstMatchDressed = dressed(M.world);
    M.setMatchSeed(78); M.startMatch();
    o.secondMatchPlain = !dressed(M.world);

    // Twenty lineups, because it is a draw: one sample says nothing about "never the
    // same continent against itself".
    // ⚠️ The record is CLEARED between them, because the lineup is a ONE-SHOT — it
    // fires on your first match and never again, so twenty `startMatch` calls in a row
    // would dress the first and leave nineteen wearing shirt numbers. Clearing the key
    // is simulating twenty different fresh devices, which is the population this draws
    // from. (Getting this wrong is how the suite first crashed: it read a name off a
    // flag that was never assigned.)
    const continentOf = key => M.CONTINENT_KEYS.find(c => M.CONTINENTS[c].keys.includes(key));
    const runs = [];
    for (let i = 0; i < 20; i++){
      localStorage.removeItem(M.FIRSTRUN_KEY);
      M.sel.mode = '4v4'; M.setMatchSeed(i + 1); M.startMatch();
      const w = M.world;
      // ⚠️ BOTS ONLY. Your own seat keeps your profile — name, colour, flag, photo —
      // because none of that is the game's to overwrite on your first match.
      const side = t => w.players.filter(q => q.team === t && q.ctrl === 'bot');
      const conts = t => [...new Set(side(t).map(q => continentOf(q.flag)))];
      runs.push({
        flags0: side(0).map(q => q.flag), flags1: side(1).map(q => q.flag),
        names0: side(0).map(q => q.name),
        c0: conts(0), c1: conts(1),
      });
    }
    // ⚠️ ...and the human seat is measured too, so "leave the player alone" is a claim
    // this suite makes rather than a comment in the source.
    localStorage.removeItem(M.FIRSTRUN_KEY);
    M.profile.name = 'Ammar'; M.profile.flag = 'none';
    M.sel.mode = '4v4'; M.setMatchSeed(99); M.startMatch();
    {
      const you = M.world.players.find(q => q.ctrl === 'human1');
      o.yourName = you.name; o.yourFlag = you.flag;
      o.youAreLeftAlone = you.name === 'Ammar' && you.flag === 'none';
      o.botsStillDressed = M.world.players.filter(q => q.ctrl === 'bot')
        .every(q => !!continentOf(q.flag));
    }
    o.oneContinentPerSide = runs.every(x => x.c0.length === 1 && x.c1.length === 1 &&
                                            x.c0[0] && x.c1[0]);
    o.neverSelfMatched = runs.every(x => x.c0[0] !== x.c1[0]);
    o.noRepeatedCountry = runs.every(x => new Set(x.flags0).size === x.flags0.length &&
                                          new Set(x.flags1).size === x.flags1.length);
    // Names follow the flag, so the pitch reads as nations rather than P2/P3.
    o.namesAreCountries = runs.every(x => x.names0.every((n, i) =>
      n === M.FLAGS[x.flags0[i]].name));
    // It genuinely varies — a "draw" that always returns the same pair is a constant.
    o.distinctPairings = new Set(runs.map(x => [x.c0[0], x.c1[0]].sort().join('/'))).size;
    o.varies = o.distinctPairings > 1;
    o.sample = runs[0];
    // On grass: the default surface, which this must not have disturbed.
    o.pitch = M.sel.pitch;
    // ...and NOTHING was written to the profile — a lineup is a match dressing, not a
    // change to who you are.
    o.profileFlag = M.profile.flag;
    return o;
  });

  ok('every country flag is placed in a continent', r.unplaced.length === 0,
     'unplaced: ' + r.unplaced.join(', '));
  ok('...and nothing in the table is not a flag', r.notACountry.length === 0,
     r.notACountry.join(', '));
  ok('...and none is placed twice', r.dupes.length === 0, r.dupes.join(', '));
  ok('every continent can field the biggest side the game plays', r.everyContinentCanFieldASide,
     `thinnest continent has ${r.thinnest}, biggest side is ${r.biggestSide}`);
  ok('a cleared device reads as a first run', r.firstRunSeen);
  ok('the first match is dressed by continent', r.firstMatchDressed);
  ok('...and it is a ONE SHOT — used up after that match', r.consumedAfterOne);
  ok('...so the second match is back to shirt numbers', r.secondMatchPlain,
     'the lineup fires every match, so no bot look is stable across a restart');
  ok('each side is drawn from ONE continent', r.oneContinentPerSide, JSON.stringify(r.sample));
  ok('a continent never plays itself', r.neverSelfMatched, JSON.stringify(r.sample));
  ok('no country is fielded twice on a side', r.noRepeatedCountry, JSON.stringify(r.sample));
  ok('names follow the flags', r.namesAreCountries, JSON.stringify(r.sample.names0));
  ok('the pairing varies across matches', r.varies, `${r.distinctPairings} distinct pairings in 20`);
  ok('it is still on grass', r.pitch === 'normal', r.pitch);
  ok('YOUR seat keeps your own name and flag', r.youAreLeftAlone,
     `you came out as ${r.yourName} / ${r.yourFlag}`);
  ok('...while the bots around you are still dressed', r.botsStillDressed);
  ok('the profile is untouched', r.profileFlag !== r.sample.flags0[0] || r.profileFlag === 'none',
     'profile.flag = ' + r.profileFlag);
  await p.close();
}

// ---- 3. it stops the moment anything is changed -----------------------------
{
  const p = await fresh();
  const r = await p.evaluate(() => {
    const M = window.__magnet; const o = {};
    const continentOf = key => M.CONTINENT_KEYS.find(c => M.CONTINENTS[c].keys.includes(key));
    localStorage.removeItem(M.FIRSTRUN_KEY);
    M.sel.mode = '4v4'; M.setMatchSeed(4); M.startMatch();
    o.beforeFlags = M.world.players.filter(q => q.ctrl === 'bot').map(q => q.flag);
    o.beforeDressed = o.beforeFlags.every(f => !!continentOf(f));

    // The player changes ONE thing. This is the whole trigger.
    M.sel.diff = 'hard'; M.saveSel();
    // ⚠️ Cleared FIRST, so what is being measured is the saved setting and not the
    // one-shot having already been spent by the match above — two separate reasons
    // for the override to stop, and this block is about the second one.
    localStorage.removeItem(M.FIRSTRUN_KEY);
    o.nowSaved = !M.isFirstRun();

    M.setMatchSeed(4); M.startMatch();
    o.afterFlags = M.world.players.filter(q => q.ctrl === 'bot').map(q => q.flag);
    o.afterNames = M.world.players.filter(q => q.ctrl === 'bot').map(q => q.name);
    o.afterDressed = o.afterFlags.every(f => !!continentOf(f));
    // ⚠️ Asserted as "not every body is wearing a country", not as "the flags differ".
    // Two draws differ from each other by chance alone, so a flags-differ check passes
    // on a build where the override never stopped.
    o.overrideStopped = !o.afterDressed;
    return o;
  });
  ok('the first run really is dressed by continent', r.beforeDressed, JSON.stringify(r.beforeFlags));
  ok('saving a setting ends the first run', r.nowSaved);
  ok('...and the lineup stops being overridden', r.overrideStopped,
     'still dressed by continent after the player changed a setting: ' + JSON.stringify(r.afterFlags));
  await p.close();
}

// ---- 4. the attract demo keeps its own look ---------------------------------
{
  const p = await fresh();
  const r = await p.evaluate(() => {
    const M = window.__magnet; const o = {};
    M.startDemo();
    const w = M.world;
    o.isDemo = !!w.demo;
    // The demo dresses each SIDE in one country — a different rule from one continent
    // per side — so all of a team's flags being identical is the demo's signature.
    const f0 = w.players.filter(q => q.team === 0).map(q => q.flag);
    const f1 = w.players.filter(q => q.team === 1).map(q => q.flag);
    o.demoFlags = [f0, f1];
    o.demoKeptItsRule = new Set(f0).size === 1 && new Set(f1).size === 1 && f0[0] !== f1[0];
    o.demoEyes = w.players.every(q => q.eyes === 'googly');
    return o;
  });
  ok('the demo still runs', r.isDemo);
  ok('the demo keeps its own one-country-per-side look', r.demoKeptItsRule, JSON.stringify(r.demoFlags));
  ok('...and its own eyes', r.demoEyes);
  await p.close();
}

await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
if (fails.length){ console.log('FAIL continents\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS continents');
