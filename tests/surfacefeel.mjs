// The playing surface, and whether the pitch you pick still lets your sliders work.
//
// ⚠️ THE BUG THIS SUITE EXISTS FOR: `PITCH` held ABSOLUTE accel and damp numbers, and
// the world took them on Ice and Mud but took the Game Feel sliders on Grass. So the
// Speed and Grip dials silently did nothing on two of the three surfaces, and changing
// pitch threw away whatever you had tuned. The surface is a MULTIPLIER on your feel
// now, through one helper (`surfaceFeel`) that everything building a world goes
// through — a match, a drill, and a live slider change.
//
// ⚠️ And the numbers at the DEFAULT sliders have to be the old ones, or "the surface
// is a multiplier now" is a rebalance wearing a refactor's clothes.
//
// ⚠️ `glide` scales the per-step LOSS, not the damping factor: damping is a multiplier
// per step, so scaling it directly is meaningless — a 1.05x on 0.905 is above 1 and
// the players accelerate forever. The suite checks the ordering that actually matters
// (ice keeps more speed than grass, mud keeps less) rather than the constant.
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

  const build = (surf, feel) => {
    M.sel.pitch = surf; M.sel.feel = feel || {};
    M.sel.mode='1v1'; M.sel.kickoffRule='off'; M.setMatchSeed(5); M.startMatch();
    const w = M.world;
    return { accel:+w.pAccel.toFixed(4), damp:+w.pDamp.toFixed(4) };
  };
  const SURF = ['normal','ice','mud'];

  // ---- the old numbers survive at the default sliders ----------------------
  o.def = {}; for (const s of SURF) o.def[s] = build(s, {});
  const near = (a, b2) => Math.abs(a - b2) < 0.002;
  o.grassUnchanged = near(o.def.normal.accel, 0.40) && near(o.def.normal.damp, 0.905);
  o.iceUnchanged   = near(o.def.ice.accel,    0.26) && near(o.def.ice.damp,    0.955);
  o.mudUnchanged   = near(o.def.mud.accel,    0.34) && near(o.def.mud.damp,    0.86);

  // ---- ...and the sliders now reach EVERY surface --------------------------
  const slow = { accel:20, pdamp:840 }, fast = { accel:70, pdamp:940 };
  o.slow = {}; o.fast = {};
  for (const s of SURF){ o.slow[s] = build(s, slow); o.fast[s] = build(s, fast); }
  o.slidersReachEverySurface = SURF.every(s =>
    o.fast[s].accel > o.slow[s].accel + 0.05 && o.fast[s].damp > o.slow[s].damp + 0.01);

  // ---- the three surfaces still rank the same way --------------------------
  // Ice keeps more of your speed than grass; mud keeps less. That ordering is the
  // whole point of having surfaces, and it must survive any feel setting.
  o.orderHolds = [{}, slow, fast].every(f => {
    const n = build('normal', f), i = build('ice', f), m = build('mud', f);
    return i.damp > n.damp && n.damp > m.damp && i.accel < n.accel && m.accel < n.accel;
  });
  // ...and no setting can push damping to or past 1, which would be a player who
  // never slows down.
  o.dampCapped = [{}, slow, fast, { pdamp:999 }, { pdamp:1000 }].every(f =>
    SURF.every(s => build(s, f).damp < 1));

  // ---- a live slider change reaches the running match, on every surface -----
  o.live = {};
  for (const s of SURF){
    build(s, {});
    const before = M.world.pAccel;
    M.sel.feel = { accel:70, pdamp:940 };
    M.applyFeel();
    o.live[s] = { before:+before.toFixed(4), after:+M.world.pAccel.toFixed(4) };
  }
  o.applyFeelReachesEverySurface = SURF.every(s => o.live[s].after > o.live[s].before + 0.05);

  // ---- a drill is built the same way as a match ----------------------------
  M.sel.feel = { accel:70, pdamp:940 };
  const drillOf = (s) => { M.sel.pitch = s; M.startDrill(M.DRILL_KEYS[0]);
    return { accel:+M.world.pAccel.toFixed(4), damp:+M.world.pDamp.toFixed(4) }; };
  const matchOf = (s) => build(s, { accel:70, pdamp:940 });
  o.drillMatchesMatch = SURF.every(s => {
    const d = drillOf(s), m = matchOf(s);
    return Math.abs(d.accel - m.accel) < 1e-6 && Math.abs(d.damp - m.damp) < 1e-6; });

  M.sel.pitch = 'normal'; M.sel.feel = {};
  // ---- THE FRICTION DIALS SAY HOW LONG SOMETHING TAKES TO STOP -------------
  // ⚠️ **MEASURED AGAINST THE REAL ENGINE, never checked against the formula.** The two
  // friction sliders used to read out the raw damping coefficient — 0.960, 0.992 — which
  // is not a number anybody can aim at, and "how long before a player stops" was not
  // askable of the name or the value. The readout is a stopping time now, and the only
  // claim worth making about it is that the pitch AGREES: so the body is given a velocity
  // and the real step loop counts how long it actually takes to lose 95% of it.
  // ⚠️ Grass, deliberately: `surfaceFeel` bends the damping by 2.11 on Ice and 0.678 on
  // Mud, and the readout is the BASE number the slider sets. Measuring on Ice would be
  // measuring the surface.
  {
    const coast = (dampMilli, who) => {
      M.sel.pitch = 'normal'; M.sel.mode = '1v1'; M.sel.kickoffRule = 'off';
      M.sel.feel = who === 'ball' ? { bdamp: dampMilli } : { pdamp: dampMilli };
      M.sel.sprint = 'off';                  // no boost, no tired speed, just the damping
      M.setMatchSeed(5); M.startMatch();
      const w = M.world; w.state = 'play'; w.stateT = 2;
      // Everybody else parked far away and the ball taken out of reach, so nothing is
      // measured but the damping — a collision or a magnet pull is a different force.
      w.players.forEach((q, i) => { q.x = (i%2?1:-1) * 9e3; q.y = 9e3; q.vx = q.vy = 0;
                                    q.inX = 0; q.inY = 0; q.kick = false; });
      const body = who === 'ball' ? w.ball : w.players[0];
      body.x = 0; body.y = 0;
      if (who !== 'ball'){ w.ball.x = 9e3; w.ball.y = 9e3; w.ball.vx = 0; w.ball.vy = 0; }
      body.vx = 8; body.vy = 0;
      const v0 = Math.hypot(body.vx, body.vy);
      let n = 0;
      // ⚠️ The position is re-pinned every step: `integrate` clamps a body to the bounds
      // and `clampBallInside` contains the ball, so a body coasting at 8 a step leaves the
      // court long before it stops and an unpinned run measures a WALL. Only the position
      // goes back; the velocity is the thing being measured and is left entirely alone.
      const px = body.x, py = body.y;
      // ⚠️ **EVERY OTHER BODY IS RE-PARKED ON EVERY STEP, and without that the ball never
      // stops at all** — it measured the 4000-step cap. `integrate` clamps a body to the
      // bounds, so the far-away parking is undone on the first step (the trap
      // `tests/fourpads.mjs` records), the bots then chase the ball for the three hundred
      // steps it takes to coast down, and reach it long before it gets there. Parked once,
      // this block measures the AI rather than the damping.
      while (n < 4000 && Math.hypot(body.vx, body.vy) > v0 * 0.05){
        M.step(w); n++;
        for (const q of w.players){
          if (q === body) continue;
          q.x = 9e3; q.y = 9e3; q.vx = 0; q.vy = 0; q.inX = 0; q.inY = 0; q.kick = false;
        }
        if (who !== 'ball'){ w.ball.x = 9e3; w.ball.y = 9e3; w.ball.vx = 0; w.ball.vy = 0; }
        body.x = px; body.y = py;
        if (who !== 'ball'){ body.inX = 0; body.inY = 0; body.kick = false; }
      }
      return { measured: n / 60, says: M.stopSecs(dampMilli / 1000) };
    };
    o.coastPlayer = coast(905, 'player');
    o.coastPlayerSlow = coast(985, 'player');
    o.coastBall = coast(990, 'ball');
    const agrees = (c) => c.measured > 0 && Math.abs(c.measured - c.says) < Math.max(0.05, c.says * 0.06);
    o.readoutIsTrue = agrees(o.coastPlayer) && agrees(o.coastPlayerSlow) && agrees(o.coastBall);
    // ...and the two ends of the dial are genuinely different, or "it agrees" is true of a
    // readout that says the same thing everywhere.
    o.readoutMoves = o.coastPlayerSlow.says > o.coastPlayer.says * 2;
  }
  // ⚠️ The LABELS have to carry the word somebody searches for. Both dials existed the
  // whole time under "Player float" and "Ball glide", which is why they were reported as
  // missing: nothing in the menu said friction, or stopping, or anything a person would
  // look for. Read off the live table rather than the DOM, so the check does not depend on
  // which Game Feel pane happens to be open.
  const fr = M.FEEL_SLIDERS.filter(x => /friction/i.test(x.label));
  o.frictionLabels = fr.map(x => x.label);
  o.saysFriction = fr.length === 2;
  // ...and both read out a TIME rather than the coefficient.
  o.frictionFmt = fr.map(x => x.fmt(x.get()));
  o.readsSeconds = fr.length === 2 && o.frictionFmt.every(t => /^[0-9]+\.[0-9][0-9]s$/.test(t));
  return o;
});

