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
// ⚠️ THE ARMS AND LEGS ARE KENNEY'S OWN PLATES, recoloured — `characterRed (11)` and
// `(13)` — so this file also has to say that the pixels on the pitch really came out of
// them, that the pack-less FALLBACK still fields readable limbs, and that neither claim is
// asserted from the other's arm. All three are measured as a DIFFERENCE against the same
// figure rendered with `KLIMB.dir` pointed at nothing, in the same run.
//
// ⚠️ Measurement traps. The pixels have to be classified against the flat backdrop the
// figure is painted on, not against an absolute; the two ends of the stride differ ONLY in
// the limbs, so a whole-frame diff that finds nothing inside the torso is the claim rather
// than a weakness; the two limb probes each produced a false reading before they were right
// (see the notes on `boot`); the sprite loads ASYNCHRONOUSLY, so a suite that paints before
// it lands measures the fallback and every number in it describes a build nobody ships; and
// ONE probe over "the limb band" is blind to half the figure, because both limbs are on the
// same side — they are told apart by the ALONG axis at the swing peak, where the arms
// counter-swing the legs.
import { chromium, LAUNCH, pinCasualFeel } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
// ⚠️ The missing-pack block below points `KLIMB.dir` at a directory that does not exist ON
// PURPOSE, and the browser reports each of those fetches as a console error some time
// later. The suite used to close before they arrived; with the planted-feet runs it no
// longer does, and a deliberate miss is not a defect. Anything else is still an error.
p.on('console',m=>{ if(m.type()==='error' && !((m.location()||{}).url||'').includes('__no_such_pack__')) errors.push(m.text()+' @ '+((m.location()||{}).url||'')); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);
await pinCasualFeel(p);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.applyBundle('kickabout');

  // ⚠️ **THE LIMB SPRITE LOADS ASYNCHRONOUSLY, SO IT IS WAITED FOR BEFORE ANYTHING IS
  // MEASURED.** `spriteImg` answers null until the file is in and the skin falls back to
  // the stroke-and-circle limbs while it is — so a suite that paints too early measures
  // the FALLBACK, and every number in it silently describes a build nobody ships. The
  // assertion beside the wait is what says which of the two was measured.
  const warmLimb = () => M.klimbSprite('arm', M.TH.teamRed,
                                       M.kitPerson({ name:'Mike' })[1], M.TH.discRim || '#151515');
  for (let i=0;i<80;i++){ if (warmLimb()) break; await new Promise(res=>setTimeout(res,40)); }
  o.limbSpriteLoaded = !!warmLimb();

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
  // ⚠️ **A LIMB IS TWO TONES NOW, and a one-tone picker under-counts it.** The arms and legs
  // are Kenney's plates recoloured, and the pack draws every band's OUTLINE as that band at
  // `KLIMB.shade` (0.72, measured off the art) — so the rim of the arm is a skin the picker
  // below missed entirely. It read 153 hand pixels at the quietest phase against the tip
  // probe's own sufficiency gate of 200 and reported the arm's length as -Infinity. This is
  // not a bar being widened: the claim (`armsAlwaysVisible`, `limbsOutreachTheBody`) is
  // untouched, and what changed is which pixels ARE the arm. With no pack the shade band
  // does not exist and this is exactly the picker it was.
  const skinDark = skinCol.map(v => Math.round(v * ((M.KLIMB && M.KLIMB.shade) || 1)));
  // ⚠️ **THE CYCLE LENGTH IS ASKED FOR, NEVER RE-DERIVED.** This read `2 * M.GAIT.stride`,
  // which was a second copy of the game's own formula — so the moment the footballers got a
  // period of their own (`FOOTBALLER.stride`), every phase-based check in this file would
  // have gone on sampling the old range and silently measured a fraction of the stride while
  // still passing. `gaitPeriod()` is the one owner.
  // ⚠️ **AND SO ARE THE PEAKS.** The two ends of a foot's travel were written as a quarter
  // and three quarters of the cycle — true of a sine and of nothing else. The planted stride
  // (`footPhase`) peaks at the PLANT and the LIFT, which are the ends of the cycle's halves,
  // so sampling at the sine's quarters measured the two phases where the foot is level with
  // the hip and UNDER the shirt: "the two peaks are the same picture" read 0 pixels moved on
  // a build whose legs swing perfectly well. The peaks are found on the game's own wave.
  const PH = 12, CYCLE = M.gaitPeriod();
  const frames = [];
  for (let k=0;k<PH;k++) frames.push(paint({ vx:3, gait: k*CYCLE/PH }));
  let kHi = 0, kLo = 0;
  for (let k=0;k<PH;k++){
    const s2 = M.gaitSwing({ vx:3, vy:0, gait: k*CYCLE/PH });
    if (s2 > M.gaitSwing({ vx:3, vy:0, gait: kHi*CYCLE/PH })) kHi = k;
    if (s2 < M.gaitSwing({ vx:3, vy:0, gait: kLo*CYCLE/PH })) kLo = k;
  }
  const PEAK = kHi*CYCLE/PH;                   // the sgn:+1 foot at its furthest forward
  o.peakPhases = [kHi, kLo];

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
  // ...and the hand by being further ACROSS than any part of a leg can reach (foot 0.82
  // plus half the leg's width is 0.95r, against a hand held at 1.34r).
  const hand = (d,i,ax,ay,rad) => ay > R*0.95 && (near(d,i,skinCol,40) || near(d,i,skinDark,40));
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

  // ---- 1b. the CADENCE, measured between two consecutive 60Hz frames -------------
  // ⚠️ **HOW FAST A STRIDE TURNS OVER IS A PROPERTY OF THE PICTURE, NOT OF THE TABLE, so
  // it is measured and not read.** Comparing `gaitPeriod()` against its own formula
  // compares the game with itself and passes at any period. What was reported is what two
  // ADJACENT frames look like: on the first build the legs turned over 7.7 times a second
  // at a moving body's median speed — 7.8 frames for a whole cycle, so the hand was most of
  // the way across its arc between one frame and the next and the run read as a blur.
  // ⚠️ **THE HAND IS THE TRACKER AND THE BOOT IS NOT**: the boot is deliberately hidden
  // under the shirt at some phases (`footPassesUnderTheShirt`), so a boot centroid is
  // missing exactly when the sampling is coarsest and the arc it appears to cover then
  // depends on where the frames happen to land. The hand is drawn at every phase.
  // ⚠️ **A DENSE ARC AGAINST A PER-FRAME JUMP, which is the only pair that is sampling
  // independent.** The arc is swept at 96 phases (the same arc whatever the period, since
  // it is geometry); the jump is taken at whole 60Hz frames at the median running speed
  // measured on a seeded 3v3, **1.80 units a step**. Measured: **0.39 of the arc in one
  // frame at the 14-unit period, 0.20 at 28** (the sine's two cadences), so the bar sits
  // between them at 0.28 — which is also about a dozen frames to a cycle, the floor
  // hand-drawn animation has always worked to. The planted stride's period is 55.8 units
  // (`FOOTBALLER.stride`), and its swing is a smoothstep whose steepest point is 1.5x the
  // average, so it reads about 0.10.
  // ⚠️ Paired with the arc being covered AT ALL (`handSwingsForeAndAft`, `manyFrames`), or
  // "the stride is slow" is satisfied outright by a leg that never moves.
  const MSPD = 1.80;
  const handAt = (g) => scan(paint({ vx:3, gait:g }), hand).along;
  const dense = [];
  for (let k=0;k<96;k++){ const a = handAt(k*CYCLE/96); if (a != null) dense.push(a); }
  o.strideArc = +(Math.max(...dense) - Math.min(...dense)).toFixed(3);
  let jump = 0, prev = null;
  for (let k=0;k<Math.ceil(CYCLE/MSPD)+2;k++){
    const a = handAt(k*MSPD);
    if (a != null && prev != null) jump = Math.max(jump, Math.abs(a - prev));
    prev = a;
  }
  o.strideFrameJump = +(jump / (o.strideArc || 1)).toFixed(3);
  o.strideIsFollowable = o.strideArc > 0.30 && o.strideFrameJump < 0.28;

  // ---- 2. the ring exception, held at EVERY phase ------------------------------
  // ⚠️ **THE BODY IS THE SHIRT AND THE SHORTS TOGETHER**, asked for as *"have players body
  // and butt fill the circle but never go outside it"*. Two shapes, one claim: their UNION
  // has to reach the guide ring and may never cross it. Measuring the shirt alone is the
  // vacuous half — the shorts are drawn UNDER it and stick out at the back, so they are
  // the part most likely to breach the ring and the part a shirt-only probe cannot see.
  // ⚠️ **"FILLS THE CIRCLE" IS A MINIMUM OVER ANGLES, NEVER THE FARTHEST PIXEL.** The
  // farthest point is one spike: a body that reaches the ring at the nose and stops at
  // 0.74 down both flanks scores a perfect 1.0 on it while leaving two crescents of bare
  // grass inside the circle that collides. What was asked for is the whole circle, so
  // every ray out of the centre is walked and the WORST one is the reading.
  const trimCol = M.relLum(homeCol) > 0.5 ? (M.TH.discRim || '#151515') : '#ffffff';
  const bodyPick = (d,i) => near(d,i,hex(homeCol),48) || near(d,i,hex(trimCol),40);
  const RAYS = 120;
  const bodyRay = (d) => {                       // farthest body pixel along each ray
    const out = new Array(RAYS).fill(0);
    for (let i=0;i<d.length;i+=4){
      if (!bodyPick(d,i)) continue;
      const k=(i/4)|0, ax=(k%W)-CX, ay=((k/W)|0)-CY;
      const a = Math.atan2(ay, ax), rad = Math.hypot(ax, ay);
      const s2 = ((a + Math.PI*2) % (Math.PI*2)) / (Math.PI*2) * RAYS | 0;
      if (rad > out[s2]) out[s2] = rad;
    }
    return out.map(v => +(v/R).toFixed(3));
  };
  // ⚠️ **THE RAYS ARE MEASURED ON FRAMES PAINTED AT 2.5x THIS SIZE.** At R 60 a ray bin is
  // 3 degrees wide and an edge is a pixel, and the SAME two ellipses read 0.906 unturned and
  // 0.895 turned a rigid 12.6 degrees with the stride (FOOTBALLER.twist) — a rotation
  // about the body cannot change a radius, so the drop was the instrument. At R 120 they
  // read 0.909 / 0.907 and at R 200 0.915 / 0.912. The margin over the 0.90 bar is real
  // only at a size where a pixel is not most of it.
  const RB = 150, WB = 5*RB;
  const cvB = document.createElement('canvas'); cvB.width = WB; cvB.height = WB;
  const cB = cvB.getContext('2d');
  const paintBig = (opt) => {
    cB.fillStyle = '#7f7f7f'; cB.fillRect(0,0,WB,WB);
    const q = body(Object.assign({ r: RB }, opt));
    M.DISC_SKINS.footballers.paint(cB, q, WB/2, WB/2, RB, { players:[q] });
    return cB.getImageData(0,0,WB,WB).data;
  };
  const bodyRayBig = (d) => {
    const out = new Array(RAYS).fill(0);
    for (let i=0;i<d.length;i+=4){
      if (!bodyPick(d,i)) continue;
      const k=(i/4)|0, ax=(k%WB)-WB/2, ay=((k/WB)|0)-WB/2;
      const a = Math.atan2(ay, ax), rad = Math.hypot(ax, ay);
      const s2 = ((a + Math.PI*2) % (Math.PI*2)) / (Math.PI*2) * RAYS | 0;
      if (rad > out[s2]) out[s2] = rad;
    }
    return out.map(v => +(v/RB).toFixed(3));
  };
  const rays = [];
  for (let k=0;k<PH;k++) rays.push(bodyRayBig(paintBig({ vx:3, gait: k*CYCLE/PH })));
  o.bodyThinnest = Math.min(...rays.map(v => Math.min(...v)));
  o.bodyFarthest = Math.max(...rays.map(v => Math.max(...v)));
  o.bodyFillsTheRing   = o.bodyThinnest >= 0.90;
  o.bodyInsideTheRing  = o.bodyFarthest <= 1.0;
  const shirtPx = scan(frames[0], (d,i)=>near(d,i,hex(homeCol),48));
  o.shirtPixels = shirtPx.n;
  o.figureReachMin = Math.min(...figR);  o.figureReachMax = Math.max(...figR);
  o.shirtReachMax  = Math.max(...shirtR);
  o.shirtInsideTheRing  = shirtPx.n > 400 && o.shirtReachMax <= 1.0;
  o.limbsCrossTheRing   = o.figureReachMin >= 1.15;      // at the WORST phase, not the best
  o.limbsAreLimbs       = o.figureReachMax <= 1.60;      // ...and not a bigger body
  o.limbsClearTheShirt  = o.figureReachMin >= o.shirtReachMax * 1.25;

  // ---- 2b. the swing is centred on the BODY, and the limbs are long enough to read
  // ⚠️ **THE ARC'S MIDPOINT IS THE CLAIM, NOT ITS ENDS.** A limb swung about its own joint
  // has an arc centred on that joint, and the hip sits behind the middle of the body while
  // the shoulder sits in front of it — so the legs trailed and the arms led, which is what
  // *"the legs are not centered on the body, same to the arms"* was. Measured on the build
  // before this one the foot's midpoint was **-0.26** and the hand's **+0.23** against a
  // body centred on +0.01; both read within 0.02 of it now.
  // ⚠️ **THE BODY'S OWN CENTRE IS MEASURED IN THE SAME RUN, never written down as a
  // number.** It is the midpoint of the shirt-and-shorts extent along the facing axis, so
  // moving either ellipse moves the reference with it and this check cannot go stale.
  let bLo = 9, bHi = -9;
  for (let i=0;i<frames[0].length;i+=4){
    if (!bodyPick(frames[0],i)) continue;
    const k=(i/4)|0, ax=((k%W)-CX)/R;
    if (ax < bLo) bLo = ax; if (ax > bHi) bHi = ax;
  }
  o.bodyAlongCentre = +((bLo+bHi)/2).toFixed(3);
  o.footMid = +((o.footFront + o.footBack)/2).toFixed(3);
  o.handMid = +((o.handFront + o.handBack)/2).toFixed(3);
  o.legsCentredOnTheBody = Math.abs(o.footMid - o.bodyAlongCentre) <= 0.10;
  o.armsCentredOnTheBody = Math.abs(o.handMid - o.bodyAlongCentre) <= 0.10;
  // ⚠️ **AND "LONGER" IS MEASURED AGAINST THE BODY, in the same run** — a pixel constant
  // would be vacuous at one radius and impossible at another, and deriving the length from
  // `FOOTBALLER` compares the table with itself. A limb is measured from its own joint to
  // the FARTHEST ink at its tip, and at the ends of the stride both have to be longer than
  // the body's own reach.
  // ⚠️ **THE TIP, NEVER THE CENTROID, and the centroid was written first.** The hand's band
  // catches the outer stretch of the arm as well as the hand itself, so its centroid sits
  // well inboard of the thing being measured — it read **0.822r** on a build whose arm is
  // really 1.15r, which is under the bar and would have reported a good build as stubby.
  const tipFrom = (d, pick, jx, jy) => {
    let m = 0, n = 0;
    for (let i=0;i<d.length;i+=4){
      const k=(i/4)|0, ax=(k%W)-CX, ay=((k/W)|0)-CY;
      if (!pick(d,i,ax,ay,Math.hypot(ax,ay))) continue;
      m = Math.max(m, Math.hypot(ax/R - jx, ay/R - jy)); n++;
    }
    return { len:+m.toFixed(3), n };
  };
  // ⚠️ **A FRAME QUALIFIES AGAINST THE BOOT'S OWN FULLEST COUNT, never an absolute.** The
  // gate was `n > 300`, and on the planted stride the plate's boot at the PLANT reads 269
  // against 319 at the lift — so the one phase where the leg is longest was the one phase
  // thrown out, and the leg measured 0.987r against a body of 0.98: a pass by seven
  // thousandths, on the wrong frame. Six tenths of the fullest boot keeps both ends.
  const FB = M.FOOTBALLER, legLen = [], armLen = [];
  const bootFull = Math.max(...bootPix);
  for (const f of frames){
    const bt = tipFrom(f, boot, FB.hip[0], FB.hip[1]);
    const hd = tipFrom(f, hand, FB.sh[0],  FB.sh[1]);
    if (bt.n > bootFull * 0.6) legLen.push(bt.len);
    if (hd.n > 200) armLen.push(hd.len);
  }
  o.legLongest = Math.max(...legLen);
  o.armLongest = Math.max(...armLen);
  o.limbsOutreachTheBody = o.legLongest > o.shirtReachMax && o.armLongest > o.shirtReachMax;

  // ---- 3. the swing goes UNDER the torso, which is the shirt occluding it ------
  // The two opposite peaks of the phase (`footPhase` at +1 and -1, found above): the limbs
  // are at opposite ends of their travel and the shirt, the head and the shorts are the
  // same picture in both.
  const a0 = frames[kHi], a1 = frames[kLo];
  o.framesDifferOutside = moved(a0, a1, rad => rad > R*0.80);
  o.limbsAnimate        = o.framesDifferOutside > 300;
  // ⚠️ **THE BODY YAWS WITH THE STRIDE, SO ONE SHOULDER LEADS** (FOOTBALLER.twist) — asked
  // for as "shoulders should go front and back, rotating the player a little bit to show
  // which shoulder is ahead". This REPLACES `torsoHoldsStill` ("the head and shirt must hold
  // still while only the limbs swing"), which is now false by design. What is measured is a
  // YAW and not a drift: the head's skin crescent — the face, since the hair covers the back —
  // swings ACROSS by equal and opposite amounts at the two peaks, sits centred at mid-stride
  // and at rest, and turns AWAY from the side whose arm is forward (a body turned so the +1
  // shoulder leads has its nose toward the -1 side). "A little bit" is a ceiling as well as a
  // floor: the first partial build moved a shoulder 0.044r, half a pixel on a real body, and
  // a full-figure yaw past 0.15r of crescent swing is a wobble rather than a stride.
  // ⚠️ Paired with the SHIRT not swinging — a plain near-round shirt turned a few degrees is
  // the same picture, so its centroid and its pixel count must hold between the peaks: a
  // yaw is a rotation about the body, not the torso moving about.
  const face = (d) => { let sx = 0, sy = 0, n = 0;
    for (let i=0;i<d.length;i+=4){
      const k=(i/4)|0, ax=(k%W)-CX, ay=((k/W)|0)-CY;
      if (Math.hypot(ax, ay) > R*0.55 || !near(d,i,skinCol,40)) continue;
      sx += ax; sy += ay; n++;
    }
    return n ? { along:+(sx/n/R).toFixed(3), across:+(sy/n/R).toFixed(3), n } : null; };
  const faceHi = face(a0), faceLo = face(a1);
  const mids = [frames[Math.round((kHi + kLo)/2) % PH], paint({ vx:0, gait:0 })].map(face);
  o.faceAcross = { hi: faceHi.across, lo: faceLo.across, mid: mids[0].across, rest: mids[1].across };
  o.faceAcrossSwing = +Math.abs(faceHi.across - faceLo.across).toFixed(3);
  // ⚠️ "Centred at rest" is NOT a bar on the face's across position — a standing player
  // left with the yaw on turns `stand × twist` = 0.066 rad, which moves the face 0.016r and
  // sailed under a 0.02 bar. At rest the picture must be IDENTICAL to the same body with
  // the twist stood down, in pixels, in the same run.
  const restOn = paint({ vx:0, gait:0 });
  const twistWas = M.FOOTBALLER.twist; M.FOOTBALLER.twist = 0;
  const restOff = paint({ vx:0, gait:0 });
  M.FOOTBALLER.twist = twistWas;
  o.restYawPixels = moved(restOn, restOff, () => true);
  o.bodyYawsWithTheStride = faceHi.across * faceLo.across < 0
                          && Math.abs(faceHi.across) > 0.03 && Math.abs(faceLo.across) > 0.03
                          && o.faceAcrossSwing <= 0.30
                          && Math.abs(mids[0].across) < 0.02 && o.restYawPixels === 0;
  // ...and away from the leading shoulder: the +1 hand's along at each peak against the face.
  o.noseTurnsFromTheLeadingShoulder = Math.sign(faceHi.across) === -Math.sign(handAlong[kHi])
                                    && Math.sign(faceLo.across) === -Math.sign(handAlong[kLo]);
  const shirtHi = scan(a0, (d,i)=>near(d,i,hex(homeCol),48)), shirtLo = scan(a1, (d,i)=>near(d,i,hex(homeCol),48));
  o.shirtBetweenPeaks = { nHi: shirtHi.n, nLo: shirtLo.n, alongHi: shirtHi.along, alongLo: shirtLo.along };
  o.shirtHoldsItsPlace = Math.abs(shirtHi.n - shirtLo.n) < shirtHi.n * 0.03
                       && Math.abs(shirtHi.along - shirtLo.along) < 0.03;

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
  const away = paint({ team:1, vx:3, gait: PEAK });
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
  // ⚠️ **THE SAMPLE POINT IS DERIVED FROM THE TWO SHAPES, never a literal.** It was a flat
  // `-0.80r` — "beyond the shirt, where only the shorts are drawn" — and that stopped being
  // true the moment the body was grown to fill the guide ring: the shirt's own back edge
  // went past it and the probe read the KIT colour, reporting a perfectly good white short
  // as blue. Halfway between the shirt's back edge and the shorts' is the one spelling that
  // cannot go stale, and it fails loudly if the butt is ever covered completely.
  const Fb = M.FOOTBALLER;
  const buttAt = ((Fb.torsoAt - Fb.torsoA) + (Fb.shortsAt - Fb.shortsA)) / 2;
  o.buttBand = +(((Fb.torsoAt - Fb.torsoA) - (Fb.shortsAt - Fb.shortsA))).toFixed(3);
  o.buttShows = o.buttBand > 0.04;
  const trimAt = (d) => {
    const x = Math.round(CX + buttAt*R), y = CY, i = (y*W + x)*4;
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

  // ---- 7b. ...and it TURNS rather than flipping --------------------------------
  // Asked for: a player reversing left to right should be SEEN to turn, quickly, without
  // touching the game. Three separate claims, because each is true of a build that breaks
  // the other two: it is not instant, it is not slow, and it goes the SHORT way round.
  const turnFrames = (fromX, fromY, toX, toY) => {
    const body = { team:0, faceX:fromX, faceY:fromY, vx:3 };
    M.turnFaceToward(body, 1);                    // adopt the starting angle outright
    const a0 = body._drawAng;
    body.faceX = toX; body.faceY = toY;
    const want = Math.atan2(toY, toX);
    const path = [a0];
    let n = 0;
    for (; n < 60; n++){
      M.turnFaceToward(body, 1);
      path.push(body._drawAng);
      let d = want - body._drawAng;
      while (d > Math.PI) d -= 2*Math.PI;
      while (d < -Math.PI) d += 2*Math.PI;
      if (Math.abs(d) < 1e-9) break;
    }
    return { n: n + 1, path };
  };
  const rev = turnFrames(1, 0, -1, 0);            // the literal left-to-right reversal
  o.turnFramesForAHalfTurn = rev.n;
  o.turnIsNotInstant = rev.n >= 3;
  o.turnIsQuick = rev.n <= 12;                    // 12 frames is a fifth of a second at 60Hz
  // ⚠️ THE SHORT WAY ROUND: every step of a reversal must move the same way, so the path is
  // monotonic once unwrapped. A build that turns the long way still ARRIVES, in the same
  // number of frames, so arrival time cannot see it.
  let mono = true;
  for (let i = 2; i < rev.path.length; i++){
    const d1 = rev.path[i] - rev.path[i-1], d0 = rev.path[1] - rev.path[0];
    if (d0 !== 0 && d1 !== 0 && Math.sign(d1) !== Math.sign(d0)) mono = false;
  }
  o.turnTakesTheShortWay = mono;
  // ...and the PICTURE really differs part way round, or the ease is a number nobody sees.
  // ⚠️ **THE THREE PICTURES MUST DIFFER ONLY BY THE TURN, and the first version compared a
  // mid-turn body at `gait:7` against two ends at `gait:0`** — so they differed by the
  // STRIDE and the check passed with the turn made instant. A sabotage that pointed
  // `discFaceTurn` straight at `discFace` was MISSED because of exactly that.
  const GA = 7;
  const atAngle = (fx, fy) => {
    const q = { team:0, faceX:fx, faceY:fy, vx:3, gait:GA };
    M.turnFaceToward(q, 1);                      // settled: _drawAng IS the facing
    return paint(q).join(',');
  };
  const mid = { team:0, faceX:1, faceY:0, vx:3, gait:GA };
  M.turnFaceToward(mid, 1);
  mid.faceX = -1; M.turnFaceToward(mid, 1); M.turnFaceToward(mid, 1);
  const midSig = paint(mid).join(',');
  o.turnIsVisible = midSig !== atAngle(1,0) && midSig !== atAngle(-1,0);

  // ⚠️ **A REVERSAL THROUGH 0/pi CANNOT SEE THE WRAP AT ALL, and a sabotage proved it.**
  // Dropping the +-pi normalisation was MISSED because the case above runs 0 -> pi exactly,
  // where the wrapped and unwrapped answers are identical. What separates them is a turn
  // whose short path CROSSES the boundary: +3.0 rad to -3.0 rad is 0.28 rad the near way and
  // 6.0 the long way, so it is one frame against eleven.
  const wrap = turnFrames(Math.cos(3.0), Math.sin(3.0), Math.cos(-3.0), Math.sin(-3.0));
  o.turnFramesAcrossTheWrap = wrap.n;
  o.turnWrapsTheShortWay = wrap.n <= 2;

  // ⚠️ **RENDER ONLY, measured as WHAT IT WRITES.** The eased angle may touch nothing the
  // sim reads — so the whole body object is diffed across a turn and `_drawAng` must be the
  // only key that moved. That is `tests/botai.mjs`' idiom: a hash of the world would pass on
  // a build that writes a field nothing happens to read yet.
  const probe = { team:0, x:1, y:2, vx:3, vy:0, faceX:1, faceY:0, inX:0, inY:0, kick:false,
                  gait:5, chargeT:0, r:15 };
  // ⚠️ The snapshot is taken AFTER the reversal is asked for, or the probe's own
  // `faceX = -1` shows up as a write and the check reports a good build as dirty.
  M.turnFaceToward(probe, 1);
  probe.faceX = -1;
  const was = JSON.stringify(probe);
  M.turnFaceToward(probe, 1);
  const wasObj = JSON.parse(was);
  const turnTouched = Object.keys(probe).filter(k =>
    JSON.stringify(probe[k]) !== JSON.stringify(wasObj[k]));
  o.turnWritesOnlyDrawAng = turnTouched.length === 1 && turnTouched[0] === '_drawAng';
  o.turnWrote = turnTouched;

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

  // ---- 8b. the limbs are KENNEY'S plates, and the pack is still optional --------
  // ⚠️ **THE DISCRIMINATOR IS THE LIMB'S SECOND TONE, not that a file loaded.** The plate
  // draws every band's outline as that band at `KLIMB.shade`, so a sprite limb is skin AND
  // skin x 0.72 while the fallback stroke is one flat colour — `M.klimbSprite(...) != null`
  // says a PNG decoded, and this says the pixels on the pitch came out of it.
  // ⚠️ **AND THE FALLBACK IS CHECKED IN THE SAME RUN, because `assets/` is optional.** A
  // downloaded single-file copy has no pack, `spriteImg` answers null for ever, and the
  // skin has to field two readable sides anyway — which is what `assets/README.md`
  // promises and what `sketch` is the other reader of. Pointing `KLIMB.dir` at nothing is
  // how that path is reached at all, and it only works because the DIRECTORY is in the
  // bake key: without it the cached sprites survive the change and the probe reports the
  // pack as present, which is the exact trap `tests/dyntheme.mjs` records for `SCRIB.dir`.
  // ⚠️ **THE ARM AND THE LEG ARE MEASURED IN SEPARATE REGIONS, and one probe over "the limb
  // band" IS BLIND TO HALF OF IT — a sabotage proved it.** Both limbs are on the `ay > 0`
  // side, so a band picked by how far ACROSS it is contains whichever one reaches further
  // and nothing else: with the LEG's sprite disabled and the arm's left alone, a single
  // `ay > 0.95r` probe reported the limbs as Kenney's, which they half were. At the swing
  // PEAK the arms counter-swing the legs, so the foot is a whole radius FORWARD and the
  // hand more than half a radius behind — the along axis is what separates them, and it is
  // the phase this block is taken at for exactly that reason.
  // ⚠️ `ay > 0.55r` clears the head, which is drawn in the same skin as the limbs and would
  // otherwise be counted as one. `PEAK` is found on the game's own wave, above.
  const inLeg = (ax, ay) => ay > R*0.55 && ax >  R*0.20;
  const inArm = (ax, ay) => ay > R*0.55 && ax < -R*0.10;
  const inkDark = ink.map(v => Math.round(v * ((M.KLIMB && M.KLIMB.shade) || 1)));
  const limbPixel = (d,i) => near(d,i,skinCol,40) || near(d,i,skinDark,40)
                          || near(d,i,ink,40)     || near(d,i,inkDark,40);
  // ⚠️ **THE SHAFT AND THE BOOT ARE COUNTED SEPARATELY, and pooling them is blind to half a
  // leg** — a sabotage that deleted the fallback's leg STROKE and left its boot circle put
  // ~380 ink pixels in the region and sailed past a pooled bar of 150. A leg is a shaft AND
  // a boot; an arm is a shaft and no boot.
  const region = (d, want) => {
    let skin = 0, boot = 0, dark = 0;
    for (let i=0;i<d.length;i+=4){
      const k=(i/4)|0, ax=(k%W)-CX, ay=((k/W)|0)-CY;
      if (!want(ax, ay)) continue;
      if (near(d,i,skinCol,40) || near(d,i,skinDark,40)){ skin++; if (near(d,i,skinDark,40)) dark++; }
      else if (near(d,i,ink,40) || near(d,i,inkDark,40)) boot++;
    }
    return { skin, boot, dark };
  };
  const differs = (a2, b2, want) => {
    let n = 0;
    for (let i=0;i<a2.length;i+=4){
      const k=(i/4)|0, ax=(k%W)-CX, ay=((k/W)|0)-CY;
      if (!want(ax, ay)) continue;
      if (Math.abs(a2[i]-b2[i]) + Math.abs(a2[i+1]-b2[i+1]) + Math.abs(a2[i+2]-b2[i+2]) > 24) n++;
    }
    return n;
  };
  const withSprite = paint({ vx:3, gait: PEAK });
  const dirWas = M.KLIMB.dir;
  M.KLIMB.dir = 'assets/__no_such_pack__/';
  const bare = [];
  for (let k=0;k<PH;k++) bare.push(paint({ vx:3, gait: k*CYCLE/PH }));
  const bareAtPeak = paint({ vx:3, gait: PEAK });
  M.KLIMB.dir = dirWas;

  // ⚠️ **THE CONTROL IS THE FALLBACK DRAWING, RENDERED IN THE SAME RUN AT THE SAME PHASE.**
  // An absolute count of anything says nothing here: the shirt, the shorts and the head are
  // in both regions and identical either way, so what is left when the two frames are
  // subtracted is the limb and only the limb. Pointing `KLIMB.dir` at nothing is how the
  // pack-less path is reached at all, and it works ONLY because the directory is in the bake
  // key — without it the cached sprites survive the change and the probe reports the pack as
  // present, the exact trap `tests/dyntheme.mjs` records for `SCRIB.dir`.
  o.legSpriteDiff = differs(withSprite, bareAtPeak, inLeg);
  o.armSpriteDiff = differs(withSprite, bareAtPeak, inArm);
  o.limbOutlinePixels = region(withSprite, inArm).dark + region(withSprite, inLeg).dark;
  o.limbsAreTheSprite = o.limbSpriteLoaded && o.legSpriteDiff > 150 && o.armSpriteDiff > 150
                        && o.limbOutlinePixels > 20;

  // ...and with no pack BOTH limbs still have to be drawn. ⚠️ A figure-reach check alone is
  // blind to one of them: deleting the leg's stroke left the arm and the boot circle reaching
  // 1.58r and every reach assertion green.
  const bareLeg = region(bareAtPeak, inLeg), bareArm = region(bareAtPeak, inArm);
  o.bareLegSkin = bareLeg.skin;  o.bareLegBoot = bareLeg.boot;  o.bareArmSkin = bareArm.skin;
  o.bareOutlinePixels = bareLeg.dark + bareArm.dark;
  const bareReach = bare.map(d => scan(d, anyInk).reach);
  o.bareFigureReachMin = Math.min(...bareReach);
  o.bareFigureReachMax = Math.max(...bareReach);
  o.bareShirtReachMax  = Math.max(...bare.map(d => scan(d, (d2,i)=>near(d2,i,hex(homeCol),48)).reach));
  // ⚠️ **A TENTH, NOT ZERO — and zero is what got written first.** A stroke carries no
  // outline, but its own antialiased rim against the boot circle lands within tolerance of
  // `skin x 0.72` on a handful of pixels: the fallback measures **9** against the plate's
  // **257**, so the bar is derived from the sprite arm of the same run rather than set at an
  // absolute that is either vacuous or impossible.
  o.fallbackIsTheDrawing  = o.bareOutlinePixels * 10 < o.limbOutlinePixels;
  o.fallbackStillHasLimbs = bareLeg.skin > 100 && bareLeg.boot > 100 && bareArm.skin > 150
                            && o.bareFigureReachMin >= 1.15 && o.bareFigureReachMax <= 1.60
                            && o.bareShirtReachMax <= 1.0;

  // ---- 8b. TWO LIMB STYLES, SHIPPED AS TWO SKINS -------------------------------
  // Asked for: keep the Kenney limb sprites AND bring back the drawn strokes they replaced,
  // both pickable. The drawn skin is the FALLBACK path made choosable rather than a second
  // drawing, so the discriminator is the one two paragraphs up: the pack's plates carry an
  // OUTLINE tone (`skin x KLIMB.shade`) and a stroke does not — measured at 257 against 9.
  // ⚠️ Rendered here with the pack PRESENT for both, which is the whole claim: on a machine
  // that has the artwork the two skins must still draw different arms. Pointing `KLIMB.dir`
  // at nothing proves only that the fallback exists, which the block above already does.
  // ⚠️ Paired with the drawn skin still having limbs, or "no outline" is equally true of a
  // skin that draws no arms at all.
  const skinPaint = (skin, opt) => {
    c.fillStyle = '#7f7f7f'; c.fillRect(0,0,W,W);
    const q = body(opt);
    skin.paint(c, q, CX, CY, R, { players:[q] });
    return c.getImageData(0,0,W,W).data;
  };
  const inkedAtPeak = skinPaint(M.DISC_SKINS.footballersink, { vx:3, gait: PEAK });
  const inkLeg = region(inkedAtPeak, inLeg), inkArm = region(inkedAtPeak, inArm);
  o.bothSkinsExist  = !!M.DISC_SKINS.footballers && !!M.DISC_SKINS.footballersink;
  o.inkedOutline    = inkLeg.dark + inkArm.dark;
  o.inkedLimbInk    = inkLeg.skin + inkLeg.boot + inkArm.skin;
  o.inkedIsDrawn    = o.limbSpriteLoaded && o.inkedOutline * 10 < o.limbOutlinePixels;
  o.inkedHasLimbs   = inkLeg.skin > 100 && inkLeg.boot > 100 && inkArm.skin > 150;
  o.twoStylesDiffer = differs(withSprite, inkedAtPeak, inLeg) > 150
                   && differs(withSprite, inkedAtPeak, inArm) > 150;
  o.inkedThemeIsABundle = !!M.bundleSlots('kickink');
  o.inkedThemeSkin  = (M.THEME_BUNDLES.kickink || {}).discs;
  o.inkedThemeNamed = (M.THEMES.kickink || {}).name;

  // ---- 8c. THE INKED LIMBS ARE THICKER, and the sprite skin's are not -----------------
  // Asked for as "make the inked limbs thicker so the two themes look more different".
  // Measured before the change at this radius: the drawn arm was 19px across against the
  // plate's 15 — the two styles differed by tone and hardly by weight.
  // ⚠️ **THE CONTROL IS THE PACK-LESS FALLBACK, DRAWN IN THE SAME RUN AT THE SAME PHASE.**
  // That is the stroke-and-circle drawing at the SHARED widths — the sprite skin standing in
  // for its plates — so "the inked skin is thicker" is a difference between two drawings of
  // one figure, never a pixel constant that is vacuous at one radius and impossible at another.
  // ⚠️ **THE ARM IS MEASURED ACROSS, THE LEG BY ITS BOOT.** A perpendicular walked through the
  // arm three quarters of the way to the hand is clear of the shirt on both skins (the shirt
  // reaches 0.83r across there against a hand at 1.20..1.30); the same walk through the leg
  // runs into the shirt on the inboard side and into the boot on the outboard, so the leg's
  // width is read off the boot instead — `bootR` is `legW / 2` on both drawings, so the
  // boot's AREA is the stroke's width squared. Both read against the fallback, which rules
  // out the hand having moved: the walk is taken on each drawing's own arm.
  // ⚠️ **AND THE INKED FIGURE IS HELD TO THE SAME THREE REACH RULES AS THE SPRITE'S.** A
  // thicker stroke's round cap reaches half the extra width further, so widening alone put
  // the figure at 1.641..1.707r — past the 1.60 ceiling that stops "legs can go out" becoming
  // a body drawn bigger than its collider. The inked swing is pulled in to pay for it, and
  // this is what says the bill was paid: at every phase, not at one lucky pose.
  const across = (d, A, B, t, pick) => {
    const mx = A[0] + (B[0]-A[0])*t, my = A[1] + (B[1]-A[1])*t;
    const len = Math.hypot(B[0]-A[0], B[1]-A[1]), nx = -(B[1]-A[1])/len, ny = (B[0]-A[0])/len;
    let n = 0;
    for (let s = -R; s <= R; s += 0.5){
      const x = Math.round(CX + mx*R + nx*s), y = Math.round(CY + my*R + ny*s);
      if (pick(d, (y*W + x)*4)) n++;
    }
    return +(n*0.5).toFixed(1);
  };
  const limbSkin = (d,i) => near(d,i,skinCol,40) || near(d,i,skinDark,40);
  const F = M.FOOTBALLER, FI = F.inked || F;
  const armOf = (G) => [[F.sh[0], F.sh[1]], [F.swingAt - F.armSwing, G.hand]];   // at PEAK, sgn +1
  o.bareArmPx  = across(bareAtPeak,  ...armOf(F),  0.75, limbSkin);
  o.inkedArmPx = across(inkedAtPeak, ...armOf(FI), 0.75, limbSkin);
  o.spriteArmPx = across(withSprite, ...armOf(F),  0.75, limbSkin);
  o.bareBootPx  = bareLeg.boot;  o.inkedBootPx = inkLeg.boot;
  const inkedFrames = []; for (let k=0;k<PH;k++) inkedFrames.push(skinPaint(M.DISC_SKINS.footballersink, { vx:3, gait: k*CYCLE/PH }));
  const inkedReach = inkedFrames.map(d => scan(d, anyInk).reach);
  o.inkedReachMin = Math.min(...inkedReach);  o.inkedReachMax = Math.max(...inkedReach);
  o.inkedShirtMax = Math.max(...inkedFrames.map(d => scan(d, (d2,i)=>near(d2,i,hex(homeCol),48)).reach));
  o.inkedBootByPhase = inkedFrames.map(d => scan(d, boot).n);
  o.inkedArmsThicker  = o.inkedArmPx >= o.bareArmPx * 1.3;
  o.inkedLegsThicker  = o.inkedBootPx >= o.bareBootPx * 1.6;
  // ⚠️ The plate draws NARROWER than the stroke it stands in for (15 against 19 at r 60: its
  // outline rows antialias away), so "the sprite skin is untouched" is the plate still under
  // the fallback's width. Handing the sprite skin the inked widths reads 22 and fails it; a
  // tolerance band round the fallback was tried first and let that sabotage through.
  o.spriteUntouched   = o.spriteArmPx <= o.bareArmPx;
  o.inkedFigureInBounds = o.inkedReachMin >= 1.15 && o.inkedReachMax <= 1.60 && o.inkedShirtMax <= 1.0;


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

  // ---- 10. THE FEET ARE PLANTED, AND THEY STEP ON THE DISTANCE -------------------
  // Asked for from another game's walk: the legs follow the direction, but they step on a
  // cadence set by the SPEED and not by the stick — slam the joystick about and the body
  // turns without the feet stepping all over — and each step starts from where the last one
  // ended. Everything here drives the REAL body through `step` and `advanceFeet`, the two
  // calls `loop()` makes, with the velocity written straight onto the body so the path is
  // exactly the one asked for; a probe that walks `stepFeet` on a synthetic object would prove
  // only that a helper exists.
  // ⚠️ **A PLANT IS THE FOOT'S WORLD POSITION NOT MOVING AT ALL** while the body does — the
  // sine it replaces rode the body at 1:1, so this is the one number that separates the two
  // models, and it is zero rather than small.
  // ⚠️ **A LANDING IS THE FOOT STOPPING AFTER A SWING**, read as a still frame following one
  // in which the foot outran the body by half again: a swing peaks at about three times the
  // body's speed, and the leash (`FOOTBALLER.reach`) never drags a planted foot faster than
  // the body is leaving it. Counting bare still stretches reads the leash's drags as extra
  // plants on a zig-zag and reported 11 against 7 on a build whose cadence was identical.
  // ⚠️ **THE CADENCE CLAIM IS THE GAIT AT WHICH THE LANDINGS FALL**, straight run against a
  // right angle every 15 steps, over the same distance: identical lists, not merely equal
  // counts. The reversal run (a slam every 12 steps) is held to the count, because a
  // landing there can be followed at once by a leash drag and the still frame moves.
  const feetRun = (dirAt, steps, speed) => {
    M.applyBundle('kickabout'); M.sel.mode='1v1'; M.sel.controllers='off'; M.setMatchSeed(11); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    const me = w.players[0];
    const park = () => { for (const q of w.players) if (q !== me){ q.x = 9e3; q.y = 9e3; q.vx = q.vy = 0; }
                         w.ball.x = 9e3; w.ball.y = 9e3; w.ball.vx = w.ball.vy = 0; };
    // ⚠️ Down the LONG axis, from deep in one half: 240 steps at 2 a step is 434 units, and a
    // run across the pitch met the touchline clamp at x = 240 with the body held at the wall
    // and its speed reading 0 — the feet settled into the stance and the last landing went
    // missing from the straight run alone, which read as the zig-zag stepping MORE.
    me.x = 0; me.y = -350; me.vx = 0; me.vy = 0; me.gait = 0; me._feet = null; me._px = me.x; me._py = me.y;
    M.pads.p1.dx = 0; M.pads.p1.dy = 0; M.pads.p1.kick = false;
    const rec = [];
    for (let i = 0; i < steps; i++){
      const dir = dirAt(i); me.vx = dir[0]*speed; me.vy = dir[1]*speed;
      park(); M.step(w); M.advanceFeet(w);
      const f = me._feet;
      rec.push({ x: me.x, y: me.y, g: me.gait, sp: Math.hypot(me.vx, me.vy),
                 f0: [f.x[0], f.y[0]], f1: [f.x[1], f.y[1]], up: [!!(f.up && f.up[0]), !!(f.up && f.up[1])] });
    }
    return { rec, w, me };
  };
  const feetRead = (rec, r) => {
    const out = { plants:[0,0], landAt:[[],[]], plantLen:[[],[]], moveMax:0, swingPeak:0, farMax:0, bodyStill:0, slides:0, lifts:0 };
    for (const s of rec) if (s.sp < 0.5) out.bodyStill++;
    for (const s of rec) for (const k of [0,1]) if (s.up[k]) out.lifts++;
    const P = M.gaitPeriod();
    for (const k of [0,1]){
      let planted = false, start = null, fast = 0;
      for (let i = 1; i < rec.length; i++){
        const a = rec[i-1]['f'+k], c = rec[i]['f'+k];
        const mv = Math.hypot(c[0]-a[0], c[1]-a[1]);
        out.moveMax = Math.max(out.moveMax, mv);
        // ⚠️ A SLIDE is a foot that moved while it was DOWN — in its ground phase (f1 is the
        // foot with offset 0, f0 the one half a cycle on, as in `stepFeet`) and not lifted on
        // either side of the frame. The build before the lift dragged the trailing foot along
        // the ground through every reversal: 36-43 such frames a foot over this run.
        const u = ((rec[i].g / P + (k ? 0 : 0.5)) % 1 + 1) % 1;
        if (u < 0.5 && mv > 1e-9 && !rec[i].up[k] && !rec[i-1].up[k]) out.slides++;
        // ⚠️ A plant is a run of EXACTLY still frames (`< 1e-9`), so "the foot held" needs no
        // drift reading of its own: a foot that crept would simply never be still, and the
        // sine it replaces was never still. A tolerance here would let the first slow frame
        // of a swing read as creep — it did, at 0.75 units, on a build whose plants are exact.
        const still = mv < 1e-9;
        if (!still) fast = Math.max(fast, mv);
        if (still && !planted){
          planted = true; start = i;
          if (fast > rec[i].sp * 1.5){ out.plants[k]++; out.landAt[k].push(+rec[i].g.toFixed(2)); out.swingPeak = Math.max(out.swingPeak, fast); }
          fast = 0;
        }
        if (!still && planted){ planted = false; out.plantLen[k].push(+(rec[i].g - rec[start].g).toFixed(1)); }
      }
    }
    for (const s of rec) for (const k of [0,1])
      out.farMax = Math.max(out.farMax, Math.hypot(s['f'+k][0]-s.x, s['f'+k][1]-s.y) / r);
    out.gait = +rec[rec.length-1].g.toFixed(1);
    return out;
  };
  const SPD = 2.0, STEPS = 240;
  const straight = feetRun(() => [0,1], STEPS, SPD);
  const bodyR = straight.me.r;
  const st = feetRead(straight.rec, bodyR);
  const zz = feetRead(feetRun((i) => (((i/15)|0) % 2) ? [1,0] : [0,1], STEPS, SPD).rec, bodyR);
  const sl = feetRead(feetRun((i) => (((i/12)|0) % 2) ? [0,-1] : [0,1], STEPS, SPD).rec, bodyR);
  // ...and the body never stood still in any of them, or a run that met a wall reads as a
  // foot that settled rather than stepped.
  o.feetBodyStill = [st.bodyStill, zz.bodyStill, sl.bodyStill];
  o.feetStraight = { plants: st.plants, landAt: st.landAt, plantLen: st.plantLen, moveMax: +st.moveMax.toFixed(2), swingPeak: +st.swingPeak.toFixed(2), farMax: +st.farMax.toFixed(3), gait: st.gait };
  o.feetZig   = { plants: zz.plants, landAt: zz.landAt, moveMax: +zz.moveMax.toFixed(2), farMax: +zz.farMax.toFixed(3), gait: zz.gait };
  o.feetSlam  = { plants: sl.plants, landAt: sl.landAt, moveMax: +sl.moveMax.toFixed(2), farMax: +sl.farMax.toFixed(3), gait: sl.gait };
  // ⚠️ **A FOOT STRETCHED PAST THE LEASH LIFTS AND STEPS IN; IT IS NOT DRAGGED.** Reported as
  // the leg dragging too much on a left-to-right switch, and measured as the leash doing it:
  // on the reversal run a grounded foot SLID on 36-43 frames a foot (79 in all), at the body's
  // own pace. It reads 0 now. Paired with the lift actually happening on that run — "no slide"
  // is equally true of a leash that never binds, and that build fails the 1.60r ceiling.
  o.feetSlides = [st.slides, zz.slides, sl.slides]; o.feetLifts = [st.lifts, zz.lifts, sl.lifts];
  o.noSlideOnAReversal = sl.slides <= 2 && sl.lifts >= 10;
  // ⚠️ **AND THE LIFTED FOOT MOVES AT A PACE, NOT A SHARE.** Closing 40% of the way from 2.2r
  // behind is a 13-unit hop in one frame — and the two hop checks below PASSED it, because they
  // are measured against the straight run's own swing peak and the hop lifted that with it
  // (5.6 → 14). So the peak itself is held to the body's speed: 3.5 body-steps a frame, where
  // the honest swing reads 2.6 (5.23 at a speed of 2) and the hop 7.
  // ⚠️ The straight run's plants have to be LONG — the body covers a whole step of travel
  // over a foot that does not move — or "zero drift" is true of a foot that is never down.
  const longPlants = st.plantLen.map(a => a.filter(v => v > 15).length);
  o.plantedFootHoldsStill = st.plants[0] >= 5 && st.plants[1] >= 5
                          && longPlants[0] >= 4 && longPlants[1] >= 4 && st.bodyStill === 0;
  const sameList = (a, b2) => a.length === b2.length && a.every((v, i) => Math.abs(v - b2[i]) < 0.01);
  o.cadenceIsDistanceNotTurns = sameList(st.landAt[0], zz.landAt[0]) && sameList(st.landAt[1], zz.landAt[1])
                              && Math.abs(st.plants[0] - sl.plants[0]) <= 1 && Math.abs(st.plants[1] - sl.plants[1]) <= 1
                              && st.gait === zz.gait && st.gait === sl.gait
                              && zz.bodyStill === 0 && sl.bodyStill === 0;
  // ⚠️ **THE LEASH IS WHAT HOLDS A TURN UNDER THE CEILING**, and a straight run never reaches
  // it: a planted foot is at most hypot(stride, foot) from the centre there.
  o.feetLeashed = Math.max(st.farMax, zz.farMax, sl.farMax) <= M.FOOTBALLER.reach + 0.001
               && zz.farMax >= Math.hypot(M.FOOTBALLER.stride, M.FOOTBALLER.foot) - 0.05;
  // ⚠️ **NOTHING IS EVER SNAPPED INTO PLACE.** A body that stops mid-swing, settles into the
  // stance and starts again at the phase where the foot should be LANDING is where a snap
  // shows: the first build put the foot on its spot in one frame, a 7.4-unit hop against a
  // swing that peaks at 5.4. Measured against the straight run's own swing peak, in the same
  // run, never a constant.
  const stopGo = feetRun((i) => (i < 30 || i > 60) ? [0,1] : [0,0], 120, SPD).rec;
  let restartMove = 0;
  for (let i = 62; i < 80; i++) for (const k of [0,1]){
    const a = stopGo[i-1]['f'+k], c = stopGo[i]['f'+k];
    restartMove = Math.max(restartMove, Math.hypot(c[0]-a[0], c[1]-a[1]));
  }
  o.restartMove = +restartMove.toFixed(2);
  // ⚠️ No margin on the bar: with the capped pursuit in place a landing snap put back moves
  // the foot the REMAINING gap on the frame it lands — 6.0 units at this restart against a
  // swing peak of 5.6 — and a 10% allowance let exactly that sabotage through. Deterministic
  // (a seeded match, the velocity written), so the bar can be the peak itself; the honest
  // build reads 5.0.
  o.noHopOnRestart = restartMove <= st.swingPeak && st.swingPeak > SPD * 1.5;
  // ⚠️ **AND THE REVERSAL RUN IS WHERE A SNAP ACTUALLY SHOWS.** The restart reading above
  // cannot catch the landing snap put back — the snap lifts the straight run's own peak with
  // it (6.84 against 5.56) and the restart hop sits under it (6.27). What a snap cannot hide
  // is a swing ending while the landing spot is swinging round behind a reversal: the foot is
  // put on it in one frame, **16.0 units** against 6.8 with the foot left to stop where it is.
  // Held against the straight run's peak in the same run; the honest build reads 1.22x.
  o.turnMoveMax = +Math.max(zz.moveMax, sl.moveMax).toFixed(2);
  o.noHopOnATurn = o.turnMoveMax <= st.swingPeak * 1.5;
  o.liftIsAStepNotAHop = st.swingPeak <= SPD * 3.5 && o.turnMoveMax <= SPD * 3.5;
  // ⚠️ **THE STATELESS WAVE IS THE PLANTED STRIDE WITHOUT THE WORLD, and nothing above pins
  // its SHAPE** — the phase sweep finds its own peaks, so a sine put back in `footPhase`
  // passed every check in this file. What a planted foot does on the ground is slide back
  // under the body at exactly the body's pace: along + travel is a constant for the whole
  // first half. A sine reads 0.59, 0.95, 0.95 where a plant reads 0.6, 0.2, -0.2.
  const ground = [0.05, 0.15, 0.25, 0.35, 0.45].map(u => +(M.footPhase(u) + 4*u).toFixed(6));
  o.groundHalf = ground;
  o.fallbackGroundHalfIsPlanted = ground.every(v => Math.abs(v - 1) < 1e-6)
                                && Math.abs(M.footPhase(0.75)) < 0.05 && M.footPhase(0.999) > 0.99;
  // ⚠️ At rest both feet SETTLE into the stance — mirror images about the body, each within
  // the leg's reach — rather than being left wherever the last step landed. Read off the
  // mirror, not off FOOTBALLER.stand, which would compare the table with itself.
  const rest = stopGo[60];
  const rmid = [ (rest.f0[0]+rest.f1[0])/2 - rest.x, (rest.f0[1]+rest.f1[1])/2 - rest.y ];
  const rdist = (f) => Math.hypot(f[0]-rest.x, f[1]-rest.y) / bodyR;
  o.restMid = rmid.map(v => +v.toFixed(2)); o.restDist = [ +rdist(rest.f0).toFixed(3), +rdist(rest.f1).toFixed(3) ];
  const restStill = Math.hypot(stopGo[60].f0[0]-stopGo[59].f0[0], stopGo[60].f0[1]-stopGo[59].f0[1]) < 0.05;
  o.feetSettleAtRest = Math.hypot(rmid[0], rmid[1]) < 0.4 && o.restDist.every(v => v > 0.6 && v < 1.0) && restStill;
  // ⚠️ **RENDER ONLY, measured as WHAT IT WRITES** — the `turnWritesOnlyDrawAng` idiom: the
  // whole body is diffed across a step of the feet and `_feet` must be the only key moved.
  {
    const q = { team:0, x:1, y:2, vx:2, vy:0, faceX:1, faceY:0, inX:0, inY:0, kick:false, gait:5, chargeT:0, r:15 };
    M.stepFeet(q, 1); q.x += 2; q.gait += 2;
    const was = JSON.parse(JSON.stringify(q));
    M.stepFeet(q, 1);
    const touched = Object.keys(q).filter(k => JSON.stringify(q[k]) !== JSON.stringify(was[k]));
    o.feetWrote = touched;
    o.feetWriteOnlyFeet = touched.length === 1 && touched[0] === '_feet';
  }
  // ⚠️ **THE WHOLE FIGURE STAYS UNDER THE CEILING ON THE LIVE PATH, THROUGH A REVERSAL** —
  // the suite's phase sweep above draws the stateless wave, and a planted foot is the one
  // thing that can be further from the body than that wave ever puts it. Measured in
  // rendered pixels as a DIFFERENCE against the same frame with the skin stood down (the
  // name plate hangs below the body in the limbs' own dark ink and read 1.9r on its own),
  // keeping only the limb colours, so what is left is the arms and the legs.
  {
    const live = feetRun(() => [1,0], 1, SPD);
    const w = live.w, me = live.me;
    const park = () => { for (const q of w.players) if (q !== me){ q.x = 9e3; q.y = 9e3; q.vx = q.vy = 0; } w.ball.x = 9e3; w.ball.y = 9e3; };
    me.x = 0; me.y = 0; me._feet = null; me.gait = 0; me.faceX = 1; me.faceY = 0; me._drawAng = 0;
    const gctx = document.getElementById('game').getContext('2d');
    const hexc = (h) => [1,3,5].map(k=>parseInt(h.substr(k,2),16));
    const sk = hexc(M.kitPerson(me)[1]), ik = hexc(M.TH.discRim || '#151515'), sh = (M.KLIMB && M.KLIMB.shade) || 1;
    const cols = [sk, sk.map(v=>Math.round(v*sh)), ik, ik.map(v=>Math.round(v*sh))];
    const reachNow = () => {
      const grab = () => {
        M.render();
        const s0 = M.screenPt(M.wx(me.x), M.wy(me.y)), dpr = gctx.getTransform().a, rs = me.r*M.cam.s*dpr;
        const Rb = rs*2.2, Wb = Math.round(2*Rb);
        return { d: gctx.getImageData(Math.round(s0[0]*dpr-Rb), Math.round(s0[1]*dpr-Rb), Wb, Wb).data, Rb, Wb, rs };
      };
      const was = M.sel.look.discs; M.sel.look.discs = 'none'; const ctl = grab(); M.sel.look.discs = was; const on = grab();
      let m = 0;
      for (let i=0;i<on.d.length;i+=4){
        if (!cols.some(c2 => Math.abs(on.d[i]-c2[0])+Math.abs(on.d[i+1]-c2[1])+Math.abs(on.d[i+2]-c2[2]) <= 40)) continue;
        if (Math.abs(on.d[i]-ctl.d[i])+Math.abs(on.d[i+1]-ctl.d[i+1])+Math.abs(on.d[i+2]-ctl.d[i+2]) <= 24) continue;
        const k=i/4, ax=(k%on.Wb)-on.Rb, ay=((k/on.Wb)|0)-on.Rb;
        m = Math.max(m, Math.hypot(ax, ay));
      }
      return +(m/on.rs).toFixed(3);
    };
    const reaches = [];
    for (let i = 0; i < 100; i++){
      me.vx = (i < 40 ? 1 : -1)*SPD; me.vy = 0; park(); M.step(w); M.advanceFeet(w);
      if (i % 2 === 0) reaches.push(reachNow());
    }
    o.liveReachMax = Math.max(...reaches); o.liveReachMin = Math.min(...reaches.slice(5));
    o.liveFigureInBounds = o.liveReachMax <= 1.60 && o.liveReachMin >= 1.15;
  }
  // ⚠️ **A REPLAY'S FEET ARE ITS OWN, NEVER THE LIVE BODY'S.** `drawReplayFrame` spreads the
  // live player over each frame — `_feet` included, as a REFERENCE — so a replay stepping the
  // feet it was handed walks the live player's feet about under a match still being played.
  // The live object must come out of a replay byte-identical, and the replay's own feet must
  // have moved.
  {
    const live = feetRun(() => [1,0], 20, SPD), w = live.w, me = live.me;
    const before = JSON.stringify(me._feet);
    const N = 40, frames = [];
    for (let i = 0; i < N; i++) frames.push({ bx:0, by:0, p: w.players.map(() => ({ x: -100 + i*2.5, y: 40, k:false })) });
    M.repAnimReset(60);
    const seenFeet = [];
    for (let i = 0; i < N - 1; i++){
      M.drawReplayFrame(M.repTween(frames[i], frames[i+1], 0, 60));
      const ft = M.repAnim.ft[0]; if (ft) seenFeet.push(ft.x[0].toFixed(1) + ',' + ft.y[0].toFixed(1));
    }
    o.replayFeetSeen = new Set(seenFeet).size;
    o.replayLeavesLiveFeetAlone = JSON.stringify(me._feet) === before && o.replayFeetSeen >= 4;
  }

  M.applyBundle('grass'); M.sel.mode='1v1'; M.setMatchSeed(null);
  return o;
});

