// SPRINT — a stamina ring you spend and have to earn back.
//
// ⚠️ SPRINTING IS HOLDING KICK. It first fired off the stick being at FULL TILT, and
// that was wrong for a reason worth keeping: a keyboard and a D-pad have no half-way, so
// they were sprinting the entire match and never chose anything. KICK is a thing you
// press on purpose, on every input the game has — and it composes with what KICK already
// does rather than fighting it, since holding traps and winds up and releasing fires.
// ⚠️ Which means KICK_SLOW has to be OFF while Sprint is on, or the two features cancel:
// one says "holding kick makes you fast", the other "holding kick makes you slow".
//
// ⚠️ SPENT IS LATCHED, and without that the feature does not exist. "Slow while the ring
// is not full", read literally, slows you on the second frame of the first run — so the
// checks below measure that a sprint really does last `sprintSecs()` at FULL speed and
// only then drops to the tired multiplier.
//
// ⚠️ AND IT IS OFF BY DEFAULT, because it changes how every body on the pitch moves.
// The determinism check is what proves the default costs nothing.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };
const o0 = v => (v == null ? '?' : String(v));
const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|ERR_TUNNEL/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // ⚠️ **ON BY DEFAULT**, and it shipped off. The report was "holding kick does not
  // deplete stamina, it just makes me move really slow" — which is precisely the off
  // state: `KICK_SLOW` takes 55% of your acceleration with nothing on screen saying why,
  // while the mechanic KICK is wired to sits behind a switch nothing implies exists.
  o.defaultOn = M.defaultSel().sprint === 'on';

  // ---- 1. off is genuinely off ------------------------------------------------
  M.sel.sprint = 'off';
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(7); M.startMatch();
  {
    const w = M.world; w.state = 'play'; w.stateT = 2;
    const me = w.players[0];
    // ⚠️ Driven through `pads.p1`, never by writing `p.inX`/`p.kick` — the pad is read
    // every step and a directly-set flag is overwritten before `integrate` ever sees it.
    // This is the trap CLAUDE.md records, and it cost this suite its first run.
    M.pads.p1.dx = 1; M.pads.p1.dy = 0; M.pads.p1.kick = true;
    for (let i = 0; i < 600; i++) M.step(w);
    M.pads.p1.dx = 0; M.pads.p1.kick = false;
    o.offKeepsFullStamina = me.stam === 1 && !me.spent;
  }

  // ---- 2. a run at full tilt drains, and lasts as long as the dial says --------
  M.sel.sprint = 'on';
  M.sel.feel.sprintSecs = 200;      // 2.00s, stored in hundredths
  M.sel.feel.sprintRefill = 400;    // 4.00s
  M.sel.feel.sprintSlow = 50;       // half speed when spent
  o.secs = M.sprintSecs(); o.refill = M.sprintRefill(); o.slow = M.sprintSlow();

  M.setMatchSeed(7); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = w.players[0];
  me.x = 0; me.y = 0; me.vx = me.vy = 0; me.stam = 1; me.spent = false;
  let emptiedAt = -1;
  const speeds = [];
  M.pads.p1.dx = 1; M.pads.p1.dy = 0; M.pads.p1.kick = true;   // running, KICK held
  for (let i = 0; i < 600; i++){
    // ⚠️ Held in the MIDDLE of the pitch, velocity untouched. Left to run, the body is
    // against the touchline inside two seconds and `integrate`'s clamp pins it at zero —
    // so the "after" speed measured 0.008 and the check was reading a wall, not a dial.
    me.x = 0; me.y = 0;
    M.step(w);
    if (emptiedAt < 0 && me.stam <= 0) emptiedAt = i;
    speeds.push(Math.hypot(me.vx, me.vy));
  }
  o.emptiedAt = emptiedAt;
  o.emptiedAtSecs = +(emptiedAt/60).toFixed(2);
  // ⚠️ Measured against the DIAL, not a constant, so retuning the default cannot
  // silently break the claim that the slider is what decides it.
  o.lastsTheDial = Math.abs(emptiedAt/60 - M.sprintSecs()) < 0.2;
  o.spentAfter = me.spent === true;
  // Top speed before it emptied vs after — the tired multiplier, measured.
  const before = Math.max.apply(null, speeds.slice(30, emptiedAt));
  // ⚠️ A WINDOW, not "everything after". KICK is still held, so the moment the ring
  // refills the body is sprinting again — taking the max over the whole tail measured
  // the second sprint and read 0.974 of the first. This window sits well inside the
  // spent stretch: the refill is 4s (240 steps) and this ends at 150.
  const after = Math.max.apply(null, speeds.slice(emptiedAt + 60, emptiedAt + 150));
  o.fullSpeed = +before.toFixed(3);
  o.tiredSpeed = +after.toFixed(3);
  // ⚠️ Against slow/boost, not against slow alone — the sprint is a BOOST now, so the
  // ratio between running spent and running sprinting is the two dials divided.
  o.wantRatio = +(M.sprintSlow()/M.sprintBoost()).toFixed(3);
  o.tiredIsTheDial = Math.abs(after/before - M.sprintSlow()/M.sprintBoost()) < 0.06;
  o.boostIsReal = M.sprintBoost() > 1.05;

  // ---- 3. ...and standing still earns it back ---------------------------------
  let refilledAt = -1;
  // ⚠️ Let go of KICK. The ring refills whenever you are not sprinting — you do not have
  // to stand still, you have to stop asking for it.
  // ⚠️ Emptied by hand first: the loop above kept KICK held after the ring ran out, and
  // a spent ring refills, so by the end of it the thing was most of the way back and the
  // recovery measured half its dial.
  me.stam = 0; me.spent = true;
  M.pads.p1.kick = false; M.pads.p1.dx = 0; M.pads.p1.dy = 0;
  for (let i = 0; i < 1800; i++){
    M.step(w);
    if (refilledAt < 0 && me.stam >= 1) refilledAt = i;
  }
  o.refilledAt = refilledAt;
  o.refilledAtSecs = +(refilledAt/60).toFixed(2);
  o.refillIsTheDial = refilledAt >= 0 && Math.abs(refilledAt/60 - M.sprintRefill()) < 0.3;
  o.rested = me.spent === false;
  // ⚠️ And full speed is BACK. Without this the check above passes on a build that
  // simply never lets you off the tired multiplier again.
  me.vx = me.vy = 0;
  const back = [];
  M.pads.p1.dx = 1; M.pads.p1.kick = true;
  for (let i = 0; i < 60; i++){ M.step(w); back.push(Math.hypot(me.vx, me.vy)); }
  M.pads.p1.kick = false;
  o.speedComesBack = Math.max.apply(null, back) > o.tiredSpeed * 1.3;

  // ---- 4. RUNNING WITHOUT HOLDING KICK IS FREE -------------------------------
  // ⚠️ The whole point of moving the trigger to KICK: getting about the pitch must cost
  // nothing, or the ring is a tax on playing rather than a thing you spend.
  me.stam = 1; me.spent = false;
  M.pads.p1.dx = 1; M.pads.p1.dy = 0; M.pads.p1.kick = false;
  for (let i = 0; i < 600; i++) M.step(w);
  M.pads.p1.dx = 0;
  o.joggingIsFree = me.stam === 1 && !me.spent;
  // ...and recovery is SLOWER than the spend, whatever the sliders say.
  M.sel.feel.sprintRefill = 50;                  // ask for half a second
  o.refillFloored = M.sprintRefill() >= M.sprintSecs();
  M.sel.feel.sprintRefill = 500;

  // ---- 4b. KICK_SLOW IS OFF WHILE SPRINT IS ON --------------------------------
  // ⚠️ Measured as BEHAVIOUR, not as a flag. `KICK_SLOW` drops you to 45% of your accel
  // while KICK is held, so leaving it on alongside a 1.35x sprint means holding KICK
  // makes you SLOWER — the two features cancelling each other out, which is exactly what
  // "sprint is not implemented correctly" felt like. So: on a fresh ring, holding KICK
  // has to be faster than not holding it.
  const topSpeed = (kick) => {
    me.stam = 1; me.spent = false; me.vx = me.vy = 0;
    M.pads.p1.dx = 1; M.pads.p1.dy = 0; M.pads.p1.kick = kick;
    let best = 0;
    for (let i = 0; i < 90; i++){ me.x = 0; me.y = 0; M.step(w); best = Math.max(best, Math.hypot(me.vx, me.vy)); }
    M.pads.p1.kick = false; M.pads.p1.dx = 0;
    return best;
  };
  o.heldSpeed = +topSpeed(true).toFixed(3);
  o.looseSpeed = +topSpeed(false).toFixed(3);
  o.kickDoesNotBrake = o.heldSpeed > o.looseSpeed * 1.1;

  // ---- 5. BOTS DO NOT SPRINT, and that reverses an earlier call ---------------
  // ⚠️ The rule used to be that they carried the same ring, because "a tired human playing
  // a side that never gets tired is a handicap". Measured, that argument was pointing at
  // something that was not happening: bots spent 0.0% of ticks locked out and the ring
  // never fell below 0.62, because a bot holds KICK to TRAP rather than to run. What they
  // actually got was the 1.35x boost with none of the cost — and it COMPRESSED THE
  // DIFFICULTY LADDER, the one guarantee the AI exists to keep. Over 36 duels a rung, goal
  // difference for the stronger side: rookie<normal +39 -> +14, normal<hard +19 -> 0.
  M.setMatchSeed(11); M.sel.mode = '4v4'; M.startMatch();
  {
    const w2 = M.world; w2.state = 'play'; w2.stateT = 2;
    let lowest = 1;
    for (let i = 0; i < 1800; i++){
      M.step(w2);
      for (const q of w2.players) if (q.ctrl === 'bot' && q.stam != null) lowest = Math.min(lowest, q.stam);
    }
    const bots = w2.players.filter(q => q.ctrl === 'bot');
    o.lowestBotRing = +lowest.toFixed(3);
    o.botsNeverTire = lowest > 0.999 && bots.every(q => !q.sprinting && !q.spent);
    // ⚠️ And the predicate is read off `ctrl`, so a body somebody drops into mid-match gets
    // the ring and a bot taking a seat back loses it. Checked directly, because "bots do
    // not sprint" written as a check on the roster at kickoff would miss that entirely.
    const one = bots[0];
    o.botHasNoRing = M.sprintsFor(one) === false;
    const was = one.ctrl; one.ctrl = 'gamepad';
    o.seatDecidesIt = M.sprintsFor(one) === true;
    one.ctrl = was;
  }
  M.sel.sprint = 'off'; M.sel.mode = '1v1';
  return o;
});

