// Picker swatches: cached, and cached in the RIGHT two buckets.
//
// ⚠️ THE COST THIS EXISTS FOR: every option tile is a canvas, and the FIELD tiles bake
// their real texture at full resolution for a 64px preview — a 384-square dither
// written as ImageData, eleven strips of 60px type, a nebula. `buildSlotPicker` runs
// on every slot change and used a throwaway state per tile, so the bake was thrown
// away and redone every time. Measured at 15.6ms for the field row alone and 17.3ms
// for the bundle row: opening the Theme card dropped two frames and every tap inside
// it dropped another.
//
// ⚠️ TWO buckets, not one. A bundle tile paints with TH swapped to ITS OWN palette and
// a palette tile reads THEMES directly, so neither can go stale — putting them in the
// map that gets dropped on a theme change meant changing theme re-paid the whole
// bundle row, which is exactly the moment you are looking at it.
//
// ⚠️ And the caller gets a COPY. The Theme card stacks all six slots while the Ball
// and Sound cards show one of them AGAIN, so two tiles on screen ask for the same
// swatch — handing both the same node makes the second append MOVE it out of the
// first, and one of the two rows silently loses its picture.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:520,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();

  // ---- a repeat build is cheap -------------------------------------------
  M.applyTheme('neon');
  const build = () => { const h=document.createElement('div');
    const t0=performance.now(); M.buildSlotPicker('field', h);
    return { ms:performance.now()-t0, n:h.querySelectorAll('.opt').length }; };
  const first = build(), again = build();
  o.tiles = first.n;
  o.firstMs = +first.ms.toFixed(2); o.againMs = +again.ms.toFixed(2);
  o.repeatIsCheap = again.ms < first.ms / 2 || first.ms < 2;
  o.builtTiles = first.n > 8 && again.n === first.n;

  // ---- the caller gets a COPY, not the cached node ------------------------
  const a1 = M.slotSwatch('field', 'starfield');
  const a2 = M.slotSwatch('field', 'starfield');
  o.freshNode = !!a1 && !!a2 && a1 !== a2;
  // ...and it is the same PICTURE, or the cache is not being used at all.
  const px = (cv) => cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data.join(',');
  o.samePicture = o.freshNode && px(a1) === px(a2);
  // The real path: two tiles on screen at once must both keep their canvas.
  const h1 = document.createElement('div'), h2 = document.createElement('div');
  document.body.append(h1, h2);
  M.buildSlotPicker('ball', h1); M.buildSlotPicker('ball', h2);
  o.bothRowsKeepTheirs = h1.querySelectorAll('canvas').length > 3 &&
                         h1.querySelectorAll('canvas').length === h2.querySelectorAll('canvas').length;
  h1.remove(); h2.remove();

  // ---- a theme change drops the LIVE tiles and keeps the fixed ones -------
  const host = document.createElement('div');
  M.buildSlotPicker('field', host);
  for (const k of M.bundleKeys()){ const cv=document.createElement('canvas');
    cv.width=64; cv.height=41; M.drawBundleSwatch(cv.getContext('2d'), k, 64, 41); }
  o.liveBefore = M.swatchCache.size; o.fixedBefore = M.swatchFixed.size;
  M.applyTheme('shrimp');
  o.liveAfter = M.swatchCache.size; o.fixedAfter = M.swatchFixed.size;
  o.liveDropped  = o.liveBefore > 4 && o.liveAfter === 0;
  o.fixedSurvived = o.fixedBefore > 4 && o.fixedAfter === o.fixedBefore;
  // ...and the bundle row is free again straight after a theme change.
  const t2 = performance.now();
  for (const k of M.bundleKeys()){ const cv=document.createElement('canvas');
    cv.width=64; cv.height=41; M.drawBundleSwatch(cv.getContext('2d'), k, 64, 41); }
  o.bundleAfterThemeMs = +(performance.now()-t2).toFixed(2);
  o.bundleStaysCached = o.bundleAfterThemeMs < 8;

  // ---- ...because a live tile really does depend on the palette -----------
  // If it didn't, dropping them on a theme change would be pure waste — and if the
  // key were wrong, the picker would show yesterday's inks.
  M.applyTheme('neon');
  const onNeon = px(M.slotSwatch('field', 'starfield'));
  M.applyTheme('shrimp');
  const onRockpool = px(M.slotSwatch('field', 'starfield'));
  o.tileFollowsPalette = onNeon !== onRockpool;
  M.applyTheme('neon');
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.builtTiles, `the field picker built ${r.tiles} tiles — the fixture is wrong, not the feature`);
ok(r.repeatIsCheap, `rebuilding the field picker cost ${r.againMs}ms after ${r.firstMs}ms — the tile bake is being redone every time, and buildSlotPicker runs on every slot change`);
ok(r.freshNode, 'slotSwatch handed back the cached canvas itself — the Theme card and the Ball card both ask for the ball tiles, so the second append MOVES the node and one row loses its pictures');
ok(r.samePicture, 'two calls produced different pixels, so the cache is not being used');
ok(r.bothRowsKeepTheirs, 'two pickers of the same slot on screen at once did not both keep their canvases');
ok(r.liveDropped, `the live-palette tiles survived a theme change (${r.liveBefore} → ${r.liveAfter}) — they are painted against the old inks`);
ok(r.fixedSurvived, `the palette-independent tiles were dropped on a theme change (${r.fixedBefore} → ${r.fixedAfter}) — a bundle tile paints with its OWN palette, so re-baking the whole row is pure waste at the one moment you are looking at it`);
ok(r.bundleStaysCached, `the bundle row cost ${r.bundleAfterThemeMs}ms straight after a theme change`);
ok(r.tileFollowsPalette, 'a field tile renders identically over two palettes — either the preview ignores the live inks or the cache key is wrong, and one of those shows yesterday’s colours');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nswatchcache OK');
