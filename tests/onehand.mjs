// One-handed: letting go of the movement stick fires a kick.
// Driven through applyHumanInput + handleBallControl rather than step(), so the
// only thing that can move the ball is a kick — a full step lets the player body-
// check it and every reading turns into a pass.
import { chromium, LAUNCH, pinCasualFeel } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);
await pinCasualFeel(p);   // see _browser.mjs — the default ships the Pro preset

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();

  const rig = (oneHand) => {
    M.sel.oneHand=oneHand; M.sel.trapOff=false; M.sel.mode='1v1'; M.sel.controllers='off';
    M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
    const me=w.players.find(q=>q.ctrl==='human1'), ball=w.ball;
    me.x=0; me.y=60; me.vx=me.vy=0; me.faceX=0; me.faceY=-1;
    me.trap=false; me.trapUsed=false; me.tapArmed=false; me.kickUsed=false;
    me._ohArmed=false; me._ohPulse=0; me._ohCool=0;
    const pad={dx:0,dy:0,kick:false,invert:false};
    return {w,me,ball,pad};
  };
  // One tick of input + ball control, with the ball pinned in reach and at rest so
  // each reading is only what THIS tick imparted.
  const tick = (r) => {
    M.applyHumanInput(r.me, r.pad);
    r.ball.x = r.me.x; r.ball.y = r.me.y - (r.me.r + r.ball.r + 4);
    r.ball.vx = 0; r.ball.vy = 0;
    M.handleBallControl(r.w, r.me, r.ball, false);
    return Math.hypot(r.ball.vx, r.ball.vy);
  };
  const run = (r, n) => { let best=0; for(let i=0;i<n;i++) best=Math.max(best, tick(r)); return best; };

  // --- Hold the stick: no kick. Let go: it fires, in the direction you were heading.
  let g = rig(true);
  g.pad.dy = -1;
  o.heldDoesNotFire = run(g, 25) < 0.5;
  const face = { x:g.me.faceX, y:g.me.faceY };
  o.firesForward = face.y < -0.9;
  g.pad.dy = 0;
  o.releaseFires = run(g, 15) > 2;

  // --- Setting off: a release does nothing
  g = rig(false); g.pad.dy=-1; run(g,25); g.pad.dy=0;
  o.offModeSilent = run(g, 15) < 0.5;

  // --- The KICK button still works with one-handed on (additive, not a swap).
  // Tap it: in Trap mode a HELD button traps instead of shooting, so a long press
  // would read as "button broken" when it's working exactly as designed.
  g = rig(true); g.pad.kick=true; run(g, 5); g.pad.kick=false;
  o.kickButtonStillWorks = run(g, 8) > 2;

  // --- A release is a SHOT, never a trap: the pulse is under the tap threshold
  o.pulseUnderTapHold = M.ONEHAND.pulse < M.TAP_HOLD;
  g = rig(true); g.pad.dy=-1; run(g,25); g.pad.dy=0;
  let trapped=false; for(let i=0;i<25;i++){ tick(g); if(g.me.trap) trapped=true; }
  o.releaseNeverTraps = !trapped;

  // --- Jitter guard: wobble under the arm threshold must never fire
  g = rig(true);
  let jit=0;
  for(let i=0;i<60;i++){ g.pad.dy = (i%2) ? -(M.ONEHAND.arm-0.05) : 0; jit=Math.max(jit, tick(g)); }
  o.jitterDoesNotFire = jit < 0.5;

  // --- Cooldown: flicking the stick can't machine-gun. Count shots in 60 ticks of
  // full-throw on/off; the cooldown caps how many releases can register.
  g = rig(true);
  let shots=0;
  for(let i=0;i<60;i++){ g.pad.dy = (i%4<2) ? -1 : 0; if (tick(g) > 2) shots++; }
  o.shotsWhenFlicking = shots;
  o.cooldownLimitsRate = shots > 0 && shots <= 12;

  // --- Toggle is in Game Feel and persists
  M.sel.oneHand=false; M.buildSettings();
  const tiles=()=>[...document.querySelectorAll('#oneHandPick .opt')];
  o.toggleExists = tiles().length === 2;
  tiles()[1].click(); await wait(60);
  o.toggleTurnsOn = M.sel.oneHand === true;
  o.togglePersists = JSON.parse(localStorage.getItem('magnetball.sel')||'{}').oneHand === true;
  tiles()[0].click(); await wait(60);
  o.toggleTurnsOff = M.sel.oneHand === false;

  // --- A whole match still runs clean with it on
  M.sel.oneHand=true; M.startMatch();
  { const w=M.world; w.state='play'; w.stateT=1;
    const pad=M.pads.p1;
    for(let i=0;i<300;i++){ pad.dx = Math.sin(i/9); pad.dy = Math.cos(i/7); M.step(w); }
    pad.dx=0; pad.dy=0;
    o.matchRunsClean = isFinite(w.ball.x) && isFinite(w.ball.y) &&
                       w.players.every(q=>isFinite(q.x)&&isFinite(q.y)); }

  M.sel.oneHand=false; M.saveSel();
  return o;
});

