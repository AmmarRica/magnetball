// SHOW MODE — the menu cut down to what a guest needs.
//
// Handing somebody the game means handing them 376 controls across eleven cards, when
// all they want is to start a match. Show mode hides everything that is a SETTING and
// leaves what is a CHOICE: KICK OFF, Warm-up, what you play and what you play it on,
// plus How to play.
//
// ⚠️ THE TRAP THIS SUITE EXISTS FOR: hiding a card with `display:none` hides it from the
// EYE and from nothing else. `querySelectorAll` still finds every control inside it, so
// the menu search would happily list a hidden setting and jump a guest straight into the
// pane you just hid — the same hole `audit` watches for with orphan panes. So the search
// INDEX is measured here, not just the pixels.
//
// ⚠️ And it is pinned from BOTH ends. A rule that only ever hides things passes every
// "is it gone" check while having deleted the menu, so the off state and the round trip
// are checked just as hard as the on state. Show mode is reversible or it is a bug.
//
// ⚠️ It is a TIDINESS control, not a security one — the toggle is in plain sight on the
// pause screen. That is the design, and the suite asserts it is reachable there rather
// than pretending it is hidden.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const page = async (w, h, mobile) => {
  const p = await b.newPage({ viewport:{ width:w, height:h }, isMobile:!!mobile, hasTouch:!!mobile });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  await p.evaluate(() => { const d = document.getElementById('dmCollect'); if (d) d.click(); });
  return p;
};

// One reader used for every state, so on/off are measured identically.
const SNAP = () => {
  const M = window.__magnet;
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none';
  const byId  = (id) => shown(document.getElementById(id));
  return {
    on: M.showModeOn(),
    bodyClass: document.body.classList.contains('showmode'),
    cards: [...document.querySelectorAll('#setup .card.collapsible')].filter(shown).map(c => c.dataset.sec),
    matchChips: [...document.querySelectorAll('.subtabs[data-tabs="match"] .subchip')].map(c => c.dataset.pane),
    // ⚠️ The nav tiles live in the Match card's Modes TAB now, not a card of their own.
    tiles: [...document.querySelectorAll('.subpane[data-pane="modes"] .navtile')].filter(shown).map(t => t.id),
    jumpChips: [...document.querySelectorAll('#jumpBar .jumpchip')].map(c => c.dataset.sec),
    // ⚠️ The index, not the pixels. This is the check that actually matters.
    searchRows: M.menuSearchIndex().length,
    searchSecs: [...new Set(M.menuSearchIndex().map(r => r.sec))].sort(),
    searchPanes: [...new Set(M.menuSearchIndex().filter(r => r.sec === 'match').map(r => r.pane))].sort(),
    kickoff: byId('playBtn'),
    chevron: byId('matchChev'),
    warmup: byId('warmupBtn'),
    warmupUseful: M.warmupUseful(),
    search: byId('searchWrap'),
    // ⚠️ **MEASURED ON THE CARD, NOT THE BUTTON.** Reset and the update check live inside
    // the Options card now, and a collapsed card is `display:none` for its children — so a
    // direct test on the button says "hidden" for the ordinary closed accordion and this
    // check would pass with show mode switched OFF. What show mode does is remove the whole
    // card, which is the thing to ask about.
    reset: shown((document.getElementById('settingsReset')||{}).closest &&
                 document.getElementById('settingsReset').closest('.card')),
    updCheck: shown((document.getElementById('updCheckBtn')||{}).closest &&
                    document.getElementById('updCheckBtn').closest('.card')),
    jumpBar: byId('jumpBar'),
  };
};

