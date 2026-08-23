// Making the menu navigable: sub-tabs, grouped nav tiles, and a jump bar.
//
// The measured problem was that two cards held 78% of all 376 controls — Your
// Player ran 7.5 screens, Match 3.5 — as flat lists with no way in but scrolling.
//
// The load-bearing risk in fixing that is HIDING something: a control behind a
// pane with no tab is gone, however present it is in the DOM. `audit` gained an
// orphan-pane check for that; this suite proves every pane is reachable and that
// the cards genuinely got shorter rather than just looking tidier.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:520,height:950} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const card = s => document.querySelector(`#setup .card.collapsible[data-sec="${s}"]`);
  // ⚠️ **A SECTION IS NOT A CARD ANY MORE.** Controls, Display, Sound, Game Feel and About
  // are panes of the Options card, and Theme is a section inside Display — each carries its
  // own `data-sec`, so this is what "where does `feel` live" now means. `:not(.jumpchip)`
  // because the jump bar's chips carry `data-sec` too and come first in the document.
  const sec = s => document.querySelector(`#setup [data-sec="${s}"]:not(.jumpchip)`);
  const vis = el => { const b=el.getBoundingClientRect(); return b.width>0 && b.height>0; };

  // ---- 2) sub-tabs: one pane at a time, and every pane reachable -----------
  o.groups = Object.keys(M.SUBTABS).sort().join(',');
  // ⚠️ **PANES ARE FOUND BY `data-group`, NOT BY "everything inside the card".** That was
  // fine while one card held one tab row; Options holds five panes AND the Theme row inside
  // one of them, so a card-scoped walk hands Theme's panes to Options' chips and reports a
  // mismatch that is entirely the test's own doing. A pane declares which row owns it.
  const panesOf = g => [...document.querySelectorAll(`#setup .subpane[data-group="${g}"]`)];
  const chipsOf = g => [...document.querySelectorAll(`.subtabs[data-tabs="${g}"] .subchip`)];
  o.chipCounts = {}; o.paneCounts = {}; o.everyPaneHasAChip = true;
  o.oneOpenAtATime = true; o.everyPaneShowable = true;
  for (const g of Object.keys(M.SUBTABS)){
    M.openSection(g === 'options' ? 'controls' : g);
    const panes = panesOf(g), chips = chipsOf(g);
    o.chipCounts[g] = chips.length; o.paneCounts[g] = panes.length;
    // Chips and panes must match one-for-one — an extra chip shows nothing, an
    // extra pane can never be shown.
    const paneKeys = panes.map(x=>x.dataset.pane).sort().join(',');
    const chipKeys = chips.map(x=>x.dataset.pane).sort().join(',');
    if (paneKeys !== chipKeys) o.everyPaneHasAChip = false;
    for (const c of chips){
      c.click();
      const on = panes.filter(x=>x.classList.contains('on'));
      if (on.length !== 1 || on[0].dataset.pane !== c.dataset.pane) o.oneOpenAtATime = false;
      // ⚠️ Guarded, because a chip whose pane does not exist opens NOTHING — and an
      // unguarded `vis(on[0])` then throws `undefined.getBoundingClientRect`, which kills
      // the suite before any of its diagnostics print. A dead chip is a finding this file
      // is meant to NAME, not a crash: verified by declaring a pane with nothing behind it.
      if (!on.length || !vis(on[0])) o.everyPaneShowable = false;
    }
  }
  // ...and the cards actually got shorter. Measured, not asserted by eye.
  // ⚠️ Measured on the card's BODY where it has one. `#matchCard` is `display: contents`
  // so the hero KICK OFF button can stick to the scroll column — an element with no box has
  // a scrollHeight of ZERO, so `matchH` has been 0 all along and `cardsAreShort` was really
  // only ever testing the Your Player card. A zero passes a "is it under 1400px" check for
  // free, which is the sort of pass this file exists to catch.
  // ⚠️ Measured on the SECTION, which for Game Feel and the rest is a pane rather than a
  // card — and the card it lives in has to be un-collapsed first or every height is zero.
  const height = s => { const n=sec(s); if (!n) return 0;
    const c = n.closest('.card.collapsible'); if (c) c.classList.remove('collapsed');
    const box = n.querySelector('#matchBody') || n;
    return box.scrollHeight; };
  M.showSubTab('player','colour'); M.showSubTab('match','game');
  o.playerH = height('player'); o.matchH = height('match');
  o.playerScreens = +(o.playerH/950).toFixed(1);
  o.matchScreens  = +(o.matchH/950).toFixed(1);
  o.cardsAreShort = o.playerH > 100 && o.matchH > 100 && o.playerH < 1400 && o.matchH < 1400;
  // The tallest single pane is still far under the old flat card.
  let worst = 0;
  // ⚠️ `height(g)`, not `height(g==='player'?'player':'match')`. That is the exact bug the
  // comment at the top of this block warns about, still sitting here: every group other than
  // `player` was measured on the MATCH card, so the theme and feel panes were never measured
  // at all and the match card returned zero into the bargain.
  // ⚠️ **THE `options` GROUP IS EXCLUDED, and that is the original scope rather than a
  // let-off.** Its five panes ARE the old Controls / Display / Sound / Game Feel / About
  // cards, so measuring them is measuring the very thing 4000px was the comparison
  // against — and About holds the whole changelog, which is long because a changelog is
  // long and always was. What this number defends is that splitting a card into panes
  // made the card short; each of those five is checked by its own tab row below.
  for (const g of Object.keys(M.SUBTABS)){
    if (g === 'options') continue;
    for (const [k] of M.SUBTABS[g]){ M.showSubTab(g,k); worst = Math.max(worst, height(g)); }
  }
  o.worstPane = worst;
  o.worstPaneBeatsFlat = worst < 4000;                      // Your Player was 6777px
  M.showSubTab('player','colour'); M.showSubTab('match','game');
  document.querySelectorAll('#setup .card.collapsible').forEach(c=>c.classList.add('collapsed'));

  // ---- 2b) GAME FEEL, split the same way -----------------------------------
  // Nineteen controls in one list, which is how the Tilt parallax toggle came to sit
  // sixteenth in it and get reported as a missing feature. ⚠️ Two things have to hold at
  // once: every control still exists and is reachable, and the two that act on the WHOLE
  // card stay out of the panes — a preset filed under one fifth of what it sets is worse
  // than one above the chips.
  {
    const c = sec('feel'); c.closest('.card.collapsible').classList.remove('collapsed');
    M.showSubTab('options','feel');
    const IDS = ['trapPick','chargePick','feelSlidersBall','feelSlidersKick','oneHandPick',
                 'feelSlidersPlayer','sprintPick','feelSlidersSprint','juicePick',
                 'tiltPick','popupPick','ball3dPick','hitStop','goalZoom','goalZoomSpd',
                 'autoReplayPick','sideViewPick','mspeed','debugPick'];
    o.feelMissing = IDS.filter(id => !document.getElementById(id));
    o.feelOutsideAPane = IDS.filter(id => !document.getElementById(id).closest('.subpane'));
    // ⚠️ Outside the GAME FEEL panes specifically. Both now sit inside the Options card's
    // own `feel` pane, one level up — a different tab row, and not what this is about.
    o.feelWholeCard = ['feelPresets','feelReset']
      .filter(id => { const e = document.getElementById(id); return e && !e.closest('.subpane[data-group="feel"]'); });
    // Each control in exactly ONE pane, so nothing is duplicated into two tabs.
    o.feelPaneOf = {};
    for (const id of IDS){
      const pn = document.getElementById(id).closest('.subpane');
      o.feelPaneOf[id] = pn ? pn.dataset.pane : null;
    }
    o.feelPanesUsed = [...new Set(Object.values(o.feelPaneOf))].sort().join(',');
    // ⚠️ **COMPARED AGAINST `SUBTABS.feel`, never a string typed in here.** It was the
    // literal 'advanced,ball,camera,effects,player', so the day Game Feel grew Kick and
    // Sprint panes this went red for the RIGHT reason and would have gone quietly stale
    // for the wrong one — a pane deleted from the card and left in the chip row is exactly
    // the dead tab this is meant to catch, and a hard-coded expectation cannot see it.
    o.feelPanesDeclared = M.SUBTABS.feel.map(t => t[0]).sort().join(',');
    // ⚠️ THE LAST CHIP HAS TO BE REACHABLE. Five chips do not fit a 430px phone, so the row
    // scrolls sideways — and a chip you cannot reach hides a whole pane. Scrolled into view
    // and HIT-TESTED at its own centre, never just `.click()`ed: that dispatches at the node
    // and does no hit testing at all, which is how nineteen assertions once passed over an
    // untappable button (see tests/touchstart.mjs).
    const row = document.querySelector('.subtabs[data-tabs="feel"]');
    const chips = [...row.querySelectorAll('.subchip')];
    const last = chips[chips.length-1];
    o.feelRowScrolls = row.scrollWidth > row.clientWidth + 2;
    last.scrollIntoView({ block:'nearest', inline:'center' });
    const b2 = last.getBoundingClientRect();
    const hit = document.elementFromPoint(b2.left + b2.width/2, b2.top + b2.height/2);
    o.feelLastChipHit = !!(hit && (hit === last || last.contains(hit)));
    o.feelLastChipPane = last.dataset.pane;
    hit && hit.click();
    o.feelLastPaneOpened = !!c.querySelector(`.subpane[data-pane="${last.dataset.pane}"].on`);
    // ...and the whole-card controls stay put whichever tab is showing.
    o.feelWholeCardVisible = chips.every(ch => { ch.click();
      return vis(document.getElementById('feelPresets')) && vis(document.getElementById('feelReset')); });
    c.classList.add('collapsed');
  }

  // ---- 4) nav tiles grouped -----------------------------------------------
  const groups = [...document.querySelectorAll('#setup .navgroup')];
  o.navGroupCount = groups.length;
  o.navLabels = groups.map(g => (g.querySelector('.navlab')||{}).textContent);
  o.everyGroupLabelled = groups.every(g => (g.querySelector('.navlab')||{}).textContent);
  const tiles = [...document.querySelectorAll('#setup .navtile')];
  o.tileCount = tiles.length;
  // No tile lost or duplicated in the regrouping, and every one still has a handler.
  o.tileIds = tiles.map(t=>t.id).sort().join(',');
  // ⚠️ There is NO `settingsBtn`, and its absence is the assertion. The settings ARE the
  // menu — eleven cards of them, on the screen the tile was sitting on — so a tile whose
  // whole job was `openSection('theme')` was a door onto the room you were already
  // standing in. The detached panel is still reachable from Display, where a
  // window-management choice belongs.
  o.expectedIds = ['cupBtn','dailyBtn','drillsBtn','howBtn','lbBtn','rogueBtn','seasonBtn',
                   'shopBtn','socialBtn','statsBtn','tutBtn'].join(',');
  o.allTilesKept = o.tileIds === o.expectedIds;
  o.everyTileWired = tiles.every(t => typeof t.onclick === 'function');
  o.everyTileInAGroup = tiles.every(t => !!t.closest('.navgroup'));
  // ...and the whole block is ONE section now. It used to sit loose on the menu
  // taking a full screen between KICK OFF and the settings cards.
  // ⚠️ **THE TILES LIVE IN A MATCH TAB NOW, not a card of their own.** Season, Tournament,
  // Gauntlet, Drills and the Tutorial are a match you are about to play, so they belong
  // behind KICK OFF; the Modes & more card is gone. The claim is unchanged in substance —
  // every tile is inside one section, none is loose on the menu — only its address moved.
  o.tilesLiveInMore = tiles.every(t => (t.closest('.card.collapsible')||{}).dataset?.sec === 'match');
  o.noLooseTiles = tiles.every(t => !!t.closest('.card.collapsible'));
  o.tilesInModesPane = tiles.every(t => (t.closest('.subpane')||{}).dataset?.pane === 'modes');
  // ...and it is reachable in one press, which is what the More jump chip used to buy.
  o.moreHasAJumpChip = [...document.querySelectorAll('#setup .subtabs[data-tabs="match"] .subchip')]
    .some(c => c.dataset.pane === 'modes');

  // ---- 5) jump bar ---------------------------------------------------------
  const bar = document.getElementById('jumpBar');
  const chips = [...bar.querySelectorAll('.jumpchip')];
  o.jumpChips = chips.length;
  o.jumpVisible = vis(bar) && bar.getBoundingClientRect().height > 12;
  o.jumpIsSticky = getComputedStyle(bar).position === 'sticky';
  // ⚠️ **ONE CHIP PER SECTION — and a section is any `[data-sec]`, at any depth.** Two
  // deliberate exclusions, and both are rules rather than exceptions: the VJ card, whose
  // decks live at /vj and which is `display:none` here; and a section that is ONLY a
  // container (Options holds five sections and no setting of its own, so its chip would
  // land exactly where the Controls chip lands).
  const secs = [...document.querySelectorAll('#setup [data-sec]:not(.jumpchip)')]
    .filter(n => n.dataset.sec !== 'vj')
    .filter(n => !(n.querySelector('#setup [data-sec]:not(.jumpchip), [data-sec]:not(.jumpchip)') &&
                   ![...n.querySelectorAll('label.field')].some(l => l.closest('[data-sec]:not(.jumpchip)') === n)))
    .map(c=>c.dataset.sec).sort().join(',');
  o.jumpSecs = chips.map(c=>c.dataset.sec).sort().join(',');
  o.jumpCoversEverySection = o.jumpSecs === secs;
  o.chipsHaveLabels = chips.every(c => (c.textContent||'').trim().length > 1);
  // Pressing one opens that section, alone, and marks itself.
  const target = chips.find(c=>c.dataset.sec === 'sound');
  target.click(); await wait(120);
  const open = [...document.querySelectorAll('#setup .card.collapsible')]
    .filter(c=>!c.classList.contains('collapsed')).map(c=>c.dataset.sec);
  // ⚠️ Sound is a pane of Options, so the CARD that opens is Options — and "opened that
  // section" has to mean the sound controls are ON SCREEN, or this passes on a build that
  // opens the card and leaves you on Controls.
  o.jumpOpensSection = JSON.stringify(open) === '["options"]' &&
    sec('sound').getBoundingClientRect().height > 0;
  o.jumpMarksItself = target.classList.contains('sel') &&
                      chips.filter(c=>c.classList.contains('sel')).length === 1;
  // ⚠️ EVERYTHING in the Theme card is behind a chip, the bundle grid included — seven tile
  // grids stacked is most of a phone screen each, and the bundle row is the tallest at 19
  // tiles. The chips are Bundle plus SLOT_KEYS, and the panes are generated from the same
  // list, checked here so the two cannot drift.
  o.slotKeys = M.SLOT_KEYS.slice();
  o.themeChips = chipsOf('theme').map(x=>x.dataset.pane);
  o.themeTabsFromSlots = JSON.stringify(o.themeChips) === JSON.stringify(['bundle'].concat(o.slotKeys));
  o.bundleIsATab = o.themeChips[0] === 'bundle' &&
    !!sec('theme').querySelector('.subpane[data-pane="bundle"] #themePick');
  // ⚠️ The chip row STAYS PUT while a grid scrolls. A row that scrolls away with the tiles is
  // only half a fix — you still have to scroll back up to change tab, which is the vertical
  // scrolling it exists to remove.
  // ⚠️ It used to require ONE row here, and that was measured on a DESKTOP page while being
  // a PHONE rule. A mouse has no sideways gesture, so on a fine pointer a single scrolling
  // row hides four of the seven theme chips behind an edge nothing can drag — it wraps there
  // now. What this page can still say is the part that holds either way: the row must never
  // OVERFLOW, because an overflowing row on a desktop is chips nobody can reach.
  // `tests/chipreach.mjs` owns both ends of it, including the phone's single row.
  const tabs = document.querySelector('.subtabs[data-tabs="theme"]');
  // ⚠️ DELIBERATELY NOT STICKY. This used to require the opposite. The card already
  // has a pinned KICK OFF bar and a pinned section header above it, so a third floating
  // band parked itself over the card's own text — the hint under the pane came out with
  // a row of chips through the middle of it. Reversed on request; what it is pinned
  // against now is nothing.
  o.tabsNotSticky = getComputedStyle(tabs).position !== 'sticky';
  o.tabsNoOverflow = tabs.scrollWidth <= tabs.clientWidth + 1;
  o.tabsWrap = getComputedStyle(tabs).flexWrap;
  M.openSection('theme'); M.showSubTab('theme','bundle');
  const su2 = document.getElementById('setup');
  // ⚠️ The header the chips must NOT park over is the header that actually pins, and Theme
  // has no card of its own any more — it is a section inside the Display pane of Options.
  const hdr2 = sec('theme').closest('.card.collapsible').querySelector('h2');
  su2.scrollTop = 0; su2.scrollTop = su2.scrollHeight;
  // ⚠️ ...and it SCROLLS AWAY, which is the whole of "not sticky". Measured by scrolling
  // the grid far enough that a pinned row would still be on screen: the chips have to
  // have left with the content above them, not parked over it.
  const tb = tabs.getBoundingClientRect(), hb2 = hdr2.getBoundingClientRect();
  o.tabsScrollAway = tb.bottom <= hb2.bottom + 1;
  o.tabsRect = [Math.round(tb.top), Math.round(tb.bottom)];
  o.headRect = [Math.round(hb2.top), Math.round(hb2.bottom)];
  su2.scrollTop = 0;
  M.collapseAllSections();
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
// ⚠️ Five groups now. Replays joined them because a goal and a whole match are different
// things you go looking for at different moments, and forty rows of both interleaved by time
// means scrolling past matches to find goals. Asserted as an exact set on purpose: a group
// arriving without its panes, or a pane without its chip, is how controls end up hidden while
// `audit` and the menu search still find them.
// ⚠️ `sound` is in this set now: 46 controls in one list was 1.85 screenfuls on a phone,
// and comparing two net sounds meant scrolling past 38 other tiles. Its chips are BUILT
// from `SFX_CATS`, so a seventh category cannot arrive with a pane and no chip.
ok(r.groups === 'feel,match,options,player,replay,sound,theme', `expected sub-tabs on feel, match, options, player, replay, sound and theme, got ${r.groups}`);
// ⚠️ The Theme group is DERIVED from SLOT_KEYS, never a hand-written copy: chips and panes have
// to come from one list, or a new slot arrives with a pane and no chip and its controls are
// hidden while the audit and the menu search still find them.
ok(r.themeTabsFromSlots, `the Theme chips are not Bundle + the slot list: ${JSON.stringify(r.themeChips)} vs ${JSON.stringify(['bundle'].concat(r.slotKeys))}`);
ok(r.bundleIsATab, 'the bundle grid is not behind a chip — it is the tallest grid in the card at 19 tiles, so leaving it stacked means scrolling past it to reach anything else');
ok(r.tabsNotSticky, 'the sub-tab row is sticky again — the card already pins KICK OFF and its own header, and a third floating band lands on top of the card\'s text');
ok(r.tabsNoOverflow, `the sub-tab row overflows sideways on a desktop (wrap: ${r.tabsWrap}) — a mouse has no sideways gesture, so chips past the edge of a scrollbar-less row cannot be reached at all`);
ok(r.tabsScrollAway, `the chip row is still parked over the card while the grid scrolls: chips ${JSON.stringify(r.tabsRect)}, header ${JSON.stringify(r.headRect)} — without this "not sticky" is satisfied by a row that never moves because nothing scrolled`);
ok(r.everyPaneHasAChip, `panes and chips do not match one-for-one: ${JSON.stringify(r.paneCounts)} vs ${JSON.stringify(r.chipCounts)}`);
ok(r.oneOpenAtATime, 'more than one pane was visible at once');
ok(r.everyPaneShowable, 'a pane stayed invisible even when its own chip was pressed');
ok(r.cardsAreShort, `the cards are still enormous: player ${r.playerH}px, match ${r.matchH}px`);
ok(r.worstPaneBeatsFlat, `the tallest pane (${r.worstPane}px) is no better than the old flat card`);
ok(r.navGroupCount === 3, `expected three nav groups, got ${r.navGroupCount}`);
ok(r.feelMissing.length === 0, `Game Feel lost controls in the split: ${JSON.stringify(r.feelMissing)}`);
ok(r.feelOutsideAPane.length === 0,
   `a Game Feel control is outside every pane: ${JSON.stringify(r.feelOutsideAPane)} — it would show on every tab, which is what the tabs exist to stop`);
