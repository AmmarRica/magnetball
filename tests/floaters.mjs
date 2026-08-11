// FLOATING STAT TEXT — "ASSIST" over the player who made it, rising and fading.
//
// The MMO damage-number idea, pointed at the match record: the moment a player earns
// something the result screen will remember, the name of it floats off them.
//
// Four things are held, and the first is the one that keeps it honest:
//   1. ⚠️ EVERY LABEL IS SPAWNED WHERE THE STAT IS COUNTED. Each `addFloater` hangs off
//      the exact line that does `ms.<stat>++`, so a floater cannot claim something the
//      result screen will not also show. This suite checks the two against each other
//      rather than checking the label alone — a label that fires on the wrong player, or
//      fires without the stat moving, is the whole failure mode.
//   2. ⚠️ It AGES IN THE STEP LOOP, never in a draw. The trails rule: on a 144Hz screen a
//      draw-aged label lives a third as long, and two draws of one frame disagree.
//   3. ⚠️ It is spawned from inside `step()`, so it must not touch `Math.random` or
//      `w.rng` — the first breaks the determinism rule outright, the second would make
//      how many labels appeared perturb every later bot decision.
//   4. It is drawn, on screen, upright, and clamped inside the canvas.
//
// ⚠️ MEASUREMENT TRAP: do not time the expiry in a LIVE match. Bots keep kicking, so
// new labels spawn while the old ones are draining and `floaters.length` never reaches
// zero — the first version of this read 5 labels left after a full lifetime and looked
// like a leak. Freeze every body first.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };
const innerWidthOf = d => (d.edgeSpan ? d.edgeSpan[2] : '?');