// ======================================= what a fresh install actually does ==
// ⚠️ THE REPORT, MEASURED. Every other block here sets `sel.sprint` by hand, so all of
// them passed on the build that shipped the wrong default — the complaint was never that
// the mechanic was broken, it was that nobody got it. This one clears storage, reloads
// the page and touches no setting at all.
const dflt = await (async () => {
  const q = await b.newPage({ viewport: { width: 900, height: 900 } });
  await q.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);
  const out = await q.evaluate(() => {
    const M = window.__magnet, o = {};
    const top = (kick, sprint) => {
      if (sprint != null) M.sel.sprint = sprint;
      M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(11); M.startMatch();
      const w = M.world; w.state = 'play'; w.stateT = 2;
      const me = w.players.find(x => x.ctrl === 'human1') || w.players[0];
      // ⚠️ SETTLED speed, and two traps had to be walked round to get one. Taking the
      // MAXIMUM over the run catches the shove from the opposing bot running into you and
      // read 3.44 for a build whose steady state is 1.71 — the whole gap being measured.
      // Averaging the TAIL instead then read 0, because 90 steps at full pelt puts the
      // body into `integrate`'s boundary clamp and it is pressed against a wall.
      // So: the body is held at the centre every step and everything else is parked at the
      // far end. Only its VELOCITY is being measured, and position does not feed accel.
      let sum = 0, n = 0;
      for (let i = 0; i < 90; i++){
        M.pads.p1.dx = 1; M.pads.p1.dy = 0; M.pads.p1.kick = kick;
        w.ball.x = 9000; w.ball.y = 9000; w.ball.vx = 0; w.ball.vy = 0;   // never near the ball
        me.x = 0; me.y = 0;                                              // never near a wall
        for (const q of w.players) if (q !== me){ q.x = 0; q.y = 9000; }  // never near anyone
        M.step(w);
        if (i >= 40){ sum += Math.hypot(me.vx, me.vy); n++; }
      }
      return { v: +(sum / Math.max(1, n)).toFixed(2), stam: me.stam == null ? null : +me.stam.toFixed(2) };
    };
    const held = top(true);            // untouched settings
    o.heldSpeed = held.v; o.stamAfter = held.stam;
    o.looseSpeed = top(false).v;
    o.wasSpeed = top(true, 'off').v;   // what the shipped default did
    o.outOfTheBox = held.stam < 0.9 && held.v > o.looseSpeed * 1.1 && o.wasSpeed < o.looseSpeed * 0.7;
    return o;
  });
  await q.close();
  return out;
})();

