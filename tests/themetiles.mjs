// The palette tiles show each palette's colours, the way the field picker shows each
// court — so they have to be canvases painted from THEMES, not emoji, and they have to
// actually differ from one another.
//
// Since themes became a collection of slots there are TWO grids of them: the Bundle
// row (the whole look — its field, its players, its ball) and the Background slot row
// (the colours). The bands live in the second one now, and the two must not paint the
// same picture — that was the bug this suite was extended to catch: a Bundle row that
// was just the Background row again taught nothing about what a bundle is.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1100,height:1000} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.openLook('theme'); await wait(150);

  const tiles = () => [...document.querySelectorAll('#slot_palette .opt')];
  const bundles = () => [...document.querySelectorAll('#themePick .opt')];
  o.tileCount = tiles().length;
  o.oneTilePerTheme = o.tileCount === Object.keys(M.THEMES).length;
  o.everyTileHasCanvas = tiles().every(t=>!!t.querySelector('canvas'));
  o.noEmojiSpans = tiles().every(t=>!t.querySelector('.emoji'));
  o.everyTileNamed = tiles().every(t=>/\S/.test(t.textContent));

  // Each tile must be PAINTED, not a blank canvas parked in the DOM.
  const sig = (cv) => { const c=cv.getContext('2d');
    const d=c.getImageData(0,0,cv.width,cv.height).data;
    let h=0, ink=0;
    for(let i=0;i<d.length;i+=16){ h=(h*31 + d[i]+d[i+1]*3+d[i+2]*7)|0; if(d[i+3]>0) ink++; }
    return { h, ink }; };
  const sigs = tiles().map(t=>sig(t.querySelector('canvas')));
  o.allPainted = sigs.every(s=>s.ink > 0);
  o.allDistinct = new Set(sigs.map(s=>s.h)).size === sigs.length;

  // The bands are the theme's own colours, in order, sampled off the tile itself.
  // (Reading THEMES and comparing it to THEMES would prove nothing.)
  // Several palette entries are rgba() (Neon's line is 70% cyan), so the painted
  // band is that colour composited over the tile's backdrop — reproduce the same
  // two fills on a scratch pixel instead of trying to parse a hex out of it.
  const ref = document.createElement('canvas'); ref.width = ref.height = 1;
  const rc = ref.getContext('2d');
  const expect = (bg, col) => { rc.fillStyle = bg; rc.fillRect(0,0,1,1);
    rc.fillStyle = col; rc.fillRect(0,0,1,1); return rc.getImageData(0,0,1,1).data; };
  const near = (A, B) => [0,1,2].every(i=>Math.abs(A[i]-B[i]) <= 2);
  const keys = Object.keys(M.THEMES);
  // ⚠️ **ADDRESSED BY KEY, NEVER BY POSITION.** The pickers are ordered A-Z by the name on
  // the tile, which has nothing to do with declaration order (`light` is "Paper", `ufo` is
  // "Abduction"), so `keys[i]` against `tiles()[i]` compares one theme's palette with a
  // different theme's swatch and every band reads wrong. It also has to be right for any
  // future reordering: a suite that has to be edited whenever the list moves is one nobody
  // trusts. `dataset.key` is what `buildSlotPicker` stamps on every tile.
  const tileFor = k => tiles().find(t => t.dataset.key === k);
  o.everyTileKeyed = keys.every(k => !!tileFor(k));
  o.bandsMatchPalette = keys.map((k)=>{
    const cv = tileFor(k).querySelector('canvas'), c = cv.getContext('2d');
    const want = M.themeSwatchColors(M.THEMES[k]);
    const pad = cv.width/64*4, w = cv.width - pad*2, bw = w/want.length, y = Math.round(cv.height/2);
    return want.every((col, i)=>{
      const x = Math.round(pad + bw*(i+0.5));
      return near(c.getImageData(x, y, 1, 1).data, expect(M.THEMES[k].ui.bg, col));
    });
  });
  o.everyBandRight = o.bandsMatchPalette.every(Boolean);
  // The bundle tile is a different picture from the palette tile it sits above —
  // and is painted, distinct per bundle, and taller than it is a colour strip.
  // The Bundle row is one tile per palette PLUS a Custom tile — a real, selectable
  // member of the row, not a label, so it counts.
  const named = () => bundles().filter(t=>t.dataset.bundle !== 'custom');
  const bsigs = named().map(t=>sig(t.querySelector('canvas')));
  o.bundleCount = bundles().length;
  o.namedCount = named().length;
  o.oneBundlePerTheme = o.namedCount === keys.length && o.bundleCount === keys.length + 1;
  o.hasCustomTile = bundles().some(t=>t.dataset.bundle === 'custom');
  o.bundlesPainted = bsigs.every(s=>s.ink > 0);
  o.bundlesDistinct = new Set(bsigs.map(s=>s.h)).size === bsigs.length;
  o.customPainted = sig(bundles().find(t=>t.dataset.bundle==='custom').querySelector('canvas')).ink > 0;
  // Positional here as well, and for the same reason: match the two rows by KEY.
  const sigByKey = {}; tiles().forEach(t => { sigByKey[t.dataset.key] = sig(t.querySelector('canvas')); });
  const bSigByKey = {}; named().forEach(t => { bSigByKey[t.dataset.bundle] = sig(t.querySelector('canvas')); });
  o.bundleIsNotThePalette = keys.every(k => bSigByKey[k] && sigByKey[k] && bSigByKey[k].h !== sigByKey[k].h);
  o.swatchUsesSixColours = M.themeSwatchColors(M.THEMES.neon).length === 6;

  // Picking one still switches the theme (the tiles are controls, not decoration).
  const before = M.sel.look.palette;
  const other = keys.find(k=>k!==before);
  tileFor(other).click(); await wait(120);
  o.paletteAloneIsCustom = M.currentBundle() === null;   // one slot moved, not the theme
  o.clickSwitches = M.sel.look.palette === other &&
    getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === M.THEMES[other].ui.bg;
  o.selectedTileMarked = tileFor(other).classList.contains('sel') &&
    tiles().filter(t=>t.classList.contains('sel')).length === 1;
  // ...and the tiles repaint under the new theme without going blank.
  o.stillPaintedAfterSwitch = tiles().every(t=>sig(t.querySelector('canvas')).ink > 0);
  M.applyBundle(before); M.saveSel();
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.oneTilePerTheme && r.everyTileHasCanvas && r.noEmojiSpans && r.everyTileNamed &&
  r.allPainted && r.allDistinct && r.everyTileKeyed && r.everyBandRight && r.swatchUsesSixColours &&
  r.oneBundlePerTheme && r.hasCustomTile && r.customPainted &&
  r.bundlesPainted && r.bundlesDistinct && r.bundleIsNotThePalette &&
  r.paletteAloneIsCustom &&
  r.clickSwitches && r.selectedTileMarked && r.stillPaintedAfterSwitch && errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
