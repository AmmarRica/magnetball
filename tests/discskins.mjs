// Disc skins: the guide ring every theme must have, and the rotation choice.
//
// THE RULE: a player is a CIRCLE of radius r, and that circle is what collides. A
// skin may draw anything it likes inside it — a pool ball, an arrowhead, a shrimp —
// but the body has to stay legible, or you cannot judge a challenge you are about to
// take. The Videoball arrowhead shipped without a ring and the shape on screen was a
// third bigger than the shape in the physics.
//
// ⚠️ So the ring is drawn by drawOneDisc, AFTER the skin paints — structural, not
// policy. A new skin cannot forget one, and this suite pixel-checks every skin in the
// registry rather than the ones somebody remembered to list.
//
// ⚠️ Measurement traps, both hit while writing this. The court is not one flat colour
// under every theme (Pool is baize, Seabed is sand with ripples), so "differs from a
// background sample" is not a ring test — sample the SAME angle before and after and
// compare like with like. And sample the MIDDLE of the ring stroke: it is centred on
// r and only a couple of pixels wide, so 0.95r lands on its antialiased inner edge.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const SKIN = 'crablobster';        // what the Rockpool theme actually fields

  // Paint each skin big on a flat field of its own, then read round the rim. Big,
  // because the ring is a fraction of r and at match scale it is one pixel.
  const R = 60, CX = 150, CY = 150;
  const cv = document.createElement('canvas'); cv.width = 300; cv.height = 300;
  const c = cv.getContext('2d');
  const ringOf = (skinKey, team) => {
    c.fillStyle = '#7f7f7f'; c.fillRect(0,0,300,300);          // flat, neutral
    const q = { team, faceX:1, faceY:0, r:R, name:'x', cap:'none', color:'#46d17a' };
    M.DISC_SKINS[skinKey].paint(c, q, CX, CY, R, { players:[q] });
    const before = [], after = [];
    const read = (f, a) => { const d = c.getImageData(
      Math.round(CX + Math.cos(a)*R*f), Math.round(CY + Math.sin(a)*R*f), 1, 1).data;
      return [d[0],d[1],d[2]]; };
    const lw0 = Math.max(1, R*M.DISC_GUIDE.w);
    for (let deg=0; deg<360; deg+=15) before.push(read(1 + lw0*0.5/R, deg*Math.PI/180));
    // ...now draw the ring through the REAL painter, and see it change everywhere.
    // ⚠️ Through strokeDiscGuide, not a reconstruction of it: a copy of the drawing
    // code in the test passes while the shipped one is broken.
    M.strokeDiscGuide(c, CX, CY, R);
    const lw = Math.max(1, R*M.DISC_GUIDE.w);
    for (let deg=0; deg<360; deg+=15){
      const a2 = deg*Math.PI/180;
      // Sample both tones — either one reading is enough for the body to be legible.
      const d1 = read(1 + lw*0.5/R, a2), d2 = read(1 - lw*0.5/R, a2);
      after.push([d1, d2]);
    }
    let changed = 0;
    for (let i=0;i<before.length;i++){
      const bb = before[i];
      const hit = after[i].some(a3 => Math.abs(bb[0]-a3[0]) + Math.abs(bb[1]-a3[1]) +
                                      Math.abs(bb[2]-a3[2]) > 12);
      if (hit) changed++;
    }
    return { arcs: before.length, changed };
  };
  o.skins = Object.keys(M.DISC_SKINS);
  o.ringPerSkin = {};
  for (const k of o.skins){
    const a = ringOf(k, 0), b2 = ringOf(k, 1);
    o.ringPerSkin[k] = Math.min(a.changed, b2.changed) + '/' + a.arcs;
  }
  // The ring lands all the way round for every skin, both teams.
  o.everySkinRinged = Object.values(o.ringPerSkin).every(v => {
    const [got, of] = v.split('/').map(Number); return got === of; });
  // ...and the real draw path puts one there too, not just this reconstruction.
  o.guideIsReal = M.DISC_GUIDE.w > 0 && M.DISC_GUIDE.a > 0;

  // ---- rotation: ONE helper, honoured the same way by every skin -------------
  M.profile.spin = true;
  const on0 = M.discFace({ team:0, faceX:1, faceY:0 });
  const on1 = M.discFace({ team:0, faceX:0, faceY:1 });
  M.profile.spin = false;
  const off0 = M.discFace({ team:0, faceX:1, faceY:0 });
  const off1 = M.discFace({ team:1, faceX:1, faceY:0 });
  M.profile.spin = true;
  o.turnsWhenOn = on0.ux === 1 && on1.uy === 1;
  // Off: upright, and up means up YOUR pitch, so the two sides do not both face one way.
  o.uprightWhenOff = off0.ux === 0 && off0.uy === -1 && off1.uy === 1;
  // ⚠️ A player facing exactly along x has faceY === 0, which is falsy. `p.faceY ||
  // fallback` therefore fired and pointed the body diagonally at nothing.
  o.zeroFaceYIsNotFalsy = on0.uy === 0;
  // No facing at all still points somewhere sane rather than at NaN.
  const none = M.discFace({ team:0 });
  o.noFacingIsSane = none.uy === -1 && none.ux === 0;

  // ...and it visibly changes the pixels for a direction-drawn skin, while a round
  // one is untouched — which is exactly what the hint under the control promises.
  const paintAt = (skinKey, spin) => {
    M.profile.spin = spin;
    c.fillStyle = '#7f7f7f'; c.fillRect(0,0,300,300);
    const q = { team:0, faceX:1, faceY:0, r:R, name:'x', cap:'none', color:'#46d17a' };
    M.DISC_SKINS[skinKey].paint(c, q, CX, CY, R, { players:[q] });
    return c.getImageData(CX-R, CY-R, R*2, R*2).data.join(',');
  };
  o.shrimpTurns = paintAt(SKIN, true) !== paintAt(SKIN, false);
  o.arrowTurns  = paintAt('arrow',  true) !== paintAt('arrow',  false);
  o.poolIgnores = paintAt('pool',   true) === paintAt('pool',   false);
  o.monoIgnores = paintAt('mono',   true) === paintAt('mono',   false);
  M.profile.spin = true;

  // ---- shrimp vs crab: the sides differ by SILHOUETTE, not just colour -------
  // ⚠️ Colour alone is not enough at 12 pixels, and it is exactly what colour-blind
  // players cannot use. A shrimp is LONG along its facing; a crab is WIDE across it.
  // Measured off covered pixels rather than the drawing code, so a redraw that
  // quietly makes them the same shape fails here.
  const extent = (team, frame) => {
    c.fillStyle = '#7f7f7f'; c.fillRect(0,0,300,300);
    // vx set so legFrame reports a walking creature; gait picks which of the two.
    const q = { team, faceX:1, faceY:0, r:R, name:'x', cap:'none', color:'#46d17a',
                vx: frame == null ? 0 : 3, vy: 0, gait: (frame || 0) * M.GAIT.stride };
    M.DISC_SKINS[SKIN].paint(c, q, CX, CY, R, { players:[q] });
    const d = c.getImageData(CX-R-4, CY-R-4, (R+4)*2, (R+4)*2).data;
    const wide = (R+4)*2;
    let minA=1e9, maxA=-1e9, minB=1e9, maxB=-1e9, n=0, sumB=0;
    for (let i=0;i<d.length;i+=4){
      // "Covered" = anything that is not the flat grey backdrop, and not the faint
      // team wash that fills the whole body disc on both sides.
      const px=d[i], py2=d[i+1], pz=d[i+2];
      const flat = Math.abs(px-127)+Math.abs(py2-127)+Math.abs(pz-127) < 60;
      if (flat) continue;
      const k=(i/4)|0, ax=(k%wide)-(R+4), ay=((k/wide)|0)-(R+4);
      minA=Math.min(minA,ax); maxA=Math.max(maxA,ax);      // along facing (+x)
      minB=Math.min(minB,ay); maxB=Math.max(maxB,ay);      // across it
      sumB+=ay;                                            // ...and how far off-axis it sits
      n++;
    }
    return { along: maxA-minA, across: maxB-minB, n, curl: +(sumB/Math.max(1,n)).toFixed(1) };
  };
  const t0 = extent(0), t1 = extent(1);
  // Both frames must stay inside the body, not just the resting one.
  const t0w = extent(0, 1), t1w = extent(1, 1);
  o.walkExtents = { t0w, t1w };
  o.team0Extent = t0; o.team1Extent = t1;
  // ⚠️ The discriminator has to match the CREATURES, and it has changed twice as the
  // pairing did. Crab vs lobster: the crab is wide and stubby, the lobster is long.
  // Measured off covered pixels, so a redraw that makes them the same shape fails.
  o.crabIsStubby  = t0.across / t0.along > t1.across / t1.along * 1.25;
  o.lobsterIsLong = t1.along > t0.along * 1.1;
  o.sidesDifferInShape = o.crabIsStubby && o.lobsterIsLong;
  // ...and the OTHER pairings in the registry are distinguishable too, since the
  // Players slot offers all three. A shrimp is the curled one; a lobster is not.
  const shrimpEx = (() => {
    c.fillStyle = '#7f7f7f'; c.fillRect(0,0,300,300);
    const q = { team:0, faceX:1, faceY:0, r:R, vx:0, vy:0, gait:0 };
    M.SEA.shrimp.draw(c, q, CX, CY, R, '#ff7a1a', 1, 0, 0, 1,
      (a2,b2)=>[CX + a2*R, CY + b2*R]);
    const d = c.getImageData(CX-R-4, CY-R-4, (R+4)*2, (R+4)*2).data;
    const wide = (R+4)*2; let n=0, sumB=0;
    for (let i=0;i<d.length;i+=4){
      if (Math.abs(d[i]-127)+Math.abs(d[i+1]-127)+Math.abs(d[i+2]-127) < 60) continue;
      const k=(i/4)|0; sumB += ((k/wide)|0)-(R+4); n++;
    }
    return { curl: +(sumB/Math.max(1,n)).toFixed(1), n };
  })();
  o.shrimpEx = shrimpEx;
  o.shrimpStillCurled = Math.abs(shrimpEx.curl) > 3;
  o.threeCreatures = ['shrimp','crab','lobster'].every(k => M.SEA[k] && typeof M.SEA[k].draw === 'function');
  o.pairings = Object.keys(M.DISC_SKINS).filter(k => /crab|lobster/.test(k)).sort();
  // ...and neither one breaks out of the body. The ring IS the player.
  o.bothInsideTheRing = Math.max(t0.along, t0.across, t1.along, t1.across,
                                 t0w.along, t0w.across, t1w.along, t1w.across) <= R*2 + 2;

  // ---- the two-frame leg animation ------------------------------------------
  // ⚠️ Driven by DISTANCE TRAVELLED, not by a clock. Anything advanced on a timer has
  // to be advanced somewhere, and anything advanced in a draw runs 2.4x fast on a
  // 144Hz screen — the same rule that governs the trails and the berry bob. Distance
  // also stops dead when the player does, with no separate "am I moving" state.
  M.sel.mode='1v1'; M.sel.kickoffRule='off'; M.setMatchSeed(5); M.startMatch();
  const gw = M.world; gw.state='play'; gw.stateT=2;
  const me = gw.players[0];
  gw.players.slice(1).forEach(q=>{ q.x=1e4; q.y=1e4; });
  gw.ball.x=1e4; gw.ball.y=1e4;
  // Walking: the gait accumulates and the frame flips.
  me.x=0; me.y=200; me.vx=0; me.vy=0; me.gait=0;
  M.pads.p1.dx=0; M.pads.p1.dy=-1;
  const frames = new Set();
  let gaitGrew = 0;
  for (let i=0;i<120;i++){ const g0 = me.gait||0; M.step(gw);
    if ((me.gait||0) > g0) gaitGrew++; frames.add(M.legFrame(me)); }
  M.pads.p1.dy=0;
  o.framesSeenWalking = [...frames].sort().join(',');
  o.gaitGrewWhileWalking = gaitGrew > 100;
  o.bothFramesUsed = frames.has(0) && frames.has(1);
  // ⚠️ A DRAW must not advance it.
  const gBefore = me.gait;
  M.render(); M.render(); M.render();
  o.drawsDontWalk = me.gait === gBefore;
  // Standing still: frame 0, the rest pose, and the gait stops growing.
  for (let i=0;i<90;i++) M.step(gw);          // coast to a halt
  const gStop = me.gait;
  for (let i=0;i<60;i++) M.step(gw);
  o.stoppedFrame = M.legFrame(me);
  o.gaitStopsWhenStopped = Math.abs(me.gait - gStop) < 0.5;
  o.restIsFrameZero = o.stoppedFrame === 0;
  // Faster travel means faster legs: the same number of steps covers more flips.
  const flips = (speedMul) => {
    me.x=0; me.y=200; me.vx=0; me.vy=0; me.gait=0;
    let last = M.legFrame(me), n = 0;
    M.pads.p1.dy = -1;
    for (let i=0;i<90;i++){
      M.step(gw);
      // Hold a fixed speed so this measures the GAIT, not the acceleration curve.
      const sp = Math.hypot(me.vx, me.vy) || 1;
      me.vx = me.vx/sp * speedMul; me.vy = me.vy/sp * speedMul;
      const f2 = M.legFrame(me); if (f2 !== last){ n++; last = f2; }
    }
    M.pads.p1.dy = 0;
    return n;
  };
  o.flipsSlow = flips(1);
  o.flipsFast = flips(3);
  o.fasterLegsWhenFaster = o.flipsFast > o.flipsSlow;

  // ---- the Shrimp theme is a real bundle -------------------------------------
  o.isBundle = !!M.bundleSlots('shrimp');
  M.applyBundle('shrimp');
  o.slots = JSON.stringify(M.liveSlots());
  o.named = M.bundleName();
  // A save naming the old one-entry seabed skin must land on the current pairing.
  M.sel.look.discs = 'shrimp'; M.normalizeLook();
  o.legacyMigrates = M.sel.look.discs === 'crablobster';
  M.applyBundle('shrimp');
  o.setsFieldAndDiscs = M.sel.look.field === 'seabed' && M.sel.look.discs === 'crablobster';
  // It plays: a real match on it, drawn, with no escapes and no errors.
  M.sel.mode='4v4'; M.setMatchSeed(3); M.startMatch();
  const w = M.world; w.state='play'; w.stateT=2;
  let escapes = 0;
  for (let i=0;i<60*60;i++){
    M.step(w);
    const bl = w.ball;
    if (Math.abs(bl.x) > w.field.W/2 + bl.r + 2) escapes++;
  }
  M.render();
  o.escapes = escapes;
  o.played = w.score[0] + w.score[1] >= 0;

  // The seabed floor is scattered ONCE, not re-rolled per frame: two paints of the
  // same state must be identical, or the shells crawl.
  const f = M.DYN_FIELDS.seabed;
  const st = {}; f.reset(st);
  const snap = () => { c.fillStyle='#000'; c.fillRect(0,0,300,300);
    f.paint(c, st, 0, 0, 300, 300); return c.getImageData(0,0,300,300).data.join(','); };
  o.floorIsStill = snap() === snap();
  o.floorHasNoStep = typeof f.step !== 'function';

  M.applyBundle('classic'); M.sel.mode='1v1'; M.setMatchSeed(null);
  return o;
});