// ================================= a bot-only match does not know Sprint exists ==
// ⚠️ THE LADDER IS WHAT THIS PROTECTS. `KICK_SLOW` is lifted for a sprinter — with Sprint
// on, holding KICK IS the sprint — and it was lifted on `sprintOn()`, a GLOBAL answer, so
// every bot got the exemption while having no ring: a straight buff, and rookie-vs-normal
// still fell from +39 to +23 with the ring already taken off them. `sprintsFor(p)` is one
// predicate both places read. Hashed over 900 steps of an all-bot match.
const botw = await p.evaluate(() => {
  const M = window.__magnet;
  const run = () => {
    M.sel.mode = '4v4'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
    M.setMatchSeed(77); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (const q of w.players) q.ctrl = 'bot';        // nobody here has a ring either way
    for (let i = 0; i < 900; i++) M.step(w);
    return w.players.map(q => `${q.x.toFixed(6)},${q.y.toFixed(6)}`).join('|') +
           `#${w.ball.x.toFixed(6)},${w.ball.y.toFixed(6)}#${w.score.join('-')}`;
  };
  M.sel.sprint = 'off'; const off = run();
  M.sel.sprint = 'on';  const on  = run();
  M.sel.sprint = 'off';
  return { same: off === on, on };
});

// ============================================ off changes NOTHING at all ==
// ⚠️ With it OFF the world must be bit identical to a build that never had it. That was
// written when off was the default; now that on is, it is the escape hatch that has to
// hold — somebody who switches Sprint off is asking for the pre-Sprint game, and this is
// what says they get it. Hashed over 900 steps.
// ⚠️ It sets `sel.sprint` explicitly at every step of the comparison and never leans on
// the default, which is why flipping that default did not touch this block.
const det = await p.evaluate(() => {
  const M = window.__magnet;
  // ⚠️ `hold` drives the HUMAN seat's KICK, and it has to, because that is now the only
  // thing Sprint changes: bots do not sprint, so an idle match is identical either way.
  // The first version of this block compared two idle matches and asserted they DIFFERED
  // — true when bots carried the ring, and quietly false the moment they stopped.
  const run = (hold) => {
    M.sel.mode = '3v3'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
    M.setMatchSeed(23); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (let i = 0; i < 900; i++){
      M.pads.p1.dx = 1; M.pads.p1.dy = 0; M.pads.p1.kick = !!hold;
      M.step(w);
    }
    M.pads.p1.dx = 0; M.pads.p1.kick = false;
    return w.players.map(q => `${q.x.toFixed(6)},${q.y.toFixed(6)}`).join('|') +
           `#${w.ball.x.toFixed(6)},${w.ball.y.toFixed(6)}#${w.score.join('-')}`;
  };
  M.sel.sprint = 'off'; const a = run(false);
  M.sel.sprint = 'off'; const b2 = run(false);
  M.sel.sprint = 'on';  const idleOn = run(false);
  M.sel.sprint = 'off'; const heldOff = run(true);
  M.sel.sprint = 'on';  const heldOn = run(true);
  M.sel.sprint = 'off';
  return { stable: a === b2, idleSame: a === idleOn, onDiffers: heldOff !== heldOn,
           sample: a.slice(0, 60) };
});

