// One small controller icon per connected pad, bottom-right, going black while any
// button on that pad is held. Verified by sampling the canvas, not by trusting the
// draw call to have happened.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);

const run = async (padCount) => {
  const p = await b.newPage({ viewport:{width:1100,height:900} });
  const errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript((n)=>{
    window.__MAGNETDEBUG=true;
    window.__pads = Array.from({length:n}, () => ({ axes:[0,0,0,0], buttons:new Array(17).fill(false) }));
    navigator.getGamepads = () => window.__pads.map((pd,i)=>({
      index:i, connected:true, id:'fake'+i, mapping:'standard', axes:pd.axes,
      buttons: pd.buttons.map(v=>({pressed:!!v, value:v?1:0})) }));
  }, padCount);
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(900);      // let the SVG load
  const r = await p.evaluate(async ()=>{
    const M=window.__magnet; const o={};
    const d=document.getElementById('dmCollect'); if(d) d.click();
    M.sel.display='auto'; M.sel.mode='1v1'; M.sel.controllers='off'; M.applyDisplayMode();
    M.startMatch(); const w=M.world; w.state='play'; w.stateT=1; M.computeCam();
    // Force the art in BEFORE asserting anything about "nothing drawn" — otherwise
    // a zero-pad run passes merely because the SVG was never fetched, which proves
    // nothing about the guard.
    for (let t=0; t<40 && !M.flairTinted('#ffffff'); t++) await new Promise(r=>setTimeout(r,25));
    o.artLoaded = !!M.flairTinted('#ffffff');
    const cv=document.getElementById('game'), c2=cv.getContext('2d');
    const DPR=cv.width/cv.clientWidth, cw=cv.clientWidth, ch=cv.clientHeight;
    // The strip the flairs live in: bottom-right, above the touch-control floor.
    const strip = () => {
      const size=26, W=(size+7)*4+20, H=size+14;
      const x=Math.round((cw-12-W)*DPR), y=Math.round((ch-12-H-size)*DPR);
      return c2.getImageData(Math.max(0,x), Math.max(0,y), Math.round(W*DPR), Math.round((H+size)*DPR)).data;
    };
    const ink = () => { const d2=strip(); let n=0;
      for(let i=3;i<d2.length;i+=4) if(d2[i]>0) n++; return n; };
    const sig = () => { const d2=strip(); let h=0;
      for(let i=0;i<d2.length;i+=16) h=(h*31 + d2[i]+d2[i+1]*3)|0; return h; };
    // Two different thresholds on purpose. The idle icon is drawn at 50% alpha over
    // a dark pitch (~384 total RGB), so a "is it bright?" test tuned for the pressed
    // chip (~700+) reads it as nothing at all — which is how the first run of this
    // suite claimed the icons were invisible while press/release plainly worked.
    const iconPx = () => { const d2=strip(); let n=0;
      for(let i=0;i<d2.length;i+=4) if(d2[i]+d2[i+1]+d2[i+2] > 280) n++; return n; };
    const chipPx = () => { const d2=strip(); let n=0;
      for(let i=0;i<d2.length;i+=4) if(d2[i]+d2[i+1]+d2[i+2] > 600) n++; return n; };

    M.render();
    o.padCount = M.connectedGamepadIndices().length;
    o.idleIcon = iconPx();
    o.idleChip = chipPx();
    o.idleSig = sig();

    // Press a button on the FIRST pad (skipped entirely with no pads connected)
    if (!window.__pads.length){ o.anyPressedSeesIt=true; o.changesOnPress=true;
      o.pressBrightens=true; o.returnsWhenReleased=true; o.perPadDistinct=true;
      o.pressedChip=0; return o; }
    window.__pads[0].buttons[0] = true;
    o.anyPressedSeesIt = M.padAnyPressed(0) === true;
    M.render();
    o.pressedSig = sig();
    o.pressedChip = chipPx();
    o.changesOnPress = o.pressedSig !== o.idleSig;
    // The lit chip behind a pressed icon is brighter than anything drawn when idle.
    o.pressBrightens = o.pressedChip > o.idleChip;
    window.__pads[0].buttons[0] = false;
    M.render();
    o.returnsWhenReleased = sig() === o.idleSig;

    // A press on a DIFFERENT pad must paint a different icon
    if (window.__pads.length > 1){
      window.__pads[1].buttons[3] = true; M.render();
      o.secondPadSig = sig();
      o.perPadDistinct = o.secondPadSig !== o.pressedSig && o.secondPadSig !== o.idleSig;
      window.__pads[1].buttons[3] = false;
    } else { o.perPadDistinct = true; }

    // The same no-op check must FAIL where a pad exists, or it proves nothing.
    const snapAll = () => { const d2=c2.getImageData(0,0,cv.width,cv.height).data;
      let h=0; for(let i=0;i<d2.length;i+=32) h=(h*31 + d2[i]+d2[i+1]*3+d2[i+2]*7)|0; return h; };
    M.render();
    const b4 = snapAll(); M.drawPadFlairs();
    o.drawPaintsWithPads = snapAll() !== b4;
    o.rawInk = ink();
    return o;
  });
  await p.close();
  return { r, errors };
};

