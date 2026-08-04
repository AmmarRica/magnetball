// Optional rule: KICK stops being ball-only. A wall or a body in range takes the
// hit and you take the reaction — so kicking a wall launches you off it.
// Off by default, because it changes how the game plays.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:700,height:1000} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true; localStorage.clear();});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  o.defaultsOff = M.defaultSel().kickPush === 'off' && M.sel.kickPush !== 'on';

  // applyHumanInput rewrites p.kick every step, so the unit checks drive
  // handleKickPush directly; the end-to-end case below goes through pads.p1.
  const setup=()=>{ M.setMatchSeed(4); M.sel.mode='1v1'; M.startMatch();
    const w=M.world; w.state='play'; w.stateT=1;
    w.players.forEach(q=>{ q.x=9999; q.y=9999; q.vx=q.vy=0; q.kick=false;
      q._pushUsed=false; q._pushCool=0; q.chargeT=0; });
    w.ball.x=9999; w.ball.y=9999; w.ball.vx=0; w.ball.vy=0; return w; };
  const atWall=(on,charge)=>{ M.sel.kickPush=on;
    const w=setup(); const me=w.players[0];
    me.x=w.field.W/2-me.r-2; me.y=0; me.vx=0; me.vy=0; me.kick=true; me.chargeT=charge||0;
    M.handleKickPush(w, me); return +me.vx.toFixed(2); };

  o.offChangesNothing = atWall('off',0) === 0 && atWall('off',M.CHARGE.max) === 0;
  o.onLaunchesOffTheWall = atWall('on',0) < -4;
  o.noCharge = atWall('on',0); o.fullCharge = atWall('on',M.CHARGE.max);
  o.chargeScalesTheLaunch = Math.abs(o.fullCharge) > Math.abs(o.noCharge)*1.5;

  // Every boundary, and always AWAY from the surface.
  M.sel.kickPush='on';
  o.perSide = [[1,0],[-1,0],[0,1],[0,-1]].map(([sx,sy])=>{
    const w=setup(); const me=w.players[0];
    me.x = sx*(w.field.W/2-me.r-2); me.y = sy*(w.field.L/2-me.r-2);
    if (sy) me.x = 120;                       // clear of the goal mouth
    me.vx=0; me.vy=0; me.kick=true;
    M.handleKickPush(w, me);
    return +(-(sx*me.vx + sy*me.vy)).toFixed(2);   // >0 means pushed off that wall
  });
  o.everyWallLaunches = o.perSide.every(v => v > 4);

  // A goal post is a surface too — the most satisfying thing to shove off.
  { const w=setup(); const me=w.players[0]; const post=w.posts[0];
    me.x = post.x + post.r + me.r - 1; me.y = post.y; me.vx=me.vy=0; me.kick=true;
    M.handleKickPush(w, me);
    o.postsLaunchToo = me.vx > 3; }

  // Nothing in range = nothing happens.
  { const w=setup(); const me=w.players[0]; me.x=0; me.y=0; me.vx=me.vy=0; me.kick=true;
    M.handleKickPush(w, me);
    o.emptySpaceDoesNothing = me.vx === 0 && me.vy === 0; }

  // Player vs player: they fly, you take the smaller share back.
  { const w=setup(); const a=w.players[0], q=w.players[1];
    a.x=0; a.y=0; a.vx=a.vy=0; q.x=a.r+q.r+6; q.y=0; q.vx=q.vy=0; a.kick=true;
    M.handleKickPush(w, a);
    o.theyGetPushed = q.vx > 2;
    o.youRecoil = a.vx < -1;
    o.recoilIsSmallerThanTheShove = Math.abs(a.vx) < Math.abs(q.vx);
    o.pushIsAlongTheLine = Math.abs(q.vy) < 0.01 && Math.abs(a.vy) < 0.01; }
  // Out of range, nothing.
  { const w=setup(); const a=w.players[0], q=w.players[1];
    a.x=0; a.y=0; a.vx=a.vy=0; q.x=200; q.y=0; q.vx=0; a.kick=true;
    M.handleKickPush(w, a);
    o.farPlayerUnaffected = q.vx === 0; }

  // One press is one launch, and releasing re-arms it.
  { const w=setup(); const me=w.players[0];
    me.x=w.field.W/2-me.r-2; me.y=0; me.kick=true;
    let fires=0;
    for(let i=0;i<120;i++){ const v0=me.vx; M.handleKickPush(w,me);
      if (me.vx-v0 < -3) fires++; me.vx=0; me.vy=0; }
    o.firesPerHold = fires; o.oneShotPerPress = fires === 1; }
  { const w=setup(); const me=w.players[0];
    me.x=w.field.W/2-me.r-2; me.y=0; me.kick=true; M.handleKickPush(w,me);
    me.vx=0; me.kick=false;
    for(let i=0;i<30;i++) M.handleKickPush(w,me);
    me.kick=true; M.handleKickPush(w,me);
    o.releaseRearms = me.vx < -4; }
  // ...and the cooldown stops a fast tap being a rocket.
  { const w=setup(); const me=w.players[0];
    me.x=w.field.W/2-me.r-2; me.y=0; me.kick=true; M.handleKickPush(w,me);
    me.vx=0; me.kick=false; M.handleKickPush(w,me); me.kick=true; M.handleKickPush(w,me);
    o.cooldownBlocksSpam = me.vx === 0; }

  // Never during the kickoff formation, or after the whistle.
  { const w=setup(); const me=w.players[0];
    me.x=w.field.W/2-me.r-2; me.y=0; me.vx=0; me.kick=true;
    w.state='kickoff'; M.handleKickPush(w,me); o.notAtKickoff = me.vx === 0;
    me._pushUsed=false; me._pushCool=0;
    w.state='over'; M.handleKickPush(w,me); o.notWhenOver = me.vx === 0; }

  // The ball is untouched by this: it has its own kick path.
  { const w=setup(); const me=w.players[0];
    me.x=w.field.W/2-me.r-2; me.y=0; me.kick=true;
    w.ball.x=me.x; w.ball.y=me.y+40; w.ball.vx=0; w.ball.vy=0;
    M.handleKickPush(w, me);
    o.ballNotMovedByPush = w.ball.vx === 0 && w.ball.vy === 0; }

  // End to end: a real KICK press through the input layer, with the setting on.
  { M.sel.kickPush='on'; M.sel.mode='1v1'; M.setMatchSeed(4); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=1;
    const me=w.players.find(q=>q.ctrl==='human1');
    w.players.forEach(q=>{ if(q!==me){ q.x=9999; q.y=9999; } });
    w.ball.x=9999; w.ball.y=9999;
    me.x=w.field.W/2-me.r-2; me.y=0; me.vx=me.vy=0;
    const x0=me.x;
    M.pads.p1.dx=0; M.pads.p1.dy=0; M.pads.p1.kick=true;
    for(let i=0;i<25;i++) M.step(w);
    M.pads.p1.kick=false;
    o.endToEndDx = +(me.x-x0).toFixed(1);
    o.realKickLaunches = o.endToEndDx < -12; }
  // ...and with it off, the same press moves you nowhere.
  { M.sel.kickPush='off'; M.setMatchSeed(4); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=1;
    const me=w.players.find(q=>q.ctrl==='human1');
    w.players.forEach(q=>{ if(q!==me){ q.x=9999; q.y=9999; } });
    w.ball.x=9999; w.ball.y=9999;
    me.x=w.field.W/2-me.r-2; me.y=0; me.vx=me.vy=0;
    const x0=me.x;
    M.pads.p1.dx=0; M.pads.p1.dy=0; M.pads.p1.kick=true;
    for(let i=0;i<25;i++) M.step(w);
    M.pads.p1.kick=false;
    o.offEndToEndDx = +(me.x-x0).toFixed(1);
    o.offStaysPut = Math.abs(o.offEndToEndDx) < 3; }

  // The setting is reachable and it sticks.
  M.buildSettings();
  const tiles=[...document.querySelectorAll('#kickPushPick .opt')];
  o.hasPicker = tiles.length === 2;
  tiles[1].click();
  o.pickerWrites = M.sel.kickPush === 'on';
  o.pickerPersists = (JSON.parse(localStorage.getItem('magnetball.sel')||'{}')).kickPush === 'on';
  [...document.querySelectorAll('#kickPushPick .opt')][0].click();
  o.canTurnBackOff = M.sel.kickPush === 'off';
  return o;
});

console.log(JSON.stringify(r,null,1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const must=['defaultsOff','offChangesNothing','onLaunchesOffTheWall','chargeScalesTheLaunch',
  'everyWallLaunches','postsLaunchToo','emptySpaceDoesNothing','theyGetPushed','youRecoil',
  'recoilIsSmallerThanTheShove','pushIsAlongTheLine','farPlayerUnaffected','oneShotPerPress',
  'releaseRearms','cooldownBlocksSpam','notAtKickoff','notWhenOver','ballNotMovedByPush',
  'realKickLaunches','offStaysPut','hasPicker','pickerWrites','pickerPersists','canTurnBackOff'];
const bad = must.filter(k=>r[k]!==true);
const ok = bad.length===0 && errors.length===0;
if(bad.length) console.log('FAILED:', bad);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
