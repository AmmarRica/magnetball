// Full time: the whistle goes, play eases to a standstill, THEN the result screen.
// Plus the two-column result layout, and the two new menu buttons.
//
// The ramp is driven by loop() off wall-clock — deliberately, since the thing being
// wound down to zero is the rate step() runs at. So this suite drives the real loop
// and measures how far the ball actually travels per unit of real time, rather than
// trusting a counter.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const overlayUp = () => document.getElementById('overlay').classList.contains('show');

  // ---- 1) the wind-down -----------------------------------------------------
  M.sel.mode='2v2'; M.sel.autoReplay=false; M.setMatchSeed(4); M.startMatch();
  const w=M.world; w.state='play'; w.stateT=2;
  w.players.forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; });   // nobody to disturb it
  w.ball.x=0; w.ball.y=0; w.ball.vx=0; w.ball.vy=0;
  o.duration = M.FINAL_SLOW;
  M.endMatch(w);
  o.rampStarted = w.endRamp === 0;
  o.stateOverAtOnce = w.state === 'over';          // no more goals can count
  o.screenNotYet = !overlayUp();                   // ...but the screen waits

  // Sample how far the ball travels in each quarter-second of REAL time. The ball
  // is re-launched at the same speed each sample, so the only thing that can change
  // the distance covered is the rate the sim is being run at.
  const seg = [];
  for (let i=0;i<Math.round(M.FINAL_SLOW*4); i++){
    if (!overlayUp()){ w.ball.x=0; w.ball.y=0; w.ball.vx=6; w.ball.vy=0; }
    const x0 = w.ball.x;
    await wait(250);
    seg.push(+(Math.abs(w.ball.x - x0)).toFixed(2));
  }
  o.segments = seg;
  // Monotone-ish decay to a standstill: the last stretch must be a small fraction of
  // the first, and the ball must actually be stopped by the end.
  // The ball is re-launched at full speed each sample, so the final window can't
  // read exactly zero — it measures the RATE, and that is what has to collapse.
  const peak = Math.max(...seg);
  o.slowsDown = peak > 2 && seg[seg.length-1] < peak * 0.15;
  o.decayIsGradual = seg[Math.floor(seg.length/2)] < peak * 0.9
                  && seg[Math.floor(seg.length/2)] > seg[seg.length-1];
  await wait(700);
  o.screenAfter = overlayUp();
  o.rampCleared = M.world.endRamp == null;
  // Once the screen is up the sim really is stopped, not merely slow.
  w.ball.vx = 9; w.ball.vy = 0; const restX = w.ball.x;
  await wait(400);
  o.stoppedAfterScreen = Math.abs(w.ball.x - restX) < 0.001;

  // ---- 2) two-column result layout -----------------------------------------
  M.setMatchSeed(4); M.startMatch();
  const w2=M.world; w2.state='play'; w2.stateT=2;
  w2.score=[3,1];
  const t0=w2.players.filter(q=>q.team===0), t1=w2.players.filter(q=>q.team===1);
  t0[0].ms.goals=3; t0[0].ms.shots=5; t1[0].ms.saves=4; t1[0].ms.clears=2;
  M.endMatch(w2); M.finishMatch(w2);
  const panels=[...document.querySelectorAll('#ovStats .tpanel')];
  o.panelCount = panels.length;
  o.panelTeams = panels.map(x=>x.dataset.team).join(',');
  // Each panel reads top-down: players, then score, then awards.
  o.orderIsPlayersScoreAwards = panels.every(pan=>{
    const kids=[...pan.children].map(x=>x.className.split(' ')[0]);
    return kids.indexOf('statstbl') < kids.indexOf('tpscore')
        && kids.indexOf('tpscore')  < kids.indexOf('tpawards');
  });
  o.scores = panels.map(x=>x.querySelector('.tpscore').textContent).join('-');
  // Every player sits in their own team's panel, and nowhere else.
  o.playersUnderOwnTeam = panels.every(pan =>
    [...pan.querySelectorAll('.statsrow:not(.shead)')].every(row => row.dataset.team === pan.dataset.team));
  o.rowsPerPanel = panels.map(x=>x.querySelectorAll('.statsrow:not(.shead)').length).join(',');
  // Awards likewise.
  o.awardsUnderOwnTeam = panels.every(pan =>
    [...pan.querySelectorAll('.awrow')].every(row => row.dataset.team === pan.dataset.team));
  o.totalAwards = document.querySelectorAll('#ovStats .awrow').length;
  o.winnerMarked = panels.filter(x=>x.classList.contains('twin')).length === 1 &&
                   panels.find(x=>x.classList.contains('twin')).dataset.team === '0';
  // The numbers still come from the tally.
  const goalsCell = panels[0].querySelector('.statsrow:not(.shead) .snum');
  o.goalsShown = goalsCell && goalsCell.textContent === '3';

  // ---- 3) the two new menu buttons -----------------------------------------
  M.toMenu();
  const wu = document.getElementById('warmupBtn'), lr = document.getElementById('lookReset');
  o.warmupBtnExists = !!wu;
  o.lookResetExists = !!lr;
  // Warm-up must be reachable with the Match section COLLAPSED, like KICK OFF.
  M.collapseAllSections();
  const vis = el => { const r=el.getBoundingClientRect(); return r.width>0 && r.height>0; };
  o.warmupVisibleCollapsed = vis(wu);
  o.warmupOutsideBody = !document.getElementById('matchBody').contains(wu);
  // ...and with NO controller connected it still goes to the lobby (startMatch on
  // its own would not — lobbyWanted is false without pads).
  M.sel.controllers='off'; M.sel.mode='2v2';
  wu.click();
  o.warmupEnters = M.world.state === 'warmup';

  // Reset look: change everything, press it, get the defaults back — live.
  M.toMenu();
  const def = M.defaultProfile();
  Object.assign(M.profile, { name:'Zaphod', color:'#ff00ff', cap:'crown', flag:'poland', eyes:'angry' });
  M.saveProfile();
  o.changedFirst = M.profile.name === 'Zaphod' && M.profile.color === '#ff00ff';
  lr.click();
  o.resetProfile = JSON.stringify(M.profile) === JSON.stringify(def);
  o.resetNameField = document.getElementById('pname').value === def.name;
  o.resetIsLive = (()=>{                       // and it reaches the pitch without a restart
    M.startMatch(); const me = M.world.players.find(q=>q.ctrl==='human1');
    return me && me.color === def.color && me.cap === def.cap && me.flag === def.flag;
  })();
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.rampStarted, 'endMatch did not start the wind-down');
ok(r.stateOverAtOnce, 'the match was still live during the wind-down — a goal could still count');
ok(r.screenNotYet, 'the result screen appeared immediately instead of after the wind-down');
ok(r.slowsDown, `play did not slow down: per-250ms travel was ${JSON.stringify(r.segments)}`);
ok(r.decayIsGradual, `play did not ease down, it cut: ${JSON.stringify(r.segments)}`);
ok(r.stoppedAfterScreen, 'the sim kept running underneath the result screen');
ok(r.screenAfter, 'the result screen never appeared after the wind-down');
ok(r.rampCleared, 'the ramp was left running after the screen appeared');

