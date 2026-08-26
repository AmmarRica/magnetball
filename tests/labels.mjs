// Name plates fade to 5% while they sit over another disc or the ball, and come
// back once clear. Drives the real renderer and reads the per-player alpha the
// draw path uses, in both pitch orientations.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.autoReplay=false;

  // Settle the fade by rendering repeatedly, then read the player's label alpha.
  // ⚠️ ONE DRAW, then the STEP LOOP eases the fade. It used to be 90 draws, back when the
  // easing was written inside `drawDiscs` — which was the bug `tests/floaters.mjs` and
  // `tests/surfaces.mjs` caught: two draws of one frame produced two different pictures,
  // so a paused screen kept changing. The draw now only records the target and
  // `advanceLabels()` (next to decayJuice, in the step loop) does the easing, so driving
  // this by repeating the DRAW would settle nothing at all.
  const settle = (w, frames=90) => { M.drawDiscs(w); for(let i=0;i<frames;i++){ M.advanceLabels(); M.drawDiscs(w); } };
  const alphaOf = (w, q) => M.labelA[w.players.indexOf(q)];
  const far = (w, list) => list.forEach((q,i)=>{ q.x = 400 + i*40; q.y = 400; });

  const run = async (orient) => {
    M.sel.orient = orient; M.applyDisplayMode(); await wait(150);
    M.sel.mode='2v2'; M.startMatch(); await wait(150);
    const w=M.world; w.state='play'; w.stateT=1; M.computeCam();
    const [me, mate] = w.players.filter(x=>x.team===0);
    const foes = w.players.filter(x=>x.team===1);
    const res={};

    // 1) Everything clear -> label at full opacity.
    me.x=0; me.y=100; far(w,[mate,...foes]); w.ball.x=-350; w.ball.y=-350;
    settle(w); res.clear = +alphaOf(w,me).toFixed(3);

    // 2) A disc parked exactly where the plate sits -> fades to the floor.
    //    ⚠️ The plate hangs BELOW the disc on screen — it used to be above, and a probe
    //    left up there parks the body on bare pitch and reports the plate as never
    //    dimming at all. And a sideways pitch maps screen "down" to world -x, so the
    //    world offset is derived from the camera rotation rather than assumed to be +y
    //    (that assumption silently passes only when the pitch is upright).
    const plateWorld = () => {
      const rot = M.cam.rot || 0, c = Math.cos(-rot), sn = Math.sin(-rot);
      const sdx = 0, sdy = 30;               // 30px down, comfortably inside the plate
      return [(sdx*c - sdy*sn)/M.cam.s, (sdx*sn + sdy*c)/M.cam.s];
    };
    const [ux, uy] = plateWorld();
    mate.x = me.x + ux; mate.y = me.y + uy;
    settle(w); res.discOver = +alphaOf(w,me).toFixed(3);

    // 3) Move it away -> comes back.
    far(w,[mate,...foes]); settle(w); res.discAway = +alphaOf(w,me).toFixed(3);

    // 4) The BALL parked on the plate -> fades.
    w.ball.x = me.x + ux; w.ball.y = me.y + uy; w.ball.vx=0; w.ball.vy=0;
    settle(w); res.ballOver = +alphaOf(w,me).toFixed(3);

    // 5) Ball away -> back to full.
    w.ball.x=-350; w.ball.y=-350; settle(w); res.ballAway = +alphaOf(w,me).toFixed(3);

    // 6) Its own disc must never dim its own label (self is excluded).
    far(w,[mate,...foes]); w.ball.x=-350; w.ball.y=-350;
    settle(w); res.selfNeverDims = +alphaOf(w,me).toFixed(3);
    return res;
  };

  o.upright  = await run('v');
  o.sideways = await run('h');

  // Fade is gradual, not a blink: one frame must not jump straight to the floor.
  M.sel.orient='v'; M.applyDisplayMode(); await wait(150);
  M.sel.mode='2v2'; M.startMatch(); await wait(150);
  const w=M.world; w.state='play'; w.stateT=1; M.computeCam();
  const [me, mate] = w.players.filter(x=>x.team===0);
  const foes = w.players.filter(x=>x.team===1);
  me.x=0; me.y=100; foes.forEach((q,i)=>{q.x=400+i*40; q.y=400;});
  mate.x=400; mate.y=400; w.ball.x=-350; w.ball.y=-350;
  settle(w);
  mate.x=me.x; mate.y=me.y - 30/M.cam.s;   // upright run, so screen-up is world -y
  // ⚠️ ONE draw to record the new target, then ONE ease — that is a single frame, and
  // the point of this check is that a single frame does not jump straight to the floor.
  M.drawDiscs(w); M.advanceLabels();
  const aNow = M.labelA[w.players.indexOf(me)];
  o.oneFrameAlpha = +aNow.toFixed(3);
  o.gradual = aNow > M.LABEL_DIM + 0.3;   // still well above the floor after 1 frame
  o.floor = M.LABEL_DIM;
  // 7) The REPLAY must fade as well. It rebuilds its player objects every frame
  //    ({...pl}), which is precisely what stopped the old per-object alpha from
  //    ever converging — so simulate that and confirm the fade still lands.
  M.sel.mode='2v2'; M.startMatch(); await wait(150);
  const rw = M.world; rw.state='play'; rw.stateT=1; M.computeCam();
  const rMe = rw.players[0];
  rw.players.forEach((q,i)=>{ if(i) { q.x=400+i*40; q.y=400; } });
  rMe.x=0; rMe.y=100; rw.ball.x=-350; rw.ball.y=-350;
  M.drawDiscs(rw); for(let i=0;i<60;i++){ M.advanceLabels(); M.drawDiscs(rw); }
  o.replayClear = +M.labelA[0].toFixed(3);
  // Now park a disc on the plate and re-render through FRESH player objects each
  // frame, the way playReplay does.
  const blocker = { ...rw.players[1], x: rMe.x, y: rMe.y + 30/M.cam.s };   // BELOW: the plate moved
  for(let i=0;i<90;i++){
    const fake = { ...rw, players: rw.players.map((pl,ix)=> ix===1 ? {...blocker} : {...pl}) };
    M.drawDiscs(fake); M.advanceLabels();
  }
  o.replayBlocked = +M.labelA[0].toFixed(3);
  o.replayFades = o.replayClear > 0.9 && Math.abs(o.replayBlocked - M.LABEL_DIM) < 0.02;

  // --- Plates are tinted by TEAM. They were white on every disc, so nothing about
  // the plate told you which side a player was on.
  M.applyBundle('neon'); M.sel.mode='2v2'; M.startMatch();
  const tw2=M.world; tw2.state='play'; tw2.stateT=1;
  const a2=tw2.players.find(q=>q.team===0), b2=tw2.players.find(q=>q.team===1);
  a2.x=-120; a2.y=-150; b2.x=120; b2.y=-150;      // apart, so nothing dims either
  tw2.players.filter(q=>q!==a2&&q!==b2).forEach((q,i)=>{ q.x=-300+i*40; q.y=300; });
  tw2.ball.x=0; tw2.ball.y=300;
  M.computeCam(); for(let i=0;i<12;i++) M.render();
  const cv2=document.getElementById('game'), c3=cv2.getContext('2d');
  const DPR2=cv2.width/cv2.clientWidth;
  // Sample the middle of each plate. ⚠️ BELOW the disc — the plate moved under the body,
  // and a probe left above it samples bare pitch, which is the same colour for both teams
  // and reports that the plates do not differ by team at all.
  const plateAt = (q) => { const [sx,sy]=M.screenPt(M.wx(q.x), M.wy(q.y));
    const py=sy + q.r*M.cam.s + M.NAMEPLATE.gap - M.NAMEPLATE.size*0.45;
    const d=c3.getImageData(Math.round(sx*DPR2)-2, Math.round(py*DPR2)-2, 5, 5).data;
    let R=0,G=0,B=0,n=0; for(let i=0;i<d.length;i+=4){R+=d[i];G+=d[i+1];B+=d[i+2];n++;}
    return [Math.round(R/n), Math.round(G/n), Math.round(B/n)]; };
  // The NAME carries the colour; the BOX stays neutral. Sampling the whole plate
  // rect mixes box and glyphs, so the team signal is a tint of the mean rather than
  // a flat fill — assert the direction, not a specific colour.
  o.plateTeam0 = plateAt(a2); o.plateTeam1 = plateAt(b2);
  o.platesDifferByTeam = JSON.stringify(o.plateTeam0) !== JSON.stringify(o.plateTeam1);
  o.team0ReadsRed  = o.plateTeam0[0] > o.plateTeam0[2];          // red channel leads
  o.team1ReadsBlue = o.plateTeam1[2] > o.plateTeam1[0];          // blue channel leads
  // The box itself is NOT team-tinted: sample a corner of the plate, away from glyphs.
  const boxAt = (q) => { const [sx,sy]=M.screenPt(M.wx(q.x), M.wy(q.y));
    const px=sx - 0, py=sy - q.r*M.cam.s - 21;                   // top strip of the plate
    const d=c3.getImageData(Math.round(px*DPR2)-1, Math.round(py*DPR2)-1, 3, 3).data;
    return [d[0],d[1],d[2]]; };
  const box0=boxAt(a2), box1=boxAt(b2);
  o.box0=box0; o.box1=box1;
  o.boxesMatchEachOther = Math.abs(box0[0]-box1[0])<12 && Math.abs(box0[2]-box1[2])<12;

  // --- Text on the plate must clear WCAG AA on EVERY theme. Colouring the text and
  // leaving the plate dark measured as low as 3.06:1, which is why it isn't that.
  const lum = h => { const c=h.replace('#',''); const v=[0,2,4].map(i=>parseInt(c.substr(i,2),16)/255)
    .map(x=>x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4));
    return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]; };
  const ratio=(x,y)=>{const L1=lum(x),L2=lum(y);return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);};
  o.worstPlateContrast = 99; o.worstPlateTheme=''; o.rawWorst = 99;
  o.inksDifferEveryTheme = true;
  for (const [k,t] of Object.entries(M.THEMES)){
    const bg = t.pitch.nameBg;
    const inks = [t.pitch.teamRed, t.pitch.teamBlue].map(c => M.rgbToHex(M.readableInk(c, bg)));
    if (inks[0] === inks[1]) o.inksDifferEveryTheme = false;
    for (let i=0;i<2;i++){
      const c = ratio(inks[i], bg);
      const raw = ratio([t.pitch.teamRed, t.pitch.teamBlue][i], bg);
      if (raw < o.rawWorst) o.rawWorst = +raw.toFixed(2);
      if (c < o.worstPlateContrast){ o.worstPlateContrast = +c.toFixed(2); o.worstPlateTheme = k; }
    }
  }
  o.everyThemeClearsAA = o.worstPlateContrast >= 4.5;
  // The lightening is doing real work: at least one raw team colour was under AA.
  o.rawWouldHaveFailed = o.rawWorst < 4.5;
  return o;
});

