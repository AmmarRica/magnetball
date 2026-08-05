// Grass cut picker draws real pitch previews, not emojis: each tile paints the
// SELECTED court with THAT tile's mow pattern, and the two pickers stay in step.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const tiles = () => [...document.querySelectorAll('#grass .opt')];
  const keys = Object.keys(M.GRASS);

  // --- Every option is a tile with a canvas, and no emoji span survives
  o.tileCount = tiles().length;
  o.expectCount = keys.length;
  o.everyTileHasCanvas = tiles().every(t=>t.querySelector('canvas'));
  o.noEmojiSpans = tiles().every(t=>!t.querySelector('.emoji'));
  o.namesShown = tiles().map(t=>t.querySelector('span')?t.querySelector('span').textContent:'')
                        .filter(Boolean).length === keys.length;

  // --- Each tile is a DIFFERENT picture: the patterns really differ
  const sig = cv => { const c=cv.getContext('2d');
    const d=c.getImageData(0,0,cv.width,cv.height).data;
    let h=0; for(let i=0;i<d.length;i+=8) h=(h*31 + d[i]+d[i+1]*3)|0; return h; };
  const sigs = tiles().map(t=>sig(t.querySelector('canvas')));
  o.allTilesDistinct = new Set(sigs).size === keys.length;
  // and they're actually drawn on (not blank canvases)
  const inked = cv => { const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
    let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>0) n++; return n; };
  o.allTilesInked = tiles().every(t=>inked(t.querySelector('canvas')) > 800);

  // --- The tile shows the SELECTED court. Switch field -> every grass tile redraws.
  const before = tiles().map(t=>sig(t.querySelector('canvas')));
  const fieldTiles = [...document.querySelectorAll('#fields .opt')];
  o.fieldTilesExist = fieldTiles.length > 1;
  const wasField = M.sel.field;
  const other = fieldTiles.find(t=>!t.classList.contains('sel'));
  other.click(); await wait(80);
  o.fieldChanged = M.sel.field !== wasField;
  const after = tiles().map(t=>sig(t.querySelector('canvas')));
  o.grassRedrawsOnFieldPick = before.every((v,i)=>v !== after[i]);

  // --- ...and picking a grass style redraws the FIELD tiles with that mow
  const fSig = () => [...document.querySelectorAll('#fields .opt canvas')].map(sig);
  const fBefore = fSig();
  const wasGrass = M.sel.grass;
  const gOther = tiles().find(t=>!t.classList.contains('sel'));
  gOther.click(); await wait(80);
  o.grassChanged = M.sel.grass !== wasGrass;
  o.fieldsRedrawOnGrassPick = fBefore.some((v,i)=>v !== fSig()[i]);
  o.grassPickMarksSelected = tiles().filter(t=>t.classList.contains('sel')).length === 1;

  // --- Selecting persists and drives the actual pitch, not just the tile
  M.saveSel();
  o.selectionPersists = JSON.parse(localStorage.getItem('magnetball.sel')||'{}').grass === M.sel.grass;

  // --- A theme switch repaints the tiles (they use the live TH palette)
  const themeTiles = [...document.querySelectorAll('#themePick .opt')];
  const tBefore = tiles().map(t=>sig(t.querySelector('canvas')));
  const tOther = themeTiles.find(t=>!t.classList.contains('sel'));
  o.themeTilesExist = themeTiles.length > 1;
  tOther.click(); await wait(120);
  o.tilesFollowTheme = tiles().map(t=>sig(t.querySelector('canvas'))).some((v,i)=>v!==tBefore[i]);

  // --- Every pattern still renders on the real pitch without throwing
  M.applyBundle('neon');
  M.sel.mode='1v1'; M.startMatch(); await wait(120);
  const w=M.world; w.state='play'; w.stateT=1;
  o.allPatternsRender = true;
  for (const k of keys){
    M.sel.grass = k;
    try { for(let i=0;i<3;i++) M.step(w); M.render(); }
    catch(e){ o.allPatternsRender = false; o.renderFail = k + ': ' + e.message; }
  }
  M.sel.grass = 'stripes'; M.sel.field = wasField; M.saveSel();
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.tileCount === r.expectCount && r.everyTileHasCanvas && r.noEmojiSpans && r.namesShown &&
  r.allTilesDistinct && r.allTilesInked && r.fieldTilesExist && r.fieldChanged &&
  r.grassRedrawsOnFieldPick && r.grassChanged && r.fieldsRedrawOnGrassPick &&
  r.grassPickMarksSelected && r.selectionPersists && r.themeTilesExist && r.tilesFollowTheme &&
  r.allPatternsRender && errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