// ---- 11. THE PITCH'S TURN IS PUT BACK ON EVERY WORLD DIRECTION A SKIN DRAWS -----------
// ⚠️ `drawOneDisc` paints inside `uprightAt`, which cancels `cam.rot` — and `auto` turns the
// pitch a quarter on any wide window. A world facing drawn as it stood was therefore a
// quarter turn off the body's own travel on every desktop: measured on a 1280x800 page, a
// footballer driven along world +x moved (0, -13.5) on screen — straight UP — while its head
// sat at (+4.9, -0.6), facing RIGHT. Every direction-drawn skin ran crab-wise. The planted feet
// made it load-bearing (a foot anchored in the world has to stay put ON SCREEN too), so the
// turn is put back by `skinDir` and this measures it where it was wrong: a wide page.
// ⚠️ The head's SKIN crescent is the instrument — the hair covers the back of the head, so the
// skin that shows is the front — and the on-screen travel is the control, taken through
// `screenPt` in the same run; `cam.rot` is asserted non-zero or the whole block is vacuous on
// an upright page.
const p2 = await b.newPage({ viewport:{width:1280,height:800} });
p2.on('pageerror',e=>errors.push(e.message));
await p2.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p2.goto('file://' + process.cwd() + '/index.html');
await p2.waitForTimeout(700);
const turned = await p2.evaluate(() => {
  const M = window.__magnet, o = {};
  M.applyBundle('kickabout');
  M.sel.mode='1v1'; M.sel.lobby='off'; M.sel.controllers='off'; M.sel.adsOn='off';
  M.setMatchSeed(3); M.startMatch();
  const w = M.world; w.state='play'; w.stateT=2;
  o.rot = M.cam.rot;
  const me = w.players[0];
  const park = () => { for (const q of w.players) if (q !== me){ q.x = 9e3; q.y = 9e3; q.vx = q.vy = 0; } w.ball.x = 9e3; w.ball.y = 9e3; };
  me.x = -60; me.y = 0; me.faceX = 1; me.faceY = 0; me._drawAng = 0; me._feet = null;
  for (let i=0;i<30;i++){ me.vx = 2.5; me.vy = 0; park(); M.step(w); M.advanceFeet(w); }
  M.render();
  const s0 = M.screenPt(M.wx(me.x), M.wy(me.y)), s1 = M.screenPt(M.wx(me.x+10), M.wy(me.y));
  const tv = [s1[0]-s0[0], s1[1]-s0[1]], tl = Math.hypot(tv[0], tv[1]);
  o.travelScreen = [ +tv[0].toFixed(1), +tv[1].toFixed(1) ];
  const ctx = document.getElementById('game').getContext('2d');
  const skin = M.kitPerson(me)[1], hx = [1,3,5].map(k=>parseInt(skin.substr(k,2),16));
  const dpr = ctx.getTransform().a, R = me.r*M.cam.s*dpr, cx = s0[0]*dpr, cy = s0[1]*dpr, W = Math.round(2*R);
  const d = ctx.getImageData(Math.round(cx-R), Math.round(cy-R), W, W).data;
  let sx=0, sy=0, n=0;
  for (let i=0;i<d.length;i+=4){
    if (Math.abs(d[i]-hx[0])+Math.abs(d[i+1]-hx[1])+Math.abs(d[i+2]-hx[2]) > 40) continue;
    const k=i/4, ax=(k%W)-R, ay=((k/W)|0)-R; if (Math.hypot(ax,ay) > R*0.7) continue;   // the head, not the hands
    sx += ax; sy += ay; n++;
  }
  o.headOffsetScreen = n ? [ +(sx/n).toFixed(1), +(sy/n).toFixed(1), n ] : null;
  const hl = n ? Math.hypot(sx/n, sy/n) : 0;
  o.headLeadsTravel = n > 20 && hl > 2 && ((sx/n)*tv[0] + (sy/n)*tv[1]) / (hl*tl) > 0.85;
  o.pitchIsTurned = Math.abs(o.rot) > 1;
  // ...and the picker tile, which paints the same skin from its own context, is NOT turned:
  // the flag is raised round the game canvas's paint only, so a bundle swatch baked once and
  // never dropped cannot carry the live turn into the menu for the rest of the session.
  o.skinRotOutsideADraw = M.skinRot;
  return o;
});
await p2.close();
Object.assign(r, { turned });

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
ok(r.strideIsFollowable,
  `one 60Hz frame carries the hand ${r.strideFrameJump} of its whole ${r.strideArc}r stride arc at a moving body's median speed — a stride that turns over this fast is a blur rather than a run. Measured at 0.39 on the first build (7.7 cycles a second, 7.8 frames for a cycle), 0.20 at the sine's slowed cadence, and about 0.10 on the planted stride (FOOTBALLER.stride). The arc itself has to be real, or "slow" is satisfied by a leg that never moves`);
