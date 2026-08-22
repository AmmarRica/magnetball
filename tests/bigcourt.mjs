// The largest courts, and the rule that A BODY IS DRAWN AT THE SIZE IT COLLIDES AT.
//
// Leviathan is 2640 x 4640 — sixteen times Giant's area and four times Colossus's.
// The whole pitch still has to fit on screen, so cam.s falls to 0.15 and a player is
// 4.5 pixels across.
//
// ⚠️ THERE USED TO BE A SIZE FLOOR HERE (`MIN_BODY_PX`, `cam.body`) and this suite
// existed to prove it was render-only. It was — but it multiplied SIZES and not
// SEPARATIONS, and every distance on a pitch is a separation. At the moment two bodies
// touched, the drawn radii summed to `cam.body ×` the drawn gap between their centres,
// so the picture showed them interpenetrating by exactly that much. Reported as
// "collision size does not match the visuals, causing ball to go inside player", and
// measured on Leviathan: at contact the ball's centre was 3.75px from the player's
// centre while the player was drawn at a radius of 7px — the ball was drawn wholly
// inside the body it was resting against. It reached the KICK RING too, which is worse,
// because that ring is a promise about the physics rather than a decoration: it came
// out 3.11x its true reach on Leviathan and 1.57x on Colossus.
//
// ⚠️ NO CAP COULD FIX IT. The overlap is `(cam.body − 1) × gap`, so any multiplier above
// 1 draws interpenetration and capping only chooses how big a lie to tell. Same call the
// VideoSoccer arrowhead got: the drawing follows the collider, never the other way round.
//
// ⚠️ SO WHAT IS MEASURED NOW IS THE AGREEMENT ITSELF, on every field and at two
// viewport sizes: two bodies at exactly touching distance must be drawn exactly
// tangent, and the kick ring must sit at the true reach. Both are measured in DRAWN
// pixels through `wx`/`wy` and `ringLayout`, never by reading a multiplier back —
// "cam has no `body` property" is a claim about a variable, and what broke was a
// picture.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1100,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};

  // ---- it really is the biggest, and by how much ---------------------------
  const areas = Object.entries(M.FIELDS).map(([k,f])=>[k, f.W*f.L]).sort((a,c)=>c[1]-a[1]);
  o.biggest = areas[0][0];
  o.overSecond = +(areas[0][1]/areas[1][1]).toFixed(1);
  o.second = areas[1][0];
  // Shape stays familiar: the goal is a third of the width, like every other court.
  const lev = M.FIELDS.leviathan;
  o.goalRatio = +(lev.goal/lev.W).toFixed(3);
  o.giantGoalRatio = +(M.FIELDS.giant.goal/M.FIELDS.giant.W).toFixed(3);
  o.sameShape = o.goalRatio === o.giantGoalRatio;

  const start = (field, seed) => { M.sel.mode='4v4'; M.sel.kickoffRule='off';
    M.sel.field=field; M.setMatchSeed(seed); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2; return w; };

  // ---- containment: the ball never leaves, even out there -------------------
  let w = start('leviathan', 3);
  let escapes = 0, worst = 0;
  for (let i=0;i<60*90;i++){
    M.step(w);
    for (const bl of [w.ball, ...(w.extraBalls||[])]){
      const ox = Math.abs(bl.x) - (w.field.W/2 + bl.r);
      const oy = Math.abs(bl.y) - (w.field.L/2 + w.bounds.net + bl.r);
      if (ox > 2 || oy > 2){ escapes++; worst = Math.max(worst, ox, oy); }
    }
  }
  o.escapes = escapes; o.worstEscape = +worst.toFixed(1);
  // ...and it is a real match out there, not a ball nobody can reach.
  o.goalsHappen = (w.score[0] + w.score[1]) > 0;
  o.score = w.score.slice();

  // ---- how long the thing actually takes to cross --------------------------
  const me = w.players[0];
  w.players.slice(1).forEach(q=>{ q.x=1e4; q.y=1e4; });
  me.x=0; me.y=-w.field.L/2+60; me.vx=0; me.vy=0;
  M.pads.p1.dx=0; M.pads.p1.dy=1;
  let peak=0;
  for (let i=0;i<400;i++){ M.step(w); peak = Math.max(peak, Math.hypot(me.vx,me.vy)); }
  M.pads.p1.dy=0;
  o.unitsPerSec = Math.round(peak*60);
  o.lengthSecs = +(w.field.L/(peak*60)).toFixed(1);

  // ---- the price of the rule, stated so nobody inflates it back ------------
  w = start('leviathan', 3); M.render();
  o.levCamS = +M.cam.s.toFixed(3);
  o.levDiscAcross = +(w.players[0].r * M.cam.s * 2).toFixed(2);
  w = start('classic', 3); M.render();
  o.classicDiscAcross = +(w.players[0].r * M.cam.s * 2).toFixed(2);

  // ---- ...and drawing still cannot touch the world -------------------------
  // The floor is gone, but "the draw may not reach the physics" is the standing rule
  // this suite has always been for, so it keeps measuring it: same seed, same steps,
  // rendering every frame against not rendering at all.
  const hash = ww => {
    const n = x => (typeof x==='number' ? x.toFixed(9) : String(x));
    const a = [ww.state, n(ww.stateT), ww.score.join(':')];
    for (const q of ww.players) a.push(n(q.x), n(q.y), n(q.vx), n(q.vy));
    for (const bl of [ww.ball, ...(ww.extraBalls||[])]) a.push(n(bl.x), n(bl.y), n(bl.vx), n(bl.vy));
    return a.join('|');
  };
  const run = noDraw => {
    const ww = start('leviathan', 21);
    for (let i=0;i<900;i++){
      M.step(ww);
      if (!noDraw) M.render();          // drawing must leave the world exactly as it was
    }
    return hash(ww);
  };
  o.worldWithFloor = run(false).length;
  o.renderOnly = run(false) === run(true);

  // ---- and the whole thing draws without throwing --------------------------
  for (const f of ['leviathan','colossus','giant','classic']){
    const ww = start(f, 5);
    for (let i=0;i<30;i++) M.step(ww);
    M.render();
  }
  o.drewEverything = true;

  M.sel.field='classic'; M.setMatchSeed(null);
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.biggest === 'leviathan', `the biggest court is ${r.biggest}, not leviathan`);
ok(r.overSecond >= 3.5, `leviathan is only ${r.overSecond}x ${r.second} — that is not "even bigger"`);
ok(r.sameShape, `the goal is ${r.goalRatio} of the width, not the ${r.giantGoalRatio} every other court uses`);
ok(r.escapes === 0, `the ball left the pitch ${r.escapes} times on leviathan, by up to ${r.worstEscape} units`);
ok(r.goalsHappen, `90 seconds on leviathan produced no goals at all (${r.score.join('-')}) — the court may be unplayable`);
ok(r.lengthSecs > 15 && r.lengthSecs < 30, `it takes ${r.lengthSecs}s to run its length, which is not the size intended`);
ok(r.levDiscAcross > 3 && r.levDiscAcross < 6,
   `a player on Leviathan is ${r.levDiscAcross}px across (Classic is ${r.classicDiscAcross}px). That IS small, and it is the price of the drawn body being the collider — if this reads much bigger, something has started inflating bodies again`);
