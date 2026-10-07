// STAMINA TELLS — on the Sunday League pair the trail is FOOTSTEPS, shown only while
// sprinting; a spent figure slumps and sweats; a standing figure tucks its arms in.
//
// THE ASK, in two batches. First, after a design pass that found the kick ring doing too many
// jobs: *"implement the trail and 6. Only implement on the default theme"* — a HOT trail
// while sprinting and a slump-and-sweat when spent. Then: *"hide the ring for now. Have the
// trail look like foot steps so it would alternate sides. If player is standing still then
// their arms should come closer to their body. Have the trail only show while sprinting."*
// The ring's hide is pinned in tests/tells.mjs (its home); everything else is here.
//
// ⚠️ MEASURED ON THE BUILD BEFORE EACH BATCH, same probes. Before the first: the dots painter
// was handed the team colour in every state and the spent figure differed from the rested one
// by **0 pixels**. Before the second: a trail record carried `x,y,a` and nothing else, a jog
// and a sprint left the same dots, and the hand reached **1.22r across standing against 1.23r
// running** on the sprite skin (1.43 / 1.43 inked) — arms held out at rest exactly as at a
// sprint. Those are the controls every number below is a difference against.
//
// ⚠️ THE GATE IS THE LOAD-BEARING HALF. "Only on the default theme" is a claim about every
// OTHER theme, so a plain disc on grass with the dot trail is measured in the same run and
// must read exactly what it read before: a team-coloured tail jogging, sprinting and spent
// alike, zero figure change, no sweat. A build that gates every trail passes every Sunday
// League check on its own.
//
// ⚠️ Measurement traps. The trail is read off what the REAL painter is HANDED (the look's
// `draw` is wrapped and the call goes through `drawDiscTrails`), because a print is a few
// antialiased pixels over mown stripes; the alternation is measured on a flat canvas through
// the same painter with records tagged the way `advanceTrails` tags them. The FIGURE is
// measured in pixels on a flat backdrop, the `footballers` suite's instrument. The human has
// to RUN (back and forth, never pinned on an axis — `auto` turns the pitch on this page), or
// no record is dropped at all. And both eases (`_tire`, `_rest`) are ramps, so a body changed
// this step reads nothing — step until it settles.
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
  // ⚠️ AUTO-QUALITY DROPS THE TRAILS FIRST, and a long synchronous evaluate starves the
  // page's own frame loop — the first run of this probe read `null` for a tail because
  // `fullQuality()` had gone false under the stall. The pin exists for exactly this.
  M.qualityPin(true);
  o.defaultBundle = M.currentBundle();                 // the theme this is FOR is the one that ships
  o.bundleTrail = { kickabout: M.bundleSlots('kickabout').trail, kickink: M.bundleSlots('kickink').trail, def: M.defaultSel().look.trail };
  o.stepsIsALook = !!(M.TRAIL_LOOKS.steps && typeof M.TRAIL_LOOKS.steps.draw === 'function' && M.TRAIL_LOOKS.steps.name);
  o.flagOnPair = !!(M.DISC_SKINS.footballers.staminaTells && M.DISC_SKINS.footballersink.staminaTells);
  o.flagNowhereElse = Object.keys(M.DISC_SKINS).filter(k => M.DISC_SKINS[k].staminaTells)
                        .sort().join(',') === 'footballers,footballersink';

  // Wait for the limb plates: the figure is measured with the pack PRESENT.
  const warmLimb = () => M.klimbSprite('arm', M.TH.teamRed, M.kitPerson({ name:'Mike' })[1], M.TH.discRim || '#151515');
  for (let i=0;i<80;i++){ if (warmLimb()) break; await new Promise(res=>setTimeout(res,40)); }
  o.limbSpriteLoaded = !!warmLimb();

  // ---- the trail, through the real call path --------------------------------------
  const handed=[]; const reals={};
  for (const key of ['steps','dots']){
    reals[key] = M.TRAIL_LOOKS[key].draw;
    M.TRAIL_LOOKS[key].draw = function(c,pts,n,col,rr,team){
      handed.push({ look:key, col, n, a:+c.globalAlpha.toFixed(2),
                    sp: Array.from({length:n}, (_,k)=>!!pts[k].sp), s: Array.from({length:n}, (_,k)=>pts[k].s) });
      return reals[key].call(this,c,pts,n,col,rr,team); };
  }
  M.sel.mode='1v1'; M.sel.lobby='off'; M.sel.length='5'; M.sel.controllers='off'; M.sel.adsOn='off';
  M.sel.sprint='on';
  const play = () => {
    M.setMatchSeed(3); M.startMatch(); const w=M.world; w.state='play'; w.stateT=2;
    const me = w.players[0];
    const bot = w.players[1];
    // ⚠️ The body RUNS — back and forth through the middle — and NOTHING IS PINNED ON AN
    // AXIS: on this 1280-wide page `auto` turns the pitch, so the stick's x is WORLD y
    // (`applySeatRotation`) — pinning `me.y = 0` every step held the body dead still.
    // ⚠️ WITH HYSTERESIS: turned round at 120 and not again until back inside 60. Flipping
    // on "outside and moving outward" alone left a JOGGING body dithering at the line —
    // flip, coast out, flip back — at a speed that dropped one record in sixty steps, and
    // the first run of the rest probe read a tail of 1.
    let dir = 1, turned = false;
    const run = (n, kick) => { M.pads.p1.dy=0; M.pads.p1.kick=kick;
      for (let i=0;i<n;i++){
        const d = Math.hypot(me.x, me.y);
        if (d > 120 && !turned && (me.x*me.vx + me.y*me.vy) > 0){ dir = -dir; turned = true; }
        if (d < 60) turned = false;
        M.pads.p1.dx = dir;
        bot.x=0; bot.y=-300; bot.vx=bot.vy=0; M.step(w); M.advanceTrails(w); M.advanceTire(w); } };
    // The bot's own records are emptied before each read, so whatever is handed FIRST is
    // the human's — and with the gate holding the human's back, nothing at all is handed.
    const mine = () => { handed.length=0; if (M.discTrails[1]) M.discTrails[1].length = 0;
      M.computeCam(); M.render(); return handed.length ? handed[0] : null; };
    const out = {};
    // (60 steps of jogging: a body setting off from the spot covers ~85 units in 30, which is
    // three records — too few to say "none of them was shown" with any force.)
    run(60,false); out.rest = mine();   out.restState   = { stam: +me.stam.toFixed(2), spent: me.spent, sprinting: me.sprinting, records: M.discTrails[0].length };
    run(40,true);  out.sprint = mine(); out.sprintState = { stam: +me.stam.toFixed(2), spent: me.spent, sprinting: me.sprinting, records: M.discTrails[0].length };
    // the records themselves, as the sampler left them
    out.recordKeys = Object.keys(M.discTrails[0][0] || {}).sort().join(',');
    out.recordSides = M.discTrails[0].map(d => d.s);
    out.recordSp = M.discTrails[0].map(d => d.sp);
    run(200,true); out.spent = mine();  out.spentState  = { stam: +me.stam.toFixed(2), spent: me.spent, sprinting: me.sprinting, records: M.discTrails[0].length };
    out.team = me.team; out.fxSweat = M.fx.filter(q=>q.sweat).length;
    M.pads.p1.dx=0; M.pads.p1.kick=false;
    return out;
  };
  const teamCol = M.TH.teamRed;
  // Sunday League (the shipped default)
  const sl = play();
  o.sl = sl;
  o.slTrailIsSteps  = !!sl.sprint && sl.sprint.look === 'steps';
  o.slRestHidden    = sl.rest === null && sl.restState.records > 3 && !sl.restState.sprinting;   // records exist, none shown
  o.slSprintShown   = !!sl.sprint && sl.sprintState.sprinting && !sl.sprintState.spent && sl.sprint.n > 0 &&
                      sl.sprint.sp.every(Boolean) && sl.sprint.col === M.kickRingInk() && sl.sprint.col !== teamCol;
  o.slSpentHidden   = sl.spent === null && sl.spentState.spent && sl.spentState.records > 3;
  o.slSweats        = sl.fxSweat > 0;
  // the sampler tags every record with its stride side and the sprint flag, and the sides
  // really alternate over a run (both values present, in runs — not one per record)
  const sides = sl.recordSides, flips = sides.filter((s,i)=>i>0 && s!==sides[i-1]).length;
  o.recordsTagged = sl.recordKeys === 'a,s,sp,x,y' && sides.every(s => s === 1 || s === -1) &&
                    sides.includes(1) && sides.includes(-1) && flips >= 2 && flips < sides.length - 1 &&
                    sl.recordSp.some(Boolean);
  o.recordFlips = { flips, n: sides.length };
  // ...and the CONTROL: plain discs on grass with the dot trail, same seed, same drive —
  // every state handed, every one in the team colour, exactly as before either batch.
  M.sel.look.palette='grass'; M.sel.look.discs='none'; M.sel.look.trail='dots'; M.applyTheme('grass');
  const teamColG = M.TH.teamRed;
  const gr = play();
  o.gr = gr;
  o.grAllShown = !!gr.rest && !!gr.sprint && !!gr.spent &&
    [gr.rest, gr.sprint, gr.spent].every(h => h.look === 'dots' && h.col === teamColG && h.a === 1 && h.n >= 3);
  o.grReallySprinted = gr.sprintState.sprinting && gr.spentState.spent;   // or "unchanged" is vacuous
  o.grNoSweat = gr.fxSweat === 0;
  for (const key of ['steps','dots']) M.TRAIL_LOOKS[key].draw = reals[key];
  M.applyBundle('kickabout');

  // ---- the footprints alternate sides, one per half-stride: the real painter on a flat canvas ----
  // Records along +x tagged the way `advanceTrails` tags them (the side flips every half of
  // `gaitPeriod()`), spaced so neighbouring prints cannot merge into one run.
  {
    const W2=420, H2=120, c2=document.createElement('canvas'); c2.width=W2; c2.height=H2; const cc=c2.getContext('2d');
    const half = M.gaitPeriod()/2, GAP = 14, rr = 20, Y = 60;
    const pts=[]; for (let k=0;k<24;k++){ const x = 24 + k*GAP; pts.push({ x, y: Y, a: 1, s: Math.floor((k*GAP)/half) % 2 ? -1 : 1, sp: true }); }
    const flips2 = pts.filter((q,i)=>i>0 && q.s!==pts[i-1].s).length;
    cc.fillStyle='#7f7f7f'; cc.fillRect(0,0,W2,H2);
    M.TRAIL_LOOKS.steps.draw(cc, pts, pts.length, '#ffffff', rr);
    const d = cc.getImageData(0,0,W2,H2).data;
    const ink = (i) => d[i]+d[i+1]+d[i+2] > 127*3 + 60;
    let above=0, below=0, onLine=0; const cols = new Array(W2).fill(false);
    for (let i=0;i<d.length;i+=4){ if (!ink(i)) continue; const k=i/4, x=k%W2, y=Math.floor(k/W2); cols[x]=true;
      if (y < Y-1) above++; else if (y > Y+1) below++; else onLine++; }
    let runs=0; for (let x=1;x<W2;x++) if (cols[x] && !cols[x-1]) runs++;
    o.prints = { above, below, onLine, runs, flips: flips2 };
    // both sides inked about equally (alternating), and one print per side change, not one per record
    o.printsAlternate = above > 150 && below > 150 && above < below*1.6 && below < above*1.6;
    o.onePrintPerStride = Math.abs(runs - flips2) <= 1 && flips2 >= 6 && runs < pts.length - 4;
    // ...and the picker tile's untagged points still draw a two-sided pattern (the fallback)
    const plain = pts.map(q => ({ x:q.x, y:q.y, a:1 }));
    cc.fillStyle='#7f7f7f'; cc.fillRect(0,0,W2,H2);
    M.TRAIL_LOOKS.steps.draw(cc, plain, plain.length, '#ffffff', rr);
    const d2 = cc.getImageData(0,0,W2,H2).data; let ab2=0, be2=0;
    for (let i=0;i<d2.length;i+=4){ if (d2[i]+d2[i+1]+d2[i+2] <= 127*3+60) continue; const y=Math.floor((i/4)/W2); if (y < Y-1) ab2++; else if (y > Y+1) be2++; }
    o.untaggedTwoSided = ab2 > 100 && be2 > 100;
  }

  // ---- the figure, in pixels on a flat backdrop (the footballers suite's instrument) ----
  const R=60, W=300, CX=150, CY=150;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=W; const c=cv.getContext('2d');
  const BG=[127,127,127];
  const base = (opt) => Object.assign({ team:0, faceX:1, faceY:0, r:R, name:'Mike', cap:'none', vx:0, vy:0, gait:0 }, opt||{});
  const paint = (skin, q) => { c.fillStyle='#7f7f7f'; c.fillRect(0,0,W,W); M.DISC_SKINS[skin].paint(c,q,CX,CY,R,{players:[q]}); return c.getImageData(0,0,W,W).data; };
  const near = (d,i,col,tol) => Math.abs(d[i]-col[0])+Math.abs(d[i+1]-col[1])+Math.abs(d[i+2]-col[2]) <= tol;
  const hex = (h) => [1,3,5].map(k=>parseInt(h.substr(k,2),16));
  const diffPx = (a,d) => { let n=0; for (let i=0;i<a.length;i+=4) if (Math.abs(a[i]-d[i])+Math.abs(a[i+1]-d[i+1])+Math.abs(a[i+2]-d[i+2])>24) n++; return n; };
  const scan = (d, pick) => { let m=0, n=0, sx=0, ay2=0; for (let i=0;i<d.length;i+=4){ const k=(i/4)|0, ax=(k%W)-CX, ay=((k/W)|0)-CY; if (!pick(d,i)) continue; m=Math.max(m, Math.hypot(ax,ay)); ay2=Math.max(ay2, Math.abs(ay)); sx+=ax; n++; } return { reach:+(m/R).toFixed(3), across:+(ay2/R).toFixed(3), along: n? +(sx/n/R).toFixed(3):null, n }; };
  const anyInk = (d,i) => !near(d,i,BG,40);
  const hairCol = hex(M.kitPerson({name:'Mike'})[0]);
  const isHair = (d,i) => near(d,i,hairCol,30);
  const skinCol = hex(M.kitPerson({name:'Mike'})[1]);
  const isSkin = (d,i) => near(d,i,skinCol,40);
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
    // ⚠️ ARMS IN AT A STANDSTILL: the SKIN's reach ACROSS (the hand is the furthest skin
    // across; the feet sit at 0.82 and the head at 0.5) standing against running, and the
    // arm still THERE standing — "closer" is not "gone". Measured before: 1.217 / 1.233
    // (sprite) and 1.433 / 1.433 (inked). An explicit `_rest` of 1 and 0 must bracket it,
    // and `_rest` 0.5 must sit between — the ease is a ramp the painter honours.
    const stand = paint(skin, base()), run = paint(skin, base({ vx:3, gait: M.gaitPeriod()*0.25 }));
    const skStand = scan(stand, isSkin), skRun = scan(run, isSkin);
    const restIn = scan(paint(skin, base({ _rest:1 })), isSkin).across;
    const restOut = scan(paint(skin, base({ _rest:0 })), isSkin).across;
    const restMid = scan(paint(skin, base({ _rest:0.5 })), isSkin).across;
    f.hand = { stand: skStand.across, run: skRun.across, standPix: skStand.n, restIn, restOut, restMid };
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
  o.armsInAtRest = ['footballers','footballersink'].every(k => { const h = o.fig[k].hand;
    return h.stand <= h.run - 0.12 && h.standPix > 60 &&                     // in by an eighth of a radius, and still drawn
           Math.abs(h.restIn - h.stand) < 0.02 && h.restOut >= h.run - 0.02 &&  // `_rest` 1 is standing, 0 is running
           h.restMid > h.restIn + 0.03 && h.restMid < h.restOut - 0.03; });  // ...and half is between
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
    // ⚠️ ONLY `_tire` MOVES between the two frames (the kick ring, were it drawn, recolours
    // on `spent`; it is hidden now, but the probe keeps the discipline).
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

  // ---- the eases and the sweat, through the real step-side function -----------------
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
    // `_rest`: 0 on the move, then a RAMP to exactly 1 once the body stands still. ⚠️ A body
    // fresh from `startMatch` is STANDING, so `_rest` is born at 1 — it has to be run long
    // enough to settle at 0 first (ten steps read 0.22, mid-ease, and the ramp check below
    // then started from the wrong end).
    me.vx = 3; me.vy = 0; for (let i=0;i<60;i++) M.advanceTire(w);
    const restMoving = me._rest;
    me.vx = 0; me.vy = 0; const rests=[]; for (let i=0;i<60;i++){ M.advanceTire(w); rests.push(+me._rest.toFixed(3)); }
    o.rest = { moving: restMoving, r0: rests[0], r5: rests[5], r59: rests[59], between: rests.filter(v => v > 0 && v < 1).length };
    o.restRamps = restMoving === 0 && rests[0] > 0 && rests[0] < 0.5 && rests[5] > rests[0] && rests[59] === 1 && o.rest.between >= 5;
    // A replay shows none of it: the painter reads 0 slump while a replay owns the screen,
    // and the arms off `running` rather than off the live body's `_rest`.
    me._tire = 1; me.stam = 0; me.spent = true; me._rest = 1;
    // ⚠️ `_feet: null` — the live body carries its PLANTED feet in world coordinates, and a
    // copy painted at the origin draws its legs out to wherever those feet were left on the
    // pitch, which put skin pixels a long way ACROSS in both arms of the arm probe and read
    // the moving replay body's arms as no further out than the standing one's.
    // (...and `name:'Mike'`: the skin tone is a hash of the NAME, and `isSkin` is Mike's.)
    const copy = (over) => Object.assign({}, me, { x:0, y:0, r:R, faceX:1, faceY:0, vx:0, vy:0, _feet:null, name:'Mike' }, over);
    const live = paint('footballers', copy());
    M.replay.active = true;
    const rep  = paint('footballers', copy());
    const repMoving = paint('footballers', copy({ vx:3, gait: M.gaitPeriod()*0.25 }));
    M.replay.active = false;
    const rested = paint('footballers', copy({ _tire:0 }));
    o.replayShowsRested = diffPx(rep, rested) === 0 && diffPx(live, rested) > 300;
    // ...a replayed body with a velocity has its arms OUT whatever `_rest` the live body holds
    o.repArms = { standing: scan(rep, isSkin).across, moving: scan(repMoving, isSkin).across, live: scan(live, isSkin).across };
    o.replayArmsFollowRunning = o.repArms.moving >= o.repArms.standing + 0.12;
  }

  // ---- render only: the world is bit-identical with the tells on and off --------------
  const hashWorld = (w) => { const s = JSON.stringify(w.players.map(q=>[q.x,q.y,q.vx,q.vy,q.stam,q.spent,q.kick,q.faceX,q.faceY])) + JSON.stringify([w.ball.x,w.ball.y,w.ball.vx,w.ball.vy,w.score,w.matchT]); let h=2166136261; for (let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; };
  // ⚠️ The human runs BACK AND FORTH, never into the boards: a body pinned against the
  // wall by `integrate`'s clamp has a velocity of 0, and a sabotage that bends the SPENT
  // body's velocity (`p.vx *= 0.999` inside `advanceTire`) was INERT against it.
  const sim = (discs, trail) => { M.sel.look.discs = discs; M.sel.look.trail = trail; M.setMatchSeed(11); M.sel.mode='2v2'; M.startMatch(); const w=M.world; w.state='play'; w.stateT=2;
    const me = w.players[0]; let dir = 1; M.pads.p1.kick=true;
    for (let i=0;i<600;i++){
      if (Math.hypot(me.x, me.y) > 120 && (me.x*me.vx + me.y*me.vy) > 0) dir = -dir;
      M.pads.p1.dx = dir;
      M.step(w); M.advanceTrails(w); M.advanceTire(w); if (i%30===0){ M.computeCam(); M.render(); } }
    M.pads.p1.dx=0; M.pads.p1.kick=false; return { h: hashWorld(w), tire: me._tire, spent: me.spent, records: M.discTrails[0].length }; };
  const simA = sim('footballers', 'steps'), simB = sim('none', 'dots');
  o.renderOnly = simA.h === simB.h && simA.tire === 1 && simB.tire === 0 && simA.records > 0;   // ...and the tells were really ON in one arm
  o.sim = { a: simA, b: simB };
  M.applyBundle('kickabout');
  return o;
});