ok(r.bodyInsideTheRing,
  `the body reaches ${r.bodyFarthest}r — the shirt and the shorts TOGETHER may never cross the guide ring, which is the circle the player collides at. Only the arms and the legs are allowed out`);
ok(r.bodyFillsTheRing,
  `the body is only ${r.bodyThinnest}r at its thinnest ray — the shirt and the shorts have to FILL the guide ring, not float inside it leaving crescents of bare pitch. The build before this one measured 0.902 at the farthest point and 0.813 at the thinnest`);
ok(r.shirtInsideTheRing,
  `the SHIRT crosses the guide ring: ${r.shirtReachMax}r at its worst phase over ${r.shirtPixels} pixels — the body has to stay inside the circle it collides with, which is the half of the exception that was NOT granted`);
ok(r.limbsCrossTheRing,
  `at some phase nothing reaches past the guide ring: the figure falls to ${r.figureReachMin}r — "legs can go out" was the ask, and it has to hold right round the cycle rather than at one lucky pose`);
ok(r.limbsAreLimbs,
  `the figure reaches ${r.figureReachMax}r — past the ceiling, which is a body drawn bigger than the thing it collides with rather than limbs sticking out of one`);
ok(r.legsCentredOnTheBody,
  `the legs swing about a midpoint of ${r.footMid}r while the body's own centre is ${r.bodyAlongCentre}r — a limb swung about its own joint carries its whole arc to that joint, which puts the legs behind the player and the arms in front of him`);