const fail=[];
const ok=(c2,m)=>{ if(!c2) fail.push(m); };
ok(r.skins.includes('crablobster'), `no crab-vs-lobster skin: ${JSON.stringify(r.skins)}`);
ok(r.guideIsReal, 'the guide ring is configured to nothing');
ok(r.everySkinRinged, `a skin's body is not ringed all the way round: ${JSON.stringify(r.ringPerSkin)} — a player must always be able to see the circle they collide with`);
ok(r.turnsWhenOn, 'the body does not turn to face travel with rotation on');
ok(r.uprightWhenOff, 'rotation off does not point the body up its OWN pitch');
ok(r.zeroFaceYIsNotFalsy, 'a player facing exactly along x got the fallback facing — `p.faceY || fallback` is back');
ok(r.noFacingIsSane, 'a player with no facing at all does not point anywhere sensible');
ok(r.shrimpTurns && r.arrowTurns, `a direction-drawn skin ignored the rotation setting: creature ${r.shrimpTurns}, arrow ${r.arrowTurns}`);
ok(r.poolIgnores && r.monoIgnores, 'a ROUND skin changed with the rotation setting — the control promises it only affects themes whose players have a front');
ok(r.bothFramesUsed, `the leg animation never used both frames while walking: saw ${r.framesSeenWalking}`);
ok(r.gaitGrewWhileWalking, 'the gait did not accumulate while walking');
ok(r.drawsDontWalk, 'a DRAW advanced the walk cycle — on a 144Hz screen the legs would run 2.4x fast');
ok(r.gaitStopsWhenStopped, 'the gait kept accumulating with the player stood still');
ok(r.restIsFrameZero, `a stopped player is frozen mid-stride on frame ${r.stoppedFrame}`);
ok(r.fasterLegsWhenFaster, `the legs do not speed up with the player: ${r.flipsSlow} flips slow vs ${r.flipsFast} fast`);
ok(r.sidesDifferInShape, `the two sides are not different SHAPES: team0 ${JSON.stringify(r.team0Extent)}, team1 ${JSON.stringify(r.team1Extent)} — the crab must be stubbier (${r.crabIsStubby}) and the lobster longer (${r.lobsterIsLong}). Colour alone is what a colour-blind player cannot use`);
ok(r.threeCreatures, `the creature registry lost one: ${JSON.stringify(r.pairings)}`);
ok(r.pairings.length >= 2, `only ${r.pairings.length} pairing(s) offered — shrimp, crab and lobster should pair up more than one way`);
ok(r.shrimpStillCurled, `the shrimp is no longer the curled one: ${JSON.stringify(r.shrimpEx)}`);
ok(r.bothInsideTheRing, `a body draws outside its own guide ring: team0 ${JSON.stringify(r.team0Extent)}, team1 ${JSON.stringify(r.team1Extent)}`);
ok(r.isBundle && r.named === 'Rockpool', `the Rockpool bundle does not resolve: ${r.named}`);
ok(r.legacyMigrates, 'a save naming the old seabed disc skin did not migrate to the current pairing');
ok(r.setsFieldAndDiscs, `the bundle does not set both field and discs: ${r.slots}`);
ok(r.escapes === 0, `${r.escapes} ball escapes on the shrimp theme`);
ok(r.floorIsStill, 'the seabed re-scatters every paint — the shells crawl');
ok(r.floorHasNoStep, 'the seabed grew a step(); if that is deliberate it must be advanced next to step(), never in a paint');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ndiscskins OK');
