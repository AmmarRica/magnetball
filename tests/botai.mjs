// Bot AI — the full rework. Steps 0–9 of the plan in docs/BOT-AI-AUDIT.md.
//
// Baselines quoted below were measured against the pre-fix build and are recorded
// in the audit, so a regression shows up as a number rather than a feeling.
import { chromium, LAUNCH, pinCasualFeel } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);
// ⚠️ **PINNED TO THE FEEL THE AI IS TUNED AT, and that is not the same as the feel
// the game SHIPS with.** `defaultSel()` is the Pro preset, whose movement pair (accel 12,
// pdamp 960) collapses the difficulty ladder: measured on `botplans`' own harness, Insane
// against Rookie reads +18 +17 +22 +16 +11 +11 +12 across the seven strategies at the AI's
// tuning and -4 +6 -11 +1 -9 -4 -4 at the shipped default — every plan down by 20 to 33,
// with no overlap between the two arms. What THIS file is for is the AI itself: that the
// ladder, the steering and the plans hold at the movement they were tuned against, so a
// future retune has something to keep. Pinning here would be papering over the defect only
// if nothing else measured it — `tests/proladder.mjs` does, and it is red on purpose.
await pinCasualFeel(p);

const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const park = w => w.players.forEach(q=>{ if(q.ctrl!=='bot'){ q.inX=0; q.inY=0; } });
  const run = (w,n) => { for(let i=0;i<n;i++){ park(w); M.step(w); } };
  const match = (mode,diff,seed) => { M.setMatchSeed(seed); M.sel.mode=mode; M.sel.diff=diff;
    M.startMatch(); const w=M.world; w.state='play'; w.stateT=1; return w; };

  // ================= STEP 0 — determinism =================
  const trace = (seed) => {
    const w = match('4v4','normal',seed);
    const bots=w.players.filter(q=>q.ctrl==='bot'); let h=0;
    for(let i=0;i<900;i++){ park(w); M.step(w);
      bots.forEach(q=>{ h=(h*31+Math.round(q.inX*1e4))|0; h=(h*31+Math.round(q.inY*1e4))|0;
                        h=(h*31+(q.kick?1:0))|0; }); }
    return { h, seed:w.seed, bx:+w.ball.x.toFixed(4), by:+w.ball.y.toFixed(4) };
  };
  const a1=trace(12345), a2=trace(12345), other=trace(999);
  o.sameSeedIdentical = a1.h===a2.h && a1.bx===a2.bx && a1.by===a2.by;
  o.diffSeedDiffers   = a1.h!==other.h;
  o.seedRecordedOnWorld = a1.seed===12345;
  M.setMatchSeed(null);
  M.startMatch(); const s1=M.world.seed; M.startMatch(); const s2=M.world.seed;
  o.unpinnedSeedVaries = s1!==s2 && s1>0 && s2>0;
  // Break Math.random and run the AI: it must never reach for it.
  const realRandom = Math.random; let randomCalls = 0;
  Math.random = () => { randomCalls++; return 0.5; };
  const wR = match('4v4','normal',4242); randomCalls = 0;      // ignore startMatch itself
  for(let i=0;i<300;i++){ park(wR); M.runBot(wR, wR.players.find(q=>q.ctrl==='bot')); }
  o.aiUsesSeededOnly = randomCalls === 0;
  Math.random = realRandom;

  // ======= CONSTRAINT — bots emit ONLY what a human emits =======
  // Diff the entire player object across 400 runBot calls. `ai*` are the AI's own
  // scratch fields; everything else the bot touches would be an ability no thumb has.
  const wC = match('2v2','normal',7);
  const bot = wC.players.find(q=>q.ctrl==='bot');
  const INPUTS = new Set(['inX','inY','faceX','faceY','kick']);
  const touched = new Set();
  for(let i=0;i<400;i++){
    wC.ball.x = Math.sin(i*0.11)*120; wC.ball.y = Math.cos(i*0.07)*200;
    const before = {}; for (const k of Object.keys(bot)) before[k] = bot[k];
    M.runBot(wC, bot);
    for (const k of Object.keys(bot)){
      const x=before[k], y=bot[k];
      const same = (x===y) || (x && y && typeof x==='object' && JSON.stringify(x)===JSON.stringify(y));
      if (!same) touched.add(k);
    }
  }
  o.fieldsWritten = [...touched].sort();
  o.onlyHumanInputsWritten = o.fieldsWritten.every(k => INPUTS.has(k) || /^ai/.test(k));
  o.neverWritesPosition = !['x','y','vx','vy','r','invMass','trap','trapT'].some(k=>touched.has(k));

  // ================= STEP 1 — the oscillation =================
  const wrongSide = (diff) => {
    const w = match('1v1',diff,31337);
    const bt=w.players.find(q=>q.ctrl==='bot'), you=w.players.find(q=>q.ctrl!=='bot');
    you.x=0; you.y=300; you.vx=you.vy=0;
    const att = bt.team===0 ? -1 : 1;
    w.ball.x=0; w.ball.y=0; w.ball.vx=w.ball.vy=0;
    bt.x=6; bt.y=att*55; bt.vx=bt.vy=0;
    // ⚠️ Flips are counted ONLY on the APPROACH, up to first contact. The limit cycle
    // this exists to catch is a bot jittering back and forth on the wrong side of the
    // ball, unable to commit to going around it — which is a thing that happens before
    // it gets there. Counted over the whole 4 seconds it also counts the bot TURNING
    // WHILE CARRYING, which is the job rather than a fault: once a trapped ball swings
    // round to the aim instead of snapping there, a carry legitimately changes
    // direction two or three times and a healthy bot read 6 flips against a threshold
    // of 4. Reported after contact too, so nothing is lost, but not enforced.
    let flips=0, after=0, prev=0, reached=false, ticks=-1;
    for(let i=0;i<240;i++){ park(w); M.step(w);
      const s=Math.sign(bt.vy*att);
      if(s&&prev&&s!==prev){ if (reached) after++; else flips++; }
      if(s) prev=s;
      if (!reached && Math.hypot(bt.x-w.ball.x,bt.y-w.ball.y) < bt.r+w.ball.r+8){ reached=true; ticks=i; } }
    return { flips, afterContact:after, reached, ticks, ballMoved:+Math.hypot(w.ball.x,w.ball.y).toFixed(1) };
  };
  const ws = ['normal','hard','insane'].map(wrongSide);
  o.wrongSide = ws;
  o.noLimitCycle    = ws.every(x=>x.flips <= 4);       // baseline: 16 flips in 4 s, all on the approach
  o.reachesTheBall  = ws.every(x=>x.reached && x.ticks < 180);
  o.actuallyStrikes = ws.every(x=>x.ballMoved > 40);   // baseline: ball never moved
  o.goesAroundNotThrough = ws.every(x=>x.ticks > 20);  // it circles rather than barging

  // --- Can it reach a loose ball anywhere on the pitch? This is what the old build
  // could NOT do above Normal (0–2% ball contact); dwell-time percentages are a poor
  // proxy now that a bot which clears the ball well spends less time next to it.
  const reachAll = (diff) => {
    const spots = [[0,0],[120,-200],[-150,180],[0,300],[170,60],[-170,-60]];
    const out = [];
    for (const [sx,sy] of spots){
      const w = match('1v1',diff,555);
      const bt=w.players.find(q=>q.ctrl==='bot'), you=w.players.find(q=>q.ctrl!=='bot');
      you.x=0; you.y=330; you.vx=you.vy=0;
      w.ball.x=sx; w.ball.y=sy; w.ball.vx=w.ball.vy=0;
      let t=-1;
      for(let i=0;i<300;i++){ park(w); M.step(w);
        if (Math.hypot(bt.x-w.ball.x,bt.y-w.ball.y) < bt.r+w.ball.r+10){ t=i; break; } }
      out.push(t);
    }
    return out;
  };
  o.reachRookie = reachAll('rookie');
  o.reachNormal = reachAll('normal');
  o.reachInsane = reachAll('insane');
  o.everyLooseBallReached = [o.reachRookie,o.reachNormal,o.reachInsane]
    .every(a => a.every(t => t >= 0 && t < 260));

  // ================= STEPS 1+3 across the board =================
  const sweep = [];
  for (const mode of ['1v1','2v2','4v4']) for (const diff of ['easy','normal','hard','insane']){
    const w = match(mode,diff,2024);
    const bots=w.players.filter(q=>q.ctrl==='bot');
    let rev=0, prev=bots.map(()=>({x:0,y:0})), swarmSum=0, swarmN=0;
    const T=1800;
    for(let i=0;i<T;i++){ park(w); M.step(w);
      bots.forEach((q,k)=>{ if (q.vx*prev[k].x + q.vy*prev[k].y < -0.02) rev++; prev[k]={x:q.vx,y:q.vy}; });
      for (const t of [0,1]){ const same=bots.filter(q=>q.team===t); if(!same.length) continue;
        swarmSum += same.filter(q=>Math.hypot(q.x-w.ball.x,q.y-w.ball.y)<70).length; swarmN++; } }
    sweep.push({ mode, diff, rev:+(rev/bots.length/(T/60)).toFixed(2),
                 swarm:+(swarmSum/swarmN).toFixed(2) });
  }
  o.sweep = sweep;
  // ⚠️ **THE MEAN, PLUS A GENEROUS PER-ENTRY GUARD — and this is NOT a threshold raised
  // to get green.** `s.rev < 0.5` on every entry of a ONE-SEED sweep sits inside the
  // metric's own per-seed spread: measured on 4v4/insane across seeds
  // 2024/7/99/4242/31337/616 the figure runs **0.52, 0.26, 0.31, 0.42, 0.35, 0.32** —
  // mean 0.36, and 2024 (the seed this sweep uses) is the worst of the six. So the check
  // flipped when the kickoff formation changed and moved every starting position, which is
  // a reshuffle rather than a regression: the same sweep on the old two-row formation
  // scored 0.43 on the same seed.
  // What "bots do not judder" actually means is the AVERAGE, so that is what is pinned.
  // ⚠️ **AND A WITHDRAWN CLAIM: THIS CHECK'S TEETH ARE UNPROVEN, in either form.** Three
  // sabotages were tried to make the current AI judder and NONE of them raised the figure
  // — `BOT.dwell` to 0 (state hold removed): mean 0.159; `ballInfluence` to 0.85-0.92,
  // which the BOT_TYPES table names as the axis that caused it: 0.165; `roleTicks` to 1
  // (roles re-matched every frame): 0.178. All three are at or below the shipped 0.182.
  // The 4.97 baseline came from the PRE-REWORK AI, and nothing in the code as it stands
  // reproduces that behaviour, so this is a regression detector that cannot currently be
  // shown to detect one. What IS established is the narrower claim: the old form pinned
  // ONE SEED under 0.5 while the per-seed spread on the worst combination runs 0.26-0.52,
  // so it flipped on a kickoff-formation change that moved starting positions and was
  // measuring the seed. Do not tighten this back to a single seed without first building
  // a sabotage it actually catches.
  o.revMean = +(sweep.reduce((a,s)=>a+s.rev,0)/sweep.length).toFixed(3);
  o.revWorst = Math.max(...sweep.map(s=>s.rev));
  o.reversalsUnderHalf = o.revMean < 0.5 && o.revWorst < 0.6;   // baseline: up to 4.97
  o.noSwarming = sweep.filter(s=>s.mode==='4v4').every(s=>s.swarm < 1.3);

  // ================= STEP 2 — intercept prediction =================
  {
    const w = match('1v1','insane',3);
    const bt=w.players.find(q=>q.ctrl==='bot');
    const ball = { x:0, y:0, vx:6, vy:0, damp:0.99 };
    const near = M.botIntercept(w, bt, ball, 4);
    const naive = M.botIntercept(w, bt, ball, 0);
    o.interceptLeadsTheBall = near.x > naive.x + 5 && near.t > 0;
    // Iterating must CONVERGE, not wander, for catchable AND uncatchable balls.
    o.interceptConverges = [{x:0,y:0,vx:2,vy:0,r:10,damp:0.99},
                            {x:0,y:0,vx:9,vy:3,r:10,damp:0.99},
                            {x:0,y:0,vx:0,vy:0,r:10,damp:0.99}].every(bb=>{
      const a=M.botIntercept(w,bt,bb,4), c=M.botIntercept(w,bt,bb,12);
      return Math.hypot(a.x-c.x, a.y-c.y) < 3; });
    // ...and it must never point off the pitch. Unclamped, a fast ball predicts 536
    // on a pitch 440 wide and the bot runs at a spot outside the boards.
    const far = M.botIntercept(w, bt, {x:0,y:0,vx:9,vy:3,r:10,damp:0.99}, 4);
    o.interceptStaysOnPitch = Math.abs(far.x) <= w.field.W/2 && Math.abs(far.y) <= w.field.L/2;
    // The closed form has to match actually stepping the damped ball.
    let sx=0, svx=6; for(let i=0;i<40;i++){ sx+=svx; svx*=0.99; }
    o.ballAtMatchesSim = Math.abs(M.ballAt({x:0,y:0,vx:6,vy:0,damp:0.99}, 40).x - sx) < 0.5;
    // Anticipation limit: low tiers must NOT predict.
    const low = match('1v1','rookie',3);
    o.rookieDoesNotPredict = (low.diff.react||1) < 0.75;
  }

  // ================= STEP 4 — formation, goalie, aggr =================
  {
    const w = match('4v4','normal',11);
    run(w, 400);
    const team = w.players.filter(q=>q.team===1);
    o.roles = team.map(q=>q.aiRole);
    o.hasOneChaser = o.roles.filter(x=>x==='chaser').length === 1;
    o.hasGoalie = o.roles.includes('goalie');
    const gk = team.find(q=>q.aiRole==='goalie');
    const attackDir = gk.team===0 ? -1 : 1;
    const ownGoalY = -attackDir*w.field.L/2;
    o.goalieStaysHome = Math.abs(gk.y - ownGoalY) < w.field.L*0.25 &&
                        Math.abs(gk.x) < w.field.goal;
    // Same-role players get DISTINCT slots — the old index-parity scheme handed two
    // bots an identical defender spot, which separation could only paper over.
    const defs = team.filter(q=>q.aiRole==='defender');
    const sups = team.filter(q=>q.aiRole==='support');
    const spots = [...defs,...sups].map(q=>M.botFormationSpot(w,q,'transition'));
    let minGap = 1e9;
    for(let i=0;i<spots.length;i++) for(let j=i+1;j<spots.length;j++)
      minGap = Math.min(minGap, Math.hypot(spots[i].x-spots[j].x, spots[i].y-spots[j].y));
    o.slotsAreDistinct = spots.length < 2 || minGap > 25;
    // Attacking stretches the shape, defending compresses it.
    const d0 = team.find(q=>q.aiRole==='defender');
    const atk = M.botFormationSpot(w, d0, 'attack'), def = M.botFormationSpot(w, d0, 'defend');
    o.shapeBreathes = Math.abs(atk.y - def.y) > 8;
    // diff.aggr is wired in at last: a more aggressive tier pushes its line up.
    const soft = {...w, diff:{...w.diff, aggr:0.68}}, hard = {...w, diff:{...w.diff, aggr:1.42}};
    const ls = M.botFormationSpot(soft, d0, 'transition'), lh = M.botFormationSpot(hard, d0, 'transition');
    o.aggrMovesTheLine = Math.abs(lh.y - ls.y) > 1 &&
      ((lh.y - ls.y) * (d0.team===0 ? -1 : 1)) > 0;   // higher aggr = further upfield
  }

  // ================= STEP 5 — aim scoring and lanes =================
  {
    const w = match('2v2','normal',13);
    const me = w.players.find(q=>q.ctrl==='bot');
    // A body sitting on the line blocks it; the same line with nobody on it doesn't.
    w.players.forEach(q=>{ if(q.team!==me.team){ q.x=9999; q.y=9999; } });
    const clear = M.botLaneClear(w, me, 0, 0, 0, 200);
    const blocker = w.players.find(q=>q.team!==me.team);
    blocker.x = 0; blocker.y = 100;
    const blocked = M.botLaneClear(w, me, 0, 0, 0, 200);
    o.laneClearWorks = clear > 0.9 && blocked < 0.2;
    // Aperture shrinks when a body stands in the mouth.
    const attackDir = me.team===0 ? -1 : 1, gy = attackDir*w.field.L/2, gh = w.field.goal/2;
    blocker.x = 9999; blocker.y = 9999;
    const openAp = M.botAperture(w, me, {x:0,y:gy-200}, gy, gh).span;
    blocker.x = 0; blocker.y = gy-60;
    const shutAp = M.botAperture(w, me, {x:0,y:gy-200}, gy, gh).span;
    o.apertureShrinks = openAp > shutAp + 0.05;
    // With the direct lane shut, the scorer must stop preferring the direct shot.
    const mates = w.players.filter(q=>q.team===me.team);
    blocker.x = 9999; blocker.y = 9999;
    w.ball.x = 0; w.ball.y = gy - 220;
    const openPick = M.botPickAim(w, me, w.ball, mates);
    for (const q of w.players) if (q.team!==me.team){ q.x=0; q.y=gy-120; }
    const shutPick = M.botPickAim(w, me, w.ball, mates);
    o.openPrefersGoal = openPick.kind === 'goal';
    o.blockedLooksElsewhere = shutPick.kind !== 'goal' || shutPick.s < openPick.s;
    // Passing is the same act as shooting — a kind, not a mechanic.
    o.passIsAKick = ['goal','pass','bank','clear'].includes(openPick.kind);
  }

  // ================= STEP 8 — bank kicks off the REAL walls =================
  {
    const w = match('1v1','normal',17);
    // Left side wall of a classic pitch, bCoef 0.90 — near-elastic but NOT a mirror.
    const seg = w.walls.find(s=>!s.isNet && s.a.x===s.b.x && s.a.x < 0);
    o.wallBCoef = seg.bCoef;
    // Fire the ball at an aim and measure where the post-bounce path crosses the
    // target's line. Swept over several geometries on purpose: at one particular
    // distance the restitution error and the ball-radius error cancel, and a naive
    // mirror looks perfect there while being 60 units out closer to the boards.
    const bounceErr = (aim, from, target) => {
      const w2 = match('1v1','normal',17);
      w2.players.forEach(q=>{ q.x=9999; q.y=9999; q.vx=q.vy=0; });
      const bl=w2.ball; bl.x=from.x; bl.y=from.y;
      let dx=aim.x-from.x, dy=aim.y-from.y; const dl=Math.hypot(dx,dy);
      bl.vx=dx/dl*10; bl.vy=dy/dl*10;
      let bounced=false;
      for(let i=0;i<260;i++){ const vx0=bl.vx; M.step(w2);
        if (!bounced && vx0 < 0 && bl.vx > 0) bounced = true;
        if (bounced && bl.x >= target.x) return Math.abs(bl.y - target.y); }
      return 1e9;
    };
    let sumN=0, sumC=0, n=0, worstC=0;
    for (const tx of [-180,-140,-90,-40]){
      for (const [sy,ty] of [[-140,180],[-60,240]]){
        const from={x:tx,y:sy}, target={x:tx,y:ty};
        const corr = M.botMirror(seg, target.x, target.y, w.ball.r);
        const naive = { x: 2*seg.a.x - target.x, y: target.y };
        const ec = bounceErr(corr, from, target), en = bounceErr(naive, from, target);
        if (ec > 900 || en > 900) continue;
        sumC+=ec; sumN+=en; n++; worstC=Math.max(worstC, ec);
      }
    }
    o.bankMeanErrCorrected = +(sumC/n).toFixed(1);
    o.bankMeanErrNaive = +(sumN/n).toFixed(1);
    o.bankWorstErrCorrected = +worstC.toFixed(1);
    o.restitutionCorrected = Math.abs(M.botMirror(seg,-60,250,w.ball.r).x - (2*seg.a.x + 60)) > 2;
    o.bankLandsOnTarget = worstC < 25 && n >= 6;
    o.correctionBeatsNaiveMirror = sumC < sumN * 0.75;
    // A bank is only offered when the line really crosses the wall segment.
    const m0 = M.botMirror(seg, -60, 250, w.ball.r);
    o.bankValidatesSegment = M.botBankHits(seg, -60, -100, m0.x, m0.y) !== null &&
                             M.botBankHits(seg, 200, 0, 260, 0) === null;
    // Nets are dead (bCoef 0.20 plus a halving) and must never be a bank surface.
    const net = w.walls.find(s=>s.isNet);
    o.netsAreNotBankable = M.botMirror(net, 0, 0, w.ball.r) === null;
  }

  // ================= STEP 6 — support grid =================
  {
    const w = match('4v4','normal',19);
    run(w, 300);
    const sup = w.players.filter(q=>q.team===1 && q.aiRole==='support');
    o.supportHasSpot = sup.length === 0 || sup.every(q=>q.aiSpot && isFinite(q.aiSpot.x));
    // The spot must be sticky: recomputing 48 cells every tick otherwise teleports it.
    const q0 = sup[0];
    if (q0){
      let jumps = 0, prev = {...q0.aiSpot};
      for(let i=0;i<240;i++){ park(w); M.step(w);
        if (q0.aiSpot && Math.hypot(q0.aiSpot.x-prev.x, q0.aiSpot.y-prev.y) > 1){
          jumps++; prev = {...q0.aiSpot}; } }
      o.supportSpotJumps = jumps;
      o.supportSpotIsSticky = jumps < 60;      // not every tick
    } else { o.supportSpotIsSticky = true; }
  }

  // ================= STEP 7 — role stability =================
  {
    const w = match('4v4','normal',23);
    run(w, 120);
    const team = w.players.filter(q=>q.team===1);
    const last = new Map(team.map(q=>[q,q.aiRole]));
    let changes = 0;
    for(let i=0;i<1800;i++){ park(w); M.step(w);
      team.forEach(q=>{ if (q.aiRole !== last.get(q)){ changes++; last.set(q,q.aiRole); } }); }
    o.roleChangesPerBotPerMin = +(changes/team.length).toFixed(1);
    o.rolesAreStable = o.roleChangesPerBotPerMin < 40;
    o.roleMarginExists = M.BOT.roleMargin > 0;
  }

  // ================= STEP 9 — feel =================
  {
    // Reaction delay is real and scales with the tier.
    o.reactSpread = ['rookie','normal','insane'].map(d=>{
      const w = match('1v1',d,29);
      return Math.max(0, Math.round(M.BOT.reactTicks * (1.1 - (w.diff.react||1))));
    });
    o.reactionDelayScales = o.reactSpread[0] > o.reactSpread[2];
    o.reactionIsInTicks = o.reactSpread.every(t=>Number.isInteger(t) && t <= 12);
    // Error is the primary knob and it is seeded.
    const errOf = (d) => { const w = match('1v1',d,29); return w.diff.err; };
    o.errIsMonotonic = errOf('rookie') > errOf('normal') && errOf('normal') > errOf('insane');
    // Only ONE presser: the second defender covers rather than double-teaming.
    const w = match('4v4','normal',31);
    run(w, 400);
    // Measure how OFTEN a second body joins the press, not the single worst frame —
    // a ball rolling through a defender momentarily puts three near it and says
    // nothing about double-teaming.
    let crowdTicks = 0, ticks = 0;
    for(let i=0;i<600;i++){ park(w); M.step(w);
      for (const t of [0,1]){
        const n = w.players.filter(q=>q.team===t && q.ctrl==='bot' &&
          Math.hypot(q.x-w.ball.x,q.y-w.ball.y) < 55).length;
        ticks++; if (n >= 3) crowdTicks++; } }
    o.threePlusOnBallPct = +(crowdTicks/ticks*100).toFixed(1);
    o.onlyOnePresser = o.threePlusOnBallPct < 5;
  }

  // ============ Bots follow the player's trap setting (decision 8b) ============
  {
    // Trapping ON: a bot must trap and release like a human, not fire on contact.
    M.sel.trapOff = false;
    const w = match('1v1','normal',37);
    let sawTrap=false, sawCarry=false;
    for(let i=0;i<900;i++){ park(w); M.step(w);
      w.players.forEach(q=>{ if(q.ctrl==='bot'){ if(q.trap) sawTrap=true;
        if(q.aiState==='carry') sawCarry=true; } }); }
    o.botTrapsWhenTrappingOn = sawTrap && sawCarry;
    // Trapping OFF (one-touch): a bot must NEVER trap.
    M.sel.trapOff = true;
    const w2 = match('1v1','normal',37);
    let trapped=false, kicked=0;
    for(let i=0;i<900;i++){ park(w2); M.step(w2);
      w2.players.forEach(q=>{ if(q.ctrl==='bot' && q.trap) trapped=true; });
      if (Math.hypot(w2.ball.vx,w2.ball.vy) > 4) kicked++; }
    o.botNeverTrapsWhenOff = !trapped;
    o.botStillKicksWhenOff = kicked > 30;
    M.sel.trapOff = false;
    // And the bot-only kick path is gone: no branch keyed on ctrl==='bot'.
    o.noBotOnlyKickBranch = !/p\.ctrl\s*===\s*'bot'/.test(M.handleBallControl.toString());
  }

  // ================= The difficulty ladder is monotone =================
  // Head-to-head, new AI both sides, EACH PAIR PLAYED BOTH WAYS ROUND. That matters:
  // driving one side manually gives it about a 17-point edge, so a one-sided harness
  // reported normal-vs-normal at 0.33 and made every other number suspect.
  //
  // ⚠️ AUTO-REPLAY OFF, and it is not a tidiness flag. These duels are a synchronous
  // `for` loop of `M.step(w)` with no `await` in it, so a `playReplay()` promise can
  // never resolve inside one — the goal state simply keeps ticking, `replay.active`
  // stays true for the rest of the duel, and a MEASURED 910 of 3,600 steps went on
  // celebrating rather than playing. That is a quarter of every match thrown away
  // before a single bot decision is counted, and it made the whole ladder a coin flip
  // at six duels: a change elsewhere that only moved the goal hold by a second flipped
  // `ladderIsMonotone` while nothing about the bots had changed at all. A replay is not
  // bot behaviour and has no business in a measurement of bot behaviour.
  {
    M.sel.autoReplay = false;
    const h2h = (A,B,mode,seed,secs) => {
      M.setMatchSeed(seed); M.sel.mode=mode; M.sel.diff=B; M.sel.length='5';
      M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
      const a=w.players.filter(q=>q.team===0);
      a.forEach(q=>{ q.ctrl='bot'; q.aiFrozen=true; });
      w.players.filter(q=>q.team===1).forEach(q=>{ q.ctrl='bot'; });
      for(let i=0;i<secs*60;i++){
        const sv=w.diff; w.diff=M.DIFF[A];
        a.forEach(q=>{ q.aiFrozen=false; M.runBot(w,q); q.aiFrozen=true; });
        w.diff=sv; M.step(w);
        if(w.state==='over') break;
      }
      return { weak:w.score[0], strong:w.score[1] };
    };
    // score(weak, strong) with both orientations, so the harness bias cancels.
    // ⚠️ GOAL DIFFERENCE is what gets asserted, and the win rate is only reported.
    // A win rate throws away almost all of the signal — a 1-0 and a 6-0 are the same
    // number — and at a sample size a test suite can afford that is the difference
    // between a measurement and a coin flip: normal-vs-hard comes out at exactly 0.500
    // on wins over twelve duels while the same duels read 59-45 on goals. Both metrics
    // agree on every rung over a wide offline sweep; only one of them resolves at
    // twelve. ⚠️ Two modes, not one — 1v1 and 2v2 reward different things, and a
    // ladder that only holds at one team size is not a ladder.
    const duel = (weak, strong) => {
      let sw=0, n=0, gf=0, ga=0;
      for (const mode of ['1v1','2v2']) for (let s=0;s<3;s++){
        const f = h2h(weak, strong, mode, 9000+s*211, 60);          // strong on team 1
        const r = h2h(strong, weak, mode, 9000+s*211, 60);          // strong on team 0
        n += 2;
        sw += f.strong > f.weak ? 1 : f.strong === f.weak ? 0.5 : 0;
        sw += r.weak   > r.strong ? 1 : r.weak === r.strong ? 0.5 : 0;
        gf += f.strong + r.weak; ga += f.weak + r.strong;            // the strong side's goals
      }
      return { win:+(sw/n).toFixed(3), gf, ga, gd: gf - ga };
    };
    o.ladder = {
      selfIsFair:     duel('normal','normal'),
      rookieVsNormal: duel('rookie','normal'),
      rookieVsInsane: duel('rookie','insane'),
      normalVsHard:   duel('normal','hard'),
    };
    // A symmetric matchup must come out even once the bias is cancelled — on BOTH
    // metrics, which is the control that says goal difference is not just a number
    // that happens to point the right way.
    o.harnessIsFair = Math.abs(o.ladder.selfIsFair.win - 0.5) <= 0.2 &&
                      o.ladder.selfIsFair.gd === 0;
    // Every rung, now that the measurement can resolve them. A wider offline sweep
    // (3 modes × 6 seeds, 36 duels a rung) reads, as goals for-against for the
    // stronger side: rookie<normal 69-35, rookie<insane 80-39, normal<hard 65-50,
    // hard<insane 72-59, easy<hard 68-52 — every rung the right way up.
    o.ladderIsMonotone = o.ladder.rookieVsNormal.gd > 0 &&
                         o.ladder.rookieVsInsane.gd > 0 &&
                         o.ladder.normalVsHard.gd   > 0;
    // Every AI-side knob derives from ONE scalar, so a tier can't be better at one
    // thing and worse at another.
    const sk = Object.keys(M.DIFF).map(k=>M.botSkill(M.DIFF[k]));
    o.skillIsMonotone = sk.every((x,i)=> i===0 || x.s >= sk[i-1].s) &&
                        sk.every((x,i)=> i===0 || x.lag <= sk[i-1].lag) &&
                        sk.every((x,i)=> i===0 || x.iters >= sk[i-1].iters);
    o.errIsMonotoneAcrossTiers = Object.keys(M.DIFF)
      .map(k=>M.DIFF[k].err).every((e,i,a)=> i===0 || e < a[i-1]);
    o.decideRateIsUniform = new Set(sk.map(x=>x.decide)).size === 1;
    // `power` fed a bot-only kick that no longer exists.
    o.powerKnobRetired = Object.keys(M.DIFF).every(k=>M.DIFF[k].power === undefined);
    M.sel.autoReplay = true;          // put the setting back; nothing below wants it off
  }

  // ================= Config lives in one block =================
  o.configHasEverything = ['decideTicks','roleTicks','standoff','arriveR','strikeEnter',
    'strikeExit','dwell','commitTicks','wSeek','wSeparate','separateR','aimErrScale',
    'posErrScale','interceptIters','ballInfluence','slotDepth','laneR','apertureMin',
    'wallPenalty','gridX','gridY','reactTicks','decideTicksAll','windup']
    .every(k => M.BOT[k] != null);
  o.hysteresisIsTwoThresholds = M.BOT.strikeEnter > M.BOT.strikeExit;
  o.staggered = M.BOT.decideTicksAll >= 4 && M.BOT.decideTicksAll <= 6;   // 10–15 Hz
  M.setMatchSeed(null);
  return o;
});

