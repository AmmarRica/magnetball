// A theme is a COLLECTION of slots, and "Custom" is DERIVED.
//
// Five slots — background, field, players, ball, sound — and a bundle that sets
// all five. Two things are easy to get wrong and are what this suite is for.
//
// First, the LIE: if "Custom" were stored, rebuilding Pool by hand would still say
// Custom, and picking Pool then changing one slot could still say Pool. The name is
// computed by matching the live slots against the bundle table, so both directions
// are checked here — including the round trip back to a named theme.
//
// Second, DRIFT: the ball look is shown in two cards and sound in two cards. They
// are one state through one builder, so a click in either place has to move both.
//
// The sound slot is the odd one: it has no stored value at all (sel.snd already owns
// the five categories), so it is derived twice over and can legitimately hold a value
// no set describes. That has to read Custom rather than throw.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:560,height:1000} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const card = document.querySelector('#setup .card.collapsible[data-sec="theme"]');
  card.classList.remove('collapsed');
  M.buildSettings();
  const slots = () => Object.fromEntries(M.SLOT_KEYS.map(k=>[k, M.SLOTS[k].get()]));

  // ---- the five slots exist and every one is a real registry ---------------
  o.slotKeys = M.SLOT_KEYS.join(',');
  o.everySlotHasOptions = M.SLOT_KEYS.every(k => M.SLOTS[k].keys().length >= 2);
  o.everySlotLabelled = M.SLOT_KEYS.every(k => !!M.SLOTS[k].label && !!M.SLOTS[k].hint);
  // ...and every option in every slot names itself without throwing.
  o.everyOptionNamed = M.SLOT_KEYS.every(k =>
    M.SLOTS[k].keys().every(x => typeof M.SLOTS[k].name(x) === 'string' && M.SLOTS[k].name(x).length));

  // ---- a bundle sets all five ---------------------------------------------
  M.applyBundle('pool');
  o.poolSlots = slots();
  o.poolIsWholeCollection =
    o.poolSlots.palette === 'pool' && o.poolSlots.field === 'pooltable' &&
    o.poolSlots.discs === 'pool'   && o.poolSlots.ball === 'plain' &&
    o.poolSlots.sfx === 'pool';
  o.poolNamed = M.bundleName() === 'Pool' && M.currentBundle() === 'pool';
  // The sound really moved — not just the label. sel.snd is what playSfx reads.
  o.poolSnd = { kick: M.sel.snd.kick, wall: M.sel.snd.wall, net: M.sel.snd.net };
  o.soundActuallyChanged = M.sel.snd.kick === M.SFX_SETS.pool.pick.kick &&
                           M.SFX.kick.length > M.sel.snd.kick;
  // ...and it reaches the live render, not just the settings object.
  M.sel.mode='2v2'; M.setMatchSeed(4); M.startMatch();
  M.world.state='play'; M.world.stateT=2; M.computeCam(); M.render();
  o.reachesRender = !!M.discSkin() && !!M.dynField();

  // ---- change ONE slot → Custom, in name and on screen ---------------------
  M.setSlot('ball', 'beach');
  o.afterOneChange = M.bundleName();
  o.oneChangeIsCustom = M.currentBundle() === null && o.afterOneChange === 'Custom';
  M.buildSettings();
  const bundleTiles = () => [...document.querySelectorAll('#themePick .opt')];
  // ⚠️ No NAMED bundle may be marked — but the Custom tile must be, and it is a real
  // tile in the same row. Counting "no tile selected" would now be asserting that
  // Custom does not exist.
  const named = () => bundleTiles().filter(t=>t.dataset.bundle !== 'custom');
  o.noBundleMarked = named().filter(t=>t.classList.contains('sel')).length === 0;
  o.customTileMarked = bundleTiles().some(t=>t.dataset.bundle==='custom' && t.classList.contains('sel'));
  o.exactlyOneMarked = bundleTiles().filter(t=>t.classList.contains('sel')).length === 1;
  o.labelSaysCustom = /custom/i.test(document.getElementById('themeNow').textContent);
  // Every other slot is untouched — one slot changed, not the theme thrown away.
  o.restSurvived = M.SLOTS.palette.get()==='pool' && M.SLOTS.discs.get()==='pool' &&
                   M.SLOTS.field.get()==='pooltable' && M.SLOTS.sfx.get()==='pool';

  // ---- ...and back. The name is derived, so it must come back on its own ----
  M.setSlot('ball', 'plain');
  o.roundTrip = M.bundleName();
  o.nameComesBack = M.currentBundle() === 'pool';
  // Assembled by hand from a different starting point, it is STILL Pool.
  M.applyBundle('neon');
  for (const [k,v] of Object.entries(M.bundleSlots('pool'))) M.setSlot(k, v);
  o.handBuiltIsPool = M.currentBundle() === 'pool';

  // ---- sound is derived twice over -----------------------------------------
  M.sel.snd.kick = 1;                       // a pick no set describes
  o.handPickedSfx = M.sfxSetKey();
  o.sfxCanBeCustom = o.handPickedSfx === 'custom';
  M.buildSettings();                        // must not throw on a value with no name
  o.customSfxLabel = [...document.querySelectorAll('#slotRows label.field')]
    .map(l=>l.textContent).find(t=>/Sound/.test(t)) || '';
  o.customSfxReadsCustom = /custom/i.test(o.customSfxLabel);
  o.themeIsCustomToo = M.currentBundle() === null;
  M.applySfxSet('pool');
  o.setRestoresName = M.sfxSetKey() === 'pool';
  // The categories come from SFX itself, so a new one can't be forgotten here.
  // Sorted: adding a category is legitimate, changing or losing one is not.
  o.sfxCats = M.sfxCatKeys().slice().sort().join(',');
  o.setsCoverEveryCat = Object.values(M.SFX_SETS).every(s =>
    M.sfxCatKeys().every(c => s.pick[c] != null && M.SFX[c][s.pick[c]] && M.SFX_LABELS[c][s.pick[c]]));

  // ---- every sound in every set actually plays ------------------------------
  // A set that names an index past the end of an array is silence, not a theme.
  const threw = [];
  M.sel.snd.muted = false;
  for (const [k,s] of Object.entries(M.SFX_SETS))
    for (const c of M.sfxCatKeys()){
      try { M.SFX[c][s.pick[c]](); } catch(e){ threw.push(k+'.'+c+': '+e.message); }
    }
  o.sfxThrew = threw;

  // ---- one state, two cards -------------------------------------------------
  // ⚠️ The BALL half of this used to live here too, against the standalone Ball card.
  // That card is gone: it held exactly one control and its own help text admitted it was
  // the Theme card's Ball slot, so a second door onto one tile cost a card, a jump chip
  // and a search row while giving a player two places to change one thing. The check that
  // replaces it is that there is now exactly ONE place — a duplicate coming back is the
  // regression, and `#slot_ball` still has to drive the slot on its own.
  M.applyBundle('neon');
  M.buildSettings();
  const ballTiles = sel => [...document.querySelectorAll(sel + ' .opt')];
  const idx = M.BALL_LOOK_KEYS.indexOf('eight');
  ballTiles('#slot_ball')[idx].click(); await wait(80);
  o.themeCardWrites = M.SLOTS.ball.get() === 'eight';
  o.themeCardMarks = ballTiles('#slot_ball')[idx].classList.contains('sel');
  o.noDuplicateBallCard = !document.getElementById('ballLookPick') &&
                          !document.querySelector('.card[data-sec="ball"]');
  // ...and the other way round, on the slot that IS still shown twice: Sound. The Sound
  // card owns the categories one at a time and the Theme card shows the set, so this is
  // the pairing that still has to stay in step.
  const sfxKeys = Object.keys(M.SFX_SETS), si = sfxKeys.indexOf('space');
  ballTiles('#sfxSetPick')[si].click(); await wait(80);
  o.sndCardWrites = M.sfxSetKey() === 'space';
  o.sfxSlotFollowed = ballTiles('#slot_sfx')[si].classList.contains('sel');
  // ...and back the other way, so neither card is merely a mirror of the other.
  const si2 = sfxKeys.indexOf('pinball');
  ballTiles('#slot_sfx')[si2].click(); await wait(80);
  o.sfxSlotWrites = M.sfxSetKey() === 'pinball';
  o.sndCardFollowed = ballTiles('#sfxSetPick')[si2].classList.contains('sel');

  // ---- every option in every slot renders without throwing ------------------
  // Including the mixes a bundle would never produce — that's the whole point of
  // letting people mix, and a crash there is a crash on someone's real setting.
  const bad = [];
  M.sel.mode='2v2'; M.setMatchSeed(7); M.startMatch();
  M.world.state='play'; M.world.stateT=2;
  for (const slot of M.SLOT_KEYS){
    for (const k of M.SLOTS[slot].keys()){
      try {
        M.setSlot(slot, k);
        M.computeCam(); M.render();
        if (M.slotSwatch(slot, k) === null && slot !== 'sfx') bad.push(slot+':'+k+' has no swatch');
      } catch(e){ bad.push(slot+':'+k+': '+e.message); }
    }
  }
  // The awkward one on purpose: a starfield over a green palette. The stars fall
  // back to the line colour, so they can't paint black-on-black and vanish.
  M.applyBundle('grass'); M.setSlot('field','starfield');
  try { M.computeCam(); M.render(); } catch(e){ bad.push('grass+starfield: '+e.message); }
  o.mixed = bad;

  // ---- persistence, and the shape a legacy save has -------------------------
  M.applyBundle('pool'); M.saveSel();
  const saved = JSON.parse(localStorage.getItem('magnetball.sel')||'{}');
  o.saved = saved.look;
  o.persists = saved.look && saved.look.palette === 'pool' && saved.look.discs === 'pool';
  o.noLegacyKeys = saved.theme === undefined && saved.ballLook === undefined;
  // A save from before slots existed: one theme key and one ball key.
  M.sel.theme = 'warp'; M.sel.ballLook = 'cross'; delete M.sel.look;
  // Category-driven, not a hand-written list of five — adding a sixth (full time)
  // silently left this one un-reset, so the save no longer looked "untouched" and the
  // migration correctly declined to overwrite it. The test was the thing that drifted.
  M.applySfxSet('classic');
  M.normalizeLook();
  o.migrated = slots();
  o.legacyBecomesBundle = M.sel.look.palette === 'warp' && M.sel.look.field === 'starfield' &&
                          M.sel.look.discs === 'mono';
  o.legacyBallKept = M.sel.look.ball === 'cross';          // yours beats the bundle's
  o.legacySoundAdopted = M.sfxSetKey() === 'space';        // untouched sound follows the theme
  o.legacyKeysGone = M.sel.theme === undefined && M.sel.ballLook === undefined;
  // ⚠️ RENAMED KEYS, not just renamed names. The arrowhead theme and its court were
  // re-keyed as well as re-titled, so a save naming the old ones has to be folded or it
  // lands on a theme that no longer exists — which shows up as the DEFAULT palette and
  // reads as "my theme was reset". Caught exactly that way: the first build's fold was a
  // no-op and the save came back as Grass.
  M.sel.look = { palette: 'videoball', field: 'vbcourt', discs: 'arrow', ball: 'plain', trail: 'dots' };
  M.normalizeLook();
  o.renamedKeyFolded = M.sel.look.palette === 'vsoccer' && M.sel.look.field === 'vscourt';
  // ⚠️ NOT `currentBundle()`. The sound slot is derived from `sel.snd`, which the legacy
  // check above deliberately left on another set, so the mix reads as Custom for a reason
  // that has nothing to do with this fold — the first version of this check failed on it.
  // What matters is that the folded key names a REAL theme.
  o.renamedThemeReal = (M.THEMES[M.sel.look.palette] || {}).name === 'VideoSoccer';
  o.renamedFieldReal = !!M.DYN_FIELDS[M.sel.look.field];
  o.oldKeysGone = !M.THEMES.videoball && !M.DYN_FIELDS.vbcourt;
  // A hand-picked whistle is NOT overwritten by the migration.
  M.sel.theme = 'pool'; delete M.sel.look; M.applySfxSet('classic'); M.sel.snd.whistle = 2;
  M.normalizeLook();
  o.handPickedWhistleKept = M.sel.snd.whistle === 2 && M.sel.snd.kick === 0;

  M.applyBundle('neon'); M.saveSel(); M.setMatchSeed(null);
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.slotKeys === 'palette,field,discs,ball,trail,sfx', `wrong slots: ${r.slotKeys}`);
ok(r.everySlotHasOptions, 'a slot has fewer than two options, so it is not a choice');
ok(r.everySlotLabelled, 'a slot has no label or no hint');
ok(r.everyOptionNamed, 'an option in some slot has no name');
ok(r.poolIsWholeCollection, `Pool did not set every slot: ${JSON.stringify(r.poolSlots)}`);
ok(r.poolNamed, 'Pool did not name itself after being applied');
ok(r.soundActuallyChanged, `the sound slot did not move sel.snd: ${JSON.stringify(r.poolSnd)}`);
ok(r.reachesRender, 'the field/player slots did not reach the live render');
ok(r.oneChangeIsCustom, `changing one slot left the theme named "${r.afterOneChange}"`);
ok(r.noBundleMarked, 'a NAMED bundle tile is still marked selected after a slot was changed');
ok(r.customTileMarked, 'the Custom tile is not marked when the slots match no bundle');
ok(r.exactlyOneMarked, 'more than one tile is marked in the bundle row');
ok(r.labelSaysCustom, 'the header does not say Custom after a slot was changed');
ok(r.restSurvived, 'changing one slot reset the others');
ok(r.nameComesBack, `putting the slot back left it named "${r.roundTrip}" — the name is not derived`);
ok(r.handBuiltIsPool, 'assembling Pool slot by slot did not get Pool\'s name back');
ok(r.sfxCanBeCustom, `a hand-picked sound reads as "${r.handPickedSfx}" instead of custom`);
ok(r.customSfxReadsCustom, `the sound row throws or mislabels a hand-picked set: "${r.customSfxLabel}"`);
ok(r.themeIsCustomToo, 'a hand-picked sound did not make the theme Custom');
ok(r.setRestoresName, 'applying a set did not restore its name');
ok(r.sfxCats === 'crowd,fulltime,kick,net,wall,whistle', `sound categories drifted: ${r.sfxCats}`);
ok(r.setsCoverEveryCat, 'a sound set is missing a category, or names a variant with no sound/label');
ok(r.sfxThrew.length === 0, `a set names a sound that throws: ${JSON.stringify(r.sfxThrew)}`);
ok(r.themeCardWrites && r.themeCardMarks, 'the Theme card ball slot did not drive the ball look');
ok(r.noDuplicateBallCard,
   'a second Ball card is back — it held one control and its own help text admitted it was the Theme card\'s Ball slot, so it cost a card, a jump chip and a search row to give a player two places to change one thing');