// =========================== TWO RINGS, AND YOU CAN SEE BOTH OF THEM ==
// ⚠️ Reported as "make sure you can see stamina and kick circles", and the geometry says
// why you could not: the stamina clock sits at 1.30r and the wind-up ring at 1.42r, which
// on a phone is **1.2 PIXELS** between strokes 1.6px and up to 2.9px wide. They overlapped
// and the wind-up ring, drawn second, painted straight over the stamina arc — one fat gold
// band and no stamina at all. It only became visible when Sprint shipped ON by default.
// ⚠️ Measured by SCANNING OUTWARD along a ray and counting separate inked bands, which is
// the claim itself: two rings you can tell apart is two runs of ink with pitch between
// them. A build where they merge reads as one run however wide it is.
// ⚠️ The ray goes straight UP, because the stamina arc is drawn clockwise from twelve — at
// any other angle a part-drained ring may legitimately have no arc there, and the check
// would pass on a build that draws no stamina at all.
// ⚠️ Grass on purpose, and pinned: it is the DEFAULT palette and the one where both rings
// were hardest to find (green `TH.good` on green mown stripes is 1.29:1, gold on green is
// 2.09:1). A suite that samples pixels has to say which palette it is sampling.
const bands = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.applyTheme('grass');
  M.sel.sprint = 'on'; M.sel.mode = '1v1'; M.sel.lobby = 'off';
  M.setMatchSeed(7); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = w.players.find(q => q.ctrl === 'human1') || w.players[0];
  me.x = 0; me.y = 0; me.vx = me.vy = 0;
  w.ball.x = 9000; w.ball.y = 9000;
  for (const q of w.players) if (q !== me){ q.x = 0; q.y = 9000; }
  // Hold KICK for a second: the wind-up ring is up and the stamina ring is part drained.
  for (let i = 0; i < 70; i++){
    M.pads.p1.dx = 0; M.pads.p1.dy = 0; M.pads.p1.kick = true;
    me.x = 0; me.y = 0; w.ball.x = 9000; w.ball.y = 9000;
    M.step(w);
  }
  M.pads.p1.kick = false;
  M.renderAlpha = 1; M.render();
  o.stam = +me.stam.toFixed(2); o.charge = +(me.chargeT || 0).toFixed(2);
  const cv = document.getElementById('game'), c = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const cx = M.wx(me.x), cy = M.wy(me.y);
  const r = me.r * M.cam.s * M.cam.body;
  // Plain pitch a long way out along the same ray, as the "this is court" reference.
  const at = (rad) => { const px = Math.round(cx * dpr), py = Math.round((cy - rad) * dpr);
                        const d = c.getImageData(px, py, 1, 1).data; return [d[0], d[1], d[2]]; };
  const court = at(r * 6);
  const far = (q) => Math.abs(q[0]-court[0]) + Math.abs(q[1]-court[1]) + Math.abs(q[2]-court[2]);
  // Scan from just outside the disc's own rim out to well past the wind-up ring.
  const runs = []; let cur = null;
  for (let rad = r * 1.20; rad <= r * 2.6; rad += 0.25){
    const inked = far(at(rad)) > 24;
    if (inked){ if (!cur){ cur = { from: rad, to: rad, peak: 0, col: null }; runs.push(cur); }
                cur.to = rad;
                const q = at(rad), d = far(q);
                if (d > cur.peak){ cur.peak = d; cur.col = q; } }
    else cur = null;
  }
  o.runs = runs.length;
  o.bandSpans = runs.map(x => [+x.from.toFixed(1), +x.to.toFixed(1)]);
  // ⚠️ **NOT "there are two runs of ink".** The first version of this asserted exactly
  // that, found two, and PASSED on a build with the rings back on top of each other —
  // because one of the two it had found was the disc's own rim, which sits a couple of
  // pixels further out than the scan started. The claim has to name the two rings.
  const L = M.ringLayout(me, r);
  o.layout = { stamR:+L.stamR.toFixed(1), stamW:+L.stamW.toFixed(1),
               kickR:+L.kickR.toFixed(1), kickW:+L.kickW.toFixed(1), gap:+L.gap.toFixed(1),
               stamOuter:+L.stamOuter.toFixed(1), kickInner:+L.kickInner.toFixed(1) };
  // ⚠️ Measured on the BANDS — stroke plus casing — not the stroke centre lines. Clearing
  // the strokes alone still left the two casings overlapping, and the first fix widened
  // `gap` instead, which pushed the wind-up ring's own casing further in and made the
  // reading WORSE: 110 of ink in what was supposed to be daylight.
  o.clearance = +(L.kickInner - L.stamOuter).toFixed(2);
  o.reallyClear = o.clearance >= L.gap * 0.9;
  // ⚠️ ...and the PICTURE agrees: ink where the layout puts each ring, plain pitch in the
  // gap between them. Without this the layout could say anything and the draw ignore it.
  const mid = (L.stamOuter + L.kickInner) / 2;
  // ⚠️ The PEAK across the band, not the pixel at its centre. The centre of the stamina
  // arc is the arc's own colour — which on grass is green on green, 66 away from the
  // court — and the whole point of the casing is that it sits at the EDGES. Sampling the
  // middle measures the thing that was already invisible and reports it as still
  // invisible, which is how the first run of this failed a build that works.
  const peak = (rad, half) => { let m = 0;
    for (let d = -half; d <= half; d += 0.25) m = Math.max(m, far(at(rad + d)));
    return Math.round(m); };
  o.inkAtStam = peak(L.stamR, L.stamW/2 + M.RING.case);
  o.inkAtKick = peak(L.kickR, L.kickW/2 + M.RING.case);
  o.inkInGap  = far(at(mid));
  // ⚠️ Thresholds picked off BOTH builds, not off the passing one: with the casing removed
  // the stamina band reads 87 and the gap fills to 65, and with the rings overlapping the
  // gap reads 78 — so 110 and 40 sit clear of every sabotage and clear of the real build's
  // 167 and 8.
  o.drawnWhereItSays = o.inkAtStam > 110 && o.inkAtKick > 110 && o.inkInGap < 40;
  // ⚠️ ...and they are DIFFERENT MARKS. Sampled at the two radii the layout names, never
  // at whatever the scan happened to find.
  const a = at(L.stamR), b2 = at(L.kickR);   // the marks' own colours, band centres
  o.innerCol = a; o.outerCol = b2;
  o.ringsDiffer = Math.abs(a[0]-b2[0]) + Math.abs(a[1]-b2[1]) + Math.abs(a[2]-b2[2]) > 60;
  return o;
});