ok(r.renderOnly, 'rendering changed the WORLD — the draw may never reach the physics');
ok(r.drewEverything, 'a court failed to draw');
ok(errors.length===0, 'console errors: '+errors.join(' | '));


// ===================================================================================
// THE DRAWN BODY IS THE COLLIDER — measured in RENDERED PIXELS.
// ⚠️ The obvious check is VACUOUS and was written first: comparing `p.r*s + b.r*s`
// against `(p.r + b.r)*s` is the same expression on both sides, so it passes on every
// build including the one this exists to catch. What has to be measured is the WIDTH
// the renderer actually paints, against the radius the physics actually uses.
// ⚠️ Measured as a DIFFERENCE against the same frame with the body taken away — an
// absolute ink count on a pitch reads the markings, and Leviathan's are all over it.
// ⚠️ On a BIG viewport, because the thing being measured is only a few pixels across at
// the size this court is normally played at, and a 1px sampling error on a 4px ball
// would swamp the reading. The defect being caught is a 3.11x inflation, so the
// tolerance can stay tight even so.
// ⚠️ Grass pinned (pixels), and juiceReset() first — `flash` is module-level and a
// headless probe never runs the loop that decays it.
const p2 = await b.newPage({ viewport:{width:1600,height:1200} });
p2.on('pageerror',e=>errors.push(e.message));
await p2.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p2.goto('file://' + process.cwd() + '/index.html');
await p2.waitForTimeout(800);
const px = await p2.evaluate(() => {
  const M = window.__magnet, rows = [];
  const cv = document.getElementById('game'), c = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  for (const k of ['classic','giant','colossus','leviathan']){
    M.applyTheme('grass');
    M.sel.field = k; M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.sel.ball3d = 'off';
    M.setMatchSeed(9); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    M.juiceReset();
    const me = w.players[0];
    for (const q of w.players) if (q !== me){ q.x = 0; q.y = 9e4; }
    const s = M.cam.s, HX = w.field.W * 0.22, HY = w.field.L * 0.22, AWAY = 9e4;
    const shot = () => { M.computeCam(); M.renderAlpha = 1; M.render();
                         return c.getImageData(0, 0, cv.width, cv.height).data; };
    // Widest run of pixels along a horizontal scan through (wxx,wyy) that differ from base.
    const runAt = (base, now, wxx, wyy) => {
      const sy = Math.round(M.wy(wyy) * dpr), x0 = Math.round(M.wx(wxx) * dpr);
      let lo = null, hi = null;
      for (let dx = -120; dx <= 120; dx++){
        const i = ((sy * cv.width) + (x0 + dx)) * 4;
        const d = Math.abs(now[i]-base[i]) + Math.abs(now[i+1]-base[i+1]) + Math.abs(now[i+2]-base[i+2]);
        if (d > 24){ if (lo === null) lo = dx; hi = dx; }
      }
      return lo === null ? 0 : (hi - lo + 1) / dpr;
    };
    me.x = AWAY; me.y = AWAY; w.ball.x = AWAY; w.ball.y = AWAY;
    const baseA = shot();
    w.ball.x = HX; w.ball.y = HY; w.ball.vx = w.ball.vy = 0;
    const ballDrawn = runAt(baseA, shot(), HX, HY);
    w.ball.x = AWAY; w.ball.y = AWAY;
    const baseB = shot();
    me.x = HX; me.y = HY; me.vx = me.vy = 0; me.kick = false; me.name = '';
    const discDrawn = runAt(baseB, shot(), HX, HY);
    // The kick ring, held for real: its radius is the outermost changed pixel.
    me.kick = true;
    const now = shot();
    const sy = Math.round(M.wy(HY) * dpr), x0 = Math.round(M.wx(HX) * dpr);
    let far = 0;
    for (let dx = 1; dx <= 200; dx++){
      const i = ((sy * cv.width) + (x0 + dx)) * 4;
      const d = Math.abs(now[i]-baseB[i]) + Math.abs(now[i+1]-baseB[i+1]) + Math.abs(now[i+2]-baseB[i+2]);
      if (d > 24) far = dx;
    }
    me.kick = false;
    rows.push({ k, s: +s.toFixed(4),
      ballTrue: +(w.ball.r*2*s).toFixed(2), ballDrawn: +ballDrawn.toFixed(2),
      ballExcess: +(ballDrawn - w.ball.r*2*s).toFixed(2),
      discTrue: +(me.r*2*s).toFixed(2), discDrawn: +discDrawn.toFixed(2),
      discExcess: +(discDrawn - me.r*2*s).toFixed(2),
      ringTrue: +(me.r*M.kickRingMul()*s).toFixed(2), ringDrawn: +(far/dpr).toFixed(2),
      ringExcess: +(far/dpr - me.r*M.kickRingMul()*s).toFixed(2) });
  }
  const span = f => Math.max.apply(null, rows.map(f)) - Math.min.apply(null, rows.map(f));
  const worst = f => Math.max.apply(null, rows.map(f));
  return { rows,
    drewSomething: rows.every(x => x.ballDrawn > 0 && x.discDrawn > 0 && x.ringDrawn > 0),
    ballSpan: +span(x => x.ballExcess).toFixed(2), ballWorst: +worst(x => x.ballExcess).toFixed(2),
    discSpan: +span(x => x.discExcess).toFixed(2), discWorst: +worst(x => x.discExcess).toFixed(2),
    ringSpan: +span(x => x.ringExcess).toFixed(2), ringWorst: +worst(x => Math.abs(x.ringExcess)).toFixed(2) };
});
await p2.close();

