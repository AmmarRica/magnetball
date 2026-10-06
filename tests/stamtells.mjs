// STAMINA TELLS — the dot trail and the footballer figure say "sprinting" and "spent",
// and only on the Sunday League pair.
//
// THE ASK: after a design pass that found the kick ring doing too many jobs ("implement the
// trail and 6. Only implement on the default theme"). The ring is the kick REACH and must
// stay a complete circle, so colour on a thin stroke was the only channel it had. Two
// readouts now carry the three yes/no answers a player wants mid-match: a HOT trail while
// sprinting and a GREY one while spent; and a spent figure that slumps (head and shoulders
// back, arms hanging, less yaw) and sweats. The ring is left exactly as it was.
//
// ⚠️ MEASURED ON THE BUILD BEFORE THIS ONE, same probe: the dots painter was handed the
// team colour in all three states (`#2f7fd0` rested, sprinting and spent alike) and the
// spent figure differed from the rested one by **0 pixels**. Those are the controls every
// number below is a difference against.
//
// ⚠️ THE GATE IS THE LOAD-BEARING HALF. "Only on the default theme" is a claim about every
// OTHER theme, so a plain disc on grass is measured in the same run and must read exactly
// what it read before: team-coloured trail, zero figure change, no sweat. A build that
// recolours every trail passes every Sunday League check on its own.
//
// ⚠️ Measurement traps. The trail colour is read off what the REAL painter is HANDED
// (`TRAIL_LOOKS.dots.draw` is wrapped and the call goes through `drawDiscTrails`), because
// a dot is a few antialiased pixels over mown stripes and a pixel probe of it reads the
// grass as often as the dot; the FIGURE is measured in pixels on a flat backdrop, the
// `footballers` suite's instrument. The human has to be held in the middle of the pitch
// while it sprints (the `sprint` suite's trap: left to run, it is against the boards inside
// two seconds and leaves no dots). And the slump is EASED, so a body made spent this step
// reads 0 slump — step the ease until it settles before measuring.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|ERR_TUNNEL/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  // ⚠️ AUTO-QUALITY DROPS THE DOT TRAILS FIRST, and a long synchronous evaluate starves
  // the page's own frame loop — so the first run of this probe read `null` for the spent
  // tail: `fullQuality()` had gone false under the stall and `drawDiscTrails` drew nothing.
  // The pin exists for exactly this.
  M.qualityPin(true);
  o.defaultBundle = M.currentBundle();                 // the theme this is FOR is the one that ships
  o.flagOnPair = !!(M.DISC_SKINS.footballers.staminaTells && M.DISC_SKINS.footballersink.staminaTells);
  o.flagNowhereElse = Object.keys(M.DISC_SKINS).filter(k => M.DISC_SKINS[k].staminaTells)
                        .sort().join(',') === 'footballers,footballersink';

  // Wait for the limb plates: the figure is measured with the pack PRESENT.
  const warmLimb = () => M.klimbSprite('arm', M.TH.teamRed, M.kitPerson({ name:'Mike' })[1], M.TH.discRim || '#151515');
  for (let i=0;i<80;i++){ if (warmLimb()) break; await new Promise(res=>setTimeout(res,40)); }
  o.limbSpriteLoaded = !!warmLimb();

  // ---- the trail, through the real call path --------------------------------------
  const handed=[]; const realDots = M.TRAIL_LOOKS.dots.draw;
  M.TRAIL_LOOKS.dots.draw = function(c,pts,n,col,rr,team){ handed.push({col, a:+c.globalAlpha.toFixed(2)}); return realDots.call(this,c,pts,n,col,rr,team); };
  M.sel.mode='1v1'; M.sel.lobby='off'; M.sel.length='5'; M.sel.controllers='off'; M.sel.adsOn='off';
  M.sel.sprint='on';
  const play = () => {
    M.setMatchSeed(3); M.startMatch(); const w=M.world; w.state='play'; w.stateT=2;
    const me = w.players[0];
    // The bot is parked at the far end every step so its own tail is not in the reading.
    const bot = w.players[1];
    // ⚠️ The body RUNS — back and forth through the middle — rather than being pinned: a
    // dot is dropped only once ground is covered, so a body held on one spot leaves no
    // tail at all, and the first run of this probe read `null` for the spent colour.
    // ⚠️ AND NOTHING IS PINNED ON AN AXIS: on this 1280-wide page `auto` turns the pitch,
    // so the stick's x is WORLD y (`applySeatRotation`) — pinning `me.y = 0` every step
    // held the body dead still with the ring draining, which read as a tail that never
    // appeared. The turn-round is on distance from the centre, whichever axis it runs on.
    let dir = 1;
    const run = (n, kick) => { M.pads.p1.dy=0; M.pads.p1.kick=kick;
      for (let i=0;i<n;i++){
        if (Math.hypot(me.x, me.y) > 120 && (me.x*me.vx + me.y*me.vy) > 0) dir = -dir;
        M.pads.p1.dx = dir;
        bot.x=0; bot.y=-300; bot.vx=bot.vy=0; M.step(w); M.advanceTrails(w); M.advanceTire(w); } };
    const mine = () => { handed.length=0; M.computeCam(); M.render();
      // the human's tail is the one handed FIRST (players[0]); the bot's dots have faded
      return handed.length ? handed[0] : null; };
    const out = {};
    run(30,false); out.rest = mine(); out.restState = { stam: me.stam, spent: me.spent, sprinting: me.sprinting };
    run(40,true);  out.sprint = mine(); out.sprintState = { stam: +me.stam.toFixed(2), spent: me.spent, sprinting: me.sprinting };
    run(200,true); out.spent = mine(); out.spentState = { stam: +me.stam.toFixed(2), spent: me.spent, sprinting: me.sprinting };
    out.team = me.team; out.fxSweat = M.fx.filter(q=>q.sweat).length;
    M.pads.p1.dx=0; M.pads.p1.kick=false;
    return out;
  };
  const teamCol = M.TH.teamRed;
  // Sunday League (the shipped default)
  const sl = play();
  o.sl = sl;
  o.slRestIsTeam    = !!sl.rest && sl.rest.col === teamCol && sl.rest.a === 1 && !sl.restState.sprinting;
  o.slSprintIsHot   = !!sl.sprint && sl.sprintState.sprinting && !sl.sprintState.spent && sl.sprint.col === M.kickRingInk() && sl.sprint.col !== teamCol;
  o.slSpentIsGrey   = !!sl.spent && sl.spentState.spent && sl.spent.col === M.STAMTELL.spent && sl.spent.a < 1;
  o.slSweats        = sl.fxSweat > 0;
  // ...and the CONTROL: plain discs on grass, same seed, same drive, nothing may change.
  M.sel.look.palette='grass'; M.sel.look.discs='none'; M.applyTheme('grass');
  const teamColG = M.TH.teamRed;
  const gr = play();
  o.gr = gr;
  o.grAllTeam = !!gr.rest && !!gr.sprint && !!gr.spent &&
    [gr.rest, gr.sprint, gr.spent].every(h => h.col === teamColG && h.a === 1);
  o.grReallySprinted = gr.sprintState.sprinting && gr.spentState.spent;   // or "unchanged" is vacuous
  o.grNoSweat = gr.fxSweat === 0;
  M.TRAIL_LOOKS.dots.draw = realDots;
  M.applyBundle('kickabout');

  // ---- the figure, in pixels on a flat backdrop (the footballers suite's instrument) ----
  const R=60, W=300, CX=150, CY=150;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=W; const c=cv.getContext('2d');
  const BG=[127,127,127];
  const base = (opt) => Object.assign({ team:0, faceX:1, faceY:0, r:R, name:'Mike', cap:'none', vx:0, vy:0, gait:0 }, opt||{});
  const paint = (skin, q) => { c.fillStyle='#7f7f7f'; c.fillRect(0,0,W,W); M.DISC_SKINS[skin].paint(c,q,CX,CY,R,{players:[q]}); return c.getImageData(0,0,W,W).data; };
  const near = (d,i,col,tol) => Math.abs(d[i]-col[0])+Math.abs(d[i+1]-col[1])+Math.abs(d[i+2]-col[2]) <= tol;
  const hex = (h) => [1,3,5].map(k=>parseInt(h.substr(k,2),16));
  const diffPx = (a,d) => { let n=0; for (let i=0;i<a.length;i+=4) if (Math.abs(a[i]-d[i])+Math.abs(a[i+1]-d[i+1])+Math.abs(a[i+2]-d[i+2])>24) n++; return n; };
  const scan = (d, pick) => { let m=0, n=0, sx=0; for (let i=0;i<d.length;i+=4){ const k=(i/4)|0, ax=(k%W)-CX, ay=((k/W)|0)-CY; if (!pick(d,i)) continue; m=Math.max(m, Math.hypot(ax,ay)); sx+=ax; n++; } return { reach:+(m/R).toFixed(3), along: n? +(sx/n/R).toFixed(3):null, n }; };
  const anyInk = (d,i) => !near(d,i,BG,40);
  const hairCol = hex(M.kitPerson({name:'Mike'})[0]);
  const isHair = (d,i) => near(d,i,hairCol,30);
  o.fig = {};
  for (const skin of ['footballers','footballersink']){
    // standing and mid-stride, rested against fully spent
    const f = {};
    for (const [tag, mv] of [['stand',{}],['run',{vx:3, gait: M.gaitPeriod()*0.25}]]){
      const rested = paint(skin, base(mv)), spent = paint(skin, base(Object.assign({ _tire:1, stam:0, spent:true }, mv)));
      const half = paint(skin, base(Object.assign({ _tire:0.5, stam:0, spent:true }, mv)));
      const rs = scan(rested, anyInk), ss = scan(spent, anyInk);
      f[tag] = { diff: diffPx(rested, spent), diffHalf: diffPx(rested, half),
                 reachRested: rs.reach, reachSpent: ss.reach,
                 hairRested: scan(rested, isHair).along, hairSpent: scan(spent, isHair).along };
    }
    // `_tire` left at 0 (a body that never tired) must be the rested picture exactly
    f.zeroIsRested = diffPx(paint(skin, base()), paint(skin, base({ _tire:0, stam:1, spent:false }))) === 0;
    o.fig[skin] = f;
  }
  const F = M.STAMTELL;
  o.figSlumps = ['footballers','footballersink'].every(k => {
    const f = o.fig[k];
    return f.stand.diff > 300 && f.run.diff > 300 &&                        // the picture changes, standing and running
      f.stand.hairSpent < f.stand.hairRested - F.sag*0.5 &&                  // the head went BACK along the facing...
      f.run.hairSpent  < f.run.hairRested  - F.sag*0.5 &&
      f.stand.diffHalf > 0 && f.stand.diffHalf < f.stand.diff &&            // ...and the ease is a ramp, not a switch
      f.zeroIsRested; });
  // ⚠️ THE CEILING: a spent figure reaches no further than a rested one — every change is
  // inward, so the 1.60r rule the footballers suite pins cannot be touched by it.
  o.figNoFurther = ['footballers','footballersink'].every(k =>
    o.fig[k].stand.reachSpent <= o.fig[k].stand.reachRested + 0.005 &&
    o.fig[k].run.reachSpent   <= o.fig[k].run.reachRested + 0.005);
  // ...and a plain disc is blind to `_tire`: the slump is the skin's, not the body's.
  // On the GAME canvas, because the plain body is `drawOneDisc`'s own and not a skin's:
  // the same body drawn at `_tire` 0 and 1 must be the same pixels.
  {
    M.sel.look.palette='grass'; M.sel.look.discs='none'; M.applyTheme('grass');
    M.setMatchSeed(3); M.startMatch(); const w=M.world; w.state='play'; w.stateT=2;
    const me=w.players[0]; me.x=me._px=0; me.y=me._py=0; me.vx=me.vy=0;
    const g=document.getElementById('game'), gc=g.getContext('2d'), DPR=g.width/g.clientWidth;
    const box = () => { M.computeCam(); M.render(); const [sx,sy]=M.screenPt(M.wx(0),M.wy(0));
      const rad=Math.round(me.r*M.cam.s*2.2*DPR); return gc.getImageData(Math.round(sx*DPR)-rad, Math.round(sy*DPR)-rad, rad*2, rad*2).data; };
    // ⚠️ ONLY `_tire` MOVES between the two frames. `stam`/`spent` are held at spent in
    // both, because the kick RING recolours on `spent` — that is the existing gauge, and
    // varying it here read 727 changed pixels on a plain disc that this feature never
    // touches. The slump is the only thing left to differ.
    me.stam=0; me.spent=true;
    me._tire=0; const a0=box();
    me._tire=1; const a1=box();
    const plainDiff = diffPx(a0, a1);
    o.plainDiscIgnoresTire = plainDiff === 0; o.plainDiff = plainDiff;
    // ...and the same probe on the footballer must see the slump, or the probe is blind
    M.applyBundle('kickabout'); me._tire=0; const f0=box();
    me._tire=1; const f1=box();
    o.pitchFootballerSlumps = diffPx(f0, f1) > 10; o.pitchDiff = diffPx(f0, f1);
  }
  M.applyBundle('kickabout');

  // ---- the ease and the sweat, through the real step-side function -----------------
  {
    M.setMatchSeed(3); M.startMatch(); const w=M.world; w.state='play'; w.stateT=2;
    const me=w.players[0];
    const tires=[]; me.stam=0; me.spent=true;
    const sweatBefore = M.fx.filter(q=>q.sweat).length;
    for (let i=0;i<90;i++){ M.advanceTire(w); tires.push(+(me._tire||0).toFixed(3)); }
    const sweatAfter = M.fx.filter(q=>q.sweat).length;
    o.ease = { t10: tires[9], t30: tires[29], t89: tires[89], sweat: sweatAfter - sweatBefore };
    o.easeRamps = tires[9] > 0.3 && tires[9] < 0.9 && tires[29] > tires[9] && tires[89] === 1;
    // 90 steps = 1.5s; the first drop comes once `_tire` passes 0.5, then one every `sweatEvery`
    const expect = Math.floor((1.5 - (tires.findIndex(t=>t>0.5)+1)/60) / F.sweatEvery) + 1;
    o.sweatOnCadence = (sweatAfter - sweatBefore) >= expect - 1 && (sweatAfter - sweatBefore) <= expect + 1;
    o.sweatExpect = expect;
    // ...and recovering eases back to EXACTLY zero
    me.stam=1; me.spent=false;
    for (let i=0;i<120;i++) M.advanceTire(w);
    o.recoversToZero = me._tire === 0;
    // A replay shows none of it: the painter reads 0 while a replay owns the screen.
    me._tire = 1; me.stam = 0; me.spent = true;
    const live = paint('footballers', Object.assign({}, me, { x:0, y:0, r:R, faceX:1, faceY:0, vx:0, vy:0 }));
    M.replay.active = true;
    const rep  = paint('footballers', Object.assign({}, me, { x:0, y:0, r:R, faceX:1, faceY:0, vx:0, vy:0 }));
    M.replay.active = false;
    const rested = paint('footballers', Object.assign({}, me, { x:0, y:0, r:R, faceX:1, faceY:0, vx:0, vy:0, _tire:0 }));
    o.replayShowsRested = diffPx(rep, rested) === 0 && diffPx(live, rested) > 300;
  }

  // ---- render only: the world is bit-identical with the tells on and off --------------
  const hashWorld = (w) => { const s = JSON.stringify(w.players.map(q=>[q.x,q.y,q.vx,q.vy,q.stam,q.spent,q.kick,q.faceX,q.faceY])) + JSON.stringify([w.ball.x,w.ball.y,w.ball.vx,w.ball.vy,w.score,w.matchT]); let h=2166136261; for (let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; };
  // ⚠️ The human runs BACK AND FORTH, never into the boards: a body pinned against the
  // wall by `integrate`'s clamp has a velocity of 0, and a sabotage that bends the SPENT
  // body's velocity (`p.vx *= 0.999` inside `advanceTire`) was INERT against it — the
  // hashes matched on a build that touched the sim. Caught only once the body had a
  // velocity to bend.
  const sim = (discs) => { M.sel.look.discs = discs; M.setMatchSeed(11); M.sel.mode='2v2'; M.startMatch(); const w=M.world; w.state='play'; w.stateT=2;
    const me = w.players[0]; let dir = 1; M.pads.p1.kick=true;
    for (let i=0;i<600;i++){
      if (Math.hypot(me.x, me.y) > 120 && (me.x*me.vx + me.y*me.vy) > 0) dir = -dir;
      M.pads.p1.dx = dir;
      M.step(w); M.advanceTrails(w); M.advanceTire(w); if (i%30===0){ M.computeCam(); M.render(); } }
    M.pads.p1.dx=0; M.pads.p1.kick=false; return { h: hashWorld(w), tire: me._tire, spent: me.spent }; };
  const simA = sim('footballers'), simB = sim('none');
  o.renderOnly = simA.h === simB.h && simA.tire === 1 && simB.tire === 0;   // ...and the tells were really ON in one arm
  o.sim = { a: simA, b: simB };
  M.applyBundle('kickabout');
  return o;
});

