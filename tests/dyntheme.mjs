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
      // ⚠️ Sample at 0.94R, inside the universal guide ring. The arrow's own
      // team-coloured ring is centred on R and spans 0.93R-1.08R, and drawOneDisc now
      // strokes the two-tone guide on top of it at R+-0.5px — so a sample at exactly R
      // reads the guide, not the arrow, and looks like a gap that is not there. The
      // guide itself is checked for EVERY skin in tests/discskins.mjs; this is the
      // arrow's own ring, which is what makes the body read as a team colour.
      onRing.push(isTeam(ink(Math.cos(t)*R*0.94, Math.sin(t)*R*0.94)));
    }
    o.ringAllRound = onRing.every(Boolean);
    o.ringSamples = onRing.filter(Boolean).length + '/' + onRing.length;
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

  // ---- Highlighter: yellow field, black lines, white everything else --------
  // ⚠️ "Players are white" and "two teams" are in tension — two white discs are the
  // same disc. Hue cannot resolve it here (the palette is yellow, black and white),
  // so the sides carry a black BAR, one horizontal and one vertical, and this checks
  // the SHAPE rather than the colour.
  {
    M.applyBundle('chalk');
    o.chalkName = M.bundleName();
    o.chalkSlots = JSON.stringify(M.liveSlots());
    M.sel.mode='2v2'; M.sel.kickoffRule='off'; M.setMatchSeed(3); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2;
    const me=w.players[0], them=w.players.find(q=>q.team===1);
    w.players.forEach(q=>{ q.x=1e4; q.y=1e4; });
    me.x=-90; me.y=0; them.x=90; them.y=0;
    w.ball.x=1e4; w.ball.y=1e4;
    for (let i=0;i<5;i++) M.render();
    const s3 = M.cam.s * M.cam.body;
    // ⚠️ A WINDOW MEAN, not one pixel. The bodies are dithered now, so a single
    // sample lands on a dot or a gap and reports whichever it hit — the question
    // being asked is how dark that patch of the disc is, which is a density.
    const at = (px,py,span) => { const [sx,sy]=M.screenPt(M.wx(px), M.wy(py));
      // Kept narrow on purpose: the bar is only ~0.26r thick, so a wide window would
      // average the white either side of it back in and report the bar as absent.
      const S = Math.max(1, Math.round((span||3)*DPR));
      const d=c2.getImageData(Math.round(sx*DPR)-(S>>1), Math.round(sy*DPR)-(S>>1), S, S).data;
      let a=0,b=0,g=0,n=0; for (let i=0;i<d.length;i+=4){ a+=d[i]; b+=d[i+1]; g+=d[i+2]; n++; }
      return [a/n, b/n, g/n]; };
    const dark = c3 => c3[0]<90 && c3[1]<90 && c3[2]<90;
    // The pale bar has to allow for the shading dots: at the rim the dither is 80%
    // dense, so "white body" means mostly white, not every pixel white.
    const pale = c3 => c3[0]>150 && c3[1]>150 && c3[2]>150;
    const R = me.r * s3;
    // The field is yellow: green-ish channel high, blue low.
    o.chalkCourt = at(0, w.field.L*0.30);
    o.courtIsYellow = o.chalkCourt[0] > 120 && o.chalkCourt[1] > 140 && o.chalkCourt[2] < 110;
    // Both bodies are WHITE...
    o.body0 = at(me.x + R*0.62, me.y);         // clear of team 0's horizontal bar
    o.body1 = at(them.x + R*0.62, them.y);     // ...ON team 1's, so this one is dark
    o.discsArePale = pale(at(me.x, me.y - R*0.62)) && pale(at(them.x + R*0.62, them.y - R*0.4));
    // ...and the bars run different ways. Team 0 horizontal, team 1 vertical.
    o.t0Across  = dark(at(me.x - R*0.5, me.y)) && dark(at(me.x + R*0.5, me.y));
    o.t0NotDown = pale(at(me.x, me.y - R*0.55)) && pale(at(me.x, me.y + R*0.55));
    o.t1Down    = dark(at(them.x, them.y - R*0.5)) && dark(at(them.x, them.y + R*0.5));
    o.t1NotAcross = pale(at(them.x - R*0.55, them.y)) && pale(at(them.x + R*0.55, them.y));
    o.sidesDifferByShape = o.t0Across && o.t0NotDown && o.t1Down && o.t1NotAcross;

    // ---- the dither is a SURFACE, not a wall ------------------------------
    // Built once and cached; rebuilt only when the ink changes. And it must be
    // denser at the ends than at halfway, or it is not a ramp.
    const f = M.DYN_FIELDS.dither;
    const st = {}; f.reset && f.reset(st);
    const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 300;
    const cc = cv2.getContext('2d');
    cc.fillStyle = '#ffffff'; cc.fillRect(0,0,300,300);
    f.paint(cc, st, 0, 0, 300, 300);
    o.ditherCached = !!st.cv;
    const inkAt = (yFrac) => {
      const d = cc.getImageData(0, Math.round(yFrac*299), 300, 1).data;
      let n=0; for (let i=0;i<d.length;i+=4) if (d[i] < 160) n++;
      return n;
    };
    o.ditherEnd = inkAt(0.02); o.ditherMid = inkAt(0.5);
    o.ditherRamps = o.ditherEnd > o.ditherMid + 20;
    o.ditherClearsAtHalfway = o.ditherMid < 30;
    o.ditherNotSolid = o.ditherEnd < 260;
    // ...and it rebuilds when the INK changes, because slots mix across palettes.
    const firstCv = st.cv;
    st.ink = '#123456';
    f.paint(cc, st, 0, 0, 300, 300);
    o.ditherRebuildsOnInk = st.cv !== firstCv;
    M.applyBundle('classic');
  }

  let cover = null;                 // filled by the Bootleg block, reused by Sorry!
  // ---- Bootleg: a printed sleeve, dots against bars ------------------------
  // ⚠️ Red against green is the one pair a colour-blind player cannot separate, so
  // this checks the SHAPE — a circle is covered all the way round at 0.9r, a square
  // inscribed in the same ring is covered on its diagonals and short on its axes.
  // ⚠️ And it checks the DECOY: the court prints big red dots, so a team drawn as a
  // bright red circle only reads if the printed ones are muted and larger.
  {
    M.applyBundle('sleeve');
    o.sleeveName = M.bundleName();
    o.sleeveSlots = JSON.stringify(M.liveSlots());
    // Coverage round the rim, off a flat field of its own — the same measurement the
    // guide-ring suite uses, and one the drawing code cannot talk its way out of.
    const R = 60, CX = 150, CY = 150;
    const cv3 = document.createElement('canvas'); cv3.width = cv3.height = 300;
    const cc3 = cv3.getContext('2d');
    // Shared with the Sorry! block below: two themes now settle their sides on the
    // same round-against-square distinction, and one measurement covers both.
    cover = (skinKey, team) => {
      cc3.fillStyle = '#7f7f7f'; cc3.fillRect(0,0,300,300);
      const q = { team, faceX:1, faceY:0, r:R, name:'x', cap:'none', color:'#46d17a' };
      M.DISC_SKINS[skinKey].paint(cc3, q, CX, CY, R, { players:[q] });
      let n = 0;
      for (let deg=0; deg<360; deg+=15){
        const a = deg*Math.PI/180;
        const d = cc3.getImageData(Math.round(CX + Math.cos(a)*R*0.9),
                                   Math.round(CY + Math.sin(a)*R*0.9), 1, 1).data;
        // Anything but the flat grey background counts as covered.
        if (Math.abs(d[0]-127) + Math.abs(d[1]-127) + Math.abs(d[2]-127) > 40) n++;
      }
      return n;
    };
    o.sleeveRound = cover('sleeve', 0);
    o.sleeveBar = cover('sleeve', 1);
    o.roundIsRound = o.sleeveRound === 24;
    o.barHasCorners = o.sleeveBar >= 4 && o.sleeveBar <= 18;
    // The printed dots are MUTED against the team that is drawn as one of them.
    const lum = h => { cc3.fillStyle = h; cc3.fillRect(0,0,2,2);
      const d = cc3.getImageData(0,0,1,1).data; return d[0]*0.3 + d[1]*0.6 + d[2]*0.1; };
    o.printLum = lum(M.TH.dynMark); o.teamLum = lum(M.TH.teamRed);
    o.printIsMuted = o.printLum < o.teamLum - 20;
    // A print does not move: no step, or the sleeve drifts under the players.
    o.sleeveStill = !M.DYN_FIELDS.sleeve.step;
    // It falls back through a palette that has never heard of it — slots mix.
    const st2 = {}; M.DYN_FIELDS.sleeve.reset(st2);
    M.applyBundle('classic');
    let threw = null;
    try { M.DYN_FIELDS.sleeve.paint(cc3, st2, 0, 0, 200, 200); } catch(e){ threw = e.message; }
    o.sleeveFallsBack = threw;
  }

  // ---- Sorry!: a board, and pawns standing on their own plates -------------
  // ⚠️ Both sides are pawns, so the piece cannot tell them apart — the PLATE does,
  // a start circle against a track square, measured the same way as Bootleg.
  // ⚠️ And the DECOY again, the other way round from Bootleg: here the field's lane
  // is drawn in the TEAM's own colour, so it only works because it is tinted.
  {
    M.applyBundle('board');
    o.boardName = M.bundleName();
    o.boardSlots = JSON.stringify(M.liveSlots());
    o.pawnRound = cover('pawn', 0);
    o.pawnSquare = cover('pawn', 1);
    o.pawnRoundIsRound = o.pawnRound === 24;
    o.pawnSquareHasCorners = o.pawnSquare >= 4 && o.pawnSquare <= 18;
    // The safety lane, painted for real over the palette's own court, sampled on the
    // first lane cell — which the geometry puts at the middle of the top edge.
    const cv4 = document.createElement('canvas'); cv4.width = cv4.height = 300;
    const cc4 = cv4.getContext('2d');
    cc4.fillStyle = M.TH.court; cc4.fillRect(0,0,300,300);
    const f2 = M.DYN_FIELDS.boardtrack;
    const st3 = {}; f2.reset && f2.reset(st3);
    f2.paint(cc4, st3, 0, 0, 300, 300);
    const s4 = 300 * f2.sq, step4 = s4 * f2.gap;
    const d4 = cc4.getImageData(150, Math.round(s4*1.05 + step4), 1, 1).data;
    const lum4 = c3 => c3[0]*0.3 + c3[1]*0.6 + c3[2]*0.1;
    cc4.fillStyle = M.TH.teamRed; cc4.fillRect(0,0,2,2);
    const dt = cc4.getImageData(0,0,1,1).data;
    o.laneLum = lum4(d4); o.laneTeamLum = lum4(dt);
    o.laneIsRed = d4[0] > d4[1] && d4[1] > d4[2];      // sampling the lane, not the board
    o.laneIsTinted = o.laneLum > o.laneTeamLum + 40;
    o.boardStill = !f2.step;
    // Over a palette that never heard of it — slots mix, and it reads TH.dynMark.
    M.applyBundle('classic');
    let threw2 = null;
    try { f2.paint(cc4, st3, 0, 0, 200, 200); } catch(e){ threw2 = e.message; }
    o.boardFallsBack = threw2;
  }

  // ---- Abduction: a fence that knows where the goal is, and two craft --------
  // ⚠️ The fence is drawn OUTSIDE the play area, which is the pool table's mistake
  // waiting to happen again: rails through the goal mouth, or timber inside the line
  // that the ball rolls over instead of bouncing off. Sampled for, both ways.
  {
    const w5 = setup('ufo');
    w5.players.forEach(q=>{ q.x=9999; q.y=9999; });
    w5.ball.x=9999; w5.ball.y=9999;
    M.computeCam(); M.render();
    o.ufoName = M.bundleName();
    const bb = w5.bounds, f5 = w5.field;
    const hex = h => { const n=parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; };
    const timber = hex(M.TH.dynMark), grass = hex(M.TH.court);
    const near = (A,B,tol) => [0,1,2].every(i=>Math.abs(A[i]-B[i]) <= (tol||30));
    // 1) THE GOAL MOUTH IS A GAP — scanned across, not sampled once: the fence is
    //    posts and rails, so a single probe can land in a gap and prove nothing.
    // ⚠️ The middle of the mouth, not its full width: the fence STOPS at the mouth,
    // so its last post stands on the edge and a full-width scan reports the post as a
    // fence across the gap. What matters is that the span you shoot through is clear.
    let mouthWood = 0, mouthN = 0;
    for (let gx = -f5.goal*0.36; gx <= f5.goal*0.36; gx += 3){
      mouthN++; if (near(at(gx, bb.halfL + 5), timber, 44)) mouthWood++; }
    o.mouthN = mouthN; o.mouthWood = mouthWood;
    o.mouthIsOpen = mouthN > 4 && mouthWood === 0;
    // 2) ...and the fence really is out there, or (1) passes on a field with no fence.
    let sideWood = 0, sideN = 0;
    for (let gy = -bb.halfL*0.6; gy <= bb.halfL*0.6; gy += 5){
      sideN++; if (near(at(bb.halfW + 4, gy), timber, 44)) sideWood++; }
    o.sideN = sideN; o.sideWood = sideWood;
    o.fenceIsThere = sideWood > sideN * 0.5;
    // 3) ...and none of it is inside the line, where the ball plays.
    o.justInside = at(bb.halfW - 10, bb.halfL*0.4);
    o.insideIsGrass = !near(o.justInside, timber, 44);
    o.paddockStill = !M.DYN_FIELDS.paddock.step;

    // ---- the two craft differ by SILHOUETTE -------------------------------
    // ⚠️ Measured at the TAIL, across the facing. Both are long the way they point —
    // a saucer's hull and a triangle's nose both reach ~0.9r — so a coverage-round-
    // the-rim check would call them the same shape. Behind the middle they are not
    // remotely alike: an ellipse has tapered to a sliver, a triangle is at its widest.
    const R = 60, CX = 150, CY = 150;
    const cv5 = document.createElement('canvas'); cv5.width = cv5.height = 300;
    const cc5 = cv5.getContext('2d');
    const paintUfo = (team, fx, fy) => {
      cc5.fillStyle = '#7f7f7f'; cc5.fillRect(0,0,300,300);
      const q = { team, faceX:fx, faceY:fy, r:R, name:'x', cap:'none', color:'#46d17a' };
      M.DISC_SKINS.ufo.paint(cc5, q, CX, CY, R, { players:[q] });
    };
    const tailWidth = (team) => {
      paintUfo(team, 1, 0);                       // pointing along +x, tail at -x
      const col = Math.round(CX - R*0.5);
      const d = cc5.getImageData(col, CY - R, 1, R*2).data;
      let n = 0;
      for (let i=0;i<d.length;i+=4)
        if (Math.abs(d[i]-127) + Math.abs(d[i+1]-127) + Math.abs(d[i+2]-127) > 40) n++;
      return n;
    };
    o.saucerTail = tailWidth(0); o.triangleTail = tailWidth(1);
    o.craftDifferByShape = o.triangleTail > o.saucerTail * 1.5;
    // It is drawn pointing where it goes, or the 3D is decoration.
    const shot = (fx, fy) => { paintUfo(0, fx, fy);
      return cc5.getImageData(CX-R, CY-R, R*2, R*2).data.join(','); };
    M.profile.spin = true;
    o.craftTurns = shot(1,0) !== shot(0,1);

    // ---- and the ball is a sheep, not a plain ball ------------------------
    o.ballLookExists = !!M.BALL_LOOKS.sheep;
    const ballShot = (key) => {
      cc5.fillStyle = '#7f7f7f'; cc5.fillRect(0,0,300,300);
      M.paintBall(cc5, CX, CY, R, 0.4, key, M.TH);
      return cc5.getImageData(CX-R, CY-R, R*2, R*2).data.join(',');
    };
    o.sheepDraws = ballShot('sheep') !== ballShot('plain');
    M.applyBundle('classic');
  }

  // ---- Asteroids: a vector monitor, and nothing on it is filled -------------
  // ⚠️ "Everything is a thin line" is the whole theme, so it is measured rather than
  // asserted in a comment: the middle of a ship, and the middle of the ball, both
  // have to still be the court underneath.
  {
    const w6 = setup('vector');
    w6.players.forEach(q=>{ q.x=9999; q.y=9999; q.vx=0; q.vy=0; });
    w6.ball.x=9999; w6.ball.y=9999; w6.ball.vx=0; w6.ball.vy=0;
    o.vectorName = M.bundleName();
    M.render(); const g0 = frame();
    M.render(); o.voidStillWithoutStep = frame() === g0;   // a draw must not advance the sky
    for (let i=0;i<40;i++) M.advanceDynField();
    M.render(); o.voidMovesWithStep = frame() !== g0;

    const R = 60, CX = 150, CY = 150, BG = 127;
    const cv6 = document.createElement('canvas'); cv6.width = cv6.height = 300;
    const cc6 = cv6.getContext('2d');
    const paintShip = (team, fx, fy) => {
      cc6.fillStyle = '#7f7f7f'; cc6.fillRect(0,0,300,300);
      const q = { team, faceX:fx, faceY:fy, r:R, name:'x', cap:'none', color:'#46d17a' };
      M.DISC_SKINS.vector.paint(cc6, q, CX, CY, R, { players:[q] });
    };
    const off = (d,i) => Math.abs(d[i]-BG) + Math.abs(d[i+1]-BG) + Math.abs(d[i+2]-BG);
    // Hollow: the middle of a ship is a thin wash over the court, not a body.
    paintShip(0, 1, 0);
    o.shipMiddle = off(cc6.getImageData(CX + Math.round(R*0.62), CY, 1, 1).data, 0);
    o.shipRing   = off(cc6.getImageData(CX + R, CY, 1, 1).data, 0);
    o.shipIsHollow = o.shipMiddle < 60 && o.shipRing > 120;
    // ⚠️ The silhouette is an EXTENT, not a pixel count: these are outlines, so a
    // scan line crosses two strokes whether the shape there is a hand's width or a
    // pitch across. And the scan stops short of 0.8r, because the ring is at r and
    // crosses every column — measured through it, both sides are 1.73r and identical.
    const tailExtent = (team) => {
      paintShip(team, 1, 0);
      const col = Math.round(CX - R*0.5), top = Math.round(CY - R*0.8);
      const d = cc6.getImageData(col, top, 1, Math.round(R*1.6)).data;
      let lo = -1, hi = -1;
      for (let i=0, row=0; i<d.length; i+=4, row++)
        if (off(d, i) > 90){ if (lo < 0) lo = row; hi = row; }
      return lo < 0 ? 0 : hi - lo;
    };
    // ⚠️ Named apart from the Abduction block's saucerTail: both write into the
    // same result object, and the later one silently overwrote the earlier reading.
    o.dartTail = tailExtent(0); o.vecSaucerTail = tailExtent(1);
    o.shipsDifferByShape = o.dartTail > o.vecSaucerTail * 1.8;
    // The dart points where it goes; the saucer flies level, the way the arcade's did.
    const shipShot = (team, fx, fy) => { paintShip(team, fx, fy);
      return cc6.getImageData(CX-R, CY-R, R*2, R*2).data.join(','); };
    M.profile.spin = true;
    o.dartTurns = shipShot(0,1,0) !== shipShot(0,0,1);
    o.saucerFliesLevel = shipShot(1,1,0) === shipShot(1,0,1);
    // The ball is a rock outline: bright rim, court in the middle.
    cc6.fillStyle = '#7f7f7f'; cc6.fillRect(0,0,300,300);
    M.paintBall(cc6, CX, CY, R, 0, 'asteroid', M.TH);
    const lum = d => d[0]*0.3 + d[1]*0.6 + d[2]*0.1;
    o.ballMid = lum(cc6.getImageData(CX + Math.round(R*0.62), CY, 1, 1).data);
    o.ballEdge = lum(cc6.getImageData(CX, CY - Math.round(R*1.08), 1, 1).data);
    o.ballIsHollow = o.ballEdge > o.ballMid + 90;
    M.applyBundle('classic');
  }

  // ---- Specimen: one ink, two teams, settled by the counter -----------------
  // ⚠️ Both discs are the same black block — hue cannot tell them apart any more than
  // it could on Highlighter — so the glyph does, and it has to do it TWICE over: the
  // O has a closed counter where the X has a crossing, and the O carries paper on the
  // axes where the X carries ink there. Measured, not asserted.
  {
    M.applyBundle('specimen');
    o.specName = M.bundleName();
    const R = 60, CX = 150, CY = 150;
    const cv7 = document.createElement('canvas'); cv7.width = cv7.height = 300;
    const cc7 = cv7.getContext('2d');
    const lum = d => d[0]*0.3 + d[1]*0.6 + d[2]*0.1;
    const glyph = (team) => {
      cc7.fillStyle = '#7f7f7f'; cc7.fillRect(0,0,300,300);
      const q = { team, faceX:1, faceY:0, r:R, name:'x', cap:'none', color:'#46d17a' };
      M.DISC_SKINS.type.paint(cc7, q, CX, CY, R, { players:[q] });
      const at2 = (fr, deg) => { const a = deg*Math.PI/180;
        return lum(cc7.getImageData(Math.round(CX + Math.cos(a)*R*fr),
                                    Math.round(CY + Math.sin(a)*R*fr), 1, 1).data); };
      const axes = [0,90,180,270].map(d => at2(0.52, d));
      const diag = [45,135,225,315].map(d => at2(0.52, d));
      return { mid: at2(0, 0), axes, diag };
    };
    const oG = glyph(0), xG = glyph(1);
    const INK = 90, PAPER = 140;          // black block vs process yellow
    o.oGlyph = oG; o.xGlyph = xG;
    // The O: solid centre, paper all the way round the counter.
    o.oHasCounter = oG.mid < INK && oG.axes.every(v => v > PAPER) && oG.diag.every(v => v > PAPER);
    // The X: paper through the middle, ink on the axes, paper on the diagonals.
    o.xIsACross = xG.mid > PAPER && xG.axes.every(v => v < INK) && xG.diag.every(v => v > PAPER);
    o.typeSidesDiffer = o.oHasCounter && o.xIsACross;
    // ⚠️ The sheet's type is a DEEPER YELLOW, never the black the lines are set in —
    // a field of black words is a field of decoys the size of a player.
    const ofHex = h => { cc7.fillStyle = h; cc7.fillRect(0,0,2,2);
      return lum(cc7.getImageData(0,0,1,1).data); };
    o.sheetLum = ofHex(M.TH.dynMark); o.lineLum = ofHex(M.TH.line);
    o.courtLum = ofHex(M.TH.court);
    o.sheetIsTint = o.sheetLum > o.lineLum + 90 && o.sheetLum < o.courtLum - 5;
    // Baked once and cached on the ink, like every other stretched tile here.
    const f7 = M.DYN_FIELDS.specimen; const st7 = {};
    f7.paint(cc7, st7, 0, 0, 200, 200);
    o.sheetCached = !!st7.cv;
    const firstSheet = st7.cv;
    f7.paint(cc7, st7, 0, 0, 200, 200);
    o.sheetReused = st7.cv === firstSheet;
    st7.ink = '#123456';
    f7.paint(cc7, st7, 0, 0, 200, 200);
    o.sheetRebuildsOnInk = st7.cv !== firstSheet;
    o.sheetStill = !f7.step;
    // ...and the ball is a full stop, not a second counter: solid in the middle.
    cc7.fillStyle = '#7f7f7f'; cc7.fillRect(0,0,300,300);
    M.paintBall(cc7, CX, CY, R, 0, 'period', M.TH);
    o.ballMidLum = lum(cc7.getImageData(CX, CY, 1, 1).data);
    o.ballRingLum = lum(cc7.getImageData(CX + Math.round(R*0.72), CY, 1, 1).data);
    o.ballIsSolidDot = o.ballMidLum < INK && o.ballRingLum > PAPER;
    M.applyBundle('classic');
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
// ⚠️ The ring rule moved to tests/discskins.mjs, which checks EVERY skin at a size
// where it can be measured. At match scale the body is ~12px across, so the arrow's
// own team ring and the universal guide ring occupy the same two pixels and cannot
// be told apart — a check here would be asserting a blend, not a ring.
ok(r.oldNoseNowClear, 'the arrowhead still overhangs the body where the old 1.55r nose was — what you see is bigger than what the physics uses');
ok(r.oldWingNowClear, 'the arrowhead wings still reach past the body radius');
ok(r.arrowAhead, 'the arrowhead vanished — the skin is now just a ring');
ok(r.pointsAtFacing, 'the arrowhead does not point along the facing');
ok(r.turnsWithFacing, 'the arrowhead did not turn when the player did');
ok(r.chalkName === 'Highlighter', `the Highlighter bundle does not resolve: ${r.chalkName}`);
ok(r.courtIsYellow, `the Highlighter court is not yellow: ${r.chalkCourt}`);
ok(r.discsArePale, 'the Highlighter discs are not white');
ok(r.sidesDifferByShape, `the two white discs are not separated by a black bar: across ${r.t0Across}/${r.t0NotDown}, down ${r.t1Down}/${r.t1NotAcross} — two white discs with no mark are the same disc`);
ok(r.ditherCached, 'the dither is not cached — it would rebuild 17,500 rects a frame');
ok(r.ditherRamps, `the dither does not ramp: ${r.ditherEnd} ink at the end vs ${r.ditherMid} at halfway`);
ok(r.ditherClearsAtHalfway, `the dither never clears (${r.ditherMid} ink at halfway) — a surface has to lose to the ball`);
ok(r.ditherNotSolid, `the dither goes solid at the ends (${r.ditherEnd}), which buries the goal box`);
ok(r.ditherRebuildsOnInk, 'the dither does not rebuild when the ink changes — slots mix, so it can be asked for over another palette');
ok(r.sleeveName === 'Bootleg', `the Bootleg bundle does not resolve: ${r.sleeveName}`);
ok(r.roundIsRound, `Bootleg's team 0 is not covered all the way round at 0.9r (${r.sleeveRound}/24) — it is meant to be the dot`);
ok(r.barHasCorners, `Bootleg's two sides do not differ by SHAPE: ${r.sleeveBar}/24 covered at 0.9r, which is either a circle too or nothing at all. Red vs green is exactly what a colour-blind player cannot use`);
ok(r.printIsMuted, `the printed court dots (${Math.round(r.printLum)}) are as bright as the team drawn as one (${Math.round(r.teamLum)}) — the field is a set of decoys`);
ok(r.sleeveStill, 'the sleeve field has a step — print does not move, and a drifting grid under the players reads as lag');
ok(!r.sleeveFallsBack, `the sleeve field threw over a palette that does not declare its inks: ${r.sleeveFallsBack}`);
ok(r.boardName === 'Sorry!', `the Sorry! bundle does not resolve: ${r.boardName}`);
ok(r.pawnRoundIsRound, `the Sorry! start-circle plate is not covered all the way round at 0.9r (${r.pawnRound}/24)`);
ok(r.pawnSquareHasCorners, `Sorry!'s two sides do not differ by SHAPE: ${r.pawnSquare}/24 covered at 0.9r. Both sides are pawns, so the plate is the only thing that can tell them apart`);
ok(r.laneIsRed, `the lane probe is not on the lane at all: ${JSON.stringify(r.laneLum)} — the geometry moved and this check now measures the board`);
ok(r.laneIsTinted, `the safety lane (${Math.round(r.laneLum)}) is as saturated as the team drawn on top of it (${Math.round(r.laneTeamLum)}) — a column of five team-coloured squares is a column of five decoys`);
ok(r.boardStill, 'the board field has a step — a printed board does not move');
ok(!r.boardFallsBack, `the board field threw over a palette that does not declare its inks: ${r.boardFallsBack}`);
ok(r.ufoName === 'Abduction', `the Abduction bundle does not resolve: ${r.ufoName}`);
ok(r.mouthIsOpen, `the fence runs through the GOAL MOUTH — ${r.mouthWood}/${r.mouthN} probes hit timber, and a shot would go through it to score`);
ok(r.fenceIsThere, `there is no fence outside the boundary at all (${r.sideWood}/${r.sideN}), so the goal-mouth check proves nothing`);
ok(r.insideIsGrass, `fence timber is INSIDE the line, where the ball plays: ${JSON.stringify(r.justInside)}`);
ok(r.paddockStill, 'the paddock has a step — the field is scenery, and anything that advances must do it next to step(), not in a paint');
ok(r.craftDifferByShape, `the two craft do not differ by SILHOUETTE: tail widths ${r.saucerTail} vs ${r.triangleTail}. Both are long the way they point, so the tail is the only thing that separates them`);
ok(r.craftTurns, 'the craft does not turn with its facing — the 3D bank is decoration if it does not say which way you are going');
ok(r.ballLookExists && r.sheepDraws, 'the sheep ball look draws nothing');
ok(r.vectorName === 'Asteroids', `the Asteroids bundle does not resolve: ${r.vectorName}`);
ok(r.voidStillWithoutStep, 'the vector sky advanced inside a DRAW — it must only move on a sim step, or a 144Hz screen runs it 2.4x fast');
ok(r.voidMovesWithStep, 'the vector sky never moved when stepped');
ok(r.shipIsHollow, `a vector ship is FILLED (middle ${r.shipMiddle}, ring ${r.shipRing}) — a solid body on a line court is the only solid thing on screen`);
ok(r.shipsDifferByShape, `the dart and the saucer do not differ by SILHOUETTE: tail extents ${r.dartTail} vs ${r.vecSaucerTail}`);
ok(r.dartTurns, 'the dart does not turn with its facing');
ok(r.saucerFliesLevel, 'the saucer turns with its facing — rotated ninety degrees it is a lens nobody can name, which is why the arcade flew it level');
ok(r.specName === 'Specimen', `the Specimen bundle does not resolve: ${r.specName}`);
ok(r.oHasCounter, `Specimen's team 0 is not an O: ${JSON.stringify(r.oGlyph)} — the counter has to be closed and the ring has to run all the way round`);
ok(r.xIsACross, `Specimen's team 1 is not an X: ${JSON.stringify(r.xGlyph)} — ink on the axes, paper through the middle and on the diagonals`);
ok(r.typeSidesDiffer, 'the two Specimen sides do not differ by GLYPH, and they cannot differ by hue: the palette is one yellow and one black');
ok(r.sheetIsTint, `the specimen type (${Math.round(r.sheetLum)}) is not a tint between the court (${Math.round(r.courtLum)}) and the line ink (${Math.round(r.lineLum)}) — a sheet of black words is a sheet of player-sized decoys`);
ok(r.sheetCached && r.sheetReused, 'the specimen sheet is re-typeset every frame — that is a dozen fillText calls at 80px, every frame');
ok(r.sheetRebuildsOnInk, 'the specimen sheet does not rebuild when the ink changes — slots mix, so it can be asked for over another palette');
ok(r.sheetStill, 'the specimen sheet has a step — a printed sheet does not move');
ok(r.ballIsSolidDot, `the Specimen ball is not a full stop (middle ${Math.round(r.ballMidLum)}, edge ${Math.round(r.ballRingLum)}) — drawn as a ring it is a second O and you lose it in a challenge`);
ok(r.ballIsHollow, `the ball is not an outline (edge ${Math.round(r.ballEdge)}, middle ${Math.round(r.ballMid)}) — on this palette the rim ring IS the rock's outline`);
ok(r.picksBack, 'a theme failed to apply');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ndyntheme OK');
