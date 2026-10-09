// SUNDAY LEAGUE 3D — the footballers lit the way the ball is, from directly above.
//
// THE ASK: "I like the 2 sunday style. Develop one where you adjust the players to make
// them look 3D but still from top down. I like how the ball looks and I want players to
// match." The ball's whole 3D is one radial — a white highlight up-left fading out by 0.45
// of the radius and a dark fall-off to 0.30 black at the edge (`SPHERE_SHADE`, which
// `paintBall` has always drawn inline). The third skin (`footballers3d`, bundle `kicklit`)
// fills that same radial over each solid the figure is made of — the head as a ball, the
// shirt and shorts as domes, each limb as a cylinder (`cylinderShade`, the same stops across
// the limb) — inside its own path and nowhere else. The light is SCREEN up-left, the ball's,
// never the body's own facing.
//
// ⚠️ THE INSTRUMENT: a region's "light" is its luminance-weighted centroid minus its plain
// centroid, projected on screen up-left, in pixels at R=60. A flat figure reads its OWN
// asymmetry there — the dark hair behind a pale face, the shirt forward of the shorts — and
// that reading turns with the body: measured on the shipped sprite skin, head -3.4 facing
// east and +2.8 facing west, shirt +2.5 and -2.8. So every reading here is a DIFFERENCE
// against the flat sprite skin at the same facing and phase, in the same run, where the
// figure's own asymmetry cancels and what is left is the lamp: the lit skin must read more
// up-left light than the flat one at EVERY facing (head, shirt, limbs and the whole figure
// each on their own, so a shade dropped from one part is caught by that part's check), and
// the two flat skins must still read as flat — their east and west readings cancelling —
// which is also what says this change touched neither of the existing themes.
// ⚠️ A STANDING BODY HAS NO LIMB IN THE OUTER ANNULUS (the arms are tucked in and the feet
// under the body: 0-2 pixels), so the limbs are measured on a running one at the PLANT
// phase (gait 0), where a foot is a full stride forward and the hands are swung — and the
// legs and the arms are read as FOUR regions, split by how far ACROSS the facing a pixel is
// (a foot lands 0.82r across, a hand 1.30r) and by which side, because one pooled annulus
// was measured with the leg shade cut and stayed green: at the first phase tried both feet
// were under the shirt and the annulus held nothing but hands.
// ⚠️ AND A LIMB IS READ OFF THE DIFFERENCE FIELD, NOT THE CENTROID. The centroid shift that
// serves the head and the shirt read the legs NEGATIVE at two facings on a good build: the
// cylinder shade takes more off the far side (0.30 black) than it adds to the near one
// (0.50 white over pale skin is a few levels), so a shaded limb is darker overall, and a
// darker thing sitting up-left of the body's centre pulls the whole region's light centroid
// down-right. What is asked of a limb is only that its lit edge is on the lamp's side of its
// dark edge — so each limb's reading is the covariance of (lit minus flat) with position
// along the lamp, about the limb's OWN weighted centre, in pixels: positive is lit up-left,
// a flipped lamp reads negative, and a limb with no shade reads zero. A limb that happens
// to run straight toward the lamp has no across-shade to show (that is a cylinder), which
// is why the arms — one of the two is always near the diagonal — are read as the better of
// the pair at each facing, and the legs, 21 degrees off the facing both ways, as both.
// ⚠️ "LIKE THE BALL" IS THE BALL'S OWN HELPER, checked three ways: the ball reads up-left
// too in the same run; `paintBall` and the skin both name `sphereShade`; and the helper
// painted over a flat grey disc lands the ball's stops (0.50 white at the highlight,
// 0.30 black at the edge) to within a few levels.
// ⚠️ THE LIGHT LANDS ON THE SHAPES AND NOT BESIDE THEM: the figure's farthest ink is the
// flat skin's to the pixel (every reach rule reads what it reads), and the limb annulus
// carries hardly more ink than the flat one — the first build stroked each limb's shade at
// the plate's full height and read 439 ink pixels against 291, a halo either side of every
// limb, because the plate's forearm fills 11 of its 13 rows (`KLIMB.profile`).
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{ width:1280, height:800 } });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{ window.__MAGNETDEBUG=true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(async () => {
  const M = window.__magnet; const o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  for (let i=0; i<80 && !M.klimbReady(); i++) await new Promise(r => setTimeout(r, 100));
  o.spritesReady = M.klimbReady();

  // ---- 1. shipped: the skin, the theme, the bundle --------------------------------
  const sk = M.DISC_SKINS.footballers3d;
  o.skinExists = !!sk && typeof sk.paint === 'function';
  o.skinNamed = !!sk && /3D/.test(sk.name);
  o.staminaTells = !!sk && sk.staminaTells === true;
  o.themeNamed = (M.THEMES.kicklit || {}).name;
  o.isBundle = !!M.bundleSlots('kicklit');
  const bs = M.THEME_BUNDLES.kicklit || {};
  o.bundleSlots = { discs: bs.discs, ball: bs.ball, trail: bs.trail };
  const pal = (k) => (M.THEMES[k] || { pitch:{} }).pitch;
  o.turf = { lit: pal('kicklit').court, plain: pal('kickabout').court, inked: pal('kickink').court };
  o.turfDistinct = o.turf.lit && o.turf.lit !== o.turf.plain && o.turf.lit !== o.turf.inked;
  o.markingsRead = M.contrastRatio('#ffffff', o.turf.lit || '#000000');
  // ...and picking it lands the whole look, which `currentBundle` then names
  M.applyBundle('kicklit');
  o.picked = { discs: M.sel.look.discs, trail: M.sel.look.trail, ball: M.sel.look.ball, bundle: M.currentBundle(), palette: M.sel.look.palette };

  // ---- 2. the light, by region and facing, as a difference ------------------------
  const R = 60, W = 300, CX = 150, CY = 150, BG = 127;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = W; const c = cv.getContext('2d');
  const F = M.FOOTBALLER;
  const paint = (skin, fx, fy, run) => {
    c.fillStyle = 'rgb(127,127,127)'; c.fillRect(0, 0, W, W);
    const q = { team:0, faceX:fx, faceY:fy, r:R, name:'Mike', cap:'none', color:'#46d17a',
                vx: run ? 3*fx : 0, vy: run ? 3*fy : 0, gait: 0 };          // gait 0 running = the plant
    M.DISC_SKINS[skin].paint(c, q, CX, CY, R, { players:[q] });
    return c.getImageData(0, 0, W, W).data;
  };
  const lum = (d, i) => 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
  const isInk = (d, i) => Math.abs(d[i]-BG) + Math.abs(d[i+1]-BG) + Math.abs(d[i+2]-BG) > 12;
  const read = (d, inRegion) => {
    let n=0, sx=0, sy=0, L=0, lx=0, ly=0, far=0;
    for (let y=0; y<W; y++) for (let x=0; x<W; x++){
      const i = (y*W + x)*4; if (!isInk(d, i)) continue;
      far = Math.max(far, Math.hypot(x - CX, y - CY));
      if (!inRegion(x - CX, y - CY)) continue;
      const l = lum(d, i); n++; sx += x; sy += y; L += l; lx += l*x; ly += l*y;
    }
    const shift = (n && L) ? ((sx/n - lx/L) + (sy/n - ly/L)) / Math.SQRT2 : 0;
    return { n, shift: +shift.toFixed(2), far: +(far / R).toFixed(3) };
  };
  // A limb's light, read ACROSS the limb on the painter's own joint-to-tip line: the lamp-side
  // edge minus the far edge, in luminance, averaged over three points on the visible stretch.
  // The lamp side is chosen exactly as `cylinderShade` chooses it (the across normal turned
  // toward screen up-left), so a limb that happens to run along the lamp is read on the side
  // the painter lit. ⚠️ Two region instruments were tried first and both read a limb's sign
  // wrong on a good build: a covariance of (lit - flat) about its own weighted centre is ZERO
  // on a boot (the lit edge gains 117 levels and the far edge loses 6 — a one-sided field has
  // no covariance about its own mean), and a luminance centroid over a quadrant of the annulus
  // moved with whichever of the boot's edges the region happened to hold more of.
  const limbEdge = (d, A, B, w) => {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
    let nx = -dy / L, ny = dx / L;
    if (nx*S.lx + ny*S.ly < 0){ nx = -nx; ny = -ny; }
    let diff = 0;
    // (0.80..0.92 of the way out and 0.22 of the width either side: the stretch of the limb
    // that lies over the rim and past it, inside the plate's core and short of its taper.
    // Nearer the joint the limb is UNDER the shirt and a sample reads the shirt; wider than
    // 0.22 one sample sat on the boot's antialiased edge and read the grey behind it.)
    for (const t of [0.80, 0.86, 0.92]){
      const px = A[0] + dx*t, py = A[1] + dy*t, h = w*0.22;
      const at = (sx, sy) => lum(d, ((Math.round(sy))*W + Math.round(sx))*4);
      diff += at(px + nx*h, py + ny*h) - at(px - nx*h, py - ny*h);
    }
    return +(diff / 3).toFixed(1);
  };
  const S = M.SPHERE_SHADE;
  const FACES = [[1,0,'E'], [0,1,'S'], [-1,0,'W'], [0,-1,'N']];
  o.light = {};            // per facing: { region: { lit, flat, inked, delta } }
  o.reach = {}; o.limbInk = {}; o.rimDark = {};
  for (const [fx, fy, nm] of FACES){
    const hx = fx*F.headAt*R, hy = fy*F.headAt*R, hr = F.headR*R;
    const head  = (x, y) => Math.hypot(x - hx, y - hy) <= hr*0.92;
    const shirt = (x, y) => { const q = Math.hypot(x, y); return q >= 0.60*R && q <= 0.95*R && !(Math.hypot(x - hx, y - hy) <= hr*1.05); };
    // The limbs, one region each, in the body's OWN frame — yawed with the stride exactly
    // as the painter yaws it (FOOTBALLER.twist on the plant's swing). At the plant the
    // feet sit at (±0.93, ±0.82) along/across and the hands at (∓0.58, ±1.30), so each limb
    // owns a quadrant of the annulus: a region that caught a boot AND the lit edge of the
    // arm beside it read the leg's light with the wrong sign at three facings.
    const tw = F.twist * M.footSwing({ vx:3*fx, vy:3*fy, gait:0 }, 1);
    const ux = fx*Math.cos(tw) - fy*Math.sin(tw), uy = fx*Math.sin(tw) + fy*Math.cos(tw);
    const limbs = (x, y) => { const q = Math.hypot(x, y); return q >= 1.18*R && q <= 1.58*R; };
    const all   = (x, y) => Math.hypot(x, y) <= 1.6*R;
    // ...and where each limb IS at the plant, as the painter lays it: hip to planted foot,
    // shoulder to counter-swung hand (dash 0, arms out — a running body is not `still`).
    const pt = (a, b2) => [CX + ux*a*R + (-uy)*b2*R, CY + uy*a*R + ux*b2*R];
    const limbLine = (sgn) => {
      const q = { vx:3*fx, vy:3*fy, gait:0 }, sw = M.footSwing(q, sgn);
      return { leg: [pt(F.hip[0], F.hip[1]*sgn), pt(F.swingAt + F.stride*sw, F.foot*sgn)],
               arm: [pt(F.sh[0], F.sh[1]*sgn), pt(F.swingAt - F.armSwing*sw, F.hand*sgn)] };
    };
    const row = {};
    for (const run of [false, true]){
      const dl = paint('footballers3d', fx, fy, run), df = paint('footballers', fx, fy, run), di = paint('footballersink', fx, fy, run);
      for (const [rn, reg] of [['head', head], ['shirt', shirt], ['limbs', limbs], ['all', all]]){
        if (rn === 'limbs' && !run) continue;
        const a = read(dl, reg), f = read(df, reg), k = read(di, reg);
        row[rn + (run ? '.run' : '')] = { lit: a.shift, flat: f.shift, inked: k.shift, delta: +(a.shift - f.shift).toFixed(2), nLit: a.n, nFlat: f.n };
        if (rn === 'all'){ o.reach[nm + (run ? '.run' : '')] = { lit: a.far, flat: f.far }; }
        if (rn === 'limbs'){ o.limbInk[nm] = { lit: a.n, flat: f.n }; }
      }
      if (run){
        const core = M.KLIMB.profile[0][1], wl = R*F.legW*core, wa = R*F.armW*core;
        row.legs = {}; row.arms = {};
        for (const sgn of [-1, 1]){
          const ln = limbLine(sgn), k = sgn < 0 ? 'a' : 'b';
          row.legs[k] = { lit: limbEdge(dl, ...ln.leg, wl), flat: limbEdge(df, ...ln.leg, wl) };
          row.arms[k] = { lit: limbEdge(dl, ...ln.arm, wa), flat: limbEdge(df, ...ln.arm, wa) };
        }
      }
      // the rim: the ball's heavy ring is still round the lit body (a ray down-right, clear of the limbs)
      if (!run){
        const at = (d, f) => { const i = ((Math.round(CY + f*R*Math.SQRT1_2))*W + Math.round(CX + f*R*Math.SQRT1_2))*4; return lum(d, i); };
        o.rimDark[nm] = { lit: +at(dl, 1.08).toFixed(1), flat: +at(df, 1.08).toFixed(1) };
      }
    }
    o.light[nm] = row;
  }
  // ---- 3. the ball, in the same run, with the same instrument ----------------------
  c.fillStyle = 'rgb(127,127,127)'; c.fillRect(0, 0, W, W);
  M.paintBall(c, CX, CY, R, 0, 'plain', null, 0, 0);
  o.ball = read(c.getImageData(0, 0, W, W).data, (x, y) => Math.hypot(x, y) <= 0.95*R);
  o.ballNamesHelper = /sphereShade\(/.test(String(M.paintBall));
  // ...and the skin has NO light of its own: every solid goes through the helper (three
  // sphere fills — shorts, shirt, head — and a cylinder per limb branch) and the painter
  // builds no gradient itself. A head lit by its own radial with its own stops kept
  // "names the helper" true through the shirt and was caught by nothing until this.
  const src = sk ? String(sk.paint) : '';
  o.skinNamesHelper = (src.match(/sphereShade\(/g) || []).length === 3 && (src.match(/cylinderShade\(|klimbShade\(/g) || []).length === 4 &&
                      !/create(Radial|Linear|Conic)Gradient/.test(src);
  // the helper's own stops, over a flat grey disc
  c.fillStyle = 'rgb(127,127,127)'; c.fillRect(0, 0, W, W);
  c.beginPath(); c.arc(CX, CY, R, 0, 2*Math.PI); c.fillStyle = M.sphereShade(c, CX, CY, R); c.fill();
  const sd = c.getImageData(0, 0, W, W).data;
  const px = (x, y) => sd[((Math.round(y))*W + Math.round(x))*4];
  // The highlight is exact arithmetic (the stop's white over the grey); the dark side is read
  // at 0.95R down-right, inside the disc's antialiased edge, as a floor. ⚠️ Deriving the dark
  // side from the radial's own parameters was tried and is WRONG — a two-point conical
  // gradient between two offset circles does not map the way the obvious algebra says (it
  // read 96 where the canvas draws 106) — so "the ball's light" is measured the honest way
  // below: the helper over a white disc against `paintBall`'s own edge, point for point.
  o.helper = { hi: px(CX - R*S.off, CY - R*S.off), lo: px(CX + R*0.95*Math.SQRT1_2, CY + R*0.95*Math.SQRT1_2),
               wantHi: Math.round(BG + (255 - BG)*S.hi), loCeil: Math.round(BG*0.85) };
  const ring = (d) => [0.5, 0.7, 0.8, 0.9, 0.95].map(rho => d[((Math.round(CY + R*rho*Math.SQRT1_2))*W + Math.round(CX + R*rho*Math.SQRT1_2))*4]);
  c.fillStyle = 'rgb(127,127,127)'; c.fillRect(0, 0, W, W);
  c.beginPath(); c.arc(CX, CY, R, 0, 2*Math.PI); c.fillStyle = '#ffffff'; c.fill(); c.fillStyle = M.sphereShade(c, CX, CY, R); c.fill();
  const helperOnWhite = ring(c.getImageData(0, 0, W, W).data);
  const was3d = M.sel.ball3d; M.sel.ball3d = 'off';
  c.fillStyle = 'rgb(127,127,127)'; c.fillRect(0, 0, W, W);
  M.paintBall(c, CX, CY, R, 0, 'plain', null, 0, 0);
  const ballEdge = ring(c.getImageData(0, 0, W, W).data);
  M.sel.ball3d = was3d;
  o.helper.onWhite = helperOnWhite; o.helper.ball = ballEdge;
  o.helper.ballGap = Math.max(...helperOnWhite.map((v, i) => Math.abs(v - ballEdge[i])));

  // ---- 4. render only -----------------------------------------------------------------
  const hashRun = (discs) => {
    M.applyBundle('kicklit');
    M.sel.look.discs = discs;
    M.sel.mode='4v4'; M.sel.length='5'; M.setMatchSeed(7); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    let h = 2166136261;
    for (let i=0;i<600;i++){ M.step(w); if (i % 30 === 0) M.render(); }
    const nums = [];
    for (const q of w.players) nums.push(q.x, q.y, q.vx, q.vy);
    nums.push(w.ball.x, w.ball.y, w.ball.vx, w.ball.vy, w.score[0], w.score[1]);
    for (const v of nums){ const s = v.toFixed(6);
      for (let k=0;k<s.length;k++){ h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } }
    return h >>> 0;
  };
  o.renderOnly = hashRun('footballers3d') === hashRun('footballers');
  M.applyBundle('kickabout');
  return o;
});

const L = r.light;
const minOver = (reg) => Math.min(...['E','S','W','N'].map(f => L[f][reg].delta));
const flatCancels = (who, reg) => Math.abs(L.E[reg][who] + L.W[reg][who]) < 0.6 && Math.abs(L.S[reg][who] + L.N[reg][who]) < 0.6;
const checks = {
  spritesReady: r.spritesReady,
  skinExists: r.skinExists, skinNamed: r.skinNamed, staminaTells: r.staminaTells,
  themeNamed: r.themeNamed === 'Sunday League 3D',
  isBundle: r.isBundle && r.bundleSlots.discs === 'footballers3d' && r.bundleSlots.ball === 'classic' && r.bundleSlots.trail === 'steps',
  turfDistinct: r.turfDistinct,
  markingsRead: r.markingsRead >= 2.5,
  pickedLands: r.picked.discs === 'footballers3d' && r.picked.palette === 'kicklit' && r.picked.bundle === 'kicklit' && r.picked.trail === 'steps',
  // the lamp, region by region, at every facing — against the flat skin in the same run
  headLit:  minOver('head') >= 0.5,
  shirtLit: minOver('shirt') >= 0.7,
  legsLit: ['E','S','W','N'].every(f => ['a','b'].every(k => L[f].legs[k].lit - L[f].legs[k].flat >= 15)),
  armsLit: ['E','S','W','N'].every(f => ['a','b'].every(k => L[f].arms[k].lit - L[f].arms[k].flat >= 15)),
  // (the flat arm reads up to ~22 of its own — the plate's outline row under one sample — against ~40 lit)
  limbsFlatOnTheFlatSkin: ['E','S','W','N'].every(f => ['a','b'].every(k => Math.abs(L[f].legs[k].flat) <= 12 && Math.abs(L[f].arms[k].flat) <= 25)),
  allLit:   minOver('all') >= 0.7 && minOver('all.run') >= 0.7,
  // ...and the two flat skins are still flat: their own asymmetry cancels east/west
  flatStillFlat: flatCancels('flat', 'head') && flatCancels('flat', 'shirt') && flatCancels('flat', 'all'),
  inkedStillFlat: flatCancels('inked', 'head') && flatCancels('inked', 'shirt') && flatCancels('inked', 'all'),
  litIsNotFlat: !flatCancels('lit', 'head') || !flatCancels('lit', 'shirt'),
  // the ball: same direction, same helper, the helper is the ball's own light
  ballUpLeft: r.ball.shift > 0.5,
  ballNamesHelper: r.ballNamesHelper, skinNamesHelper: r.skinNamesHelper,
  helperIsTheBallsLight: Math.abs(r.helper.hi - r.helper.wantHi) <= 4 && r.helper.lo <= r.helper.loCeil && r.helper.ballGap <= 2,
  // the light lands on the shapes and not beside them
  reachUnchanged: Object.values(r.reach).every(v => Math.abs(v.lit - v.flat) <= 1/60),
  limbsNotHaloed: Object.values(r.limbInk).every(v => v.lit <= v.flat * 1.06 + 6),
  rimKept: Object.values(r.rimDark).every(v => v.lit < 70 && v.flat < 70),
  renderOnly: r.renderOnly,
  noErrors: errors.length === 0,
};
console.log(JSON.stringify({ light: r.light, reach: r.reach, limbInk: r.limbInk, rimDark: r.rimDark, ball: r.ball, helper: r.helper,
                             turf: r.turf, markings: +r.markingsRead.toFixed(2), picked: r.picked, errors }, null, 1));
const fails = Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
if (fails.length) console.log('FAILED:', fails);
console.log('RESULT:', fails.length ? 'FAIL' : 'ALL PASS');
await b.close(); process.exit(fails.length ? 1 : 0);
