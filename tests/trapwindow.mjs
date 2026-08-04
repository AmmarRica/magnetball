// The Trap window slider must change how long the ball actually sticks — measured
// by holding KICK and counting steps until the trap releases, not by reading sel.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();

  // Hold KICK on the ball and count the steps the trap survives. applyHumanInput
  // rewrites p.kick from the pad every step, so drive handleBallControl directly.
  const carryFrames = (trapCs) => {
    M.sel.trapOff=false; M.sel.feel.trap=trapCs; M.sel.mode='1v1';
    M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
    M.applyFeel();
    const me=w.players[0], ball=w.ball;
    me.x=0; me.y=40; me.vx=me.vy=0; me.faceX=0; me.faceY=-1;
    ball.x=0; ball.y=40-(me.r+ball.r+4); ball.vx=ball.vy=0;
    me.kick=true; me.trap=false; me.trapUsed=false; me.tapArmed=false; me.chargeT=0;
    let f=0, trapped=false;
    for (; f<400; f++){
      M.handleBallControl(w, me, ball, false);
      if (me.trap) trapped=true;
      else if (trapped) break;               // released
      ball.x = me.x; ball.y = me.y-(me.r+ball.r+4);   // stay in reach while held
    }
    return { frames:f, trapped, applied:w.trapMax };
  };

  const short = carryFrames(20), long = carryFrames(120);
  o.shortTrapped = short.trapped; o.longTrapped = long.trapped;
  o.shortApplied = short.applied; o.longApplied = long.applied;
  o.appliedFromSlider = Math.abs(short.applied-0.2) < 1e-6 && Math.abs(long.applied-1.2) < 1e-6;
  o.shortFrames = short.frames; o.longFrames = long.frames;
  o.longerWindowHoldsLonger = long.frames > short.frames * 2;
  // 60fps: 0.20s ≈ 12 frames + the 0.14s tap arm ≈ 8 → ~21; 1.20s ≈ 72 + 8 → ~81.
  o.shortNearExpected = Math.abs(short.frames - 21) <= 4;
  o.longNearExpected  = Math.abs(long.frames  - 81) <= 4;

  // --- The slider exists in Game Feel and writes sel.feel.trap
  M.buildSettings();
  const labels=[...document.querySelectorAll('#feelSlidersBall label, #feelSlidersPlayer label')].map(l=>l.textContent);
  o.sliderPresent = labels.some(t=>/trap window/i.test(t));
  const idx = labels.findIndex(t=>/trap window/i.test(t));
  const inputs=[...document.querySelectorAll('#feelSlidersBall input, #feelSlidersPlayer input')];
  const inp=inputs[idx];
  inp.value = 75; inp.oninput();
  o.sliderWrites = M.sel.feel.trap === 75;
  o.sliderAppliesLive = Math.abs(M.world.trapMax - 0.75) < 1e-6;
  o.sliderPersists = (JSON.parse(localStorage.getItem('magnetball.sel')||'{}').feel||{}).trap === 75;

  // --- Reset and both presets leave a sane window
  document.getElementById('feelReset').click(); await wait(60);
  o.resetRestores = M.sel.feel.trap === 50;
  M.applyPreset('casual'); o.casualTrap = M.sel.feel.trap;
  M.applyPreset('pro');    o.proTrap = M.sel.feel.trap;
  o.presetsKeepWindow = o.casualTrap === 50 && o.proTrap === 50;
  // The window is part of the preset: Casual reads as matched, and nudging the
  // window alone drops it. Check the positive first or the negative is vacuous.
  const casualLit = () => [...document.querySelectorAll('#feelPresets .opt')]
      .some(t=>t.classList.contains('sel') && /casual/i.test(t.textContent));
  M.applyPreset('casual'); M.buildSettings();
  o.casualLitWhenMatched = casualLit();
  M.sel.feel.trap = 90; M.buildSettings();
  o.customBreaksCasualMatch = !casualLit();

  // --- Drills honour it too
  M.sel.feel.trap = 110; M.startDrill('straight_up'); await wait(150);
  o.drillGetsWindow = Math.abs(M.world.trapMax - 1.10) < 1e-6;

  // --- One-touch ignores the window entirely (no trap at all)
  M.sel.trapOff=true; M.sel.feel.trap=120; M.sel.mode='1v1'; M.startMatch();
  const w2=M.world; w2.state='play'; w2.stateT=1;
  const me2=w2.players[0], b2=w2.ball;
  me2.x=0; me2.y=40; me2.faceX=0; me2.faceY=-1; me2.vx=me2.vy=0;
  b2.x=0; b2.y=40-(me2.r+b2.r+4); b2.vx=b2.vy=0;
  me2.kick=true; me2.kickUsed=false;
  for(let i=0;i<40;i++) M.handleBallControl(w2, me2, b2, false);
  o.oneTouchNeverTraps = !me2.trap;
  o.oneTouchStillKicks = Math.hypot(b2.vx,b2.vy) > 1;

  M.sel.trapOff=false; M.sel.feel.trap=50; M.saveSel();
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.shortTrapped && r.longTrapped && r.appliedFromSlider && r.longerWindowHoldsLonger &&
  r.shortNearExpected && r.longNearExpected &&
  r.sliderPresent && r.sliderWrites && r.sliderAppliesLive && r.sliderPersists &&
  r.resetRestores && r.presetsKeepWindow && r.casualLitWhenMatched && r.customBreaksCasualMatch &&
  r.drillGetsWindow &&
  r.oneTouchNeverTraps && r.oneTouchStillKicks && errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