ok(r.armsCentredOnTheBody,
  `the arms swing about a midpoint of ${r.handMid}r while the body's own centre is ${r.bodyAlongCentre}r`);
ok(r.limbsOutreachTheBody,
  `the limbs are shorter than the body they hang off: leg ${r.legLongest}r and arm ${r.armLongest}r at the ends of the stride against a body reaching ${r.shirtReachMax}r — a limb that does not out-reach the torso reads as a stub rather than as a leg`);
ok(r.limbSpriteLoaded,
  `Kenney's limb plate did not load, so everything measured here is the pack-less FALLBACK rather than the shipped picture`);
ok(r.limbsAreTheSprite,
  `the limbs on the pitch are not Kenney's plates: the leg region differs from the pack-less drawing by ${r.legSpriteDiff} pixels and the arm by ${r.armSpriteDiff}, with ${r.limbOutlinePixels} of the plate's own outline on either — measured at the swing peak, where the arms counter-swing the legs and the along axis is what tells the two apart`);
ok(r.fallbackIsTheDrawing,
  `with no pack the limbs still carry the plate's second tone (${r.bareOutlinePixels} px) — the missing-pack path is not being reached, so the fallback is asserted rather than tested`);
ok(r.fallbackStillHasLimbs,
  `with no pack the figure reads ${r.bareFigureReachMin}..${r.bareFigureReachMax}r with a shirt at ${r.bareShirtReachMax}r, over a leg of ${r.bareLegSkin} skin and ${r.bareLegBoot} boot pixels and an arm of ${r.bareArmSkin} — a downloaded copy with no assets/ has to field BOTH readable arms and legs, which is what assets/README.md promises`);
