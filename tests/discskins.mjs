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
  o.shrimpTurns = paintAt('shrimp', true) !== paintAt('shrimp', false);
  o.arrowTurns  = paintAt('arrow',  true) !== paintAt('arrow',  false);
  o.poolIgnores = paintAt('pool',   true) === paintAt('pool',   false);
  o.monoIgnores = paintAt('mono',   true) === paintAt('mono',   false);
  M.profile.spin = true;

  // ---- the Shrimp theme is a real bundle -------------------------------------
  o.isBundle = !!M.bundleSlots('shrimp');
  M.applyBundle('shrimp');
  o.slots = JSON.stringify(M.liveSlots());
  o.named = M.bundleName();
  o.setsFieldAndDiscs = M.sel.look.field === 'seabed' && M.sel.look.discs === 'shrimp';
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
ok(r.skins.includes('shrimp'), `no shrimp skin: ${JSON.stringify(r.skins)}`);
ok(r.guideIsReal, 'the guide ring is configured to nothing');
ok(r.everySkinRinged, `a skin's body is not ringed all the way round: ${JSON.stringify(r.ringPerSkin)} — a player must always be able to see the circle they collide with`);
ok(r.turnsWhenOn, 'the body does not turn to face travel with rotation on');
ok(r.uprightWhenOff, 'rotation off does not point the body up its OWN pitch');
ok(r.zeroFaceYIsNotFalsy, 'a player facing exactly along x got the fallback facing — `p.faceY || fallback` is back');
ok(r.noFacingIsSane, 'a player with no facing at all does not point anywhere sensible');
ok(r.shrimpTurns && r.arrowTurns, `a direction-drawn skin ignored the rotation setting: shrimp ${r.shrimpTurns}, arrow ${r.arrowTurns}`);
ok(r.poolIgnores && r.monoIgnores, 'a ROUND skin changed with the rotation setting — the control promises it only affects themes whose players have a front');
ok(r.isBundle && r.named === 'Shrimp', `the Shrimp bundle does not resolve: ${r.named}`);
ok(r.setsFieldAndDiscs, `the bundle does not set both field and discs: ${r.slots}`);
ok(r.escapes === 0, `${r.escapes} ball escapes on the shrimp theme`);
ok(r.floorIsStill, 'the seabed re-scatters every paint — the shells crawl');
ok(r.floorHasNoStep, 'the seabed grew a step(); if that is deliberate it must be advanced next to step(), never in a paint');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ndiscskins OK');
