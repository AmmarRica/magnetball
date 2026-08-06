// Finding things in a menu of 485 controls: search, and recents rows.
//
// The menu is seven cards, each showing one subpane at a time. That is what made it
// navigable (`menunav`) and also what makes a control you half-remember hard to
// find — it is behind a card you have to open and a chip you have to guess.
//
// ⚠️ THE TRAP FOR SEARCH: the index is built from the DOM on every search, not once
// at boot. The pickers rebuild themselves constantly — every theme slot change
// replaces its tiles — so a boot-time index goes stale and starts holding detached
// nodes, which scrollIntoView will happily scroll to nowhere while looking like it
// worked. The suite rebuilds a picker mid-flight and checks the hit still lands on a
// node that is in the document.
//
// ⚠️ THE TRAP FOR RECENTS: flags, animals and text all share ONE faceplate slot
// (profile.flag). Store recents per slot and picking a flag turns up in the animals
// row — true of the slot, useless to the person reading it. Stored per category.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:520,height:1100} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
// ⚠️ Clear storage on the FIRST load only. addInitScript runs on every navigation,
// so an unconditional localStorage.clear() also fires on the reload below — and the
// persistence check then reports that recents did not survive, when what actually
// happened is the test deleted them. sessionStorage survives a reload in the tab.
await p.addInitScript(()=>{
  window.__MAGNETDEBUG = true;
  try { if (!sessionStorage.getItem('mbCleared')){ localStorage.clear(); sessionStorage.setItem('mbCleared','1'); } } catch(e){}
});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);
await p.evaluate(()=>{ const d=document.getElementById('dmCollect'); if(d) d.click(); });

// ---- search, driven through the real input ---------------------------------
const type = async (q) => {
  await p.fill('#menuSearch', '');
  await p.click('#menuSearch');
  await p.fill('#menuSearch', q);
  await p.waitForTimeout(120);
  return p.evaluate(()=> [...document.querySelectorAll('#searchHits .shit')]
    .map(x => ({ label: (x.querySelector('span')||{}).textContent,
                 where: (x.querySelector('small')||{}).textContent })));
};

const r = { };
r.colossus = await type('coloss');
r.killer   = await type('killer');
r.theme    = await type('theme');
r.nothing  = await type('zzqqxx');
r.oneChar  = await type('g');

r.deep = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  o.indexed = M.menuSearchIndex().length;
  // It reaches into panes that are not currently shown — the whole point.
  const rows = M.menuSearchIndex();
  o.kinds = [...new Set(rows.map(x=>x.kind))].sort();
  o.hasHiddenPanes = rows.some(x => x.pane && x.pane !== M.subTab[x.group]);
  // ⚠️ Rebuild a picker, then search: a boot-time index would now hold detached nodes.
  M.buildFlagPicker(); M.buildSettings && M.buildSettings();
  const fresh = M.menuSearchIndex();
  const hit = M.menuSearchRank(fresh, 'brazil')[0];
  o.foundAfterRebuild = !!hit;
  o.nodeStillInDocument = !!hit && document.contains(hit.r.node);
  // Ranking: an exact prefix beats a mid-word match.
  const ranked = M.menuSearchRank(fresh, 'norm').map(h=>h.r.t);
  o.ranked = ranked.slice(0,3);
  o.prefixWins = !ranked.length || ranked[0].toLowerCase().startsWith('norm');
  o.capped = M.menuSearchRank(fresh, 'a').length <= M.SEARCH_MAX;
  return o;
});

// ---- clicking a result actually takes you there -----------------------------
await type('coloss');
await p.click('#searchHits .shit');
await p.waitForTimeout(500);
r.landed = await p.evaluate(()=>{
  const o={};
  const card = document.querySelector('#setup .card.collapsible[data-sec="match"]');
  o.sectionOpen = !!card && !card.classList.contains('collapsed');
  const pane = card && card.querySelector('.subpane[data-pane="pitch"]');
  o.paneShown = !!pane && pane.classList.contains('on');
  // The thing itself is on screen and flagged as where you were sent.
  const tile = [...document.querySelectorAll('#setup .opt')]
    .find(el => /colossus/i.test(el.textContent));
  o.tileExists = !!tile;
  o.tileVisible = !!tile && tile.getBoundingClientRect().height > 0;
  o.searchCleared = document.getElementById('menuSearch').value === '';
  o.dropdownClosed = !document.getElementById('searchHits').classList.contains('on');
  return o;
});

