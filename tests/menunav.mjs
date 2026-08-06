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
  const vis = el => { const b=el.getBoundingClientRect(); return b.width>0 && b.height>0; };

  // ---- 2) sub-tabs: one pane at a time, and every pane reachable -----------
  o.groups = Object.keys(M.SUBTABS).sort().join(',');
  const panesOf = g => [...card(g==='player'?'player':'match').querySelectorAll('.subpane')];
  const chipsOf = g => [...document.querySelectorAll(`.subtabs[data-tabs="${g}"] .subchip`)];
  o.chipCounts = {}; o.paneCounts = {}; o.everyPaneHasAChip = true;
  o.oneOpenAtATime = true; o.everyPaneShowable = true;
  for (const g of Object.keys(M.SUBTABS)){
    card(g==='player'?'player':'match').classList.remove('collapsed');
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
      if (!vis(on[0])) o.everyPaneShowable = false;
    }
  }
  // ...and the cards actually got shorter. Measured, not asserted by eye.
  const height = s => { const c=card(s); c.classList.remove('collapsed');
    const h=c.scrollHeight; return h; };
  M.showSubTab('player','colour'); M.showSubTab('match','game');
  o.playerH = height('player'); o.matchH = height('match');
  o.playerScreens = +(o.playerH/950).toFixed(1);
  o.matchScreens  = +(o.matchH/950).toFixed(1);
  o.cardsAreShort = o.playerH < 1400 && o.matchH < 1400;   // both were 3000-6800px flat
  // The tallest single pane is still far under the old flat card.
  let worst = 0;
  for (const g of Object.keys(M.SUBTABS))
    for (const [k] of M.SUBTABS[g]){ M.showSubTab(g,k); worst = Math.max(worst, height(g==='player'?'player':'match')); }
  o.worstPane = worst;
  o.worstPaneBeatsFlat = worst < 4000;                      // Your Player was 6777px
  M.showSubTab('player','colour'); M.showSubTab('match','game');
  document.querySelectorAll('#setup .card.collapsible').forEach(c=>c.classList.add('collapsed'));

  // ---- 4) nav tiles grouped -----------------------------------------------
  const groups = [...document.querySelectorAll('#setup .navgroup')];
  o.navGroupCount = groups.length;
  o.navLabels = groups.map(g => (g.querySelector('.navlab')||{}).textContent);
  o.everyGroupLabelled = groups.every(g => (g.querySelector('.navlab')||{}).textContent);
  const tiles = [...document.querySelectorAll('#setup .navtile')];
  o.tileCount = tiles.length;
  // No tile lost or duplicated in the regrouping, and every one still has a handler.
  o.tileIds = tiles.map(t=>t.id).sort().join(',');
  o.expectedIds = ['dailyBtn','drillsBtn','howBtn','lbBtn','rogueBtn','seasonBtn',
                   'settingsBtn','shopBtn','socialBtn','statsBtn','tutBtn'].join(',');
  o.allTilesKept = o.tileIds === o.expectedIds;
  o.everyTileWired = tiles.every(t => typeof t.onclick === 'function');
  o.everyTileInAGroup = tiles.every(t => !!t.closest('.navgroup'));
  // ...and the whole block is ONE section now. It used to sit loose on the menu
  // taking a full screen between KICK OFF and the settings cards.
  o.tilesLiveInMore = tiles.every(t => (t.closest('.card.collapsible')||{}).dataset?.sec === 'more');
  o.noLooseTiles = tiles.every(t => !!t.closest('.card.collapsible'));
  o.moreHasAJumpChip = [...document.querySelectorAll('#jumpBar .jumpchip')]
    .some(c => c.dataset.sec === 'more');

  // ---- 5) jump bar ---------------------------------------------------------
  const bar = document.getElementById('jumpBar');
  const chips = [...bar.querySelectorAll('.jumpchip')];
  o.jumpChips = chips.length;
  o.jumpVisible = vis(bar) && bar.getBoundingClientRect().height > 12;
  o.jumpIsSticky = getComputedStyle(bar).position === 'sticky';
  // One chip per collapsible section, no more and no fewer.
  const secs = [...document.querySelectorAll('#setup .card.collapsible')].map(c=>c.dataset.sec).sort().join(',');
  o.jumpSecs = chips.map(c=>c.dataset.sec).sort().join(',');
  o.jumpCoversEverySection = o.jumpSecs === secs;
  o.chipsHaveLabels = chips.every(c => (c.textContent||'').trim().length > 1);
  // Pressing one opens that section, alone, and marks itself.
  const target = chips.find(c=>c.dataset.sec === 'sound');
  target.click(); await wait(120);
  const open = [...document.querySelectorAll('#setup .card.collapsible')]
    .filter(c=>!c.classList.contains('collapsed')).map(c=>c.dataset.sec);
  o.jumpOpensSection = JSON.stringify(open) === '["sound"]';
  o.jumpMarksItself = target.classList.contains('sel') &&
                      chips.filter(c=>c.classList.contains('sel')).length === 1;
  M.collapseAllSections();
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.groups === 'match,player', `expected sub-tabs on match and player, got ${r.groups}`);
ok(r.everyPaneHasAChip, `panes and chips do not match one-for-one: ${JSON.stringify(r.paneCounts)} vs ${JSON.stringify(r.chipCounts)}`);
ok(r.oneOpenAtATime, 'more than one pane was visible at once');
ok(r.everyPaneShowable, 'a pane stayed invisible even when its own chip was pressed');
ok(r.cardsAreShort, `the cards are still enormous: player ${r.playerH}px, match ${r.matchH}px`);
ok(r.worstPaneBeatsFlat, `the tallest pane (${r.worstPane}px) is no better than the old flat card`);
ok(r.navGroupCount === 3, `expected three nav groups, got ${r.navGroupCount}`);
ok(r.everyGroupLabelled, `a nav group has no label: ${JSON.stringify(r.navLabels)}`);
ok(r.tileCount === 11, `expected 11 nav tiles, got ${r.tileCount}`);
ok(r.allTilesKept, `a nav tile was lost or duplicated in the regrouping:\n  got ${r.tileIds}\n  want ${r.expectedIds}`);
ok(r.everyTileWired, 'a nav tile lost its click handler');
ok(r.everyTileInAGroup, 'a nav tile is outside every group');
ok(r.tilesLiveInMore, 'a nav tile is not inside the More section');
ok(r.noLooseTiles, 'a nav tile is loose on the menu instead of inside a section');
ok(r.moreHasAJumpChip, 'the More section has no jump chip, so it is only reachable by scrolling');
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