// ============================================================
//  A HALO MAY NOT OUTLIVE THE TEXT IT IS BEHIND
// ============================================================
// ⚠️ Reported as "the font background is bad and is visible even when the text is not",
// with a screenshot of a dark blocky plate beside the ball with no name in it. Two causes,
// both real: the backing is the OPPOSITE tone by design, so over a mid-green pitch a dark
// halo at alpha 0.2 still reads clearly while a pale fill at 0.2 has all but gone — and
// the name plate strikes its halo TWICE, so the two passes composite to 0.36 against the
// single-pass text's 0.2 and it got relatively LOUDER the fainter the name became. Right
// beside the ball, where `LABEL_BALL` ramps the text to nothing, what was left was the
// plate on its own.
// ⚠️ THE INVARIANT, and it needs no magic number: what is on the pitch at alpha `a` is at
// most `a` of what is there at full strength. A build whose backing outlives its text
// cannot satisfy it — on this page the reported build reads 0.534 at a = 0.5 and 0.196 at
// a = 0.15, both over their own alpha, against 0.410 and 0.114 now. (On a 900px page,
// where the type is bigger and antialiasing counts for less, the same sabotage reads 0.742
// and 0.333 against 0.364 and 0.076 — the gap is wider, the invariant is the same.)
// ⚠️ Measured as a DIFFERENCE against the same frame with no label on it. An absolute ink
// count in the band reads the halfway line, the centre circle and the mown stripes and
// flattens at a constant whatever the alpha is — which is exactly what the first run of
// this probe did, reporting 0.76 of full ink at every alpha including zero.
const halo = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode='1v1'; M.sel.lobby='off'; M.sel.names='Kai'; M.setMatchSeed(5); M.startMatch();
  const w = M.world; w.state='play'; w.stateT=2;
  const me = w.players[0];
  me.x = 0; me.y = 0; w.ball.x = 9000; w.ball.y = 9000;
  for (const q of w.players) if (q !== me){ q.x = 0; q.y = 9000; }
  const c = document.getElementById('game'), cx = c.getContext('2d');
  const dpr = c.width / c.clientWidth, NP = M.NAMEPLATE;
  const band = (alpha) => {
    // ⚠️ Render ONCE first: `drawDiscs` snaps `labelA` to its target the first time it
    // sees a body ("no fade-in from nowhere"), so a value written before that is lost.
    M.renderAlpha = 1; M.render();
    M.labelA[0] = alpha;
    M.render();
    // ⚠️ BELOW the body. The plate hangs under the disc now — it used to sit above, where
    // it fought the floating stat labels, which RISE off a player. A band left above the
    // body measures bare pitch and reports every alpha as identical.
    const px = Math.round(M.wx(me.x) * dpr), py = Math.round(M.wy(me.y) * dpr);
    const base = py + (15 * M.cam.s + NP.gap) * dpr;      // the text baseline
    const top = Math.round(base - (NP.size + 4) * dpr);
    const h = Math.round((NP.size + 10) * dpr), half = Math.round(70 * dpr);
    return cx.getImageData(px - half, top, half*2, h).data;
  };
  const base = band(0);
  const ink = (alpha) => {
    const d = band(alpha); let sum = 0;
    for (let i = 0; i < d.length; i += 4)
      sum += Math.abs(d[i]-base[i]) + Math.abs(d[i+1]-base[i+1]) + Math.abs(d[i+2]-base[i+2]);
    return sum;
  };
  const full = ink(1);
  o.full = Math.round(full / 1000);
  // ⚠️ **THE PROBES MUST SIT IN THE RANGE THAT IS ACTUALLY DRAWN.** They were 0.5 / 0.3 /
  // 0.15 / 0.08, and `LABEL_MIN` (0.55) then made every one of them read exactly ZERO —
  // so "the halo never outlives its text" passed because nothing was on the pitch at all,
  // which is the vacuous form of the check, not the check. Spaced across [LABEL_MIN, 1)
  // instead, so each one is a plate that IS drawn and the ratio means something.
  o.at = {}; o.fadesNoSlowerThanItSays = full > 0;
  for (const a of [0.95, 0.8, 0.68, M.LABEL_MIN].map(v => +(v).toFixed(3))){
    const rel = ink(a) / full;
    o.at[a] = +rel.toFixed(3);
    if (rel > a) o.fadesNoSlowerThanItSays = false;
  }
  // ⚠️ ...and it is still SOLID at full strength. "The backing fades fast" is also true of
  // a build with no backing at all, which is the one thing this must not become — the halo
  // is what makes a name readable over grass, over a starfield and over a disc.
  o.haloAtFull = M.haloAlpha(1, 2);
  o.solidAtFullStrength = Math.abs(o.haloAtFull - 1) < 1e-9;
  // One helper, so a second fading label cannot answer it differently.
  o.oneStrokeSquares = Math.abs(M.haloAlpha(0.5, 1) - 0.25) < 1e-9;
  o.twoStrokesComposite = Math.abs((1 - Math.pow(1 - M.haloAlpha(0.5, 2), 2)) - 0.25) < 1e-9;
  return o;
});