// ---- the fold: a device still on Sunday League's old dot trail is moved to footsteps, once ----
// Three devices seeded through an init script (the `themefold` idiom): untouched (moves, SAVED,
// stamped), one that picked a trail of its own (kept), and one already stamped (kept — one-shot).
const seeded = async (js) => {
  const q = await b.newPage({ viewport:{width:1280,height:800} });
  q.on('pageerror', e => errors.push(e.message));
  await q.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await q.addInitScript(js);
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);
  const out = await q.evaluate(() => {
    const M = window.__magnet, stored = JSON.parse(localStorage.getItem('magnetball.sel') || '{}');
    return { trail: M.sel.look.trail, bundle: M.currentBundle(), stored: (stored.look || {}).trail,
             stamped: localStorage.getItem('magnetball.stepsfold') === '1' };
  });
  await q.close();
  return out;
};
const oldLook = (over = {}) => JSON.stringify({ look: Object.assign(
  { palette:'kickabout', field:'none', discs:'footballers', ball:'classic', trail:'dots', court:'', surround:'' }, over) });
const fold = {
  untouched: await seeded(`localStorage.setItem('magnetball.sel', ${JSON.stringify(oldLook())})`),
  inked:     await seeded(`localStorage.setItem('magnetball.sel', ${JSON.stringify(oldLook({ palette:'kickink', discs:'footballersink' }))})`),
  chose:     await seeded(`localStorage.setItem('magnetball.sel', ${JSON.stringify(oldLook({ trail:'comet' }))})`),
  stamped:   await seeded(`localStorage.setItem('magnetball.sel', ${JSON.stringify(oldLook())}); localStorage.setItem('magnetball.stepsfold','1')`),
};