ok(r.limbsClearTheShirt,
  `the limbs barely clear the shirt: figure ${r.figureReachMin}r at its worst against shirt ${r.shirtReachMax}r`);
ok(r.limbsAnimate,
  `the two opposite peaks of the stride are the same picture outside the torso (${r.framesDifferOutside} pixels moved) — the legs do not swing`);
ok(r.bodyYawsWithTheStride,
  `the body does not yaw with the stride: the face sits ${JSON.stringify(r.faceAcross)}r across at the two peaks, mid-stride and at rest (swing ${r.faceAcrossSwing}r; ${r.restYawPixels} pixels differ at rest against the twist stood down) — "rotating the player a little bit to show which shoulder is ahead" is equal and opposite turns at the two peaks, nothing at mid-stride or standing still, and a little bit`);
ok(r.noseTurnsFromTheLeadingShoulder,
  `the body turns the WRONG way: face ${JSON.stringify(r.faceAcross)}r against the +1 hand at ${r.handAlong[r.peakPhases[0]]} / ${r.handAlong[r.peakPhases[1]]}r along — the shoulder whose arm is forward has to lead, which turns the nose away from that side`);
ok(r.shirtHoldsItsPlace,
  `the shirt moved between the two peaks (${JSON.stringify(r.shirtBetweenPeaks)}) — the yaw is a rotation about the body, and a near-round shirt turned a few degrees keeps its place and its size`);