// ============================================================
//  READABLE OR GONE — there is no faint state
// ============================================================
// ⚠️ Reported as "the text player name in game is worthless and can't be read; if it is
// that blurry then just hide it". The near-ball ramp is what produced it: `far` is 190
// world units on a pitch 440 across and the fade is t², so a body 90 units from the ball
// drew its name at 0.22 alpha — too faint to read and too present to ignore, over most of
// the pitch. Both the ramp and the draw now refuse anything under `LABEL_MIN`.
// ⚠️ Measured on RENDERED INK against the same frame with no plate, never on the flag: a
// "the plate is hidden" check that reads a number passes on a build that draws it anyway.
const legible = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.applyBundle('grass');
  M.sel.mode='1v1'; M.sel.lobby='off'; M.sel.names='KAI'; M.setMatchSeed(5); M.startMatch();
  const w = M.world; w.state='play'; w.stateT=2;
  const me = w.players[0];
  me.x = 0; me.y = 0; w.ball.x = 9000; w.ball.y = 9000;
  for (const q of w.players) if (q !== me){ q.x = 0; q.y = 9000; }
  const c = document.getElementById('game'), cx = c.getContext('2d');
  const dpr = c.width / c.clientWidth, NP = M.NAMEPLATE;
  const band = (alpha) => {
    M.renderAlpha = 1; M.render();            // first render snaps labelA to its target
    M.labelA[0] = alpha;
    M.render();
    const px = Math.round(M.wx(me.x) * dpr);
    const base = Math.round(M.wy(me.y) * dpr) + (15 * M.cam.s + NP.gap) * dpr;
    const top = Math.round(base - (NP.size + 4) * dpr);
    const h = Math.round((NP.size + 10) * dpr), half = Math.round(70 * dpr);
    return cx.getImageData(px - half, top, half*2, h).data;
  };
  const base0 = band(0);
  const ink = (alpha) => { const d = band(alpha); let sum = 0;
    for (let i = 0; i < d.length; i += 4)
      sum += Math.abs(d[i]-base0[i]) + Math.abs(d[i+1]-base0[i+1]) + Math.abs(d[i+2]-base0[i+2]);
    return sum; };
  o.min = M.LABEL_MIN;
  o.atFull  = ink(1);
  o.justOver  = ink(M.LABEL_MIN + 0.02);
  o.justUnder = ink(M.LABEL_MIN - 0.02);
  o.deepMush  = ink(0.22);                    // what a body 90 units from the ball used to get
  o.nothingInTheMush = o.justUnder === 0 && o.deepMush === 0;
  // ⚠️ ...and it is still DRAWN at the floor, or "nothing in the mush" is satisfied by a
  // build that never draws a name at all. ⚠️ `atFull > 0` is not redundant: as a bare
  // ratio the test reads `justOver > 0` on a build that draws nothing at full strength,
  // which is exactly the build this half exists to catch (measured — a floor of 1.01
  // passed it).
  o.drawnAtTheFloor = o.atFull > 0 && o.justOver > o.atFull * 0.3;
  // ⚠️ ONE constant: the ramp must agree with the draw. A distance the ramp says to show
  // must be a value the draw will accept, and everything else must be exactly zero — two
  // numbers would drift into a plate the fade shows and the draw declines.
  o.rampMatchesTheDraw = true; o.rampValues = [];
  for (let d = 0; d <= M.LABEL_BALL.far + 40; d += 10){
    const v = M.labelBallFade(d);
    o.rampValues.push(+v.toFixed(2));
    if (v !== 0 && v < M.LABEL_MIN) o.rampMatchesTheDraw = false;
  }
  return o;
});

