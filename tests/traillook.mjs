// The trail slot: what the tell behind a player looks like.
//
// The motion tells were fixed — small dots, one shape for everybody. They are a theme
// slot now, alongside the field, the discs and the ball.
//
// ⚠️ THE LINE THIS SUITE HOLDS: a look only DRAWS. Where a dot is dropped and how fast
// it fades live in advanceTrails, which runs in the step loop, and none of that may
// move into the look — the tell's LENGTH is how far someone just came, which is a read
// and not a decoration. Checked by stepping the same match under every look and
// requiring the recorded history to come out identical.
//
// ⚠️ And the BALL keeps its streak whatever the slot says. It is the one thing
// everybody on the pitch is tracking, so no cosmetic choice may switch it off — the
// suite renders with the trail set to 'none' and checks the streak is still there.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:520,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();

  o.keys = M.TRAIL_LOOK_KEYS.slice();
  o.isASlot = M.SLOT_KEYS.indexOf('trail') >= 0;
  o.hasNone = o.keys.indexOf('none') >= 0;
  o.named = o.keys.every(k => !!(M.TRAIL_LOOKS[k] && M.TRAIL_LOOKS[k].name));

  // ---- every look draws, and 'none' draws nothing -------------------------
  const cv = document.createElement('canvas'); cv.width = cv.height = 240;
  const c = cv.getContext('2d');
  const pts = [];
  for (let k=0;k<10;k++) pts.push({ x: 30 + k*18, y: 120 + Math.sin(k*0.6)*20, a: 1 });
  const inkOf = (key) => {
    c.fillStyle = '#7f7f7f'; c.fillRect(0,0,240,240);
    M.TRAIL_LOOKS[key].draw(c, pts, pts.length, '#ff3b6b', 15);
    const d = c.getImageData(0,0,240,240).data;
    let n = 0;
    for (let i=0;i<d.length;i+=4)
      if (Math.abs(d[i]-127) + Math.abs(d[i+1]-127) + Math.abs(d[i+2]-127) > 20) n++;
    return n;
  };
  o.ink = {};
  for (const k of o.keys) o.ink[k] = inkOf(k);
  o.everyLookDraws = o.keys.every(k => k === 'none' ? o.ink[k] === 0 : o.ink[k] > 200);
  // ...and they are not all the same picture, or the slot is a list of one thing.
  const shots = {};
  for (const k of o.keys){
    c.fillStyle = '#7f7f7f'; c.fillRect(0,0,240,240);
    M.TRAIL_LOOKS[k].draw(c, pts, pts.length, '#ff3b6b', 15);
    shots[k] = c.getImageData(0,0,240,240).data.join(',');
  }
  o.looksDiffer = new Set(Object.values(shots)).size === o.keys.length;

  // ---- a look may draw the two sides DIFFERENTLY, and must say so ---------
  // ⚠️ Pontions and Prixels pours one side and pixelates the other, which is the only
  // reason `team` is in the signature. A look that branches on it without setting
  // `perTeam` would render two different tells behind a picker tile that shows one.
  const teamShot = (key, team) => {
    c.fillStyle = '#7f7f7f'; c.fillRect(0,0,240,240);
    M.TRAIL_LOOKS[key].draw(c, pts, pts.length, '#ff3b6b', 15, team);
    return c.getImageData(0,0,240,240).data.join(',');
  };
  o.branching = o.keys.filter(k => teamShot(k, 0) !== teamShot(k, 1));
  o.declared  = o.keys.filter(k => !!M.TRAIL_LOOKS[k].perTeam);
  o.perTeamDeclared = JSON.stringify(o.branching.sort()) === JSON.stringify(o.declared.sort());
  o.hasAPairing = o.declared.length > 0;

  // ---- every look has a picker swatch, through the real painter ------------
  o.noSwatch = o.keys.filter(k => M.slotSwatch('trail', k) === null);

  // ---- ⚠️ the look does not touch the SAMPLING ----------------------------
  // ⚠️ Driven by hand rather than by letting bots play: the question is whether the
  // LOOK can change what gets recorded, so the motion has to be identical under each
  // one by construction. A bot-driven match records almost nothing in a few hundred
  // steps anyway — dots are dropped by distance covered and faded out again — and
  // "identical" across two nearly-empty lists proves nothing.
  const histOf = (key) => {
    M.sel.look.trail = key;
    M.resetTrails();
    const fake = { ball:{x:0,y:0}, players:[{x:0,y:0},{x:40,y:-40}] };
    for (let i=0;i<120;i++){
      fake.ball.x = Math.sin(i*0.05)*120;
      fake.players[0].x = i*2.5;  fake.players[0].y = Math.sin(i*0.08)*60;
      fake.players[1].x = 40 - i*1.7; fake.players[1].y = -40 + Math.cos(i*0.06)*50;
      M.advanceTrails(fake);
    }
    return JSON.stringify(M.discTrails.map(h => h.map(d =>
      [Math.round(d.x*1000), Math.round(d.y*1000), Math.round(d.a*1000)])));
  };
  const base = histOf('dots');
  o.samplingIsShared = o.keys.every(k => histOf(k) === base);
  // ...and it recorded something, or "identical" is a comparison of two empty lists.
  o.recorded = JSON.parse(base).reduce((n,h)=>n+h.length, 0);

  // ---- the BALL keeps its streak whatever the slot says --------------------
  // ⚠️ Down the LENGTH of the pitch and only far enough to stay in bounds. The first
  // version fired it across the width at full speed for 26 steps, which put it through
  // the side wall and into a goal — so the two runs were comparing different matches.
  const ballInk = (key) => {
    M.applyBundle('classic');
    M.sel.look.trail = key;
    M.sel.mode='2v2'; M.sel.kickoffRule='off'; M.setMatchSeed(11); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    w.players.forEach(q=>{ q.x=9999; q.y=9999; q.vx=0; q.vy=0; });   // players out of shot
    M.resetTrails();
    w.ball.x=0; w.ball.y=-150; w.ball.vx=0; w.ball.vy=18;
    for (let i=0;i<12;i++){ M.step(w); M.advanceTrails(w); }
    M.computeCam(); M.render();
    const cvs = document.getElementById('game'), cc = cvs.getContext('2d');
    const DPR = cvs.width / cvs.clientWidth;
    const b2 = w.ball;
    let hit = 0;
    for (let t=1; t<=8; t++){
      const [sx,sy] = M.screenPt(M.wx(b2.x), M.wy(b2.y - t*13));
      const [gx,gy] = M.screenPt(M.wx(b2.x + 110), M.wy(b2.y - t*13));  // same stripe
      const d = cc.getImageData(Math.round(sx*DPR), Math.round(sy*DPR), 1, 1).data;
      const g = cc.getImageData(Math.round(gx*DPR), Math.round(gy*DPR), 1, 1).data;
      if (Math.abs(d[0]-g[0]) + Math.abs(d[1]-g[1]) + Math.abs(d[2]-g[2]) > 14) hit++;
    }
    return hit;
  };
  o.streakWithDots = ballInk('dots');
  o.streakWithNone = ballInk('none');
  o.ballKeepsStreak = o.streakWithNone >= 4 && o.streakWithNone >= o.streakWithDots - 1;

  // ---- a look may OWN the ball's streak, and Ribbon does ---------------------
  // ⚠️ The Ribbon look was asked for FROM A PICTURE of a ball towing a soft, wide,
  // fading ribbon — so the claim is about the BALL's streak, and it is measured on the
  // pitch as a DIFFERENCE against the same frame with the recording emptied: the ball,
  // the markings and the mown stripes are in both renders and cancel, so what is left
  // is the streak alone. `none` must own nothing, or the rule above (the ball keeps a
  // streak whatever the slot says) has a door in it.
  o.owners = o.keys.filter(k => typeof M.TRAIL_LOOKS[k].ball === 'function');
  o.noneOwnsNothing = !M.TRAIL_LOOKS.none.ball;
  const streakOf = (key) => {
    M.applyBundle('classic'); M.sel.look.trail = key; M.sel.adsOn = 'off';
    M.sel.mode='2v2'; M.sel.kickoffRule='off'; M.setMatchSeed(11); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    w.players.forEach(q=>{ q.x=9999; q.y=9999; q.vx=0; q.vy=0; });
    M.resetTrails();
    w.ball.x=0; w.ball.y=-150; w.ball.vx=0; w.ball.vy=22;
    for (let i=0;i<14;i++){ M.step(w); M.advanceTrails(w); }
    M.computeCam();
    const cvs = document.getElementById('game'), cc = cvs.getContext('2d');
    const DPR = cvs.width / cvs.clientWidth;
    const b2 = w.ball, rPx = b2.r * M.cam.s * DPR;
    const [hx, hy] = M.screenPt(M.wx(M.ix(b2)), M.wy(M.iy(b2)));
    // The ball travels DOWN the screen (upright pitch, world +y), so the streak is above
    // it. The band starts 1.4r behind the ball's centre — clear of the ball itself.
    const x0 = Math.round(hx*DPR - 3.5*rPx), W2 = Math.round(7*rPx);
    const y1 = Math.round(hy*DPR - 1.4*rPx), y0 = Math.max(0, Math.round(hy*DPR - 34*rPx)), H2 = y1 - y0;
    M.render();
    const A = cc.getImageData(x0, y0, W2, H2).data;
    M.resetTrails(); M.render();                              // same frame, no streak
    const B = cc.getImageData(x0, y0, W2, H2).data;
    const rows = [];                                          // per row: [inked columns, summed diff]
    for (let y=0; y<H2; y++){
      let n=0, sum=0;
      for (let x=0; x<W2; x++){
        const i=(y*W2+x)*4, d=Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2]);
        if (d > 14) n++; sum += d;
      }
      rows.push([n, sum]);
    }
    // Row H2-1 is nearest the ball. `tail` is how many rows back the streak reaches, so
    // the far band can be placed as a FRACTION of the streak's own length — the ribbon
    // fades over that length, and a band a fixed distance back measures a different
    // point on the fade for every speed and every zoom.
    let tail = 0; for (let y=0; y<H2; y++) if (rows[y][0] > 0){ tail = H2 - y; break; }
    const band = (a, z) => {                                  // rows a..z back from the ball, in px
      const y0b = Math.max(0, H2 - Math.round(z)), y1b = Math.min(H2, H2 - Math.round(a));
      let s=0, wmax=0; for (let y=y0b; y<y1b; y++){ s += rows[y][1]; wmax = Math.max(wmax, rows[y][0]); }
      return { mean: s / Math.max(1, y1b-y0b), wmax };
    };
    return { rPx, tail, near: band(0.2*rPx, 1.8*rPx), far: band(0.62*tail, 0.82*tail), pic: A.join(',') };
  };
  const rib = streakOf('ribbon'), def = streakOf('dots');
  o.ribbon = { rPx: rib.rPx, near: rib.near, far: rib.far };
  o.default = { near: def.near, far: def.far };
  o.ribbonDrawsOnTheBall = rib.near.mean > 40;
  o.ribbonDiffersFromDefault = rib.pic !== def.pic;
  // A ball wide at the head (the outer layer is a SOFT edge, so 0.8 of a diameter is the
  // bar) and never past the default's own width, which is 3.3 radii at this speed.
  o.ribbonIsBallWide = rib.near.wmax >= 1.6*rib.rPx && rib.near.wmax <= 3.6*rib.rPx;
  // ...and it FADES along its length where the default does not: far/near is the
  // discriminator, measured on both looks in the same run.
  o.ribbonFades = rib.far.mean < 0.6 * rib.near.mean;
  o.defaultIsFlat = def.far.mean > 0.75 * def.near.mean;

  // ---- a save from before the slot existed, and a stored key that is gone --
  M.sel.look.trail = 'orbs';
  delete M.sel.look.trail;
  M.normalizeLook();
  o.missingGetsDefault = M.sel.look.trail === 'dots';
  M.sel.look.trail = 'nope';
  M.normalizeLook();
  o.unknownGetsDefault = M.sel.look.trail === 'dots';

  // ---- a bundle can own one, and Custom is still derived -------------------
  M.applyBundle('ufo');
  o.ufoTrail = M.sel.look.trail;
  o.bundleOwnsIt = o.ufoTrail === 'orbs' && M.bundleName() === 'Abduction';
  M.sel.look.trail = 'comet';
  o.customWhenChanged = M.bundleName() === 'Custom';
  M.applyBundle('ufo');
  o.backToBundle = M.bundleName() === 'Abduction';
  M.applyBundle('classic');
  return o;
});

