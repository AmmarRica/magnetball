// Hit stop: its own slider, and a freeze-frame that only pays out on a first-touch
// shot the game has actually checked is going in.
//
// The load-bearing assertion is that predictsGoal() cannot disturb the match. It
// re-uses the real moveBall/collide*, and collideDiscs writes to BOTH bodies — so
// predicting on the live players would shove them around every time anyone kicked.
// A whole-world diff catches that; nothing smaller would.
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

  // ---- the control exists, writes and persists ----------------------------
  const el = document.getElementById('hitStop');
  o.sliderExists = !!el && el.type === 'range';
  o.sliderRange = el ? [ +el.min, +el.max ] : null;
  o.defaultFrames = M.hitStopFrames();
  if (el){
    el.value = 9; el.dispatchEvent(new Event('input'));
    o.writes = M.sel.hitStop === 9 && M.hitStopFrames() === 9;
    o.persists = JSON.parse(localStorage.getItem('magnetball.sel')||'{}').hitStop === 9;
    o.labelShows = (document.getElementById('hitStopVal')||{}).textContent || '';
    el.value = 0; el.dispatchEvent(new Event('input'));
    o.zeroLabel = (document.getElementById('hitStopVal')||{}).textContent || '';
  }
  // Separate from the shake toggle: turning effects off must not turn this off.
  M.sel.hitStop = 7; M.sel.juice = false;
  o.independentOfJuice = M.hitStopFrames() === 7;
  M.sel.juice = true;

  // ---- a shot on target vs everything else --------------------------------
  // Set up by hand rather than by playing: a scripted shot is the only way to
  // control what the prediction is being asked about.
  const shot = (bx, by, vx, vy, team) => {
    M.sel.mode='1v1'; M.setMatchSeed(3); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2;
    w.players.forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; });   // nobody in the way
    w.ball.x=bx; w.ball.y=by; w.ball.vx=vx; w.ball.vy=vy;
    return { w, hit: M.predictsGoal(w, w.ball, team) };
  };
  const halfL = M.world.field.L/2;
  // Team 0 attacks the top goal (negative y).
  o.onTarget    = shot(0,   60, 0,   -22, 0).hit;     // straight down the middle
  o.wide        = shot(0,   60, 14,  -22, 0).hit;     // drifting off the frame
  o.backwards   = shot(0,   60, 0,    22, 0).hit;     // at your own goal
  o.tooSoft     = shot(0,   60, 0,   -2.0, 0).hit;    // a nudge, not a shot
  // Fast enough to count as a shot (>minSpeed) but the ball damps 0.99/step, so
  // 3.2 can only ever cover 320 of the 380 units to the line.
  o.dyingShot   = shot(0,    0, 0,   -3.2, 0).hit;
  o.otherTeam   = shot(0,   60, 0,   -22, 1).hit;     // same ball, wrong attacker
  // A body on the ball's path blocks it. Checked against the real sim below, so
  // this isn't taking the predictor's word for it.
  const blocked = (()=>{
    M.sel.mode='1v1'; M.setMatchSeed(3); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2;
    w.players.forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; });
    const keeper = w.players[0];
    keeper.x = 0; keeper.y = -300; keeper.vx = 0; keeper.vy = 0;
    w.ball.x=0; w.ball.y=60; w.ball.vx=0; w.ball.vy=-22;
    const pred = M.predictsGoal(w, w.ball, 0);
    for (let i=0;i<M.HITSTOP.lookahead;i++) M.moveBall(w, w.ball, w.players);
    const reallyScored = w.ball.y < -halfL + w.ball.r*0.4;
    return { pred, reallyScored };
  })();
  o.blockedByKeeper = blocked.pred;
  o.blockedReally   = blocked.reallyScored;

  // ---- the prediction must not move anything ------------------------------
  // Full snapshot of every player and ball field, before and after.
  const snap = w => JSON.stringify({
    players: w.players.map(q=>Object.keys(q).sort().filter(k=>typeof q[k]!=='object'&&typeof q[k]!=='function').map(k=>[k,q[k]])),
    ball: Object.keys(w.ball).sort().filter(k=>typeof w.ball[k]!=='object'&&typeof w.ball[k]!=='function').map(k=>[k,w.ball[k]]),
    posts: w.posts.map(q=>[q.x,q.y,q.vx,q.vy]),
    score: [w.score0, w.score1], matchT: w.matchT, state: w.state,
  });
  {
    M.sel.mode='4v4'; M.setMatchSeed(3); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2;
    for (let i=0;i<40;i++) M.step(w);                 // a real, messy position
    w.ball.vx = 3; w.ball.vy = -24;
    const before = snap(w);
    const hits = [];
    for (let i=0;i<25;i++) hits.push(M.predictsGoal(w, w.ball, 0));
    o.predictionInert = snap(w) === before;
    // ...and it must give the same answer every time it's asked.
    o.predictionStable = new Set(hits).size === 1;
  }

  // ---- deterministic across identical matches -----------------------------
  const trace = () => {
    M.sel.mode='2v2'; M.setMatchSeed(99); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2;
    const out=[];
    for (let i=0;i<200;i++){ M.step(w); out.push(M.predictsGoal(w, w.ball, i%2)?1:0); }
    return out.join('');
  };
  o.deterministic = trace() === trace();

  // ---- it fires on a real first touch, and only then ----------------------
  // Drive the actual kick path rather than calling maybeHitStop directly: a bot
  // striking the ball is the shipping route in.
  const strike = (frames, mode, place) => {
    M.sel.hitStop = frames; M.sel.trapOff = (mode === 'onetouch'); M.applyFeel();
    M.sel.mode='1v1'; M.setMatchSeed(3); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2; M.hitStop = 0;
    w.players.forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; q.kick=false; q.ctrl='bot'; });
    const st = w.players[0]; st.team = 0;
    place(w, st);
    M.handleBallControl(w, st, w.ball, false);
    return M.hitStop;
  };
  // Standing just behind the ball, both aimed at the top goal: player below, ball above.
  const onGoal  = (w, st) => { w.ball.x=0; w.ball.y=-60; w.ball.vx=0; w.ball.vy=0;
                               st.x=0; st.y=-60+st.r+w.ball.r-1; st.faceX=0; st.faceY=-1; st.kick=true; st.kickUsed=false; st.chargeT=0; };
  // Same touch, but square across the pitch — nowhere near the goal.
  const offGoal = (w, st) => { w.ball.x=0; w.ball.y=-60; w.ball.vx=0; w.ball.vy=0;
                               st.x=-(st.r+w.ball.r-1); st.y=-60; st.faceX=1; st.faceY=0; st.kick=true; st.kickUsed=false; st.chargeT=0; };
  o.firesOnGoalShot = strike(8, 'onetouch', onGoal);
  o.quietOffTarget  = strike(8, 'onetouch', offGoal);
  o.offWhenZero     = strike(0, 'onetouch', onGoal);
  o.scalesWithSlider = strike(3, 'onetouch', onGoal);
  // A carried (trapped) shot is not a first touch, however good it is.
  const carried = (() => {
    M.sel.hitStop = 8; M.sel.trapOff = false; M.applyFeel();
    M.sel.mode='1v1'; M.setMatchSeed(3); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2; M.hitStop = 0;
    w.players.forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; q.kick=false; q.ctrl='bot'; });
    const st = w.players[0]; st.team=0;
    st.x=0; st.y=-40; st.faceX=0; st.faceY=-1;
    w.ball.x=0; w.ball.y=-40-(st.r+w.ball.r+2);
    st.trap = true; st.trapT = 0; st.chargeT = 0;
    M.releaseTrap(w, st, w.ball);
    return { hs: M.hitStop, wouldScore: M.predictsGoal(w, w.ball, 0) };
  })();
  o.carriedShotHS = carried.hs;
  o.carriedShotWouldScore = carried.wouldScore;   // proves it was a goal-bound shot

  // ---- never outside live play --------------------------------------------
  const atState = st => {
    M.sel.hitStop = 8; M.sel.trapOff = true; M.applyFeel();
    M.sel.mode='1v1'; M.setMatchSeed(3); M.startMatch();
    const w=M.world; w.state=st; w.stateT=2; M.hitStop=0;
    w.players.forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; q.kick=false; q.ctrl='bot'; });
    const st2=w.players[0]; st2.team=0;
    w.ball.x=0; w.ball.y=60; w.ball.vx=0; w.ball.vy=-22;   // a shot already on its way
    M.maybeHitStop(w, st2, w.ball);
    return M.hitStop;
  };
  o.atKickoff = atState('kickoff');
  o.atOver    = atState('over');
  o.atPlay    = atState('play');

  M.sel.hitStop = 5; M.sel.trapOff=false; M.applyFeel(); M.saveSel();
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.sliderExists, 'no hit stop slider in the DOM');
ok(r.sliderRange && r.sliderRange[0]===0, `slider must reach 0 (off), got ${JSON.stringify(r.sliderRange)}`);
ok(r.writes, 'moving the slider does not write sel.hitStop');
ok(r.persists, 'sel.hitStop is not saved');
ok(/9/.test(r.labelShows), `slider label does not show the value: "${r.labelShows}"`);
ok(/off/i.test(r.zeroLabel), `0 should read as off, got "${r.zeroLabel}"`);
ok(r.independentOfJuice, 'turning Screen shake off also turned hit stop off — they are meant to be separate');

