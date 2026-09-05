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
  // The circle is the gate: standing in it is enough, with or without the ball —
  // but only for the side actually KICKING OFF. (Both rules changed on purpose at
  // different times, so these assertions were rewritten rather than the code bent
  // back to fit them.)
  // ⚠️ w.kickTeam is what says who that is. It was written on every goal and read by
  // nothing, so the gate stood open to both teams and the kickoff was a race for a
  // loose ball — which in practice the same side won every time.
  wc.kickTeam = mec.team;
  wc.ball.x=0; wc.ball.y=0; wc.ball.vx=0; wc.ball.vy=0;
  mec.x=0; mec.y=-14; mec.vx=0; mec.vy=0;
  o.onBallInCircleExempt = M.kickoffFreePass(wc, mec) === true;
  for(let i=0;i<20;i++) M.step(wc);
  o.onBallCanCross = mec.y < 0.5;
  // Same spot, ball far away -> still exempt, because you're in the circle.
  wc.ball.x=200; wc.ball.y=200;
  mec.x=0; mec.y=-14; mec.vx=0; mec.vy=0;
  o.offBallInCircleExempt = M.kickoffFreePass(wc, mec) === true;
  for(let i=0;i<20;i++) M.step(wc);
  o.offBallCanCross = mec.y < 0.5;
  // ...and the OTHER side gets nothing from the same spot. This is the whole point of
  // a kickoff: one team restarts play, the other waits.
  const otherc = wc.players.find(x=>x.team !== mec.team);
  // ⚠️ Own half is +y for team 0 and -y for team 1, so "held back" is signed. The
  // first version asserted `y > 0` for a team-1 body, which is the half it was being
  // pushed OUT of — it read the shove working as the shove failing.
  const own = otherc.team === 0 ? 1 : -1;
  otherc.x=0; otherc.y=-own*14; otherc.vx=0; otherc.vy=0;   // 14 units the wrong side
  o.otherSideNotExempt = M.kickoffFreePass(wc, otherc) === false;
  for(let i=0;i<20;i++) M.step(wc);
  o.otherSideY = Math.round(own * otherc.y * 10) / 10;
  o.otherSideHeldBack = o.otherSideY > -14;      // driven back toward its own half
  // ...and it swaps with the restart, so conceding really does hand the ball over.
  wc.kickTeam = otherc.team;
  o.gateFollowsKickTeam = M.kickoffFreePass(wc, mec) === false &&
                          M.kickoffFreePass(wc, { team: otherc.team, x:0, y:0, r:15 }) === true;
  wc.kickTeam = mec.team;
  // Outside the circle -> no exemption, ball or not.
  wc.ball.x=200; wc.ball.y=-14; mec.x=200; mec.y=-14; mec.vx=0; mec.vy=0;
  o.outsideCircleNoExempt = M.kickoffFreePass(wc, mec) === false;
  // ...and you get SHOVED back rather than stopped dead: drive hard into the far
  // half from outside the circle and you end up heading home again, never further
  // than the backstop.
  mec.x=260; mec.y=-2; mec.vx=0; mec.vy=-6;
  let worst=0;
  for(let i=0;i<40;i++){ M.step(wc); worst=Math.min(worst, mec.y); }
  o.pushedBackDeepest = Math.round(worst*10)/10;
  o.neverPastBackstop = worst > -(M.KICKOFF_HARD || 30);
  o.turnedAround = mec.vy > 0;                       // moving back toward own half
  o.endsInOwnHalf = mec.y > worst;

  // 4c) THE SIDE THAT SCORED MAY NOT PLAY THE RESTART.
  // ⚠️ THE CIRCLE STRADDLES THE HALFWAY LINE, so the half-line rule above does NOT keep
  // the wrong side out of it — half the circle is in each half and the ball sits at the
  // centre of both. Measured on the build before this: the scoring side stood at y = 21.7,
  // inside the 58-unit circle and 25 units from a ball whose touch reach is 26.5, and
  // started the match itself on the VERY FIRST STEP of the restart.
  // ⚠️ Placed in its OWN half deliberately — that is the spot the old rule called legal,
  // and a probe that puts the body over the line instead is testing the half-line rule
  // that already worked.
  const koTouch = (kickTeam) => {
    M.sel.kickoffRule='on'; M.startMatch();
    const wk = M.world; wk.state='kickoff'; wk.stateT=0.6;
    const hum = wk.players.find(x=>x.ctrl==='human1');
    wk.kickTeam = kickTeam === 'me' ? hum.team : (hum.team===0?1:0);
    for (const q of wk.players) if (q!==hum){ q.x=0; q.y=q.team===0?300:-300; q.vx=q.vy=0; }
    wk.ball.x=0; wk.ball.y=0; wk.ball.vx=wk.ball.vy=0;
    const own = hum.team === 0 ? 1 : -1;
    hum.x=0; hum.y=own*20; hum.vx=hum.vy=0; hum._px=hum.x; hum._py=hum.y;
    let started=false;
    for(let i=0;i<40;i++){ hum.vx=hum.vy=0; M.step(wk); if(wk.state!=='kickoff'){ started=true; break; } }
    return { started, dist:+Math.hypot(wk.ball.x-hum.x, wk.ball.y-hum.y).toFixed(1),
             fromCentre:+Math.hypot(hum.x,hum.y).toFixed(1) };
  };
  const scored = koTouch('them');            // the OTHER side kicks off, i.e. we scored
  o.scorerCannotStart = scored.started === false;
  o.scorerPushedOff   = scored.dist > (15 + wc.ball.r + M.KICKOFF_TOUCH);
  o.scorerDist = scored.dist; o.scorerFromCentre = scored.fromCentre;
  // ⚠️ THE CONTROL, and it is the load-bearing half: "the scorer cannot start play" is
  // equally true of a build where NOBODY can, which would hang every restart until the
  // six-second timeout. The side that conceded must still be able to walk onto the ball
  // and go — which is what the restart IS.
  const kicks = koTouch('me');
  o.kickerCanStart = kicks.started === true;
  // ⚠️ THE TEAM GATE ON ITS OWN. The ejection and the gate are belt and braces, so with
  // both in place a sabotage of EITHER passes every check above — the other one covers it.
  // This is the case the gate exists for and the geometry cannot reach: the backstop holds
  // a body at `CENTER_R + r - KICKOFF_HARD` = 43, which beats a 26.5 touch reach only
  // while the ball is its normal size. Blow the ball up — which a party modifier really
  // does — and 43 is inside the reach, and nothing but the team check is left.
  {
    M.sel.kickoffRule='on'; M.startMatch();
    const wb = M.world; wb.state='kickoff'; wb.stateT=0.6;
    const hum = wb.players.find(x=>x.ctrl==='human1');
    wb.kickTeam = hum.team===0?1:0;                       // we scored; they restart
    for (const q of wb.players) if (q!==hum){ q.x=0; q.y=q.team===0?300:-300; q.vx=q.vy=0; }
    wb.ball.r = 40;                                       // touch reach 56.5, past the backstop
    wb.ball.x=0; wb.ball.y=0; wb.ball.vx=wb.ball.vy=0;
    const own = hum.team===0?1:-1;
    hum.x=0; hum.y=own*20; hum.vx=hum.vy=0; hum._px=hum.x; hum._py=hum.y;
    let started=false;
    for(let i=0;i<40;i++){ hum.vx=hum.vy=0; M.step(wb); if(wb.state!=='kickoff'){ started=true; break; } }
    o.bigBallReach = +(hum.r + wb.ball.r + M.KICKOFF_TOUCH).toFixed(1);
    o.bigBallDist  = +Math.hypot(wb.ball.x-hum.x, wb.ball.y-hum.y).toFixed(1);
    o.gateHoldsWhenGeometryCannot = !started && o.bigBallDist < o.bigBallReach;
  }

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
  r.onBallInCircleExempt&&r.onBallCanCross&&r.offBallInCircleExempt&&r.offBallCanCross&&
  r.otherSideNotExempt&&r.otherSideHeldBack&&r.gateFollowsKickTeam&&
  r.scorerCannotStart&&r.scorerPushedOff&&r.kickerCanStart&&r.gateHoldsWhenGeometryCannot&&
  r.outsideCircleNoExempt&&r.neverPastBackstop&&r.turnedAround&&r.endsInOwnHalf&&
  r.freeAfterKickoff&&r.noPossessionState&&r.roamsBothHalves&&r.freeWhenRuleOff&&
  r.resetHoldsAgain&&r.clearsInPlay&&errors.length===0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