// ...and it survives a reload, which is what makes it a setting rather than a mood.
await p.evaluate(()=>{ const M=window.__magnet; M.sel.look.trail = 'comet'; M.saveSel(); });
await p.reload();
await p.waitForTimeout(900);
const after = await p.evaluate(()=> window.__magnet.sel.look.trail);

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.isASlot, 'trail is not in SLOT_KEYS, so no picker will ever show it');
ok(r.keys.length >= 3, `only ${r.keys.length} trail looks — a slot with two entries is a toggle`);
ok(r.hasNone, 'there is no way to turn the player tell off');
ok(r.named, 'a trail look has no name, so its tile has no label');
ok(r.everyLookDraws, `a look drew nothing, or "none" drew something: ${JSON.stringify(r.ink)}`);
ok(r.looksDiffer, 'two trail looks render identically — the slot is a list of one thing wearing several names');
ok(r.hasAPairing, 'no trail look draws the two sides differently, so the team argument in the signature is dead weight');
ok(r.perTeamDeclared, `a look branches on the team without declaring perTeam (or the other way round): branching ${JSON.stringify(r.branching)}, declared ${JSON.stringify(r.declared)} — the picker tile shows one run unless it is told there are two`);
ok(r.noSwatch.length === 0, `trail looks with no picker swatch: ${JSON.stringify(r.noSwatch)}`);
ok(r.recorded > 20, `only ${r.recorded} dots were ever recorded — the sampling check below is comparing two empty lists`);
ok(r.samplingIsShared, 'changing the LOOK changed what was recorded — spacing and fade belong to advanceTrails, which runs in the step loop, and the length of a tell is a read rather than a decoration');
ok(r.ballKeepsStreak, `the ball streak weakened when the player trail was switched off (${r.streakWithNone} vs ${r.streakWithDots} samples) — the ball is the one thing everybody is tracking and no cosmetic choice may take it away`);
ok(r.owners.indexOf('ribbon') >= 0, `no Ribbon look owns the ball's streak (owners: ${JSON.stringify(r.owners)}) — the ask was a trail for the BALL`);
ok(r.noneOwnsNothing, '"none" carries a ball painter — the one look that must fall to the default streak has a door in it');
ok(r.ribbonDrawsOnTheBall, `Ribbon drew nothing behind a kicked ball (band mean ${r.ribbon.near.mean.toFixed(1)}) — the look exists and the pitch never sees it`);
ok(r.ribbonDiffersFromDefault, 'the ball streak under Ribbon is pixel-identical to the default — drawBallTrail never asked the look');
ok(r.ribbonIsBallWide, `the ribbon at the ball is ${r.ribbon.near.wmax}px across against a ${r.ribbon.rPx.toFixed(1)}px radius — asked for as wide as the ball, and never wider than the default`);
ok(r.ribbonFades, `the ribbon does not fade along its length: far ${r.ribbon.far.mean.toFixed(1)} against near ${r.ribbon.near.mean.toFixed(1)} — a flat stroke is the default look wearing a new name`);
ok(r.defaultIsFlat, `the CONTROL failed: the default streak reads far ${r.default.far.mean.toFixed(1)} against near ${r.default.near.mean.toFixed(1)}, so "it fades" cannot separate the two`);
ok(r.missingGetsDefault, 'a save from before the slot existed did not get the default');
ok(r.unknownGetsDefault, 'a stored trail key that no longer exists was left in place');
ok(r.bundleOwnsIt, `a bundle cannot set the slot: Abduction resolved to ${r.ufoTrail}`);
ok(r.customWhenChanged, 'changing the trail by hand did not turn the bundle into Custom, so the name on screen is a lie');
ok(r.backToBundle, 'reapplying the bundle did not restore its trail');
ok(after === 'comet', `the trail choice did not survive a reload: ${after}`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ntraillook OK');