// ---- an animated field keeps moving through a REPLAY -----------------------
// ⚠️ A replay is not the step loop, so advanceDynField() was never called and every
// animated theme froze the moment a goal went in. Driven through the real playReplay.
const rep = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  M.applyBundle('warp');                       // the starfield: it moves, visibly
  M.sel.mode='1v1'; M.sel.kickoffRule='off'; M.setMatchSeed(5); M.startMatch();
  const w = M.world; w.state='play'; w.stateT=2;
  // Fill the rolling buffer, then freeze it the way a goal does.
  for (let i=0;i<120;i++){ M.step(w); M.advanceTrails(w); M.advanceDynField(); }
  M.repOnGoal(w);
  o.haveFrames = !!(M.lastReplay && M.lastReplay.frames.length > 10);
  if (!o.haveFrames) return o;
  const snap = () => JSON.stringify(Array.from(M.dynState.z || []).slice(0, 12));
  const t0 = snap();
  const done = M.playReplay(1.0);
  await new Promise(res => setTimeout(res, 420));
  o.movedDuringReplay = snap() !== t0;
  M.skipReplay();
  await done;
  M.applyBundle('classic');
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.grassUnchanged, `Grass moved: ${JSON.stringify(r.def.normal)} — the default sliders must still give 0.40 / 0.905`);
ok(r.iceUnchanged,   `Ice moved: ${JSON.stringify(r.def.ice)} — the default sliders must still give 0.26 / 0.955`);
ok(r.mudUnchanged,   `Mud moved: ${JSON.stringify(r.def.mud)} — the default sliders must still give 0.34 / 0.86`);
ok(r.slidersReachEverySurface, `the Game Feel sliders do not reach every surface: slow ${JSON.stringify(r.slow)} vs fast ${JSON.stringify(r.fast)} — that is the whole bug, back again`);
ok(r.orderHolds, 'the surfaces no longer rank ice > grass > mud for glide and grass > ice/mud for grip, at some feel setting');
ok(r.dampCapped, 'a feel setting pushed damping to 1 or past it, which is a player who never slows down');
ok(r.applyFeelReachesEverySurface, `moving a slider mid-match changed nothing on some surface: ${JSON.stringify(r.live)}`);
ok(r.drillMatchesMatch, 'a drill builds its movement differently from a match, so practising is not practising');
ok(rep.haveFrames, 'no replay frames were recorded, so the animation check below proves nothing');
ok(rep.movedDuringReplay, 'the animated field did NOT advance during a replay — a replay is not the step loop, so it has to tick the field itself or every animated theme freezes the moment a goal goes in');
ok(r.readoutIsTrue, `the stopping-time readout disagrees with the pitch: ${JSON.stringify({p:r.coastPlayer, slow:r.coastPlayerSlow, ball:r.coastBall})}. It is measured against the real step loop on purpose — a readout checked against its own formula proves only that the formula is idempotent`);
ok(r.readoutMoves, `the two ends of the player friction dial read ${r.coastPlayer && r.coastPlayer.says} and ${r.coastPlayerSlow && r.coastPlayerSlow.says} — "the readout agrees with the pitch" is also true of one that says the same thing everywhere`);
ok(r.saysFriction, `${JSON.stringify(r.frictionLabels)} — both friction dials have to carry the word somebody searches for. They existed the whole time as "Player float" and "Ball glide", which is exactly why they were reported as missing`);
ok(r.readsSeconds, `the friction dials read ${JSON.stringify(r.frictionFmt)} instead of a time in seconds — a damping coefficient of 0.960 is not a number anybody can aim at`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify({ ...r, ...rep }, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nsurfacefeel OK');