ok('the two rings clear each other', bands.reallyClear,
   `${bands.clearance}px of daylight between them against a wanted gap of ${bands.layout.gap} — ${JSON.stringify(bands.layout)}; they sat 0.12r apart, which on a phone is 1.2 pixels between strokes 1.6 and 2.9 wide, and the wind-up ring is drawn second`);
ok('...and the picture agrees with the layout', bands.drawnWhereItSays,
   `ink ${bands.inkAtStam} at the stamina radius, ${bands.inkAtKick} at the wind-up radius, ${bands.inkInGap} in the gap (bands found: ${JSON.stringify(bands.bandSpans)})`);
ok('...and they are different marks, not one ring split by an antialiased pixel', bands.ringsDiffer,
   `inner ${JSON.stringify(bands.innerCol)} against outer ${JSON.stringify(bands.outerCol)}`);
ok('...and both stand off the pitch on GRASS, the palette they hid on',
   bands.inkAtStam > 110 && bands.inkAtKick > 110,
   `${bands.inkAtStam} / ${bands.inkAtKick} against the court — green on green is 1.29:1 and gold on green 2.09:1, which is what the casing is for`);

// ==================================================== the ring, in pixels ==
// ⚠️ Measured as RENDERED INK, never from the flag — a "stamina exists" check passes on
// a build that draws nothing at all.
// ⚠️ And measured as a DIFFERENCE against the same body drawn rested, per probe angle.
// The disc already has a guide ring and a rim within a few pixels of this radius, so an
// absolute ink count reads 65 of 120 with no stamina ring drawn at all — which is the
// trap this file exists to avoid. The arc is whatever is inked when draining and is not
// inked when rested; a full circle would show up as no difference.
// ⚠️ THE PALETTE IS PINNED, because a suite that samples pixels has to say which one it
// is sampling — grass puts mown stripes exactly where this is looking.
const ring = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.applyTheme('neon');
  M.sel.sprint = 'on';
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(7); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = w.players[0];
  const cv = document.getElementById('game'), c = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const STEPA = 3, N = 360/STEPA;
  const scan = () => {
    M.computeCam(); M.render();
    const s = M.cam.s, rr = me.r * s * M.cam.body * M.SPRINT.ring;
    const cx = M.wx(me.x), cy = M.wy(me.y);
    const on = [];
    for (let k = 0; k < N; k++){
      const t = (k*STEPA - 90) * Math.PI/180;
      const px = Math.round((cx + Math.cos(t)*rr) * dpr), py = Math.round((cy + Math.sin(t)*rr) * dpr);
      if (px < 0 || py < 0 || px >= cv.width || py >= cv.height){ on.push(false); continue; }
      const d = c.getImageData(px, py, 1, 1).data;
      on.push(d[0] + d[1] + d[2] > 200);
    }
    return on;
  };
  me.x = 0; me.y = 0; me.vx = me.vy = 0;
  me.stam = 1; me.spent = false;  const rest = scan();
  me.stam = 0.5; me.spent = false; const half = scan();
  me.stam = 0.02; me.spent = true; const low  = scan();
  const extra = a => a.map((v, k) => v && !rest[k]);
  const eh = extra(half), el = extra(low);
  const count = a => a.reduce((n, v) => n + (v ? 1 : 0), 0);
  o.restInk = count(rest); o.halfExtra = count(eh); o.lowExtra = count(el);
  o.probes = N;
  // ⚠️ Drawn only when there is something to say: rested adds nothing over the disc.
  o.hiddenWhenRested = count(extra(rest)) === 0;
  o.shownWhenDrained = o.halfExtra > N*0.20;
  // ...an ARC, not a full circle: half stamina must leave a real gap.
  o.isAnArcNotACircle = o.halfExtra < N*0.72;
  // ...and it SHRINKS as the ring drains, which is the whole of "progress bar".
  o.shrinksAsItDrains = o.lowExtra < o.halfExtra;
  // ⚠️ ...starting at TWELVE O'CLOCK and sweeping like a clock hand. Index 0 is
  // straight up, so the inked run has to begin there.
  o.startsAtTwelve = eh[0] === true && eh[1] === true;
  M.sel.sprint = 'off';
  return o;
});
// ============================ drag-only sliders, and swipe-down to pause ==
// ⚠️ A native range input JUMPS to wherever you press it. On a phone that is a trap: the
// sliders are wide, they sit in a column you scroll with your thumb, and a graze anywhere
// along one silently rewrites a value you had tuned. Both halves are measured — a press
// on the TRACK must do nothing, and a press on the HANDLE must still start a drag —
// because "presses are refused" is also true of a slider nobody can move at all.
const drag = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.toMenu(); M.buildSettings(); M.openSection('feel'); M.showSubTab('feel', 'player');
  const el = document.querySelector('.subpane[data-pane="player"] input.slider');
  o.found = !!el;
  if (!el) return o;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  const min = +el.min || 0, max = +el.max, span = max - min;
  const frac = ((+el.value) - min) / span;
  const pad = M.SLIDER_GRAB/2;
  const handleX = r.left + pad + frac * (r.width - pad*2);
  const fire = (x, kind) => {
    const ev = new PointerEvent('pointerdown', { clientX: x, clientY: r.top + r.height/2,
      pointerType: kind, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  // Far end of the track, on a touch: refused.
  const far = handleX > r.left + r.width/2 ? r.left + 6 : r.right - 6;
  o.trackRefusedOnTouch = fire(far, 'touch');
  // On the handle: allowed, so the native drag still runs.
  o.handleAllowedOnTouch = !fire(handleX, 'touch');
  // ⚠️ A MOUSE is exempt: a click on the track is precise and deliberate, it is the
  // long-standing desktop behaviour, and there is no scrolling thumb to graze.
  o.mouseStillJumps = !fire(far, 'mouse');
  o.grabPx = M.SLIDER_GRAB;
  return o;
});

// ⚠️ SWIPE DOWN FROM THE TOP EDGE PAUSES, and it has to be a GESTURE rather than a
// region: `zoneForTouch` splits the WHOLE screen into a move half and a kick half, so
// there is nowhere to put a "pause here" area that is not already a control.
// ⚠️ On a PHONE-sized page with touch. `swipeStart` is gated on `isTouchLayout()`, and
// this file's main page is 1000x900 — where the gesture correctly does nothing, so the
// whole block passed for the wrong reason on its first run.
const ph = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
ph.on('pageerror', e => errors.push(e.message));
await ph.addInitScript(() => { window.__MAGNETDEBUG = true; });
await ph.goto('file://' + process.cwd() + '/index.html');
await ph.waitForTimeout(800);
const swipe = await ph.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(5); M.startMatch();
  const S = M.SWIPEPAUSE;
  const pull = (x0, y0, dx, dy) => {
    M.onDown(77, x0, y0); M.onMove(77, x0 + dx, y0 + dy); M.onUp(77);
  };
  o.edge = S.edge; o.dist = S.dist;
  // A pull down from the top edge pauses.
  pull(200, 10, 0, S.dist + 30);
  o.pausedAfterPull = M.paused === true;
  M.togglePause(false);
  // ...a pull that starts BELOW the strip does not — that is somebody steering.
  pull(200, S.edge + 60, 0, S.dist + 30);
  o.midScreenIsNotAPause = M.paused === false;
  // ...nor does a short one, nor a sideways one along the top.
  pull(200, 10, 0, S.dist - 30);
  o.shortIsNotAPause = M.paused === false;
  pull(200, 10, S.dist + 40, 8);
  o.sidewaysIsNotAPause = M.paused === false;
  // ⚠️ ...and a touch that starts in the strip drives NO pad, which is what makes the
  // gesture safe: it cannot half-steer you on the way to being recognised.
  M.pads.p1.dx = 0; M.pads.p1.dy = 0;
  M.onDown(78, 200, 10); M.onMove(78, 260, 30);
  o.stripDrivesNothing = M.pads.p1.dx === 0 && M.pads.p1.dy === 0;
  M.onUp(78);
  return o;
});
await ph.close();
await p.close();

