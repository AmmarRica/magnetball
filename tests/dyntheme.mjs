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

  // ---- both themes survive the picker and a full render ---------------------
  o.picksBack = ['warp','pool'].every(k => { M.applyBundle(k); M.render(); return M.currentBundle() === k; });
  M.applyBundle('neon');
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(/pooltable/.test(r.registry) && /starfield/.test(r.registry), `DYN_FIELDS is missing an entry: ${r.registry}`);
ok(r.themesDeclareReal, 'a theme declares a dyn field that does not exist');
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
ok(r.picksBack, 'a theme failed to apply');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ndyntheme OK');
