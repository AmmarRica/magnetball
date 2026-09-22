// SUNDAY LEAGUE — footballers seen from directly above, and the guide-ring exception.
//
// THE ASK: "have the players look like the players in this pic. Body inside the circle
// but legs can go out. Make it animated. Set this as one of the themes." The picture is
// Kenney's own top-down sports sample.
//
// ⚠️ The standing rule is that a skin may NOT cross the guide ring, because the ring is
// the circle that collides and the VideoSoccer arrowhead once shipped a third bigger than
// its own collider. The owner granted the exception in the ask itself, so what is checked
// here is the narrowed version of the rule: the SHIRT — the body — stays inside `r`, only
// the limbs reach past it, and the whole figure has a CEILING so "legs can go out" cannot
// drift into a body drawn bigger than the thing it collides with. All three are needed:
// each one passes on a build that breaks either of the others.
//
// ⚠️ The generic claims are NOT repeated here. `tests/discskins.mjs` already walks the
// whole registry for the guide ring, and already holds the distance-driven gait (a DRAW
// must not advance it, frame 0 is the rest pose, faster travel means faster legs). One
// owner, many readers — a second copy is the one that rots.
//
// ⚠️ Measurement traps. The pixels have to be classified against the flat backdrop the
// figure is painted on, not against an absolute; the two ends of the stride differ ONLY in
// the limbs, so a whole-frame diff that finds nothing inside the torso is the claim rather
// than a weakness; and the two limb probes each produced a false reading before they were
// right — see the notes on `boot` below.
import { chromium, LAUNCH, pinCasualFeel } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);
await pinCasualFeel(p);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.applyBundle('kickabout');

  const R = 60, CX = 150, CY = 150, W = 300;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = W;
  const c = cv.getContext('2d');
  const BG = [127,127,127];
  const body = (opt) => Object.assign(
    { team:0, faceX:1, faceY:0, r:R, name:'Mike', cap:'none', color:'#46d17a',
      vx:0, vy:0, gait:0 }, opt||{});
  const paint = (opt) => {
    c.fillStyle = '#7f7f7f'; c.fillRect(0,0,W,W);
    const q = body(opt);
    M.DISC_SKINS.footballers.paint(c, q, CX, CY, R, { players:[q] });
    return c.getImageData(0,0,W,W).data;
  };
  const near = (d,i,col,tol) => Math.abs(d[i]-col[0])+Math.abs(d[i+1]-col[1])+Math.abs(d[i+2]-col[2]) <= tol;
  const hex = (h) => [1,3,5].map(k=>parseInt(h.substr(k,2),16));
  // Farthest painted pixel from the centre and the centroid ALONG the facing axis, over
  // whatever "painted" is asked for. Facing is +x here, so `ax` is along and `ay` across.
  const scan = (d, pick) => {
    let m = 0, n = 0, sx = 0;
    for (let i=0;i<d.length;i+=4){
      const k=(i/4)|0, ax=(k%W)-CX, ay=((k/W)|0)-CY, rad = Math.hypot(ax,ay);
      if (!pick(d,i,ax,ay,rad)) continue;
      m = Math.max(m, rad); sx += ax; n++;
    }
    return { reach:+(m/R).toFixed(3), along: n ? +(sx/n/R).toFixed(3) : null, n };
  };
  const anyInk = (d,i) => !near(d,i,BG,40);
  const fnv = (d) => { let h=2166136261; for (let i=0;i<d.length;i+=4){ h ^= d[i]; h = Math.imul(h,16777619); h ^= d[i+1]; h = Math.imul(h,16777619); h ^= d[i+2]; h = Math.imul(h,16777619); } return h>>>0; };
  const moved = (a2,b2,keep) => {
    let n = 0;
    for (let i=0;i<a2.length;i+=4){
      const diff = Math.abs(a2[i]-b2[i])+Math.abs(a2[i+1]-b2[i+1])+Math.abs(a2[i+2]-b2[i+2]);
      if (diff <= 24) continue;
      const k=(i/4)|0, ax=(k%W)-CX, ay=((k/W)|0)-CY;
      if (keep(Math.hypot(ax,ay))) n++;
    }
    return n;
  };
  const corr = (u,v) => {
    const mu = u.reduce((s2,x2)=>s2+x2,0)/u.length, mv = v.reduce((s2,x2)=>s2+x2,0)/v.length;
    let num=0, du=0, dv=0;
    for (let i=0;i<u.length;i++){ const a2=u[i]-mu, b2=v[i]-mv; num+=a2*b2; du+=a2*a2; dv+=b2*b2; }
    return +(num/Math.sqrt(du*dv || 1)).toFixed(3);
  };

  // ---- 1. the stride, sampled right round the cycle ---------------------------
  // ⚠️ **THE OLD BLOCK COMPARED `gait:0` AGAINST `gait:GAIT.stride`, AND ON A CONTINUOUS
  // PHASE THOSE ARE BOTH ZERO-CROSSINGS** — sin(0) and sin(pi) — so the two "walk frames"
  // became the SAME PICTURE and every check hung off them went vacuous. It is measured
  // right round the cycle now, which is also the only way to say a foot goes in front AND
  // behind rather than merely moving.
  const homeCol = M.TH.teamRed, awayCol = M.TH.teamBlue;
  const ink = hex(M.TH.discRim || '#151515');
  const skinCol = hex(M.kitPerson({ name:'Mike' })[1]);
  const PH = 12, CYCLE = 2 * M.GAIT.stride;
  const frames = [];
  for (let k=0;k<PH;k++) frames.push(paint({ vx:3, gait: k*CYCLE/PH }));

  // ⚠️ ONE SIDE ONLY. The two legs are half a cycle apart, so the pair's centroid barely
  // moves and the UNION of both limbs is symmetric under the swap — measured on the
  // reported build as `lo -0.93, hi 0.87` at every single phase, a probe that could not
  // see the defect at all. Facing +x puts `sgn:+1` in the lower half (`ay > 0`).
  // ⚠️ THE BOOT IS ISOLATED BY HOW FAR ACROSS IT IS, NEVER BY RADIUS FROM THE CENTRE, and
  // a radius filter is what got written first: the boot sits 0.62r across, so at the phase
  // where it is directly beside the body its radius is 0.68r, a `rad > 0.80r` cut kept only
  // the outer rim of it — and at the next phase it lost the boot ENTIRELY and the probe
  // reported a fabricated 0 for the centroid. Across it is the hair that has to be
  // excluded (the same ink on one of the four people), and the hair reaches 0.42r across
  // against a boot spanning 0.43..0.81r.
  const boot = (d,i,ax,ay,rad) => ay > R*0.45 && near(d,i,ink,40);
  // ...and the hand by being further ACROSS than any part of a leg can reach (foot 0.62
  // plus half the leg's width is 0.75r, against a hand held at 1.20r).
  const hand = (d,i,ax,ay,rad) => ay > R*0.95 && near(d,i,skinCol,40);
  const footAlong = [], handAlong = [], handPix = [], bootPix = [], figR = [], shirtR = [];
  for (const f of frames){
    const bt = scan(f, boot), hd = scan(f, hand);
    footAlong.push(bt.along); handAlong.push(hd.along);
    handPix.push(hd.n); bootPix.push(bt.n);
    figR.push(scan(f, anyInk).reach);
    shirtR.push(scan(f, (d,i)=>near(d,i,hex(homeCol),48)).reach);
  }
  // ⚠️ **A PHASE WHERE THE BOOT IS NOWHERE TO BE FOUND IS THE FEATURE, NOT A HOLE IN THE
  // PROBE — and it was read as a hole first.** The limbs are painted BEFORE the shirt, so
  // a foot swung level with the hip sits under an ellipse 0.88r across and is covered
  // completely: that occlusion is the whole of what "under the player" means here. The
  // pair is what says so — the boot has to be plainly there at some phase and plainly gone
  // at another. The reported build could satisfy neither: its foot was pinned behind the
  // body at 0.76r across, where the shirt does not reach at all.
  o.bootPixels = bootPix;
  // A whole boot is ~370 pixels at this radius, so 250 is plainly there and 20 is gone.
  o.footPassesUnderTheShirt = bootPix.some(n => n < 20) && bootPix.some(n => n > 250);
  o.footAlong  = footAlong;
  o.handAlong  = handAlong;
  const seen = footAlong.map((v,i2)=>[v,i2]).filter(([v])=>v != null);
  o.footFront  = Math.max(...seen.map(([v])=>v));
  o.footBack   = Math.min(...seen.map(([v])=>v));
  o.footTravel = +(o.footFront - o.footBack).toFixed(3);
  o.handFront  = Math.max(...handAlong);   o.handBack = Math.min(...handAlong);
  o.handTravel = +(o.handFront - o.handBack).toFixed(3);
  // ...paired over the phases where BOTH were measurable, or a null foot pulls the
  // correlation toward whatever a fabricated value happens to be.
  o.legArmCorr = corr(seen.map(([v])=>v), seen.map(([,i2])=>handAlong[i2]));
  o.handPixelsMin = Math.min(...handPix);
  o.poses = new Set(frames.map(fnv)).size;
  o.footSwingsThroughTheBody = o.footFront > 0.15 && o.footBack < -0.50;
  o.handSwingsForeAndAft     = o.handTravel > 0.30;
  o.armsCounterSwingTheLegs  = o.legArmCorr < -0.90;
  o.armsAlwaysVisible        = o.handPixelsMin > 30;
  o.manyFrames               = o.poses >= 6;

  // ---- 2. the ring exception, held at EVERY phase ------------------------------
  const shirtPx = scan(frames[0], (d,i)=>near(d,i,hex(homeCol),48));
  o.shirtPixels = shirtPx.n;
  o.figureReachMin = Math.min(...figR);  o.figureReachMax = Math.max(...figR);
  o.shirtReachMax  = Math.max(...shirtR);
  o.shirtInsideTheRing  = shirtPx.n > 400 && o.shirtReachMax <= 1.0;
  o.limbsCrossTheRing   = o.figureReachMin >= 1.15;      // at the WORST phase, not the best
  o.limbsAreLimbs       = o.figureReachMax <= 1.60;      // ...and not a bigger body
  o.limbsClearTheShirt  = o.figureReachMin >= o.shirtReachMax * 1.25;

  // ---- 3. the swing goes UNDER the torso, which is the shirt occluding it ------
  // The two opposite peaks of the phase (`sin` at +1 and -1), a quarter and three quarters
  // of the way round: the limbs are at opposite ends of their travel and the shirt, the
  // head and the shorts are the same picture in both.
  const a0 = frames[Math.round(PH*0.25)], a1 = frames[Math.round(PH*0.75)];
  o.framesDifferOutside = moved(a0, a1, rad => rad > R*0.80);
  o.framesSameInside    = moved(a0, a1, rad => rad < R*0.55);
  o.limbsAnimate        = o.framesDifferOutside > 300;
  o.torsoHoldsStill     = o.framesSameInside < 40;

  // ⚠️ AT REST IT IS A FIXED STANCE, never the phase frozen wherever the player stopped —
  // or somebody who stops mid-stride is left standing with a leg stretched out behind.
  const stand = paint({ vx:0, gait:0 });
  o.restIsAFixedStance = fnv(stand) === fnv(paint({ vx:0, gait: CYCLE*0.37 }));
  o.standMoved   = moved(stand, a0, () => true);
  o.standIsCalmer = o.standMoved > 120;

  // ---- 4. the sides: measured, because the silhouette rule cannot be met -------
  // Both sides are footballers, so the LIGHTNESS GAP is the instrument, the way it is
  // for Sketchbook's counters. The bar is set above Sketchbook's own widest pair (1.87),
  // because a pair no wider than that one buys nothing a colour-blind player can use.
  const lum = (h)=>M.relLum(h);
  o.kits = [homeCol, awayCol];
  o.kitLums = [ +lum(homeCol).toFixed(3), +lum(awayCol).toFixed(3) ];
  o.lightGap = +(((Math.max(...o.kitLums)+0.05)/(Math.min(...o.kitLums)+0.05))).toFixed(2);
  o.sidesFarApartInLightness = o.lightGap > 1.87;
  // ...at the SAME phase as the home frame it is compared against, or the limbs move
  // between the two pictures and a build whose two kits are identical still scores.
  const away = paint({ team:1, vx:3, gait: Math.round(PH*0.25)*CYCLE/PH });
  o.sidesDifferOnScreen = moved(a0, away, () => true) > 1500;
  // ...and the shirt really is the TEAM colour, so a palette swap recolours it.
  o.awayShirtPixels = scan(away, (d,i)=>near(d,i,hex(awayCol),48)).n;
  o.shirtIsTheTeamColour = o.shirtPixels > 400 && o.awayShirtPixels > 400;

  // ---- 5. the kit trim is WHITE on a dark kit, dark on a pale one --------------
  // ⚠️ This is a real defect caught by a render rather than by reasoning: the first build
  // used `pickTextColor`, which takes whichever ink has the higher CONTRAST — and that is
  // the dark one on BOTH of this theme's kits, so the picture's white shorts came out
  // black on both sides. Sampled straight behind the head, beyond the shirt, where only
  // the shorts are drawn.
  const trimAt = (d) => {
    const x = Math.round(CX - 0.80*R), y = CY, i = (y*W + x)*4;
    return [d[i], d[i+1], d[i+2]];
  };
  const mean = (v)=> (v[0]+v[1]+v[2])/3;
  o.trimOnDarkKit = trimAt(paint({ team: lum(homeCol) < lum(awayCol) ? 0 : 1, vx:3 }));
  o.trimOnPaleKit = trimAt(paint({ team: lum(homeCol) < lum(awayCol) ? 1 : 0, vx:3 }));
  o.trimIsLightOnADarkKit = mean(o.trimOnDarkKit) > 200;
  o.trimIsDarkOnAPaleKit  = mean(o.trimOnPaleKit) < 90;

  // ---- 6. four people, chosen by a hash, never rolled --------------------------
  const sig = (name)=> paint({ name, vx:3 }).join(',');
  o.sameNameSamePicture = sig('Mike') === sig('Mike');
  const looks = new Set(['Mike','vape','salt','bolt','jake','moon','cat','dog'].map(sig));
  o.peopleSeen = looks.size;
  o.peopleVary = looks.size >= 3;
  o.peopleTable = M.KIT_PEOPLE.length;
  // ⚠️ no `Math.random` anywhere: a paint has to give the same picture twice for one step.
  o.noRandomInThePaint = !/Math\s*\.\s*random/.test(String(M.DISC_SKINS.footballers.paint) +
                                                    String(M.kitPerson));

  // ---- 7. the body turns to face travel ---------------------------------------
  const facing = (fx, fy) => paint({ faceX:fx, faceY:fy, vx:3 }).join(',');
  o.turnsToFaceTravel = facing(1,0) !== facing(0,1);

  // ---- 8. the theme ------------------------------------------------------------
  o.isBundle = !!M.bundleSlots('kickabout');
  M.applyBundle('kickabout');
  o.slots = JSON.stringify(M.liveSlots());
  o.named = M.bundleName();
  o.setsTheSkin = M.sel.look.discs === 'footballers';
  // ⚠️ NO field painter and NO pitch: the mow is `stripeA`/`stripeB`, which `drawPitch`
  // already paints, and a Sunday league is a treatment that works on any rectangle.
  const bs = M.THEME_BUNDLES.kickabout;
  o.noFieldPainter = !bs.field;
  o.noCourt = !bs.pitch;
  const th = M.THEMES.kickabout.pitch;
  o.mown = th.stripeA !== th.stripeB;
  o.reusesClassicBall = bs.ball === 'classic';
  o.themeNamed = M.THEMES.kickabout.name;

  // ---- 9. render only, and it plays -------------------------------------------
  // ⚠️ **THE CONTROL IS THE SAME THEME WITH THE SKIN STOOD DOWN, and `applyBundle` for the
  // other arm was VACUOUS — caught by a sabotage passing.** There is no `classic` theme
  // key (the default palette is `grass`), so `applyBundle('classic')` is a silent no-op
  // and both arms ran with `look.discs` still `footballers`: the two runs were the same
  // build compared against itself, and a `p.vx += 0.01` inside the paint sailed through.
  // Writing the slot directly is the one spelling that cannot be a no-op.
  const hashRun = (discs) => {
    M.applyBundle('kickabout');
    M.sel.look.discs = discs;
    M.sel.mode='4v4'; M.sel.length='5'; M.setMatchSeed(7); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    let h = 2166136261, escapes = 0;
    for (let i=0;i<900;i++){
      M.step(w);
      if (i % 60 === 0) M.render();
      const bl = w.ball;
      if (Math.abs(bl.x) > w.field.W/2 + bl.r + 2) escapes++;
    }
    const nums = [];
    for (const q of w.players) nums.push(q.x, q.y, q.vx, q.vy);
    nums.push(w.ball.x, w.ball.y, w.ball.vx, w.ball.vy, w.score[0], w.score[1]);
    for (const v of nums){ const s = v.toFixed(6);
      for (let k=0;k<s.length;k++){ h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } }
    return { h: h>>>0, escapes };
  };
  const onIt  = hashRun('footballers');
  const offIt = hashRun('none');
  o.escapes = onIt.escapes + offIt.escapes;
  o.renderOnly = onIt.h === offIt.h;

  M.applyBundle('grass'); M.sel.mode='1v1'; M.setMatchSeed(null);
  return o;
});