// -------------------------------------------------------------------- report --
ok('sprint is ON by default', r.defaultOn,
   'it shipped off, so holding KICK gave you KICK_SLOW and none of the mechanic it is wired to');
ok('...so out of the box, holding KICK spends the ring and runs FASTER', dflt.outOfTheBox,
   `ring went 1 -> ${dflt.stamAfter} and top speed ${dflt.heldSpeed} against ${dflt.looseSpeed} loose` +
   ` — the reported build read ${dflt.wasSpeed} held, which is 45% of loose and no ring at all`);
ok('...and off means the ring never moves', r.offKeepsFullStamina);

ok('a run at full tilt lasts exactly as long as the dial says', r.lastsTheDial,
   `emptied at ${r.emptiedAtSecs}s against a dial of ${r.secs}s`);
ok('...at FULL speed the whole way', r.fullSpeed > r.tiredSpeed,
   `${r.fullSpeed} then ${r.tiredSpeed} — "slow while the ring is not full" read literally slows you on the second frame of the first run, which is not a sprint`);
ok('...then the tired multiplier is the dial', r.tiredIsTheDial,
   `${(r.tiredSpeed/r.fullSpeed).toFixed(3)} against ${r.wantRatio} (tired \u00f7 sprint)`);
ok('...and a sprint really is FASTER than not sprinting', r.boostIsReal,
   'a sprint with no boost is a button that only ever costs you something');