console.log('LEGIBLE:', JSON.stringify({ ...legible, rampValues: undefined }));

// ============================================================================
//  THE TYPE ITSELF — reported as the names "looking a bit AI generated".
//
//  Magnified, a 13px name plate came out as a black bar with coloured holes in it. Kenney
//  Mini Square's stems and counters at that size are about 2px, and the halo was struck
//  twice at `lineWidth: 3.6` with a round join — 1.8px of ink added either side of every
//  stroke — so the counter of a P closed up, the A and the P of VAPE merged into one
//  shape and the two O's of BOOTS shared a wall. On top of that the baseline came from
//  `screenPt`, which is fractional by construction, so a PIXEL font was resampled across
//  two device columns per stem and the same letter came out 2px wide in one place and 3px
//  in another. That is the same "blur common with AI generated content" the owner named
//  about the canvas DPR, one layer further in.
//
//  Two claims, and neither uses a tuned threshold.
// ============================================================================
const type = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.look.palette = 'grass'; M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
  M.setMatchSeed(11); M.startMatch({ lobby:false });
  const w = M.world; w.state = 'play'; w.stateT = 1;
  const me = w.players[0];
  // Everyone else and the ball miles away: `labelBallFade` hides a plate near the ball and
  // `LABEL_DIM` fades one under a disc, so a crowded pitch measures the FADE, not the type.
  w.players.forEach((q, i) => { if (q !== me){ q.x = 9e3 + i; q.y = 9e3; q._px = q.x; q._py = q.y; } });
  w.ball.x = 9e3; w.ball.y = -9e3; w.ball.vx = w.ball.vy = 0;
  w.ball._px = w.ball.x; w.ball._py = w.ball.y;
  if (w.extraBalls) w.extraBalls.length = 0;
  me.name = 'BOOTS';
  const put = (x, y) => { me.x = x; me.y = y; me._px = x; me._py = y; me.vx = me.vy = 0; };
  put(0, 0);
  M.computeCam();
  // Settle the plate to full alpha — the draw records a target and advanceLabels eases it.
  M.drawDiscs(w); for (let i = 0; i < 90; i++){ M.advanceLabels(); M.drawDiscs(w); }

  const cv = document.getElementById('game'), c2 = cv.getContext('2d');
  const DPR = cv.width / cv.clientWidth;
  // The strip the plate is drawn in: `NAMEPLATE.gap` below the body's centre, one line tall.
  const NP = M.NAMEPLATE;
  // ⚠️ **THE BAND MUST START BELOW THE DISC, and the first version did not.** It began
  // `gap - size` above the baseline, which at DPR 1 is two pixels ABOVE the body's own
  // edge — so the snap check was measuring the disc's anti-aliased rim, which really does
  // change when the body moves a third of a pixel, and reported a perfectly snapped plate
  // as unsnapped. The plate's cap tops sit `gap - capHeight` below the disc; starting at
  // `gap - size + 2` clears the body and still contains every letter.
  const band = () => {
    const [sx, sy] = M.screenPt(M.wx(me.x), M.wy(me.y));
    const discBot = sy + me.r * M.cam.s;
    const top = discBot + (NP.gap - NP.size) + 2;
    return { x: Math.round((sx - 90) * DPR), y: Math.round(top * DPR),
             w: Math.round(180 * DPR), h: Math.round((NP.size + 4) * DPR) };
  };
  const grab = () => { const q = band(); M.render();
    return c2.getImageData(q.x, q.y, q.w, q.h).data; };

  // ---- 1. THE BASELINE IS ON THE DEVICE-PIXEL GRID --------------------------------
  // ⚠️ **AN EXACT, WIRING-LEVEL CHECK WITH NO THRESHOLD.** If the anchor is snapped, two
  // body positions a THIRD of a device pixel apart land the letters on identical pixels;
  // if it is not, the resampling differs and so does the picture. Testing `snapTextPt`
  // directly would prove only that a helper exists — this proves `drawOneDisc` calls it.
  const perDev = 1 / (M.cam.s * DPR);          // world units in one device pixel
  const a0 = grab();
  put(0.3 * perDev, 0); const a1 = grab();
  put(3 * perDev, 0);   const a2 = grab();
  const same = (u, v) => { if (u.length !== v.length) return false;
    for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false; return true; };
  o.snappedToTheGrid = same(a0, a1);
  // ⚠️ ...and the control: THREE whole device pixels must move it. Without this, "the
  // picture did not change" is equally true of a build that draws no plate at all, or of
  // a probe pointed at a patch of empty grass.
  o.aWholePixelMovesIt = !same(a0, a2);

  // ---- 2. THE HALO DOES NOT CLOSE THE LETTERFORMS ---------------------------------
  // ⚠️ **MEASURED OFF THE CONSTANTS, IN THEIR OWN UNITS — a scan of the pitch cannot do
  // this, and the first version that tried READ BACKWARDS.** Counting fully-clear columns
  // across the plate on the pitch scored the reported build ELEVEN and the fixed one
  // FIVE — i.e. "better" for the build with the merged letters — because the two are
  // rendered at different sizes and the band slices them differently. Whether letters
  // merge is a property of the halo against the FONT at `NAMEPLATE.size`, so it is
  // measured there: same font, same tracking, flat ground, nothing else in the picture.
  // ⚠️ **RENDERED AT 8× AND MEASURED BACK DOWN.** Sub-pixel geometry cannot be measured
  // at one device pixel per CSS pixel: the true gap between two glyphs at 14px is a
  // fraction, and a 1:1 scan reports whichever whole columns happen to fall clear — which
  // read "2px" for a gap the 2.4 halo demonstrably does not close on screen. At 8× the
  // measurement resolves an eighth of a pixel and the answer stops depending on where the
  // grid happens to land.
  const Z = 8;
  const off = document.createElement('canvas');
  off.width = 220 * Z; off.height = 40 * Z;
  const g = off.getContext('2d');
  const word = 'BOOTS';
  const paint = (halo) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000000'; g.fillRect(0, 0, off.width, off.height);
    g.setTransform(Z, 0, 0, Z, 0, 0);
    if ('letterSpacing' in g) g.letterSpacing = NP.track + 'px';
    g.font = `${NP.size}px 'Kenney', system-ui, -apple-system, sans-serif`;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.lineJoin = 'round'; g.miterLimit = 2;
    if (halo > 0){ g.lineWidth = halo; g.strokeStyle = '#ffffff';
                   g.strokeText(word, 12, 27); g.strokeText(word, 12, 27); }
    g.fillStyle = '#ffffff'; g.fillText(word, 12, 27);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.setTransform(1, 0, 0, 1, 0, 0);
    return g.getImageData(0, 0, off.width, off.height).data;
  };
  // Background components not reachable from the border = the holes inside letterforms.
  // B has two, each O has one, T and S have none: five letters, four counters.
  const holes = (d) => {
    const W2 = off.width, H2 = off.height;
    const ink = new Uint8Array(W2 * H2);
    for (let i = 0, k = 0; i < d.length; i += 4, k++) ink[k] = d[i] > 96 ? 1 : 0;
    const seen = new Uint8Array(W2 * H2);
    const stack = [];
    for (let x = 0; x < W2; x++){ stack.push(x, x + (H2-1)*W2); }
    for (let y = 0; y < H2; y++){ stack.push(y*W2, y*W2 + W2-1); }
    while (stack.length){
      const k = stack.pop();
      if (seen[k] || ink[k]) continue;
      seen[k] = 1;
      const x = k % W2, y = (k / W2) | 0;
      if (x > 0) stack.push(k-1);
      if (x < W2-1) stack.push(k+1);
      if (y > 0) stack.push(k-W2);
      if (y < H2-1) stack.push(k+W2);
    }
    let n = 0;
    for (let k = 0; k < ink.length; k++){
      if (ink[k] || seen[k]) continue;
      n++; const st = [k];
      while (st.length){
        const j = st.pop();
        if (seen[j] || ink[j]) continue;
        seen[j] = 1;
        const x = j % W2, y = (j / W2) | 0;
        if (x > 0) st.push(j-1);
        if (x < W2-1) st.push(j+1);
        if (y > 0) st.push(j-W2);
        if (y < H2-1) st.push(j+W2);
      }
    }
    return n;
  };
  // Narrowest fully-clear column run between the first and last ink, drawn with NO halo:
  // that is the gap the halo has to fit inside, and it grows by `halo` (half from each
  // side) when the stroke is added.
  const narrowestGap = (d) => {
    const W2 = off.width, H2 = off.height;
    const inked = new Array(W2).fill(false);
    for (let x = 0; x < W2; x++)
      for (let y = 0; y < H2; y++) if (d[(y*W2 + x)*4] > 96){ inked[x] = true; break; }
    const first = inked.indexOf(true), last = inked.lastIndexOf(true);
    let best = Infinity, run = 0;
    for (let x = first + 1; x < last; x++){
      if (!inked[x]) run++;
      else { if (run){ best = Math.min(best, run); run = 0; } }
    }
    return best === Infinity ? 0 : best;
  };
  const bare = paint(0);
  o.countersBare = holes(bare);
  o.gapBare = +(narrowestGap(bare) / Z).toFixed(2);       // back into CSS pixels
  o.countersDrawn = holes(paint(NP.halo));
  // ⚠️ The claim: the halo may thicken the letters but may not CLOSE any of them. At the
  // reported 3.6 on 13px type it closed the P and welded VAPE's A and P together; the
  // bare count is the control, so this needs no constant of its own.
  // ⚠️ **NOT "all four survive" — that would be a bar this design never meets and never
  // needs to.** A halo wide enough to lay a solid backing over a starfield will close the
  // tightest counters at 14px, and that is the trade the backing is for. What must not
  // happen is the word becoming a SLAB: at the reported 3.6 on 13px type, ZERO of BOOTS'
  // four counters survived and VAPE rendered as a black bar with red bits in it. Two of
  // four survive now. `countersBare` is the control, so there is no constant here either
  // — a build that draws nothing scores 0 on both and fails.
  o.notASlab = o.countersBare > 0 && o.countersDrawn > 0;
  // ⚠️ The three measurements above are about the CONSTANTS. This is the one that says
  // the pitch is really drawing a plate with them, so "the type is well set" cannot be
  // satisfied by a game that draws no names at all. `snappedToTheGrid` covers the other
  // half of the wiring — that `drawOneDisc` goes through `snapTextPt`.
  const bandNow = band();
  const dd = c2.getImageData(bandNow.x, bandNow.y, bandNow.w, bandNow.h).data;
  let plateInk = 0;
  for (let i = 0; i < dd.length; i += 4)
    if (dd[i] + dd[i+1] + dd[i+2] > 460) plateInk++;   // the pale letter face over grass
  o.plateInk = plateInk;
  o.plateIsDrawn = plateInk > 40;
  // ⚠️ ...and the same rule between letters: two adjacent glyphs each grow by half the
  // halo, so they touch the moment the gap is no wider than the halo itself.
  o.lettersStandApart = o.gapBare > NP.halo;
  o.tracking = NP.track; o.halo = NP.halo; o.size = NP.size;
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('TYPE:', JSON.stringify(type));
console.log('HALO:', JSON.stringify(halo));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const near = (v,t)=>Math.abs(v-t) < 0.02;
const okOrient = m => near(m.clear,1) && near(m.discOver,r.floor) && near(m.discAway,1)
                   && near(m.ballOver,r.floor) && near(m.ballAway,1) && near(m.selfNeverDims,1);