ok(r.feelWholeCard.length === 2,
   `the preset row and the reset button must stay OUT of the panes (found ${JSON.stringify(r.feelWholeCard)}) — both act on the whole card, so filing either under one fifth of what it sets is worse than leaving it above the chips`);
ok(r.feelPanesUsed === r.feelPanesDeclared,
   `the Game Feel controls sit in ${r.feelPanesUsed} but the chips declare ${r.feelPanesDeclared} — every pane has to earn its chip, and a chip with nothing behind it is a dead tab`);
ok(r.feelRowScrolls === true || r.feelLastChipHit,
   'the chip row neither fits nor scrolls, so the last tab is unreachable');
ok(r.feelLastChipHit, `the last Game Feel chip (${r.feelLastChipPane}) is not hit-testable at its own centre once scrolled to — five chips do not fit a phone, and a chip you cannot press hides a whole pane`);
ok(r.feelLastPaneOpened, `pressing the last chip did not open the ${r.feelLastChipPane} pane`);
ok(r.feelWholeCardVisible, 'the preset row or the reset button vanished on some tab');
ok(r.everyGroupLabelled, `a nav group has no label: ${JSON.stringify(r.navLabels)}`);
ok(r.tileCount === 11, `expected 11 nav tiles, got ${r.tileCount}`);
ok(r.allTilesKept, `a nav tile was lost or duplicated in the regrouping:\n  got ${r.tileIds}\n  want ${r.expectedIds}`);
ok(r.everyTileWired, 'a nav tile lost its click handler');
ok(r.everyTileInAGroup, 'a nav tile is outside every group');
ok(r.tilesLiveInMore, 'a nav tile is not inside the Match section');
ok(r.tilesInModesPane, 'a nav tile is not inside the Modes tab');
ok(r.noLooseTiles, 'a nav tile is loose on the menu instead of inside a section');
ok(r.moreHasAJumpChip, 'there is no Modes chip on the Match card, so Season / Drills / Tutorial are only reachable by scrolling');
ok(r.jumpVisible, `the jump bar is not visible (height collapsed?): ${JSON.stringify(r.jumpVisible)}`);
ok(r.jumpIsSticky, 'the jump bar is not sticky, so it scrolls away');
ok(r.jumpCoversEverySection, `the jump bar does not match the sections:\n  bar  ${r.jumpSecs}\n  card ${r.jumpChips}`);
ok(r.chipsHaveLabels, 'a jump chip has no label');
ok(r.jumpOpensSection, 'pressing a jump chip did not open that section alone');
ok(r.jumpMarksItself, 'the jump bar does not show which section is open');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nmenunav OK');
