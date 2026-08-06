// The largest courts, and the render-only size floor that makes them playable.
//
// Leviathan is 2640 x 4640 — sixteen times Giant's area and four times Colossus's.
// The whole pitch still has to fit on screen, so cam.s falls to 0.15 and a player
// disc comes out 2.1 PIXELS across: every disc is the same dot, and you cannot tell
// your own player from anyone else's. cam.body floors it.
//
// ⚠️ THE THING THIS SUITE IS REALLY FOR: the floor is RENDER ONLY. It must not reach
// the physics, the kick range, the hit tests or the bots — a Leviathan match has to
// play exactly as it would if you could not see it. So the suite steps the same seed
// with the floor on and with it sabotaged to 1 and requires the world bit-identical,
// which is the only version of "render only" that means anything.
//
// ⚠️ And it must be exactly 1 on an ordinary court, not 1.0001. A floor that quietly
// scales every disc on Classic is a redesign, not a fix.
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

  // ---- the size floor: on this court it bites, on Classic it does not -------
  w = start('leviathan', 3); M.render();
  o.levCamS = +M.cam.s.toFixed(3);
  o.levBody = +M.cam.body.toFixed(3);
  o.rawDiscPx = +(w.players[0].r * M.cam.s).toFixed(2);
  o.drawnDiscPx = +(w.players[0].r * M.cam.s * M.cam.body).toFixed(2);
  o.floorBites = o.levBody > 1.5 && o.drawnDiscPx >= M.MIN_BODY_PX - 0.01;
  w = start('classic', 3); M.render();
  o.classicBody = M.cam.body;
  o.untouchedOnClassic = M.cam.body === 1;      // EXACTLY 1, not about 1
  w = start('colossus', 3); M.render();
  o.colossusBody = +M.cam.body.toFixed(3);

  // ---- ...and it is RENDER ONLY --------------------------------------------
  // Same seed, same steps, floor honoured vs floor forced to 1: bit-identical.
  const hash = ww => {
    const n = x => (typeof x==='number' ? x.toFixed(9) : String(x));
    const a = [ww.state, n(ww.stateT), ww.score.join(':')];
    for (const q of ww.players) a.push(n(q.x), n(q.y), n(q.vx), n(q.vy));
    for (const bl of [ww.ball, ...(ww.extraBalls||[])]) a.push(n(bl.x), n(bl.y), n(bl.vx), n(bl.vy));
    return a.join('|');
  };
  const run = sabotage => {
    const ww = start('leviathan', 21);
    for (let i=0;i<900;i++){
      M.step(ww);
      M.render();                       // the draw is where the floor lives
      if (sabotage) M.cam.body = 1;     // ...take it away and the world must not care
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
ok(r.floorBites, `the size floor did nothing on leviathan: ${r.rawDiscPx}px raw, ${r.drawnDiscPx}px drawn, body ${r.levBody}`);
ok(r.untouchedOnClassic, `the size floor is ${r.classicBody} on Classic — it must be EXACTLY 1 on an ordinary court`);
ok(r.renderOnly, 'removing the size floor changed the WORLD — it is not render-only, and a big court plays differently from a small one for no reason');
ok(r.drewEverything, 'a court failed to draw');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nbigcourt OK');