const ok = okOrient(r.upright) && okOrient(r.sideways) && r.gradual && r.replayFades &&
  r.platesDifferByTeam && r.team0ReadsRed && r.team1ReadsBlue && r.boxesMatchEachOther &&
  r.everyThemeClearsAA && r.inksDifferEveryTheme && r.rawWouldHaveFailed &&
  halo.fadesNoSlowerThanItSays && halo.solidAtFullStrength &&
  legible.nothingInTheMush && legible.drawnAtTheFloor && legible.rampMatchesTheDraw &&
  halo.oneStrokeSquares && halo.twoStrokesComposite &&
  type.snappedToTheGrid && type.aWholePixelMovesIt && type.lettersStandApart &&
  type.notASlab && type.plateIsDrawn && errors.length===0;
if (!type.snappedToTheGrid)
  console.log('  the name plate is NOT snapped to the device pixel grid — a third of a pixel of body ' +
              'movement redrew the letters differently, which is a pixel font resampled across two columns');
if (!type.aWholePixelMovesIt)
  console.log('  ...and three whole device pixels did not move it either, so the probe is measuring ' +
              'a patch of grass or a plate that is never drawn — the check above passes for the wrong reason');
if (!type.lettersStandApart)
  console.log(`  adjacent letters merge: the narrowest gap in "BOOTS" at ${type.size}px with ` +
              `${type.tracking}px of tracking is ${type.gapBare}px, and a halo of ${type.halo} eats all of it`);