// ---------------------------------------------------------------- desktop
// Where warm-up has a job, so the full "kickoff / warm-up / pitch" trio is testable.
{
  const p = await page(1100, 1000, false);
  const off = await p.evaluate(SNAP);
  await p.evaluate(() => { window.__magnet.sel.showMode = true; window.__magnet.applyShowMode(); });
  const on = await p.evaluate(SNAP);
  await p.evaluate(() => { window.__magnet.sel.showMode = false; window.__magnet.applyShowMode(); });
  const back = await p.evaluate(SNAP);

  // ---- the OFF state is the full menu, unchanged ------------------------
  // Eleven cards folded into four: Match, Your Player, Options, Replays.
  ok('off: every card is there', off.cards.length >= 4, off.cards.length + ' cards');
  ok('off: all six Match tabs', off.matchChips.length === 6, off.matchChips.join());
  ok('off: every nav tile', off.tiles.length >= 10, off.tiles.length + ' tiles');
  ok('off: nothing is hidden', off.search && off.reset && off.jumpBar && !off.bodyClass);

  // ---- the ON state keeps exactly the three things asked for -------------
  ok('on: KICK OFF stays', on.kickoff);
  ok('on: Warm-up stays', on.warmup, 'warmupUseful=' + on.warmupUseful);
  ok('on: the Match options are still reachable', on.chevron);
  ok('on: Pitch is one of the tabs', on.matchChips.includes('pitch'), on.matchChips.join());
  ok('on: Game is the other', on.matchChips.includes('game'), on.matchChips.join());
  ok('on: Players, Rules and Bots are gone', !on.matchChips.includes('players') &&
     !on.matchChips.includes('rules') && !on.matchChips.includes('bots'), on.matchChips.join());
  // ⚠️ **MODES SURVIVES, and it is the one tab here that is not a setting**: How to play is
  // what a stranger holding your phone needs, and it lives in that tab now that the Modes &
  // more card is gone. The CSS empties the tab of everything else.
  ok('on: Modes survives, for How to play', on.matchChips.includes('modes'), on.matchChips.join());

  // ---- ...and hides the rest --------------------------------------------
  ok('on: only Match remains', on.cards.join() === 'match', on.cards.join());
  ok('on: How to play is the only tile', on.tiles.join() === 'howBtn', on.tiles.join());
  ok('on: the search box is gone', !on.search);
  ok('on: Reset all settings is gone', !on.reset,
     'the single worst button to leave in front of a stranger');
  ok('on: the update check is gone', !on.updCheck, 'it reloads the page mid-demo');
  ok('on: the jump bar is gone', !on.jumpBar);
  ok('on: body carries the class', on.bodyClass);

  // ---- ⚠️ THE INDEX, which CSS cannot touch ------------------------------
  ok('on: the search index shrinks with the menu', on.searchRows < off.searchRows / 3,
     off.searchRows + ' → ' + on.searchRows + ' rows');
  ok('on: no hidden SECTION is indexed', on.searchSecs.join() === 'match', on.searchSecs.join());
  ok('on: no hidden PANE is indexed',
     on.searchPanes.every(x => x === null || x === 'game' || x === 'pitch' || x === 'modes'),
     JSON.stringify(on.searchPanes));
  // Spot-check by name: these live in panes/cards that show mode hides.
  const leaked = await p.evaluate(() => {
    window.__magnet.sel.showMode = true; window.__magnet.applyShowMode();
    const rows = window.__magnet.menuSearchIndex().map(r => r.t.toLowerCase());
    const bad = ['party modifiers','goal box crowding','joining late','player names',
                 'kickoff rule','vj mode','game feel','controls'];
    const hit = bad.filter(w => rows.some(t => t.includes(w)));
    window.__magnet.sel.showMode = false; window.__magnet.applyShowMode();
    return hit;
  });
  ok('on: hidden settings are unsearchable by name', leaked.length === 0, 'still findable: ' + leaked.join(', '));

  // ---- reversible ---------------------------------------------------------
  // ⚠️ The half that stops a hide-everything bug passing. A predicate that always
  // returned false would satisfy every check above.
  ok('off again: cards restored', back.cards.length === off.cards.length,
     off.cards.length + ' → ' + back.cards.length);
  ok('off again: tabs restored', back.matchChips.join() === off.matchChips.join(), back.matchChips.join());
  ok('off again: tiles restored', back.tiles.join() === off.tiles.join(), back.tiles.join());
  ok('off again: jump bar restored', back.jumpChips.length === off.jumpChips.length,
     off.jumpChips.length + ' → ' + back.jumpChips.length);
  ok('off again: the whole search index is back', back.searchRows === off.searchRows,
     off.searchRows + ' → ' + back.searchRows);
  ok('off again: nothing is left hidden', back.search && back.reset && back.jumpBar && !back.bodyClass);
  await p.close();
}

// ---------------------------------------------------------------- the toggle
{
  const p = await page(420, 900, true);
  const t = await p.evaluate(() => {
    const M = window.__magnet, d = id => getComputedStyle(document.getElementById(id)).display;
    M.startMatch(); M.togglePause(true);
    const sl = document.getElementById('ovShowLock');
    const o = { onPause: d('ovShowLock') !== 'none', label0: sl.textContent.trim() };
    sl.click();
    o.label1 = sl.textContent.trim();
    o.flag = M.showModeOn();
    // ⚠️ Persisted, or a guest reloading the page unlocks it — which is the whole point.
    o.saved = (JSON.parse(localStorage.getItem('magnetball.sel') || '{}')).showMode;
    // Settings on the pause screen jumps into a card show mode has hidden.
    o.settingsGone = d('ovSettings') === 'none';
    sl.click();
    o.label2 = sl.textContent.trim(); o.backOff = !M.showModeOn();
    // ⚠️ Pause only — over a result screen it would sit between Restart and Main Menu.
    M.togglePause(false);
    const w = M.world; w.state='play'; w.stateT=1; M.endMatch(w); M.finishMatch(w);
    o.notOnResult = d('ovShowLock') === 'none';
    return o;
  });
  ok('toggle: it is on the pause screen', t.onPause);
  ok('toggle: it says which state it is IN', /OFF/.test(t.label0) && /ON/.test(t.label1) && /OFF/.test(t.label2),
     [t.label0, t.label1, t.label2].join(' / '));
  ok('toggle: pressing it switches show mode', t.flag && t.backOff);
  ok('toggle: the choice survives a reload', t.saved === true, String(t.saved));
  ok('toggle: pause Settings goes while locked', t.settingsGone);
  ok('toggle: it is NOT on the result screen', t.notOnResult);
  await p.close();
}

// ---------------------------------------------------------------- it sticks
{
  const p = await b.newPage({ viewport:{ width:1100, height:1000 } });
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await p.addInitScript(() => {
    // A save that already has show mode on, as a reload would find it.
    const k = 'magnetball.sel';
    try { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.showMode = true;
          localStorage.setItem(k, JSON.stringify(s)); } catch(_){}
  });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  const boot = await p.evaluate(SNAP);
  ok('reload: comes back locked', boot.on && boot.bodyClass);
  ok('reload: and the menu is already trimmed', boot.cards.join() === 'match' && !boot.search,
     boot.cards.join());
  await p.close();
}

// ---------------------------------------------------------------- default off
// ⚠️ `audit` proves every setting is reachable, which is only true with show mode OFF.
// If the default ever flipped, that suite would fail in a way nobody would connect to
// this one, so the default is asserted here where the reason is written down.
{
  const p = await page(1100, 1000, false);
  const def = await p.evaluate(() => ({
    sel: window.__magnet.sel.showMode,
    fresh: window.__magnet.defaultSel().showMode,
  }));
  ok('default: show mode is OFF for a new player', def.sel === false && def.fresh === false,
     JSON.stringify(def));
  await p.close();
}

await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
if (fails.length){ console.log('FAIL showmode\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS showmode');
