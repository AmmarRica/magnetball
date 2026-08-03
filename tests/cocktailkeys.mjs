// Cocktail = a screen flat on a table, players stood around it. There is no seat
// "in front of the keyboard", so the keyboard must not drive the game there —
// seat 1 is a controller. Menu keys still have to work.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{
  window.__MAGNETDEBUG=true;
  window.__pad = { axes:[0,0,0,0], buttons:new Array(17).fill(false) };
  navigator.getGamepads = () => [{ index:0, connected:true, id:'fake', mapping:'standard',
    axes: window.__pad.axes, buttons: window.__pad.buttons.map(v=>({pressed:!!v,value:v?1:0})) }];
});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const setup = async (display) => p.evaluate((d)=>{
  const M=window.__magnet;
  M.sel.display=d; M.sel.mode='1v1'; M.sel.controllers='off'; M.applyDisplayMode();
  M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
  M.pads.p1.dx=0; M.pads.p1.dy=0; M.pads.p1.kick=false;
  return true;
}, display);

// Move the player with real key events and see whether the disc actually moves.
// drawControls() is where pollKeys lives, so pump it alongside step() — leaving it
// to the render loop makes this a race, and the race is what a fixed sleep hides.
const keyDrive = async () => {
  await p.keyboard.down('ArrowUp');
  const moved = await p.evaluate(()=>{
    const M=window.__magnet, w=M.world, me=w.players.find(q=>q.ctrl==='human1');
    if (!me) return { moved:false, seatIsHuman:false };
    me.x=0; me.y=60; me.vx=0; me.vy=0;
    for(let i=0;i<25;i++){ M.drawControls(); M.step(w); }
    return { moved: Math.hypot(me.vx,me.vy) > 0.3, seatIsHuman:true, dy: me.y-60 };
  });
  await p.keyboard.up('ArrowUp');
  return moved;
};
const spaceKicks = async () => {
  await p.keyboard.down('Space');
  const r = await p.evaluate(()=>{ const M=window.__magnet;
    M.drawControls && M.drawControls(); return M.pads.p1.kick === true; });
  await p.keyboard.up('Space');
  return r;
};

const o = {};
// --- Auto (normal desktop): keyboard drives the game, as it always has
await setup('auto');
o.autoKeyMoves = (await keyDrive()).moved;
o.autoSpaceKicks = await spaceKicks();

// --- Cocktail: keyboard does nothing to the pitch
await setup('cocktail');
const ck = await keyDrive();
o.cocktailKeyDead = ck.moved === false;
o.cocktailSpaceDead = (await spaceKicks()) === false;
o.pollKeysNoOps = await p.evaluate(()=>{ const M=window.__magnet;
  M.pads.p1.dx=0; M.pads.p1.dy=0;
  M.pollKeys();                       // even called directly it must not write the pad
  return M.pads.p1.dx===0 && M.pads.p1.dy===0; });

// --- ...and seat 1 is a controller there, without touching the toggle
o.controllersToggleStillOff = await p.evaluate(()=>window.__magnet.sel.controllers === 'off');
o.cocktailSeatIsPad = await p.evaluate(()=>{ const M=window.__magnet;
  M.startMatch(); return M.world.players.some(q=>q.ctrl==='gamepad'); });
o.cocktailPadDrives = await p.evaluate(async ()=>{
  const M=window.__magnet, w=M.world; w.state='play'; w.stateT=1;
  const me=w.players.find(q=>q.ctrl==='gamepad'); if(!me) return false;
  me.x=0; me.y=60; me.vx=0; me.vy=0;
  window.__pad.axes[1] = -1;                       // stick up
  for(let i=0;i<25;i++) M.step(w);
  window.__pad.axes[1] = 0;
  return Math.hypot(me.vx,me.vy) > 0.3; });

// --- Menu keys are untouched in cocktail (Escape still closes a sub-page)
o.escapeStillWorks = await (async ()=>{
  await p.evaluate(()=>document.getElementById('drillsBtn').click());
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  return p.evaluate(()=>!document.getElementById('setup').classList.contains('hidden'));
})();

// --- Back to auto: the keyboard comes straight back
await setup('auto');
o.autoRestored = (await keyDrive()).moved;
await p.evaluate(()=>{ const M=window.__magnet; M.sel.display='auto'; M.applyDisplayMode(); M.saveSel(); });

console.log(JSON.stringify(o,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = o.autoKeyMoves && o.autoSpaceKicks && o.cocktailKeyDead && o.cocktailSpaceDead &&
  o.pollKeysNoOps && o.controllersToggleStillOff && o.cocktailSeatIsPad && o.cocktailPadDrives &&
  o.escapeStillWorks && o.autoRestored && errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(o).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