ok(px.drewSomething,
   `nothing was drawn to measure: ${JSON.stringify(px.rows)} — every check below would pass on a blank pitch`);
// ⚠️ **THE STATISTIC IS THE EXCESS, NOT THE RATIO, and that is the whole of what makes
// this check possible.** A body has to be drawn with a PEN — an outline, a rim, a soft
// shadow — so the painted silhouette is always a few pixels wider than the collider, and
// on a 6px body that is a ratio of 1.78 while on a 35px body it is 1.17. Ratio therefore
// says nothing. What a pen does and a SCALE cannot is stay the same number of pixels as
// the body shrinks: measured across a 5.6x range of cam.s the excess is 2.9-4.8px and
// flat, where the old size floor added 2.11x the body on Leviathan alone.
ok(px.ballSpan < 4 && px.ballWorst < 8,
   `THE BALL IS NOT DRAWN AT THE SIZE IT COLLIDES AT: excess over the collider is ${JSON.stringify(px.rows.map(x=>[x.k,x.ballExcess]))} — a pen stays the same few pixels as the body shrinks, a scale does not`);
ok(px.discSpan < 4 && px.discWorst < 8,
   `THE PLAYER IS NOT DRAWN AT THE SIZE IT COLLIDES AT: excess over the collider is ${JSON.stringify(px.rows.map(x=>[x.k,x.discExcess]))}`);
ok(px.ringWorst < 2.5,
   `THE KICK RING IS NOT THE REACH: ${JSON.stringify(px.rows.map(x=>[x.k,x.ringDrawn,x.ringTrue]))}. That ring is a promise about the physics — a ball touching it must be a ball you can kick, on every court`);

console.log(JSON.stringify({ ...r, px }, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nbigcourt OK');
