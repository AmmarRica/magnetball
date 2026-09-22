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
// ⚠️ Measurement traps, both hit while writing this. The pixels have to be classified
// against the flat backdrop the figure is painted on, not against an absolute — and the
// two frames of the walk differ ONLY in the limbs, so a whole-frame diff that finds
// nothing inside the torso is the claim rather than a weakness.
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
  // Farthest painted pixel from the centre, over whatever "painted" is asked for.
  const reach = (d, pick) => {
    let m = 0, n = 0;
    for (let i=0;i<d.length;i+=4){
      if (!pick(d,i)) continue;
      const k=(i/4)|0, ax=(k%W)-CX, ay=((k/W)|0)-CY;
      m = Math.max(m, Math.hypot(ax, ay)); n++;
    }
    return { reach:+m.toFixed(1), n };
  };
  const anyInk = (d,i) => !near(d,i,BG,40);

  // ---- 1. the body is inside the ring and the limbs are not --------------------
  const homeCol = M.TH.teamRed, awayCol = M.TH.teamBlue;
  const walk0 = paint({ vx:3, gait:0 });
  const figure = reach(walk0, anyInk);
  const shirt  = reach(walk0, (d,i)=>near(d,i,hex(homeCol),48));
  o.figureReach = figure.reach;      o.shirtReach = shirt.reach;
  o.shirtPixels = shirt.n;
  o.figureOverR = +(figure.reach / R).toFixed(3);
  o.shirtOverR  = +(shirt.reach  / R).toFixed(3);
  o.shirtInsideTheRing  = shirt.n > 400 && shirt.reach <= R;
  o.limbsCrossTheRing   = figure.reach >= R * 1.15;
  o.limbsAreLimbs       = figure.reach <= R * 1.60;      // ...and not a bigger body
  o.limbsClearTheShirt  = figure.reach >= shirt.reach * 1.25;

  // ---- 2. the walk: two frames, and they differ ONLY outside the torso ---------
  const a0 = paint({ vx:3, gait:0 });
  const a1 = paint({ vx:3, gait:M.GAIT.stride });
  let movedOut = 0, movedIn = 0;
  for (let i=0;i<a0.length;i+=4){
    const diff = Math.abs(a0[i]-a1[i])+Math.abs(a0[i+1]-a1[i+1])+Math.abs(a0[i+2]-a1[i+2]);
    if (diff <= 24) continue;
    const k=(i/4)|0, ax=(k%W)-CX, ay=((k/W)|0)-CY, rad = Math.hypot(ax,ay);
    if (rad > R*0.80) movedOut++; else if (rad < R*0.55) movedIn++;
  }
  o.framesDifferOutside = movedOut;
  o.framesSameInside    = movedIn;
  o.limbsAnimate        = movedOut > 300;
  o.torsoHoldsStill     = movedIn < 40;
  // ⚠️ Frame 0 is the rest pose AND the swing is scaled back below GAIT.minSpd, so a
  // standing player is not caught mid-stride. Measured as the picture itself: how far the
  // walking frame is from the standing one at the same frame number.
  const stand = paint({ vx:0, gait:0 });
  let strideMoved = 0;
  for (let i=0;i<stand.length;i+=4){
    const diff = Math.abs(stand[i]-a0[i])+Math.abs(stand[i+1]-a0[i+1])+Math.abs(stand[i+2]-a0[i+2]);
    if (diff > 24) strideMoved++;
  }
  o.standIsCalmer = strideMoved > 120;

  // ---- 3. the sides: measured, because the silhouette rule cannot be met -------
  // Both sides are footballers, so the LIGHTNESS GAP is the instrument, the way it is
  // for Sketchbook's counters. The bar is set above Sketchbook's own widest pair (1.87),
  // because a pair no wider than that one buys nothing a colour-blind player can use.
  const lum = (h)=>M.relLum(h);
  o.kits = [homeCol, awayCol];
  o.kitLums = [ +lum(homeCol).toFixed(3), +lum(awayCol).toFixed(3) ];
  o.lightGap = +(((Math.max(...o.kitLums)+0.05)/(Math.min(...o.kitLums)+0.05))).toFixed(2);
  o.sidesFarApartInLightness = o.lightGap > 1.87;
  const away = paint({ team:1, vx:3, gait:0 });
  let sideDiff = 0;
  for (let i=0;i<a0.length;i+=4){
    if (Math.abs(a0[i]-away[i])+Math.abs(a0[i+1]-away[i+1])+Math.abs(a0[i+2]-away[i+2]) > 24) sideDiff++;
  }
  o.sidesDifferOnScreen = sideDiff > 1500;
  // ...and the shirt really is the TEAM colour, so a palette swap recolours it.
  o.awayShirtPixels = reach(away, (d,i)=>near(d,i,hex(awayCol),48)).n;
  o.shirtIsTheTeamColour = o.shirtPixels > 400 && o.awayShirtPixels > 400;

  // ---- 4. the kit trim is WHITE on a dark kit, dark on a pale one --------------
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

  // ---- 5. four people, chosen by a hash, never rolled --------------------------
  const sig = (name)=> paint({ name, vx:3 }).join(',');
  o.sameNameSamePicture = sig('Mike') === sig('Mike');
  const looks = new Set(['Mike','vape','salt','bolt','jake','moon','cat','dog'].map(sig));
  o.peopleSeen = looks.size;
  o.peopleVary = looks.size >= 3;
  o.peopleTable = M.KIT_PEOPLE.length;
  // ⚠️ no `Math.random` anywhere: a paint has to give the same picture twice for one step.
  o.noRandomInThePaint = !/Math\s*\.\s*random/.test(String(M.DISC_SKINS.footballers.paint) +
                                                    String(M.kitPerson));

  // ---- 6. the body turns to face travel ---------------------------------------
  const facing = (fx, fy) => paint({ faceX:fx, faceY:fy, vx:3 }).join(',');
  o.turnsToFaceTravel = facing(1,0) !== facing(0,1);

  // ---- 7. the theme ------------------------------------------------------------
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

  // ---- 8. render only, and it plays -------------------------------------------
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
ok(r.shirtInsideTheRing,
  `the SHIRT crosses the guide ring: reach ${r.shirtReach} of ${r.shirtOverR}r over ${r.shirtPixels} pixels — the body has to stay inside the circle it collides with, which is the half of the exception that was NOT granted`);
ok(r.limbsCrossTheRing,
  `nothing reaches past the guide ring: the whole figure is ${r.figureOverR}r — "legs can go out" was the ask, and a figure that stops at the ring has no limbs on it`);
ok(r.limbsAreLimbs,
  `the figure reaches ${r.figureOverR}r — past the ceiling, which is a body drawn bigger than the thing it collides with rather than limbs sticking out of one`);
ok(r.limbsClearTheShirt,
  `the limbs barely clear the shirt: figure ${r.figureOverR}r against shirt ${r.shirtOverR}r`);
ok(r.limbsAnimate,
  `the two walk frames are the same picture outside the torso (${r.framesDifferOutside} pixels moved) — the legs do not swing`);
ok(r.torsoHoldsStill,
  `${r.framesSameInside} pixels inside the torso changed between the two walk frames — the head and shirt must hold still while only the limbs swing`);
ok(r.standIsCalmer,
  `a standing player and a walking one draw the same pose (${r.framesSameInside}) — the stride is not scaled back below GAIT.minSpd`);
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