const fail=[];
const ok=(c2,m)=>{ if(!c2) fail.push(m); };
ok(r.footPassesUnderTheShirt,
  `the boot is either always visible or never (${JSON.stringify(r.bootPixels)} pixels by phase) — the limbs are painted under the shirt so that a foot level with the hip is COVERED by it, and that occlusion is the whole of "swing under the player". A foot pinned out behind the body, which is what was reported, is never covered at all`);
ok(r.footSwingsThroughTheBody,
  `one foot's centroid runs ${r.footBack}..${r.footFront}r along the facing axis over a whole cycle (${JSON.stringify(r.footAlong)}) — it has to reach in FRONT of the body and behind it, passing under the shirt on the way. Parked behind at both ends is what was reported as the players swimming, and on that build it measured -1.01..-0.55`);
ok(r.handSwingsForeAndAft,
  `the hand travels ${r.handTravel}r over a cycle (${JSON.stringify(r.handAlong)}) — the arms swing fore-and-aft too, they are not held out in front`);
ok(r.armsCounterSwingTheLegs,
  `the foot and the hand on the SAME side move together (correlation ${r.legArmCorr}) — the arms counter-swing the legs, which is what running does and what stops four limbs reading as a star jump`);
ok(r.armsAlwaysVisible,
  `at some phase the hand all but disappears (${r.handPixelsMin} pixels at its worst) — the legs are free to sweep under the shirt only because the ARMS are held wide enough to clear it at every phase, or all four limbs tuck at once and the figure is a bare oval twice a stride`);
