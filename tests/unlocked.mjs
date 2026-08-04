// The "Unlocked" summary at the top of Your Player: counts match the unlock model,
// the strip shows only earned items, tapping one equips it, and it stays in step.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.buildUnlocked();

  // Counts shown must equal what the unlock model actually reports.
  const chips=[...document.querySelectorAll('#unlChips .unlChip')];
  o.chipCount = chips.length;                       // one per category
  o.catCount = M.UNL_CATS.length;          // derived, not a hardcoded 4 — a new category is not a failure
  o.chipsMatchModel = M.UNL_CATS.every((c,i)=>{
    const keys=c.keys(), mine=keys.filter(k=>M.isUnlocked(c.cat,k));
    return chips[i] && chips[i].textContent.replace(/\s+/g,' ').includes(`${mine.length}/${keys.length}`);
  });
  const uc = M.unlockCounts();
  o.totalMatches = document.getElementById('unlTotal').textContent.trim() === `${uc.have} / ${uc.total}`;
  const pct = Math.round(uc.have/uc.total*100);
  o.barMatches = document.getElementById('unlFill').style.width === pct + '%';

  // The strip must contain ONLY unlocked items — never a locked one.
  const items=[...document.querySelectorAll('#unlStrip .unlItem')];
  o.stripNotEmpty = items.length > 0;
  const unlockedTitles = new Set();
  for (const c of M.UNL_CATS)
    for (const k of c.keys().filter(k=>M.isUnlocked(c.cat,k)))
      // Ask the game what an item is called rather than keeping a second copy of
      // that chain here — the copy is what went stale when a category was added.
      if (k!=='none') unlockedTitles.add(M.itemName(c.cat, k));
  o.stripOnlyUnlocked = items.every(el => unlockedTitles.has(el.title));
  // Count from the model, not from the Set: two items may legitimately share a name.
  let expected = 0;
  for (const c of M.UNL_CATS)
    expected += c.keys().filter(k=>M.isUnlocked(c.cat,k) && k!=='none').length;
  o.stripCountMatches = items.length === expected;

  // A locked item must never appear. Pick one that is genuinely locked.
  let lockedName=null;
  for (const c of M.UNL_CATS){
    const k = c.keys().find(k=>!M.isUnlocked(c.cat,k));
    if (k){ lockedName = c.cat==='cap' ? M.CAPS[k].name : c.cat==='flag' ? M.FLAGS[k].name
              : c.cat==='animal' ? M.ANIMALS[k].name : M.EYES[k].name; break; }
  }
  o.hasLockedItemToCheck = !!lockedName;
  o.lockedNotShown = !lockedName || !items.some(el=>el.title===lockedName);

  // Tapping an item equips it and the selection marker follows.
  const eyeCat = M.UNL_CATS.find(c=>c.cat==='eyes');
  const eyeKey = eyeCat.keys().find(k=>k!=='none' && M.isUnlocked('eyes',k) && M.profile.eyes!==k);
  o.foundEyeToEquip = !!eyeKey;
  if (eyeKey){
    const el=[...document.querySelectorAll('#unlStrip .unlItem')].find(e=>e.title===M.EYES[eyeKey].name);
    el.click(); await wait(80);
    o.tapEquips = M.profile.eyes === eyeKey;
    o.markerFollows = [...document.querySelectorAll('#unlStrip .unlItem.sel')].some(e=>e.title===M.EYES[eyeKey].name);
  }

  // Unlocking something new must show up without a manual rebuild.
  const before = [...document.querySelectorAll('#unlStrip .unlItem')].length;
  const capCat = M.UNL_CATS.find(c=>c.cat==='cap');
  const lockedCap = capCat.keys().find(k=>!M.isUnlocked('cap',k));
  o.foundLockedCap = !!lockedCap;
  if (lockedCap){
    M.login.granted.push('cap:'+lockedCap);          // simulate earning it
    M.updatePreview();                                // the normal refresh path
    const after = [...document.querySelectorAll('#unlStrip .unlItem')].length;
    o.newUnlockAppears = after === before + 1;
    M.login.granted.pop(); M.updatePreview();
  }

  // Reachable by the deck focus ring (controller users can equip too).
  M.sel.display='deck'; M.applyDisplayMode(); await wait(200);
  M.setDockCollapsed(false); await wait(120);
  const hdr=[...M.deckFocusables()].find(el=>el.tagName==='H2' && /your player/i.test(el.textContent));
  if (hdr){ hdr.click(); await wait(100); }
  o.deckFocusable = M.deckFocusables().some(el=>el.classList && el.classList.contains('unlItem'));
  M.sel.display='auto'; M.applyDisplayMode(); await wait(150);
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.chipCount===r.catCount && r.chipsMatchModel && r.totalMatches && r.barMatches &&
  r.stripNotEmpty && r.stripOnlyUnlocked && r.stripCountMatches && r.lockedNotShown &&
  r.tapEquips && r.markerFollows && r.newUnlockAppears && r.deckFocusable && errors.length===0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