ok(r.sfxSlotWrites && r.sndCardFollowed,
   'the Theme card sound slot did not move the Sound card — this is the pairing that IS still shown twice, so it is the one that has to stay in step');
ok(r.sndCardWrites && r.sfxSlotFollowed, 'the Sound card set did not move the Theme card slot');
ok(r.mixed.length === 0, `a slot option or mix failed to render: ${JSON.stringify(r.mixed)}`);
ok(r.persists, `the slots were not saved: ${JSON.stringify(r.saved)}`);
ok(r.noLegacyKeys, 'the old theme/ballLook keys are still being written');
ok(r.legacyBecomesBundle, `a legacy save did not migrate to its bundle: ${JSON.stringify(r.migrated)}`);
ok(r.legacyBallKept, `a legacy ball look was lost: ${JSON.stringify(r.migrated)}`);
ok(r.legacySoundAdopted, 'an untouched sound did not follow the migrated theme');
ok(r.renamedKeyFolded && r.renamedThemeReal && r.renamedFieldReal,
   `a save naming the old arrowhead keys did not fold: ${JSON.stringify({ folded: r.renamedKeyFolded, theme: r.renamedThemeReal, field: r.renamedFieldReal })} — an unfolded key lands on the DEFAULT palette, which reads to a player as "my theme was reset"`);
ok(r.oldKeysGone, 'the old keys are still in the registries, so nothing proves the rename happened');
ok(r.legacyKeysGone, 'migration left the legacy keys behind to be read again');
ok(r.handPickedWhistleKept, 'migration overwrote a hand-picked sound');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nthemeslots OK');