const p = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear();
  localStorage.setItem('magnetball.firstrun','1'); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(() => {
  const M = window.__magnet; const o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  // ⚠️ Frozen: `ctrl:'none'` and no input, so nothing spawns behind the measurement.
  const stage = () => {
    M.sel.popups = 'on'; M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.trapOff = false;
    M.setMatchSeed(4); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    w.players.forEach(q => { q.ctrl='none'; q.kick=false; q.inX=0; q.inY=0; q.vx=0; q.vy=0; });
    w.ball.vx = 0; w.ball.vy = 0;
    M.clearFloaters();
    return w;
  };

  // ---- 1. the label and the stat move TOGETHER ----------------------------
  // Each case drives the real scoring path and then checks BOTH: the stat went up on
  // that player, and a label naming it appeared on that same player.
  const texts = () => M.floaters.map(f => f.text);
  const on = who => M.floaters.filter(f => f.p === who).map(f => f.text);

  {   // GOAL + ASSIST, through creditScorer
    const w = stage();
    const scorer = w.players[0], mate = w.players.find(q => q !== scorer && q.team === scorer.team);
    const g0 = scorer.ms.goals, a0 = mate.ms.assists;
    w.ball.lastKicker = mate; w.ball.lastKickT = w.matchT; w.matchT += 0.5;
    M.noteKick(w, scorer, 8, 0, -1);
    M.scoreGoal(w, 0);
    o.goalStat = scorer.ms.goals - g0;
    o.assistStat = mate.ms.assists - a0;
    o.goalLabel = on(scorer).includes('GOAL!');
    o.assistLabel = on(mate).includes('ASSIST');
    o.goalMatchesStat = o.goalStat === 1 && o.goalLabel;
    o.assistMatchesStat = o.assistStat === 1 && o.assistLabel;
    // ⚠️ ...and on the RIGHT player. A label that fires on everyone would pass a
    // "did ASSIST appear" check and be useless.
    o.assistNotOnScorer = !on(scorer).includes('ASSIST');
  }
  {   // SHOT + KEY PASS, through noteKick
    const w = stage();
    const shooter = w.players[0], feeder = w.players.find(q => q !== shooter && q.team === shooter.team);
    const s0 = shooter.ms.shots, k0 = feeder.ms.passKey;
    w.ball.lastKicker = feeder; w.ball.lastKickT = w.matchT; w.matchT += 0.4;
    M.noteKick(w, shooter, 8, 0, -1);
    o.shotStat = shooter.ms.shots - s0;
    o.keyStat = feeder.ms.passKey - k0;
    o.shotMatchesStat = o.shotStat === 1 && on(shooter).includes('SHOT');
    o.keyMatchesStat = o.keyStat === 1 && on(feeder).includes('KEY PASS');
  }
  {   // SAVE, through the threat model
    const w = stage();
    const keeper = w.players.find(q => q.team === 1);
    keeper.x = 0; keeper.y = -w.field.L/2 * 0.8;
    w.ball.vy = 1;                       // already turned away
    w.threat = { team: 1, dir: -1 };
    const v0 = keeper.ms.saves;
    M.noteKick(w, keeper, 6, 0, 1);
    o.saveStat = keeper.ms.saves - v0;
    o.saveMatchesStat = o.saveStat === 1 && on(keeper).includes('SAVE');
  }
  {   // ⚠️ TOUCHES must NOT produce one. It is the stat every player always has, so a
      // label on every touch is a permanent smear of text that says nothing — the same
      // reason it is kept off the result screen.
    const w = stage();
    const q = w.players[0];
    const t0 = q.ms.touches;
    M.noteKick(w, q, 1.0, 0, 1);         // gentle, backwards: a touch and nothing else
    o.touchStat = q.ms.touches - t0;
    o.touchIsSilent = o.touchStat === 1 && texts().length === 0;
    o.touchTexts = texts();
  }

  // ---- 2. it ages in the STEP loop, not in a draw -------------------------
  {
    const w = stage();
    M.addFloater(w.players[0], 'SAVE', '#4ad9ff');
    const t0 = M.floaters[0].t;
    for (let i = 0; i < 10; i++) M.render();
    o.drawDidNotAge = M.floaters[0].t === t0;
    let n = 0; while (M.floaters.length && n < 600){ M.advanceFloaters(); n++; }
    o.stepsToExpire = n;
    o.expectedSteps = Math.ceil(M.FLOAT.life * 60);
    o.expiresOnTime = Math.abs(n - o.expectedSteps) <= 1;
    o.expiresAtAll = M.floaters.length === 0;
  }

  // ---- 3. the cap drops the OLDEST ----------------------------------------
  // ⚠️ Dropping the NEWEST would silently swallow the goal in a scramble, which is the
  // one label you most want to see.
  {
    const w = stage();
    for (let i = 0; i < M.FLOAT.max + 3; i++) M.addFloater(w.players[0], 'L' + i, '#fff');
    o.capped = M.floaters.length === M.FLOAT.max;
    o.oldestWent = M.floaters[0].text === 'L3' && texts().includes('L' + (M.FLOAT.max + 2));
  }

  // ---- 4. the toggle, and no randomness -----------------------------------
  {
    const w = stage();
    M.sel.popups = 'off';
    M.addFloater(w.players[0], 'SAVE', '#4ad9ff');
    o.offSpawnsNothing = M.floaters.length === 0;
    M.sel.popups = 'on';
    o.optionExists = !!document.getElementById('popupPick');
    o.optionTiles = document.querySelectorAll('#popupPick .opt').length;
    o.defaultIsOn = M.defaultSel().popups === 'on';
  }
  // ⚠️ Spawned from inside `step()`, so a `Math.random` in this path breaks the
  // determinism rule. Trapped with a throwing stub across a spell of real play.
  {
    const w = stage();
    w.players.forEach(q => { q.ctrl = 'bot'; });
    const real = Math.random;
    let tripped = false;
    Math.random = () => { tripped = true; return 0.5; };
    try { for (let i = 0; i < 400; i++) M.step(w); } finally { Math.random = real; }
    o.sawFloaters = M.floaters.length >= 0;
    o.noMathRandom = !tripped;
  }

  return o;
});