// ---- recents ---------------------------------------------------------------
r.recents = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const row = () => document.getElementById('flagRecent');
  const tiles = id => [...document.querySelectorAll('#'+id+' .opt span')].map(x=>x.textContent);
  o.hiddenWhenEmpty = row().style.display === 'none';
  const unlocked = M.FLAG_KEYS.filter(k => k !== 'none' && M.isUnlocked('flag', k)).slice(0, 4);
  o.enough = unlocked.length >= 3;
  unlocked.forEach(k => M.noteRecent('flag', k));
  M.buildFlagPicker();
  o.shows = row().style.display !== 'none';
  o.labels = tiles('flagRecent');
  // Most recent FIRST — a recents row in insertion order is just a second grid.
  o.mostRecentFirst = o.labels[0] === M.itemName('flag', unlocked[unlocked.length-1]);
  // Never the thing you are already wearing: that tile would be a mirror.
  o.excludesCurrent = !o.labels.includes(M.itemName('flag', M.profile.flag));
  o.capped = o.labels.length <= M.RECENT_KEEP;
  // "none" is a reset, not a choice.
  M.noteRecent('flag','none');
  o.noneNotRecorded = !(M.recents.flag||[]).includes('none');

  // ⚠️ PER CATEGORY, not per slot. Flags/animals/text share profile.flag, so a flag
  // pick must not appear in the animals row.
  M.buildAnimalPicker();
  o.animalRowClean = tiles('animalRecent').every(n => !o.labels.includes(n));

  // A short grid does not get a row at all — it would be longer than the list.
  o.eyesKeys = M.EYE_KEYS.length;
  o.shortGridNoRow = (() => {
    const short = M.TEXT_KEYS.length < M.RECENT_MIN_GRID;
    return !short || document.getElementById('textRecent').style.display === 'none';
  })();

  // A locked item never shows, however recently it was touched.
  const locked = M.FLAG_KEYS.find(k => !M.isUnlocked('flag', k));
  o.hasLocked = !!locked;
  if (locked){ M.noteRecent('flag', locked); M.buildFlagPicker(); }
  o.lockedHidden = !locked || !tiles('flagRecent').includes(M.itemName('flag', locked));

  // The REAL path: clicking a tile in the grid must record it. Everything above
  // drives noteRecent directly, which proves the store and not the wiring.
  const fresh = M.FLAG_KEYS.find(k => k !== 'none' && M.isUnlocked('flag', k) &&
                                      !(M.recents.flag||[]).includes(k));
  o.hadFreshItem = !!fresh;
  if (fresh){
    const tile = [...document.querySelectorAll('#flagPick .opt')]
      .find(el => el.querySelector('span') &&
                  el.querySelector('span').textContent === M.itemName('flag', fresh));
    o.tileFound = !!tile;
    if (tile) tile.click();
    o.clickRecorded = (M.recents.flag || [])[0] === fresh;
  }

  // It survives a reload — that is what makes it recents rather than history.
  o.persisted = !!(JSON.parse(localStorage.getItem('magnetball.recents')||'{}').flag||[]).length;
  return o;
});

// ...and really does come back after a reload.
await p.reload();
await p.waitForTimeout(900);
r.afterReload = await p.evaluate(()=>{
  const M=window.__magnet;
  const d=document.getElementById('dmCollect'); if(d) d.click();
  M.buildFlagPicker();
  return { shows: document.getElementById('flagRecent').style.display !== 'none',
           n: document.querySelectorAll('#flagRecent .opt').length };
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.colossus.length >= 1 && /colossus/i.test(r.colossus[0].label),
   `searching "coloss" did not find Colossus: ${JSON.stringify(r.colossus)}`);
ok(/match/i.test(r.colossus[0].where || ''), `a result does not say where it lives: ${JSON.stringify(r.colossus[0])}`);
ok(r.killer.some(h=>/killer queen/i.test(h.label)), `searching "killer" missed Killer Queen: ${JSON.stringify(r.killer)}`);
ok(r.theme.length >= 1, 'searching a section name found nothing');
ok(r.nothing.length === 0, `nonsense returned ${r.nothing.length} results`);
ok(r.oneChar.length > 0 && r.oneChar.length <= 9, `a single character returned ${r.oneChar.length} results — the cap is not applied`);
ok(r.deep.indexed > 200, `only ${r.deep.indexed} controls indexed — search is not reaching the menu`);
ok(r.deep.hasHiddenPanes, 'search only indexed the panes currently on screen, which is the half you can already see');
ok(r.deep.foundAfterRebuild, 'a search after a picker rebuild found nothing');
ok(r.deep.nodeStillInDocument, 'a hit points at a DETACHED node — the index is stale, and jumping to it scrolls nowhere');
ok(r.deep.prefixWins, `ranking put a mid-word match first: ${JSON.stringify(r.deep.ranked)}`);
ok(r.deep.capped, 'results are not capped');
ok(r.landed.sectionOpen, 'clicking a result did not open its section');
ok(r.landed.paneShown, 'clicking a result did not switch to its subpane, so the control is still hidden');
ok(r.landed.tileVisible, 'the control search sent you to is not visible');
ok(r.landed.searchCleared && r.landed.dropdownClosed, 'the dropdown stayed open over the thing it just took you to');
ok(r.recents.hiddenWhenEmpty, 'the recents row took up space before anything was ever picked');
ok(r.recents.enough, 'not enough unlocked flags to test recents — the fixture is wrong, not the feature');
ok(r.recents.shows, 'the recents row never appeared after four picks');
ok(r.recents.mostRecentFirst, `recents are not most-recent-first: ${JSON.stringify(r.recents.labels)}`);
ok(r.recents.excludesCurrent, `the recents row includes what you are already wearing: ${JSON.stringify(r.recents.labels)}`);
ok(r.recents.capped, `the recents row is ${r.recents.labels.length} long, past the cap`);
ok(r.recents.noneNotRecorded, '"none" was recorded as a recent pick — it is a reset, not a choice');
ok(r.recents.animalRowClean, 'a flag pick showed up in the ANIMALS recents row — recents are keyed on the shared faceplate slot instead of the category');
ok(r.recents.shortGridNoRow, 'a short picker got a recents row, which is longer than the list it shortcuts');
ok(r.recents.lockedHidden, 'a locked item appeared in recents');
ok(r.recents.hadFreshItem && r.recents.tileFound, 'could not find an unused unlocked tile to click — the fixture is wrong, not the feature');
ok(r.recents.clickRecorded, 'clicking a tile in the grid did not record a recent — the store works but nothing is wired to it');
ok(r.afterReload.shows && r.afterReload.n >= 2, `recents did not survive a reload: ${JSON.stringify(r.afterReload)}`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nmenufind OK');