ok(r.restIsAFixedStance,
  'a standing player draws a different pose at a different `gait` — at rest it must be a FIXED stance, or somebody who stops mid-stride is left with a leg stretched out behind');
ok(r.standIsCalmer,
  `a standing player and a walking one draw the same pose (${r.standMoved} pixels apart) — the stride is not scaled back below GAIT.minSpd`);
ok(r.sidesFarApartInLightness,
  `the two kits are ${r.lightGap} apart in lightness (${JSON.stringify(r.kits)} = ${JSON.stringify(r.kitLums)}) — both sides are footballers, so the silhouette rule cannot be met and this gap is the only thing a colour-blind player has. Sketchbook's widest pair is 1.87 and that is the bar`);
ok(r.sidesDifferOnScreen, 'the two sides render identically');
ok(r.shirtIsTheTeamColour,
  `the shirt is not painted in the team colour: home ${r.shirtPixels} away ${r.awayShirtPixels} matching pixels — a sprite could not do this, which is most of why the skin is drawn`);
ok(r.buttShows,
  `the shirt covers the shorts: only ${r.buttBand}r of butt is left behind it — the body fills the guide ring by growing the shirt, and grown too far it swallows the thing that was meant to stay visible behind it`);
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
ok(r.turnIsNotInstant,
  `a left-to-right reversal finished in ${r.turnFramesForAHalfTurn} frame(s) — it is supposed to be SEEN as a turn, and one frame is the flip this replaces`);