// ⚠️ A SECOND PAGE, phone-sized. The block below drives the REAL touch handlers, and the
// suite above runs at 1280x800 where `isTouchLayout()` is false and `zoneForTouch` never
// returns 'move' — so run there it silently probed nothing at all. One-handed play IS a
// phone control, so this half belongs on a phone.
const p2 = await b.newPage({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
p2.on('pageerror', e => errors.push(e.message));
await p2.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p2.goto('file://' + process.cwd() + '/index.html');
await p2.waitForTimeout(700);
await pinCasualFeel(p2);   // the phone page needs it too — see _browser.mjs
const t = await p2.evaluate(() => {
  const M = window.__magnet, o = {};
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  // --- ⚠️ SWEEPING ACROSS THE CENTRE IS NOT A RELEASE -----------------------
  // The pulse armed and fired off MAGNITUDE alone, so dragging a thumb from one direction
  // to the opposite one — over the middle of the stick, never lifting — passed through the
  // deadzone and fired a shot. Crossing the centre is how you turn round, so this went off
  // constantly. The digital stick made it certain rather than likely (it snaps hard to 0,0
  // below TOUCHDIG.dead) but the analogue one had the same flaw.
  // ⚠️ Driven through the REAL touch handlers. Writing to `pads.p1` directly cannot test
  // this at all: the fix reads whether a FINGER is on the stick (`pad.move.id`), which only
  // onDown/onUp set, so a probe that pokes dx/dy measures the old code path.
  M.sel.oneHand = true; M.sel.touchDigital = 'on';
  M.sel.mode='1v1'; M.sel.lobby='off'; M.setMatchSeed(5); M.startMatch();
  { const w=M.world; w.state='play'; w.stateT=2;
    const me = w.players.find(q=>q.ctrl==='human1');
    const HOME=[330,700];
    o.probeIsOnTheStick = M.zoneForTouch(HOME[0],HOME[1]).kind === 'move';
    const push=(dx,dy)=>{ M.onMove(1,HOME[0]+dx,HOME[1]+dy); M.applyHumanInput(me,M.pads.p1); return me.kick; };
    M.onUp(1); M.onDown(1,HOME[0],HOME[1]);
    for (let i=0;i<6;i++) push(60,0);                       // hold right: armed
    let firedMidSweep = false;
    for (const dx of [40,20,6,0,-6,-20,-40,-60]) if (push(dx,0)) firedMidSweep = true;
    for (let i=0;i<4;i++) if (push(-60,0)) firedMidSweep = true;
    o.sweepDoesNotFire = !firedMidSweep;
    // ...and the thumb really did cross the dead centre, or the sweep proves nothing.
    M.onMove(1,HOME[0],HOME[1]); M.applyHumanInput(me,M.pads.p1);
    o.sweepCrossedTheDeadzone = M.pads.p1.dx === 0 && M.pads.p1.dy === 0;
    // A GENUINE lift still fires — the fix is about what a release IS, not about removing it.
    M.onUp(1);
    let firedOnLift = false;
    for (let i=0;i<4;i++){ M.applyHumanInput(me,M.pads.p1); if (me.kick) firedOnLift = true; }
    o.liftStillFires = firedOnLift;
    // And a CONTROLLER, which has no finger to report, keeps the magnitude rule: a stick
    // springing back to centre is the only release signal there is.
    const pad = { dx:0, dy:0, kick:false, invert:false };
    const q = w.players.find(z=>z.ctrl==='human1');
    q._ohArmed=false; q._ohPulse=0; q._ohCool=0;
    pad.dx=1; for(let i=0;i<4;i++) M.applyHumanInput(q,pad);
    pad.dx=0; let padFired=false;
    for(let i=0;i<4;i++){ M.applyHumanInput(q,pad); if(q.kick) padFired=true; }
    o.padStickStillFires = padFired;
    o.padHasNoFinger = M.padTouchDown(pad) === null;
  }

  return o;
});
Object.assign(r, t);

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.probeIsOnTheStick && r.sweepCrossedTheDeadzone && r.sweepDoesNotFire &&
  r.liftStillFires && r.padStickStillFires && r.padHasNoFinger &&
  r.releaseFires && r.firesForward && r.heldDoesNotFire && r.offModeSilent &&
  r.kickButtonStillWorks && r.pulseUnderTapHold && r.releaseNeverTraps && r.jitterDoesNotFire &&
  r.cooldownLimitsRate && r.toggleExists && r.toggleTurnsOn && r.togglePersists &&
  r.toggleTurnsOff && r.matchRunsClean && errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
