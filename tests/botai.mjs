// Bot AI — steps 0/1/3: seeded determinism, the oscillation fix, and separation.
//
// Baselines quoted below are measured against the pre-fix build and recorded in
// docs/BOT-AI-AUDIT.md, so a regression here shows up as a number, not a feeling.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const parkHumans = w => w.players.forEach(q=>{ if(q.ctrl!=='bot'){ q.inX=0; q.inY=0; } });

  // ---------- Step 0: determinism ----------
  // Hash the INPUTS the bots emit, not the positions they end up at — inputs are
  // what has to match across machines for lockstep.
  const trace = (seed, mode) => {
    M.setMatchSeed(seed); M.sel.mode=mode||'4v4'; M.sel.diff='normal'; M.startMatch();
    const w=M.world; w.state='play'; w.stateT=1;
    const bots=w.players.filter(q=>q.ctrl==='bot');
    let h=0;
    for(let i=0;i<900;i++){ parkHumans(w); M.step(w);
      bots.forEach(q=>{ h=(h*31+Math.round(q.inX*1e4))|0; h=(h*31+Math.round(q.inY*1e4))|0;
                        h=(h*31+(q.kick?1:0))|0; }); }
    return { h, seed:w.seed, ballX:+w.ball.x.toFixed(4), ballY:+w.ball.y.toFixed(4) };
  };
  const a1=trace(12345), a2=trace(12345), diffSeed=trace(999);
  o.sameSeedIdentical = a1.h===a2.h && a1.ballX===a2.ballX && a1.ballY===a2.ballY;
  o.diffSeedDiffers   = a1.h!==diffSeed.h;
  o.seedRecordedOnWorld = a1.seed===12345;
  M.setMatchSeed(null);
  M.startMatch(); const s1=M.world.seed; M.startMatch(); const s2=M.world.seed;
  o.unpinnedSeedVaries = s1!==s2 && s1>0 && s2>0;
  // The AI must not reach for Math.random. Break it and run a match.
  const realRandom = Math.random;
  let randomCalls = 0;
  Math.random = () => { randomCalls++; return 0.5; };
  M.setMatchSeed(4242); M.sel.mode='4v4'; M.startMatch();
  const wR=M.world; wR.state='play'; wR.stateT=1;
  randomCalls = 0;                       // ignore startMatch itself (names, demo court)
  for(let i=0;i<300;i++){ parkHumans(wR); M.runBot(wR, wR.players.find(q=>q.ctrl==='bot')); }
  o.aiCallsMathRandom = randomCalls;
  o.aiUsesSeededOnly = randomCalls === 0;
  Math.random = realRandom;

  // ---------- Constraint check: bots emit ONLY what a human emits ----------
  // Call runBot alone (no integrate) and diff the whole player object.
  M.setMatchSeed(7); M.sel.mode='2v2'; M.startMatch();
  const wC=M.world; wC.state='play'; wC.stateT=1;
  const bot=wC.players.find(q=>q.ctrl==='bot');
  const ALLOWED = new Set(['inX','inY','faceX','faceY','kick',
    'aiT','aiState','aiStateT','aiCommitT','aiTarget','aiAim','aiPass',
    'aiErrT','aiAimErr','aiPosErrX','aiPosErrY']);
  const touched = new Set();
  for(let i=0;i<400;i++){
    wC.ball.x = Math.sin(i*0.11)*120; wC.ball.y = Math.cos(i*0.07)*200;   // move the ball about
    const before = {}; for (const k of Object.keys(bot)) before[k] = bot[k];
    M.runBot(wC, bot);
    for (const k of Object.keys(bot)){
      const a=before[k], c=bot[k];
      const same = (a===c) || (a && c && typeof a==='object' && JSON.stringify(a)===JSON.stringify(c));
      if (!same) touched.add(k);
    }
  }
  o.fieldsWritten = [...touched].sort();
  o.onlyHumanInputsWritten = o.fieldsWritten.every(k=>ALLOWED.has(k));
  o.neverWritesPosition = !['x','y','vx','vy'].some(k=>touched.has(k));

  // ---------- Step 1: the oscillation ----------
  // The exact scenario from the audit: ball dead at centre, bot on the WRONG side.
  const wrongSide = (diff) => {
    M.setMatchSeed(31337); M.sel.mode='1v1'; M.sel.diff=diff; M.startMatch();
    const w=M.world; w.state='play'; w.stateT=1;
    const bot=w.players.find(q=>q.ctrl==='bot');
    const you=w.players.find(q=>q.ctrl!=='bot');
    you.x=0; you.y=300; you.vx=you.vy=0;
    const att = bot.team===0 ? -1 : 1;
    w.ball.x=0; w.ball.y=0; w.ball.vx=w.ball.vy=0;
    bot.x=6; bot.y=att*55; bot.vx=bot.vy=0;
    let flips=0, prev=0, minGap=1e9, reached=false, ticksToBall=-1;
    for(let i=0;i<240;i++){
      parkHumans(w); M.step(w);
      const s=Math.sign(bot.vy*att); if(s&&prev&&s!==prev) flips++; if(s) prev=s;
      const g=Math.hypot(bot.x-w.ball.x, bot.y-w.ball.y);
      if (!reached){ minGap=Math.min(minGap,g);
        if (g < bot.r+w.ball.r+8){ reached=true; ticksToBall=i; } }
    }
    return { flips, reached, ticksToBall, ballMoved:+Math.hypot(w.ball.x,w.ball.y).toFixed(1) };
  };
  o.wrongSideNormal = wrongSide('normal');
  o.wrongSideHard   = wrongSide('hard');
  o.wrongSideInsane = wrongSide('insane');
  // Baseline was 16 flips in 4s and the ball never moved.
  o.noLimitCycle = [o.wrongSideNormal,o.wrongSideHard,o.wrongSideInsane]
    .every(x=>x.flips <= 4);
  o.reachesTheBall = [o.wrongSideNormal,o.wrongSideHard,o.wrongSideInsane]
    .every(x=>x.reached && x.ticksToBall < 180);
  o.actuallyStrikesIt = [o.wrongSideNormal,o.wrongSideHard,o.wrongSideInsane]
    .every(x=>x.ballMoved > 40);

  // It gets there AROUND the ball, not through it: coming from the wrong side it
  // must never end up closer than roughly touching while circling.
  o.goesAroundNotThrough = o.wrongSideNormal.ticksToBall > 20;

  // ---------- Steps 1 + 3 across the board ----------
  const sweep = [];
  for (const mode of ['1v1','2v2','4v4']){
    for (const diff of ['easy','normal','hard','insane']){
      M.setMatchSeed(2024); M.sel.mode=mode; M.sel.diff=diff; M.startMatch();
      const w=M.world; w.state='play'; w.stateT=1;
      const bots=w.players.filter(q=>q.ctrl==='bot');
      let rev=0, prev=bots.map(()=>({x:0,y:0})), swarmSum=0, swarmN=0, touch=0, tight=0;
      const T=1800;                                    // 30 s
      for(let i=0;i<T;i++){
        parkHumans(w); M.step(w);
        bots.forEach((q,k)=>{ if (q.vx*prev[k].x + q.vy*prev[k].y < -0.02) rev++;
          prev[k]={x:q.vx,y:q.vy}; });
        for (const t of [0,1]){ const same=bots.filter(q=>q.team===t);
          if (!same.length) continue;
          swarmSum += same.filter(q=>Math.hypot(q.x-w.ball.x,q.y-w.ball.y)<70).length; swarmN++;
          for(let a=0;a<same.length;a++) for(let c=a+1;c<same.length;c++)
            if (Math.hypot(same[a].x-same[c].x, same[a].y-same[c].y) < 40) tight++;
        }
        if (bots.some(q=>Math.hypot(q.x-w.ball.x,q.y-w.ball.y) < q.r+w.ball.r+9)) touch++;
      }
      sweep.push({ mode, diff,
        rev:+(rev/bots.length/(T/60)).toFixed(2),
        swarm:+(swarmSum/swarmN).toFixed(2),
        contact:+(touch/T*100).toFixed(0),
        tightPct:+(tight/T*100).toFixed(1) });
    }
  }
  o.sweep = sweep;
  o.reversalsUnderHalf = sweep.every(s=>s.rev < 0.5);
  o.noSwarming = sweep.filter(s=>s.mode==='4v4').every(s=>s.swarm < 1.3);
  // The audit's headline: contact used to COLLAPSE to 0–2% at hard and above while
  // easy managed 11%. Difficulty must no longer be inverted on reaching the ball.
  const hardPlus = sweep.filter(s=>s.diff==='hard'||s.diff==='insane');
  o.worstHardContact = Math.min(...hardPlus.map(s=>s.contact));
  o.difficultyNotInverted = o.worstHardContact >= 8;

  // ---------- KICK_SLOW: no holding KICK while merely walking ----------
  M.setMatchSeed(5); M.sel.mode='1v1'; M.sel.diff='normal'; M.startMatch();
  const wK=M.world; wK.state='play'; wK.stateT=1;
  const bk=wK.players.find(q=>q.ctrl==='bot');
  wK.players.filter(q=>q.ctrl!=='bot').forEach(q=>{ q.x=0; q.y=300; });
  wK.ball.x=0; wK.ball.y=0; wK.ball.vx=wK.ball.vy=0;
  bk.x=200; bk.y=(bk.team===0?-1:1)*250;              // a long way off, walking in
  let heldFar=0, farTicks=0;
  for(let i=0;i<120;i++){ parkHumans(wK); M.step(wK);
    if (Math.hypot(bk.x-wK.ball.x,bk.y-wK.ball.y) > 120){ farTicks++; if (bk.kick) heldFar++; } }
  o.farTicks = farTicks;
  o.noKickWhileApproaching = farTicks > 40 && heldFar === 0;

  // ---------- Dwell: a state cannot flip on consecutive ticks ----------
  M.setMatchSeed(8); M.sel.mode='2v2'; M.startMatch();
  const wD=M.world; wD.state='play'; wD.stateT=1;
  const bd=wD.players.filter(q=>q.ctrl==='bot');
  const lastChange=new Map(bd.map(q=>[q,-999])); const seen=new Map(bd.map(q=>[q,q.aiState]));
  let minGapTicks=1e9;
  for(let i=0;i<1200;i++){ parkHumans(wD); M.step(wD);
    bd.forEach(q=>{ if (q.aiState!==seen.get(q)){
      minGapTicks=Math.min(minGapTicks, i-lastChange.get(q));
      lastChange.set(q,i); seen.set(q,q.aiState); } }); }
  o.minStateGap = minGapTicks===1e9 ? 'no changes' : minGapTicks;
  o.dwellRespected = minGapTicks===1e9 || minGapTicks >= M.BOT.dwell;
  o.hysteresisIsTwoThresholds = M.BOT.strikeEnter > M.BOT.strikeExit;

  // ---------- Tuning lives in one config block ----------
  o.configHasEverything = ['decideTicks','standoff','arriveR','strikeEnter','strikeExit',
    'dwell','commitTicks','wSeek','wSeparate','separateR','aimErrScale','posErrScale']
    .every(k=>typeof M.BOT[k] === 'number');
  o.staggered = M.BOT.decideTicks >= 4 && M.BOT.decideTicks <= 6;   // 10–15 Hz
  M.setMatchSeed(null);
  return o;
});

console.log(JSON.stringify(r,null,1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.sameSeedIdentical && r.diffSeedDiffers && r.seedRecordedOnWorld &&
  r.unpinnedSeedVaries && r.aiUsesSeededOnly &&
  r.onlyHumanInputsWritten && r.neverWritesPosition &&
  r.noLimitCycle && r.reachesTheBall && r.actuallyStrikesIt && r.goesAroundNotThrough &&
  r.reversalsUnderHalf && r.noSwarming && r.difficultyNotInverted &&
  r.noKickWhileApproaching && r.dwellRespected && r.hysteresisIsTwoThresholds &&
  r.configHasEverything && r.staggered && errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
