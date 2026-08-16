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