ok('holding KICK no longer BRAKES you while Sprint is on', r.kickDoesNotBrake,
   `${o0(r.heldSpeed)} holding vs ${o0(r.looseSpeed)} loose — KICK_SLOW drops you to 45% of your accel, so left on alongside a 1.35\u00d7 sprint, holding KICK makes you slower and the two features cancel out`);
ok('...and it latches until the ring is FULL again', r.spentAfter);

ok('standing still earns it back on its own dial', r.refillIsTheDial,
   `full again after ${r.refilledAtSecs}s against a dial of ${r.refill}s`);
ok('...and the speed really comes back', r.speedComesBack && r.rested,
   `${r.tiredSpeed} then a peak of the recovered run — without this, "it refills" is true of a build that never lets you off the tired speed`);
ok('running WITHOUT holding kick costs nothing', r.joggingIsFree,
   'getting about the pitch has to be free, or the ring is a tax on playing rather than something you spend');
ok('...and recovery can never be set faster than the spend', r.refillFloored,
   'a ring that refills quicker than it drains is one you never stop holding');

ok('bots do NOT sprint', r.botsNeverTire,
   `lowest bot ring over half a minute of 4v4 was ${r.lowestBotRing} — they used to carry it, ` +
   'and since a bot holds KICK to TRAP rather than to run it never emptied: 0.0% of ticks spent, ' +
   'so what they got was the 1.35x boost with none of the cost');