console.log(JSON.stringify(r,null,1));
console.log('stepsfold', JSON.stringify(fold));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const checks = {
  defaultIsSundayLeague: r.defaultBundle === 'kickabout',
  bundleTrailIsSteps: r.bundleTrail.kickabout === 'steps' && r.bundleTrail.kickink === 'steps' && r.bundleTrail.def === 'steps' && r.stepsIsALook,
  flagOnPair: r.flagOnPair, flagNowhereElse: r.flagNowhereElse, limbSpriteLoaded: r.limbSpriteLoaded,
  trail_isSteps: r.slTrailIsSteps, trail_restHidden: r.slRestHidden, trail_sprintShown: r.slSprintShown, trail_spentHidden: r.slSpentHidden,
  trail_recordsTagged: r.recordsTagged, sweats: r.slSweats,
  prints_alternate: r.printsAlternate, prints_onePerStride: r.onePrintPerStride, prints_untaggedTwoSided: r.untaggedTwoSided,
  control_plainTrailUnchanged: r.grAllShown, control_plainReallySprinted: r.grReallySprinted, control_plainNoSweat: r.grNoSweat,
  figureSlumps: r.figSlumps, figureNoFurther: r.figNoFurther, armsInAtRest: r.armsInAtRest,
  plainDiscIgnoresTire: r.plainDiscIgnoresTire, pitchFootballerSlumps: r.pitchFootballerSlumps,
  easeRamps: r.easeRamps, sweatOnCadence: r.sweatOnCadence, recoversToZero: r.recoversToZero, restRamps: r.restRamps,
  replayShowsRested: r.replayShowsRested, replayArmsFollowRunning: r.replayArmsFollowRunning,
  renderOnly: r.renderOnly,
  fold_untouchedMoves: fold.untouched.trail === 'steps' && fold.untouched.bundle === 'kickabout' && fold.untouched.stored === 'steps' && fold.untouched.stamped,
  fold_inkedMoves: fold.inked.trail === 'steps' && fold.inked.bundle === 'kickink' && fold.inked.stamped,
  fold_choiceKept: fold.chose.trail === 'comet' && fold.chose.stamped,
  fold_stampedKept: fold.stamped.trail === 'dots',
  noErrors: errors.length === 0,
};
const fails = Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
if (fails.length) console.log('FAILED:', fails);
console.log('RESULT:', fails.length ? 'FAIL' : 'ALL PASS');
await b.close(); process.exit(fails.length ? 1 : 0);