ok(r.onTarget, 'a clean shot straight at the goal was not predicted to score');
ok(!r.wide, 'a shot drifting wide was predicted to score');
ok(!r.backwards, 'a ball played at your own goal was predicted to score');
ok(!r.tooSoft, 'a soft nudge counted as a shot');
ok(!r.dyingShot, 'a shot coasting to a stop short of the line counted');
ok(!r.otherTeam, 'the wrong team was credited with the shot');
ok(!r.blockedByKeeper, 'a body on the ball\'s path did not block the predicted shot');
ok(!r.blockedReally, 'the blocked shot actually scored in the real sim — the prediction and the physics disagree');

ok(r.predictionInert, 'predictsGoal MUTATED the match — collideDiscs writes to both bodies, so it must run on copies');
ok(r.predictionStable, 'predictsGoal gave different answers for the same position');
ok(r.deterministic, 'the prediction is not deterministic across identical seeded matches');

ok(r.firesOnGoalShot === 8, `a first-touch shot on goal gave ${r.firesOnGoalShot} frames, expected 8`);
ok(r.quietOffTarget === 0, `a first touch played across the pitch still froze (${r.quietOffTarget} frames)`);
ok(r.offWhenZero === 0, `slider at 0 still froze (${r.offWhenZero} frames)`);
ok(r.scalesWithSlider === 3, `slider at 3 gave ${r.scalesWithSlider} frames — the value is not being used`);
ok(r.carriedShotWouldScore, 'the carried-shot case did not actually produce a goal-bound shot, so it proves nothing');
ok(r.carriedShotHS === 0, `a trapped-and-carried shot froze (${r.carriedShotHS} frames) — only first touches should`);

ok(r.atPlay === 8, `hit stop did not fire during play (${r.atPlay})`);
ok(r.atKickoff === 0, `hit stop fired at kickoff (${r.atKickoff})`);
ok(r.atOver === 0, `hit stop fired after the whistle (${r.atOver})`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nhitstop OK');