ok(r.manyFrames,
  `only ${r.poses} distinct pictures over a whole stride — "add more frames of animation" was the ask, and the two-frame build scored 2`);
ok(r.shirtInsideTheRing,
  `the SHIRT crosses the guide ring: ${r.shirtReachMax}r at its worst phase over ${r.shirtPixels} pixels — the body has to stay inside the circle it collides with, which is the half of the exception that was NOT granted`);
ok(r.limbsCrossTheRing,
  `at some phase nothing reaches past the guide ring: the figure falls to ${r.figureReachMin}r — "legs can go out" was the ask, and it has to hold right round the cycle rather than at one lucky pose`);
ok(r.limbsAreLimbs,
  `the figure reaches ${r.figureReachMax}r — past the ceiling, which is a body drawn bigger than the thing it collides with rather than limbs sticking out of one`);
ok(r.limbsClearTheShirt,
  `the limbs barely clear the shirt: figure ${r.figureReachMin}r at its worst against shirt ${r.shirtReachMax}r`);
ok(r.limbsAnimate,
  `the two opposite peaks of the stride are the same picture outside the torso (${r.framesDifferOutside} pixels moved) — the legs do not swing`);
ok(r.torsoHoldsStill,
  `${r.framesSameInside} pixels inside the torso changed between the two peaks of the stride — the head and shirt must hold still while only the limbs swing under them`);