// ---- 5. it is actually DRAWN, upright, and clamped inside the canvas --------
const drawn = await p.evaluate(() => {
  const M = window.__magnet; const o = {};
  M.sel.popups = 'on'; M.sel.mode = '2v2'; M.sel.lobby = 'off';
  M.setMatchSeed(4); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  w.players.forEach(q => { q.ctrl='none'; q.vx=0; q.vy=0; });
  const cv = document.getElementById('game'), g = cv.getContext('2d');
  const D = Math.min(window.devicePixelRatio || 1, 2.5);
  const shot = () => { M.render(); return g.getImageData(0,0,cv.width,cv.height).data; };
  // A body in the middle, nothing on it — then the same frame with a label.
  const me = w.players[0];
  me.x = 0; me.y = 0;
  M.clearFloaters();
  // ⚠️ SHAKE ZEROED FIRST, and the control below is what found this. `shake` jitters the
  // whole pitch by `Math.random()` on EVERY render, by design — so with any shake left
  // over, two identical frames differ by ~19,000 pixels and a before/after diff measures
  // the wobble rather than the label. The earlier block in this suite plays 400 steps
  // with bots and leaves shake high; `decayJuice` only runs in the step loop, which a
  // render-only block never reaches, so it never drains on its own here.
  M.shake = 0;
  // ⚠️ WARM-UP RENDER, DISCARDED. The first `render()` after `startMatch` builds cached
  // things — swatches, the dither ramp, a theme's baked nebula — so a before/after pair
  // taken across it differs by thousands of pixels that have nothing to do with the
  // label. The first version of this block read 19,339 changed pixels for one small
  // word and still passed, which is a measurement that would have accepted almost
  // anything. Two identical renders taken after the warm-up differ by exactly 0, and a
  // label is ~260 — that gap is what makes the check mean something.
  shot();
  const before = shot();
  o.controlDiff = (() => {
    const a = shot();
    let n = 0;
    for (let i = 0; i < before.length; i += 4)
      if (Math.abs(before[i]-a[i]) + Math.abs(before[i+1]-a[i+1]) + Math.abs(before[i+2]-a[i+2]) > 24) n++;
    return n;
  })();
  M.addFloater(me, 'ASSIST', '#5bd97a');
  const after = shot();
  let diff = 0;
  for (let i = 0; i < before.length; i += 4)
    if (Math.abs(before[i]-after[i]) + Math.abs(before[i+1]-after[i+1]) + Math.abs(before[i+2]-after[i+2]) > 24) diff++;
  o.pixelsDrawn = diff;
  o.isDrawn = diff > 40;
  o.renderIsStable = o.controlDiff === 0;
  // ⚠️ ABOVE the disc, not on it — a label over the body hides the thing it is about.
  // Measured as the topmost changed row against the player's own screen y.
  let top = 1e9;
  for (let y = 0; y < cv.height; y++)
    for (let x = 0; x < cv.width; x++){
      const i = (y*cv.width + x)*4;
      if (Math.abs(before[i]-after[i]) + Math.abs(before[i+1]-after[i+1]) + Math.abs(before[i+2]-after[i+2]) > 24){ top = y; y = cv.height; break; }
    }
  o.topRow = top;
  o.playerRow = Math.round(M.wy(me.y) * D);
  o.sitsAbove = top < o.playerRow;

  // ⚠️ CLAMPED. A body at the touchline — or stepped past it — must not lose its last
  // letters off the edge, which is exactly when you want to read them.
  // ⚠️ The baseline is taken with the player ALREADY at the edge. Diffing against the
  // earlier centre-pitch frame measured the DISC MOVING across the pitch as well as the
  // label — a 200px span dominated by the body — and the sabotage that removed the
  // clamping passed straight through it. Only the label may differ between these two.
  // ⚠️ Placed so the label GENUINELY would run off. `W/2 + 30` is not far enough — the
  // camera fits the whole pitch with padding, so a body just past the touchline is still
  // comfortably on screen and an unclamped label lands inside the canvas anyway. That
  // version passed the no-clamping sabotage. `wx` is affine, so invert it: solve for the
  // world x whose screen x is past the right edge.
  const x0 = M.wx(0), x1 = M.wx(100);
  const worldPerPx = 100 / (x1 - x0);
  me.x = (innerWidth + 6 - x0) * worldPerPx; me.y = 0;
  o.edgeScreenX = Math.round(M.wx(me.x));
  o.edgeIsOffScreen = o.edgeScreenX > innerWidth;
  M.clearFloaters();
  const edgeBase = shot();
  M.addFloater(me, 'CLEARANCE', '#5bd97a');
  const edge = shot();
  let minX = 1e9, maxX = -1;
  for (let y = 0; y < cv.height; y++)
    for (let x = 0; x < cv.width; x++){
      const i = (y*cv.width + x)*4;
      if (Math.abs(edgeBase[i]-edge[i]) + Math.abs(edgeBase[i+1]-edge[i+1]) + Math.abs(edgeBase[i+2]-edge[i+2]) > 24){
        if (x < minX) minX = x; if (x > maxX) maxX = x;
      }
    }
  o.edgeSpan = [minX, maxX, cv.width];
  // A label that runs off the edge is clipped by the canvas, so its ink reaches the
  // last column. Requiring a margin is what separates "fits" from "was cut off".
  o.stayedOnScreen = maxX >= 0 && maxX < cv.width - 2 && minX > 0;
  o.edgeLabelWidth = maxX - minX;
  M.clearFloaters();
  return o;
});

