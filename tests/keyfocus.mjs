// Keyboard: Space AND X kick, neither steals a keystroke while you're typing, and
// clicking the pitch hands the arrow keys back to the game instead of leaving a
// focused slider eating them.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const start = () => p.evaluate(()=>{ const M=window.__magnet;
  const d=document.getElementById('dmCollect'); if(d) d.click();
  M.sel.display='auto'; M.sel.mode='1v1'; M.sel.controllers='off'; M.applyDisplayMode();
  M.buildSettings();
  document.querySelectorAll('.card.collapsible').forEach(c=>c.classList.remove('collapsed'));
  window.__magnet.showSubTab('match','players');   // seat names live behind the Players sub-tab
  M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
  M.pads.p1.dx=0; M.pads.p1.dy=0; M.pads.p1.kick=false; });

const o = {};
await start();

// --- Both keys kick
const kicksWith = async (key) => {
  await p.keyboard.down(key);
  const on = await p.evaluate(()=>{ window.__magnet.drawControls(); return window.__magnet.pads.p1.kick===true; });
  await p.keyboard.up(key);
  const off = await p.evaluate(()=>window.__magnet.pads.p1.kick===false);
  return on && off;
};
o.spaceKicks = await kicksWith('Space');
o.xKicks     = await kicksWith('x');
o.capitalXKicks = await kicksWith('X');

// --- Neither steals a keystroke while typing
o.typingKeepsSpace = await (async ()=>{
  await p.evaluate(()=>{ const t=document.getElementById('seatNames'); t.value=''; t.focus(); });
  await p.keyboard.type('a x b');
  const v = await p.evaluate(()=>document.getElementById('seatNames').value);
  const kicked = await p.evaluate(()=>window.__magnet.pads.p1.kick===true);
  await p.evaluate(()=>{ const t=document.getElementById('seatNames'); t.value=''; t.oninput&&t.oninput(); t.blur(); });
  return v === 'a x b' && !kicked;
})();
// ...and arrow keys typed into a field don't drive the player either
o.typingDoesNotSteer = await (async ()=>{
  await p.evaluate(()=>{ const t=document.getElementById('seatNames'); t.focus();
    const M=window.__magnet; M.pads.p1.dx=0; M.pads.p1.dy=0; });
  await p.keyboard.down('ArrowUp');
  const drove = await p.evaluate(()=>{ window.__magnet.drawControls();
    return window.__magnet.pads.p1.dy !== 0; });
  await p.keyboard.up('ArrowUp');
  await p.evaluate(()=>document.getElementById('seatNames').blur());
  return !drove;
})();

// --- A focused slider must not keep the arrow keys once you click the pitch
await start();
o.sliderFocusReleased = await (async ()=>{
  // Focus a Game Feel slider and check it IS focused (or the rest is vacuous)
  await p.evaluate(()=>{
    const inp=document.querySelector('#feelSlidersBall input, #feelSlidersPlayer input');
    inp.focus(); });
  const focusedBefore = await p.evaluate(()=>document.activeElement.tagName === 'INPUT');
  const valBefore = await p.evaluate(()=>+document.querySelector('#feelSlidersBall input, #feelSlidersPlayer input').value);
  // Click the pitch, then press arrows
  await p.evaluate(()=>{ const cv=document.getElementById('game');
    cv.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true})); });
  const focusedAfter = await p.evaluate(()=>document.activeElement.tagName === 'INPUT');
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowRight');
  const valAfter = await p.evaluate(()=>+document.querySelector('#feelSlidersBall input, #feelSlidersPlayer input').value);
  return focusedBefore && !focusedAfter && valAfter === valBefore;
})();
// ...and the arrows drive the player again after that click
o.arrowsDrivePlayer = await (async ()=>{
  await p.keyboard.down('ArrowUp');
  // ⚠️ Poll, don't assume. The keydown is delivered asynchronously, so stepping
  // straight after pressing can read a pad that has not seen it yet — this failed
  // about one run in nine under load, and an extra round trip inserted while
  // debugging made it pass every time, which is the signature of a timing flake
  // rather than a broken feature. pollKeys() runs from drawControls(), so wait for
  // the pad itself to show the key before measuring anything.
  const armed = await p.waitForFunction(()=>{
    window.__magnet.drawControls();
    return window.__magnet.pads.p1.dy < -0.5;
  }, null, { timeout: 3000 }).then(()=>true).catch(()=>false);
  o.arrowsReachedPad = armed;
  const moved = await p.evaluate(()=>{
    const M=window.__magnet, w=M.world, me=w.players.find(q=>q.ctrl==='human1');
    me.x=0; me.y=60; me.vx=0; me.vy=0;
    for(let i=0;i<25;i++){ M.drawControls(); M.step(w); }
    return Math.hypot(me.vx,me.vy) > 0.3; });
  await p.keyboard.up('ArrowUp');
  return armed && moved;
})();

// --- Game Feel is split into ball vs player groups, and nothing went missing
o.groups = await p.evaluate(()=>{
  const M=window.__magnet; M.buildSettings();
  const ball=[...document.querySelectorAll('#feelSlidersBall label')].map(l=>l.textContent.toLowerCase());
  const player=[...document.querySelectorAll('#feelSlidersPlayer label')].map(l=>l.textContent.toLowerCase());
  return { ball, player, subheads:[...document.querySelectorAll('.subhead')].map(s=>s.textContent) };
});
o.ballGroupRight = ['kick power','max ball speed','ball glide','ball magnet','trap window']
  .every(w => o.groups.ball.some(t=>t.includes(w)));
o.playerGroupRight = ['acceleration','float','sensitivity']
  .every(w => o.groups.player.some(t=>t.includes(w)));
o.noneLost = o.groups.ball.length + o.groups.player.length === 8;
o.noCrossover = !o.groups.player.some(t=>t.includes('ball')) &&
                !o.groups.ball.some(t=>t.includes('sensitivity'));
o.hasSubheads = o.groups.subheads.some(t=>/ball controls/i.test(t)) &&
                o.groups.subheads.some(t=>/player controls/i.test(t));

console.log(JSON.stringify(o,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = o.spaceKicks && o.xKicks && o.capitalXKicks && o.typingKeepsSpace &&
  o.typingDoesNotSteer && o.sliderFocusReleased && o.arrowsDrivePlayer &&
  o.ballGroupRight && o.playerGroupRight && o.noneLost && o.noCrossover && o.hasSubheads &&
  errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(o).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