ok(r.restIsAFixedStance,
  'a standing player draws a different pose at a different `gait` — at rest it must be a FIXED stance, or somebody who stops mid-stride is left with a leg stretched out behind');
ok(r.standIsCalmer,
  `a standing player and a walking one draw the same pose (${r.standMoved} pixels apart) — the stride is not scaled back below GAIT.minSpd`);
ok(r.sidesFarApartInLightness,
  `the two kits are ${r.lightGap} apart in lightness (${JSON.stringify(r.kits)} = ${JSON.stringify(r.kitLums)}) — both sides are footballers, so the silhouette rule cannot be met and this gap is the only thing a colour-blind player has. Sketchbook's widest pair is 1.87 and that is the bar`);
ok(r.sidesDifferOnScreen, 'the two sides render identically');
ok(r.shirtIsTheTeamColour,
  `the shirt is not painted in the team colour: home ${r.shirtPixels} away ${r.awayShirtPixels} matching pixels — a sprite could not do this, which is most of why the skin is drawn`);
ok(r.trimIsLightOnADarkKit,
  `the shorts on a DARK kit came out ${JSON.stringify(r.trimOnDarkKit)} — the picture's shorts are white, and `+
  `pickTextColor (a contrast maximum) returns the dark ink for both of this theme's kits`);