ok(r.turnIsQuick,
  `a left-to-right reversal took ${r.turnFramesForAHalfTurn} frames — asked for quick; 12 is a fifth of a second at 60Hz`);
ok(r.turnTakesTheShortWay,
  'the turn wandered back on itself — a reversal must go round the nearer half, and the long way round ARRIVES in the same number of frames, so arrival time cannot see it');
ok(r.turnIsVisible,
  'the picture part way through a turn matches one of the two ends — an ease nobody can see is a number, not an animation');
ok(r.turnWrapsTheShortWay,
  `a turn whose short path crosses +-pi took ${r.turnFramesAcrossTheWrap} frames — 0.28 rad the near way against 6.0 the long way, and a reversal through 0/pi reads the same either way, which is why the check above cannot see a missing wrap`);
ok(r.turnWritesOnlyDrawAng,
  `the turn wrote ${JSON.stringify(r.turnWrote)} — it may only ever touch _drawAng, which nothing in step() reads; a world hash would pass on a build that writes a field nothing happens to read YET`);
ok(r.bothSkinsExist, 'one of the two limb styles is missing from DISC_SKINS');
ok(r.twoStylesDiffer,
  'the two limb styles render the same arms and legs with the pack present — which is the whole of what the second theme is for');
ok(r.inkedIsDrawn,
  `the drawn skin carried ${r.inkedOutline} outline pixels against the sprite skin's ${r.limbOutlinePixels} — the pack's plates carry an outline tone and a stroke does not, so this is what says which style is which`);