// A real phone with no gamepad stub at all: whatever the browser reports is what
// we get, and nothing may be painted in the flair strip.
const phone = await (async () => {
  const pg = await b.newPage({ viewport:{width:420,height:900}, deviceScaleFactor:2,
                               isMobile:true, hasTouch:true });
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
  await pg.addInitScript(()=>{window.__MAGNETDEBUG=true;});
  await pg.goto('file://' + process.cwd() + '/index.html');
  await pg.waitForTimeout(900);
  const out = await pg.evaluate(async ()=>{
    const M=window.__magnet;
    const d=document.getElementById('dmCollect'); if(d) d.click();
    M.sel.display='auto'; M.sel.mode='1v1'; M.applyDisplayMode();
    M.startMatch(); const w=M.world; w.state='play'; w.stateT=1; M.computeCam();
    for (let t=0; t<40 && !M.flairTinted('#ffffff'); t++) await new Promise(r=>setTimeout(r,25));
    M.render();
    const cv=document.getElementById('game'), c2=cv.getContext('2d');
    // Assert the CLAIM — "it draws nothing" — by calling it and diffing the canvas.
    // Looking for an empty patch of screen instead measures whatever else happens to
    // be there: on a phone this band overlaps the pitch edge and the goal net, which
    // is how the first version of this check reported a flair that was never drawn.
    const snap = () => { const d2=c2.getImageData(0,0,cv.width,cv.height).data;
      let h=0; for(let i=0;i<d2.length;i+=32) h=(h*31 + d2[i]+d2[i+1]*3+d2[i+2]*7)|0; return h; };
    M.render();
    const before = snap();
    M.drawPadFlairs();                       // with no pads this must be a no-op
    const after = snap();
    return { pads:M.connectedGamepadIndices().length, touch:M.isTouchLayout(),
             artReady: !!M.flairTinted('#ffffff'), drawIsNoOp: before === after };
  });
  await pg.close();
  return { out, errs };
})();

const zero = await run(0);
const one  = await run(1);
const four = await run(4);

const o = {
  noPads_nothingDrawn: zero.r.padCount === 0 && zero.r.idleChip === 0,
  // Proven with the art actually loaded, so it isn't a "the SVG never arrived" pass.
  noPads_artWasReady: zero.r.artLoaded === true,
  phone_noPads: phone.out.pads === 0,
  phone_isTouch: phone.out.touch === true,
  phone_artReady: phone.out.artReady === true,
  phone_nothingPainted: phone.out.drawIsNoOp === true,
  noPads_count: zero.r.padCount,
  onePad_art: one.r.artLoaded,
  onePad_count: one.r.padCount === 1,
  onePad_visible: one.r.idleIcon > zero.r.idleIcon,
  onePad_press: one.r.anyPressedSeesIt && one.r.changesOnPress && one.r.pressBrightens,
  onePad_release: one.r.returnsWhenReleased,
  fourPads_count: four.r.padCount === 4,
  fourPads_moreInk: four.r.idleIcon > one.r.idleIcon,
  fourPads_perPad: four.r.perPadDistinct,
  // The no-op check is only meaningful if it can fail — it does, with pads present.
  drawPaintsWhenPadsExist: one.r.drawPaintsWithPads === true,
  errors: [...zero.errors, ...one.errors, ...four.errors].length,
};
console.log(JSON.stringify({ o, phone:phone.out, zero:zero.r, one:one.r, four:four.r }, null, 1));
const ok = o.noPads_nothingDrawn && o.noPads_artWasReady &&
  o.phone_noPads && o.phone_isTouch && o.phone_artReady && o.phone_nothingPainted &&
  o.onePad_art && o.onePad_count && o.onePad_visible &&
  o.onePad_press && o.onePad_release && o.fourPads_count && o.fourPads_moreInk &&
  o.fourPads_perPad && o.drawPaintsWhenPadsExist && o.errors === 0;
if(!ok) console.log('FAILED:', Object.entries(o).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