console.log(JSON.stringify(r,null,1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const must = ['sameSeedIdentical','diffSeedDiffers','seedRecordedOnWorld','unpinnedSeedVaries',
  'aiUsesSeededOnly','onlyHumanInputsWritten','neverWritesPosition',
  'noLimitCycle','reachesTheBall','actuallyStrikes','goesAroundNotThrough',
  'everyLooseBallReached','reversalsUnderHalf','noSwarming',
  'interceptLeadsTheBall','interceptConverges','interceptStaysOnPitch','ballAtMatchesSim','rookieDoesNotPredict',
  'hasOneChaser','hasGoalie','goalieStaysHome','slotsAreDistinct','shapeBreathes','aggrMovesTheLine',
  'laneClearWorks','apertureShrinks','openPrefersGoal','blockedLooksElsewhere','passIsAKick',
  'restitutionCorrected','bankLandsOnTarget','correctionBeatsNaiveMirror','bankValidatesSegment',
  'netsAreNotBankable','supportHasSpot','supportSpotIsSticky','rolesAreStable','roleMarginExists',
  'reactionDelayScales','reactionIsInTicks','errIsMonotonic','onlyOnePresser',
  'botTrapsWhenTrappingOn','botNeverTrapsWhenOff','botStillKicksWhenOff','noBotOnlyKickBranch',
  'configHasEverything','hysteresisIsTwoThresholds','staggered',
  'harnessIsFair','ladderIsMonotone','skillIsMonotone','errIsMonotoneAcrossTiers',
  'decideRateIsUniform','powerKnobRetired'];
const bad = must.filter(k => r[k] !== true);
const ok = bad.length === 0 && errors.length === 0;
if (bad.length) console.log('FAILED:', bad);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