console.log(JSON.stringify(r,null,1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const checks = {
  defaultIsSundayLeague: r.defaultBundle === 'kickabout',
  flagOnPair: r.flagOnPair, flagNowhereElse: r.flagNowhereElse, limbSpriteLoaded: r.limbSpriteLoaded,
  trail_restIsTeam: r.slRestIsTeam, trail_sprintIsHot: r.slSprintIsHot, trail_spentIsGrey: r.slSpentIsGrey, sweats: r.slSweats,
  control_plainTrailUnchanged: r.grAllTeam, control_plainReallySprinted: r.grReallySprinted, control_plainNoSweat: r.grNoSweat,
  figureSlumps: r.figSlumps, figureNoFurther: r.figNoFurther, plainDiscIgnoresTire: r.plainDiscIgnoresTire, pitchFootballerSlumps: r.pitchFootballerSlumps,
  easeRamps: r.easeRamps, sweatOnCadence: r.sweatOnCadence, recoversToZero: r.recoversToZero, replayShowsRested: r.replayShowsRested,
  renderOnly: r.renderOnly,
  noErrors: errors.length === 0,
};
const fails = Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
if (fails.length) console.log('FAILED:', fails);
console.log('RESULT:', fails.length ? 'FAIL' : 'ALL PASS');
await b.close(); process.exit(fails.length ? 1 : 0);
