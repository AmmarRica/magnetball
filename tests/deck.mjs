import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
// Steam Deck native resolution
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);
const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.display='deck'; M.applyDisplayMode();
  await new Promise(r=>setTimeout(r,120));
  o.isDeck = M.isDeck();
  o.bodyDeck = document.body.classList.contains('deck');
  o.docked = !!document.querySelector('.screen.docked');
  o.panelOpen = document.body.classList.contains('panel-open');

  // Landscape camera: pitch wider than tall on screen
  M.sel.mode='1v1'; M.startMatch();
  await new Promise(r=>setTimeout(r,120));
  const w=M.world; w.state='play'; w.stateT=1;
  o.camRot = +(M.cam.rot||0).toFixed(4);
  o.rotated = Math.abs(M.cam.rot + Math.PI/2) < 0.001;
  // pitch extent on screen after rotation
  const f=w.field, s=M.cam.s;
  const screenW = (f.L + f.net*2)*s, screenH = f.W*s;   // long axis now horizontal
  o.landscape = screenW > screenH;
  o.fitsWidth = screenW <= 1280 + 2;
  o.fitsHeight = screenH <= 800 + 2;
  o.uiPadLeftDuringMatch = M.uiPadLeft;

  // Kicking off now hands the pad to the game and collapses the menu (that was the
  // reported bug). Re-open it explicitly before asserting menu/dock behaviour.
  o.collapsedByStartMatch = M.sel.dockCollapsed===true;
  M.setDockCollapsed(false);
  await new Promise(r=>setTimeout(r,80));
  // Focus ring navigation
  M.deckPaint();
  const n0 = M.deckFocusables().length;
  o.focusables = n0;
  o.hasRingAfterPaint = !!document.querySelector('.deckfocus');
  const first = document.querySelector('.deckfocus');
  M.deckMove(1);
  const second = document.querySelector('.deckfocus');
  o.moveChangesFocus = first !== second && !!second;
  // section jump
  M.deckSection(1);
  o.sectionJumps = document.querySelector('.deckfocus') !== second;

  // Select-toggle behaviour (collapse/expand adjusts pitch width)
  const padBefore = M.uiPadLeft;
  M.setDockCollapsed(true);
  await new Promise(r=>setTimeout(r,60));
  const padAfter = M.uiPadLeft;
  o.collapseFreesPitch = padBefore>0 && padAfter===0;
  o.ringHiddenWhenCollapsed = (M.deckPaint(), !document.querySelector('.deckfocus'));
  M.setDockCollapsed(false);
  await new Promise(r=>setTimeout(r,60));
  o.expandRestores = M.uiPadLeft===padBefore;

  // Ball containment still fine in deck view
  let esc=0;
  for(let i=0;i<200;i++){ w.ball.vx+=Math.sin(i*1.9)*28; w.ball.vy+=Math.cos(i*2.1)*28; M.step(w);
    if(Math.abs(w.ball.x)>w.bounds.halfW+40||Math.abs(w.ball.y)>w.bounds.halfL+w.bounds.net+40) esc++; }
  o.ballEscapes=esc;

  // ⚠️ Leaving the deck layout drops deck's FORCED landscape — which is no longer the
  // same claim as "the pitch is upright", because `orient:'auto'` now turns the pitch on
  // any window a turn fits better on (see tests/orient.mjs). Asked with `orient:'v'`, so
  // the only thing that could still be turning it is deck's forcing.
  M.sel.display='auto'; M.sel.orient='v'; M.applyDisplayMode();
  await new Promise(r=>setTimeout(r,120));
  M.computeCam();
  o.autoRotBack = (M.cam.rot||0)===0;
  M.sel.orient='auto'; M.applyDisplayMode();
  o.bodyDeckOff = !document.body.classList.contains('deck');
  return o;
});
console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,6):'none');
const ok = r.isDeck&&r.bodyDeck&&r.docked&&r.rotated&&r.landscape&&r.fitsWidth&&r.fitsHeight&&
  r.focusables>3&&r.hasRingAfterPaint&&r.moveChangesFocus&&r.collapseFreesPitch&&
  r.ringHiddenWhenCollapsed&&r.expandRestores&&r.ballEscapes===0&&r.autoRotBack&&r.bodyDeckOff&&errors.length===0;
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