if (!type.notASlab)
  console.log(`  the halo closes the word into a slab: ${type.countersDrawn} counters survive of ` +
              `${type.countersBare} at halo ${type.halo} on ${type.size}px type`);
if (!type.plateIsDrawn)
  console.log(`  no name plate was found on the pitch at all (${type.plateInk} pale pixels in the band), ` +
              'so every measurement above is about a build that draws no names');
if (!halo.fadesNoSlowerThanItSays)
  console.log('  the plate outlives its own text:', JSON.stringify(halo.at),
              '— each must be at or under its own alpha; the reported build reads 0.534 at 0.5 and 0.196 at 0.15');
if (!halo.solidAtFullStrength) console.log('  the halo is no longer solid at full strength:', halo.haloAtFull);
if (!legible.nothingInTheMush)
  console.log(`  a plate is drawn in the unreadable band: ${legible.justUnder} of ink just under the floor and ${legible.deepMush} at 0.22, which is what a body 90 units from the ball used to get`);
if (!legible.drawnAtTheFloor)
  console.log(`  nothing is drawn at the floor either (${legible.justOver} against ${legible.atFull} at full) — "hidden when faint" must not be satisfied by never drawing a name`);
if (!legible.rampMatchesTheDraw)
  console.log('  the near-ball ramp returns values the draw will refuse:', JSON.stringify(legible.rampValues));
if(!ok) console.log('upright:', okOrient(r.upright), '| sideways:', okOrient(r.sideways), '| gradual:', r.gradual, '| replay:', r.replayFades);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