ok(r.inkedHasLimbs,
  `the drawn skin put ${r.inkedLimbInk} limb pixels out there — "no outline" is equally true of a skin that draws no arms`);
ok(r.inkedArmsThicker,
  `the inked arm is ${r.inkedArmPx}px across against the pack-less fallback's ${r.bareArmPx} at the same phase — "make the inked limbs thicker" was the ask, and before it the two read 19 against 19`);
ok(r.inkedLegsThicker,
  `the inked boot covers ${r.inkedBootPx} pixels against the fallback's ${r.bareBootPx} — bootR is legW/2 on both, so this IS the leg's width squared; a leg that did not thicken reads 1.0`);
ok(r.spriteUntouched,
  `the SPRITE skin's arm is ${r.spriteArmPx}px across against the fallback stroke's ${r.bareArmPx} — the thickening belongs to the inked skin alone, and the plate has always drawn a little narrower than the stroke it stands in for`);
ok(r.inkedFigureInBounds,
  `the inked figure reads ${r.inkedReachMin}..${r.inkedReachMax}r with a shirt at ${r.inkedShirtMax}r — the same three rules the sprite skin is held to: limbs past the ring at every phase, never past 1.60r, body inside it. Widening alone measured 1.641..1.707r; the inked swing is pulled in to pay for the width`);
ok(r.inkedThemeIsABundle && r.inkedThemeSkin === 'footballersink' && r.inkedThemeNamed === 'Sunday League Inked',
  `the drawn-limb theme does not resolve: bundle=${r.inkedThemeIsABundle} discs=${r.inkedThemeSkin} name=${r.inkedThemeNamed}`);
ok(r.isBundle && r.named === 'Sunday League' && r.themeNamed === 'Sunday League',
  `the Sunday League bundle does not resolve: ${r.named} / ${r.themeNamed}`);
ok(r.setsTheSkin, `the bundle does not field the skin: ${r.slots}`);
ok(r.mown, 'the pitch is flat — the mown stripes are half of what the picture is, and they are stripeA/stripeB');
ok(r.noFieldPainter && r.noCourt && r.reusesClassicBall,
  `the bundle grew a field painter, a court or a ball of its own: field=${!r.noFieldPainter} pitch=${!r.noCourt} ball=${r.reusesClassicBall?'classic':'its own'}`);
ok(r.renderOnly, 'the theme moved the world — a skin may only ever draw');
ok(r.plantedFootHoldsStill,
  `a planted foot does not stay planted: ${JSON.stringify(r.feetStraight.plants)} plants over ${r.feetStraight.gait} units with plant lengths ${JSON.stringify(r.feetStraight.plantLen)} (body still on ${r.feetBodyStill} steps) — a foot on the ground has to keep its WORLD position while the body passes over it, and the sine it replaces rode the body at 1:1`);
ok(r.cadenceIsDistanceNotTurns,
  `turning changes the stepping: landings at gait ${JSON.stringify(r.feetStraight.landAt)} on a straight run against ${JSON.stringify(r.feetZig.landAt)} on a zig-zag and ${JSON.stringify(r.feetSlam.plants)} plants on a slam, over ${r.feetStraight.gait} / ${r.feetZig.gait} / ${r.feetSlam.gait} units — the cadence is the distance travelled and nothing else, which is the whole of the ask`);
ok(r.feetLeashed,
  `a foot reaches ${Math.max(r.feetStraight.farMax, r.feetZig.farMax, r.feetSlam.farMax)}r from the body — the leash (FOOTBALLER.reach) is what keeps a planted foot drawable through a turn, and a straight run has to reach hypot(stride, foot) without it biting`);
ok(r.noHopOnRestart,
  `a foot moved ${r.restartMove} units in one frame restarting from a stop, against a swing peak of ${r.feetStraight.swingPeak} — the next step has to start from where the last one ended, and a foot snapped onto its landing spot is a hop`);
ok(r.noSlideOnAReversal,
  `a grounded foot slid on ${r.feetSlides[2]} frames of the reversal run (lifted on ${r.feetLifts[2]}) — a foot stretched past the leash lifts and steps in, it is not dragged along the ground (36-43 frames a foot before the lift)`);
ok(r.liftIsAStepNotAHop,
  `a foot moved ${Math.max(r.feetStraight.swingPeak, r.turnMoveMax)} units in one frame at a body speed of ${2.0} — a lifted foot steps in at a pace (liftPace), never a share of the way (14 units on the build that closed 40% from 2.2r)`);
ok(r.noHopOnATurn,
  `a foot moved ${r.turnMoveMax} units in one frame on a zig-zag or a reversal, against a straight run's swing peak of ${r.feetStraight.swingPeak} — a swing ending while its landing spot swings round behind a reversal must leave the foot where it is, not put it on the spot in one frame (16.0 on the snapping build)`);
ok(r.feetSettleAtRest,
  `at rest the feet sit ${JSON.stringify(r.restDist)}r from the body about a midpoint ${JSON.stringify(r.restMid)} — a player who stops is not left straddled wherever the last step landed`);
ok(r.fallbackGroundHalfIsPlanted,
  `the stateless wave is not a planted stride: along + travel reads ${JSON.stringify(r.groundHalf)} over the ground half (a plant holds it at 1 throughout) — a tile and a swatch draw this wave, and a sine here is a tile that is not a picture of the pitch`);
ok(r.feetWriteOnlyFeet,
  `stepping the feet wrote ${JSON.stringify(r.feetWrote)} — it may only ever touch _feet, which nothing in step() reads`);
ok(r.liveFigureInBounds,
  `on the live path the figure reads ${r.liveReachMin}..${r.liveReachMax}r through a reversal — the same ceiling (1.60) and floor (1.15) the phase sweep is held to, measured where a planted foot can put a leg the stateless wave never draws`);
ok(r.replayLeavesLiveFeetAlone,
  `a replay walked the LIVE player's feet (or drew ${r.replayFeetSeen} positions of its own) — the spread body carries the live _feet object by reference, and a replay must keep its own per slot`);
ok(r.turned.pitchIsTurned, `the wide page did not turn the pitch (cam.rot ${r.turned.rot}) — the frame check below is vacuous upright`);
ok(r.turned.headLeadsTravel,
  `on a turned pitch the body travels ${JSON.stringify(r.turned.travelScreen)} on screen while its head sits at ${JSON.stringify(r.turned.headOffsetScreen)} — a skin paints inside uprightAt, which cancels the pitch's turn, so a world direction needs it put back (skinDir); measured at (+4.9, -0.6) against a travel of (0, -13.5) on the build that did not`);
ok(r.turned.skinRotOutsideADraw === 0,
  `skinRot reads ${r.turned.skinRotOutsideADraw} outside a draw — a tile or a swatch painting the same skin from its own context would carry the live turn into the menu`);
ok(r.escapes === 0, `${r.escapes} ball escapes`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nfootballers OK');
