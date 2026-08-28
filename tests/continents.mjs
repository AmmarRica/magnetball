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

    // ========================================================================
    //  THE LINEUP IS NO LONGER APPLIED — a first match is NUMBERED
    // ========================================================================
    // ⚠️ This half of the suite used to assert the opposite: that a brand-new install
    // fielded one continent against another, with every bot in a country flag. That is a
    // nice first impression and it contradicts what a default is now asked to be — **a
    // green pitch and numbered players**, which is what a reset gives back. The table
    // checks above are KEPT, because `placedFlags()` is what proves every entry in
    // `FLAGS` is reachable from the pickers, and that is worth having whether or not
    // anything fields them automatically.
    o.firstRunSeen = M.isFirstRun();
    localStorage.removeItem(M.FIRSTRUN_KEY);
    M.sel.mode = '4v4'; M.setMatchSeed(77); M.startMatch();
    const continentOf = key => M.CONTINENT_KEYS.find(c => M.CONTINENTS[c].keys.includes(key));
    const bots = () => M.world.players.filter(q => q.ctrl === 'bot');
    o.firstMatchNumbered = bots().every(q => /^num\d$/.test(q.flag));
    o.firstMatchNoFlags  = bots().every(q => !continentOf(q.flag));
    // ...and it stays that way on the next one, so this is the rule rather than a
    // one-shot that happened to be spent.
    M.setMatchSeed(78); M.startMatch();
    o.secondMatchNumbered = bots().every(q => /^num\d$/.test(q.flag));
    // ⚠️ Your own seat is still yours — name, colour, flag — which was true of the
    // lineup too and has to stay true without it.
    M.profile.name = 'Ammar'; M.profile.flag = 'none';
    M.sel.mode = '4v4'; M.setMatchSeed(99); M.startMatch();
    {
      const you = M.world.players.find(q => q.ctrl === 'human1' || q.ctrl === 'gamepad');
      o.yourName = you.name; o.yourFlag = you.flag;
      o.youAreLeftAlone = you.name === 'Ammar' && you.flag === 'none';
    }
    // The default surface and the profile are untouched by any of this.
    o.pitch = M.sel.pitch;
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
  // ⚠️ These four used to assert the OPPOSITE — a first match dressed by continent. The
  // lineup is not applied any more: a default is a green pitch and numbered players.
  ok('a first match is NUMBERED, not flagged', r.firstMatchNumbered && r.firstMatchNoFlags,
     'a brand-new install used to field one continent against another, which is the opposite of "players are numbered"');
  ok('...and so is the next one', r.secondMatchNumbered,
     'this is the rule now, not a one-shot that happened to be spent');
  ok('it is still on grass', r.pitch === 'normal', r.pitch);
  ok('YOUR seat keeps your own name and flag', r.youAreLeftAlone,
     `you came out as ${r.yourName} / ${r.yourFlag}`);
  ok('the profile is untouched', r.profileFlag === 'none', 'profile.flag = ' + r.profileFlag);
  await p.close();
}

// ---- 3. nothing dresses the bots, before or after a saved setting ----------
// ⚠️ This block used to prove the first-run override STOPPED once you changed a setting.
// There is no override any more, so what it proves now is the stronger version: bots wear
// shirt numbers on a cleared device and after a saved setting alike. `isFirstRun` itself is
// kept and still checked, because the mechanic is sound and something may want it again.
{
  const p = await fresh();
  const r = await p.evaluate(() => {
    const M = window.__magnet; const o = {};
    const continentOf = key => M.CONTINENT_KEYS.find(c => M.CONTINENTS[c].keys.includes(key));
    localStorage.removeItem(M.FIRSTRUN_KEY);
    M.sel.mode = '4v4'; M.setMatchSeed(4); M.startMatch();
    o.beforeFlags = M.world.players.filter(q => q.ctrl === 'bot').map(q => q.flag);
    o.beforePlain = o.beforeFlags.every(f => !continentOf(f));

    M.sel.diff = 'hard'; M.saveSel();
    localStorage.removeItem(M.FIRSTRUN_KEY);
    o.nowSaved = !M.isFirstRun();

    M.setMatchSeed(4); M.startMatch();
    o.afterFlags = M.world.players.filter(q => q.ctrl === 'bot').map(q => q.flag);
    o.afterPlain = o.afterFlags.every(f => !continentOf(f));
    return o;
  });
  ok('a cleared device fields numbered bots', r.beforePlain, JSON.stringify(r.beforeFlags));
  ok('saving a setting ends the first run', r.nowSaved);
  ok('...and they are still numbered afterwards', r.afterPlain, JSON.stringify(r.afterFlags));
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
