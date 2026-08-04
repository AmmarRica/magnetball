// Killer Queen mode: two balls at once, a very heavy snail that never resets its
// position, a regular ball that keeps playing through goals, and an instant win for
// whoever pushes the snail home.
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
  M.sel.autoReplay=false; M.sel.mode='kq'; M.sel.length='5'; M.sel.kickoffRule='off';
  M.startMatch(); await wait(150);
  const w=M.world;
  const snail = (ww) => (ww.extraBalls||[]).find(b=>b.isSnail);

  // --- Two balls, one of them the snail
  o.twoBalls   = 1 + (w.extraBalls||[]).length === 2;
  o.hasSnail   = !!snail(w);
  o.snailAtCentre = !!snail(w) && snail(w).x===0 && snail(w).y===0;

  // --- The snail is genuinely heavy: same shove moves it far less than the ball
  // Give each the SAME impulse and see how far it carries: the snail's mass and
  // damping should kill it almost immediately.
  const glide = (ball) => {
    w.players.forEach((q,i)=>{ q.x = 900 + i*40; q.y = 900; q.vx=0; q.vy=0; });  // out of the way
    ball.x=0; ball.y=0; ball.vx=0; ball.vy=-12;
    for (let i=0;i<60;i++) M.moveBall(w, ball, w.players);
    return Math.abs(ball.y);
  };
  w.state='play'; w.stateT=1;
  const ballMoved  = glide(w.ball);
  const snailMoved = glide(snail(w));
  o.ballMoved = +ballMoved.toFixed(1);
  o.snailMoved = +snailMoved.toFixed(1);
  o.snailIsHeavier = snailMoved < ballMoved * 0.5;
  o.snailBigger = snail(w).r > w.ball.r;
  o.snailInvMassLower = snail(w).invMass < w.ball.invMass * 0.45;   // still much heavier

  // --- Kickoff must NOT move the snail
  M.startMatch(); await wait(120);
  const sn = snail(M.world);
  sn.x = -180; sn.y = 240;                       // park it somewhere distinctive
  M.resetKickoff(M.world);                        // the normal post-goal reset
  o.snailHoldsPosition = sn.x === -180 && sn.y === 240;
  o.regularBallReset  = M.world.ball.x === 0 && M.world.ball.y === 0;

  // --- A regular goal scores but resets NOTHING (no kickoff, ball stays in play)
  M.startMatch(); await wait(150);
  const w2 = M.world; w2.state='play'; w2.stateT=1;
  const sn2 = snail(w2); sn2.x = 120; sn2.y = -150;
  const keeper = w2.players.map(q=>({q, x:q.x, y:q.y}));
  const halfL = w2.field.L/2;
  w2.ball.x = 0; w2.ball.y = -(halfL - 2); w2.ball.vx = 0; w2.ball.vy = -6;   // into the top goal
  const before = w2.score[0];
  M.checkGoal(w2);
  o.regularGoalScored = w2.score[0] === before + 1;
  o.noKickoffState    = w2.state === 'play';                 // play continues
  // Re-serves at the CENTRE spot (it used to reappear on the goal line it entered).
  o.ballBackInPlay    = Math.abs(w2.ball.y) < halfL;
  o.ballReturnsToCentre = Math.hypot(w2.ball.x, w2.ball.y) < w2.ball.r + 40;
  o.ballNotOnGoalLine  = Math.abs(w2.ball.y) < halfL * 0.5;
  o.ballClearOfSnail   = (()=>{ const sn=snail(w2); if(!sn) return true;
    return Math.hypot(w2.ball.x-sn.x, w2.ball.y-sn.y) >= w2.ball.r + sn.r; })();
  o.playersNotReset   = keeper.every(k => k.q.x === k.x && k.q.y === k.y);
  o.snailUntouched    = sn2.x === 120 && sn2.y === -150;

  // ...and it cannot score again while sitting in the mouth
  const after = w2.score[0];
  for (let i=0;i<3;i++) M.checkGoal(w2);
  o.noDoubleScore = w2.score[0] === after;

  // --- Snail home ends the match outright, even when losing on goals
  M.startMatch(); await wait(150);
  const w3 = M.world; w3.state='play'; w3.stateT=1;
  w3.score[0] = 0; w3.score[1] = 5;              // team 0 is losing badly
  const sn3 = snail(w3);
  sn3.x = 0; sn3.y = -(w3.field.L/2 - 2); sn3.vx = 0; sn3.vy = -4;   // team 0 pushes it home
  M.checkGoal(w3);
  o.snailForcesWin = w3.forceWin === 0;
  o.snailFroze     = w3.state === 'goal';
  await wait(1700);                               // endMatch fires on a timer
  o.matchOver      = M.world.state === 'over';
  const title = document.getElementById('ovTitle');
  o.snailTitle = !!title && /SNAIL/i.test(title.textContent);
  o.snailWinRecorded = M.stats.wins > 0;          // counted as a win despite 0-5

  // --- Containment still holds with a snail on the pitch
  M.startMatch(); await wait(150);
  const w4 = M.world; w4.state='play'; w4.stateT=1;
  let esc = 0;
  for (let i=0;i<300;i++){
    w4.ball.vx += Math.sin(i*1.7)*26; w4.ball.vy += Math.cos(i*2.3)*26;
    const s4 = snail(w4); s4.vx += Math.sin(i*1.1)*18; s4.vy += Math.cos(i*1.9)*18;
    M.step(w4);
    for (const bl of [w4.ball, ...(w4.extraBalls||[])]){
      if (!isFinite(bl.x) || !isFinite(bl.y)) esc++;
      if (Math.abs(bl.x) > w4.bounds.halfW + 40 ||
          Math.abs(bl.y) > w4.bounds.halfL + w4.bounds.net + 40) esc++;
    }
  }
  o.ballEscapes = esc;

  M.sel.mode='1v1';
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.twoBalls && r.hasSnail && r.snailAtCentre && r.snailIsHeavier && r.snailBigger &&
  r.snailInvMassLower &&
  r.snailHoldsPosition && r.regularBallReset &&
  r.regularGoalScored && r.noKickoffState && r.ballBackInPlay &&
  r.ballReturnsToCentre && r.ballNotOnGoalLine && r.ballClearOfSnail &&
  r.playersNotReset && r.snailUntouched && r.noDoubleScore &&
  r.snailForcesWin && r.snailFroze && r.matchOver && r.snailTitle && r.snailWinRecorded &&
  r.ballEscapes === 0 && errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
