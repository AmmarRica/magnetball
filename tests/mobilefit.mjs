// Phone framing: the pitch must not sit under the thumbsticks, and must not leave
// a slab of dead space under the HUD. Measured in screen px against the real
// control positions, not eyeballed.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const errors=[];
const measure = async (w, h) => {
  const p = await b.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(600);
  const r = await p.evaluate(()=>{
    const M=window.__magnet;
    const d=document.getElementById('dmCollect'); if(d) d.click();
    M.sel.display='auto'; M.sel.orient='auto'; M.applyDisplayMode();
    M.sel.mode='4v4'; M.sel.field='giant'; M.startMatch();
    const w2=M.world; w2.state='play'; w2.stateT=1; M.computeCam(); M.render();
    const cv=document.getElementById('game'), ch=cv.clientHeight;
    const b2=w2.bounds;
    const joy=M.restingJoyPos(false);           // where the thumb actually rests
    const hud=document.getElementById('hud').getBoundingClientRect();
    return {
      touch: M.isTouchLayout(),
      pitchTop: M.wy(-b2.halfL - b2.net),       // top of the far net
      pitchBottom: M.wy(b2.halfL + b2.net),     // bottom of the near net
      joyTop: joy.jy - 62,                      // JOY_R
      hudBottom: hud.bottom,
      ch,
    };
  });
  await p.close();
  return r;
};

const o = {};
const phone = await measure(420, 900);
const tall  = await measure(400, 1000);
o.phone = phone; o.tall = tall;
o.isTouch = phone.touch && tall.touch;
// 1. Nothing to play with under your thumb: the pitch ends above the joystick.
o.clearsThumbs = phone.pitchBottom <= phone.joyTop + 4 && tall.pitchBottom <= tall.joyTop + 4;
// 2. No slab of nothing under the HUD: the gap is smaller than a goal net is deep.
o.topGapPhone = Math.round(phone.pitchTop - phone.hudBottom);
o.topGapTall  = Math.round(tall.pitchTop - tall.hudBottom);
o.noDeadSpace = o.topGapPhone < 90 && o.topGapTall < 90;
// 3. Nothing is clipped off the top.
o.topVisible = phone.pitchTop > 0 && tall.pitchTop > 0;
// 4. Desktop is untouched — no thumb reservation there.
const desk = await b.newPage({ viewport:{width:1280,height:900} });
await desk.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await desk.goto('file://' + process.cwd() + '/index.html');
await desk.waitForTimeout(600);
o.desktopUntouched = await desk.evaluate(()=>{
  const M=window.__magnet;
  const d=document.getElementById('dmCollect'); if(d) d.click();
  M.sel.mode='4v4'; M.startMatch(); M.computeCam();
  const before=M.cam.oy;
  M.computeCam();
  return !M.isTouchLayout() && M.cam.oy === before; });

console.log(JSON.stringify(o,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = o.isTouch && o.clearsThumbs && o.noDeadSpace && o.topVisible && o.desktopUntouched &&
  errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(o).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
