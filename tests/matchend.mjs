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

  // ---- 0) full time has its OWN whistle: the progressive triple -------------
  // A match doesn't end the way it starts. Kickoff is a single peep; full time is
  // BEE - BEE - BEEEEP: two short blasts and a long one that fades away.
  //
  // The SFX closures call Aud.tone/Aud.noise as PROPERTIES of the exported Aud
  // object, so patching the methods intercepts the real scheduled notes — no need
  // to parse source text for durations.
  // ⚠️ playSfx() is silent while `world` is the idle demo, which it is on load. Start
  // a real match FIRST or every one of these reads zero and passes for nothing.
  M.sel.mode='1v1'; M.sel.autoReplay=false; M.startMatch();
  M.world.state='play'; M.world.stateT=2;
  M.sel.snd.muted = false;
  const log=[]; const realTone=M.Aud.tone, realNoise=M.Aud.noise;
  M.Aud.tone  = (f,dur,type,opt)=>log.push({k:'tone', f, dur, delay:(opt&&opt.delay)||0, to:(opt&&opt.to)||null});
  M.Aud.noise = (dur,opt)=>log.push({k:'noise', dur, delay:(opt&&opt.delay)||0});

  o.hasFullTimeCategory = Array.isArray(M.SFX.fulltime) && M.SFX.fulltime.length >= 3;
  o.fullTimeLabelled = (M.SFX_LABELS.fulltime||[]).length === M.SFX.fulltime.length;
  o.fullTimeInSoundCard = M.SFX_CATS.some(c=>c[0]==='fulltime');

  // The default full-time sound, blast by blast.
  M.sel.snd.fulltime = 0; log.length = 0; M.playSfx('fulltime');
  const blasts = log.slice().sort((a,b)=>a.delay-b.delay);
  o.blastCount = blasts.length;
  o.blasts = blasts.map(x=>({ dur:+x.dur.toFixed(3), at:+x.delay.toFixed(3), f:x.f, to:x.to }));
  o.isTriple = blasts.length === 3;
  // Short - Short - LONG. The last must be clearly longer, not marginally.
  o.shortShortLong = o.isTriple &&
    Math.abs(o.blasts[0].dur - o.blasts[1].dur) < 0.05 &&
    o.blasts[2].dur > o.blasts[0].dur * 3;
  // ...and they are three SEPARATE blasts, not one run-on tone.
  o.separated = o.isTriple &&
    o.blasts[1].at > o.blasts[0].at + o.blasts[0].dur &&
    o.blasts[2].at > o.blasts[1].at + o.blasts[1].dur;
  // The long one glides to a different pitch (the fading BEEEEP), the shorts don't.
  o.lastNoteGlides = o.isTriple && !!o.blasts[2].to && o.blasts[2].to !== o.blasts[2].f;
  o.wholeThingFits = o.isTriple && (o.blasts[2].at + o.blasts[2].dur) < M.FINAL_SLOW;

  // It is NOT the kickoff whistle.
  log.length = 0; M.sel.snd.whistle = 0; M.playSfx('whistle');
  const kick = log.slice();
  o.kickoffBlasts = kick.length;
  o.differsFromKickoff = JSON.stringify(kick.map(x=>[x.dur,x.delay])) !==
                         JSON.stringify(blasts.map(x=>[x.dur,x.delay]));
  o.kickoffIsShorter = Math.max(...kick.map(x=>x.delay+x.dur)) <
                       Math.max(...blasts.map(x=>x.delay+x.dur));

  // Every full-time variant is a real sound, and every themed set names one.
  const bad=[];
  for (let i=0;i<M.SFX.fulltime.length;i++){
    log.length=0;
    try { M.sel.snd.fulltime=i; M.playSfx('fulltime'); } catch(e){ bad.push(i+': '+e.message); continue; }
    if (!log.length) bad.push(i+': silent');
  }
  o.variantsBad = bad;
  o.everySetEndsItsOwnMatch = Object.entries(M.SFX_SETS).every(([k,v]) =>
    v.pick.fulltime != null && M.SFX.fulltime[v.pick.fulltime] && M.SFX_LABELS.fulltime[v.pick.fulltime]);

  // ---- and endMatch actually blows THAT whistle ----------------------------
  M.sel.snd.fulltime = 0;
  M.sel.mode='1v1'; M.startMatch();
  const ew = M.world; ew.state='play'; ew.stateT=2;
  log.length = 0;
  M.endMatch(ew);
  const atEnd = log.slice().sort((a,b)=>a.delay-b.delay);
  o.endMatchBlasts = atEnd.length;
  o.endMatchIsTheTriple = atEnd.length === 3 && atEnd[2].dur > atEnd[0].dur * 3;
  M.Aud.tone = realTone; M.Aud.noise = realNoise;
  M.finishMatch(ew);

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

ok(r.hasFullTimeCategory, 'full time has no sound category of its own');
ok(r.fullTimeLabelled, 'a full-time variant has no label, so it cannot be picked');
ok(r.fullTimeInSoundCard, 'full time is not listed in the Sound card');
ok(r.isTriple, `the full-time whistle is ${r.blastCount} blasts, not three: ${JSON.stringify(r.blasts)}`);
ok(r.shortShortLong, `not short-short-LONG: ${JSON.stringify(r.blasts)}`);
ok(r.separated, `the three blasts overlap into one run-on tone: ${JSON.stringify(r.blasts)}`);
ok(r.lastNoteGlides, `the final blast does not glide, so it is a flat beep not a BEEEEP: ${JSON.stringify(r.blasts)}`);
ok(r.wholeThingFits, `the whistle outlasts the ${r.duration}s wind-down: ${JSON.stringify(r.blasts)}`);
ok(r.kickoffBlasts > 0, 'the kickoff whistle scheduled nothing, so the comparison proves nothing');
ok(r.differsFromKickoff, 'full time plays the same sound as kickoff');
ok(r.kickoffIsShorter, 'the kickoff whistle is not shorter than full time');
ok(r.variantsBad.length === 0, `a full-time variant is silent or throws: ${JSON.stringify(r.variantsBad)}`);
ok(r.everySetEndsItsOwnMatch, 'a themed sound set does not name a full-time whistle');
ok(r.endMatchBlasts > 0, 'endMatch scheduled no sound at all');
ok(r.endMatchIsTheTriple, `endMatch did not blow the triple: ${r.endMatchBlasts} blasts`);
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
