// Dynamic visual themes: a theme that owns its FIELD, and what a player IS, rather
// than just supplying a palette.
//
//  warp — black and white throughout, the pitch a starfield streaming out from the
//         centre spot, lines black. Monochrome is asserted by pixel sampling
//         (R===G===B), because that's the claim the theme is actually making.
//  pool — a pool table, players as numbered balls, team 0 solids vs team 1 stripes.
//
// The field state advances in the STEP loop, never in a draw — the same rule the
// motion trails follow. That's asserted directly: rendering twice without stepping
// must produce an identical frame.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:1100} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const cv=document.getElementById('game'), c2=cv.getContext('2d');
  const DPR = cv.width / cv.clientWidth;
  const frame = () => { const d=c2.getImageData(0,0,cv.width,cv.height).data;
    let h=0; for(let i=0;i<d.length;i+=97) h=(h*31+d[i])|0; return h; };
  const at = (wxv,wyv) => { const [sx,sy]=M.screenPt(M.wx(wxv), M.wy(wyv));
    const d=c2.getImageData(Math.round(sx*DPR), Math.round(sy*DPR), 1, 1).data; return [d[0],d[1],d[2]]; };

  const setup = th => {
    M.applyBundle(th);
    M.sel.mode='2v2'; M.sel.kickoffRule='off'; M.sel.grass='stripes'; M.sel.pitch='normal';
    M.setMatchSeed(9); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2; M.computeCam();
    return w;
  };

  // ---- the mechanism --------------------------------------------------------
  o.registry = Object.keys(M.DYN_FIELDS).sort().join(',');
  // The bundle is what names the field now, not the palette object.
  o.themesDeclareReal = ['warp','pool'].every(k => {
    const s = M.bundleSlots(k); return s && s.field !== 'none' && !!M.DYN_FIELDS[s.field];
  });

  // ---- warp: the field moves, and only on a STEP ----------------------------
  const w = setup('warp');
  w.players.forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; });   // park everyone off-pitch
  w.ball.x=620; w.ball.y=620; w.ball.vx=0; w.ball.vy=0;          // ...and the ball
  M.render(); const f0 = frame();
  M.render(); o.stillWithoutStep = frame() === f0;               // a draw must not advance it
  for (let i=0;i<25;i++) M.advanceDynField();
  M.render(); o.movesWithStep = frame() !== f0;

  // ---- warp: black and white, and the lines are black -----------------------
  // Sample a grid across the pitch. Every pixel must be a pure grey (R===G===B):
  // that is exactly what "everything is black and white" means, and no palette
  // entry alone could guarantee it — the discs take their colour from the profile.
  const f = w.field, gs = [];
  for (let gx=-0.8; gx<=0.8; gx+=0.2) for (let gy=-0.8; gy<=0.8; gy+=0.2)
    gs.push(at(gx*f.W/2, gy*f.L/2));
  o.samples = gs.length;
  o.allGrey = gs.every(([R,G,B]) => R===G && G===B);
  o.offenders = gs.filter(([R,G,B]) => !(R===G && G===B)).slice(0,3);
  o.fieldIsLight = at(f.W*0.42, f.L*0.42)[0] > 200;    // white field, away from the lines
  // The boundary line, sampled ON it, is black.
  o.lineIsBlack = at(0, -f.L/2)[0] < 70;

  // ...including the players. Put one of each side on the pitch and read them.
  w.players[0].x=-60; w.players[0].y=60; w.players[0].team=0;
  w.players[1].x= 60; w.players[1].y=60; w.players[1].team=1;
  M.render();
  const d0 = at(-60,60), d1 = at(60,60);
  o.discsGrey = [d0,d1].every(([R,G,B]) => R===G && G===B);
  o.sidesDiffer = Math.abs(d0[0]-d1[0]) > 60;          // black side vs white side

  // ---- pool: a table, and stripes vs solids ---------------------------------
  const w2 = setup('pool');
  w2.players.forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; });
  w2.ball.x=620; w2.ball.y=620;
  M.render();
  const baize = at(0, f.L*0.3);
  o.baizeIsGreen = baize[1] > baize[0] + 25 && baize[1] > baize[2] + 25;
  // A pocket is dark. Sampled just inside the PITCH RECT edge (bounds, not field —
  // the rect the painter is handed), halfway down, where the side pocket sits.
  const bw = w2.bounds.halfW;
  const sum = c => c[0]+c[1]+c[2];
  // ...but off the halfway line, which crosses the side pocket at exactly y=0 and
  // washes it from black to mid-grey.
  o.pocketSample = at(-(bw - 4), 14);
  o.baizeSample = baize;
  o.pocketIsDark = sum(o.pocketSample) < sum(baize) - 60;
  // Solids vs stripes: sample the band region of each. A stripe ball is white at the
  // top of the ball and coloured across the middle; a solid is coloured at both.
  const A = w2.players.find(q=>q.team===0), B2 = w2.players.find(q=>q.team===1);
  A.x=-60; A.y=60; B2.x=60; B2.y=60;
  M.render();
  const rr = A.r;
  const topOf = q => at(q.x, q.y - rr*0.78), midOf = q => at(q.x, q.y - rr*0.30);
  const spread = c => Math.max(...c) - Math.min(...c);
  const solidTop = topOf(A), stripeTop = topOf(B2);
  o.solidTop = solidTop; o.stripeTop = stripeTop;
  // The stripe's shoulder is near-white; the solid's is not.
  o.stripeHasWhiteShoulder = Math.min(...stripeTop) > 180 && spread(stripeTop) < 40;
  o.solidShoulderColoured = spread(solidTop) > 40 || Math.min(...solidTop) < 150;
  o.poolBallsDiffer = JSON.stringify(solidTop) !== JSON.stringify(stripeTop);

  // ---- the pool table's WOOD lands where a cushion actually is --------------
  // Three things were wrong when the rails were a rectangle painted inside the play
  // area, and each one is invisible unless you sample for it.
  {
    const w3 = setup('pool');
    w3.players.forEach(q=>{ q.x=9999; q.y=9999; });
    w3.ball.x=9999; w3.ball.y=9999;
    M.computeCam(); M.render();
    const bb = w3.bounds, f3 = w3.field;
    const near = (A,B,tol) => [0,1,2].every(i=>Math.abs(A[i]-B[i]) <= (tol||26));
    const hex = h => { const n=parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; };
    const baize = hex(M.TH.court), timber = hex(M.TH.dynRail);
    // 1) THE GOAL MOUTH IS A GAP. Rails ran straight through it, so a shot went
    //    through solid timber to score.
    o.goalMouth = at(0, bb.halfL + 6);
    o.goalMouthIsNotWood = !near(o.goalMouth, timber, 40);
    // 2) THE PLAY AREA IS BAIZE ALL THE WAY TO THE LINE. Wood inside the boundary
    //    meant the ball rolled across the cushion instead of bouncing off its face.
    // ⚠️ Sample AWAY from features. The first version of this read (halfW-8, 0) and
    //    (halfW+10, 0) — which are the halfway line and the side pocket — and read
    //    white and black rather than baize and timber. Take the side boundary at
    //    0.4 of the way down, clear of the halfway line, the pocket and the goal.
    const yProbe = bb.halfL * 0.4;
    o.justInside = at(bb.halfW - 10, yProbe);
    o.insideIsBaize = near(o.justInside, baize, 30);
    o.deepInside = at(bb.halfW * 0.5, yProbe);
    o.deepIsBaize = near(o.deepInside, baize, 30);
    // 3) ...and the wood is really out there, or (1) and (2) pass on a table with
    //    no cushions at all.
    o.justOutside = at(bb.halfW + 10, yProbe);
    o.outsideIsWood = near(o.justOutside, timber, 45);
  }
  // ...and on a CHAMFERED field the cushion follows the shape, leaving no unreachable
  // court colour stranded in the cut corners.
  {
    const w4 = setup('pool');
    M.sel.field = 'octagon'; M.setMatchSeed(9); M.startMatch();
    const w5 = M.world; w5.state='play'; w5.stateT=2;
    w5.players.forEach(q=>{ q.x=9999; q.y=9999; }); w5.ball.x=9999; w5.ball.y=9999;
    M.computeCam(); M.render();
    const bb = w5.bounds;
    // The cut corner: outside the octagon but inside its bounding box.
    o.cutCorner = at(-bb.halfW + 12, -bb.halfL + 12);
    const court = (h=>{ const n=parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; })(M.TH.court);
    o.cutCornerIsNotCourt = ![0,1,2].every(i=>Math.abs(o.cutCorner[i]-court[i]) <= 30);
    M.sel.field = 'classic';
  }

  // ---- both themes survive the picker and a full render ---------------------
  o.picksBack = ['warp','pool'].every(k => { M.applyBundle(k); M.render(); return M.currentBundle() === k; });
  M.applyBundle('neon');

  // ---- VIDEOBALL arrowheads: the RING is the player ------------------------
  // ⚠️ A disc is a circle of radius r, and that circle is what collides. The first
  // build drew the arrowhead alone, overhanging it in every direction (nose 1.55r,
  // wings 1.05r), so the shape on screen was a third bigger than the shape in the
  // physics. The ring is drawn at exactly r and the triangle is inscribed in it.
  {
    M.applyBundle('videoball');
    M.sel.mode='1v1'; M.sel.kickoffRule='off'; M.setMatchSeed(3); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2;
    const me=w.players[0];
    me.x=0; me.y=0; me.vx=0; me.vy=0; me.faceX=1; me.faceY=0;   // pointing +x
    w.players.slice(1).forEach(q=>{ q.x=1e4; q.y=1e4; });
    w.ball.x=1e4; w.ball.y=1e4;
    for (let i=0;i<6;i++) M.render();
    const s2 = M.cam.s * M.cam.body, R = me.r * s2;
    const ink = (dx,dy) => {
      const [sx,sy] = M.screenPt(M.wx(me.x)+dx, M.wy(me.y)+dy);
      const d = c2.getImageData(Math.round(sx*DPR), Math.round(sy*DPR), 1, 1).data;
      return [d[0],d[1],d[2]];
    };
    // ⚠️ Do NOT compare against one background sample. The Videoball court is BANDED,
    // so "differs from the pixel over there" is true of half the empty court and the
    // probe reports the arrowhead overhanging when it is a cream stripe. Test for the
    // player's own ink instead: the ring and the arrowhead are team-coloured, the
    // court is not.
    const hex = h => { const n = parseInt(String(h).replace('#',''), 16);
      return [(n>>16)&255, (n>>8)&255, n&255]; };
    const close = (a, c, tol) => Math.abs(a[0]-c[0]) + Math.abs(a[1]-c[1]) + Math.abs(a[2]-c[2]) < tol;
    const mine = hex(M.TH.teamRed), theirs = hex(M.TH.teamBlue);
    const isTeam = c => close(c, mine, 150) || close(c, theirs, 150);
    // A RING exists: ink all the way round at the body radius, including BEHIND the
    // arrowhead where the old skin drew nothing at all.
    const onRing = [];
    for (let a=0; a<360; a+=15){
      const t = a*Math.PI/180;
      // ⚠️ Sample the MIDDLE of the ring stroke (radius R), not its inner edge. The
      // stroke is centred on R and spans 0.93R-1.08R, so a sample at 0.97R sits on the
      // antialiased inner boundary and reads as wash on a few arcs — which looks like
      // a gap in the ring and is nothing of the kind.
      onRing.push(isTeam(ink(Math.cos(t)*R, Math.sin(t)*R)));
    }
    o.ringAllRound = onRing.every(Boolean);
    o.ringSamples = onRing.filter(Boolean).length + '/' + onRing.length;
    o.ringGaps = onRing.map((v,i)=>v?null:i*15).filter(v=>v!==null);
    // ...and NOTHING is drawn outside it. The old nose reached 1.55r and the wings
    // 1.05r; sample where they used to be and there must be no player ink there.
    o.oldNoseNowClear = !isTeam(ink(R*1.45, 0));
    o.oldWingNowClear = !isTeam(ink(-R*0.72, R*1.34));
    // The arrowhead is still there and still points where the player faces.
    // ⚠️ Sample WELL inside it, not near the tip: the triangle is only a few pixels
    // across near the nose and its own outline covers most of that, so a tip sample
    // reads the outline and reports the arrowhead missing. Forward vs backward is the
    // honest discriminator — the tail is notched, so the axis behind centre is court.
    o.arrowAhead  = isTeam(ink(R*0.35, 0));
    o.tailNotched = !isTeam(ink(-R*0.38, 0));
    me.faceX=-1; me.faceY=0; for (let i=0;i<3;i++) M.render();
    o.turnsWithFacing = isTeam(ink(-R*0.35, 0)) && !isTeam(ink(R*0.38, 0));
    o.pointsAtFacing = o.arrowAhead && o.tailNotched && o.turnsWithFacing;
    o.vbRadius = +R.toFixed(1);
  }
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(/pooltable/.test(r.registry) && /starfield/.test(r.registry), `DYN_FIELDS is missing an entry: ${r.registry}`);
ok(r.themesDeclareReal, 'a theme declares a dyn field that does not exist');
ok(r.goalMouthIsNotWood, `the pool table's rail runs through the GOAL MOUTH — a shot would pass through timber: ${JSON.stringify(r.goalMouth)}`);
ok(r.insideIsBaize, `wood is inside the boundary, so the ball rolls over the cushion instead of bouncing off it: ${JSON.stringify(r.justInside)}`);
ok(r.deepIsBaize, `the middle of the table is not baize, so the probe is not measuring the cloth: ${JSON.stringify(r.deepInside)}`);
ok(r.outsideIsWood, `there is no cushion outside the boundary at all, so the checks above prove nothing: ${JSON.stringify(r.justOutside)}`);
ok(r.cutCornerIsNotCourt, `court colour is stranded in a chamfered field's cut corner, outside the line and outside the wood: ${JSON.stringify(r.cutCorner)}`);
ok(r.stillWithoutStep, 'the field advanced inside a DRAW — it must only move on a sim step, or a 144Hz screen runs it fast');
ok(r.movesWithStep, 'the starfield never moved when stepped');
ok(r.samples >= 60, `too few samples to mean anything: ${r.samples}`);
ok(r.fieldIsLight, 'the warp field is not light, so black lines could not read on it');
ok(r.lineIsBlack, 'the warp pitch lines are not black');
ok(r.allGrey, `warp is not black and white — coloured pixels found: ${JSON.stringify(r.offenders)}`);
ok(r.discsGrey, 'warp players are still coloured — the profile colour leaked through');
ok(r.sidesDiffer, 'the two sides are indistinguishable in warp');
ok(r.baizeIsGreen, `the pool field is not baize green: ${JSON.stringify(r.baizeIsGreen)}`);
ok(r.pocketIsDark, 'no pocket drawn on the pool table');
ok(r.poolBallsDiffer, 'solids and stripes render identically');
ok(r.stripeHasWhiteShoulder, `the stripe ball has no white shoulder: ${JSON.stringify(r.stripeTop)}`);
ok(r.solidShoulderColoured, `the solid ball is not coloured through: ${JSON.stringify(r.solidTop)}`);
ok(r.ringAllRound, `the Videoball arrowhead has no ring round the whole body (${r.ringSamples} arcs inked) — the circle you actually collide with is invisible`);
ok(r.oldNoseNowClear, 'the arrowhead still overhangs the body where the old 1.55r nose was — what you see is bigger than what the physics uses');
ok(r.oldWingNowClear, 'the arrowhead wings still reach past the body radius');
ok(r.arrowAhead, 'the arrowhead vanished — the skin is now just a ring');
ok(r.pointsAtFacing, 'the arrowhead does not point along the facing');
ok(r.turnsWithFacing, 'the arrowhead did not turn when the player did');
ok(r.picksBack, 'a theme failed to apply');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ndyntheme OK');