ok(r.panelCount === 2, `expected two team panels, got ${r.panelCount}`);
ok(r.panelTeams === '0,1', `panels are not team 0 then team 1: ${r.panelTeams}`);
ok(r.orderIsPlayersScoreAwards, 'a panel is not ordered players → score → awards');
ok(r.scores === '3-1', `panel scores do not match the scoreline: ${r.scores}`);
ok(r.playersUnderOwnTeam, `a player is listed under the wrong team panel (rows: ${r.rowsPerPanel})`);
ok(r.rowsPerPanel === '2,2', `expected 2 players a side, got ${r.rowsPerPanel}`);
ok(r.totalAwards > 0, 'no awards rendered, so the grouping check proves nothing');
ok(r.awardsUnderOwnTeam, 'an award is under the wrong team panel');
ok(r.winnerMarked, 'the winning panel is not the one that actually won');
ok(r.goalsShown, 'the goals column does not match the tally');

ok(r.warmupBtnExists, 'no Warm-up button');
ok(r.warmupVisibleCollapsed, 'Warm-up is hidden when the Match section is collapsed');
ok(r.warmupOutsideBody, 'Warm-up is inside the collapsible body, so it disappears when collapsed');
ok(r.warmupEnters, 'Warm-up did not enter the lobby with no controller connected');
ok(r.lookResetExists, 'no Reset look button beside Name');
ok(r.changedFirst, 'the look never changed, so the reset proves nothing');
ok(r.resetProfile, 'Reset look did not restore the default profile');
ok(r.resetNameField, 'Reset look did not update the Name field');
ok(r.resetIsLive, 'Reset look did not reach the pitch');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nmatchend OK');
