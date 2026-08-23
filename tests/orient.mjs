import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);
const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const rotOf = ()=>{ M.computeCam(); return +(M.cam.rot||0).toFixed(4); };
  const H=-1.5708;

  M.sel.display='auto'; M.sel.orient='auto'; M.applyDisplayMode(); await wait(120);
  M.sel.mode='1v1'; M.sel.field='classic'; M.startMatch(); await wait(120);
  // ⚠️ **AUTO NOW MEANS "WHICHEVER WAY FILLS THE SCREEN", and it used to mean `isDeck()`.**
  // On this landscape window an upright 440x760 court fits at a scale that leaves most of
  // the width as surround — reported as dead space in the court. The claim is not just
  // "it turned": it is that turning it makes the pitch BIGGER, measured as the drawn
  // scale both ways, so a build that turns the pitch for no gain fails here.
  o.autoDesktopSideways = rotOf()===H;
  const scaleAt = (or) => { M.sel.orient=or; M.applyDisplayMode(); M.computeCam(); return M.cam.s; };
  const sUp = scaleAt('v'), sSide = scaleAt('h');
  M.sel.orient='auto'; M.applyDisplayMode(); await wait(60);
  o.sidewaysIsBigger = sSide > sUp * 1.2;
  o.gain = +(sSide/sUp).toFixed(2);

  // Force sideways on a normal desktop layout (decoupled from Steam Deck)
  M.sel.orient='h'; M.applyDisplayMode(); await wait(120);
  o.forcedSideways = rotOf()===H;
  o.seatRotatedLive = M.world.players.find(x=>x.ctrl!=='bot').rotQuarter===1;

  // Force upright even in Steam Deck layout
  M.sel.display='deck'; M.sel.orient='v'; M.applyDisplayMode(); await wait(150);
  o.deckForcedUpright = rotOf()===0;
  o.seatUnrotatedLive = M.world.players.find(x=>x.ctrl!=='bot').rotQuarter===0;

  // Auto on deck = sideways
  M.sel.orient='auto'; M.applyDisplayMode(); await wait(150);
  o.autoDeckSideways = rotOf()===H;

  // Cocktail always upright regardless of orient
  M.sel.display='cocktail'; M.sel.orient='h'; M.applyDisplayMode(); await wait(150);
  o.cocktailStaysUpright = rotOf()===0 && M.pitchHorizontal()===false;

  // Picker built with 3 tiles + persists
  M.sel.display='auto'; M.sel.orient='auto'; M.applyDisplayMode(); await wait(120);
  M.buildSettings();
  o.orientTiles = document.querySelectorAll('#orientPick .opt').length;
  const tiles=[...document.querySelectorAll('#orientPick .opt')];
  tiles[2].click(); await wait(120);          // "Sideways"
  o.pickerSetsSideways = M.sel.orient==='h' && rotOf()===H;

  // Sideways still contains the ball on every field
  let esc=0;
  for (const f of Object.keys(M.FIELDS)){
    M.sel.field=f; M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
    for(let i=0;i<80;i++){ w.ball.vx+=Math.sin(i*1.8)*28; w.ball.vy+=Math.cos(i*2.4)*28; M.step(w);
      if(Math.abs(w.ball.x)>w.bounds.halfW+40||Math.abs(w.ball.y)>w.bounds.halfL+w.bounds.net+40) esc++; }
  }
  o.ballEscapes=esc;

  // Fullscreen API wiring
  o.fsBtnExists = !!document.getElementById('fsBtn');
  o.fsHudBtnExists = !!document.getElementById('fsHudBtn');
  o.fsNotOnYet = M.isFullscreen()===false;
  o.fsLabel = document.getElementById('fsBtn').textContent.includes('Enter');
  o.fsIsFocusable = false;
  M.sel.display='deck'; M.applyDisplayMode(); await wait(200);
  M.setDockCollapsed(false); await wait(120);
  // ⚠️ Display is a PANE of Options now, not a card with an `h2` of its own — so there is
  // no heading in the focus list to click. `openSection` is the one thing that knows how to
  // reach a section wherever it lives, and going through it means this cannot go stale
  // again the next time the menu is rearranged.
  M.openSection('display'); await wait(80);
  o.fsIsFocusable = M.deckFocusables().some(el=>el.id==='fsBtn');
  o.orientFocusable = M.deckFocusables().some(el=>el.closest && el.closest('#orientPick'));
  return o;
});
// ⚠️ **AND A PORTRAIT WINDOW IS LEFT ALONE**, which is the other half of "whichever way
// fills the screen" — a tall court on a tall screen loses by turning, and a build that
// simply always turns would pass every check above. Its own page, because a viewport is
// not something `evaluate` can change.
const pp = await b.newPage({ viewport:{width:390,height:844} });
pp.on('pageerror',e=>errors.push('phone: '+e.message));
await pp.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await pp.goto('file://' + process.cwd() + '/index.html');
await pp.waitForTimeout(600);
const phone = await pp.evaluate(()=>{
  const M=window.__magnet;
  M.sel.display='auto'; M.sel.orient='auto'; M.sel.field='classic'; M.sel.mode='1v1';
  M.applyDisplayMode(); M.startMatch(); M.computeCam();
  return { turned: M.pitchHorizontal(), fits: M.fitsBetterTurned(), rot:+(M.cam.rot||0).toFixed(3) };
});
await pp.close();
r.portraitStaysUpright = phone.turned===false && phone.fits===false && phone.rot===0;
r.phone = phone;
console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.autoDesktopSideways&&r.sidewaysIsBigger&&r.portraitStaysUpright&&r.forcedSideways&&r.seatRotatedLive&&r.deckForcedUpright&&
  r.seatUnrotatedLive&&r.autoDeckSideways&&r.cocktailStaysUpright&&r.orientTiles===3&&
  r.pickerSetsSideways&&r.ballEscapes===0&&r.fsBtnExists&&r.fsHudBtnExists&&r.fsLabel&&
  r.fsIsFocusable&&r.orientFocusable&&errors.length===0;
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
