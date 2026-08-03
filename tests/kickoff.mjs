import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:420,height:820}, hasTouch:true, isMobile:true });
const errors=[]; p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(500);
const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.mode='1v1'; M.sel.kickoffRule='on'; M.startMatch();
  const w=M.world;
  o.defaultOn = w.kickoffRule===true;
  o.startsInKickoff = w.state==='kickoff';

  const me=w.players.find(x=>x.ctrl==='human1');
  const foe=w.players.find(x=>x.team===1);

  // 1) DURING kickoff: cannot cross the halfway line
  w.state='kickoff'; w.stateT=0.1;
  me.x=150; me.y=60; me.vx=0; me.vy=0;   // off-centre: clear of the frozen kickoff ball
  M.pads.p1.dx=0; M.pads.p1.dy=-1;
  let minY=1e9;
  for(let i=0;i<100;i++){ M.step(w); if(w.state!=='kickoff') break; if(me.y<minY) minY=me.y; }
  M.pads.p1.dy=0;
  o.blockedDuringKickoff = minY >= -0.5;
  o.minYAtKickoff = +minY.toFixed(2);

  // bots also held during kickoff
  o.foeHeldInOwnHalf = foe.y <= 0.5;

  // 2) AFTER kickoff (state=play): totally free, BOTH ways
  w.state='play'; w.stateT=1;
  me.x=150; me.y=60; me.vx=0; me.vy=0;
  w.ball.x=300; w.ball.y=300;
  M.pads.p1.dy=-1;
  let minY2=1e9;
  for(let i=0;i<200;i++){ M.step(w); if(me.y<minY2) minY2=me.y; }
  M.pads.p1.dy=0;
  o.freeAfterKickoff = minY2 < -200;
  o.minYInPlay = +minY2.toFixed(2);

  // 3) rule no longer depends on possession at all
  o.noPossessionState = typeof w.possTeam === 'undefined';

  // 4) whole-match freedom: run a long match, player roams both halves freely
  let sawOwn=false, sawFar=false;
  w.state='play'; me.x=150; me.y=60; me.vx=0; me.vy=0;
  for(let i=0;i<600;i++){
    M.pads.p1.dy = (i%200<100)? -1 : 1;
    M.step(w);
    if(me.y>20) sawOwn=true;
    if(me.y<-20) sawFar=true;
  }
  M.pads.p1.dy=0;
  o.roamsBothHalves = sawOwn && sawFar;

  // 4b) Carrying the ball inside the centre circle lets you cross — that's the
  //     pocket that makes a backwards pass possible instead of being pinned.
  M.sel.kickoffRule='on'; M.startMatch();
  const wc=M.world; wc.state='kickoff'; wc.stateT=0.1;
  const mec=wc.players.find(x=>x.ctrl==='human1');
  const foec=wc.players.find(x=>x.team===1); foec.x=300; foec.y=300;
  // On the ball, inside the circle -> exempt, and can sit past the line.
  wc.ball.x=0; wc.ball.y=0; wc.ball.vx=0; wc.ball.vy=0;
  mec.x=0; mec.y=-14; mec.vx=0; mec.vy=0;
  o.onBallInCircleExempt = M.kickoffFreePass(wc, mec) === true;
  for(let i=0;i<20;i++) M.step(wc);
  o.onBallCanCross = mec.y < 0.5;
  // Same spot, but the ball is elsewhere -> no exemption, pinned back.
  wc.ball.x=200; wc.ball.y=200;
  mec.x=0; mec.y=-14; mec.vx=0; mec.vy=0;
  o.offBallNoExempt = M.kickoffFreePass(wc, mec) === false;
  for(let i=0;i<20;i++) M.step(wc);
  o.offBallPinned = mec.y >= -0.5;
  // On the ball but OUTSIDE the circle -> still no exemption.
  wc.ball.x=200; wc.ball.y=-14; mec.x=200; mec.y=-14; mec.vx=0; mec.vy=0;
  o.outsideCircleNoExempt = M.kickoffFreePass(wc, mec) === false;

  // 5) rule OFF: free even during kickoff
  M.sel.kickoffRule='off'; M.startMatch();
  const w2=M.world; w2.state='kickoff'; w2.stateT=0.1;
  const me2=w2.players.find(x=>x.ctrl==='human1');
  me2.x=150; me2.y=60; me2.vx=0; me2.vy=0;   // off-centre lane
  M.pads.p1.dy=-1;
  let minY3=1e9;
  for(let i=0;i<100;i++){ M.step(w2); if(w2.state!=='kickoff') break; if(me2.y<minY3) minY3=me2.y; }
  M.pads.p1.dy=0;
  o.freeWhenRuleOff = minY3 < -20;
  void 0;

  // 6) after a goal the hold comes back for the next kickoff, then clears again
  M.sel.kickoffRule='on'; M.startMatch();
  const w3=M.world;
  o.resetHoldsAgain = M.kickoffLineOn(w3);
  w3.state='play';
  o.clearsInPlay = !M.kickoffLineOn(w3);
  return o;
});
console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.defaultOn&&r.startsInKickoff&&r.blockedDuringKickoff&&r.foeHeldInOwnHalf&&
  r.onBallInCircleExempt&&r.onBallCanCross&&r.offBallNoExempt&&r.offBallPinned&&r.outsideCircleNoExempt&&
  r.freeAfterKickoff&&r.noPossessionState&&r.roamsBothHalves&&r.freeWhenRuleOff&&
  r.resetHoldsAgain&&r.clearsInPlay&&errors.length===0;
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