ok('a goal moves the stat AND puts a label on the scorer', r.goalMatchesStat,
   `goals +${r.goalStat}, label ${r.goalLabel}`);
ok('...and an assist on the team-mate', r.assistMatchesStat,
   `assists +${r.assistStat}, label ${r.assistLabel}`);
ok('...and not on the scorer', r.assistNotOnScorer, 'a label that fires on everyone is useless');
ok('a shot moves the stat and labels the shooter', r.shotMatchesStat, `shots +${r.shotStat}`);
ok('...and the key pass labels the feeder', r.keyMatchesStat, `key passes +${r.keyStat}`);
ok('a save moves the stat and labels the keeper', r.saveMatchesStat, `saves +${r.saveStat}`);
ok('a plain TOUCH produces no label at all', r.touchIsSilent,
   `touches +${r.touchStat}, labels ${JSON.stringify(r.touchTexts)} — everybody has touches, so a label on each is a smear`);
ok('a DRAW does not age a label', r.drawDidNotAge,
   'the trails rule: a draw-aged label lives a third as long on a 144Hz screen');
ok('...and a step does', r.expiresAtAll);
ok('...on time', r.expiresOnTime, `${r.stepsToExpire} steps against FLOAT.life = ${r.expectedSteps}`);
ok('the cap holds', r.capped);
ok('...and drops the OLDEST', r.oldestWent, 'dropping the newest swallows the goal in a scramble');
ok('the toggle exists with both options', r.optionExists && r.optionTiles === 2, String(r.optionTiles));
ok('...defaults to on', r.defaultIsOn);
ok('...and off spawns nothing', r.offSpawnsNothing);
ok('no Math.random on the spawn path', r.noMathRandom,
   'labels are spawned from inside step(), so this breaks determinism outright');
ok('two identical renders differ by nothing', drawn.renderIsStable,
   `${drawn.controlDiff} pixels changed between two identical frames — the label diff below is measuring that too`);
ok('a label is actually drawn', drawn.isDrawn, `${drawn.pixelsDrawn} pixels changed`);
ok('...above the player, not over them', drawn.sitsAbove,
   `label top row ${drawn.topRow}, player at ${drawn.playerRow}`);
ok('the fixture put the body off the right edge', drawn.edgeIsOffScreen,
   `body drew at screen x ${drawn.edgeScreenX}, canvas ${innerWidthOf(drawn)} — not far enough out to test the clamp`);
ok('...and the label is clamped fully inside the canvas', drawn.stayedOnScreen,
   `spanned x ${JSON.stringify(drawn.edgeSpan)}, width ${drawn.edgeLabelWidth}`);
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify({ ...r, ...drawn }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL floaters\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS floaters');