ok('...and it is the SEAT that decides, not what the body started as', r.botHasNoRing && r.seatDecidesIt,
   'a body somebody drops into mid-match gets the ring; a bot taking a seat back loses it');
ok('...so a bot-only match is bit identical with Sprint on and off', botw.same,
   `${botw.on.slice(0,44)} — the ladder is what this protects: with bots sprinting, normal-vs-hard ` +
   'went from +19 goal difference over 36 duels to exactly 0, which is two tiers nobody can tell apart');

ok('with sprint off the world is unchanged', det.stable, det.sample);
ok('...and with nobody holding KICK it is the same match either way', det.idleSame,
   'bots do not sprint, so an untouched match cannot tell the setting apart — which is exactly what keeps the ladder where it was');
ok('...but hold KICK and it is a different match', det.onDiffers,
   'if switching it on changes nothing for the one seat that has a ring then nothing was wired up');

ok('the ring is not drawn when you are rested', ring.hiddenWhenRested,
   `${ring.restInk} of ${ring.probes} probe angles inked with a full ring — a permanent ring round every body is furniture`);
ok('...is drawn when it is draining', ring.shownWhenDrained,
   `${ring.halfExtra} of ${ring.probes} angles inked over the rested baseline`);
ok('...as an ARC, not a full circle', ring.isAnArcNotACircle,
   `${ring.halfExtra} of ${ring.probes} at half stamina — a progress bar that is always a full ring shows no progress`);
ok('...that SHRINKS as it drains', ring.shrinksAsItDrains,
   `${ring.halfExtra} at half, ${ring.lowExtra} at empty`);
ok('...sweeping from twelve o\'clock', ring.startsAtTwelve,
   'it is a clock, and a clock hand starts at the top');

ok('a slider ignores a touch on its TRACK', drag.found && drag.trackRefusedOnTouch,
   `grab window ${drag.grabPx}px — a range input jumps to wherever you press, and on a phone that rewrites a tuned value from a graze while scrolling`);
ok('...but a touch on its HANDLE still drags', drag.handleAllowedOnTouch,
   '"presses are refused" is also true of a slider nobody can move at all');
ok('...and a mouse still clicks the track', drag.mouseStillJumps,
   'precise, deliberate, the long-standing desktop behaviour, and no scrolling thumb to graze');

ok('a pull down from the top edge pauses', swipe.pausedAfterPull,
   `${swipe.dist}px from inside the top ${swipe.edge}px`);
ok('...a drag lower down does not', swipe.midScreenIsNotAPause, 'that is somebody steering');
ok('...nor a short pull', swipe.shortIsNotAPause);
ok('...nor a sideways one along the top', swipe.sidewaysIsNotAPause,
   'reaching for the fullscreen button is not asking for the menu');
ok('...and a touch in the strip drives no pad at all', swipe.stripDrivesNothing,
   'it must not half-steer you on the way to being recognised');

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ r, det, ring, drag, swipe }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL sprint\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS sprint');
