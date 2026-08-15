// Cocktail with NO controller connected. The rule is "pads round a table", but
// with zero pads, taking the keyboard away leaves nothing driving the player at
// all — the mode becomes unplayable. This suite deliberately stubs no gamepad.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const o = {};
o.noPadsConnected = await p.evaluate(()=>
  !navigator.getGamepads || [...navigator.getGamepads()].filter(Boolean).length === 0);

// Set up a cocktail match and drive it with the keyboard.
await p.evaluate(()=>{ const M=window.__magnet;
  const d=document.getElementById('dmCollect'); if(d) d.click();
  M.sel.display='cocktail'; M.sel.mode='1v1'; M.sel.controllers='off'; M.applyDisplayMode();
  M.startMatch(); const w=M.world; w.state='play'; w.stateT=1; });
o.hasHumanSeat = await p.evaluate(()=>window.__magnet.world.players.some(q=>q.ctrl!=='bot'));
o.keyboardAllowed = await p.evaluate(()=>window.__magnet.keyboardDrivesGame ? window.__magnet.keyboardDrivesGame() : null);

await p.keyboard.down('ArrowUp');
o.playerMoves = await p.evaluate(()=>{
  const M=window.__magnet, w=M.world, me=w.players.find(q=>q.ctrl!=='bot');
  me.x=0; me.y=60; me.vx=0; me.vy=0;
  // ⚠️ `pollKeys()` explicitly. It used to be called from inside `drawControls`, so a
  // loop of draws was enough to drive the keyboard — but only when a `human1` seat
  // existed, which is exactly why a controller in seat one silently killed the keys. It
  // now runs once per frame in `loop()`, which a synchronous harness has to stand in for.
  for(let i=0;i<30;i++){ M.pollKeys(); M.drawControls(); M.step(w); }
  return Math.hypot(me.vx,me.vy) > 0.3; });
await p.keyboard.up('ArrowUp');

// Space still kicks when the keyboard is the only input available.
await p.keyboard.down('Space');
o.spaceKicks = await p.evaluate(()=>{ const M=window.__magnet; M.pollKeys(); M.drawControls(); return M.pads.p1.kick===true; });
await p.keyboard.up('Space');

// Other layouts unaffected.
await p.evaluate(()=>{ const M=window.__magnet; M.sel.display='auto'; M.applyDisplayMode(); M.saveSel(); });
o.autoStillWorks = await p.evaluate(()=>window.__magnet.keyboardDrivesGame());

console.log(JSON.stringify(o,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = o.noPadsConnected && o.hasHumanSeat && o.keyboardAllowed === true &&
  o.playerMoves && o.spaceKicks && o.autoStillWorks && errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(o).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