ok(r.trimIsDarkOnAPaleKit,
  `the shorts on a PALE kit came out ${JSON.stringify(r.trimOnPaleKit)} — white on a pale shirt is nothing at all`);
ok(r.sameNameSamePicture,
  'the same player drew two different pictures — a paint must be the same twice for one step');
ok(r.peopleVary, `only ${r.peopleSeen} distinct looks across eight names, out of a table of ${r.peopleTable}`);
ok(r.noRandomInThePaint, 'Math.random reached the paint or the person hash');
ok(r.turnsToFaceTravel, 'the body does not turn to face travel — a footballer has a front');
ok(r.isBundle && r.named === 'Sunday League' && r.themeNamed === 'Sunday League',
  `the Sunday League bundle does not resolve: ${r.named} / ${r.themeNamed}`);
ok(r.setsTheSkin, `the bundle does not field the skin: ${r.slots}`);
ok(r.mown, 'the pitch is flat — the mown stripes are half of what the picture is, and they are stripeA/stripeB');
ok(r.noFieldPainter && r.noCourt && r.reusesClassicBall,
  `the bundle grew a field painter, a court or a ball of its own: field=${!r.noFieldPainter} pitch=${!r.noCourt} ball=${r.reusesClassicBall?'classic':'its own'}`);
ok(r.renderOnly, 'the theme moved the world — a skin may only ever draw');
ok(r.escapes === 0, `${r.escapes} ball escapes`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nfootballers OK');
