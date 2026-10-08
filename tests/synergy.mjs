// SYNERGY LINKS — lines between teammates who stand together, and the ball bounces off.
//
// Asked for from a soccer-analysis picture: three players joined by white lines, the
// triangle between them filled with white diagonal streaks. The claims, each of which
// fails differently:
//
//   0. THE SHIPPED GAME IS UNCHANGED. `synergy` defaults to `off` and every check below
//      sets it by hand, so all of them pass on a build that shipped the wrong default —
//      `tests/sprint.mjs`' lesson, asserted FIRST. And OFF is bit-identical: no link is
//      ever computed and no wall ever collided, over a seeded bot match.
//   1. A LINK TAKES TIME TO FORM, AND ONLY BETWEEN TWO SETTLED BODIES. Measured in steps
//      to `live`, against the dial (0.6s → 36 steps, 1.2s → 72), and a body kept moving
//      never forms one.
//   2. THE BALL BOUNCES OFF A LIVE LINK. Measured as a DIFFERENCE against the same shot
//      with the switch off in the same run: with it on the ball comes back, off it goes
//      through. A ball touching a FORMING link goes through too — a dashed line is a
//      promise, not a wall.
//   3. AN OPPONENT ON THE LINE BLOCKS IT, and breaks a live one. Paired with an opponent
//      NEAR the line not blocking, or "blocked" is equally true of a build where nothing
//      ever links.
//   4. MAINLY ACROSS THE PITCH. A pair side by side links at the reach; the same pair
//      strung goal-to-goal at the same distance does not — the ellipse. And the reach
//      dial is the reach: shorten it and the side-by-side pair stops linking.
//   5. THREE MUTUAL LINKS ARE A TRIANGLE, and it is DRAWN: the lines and the streaked
//      fill are measured as a pixel difference against the same frame with the links
//      stood down (`w.links = []`), never an absolute count — the pitch has markings.
//      A forming link is fainter than a live one, on the SAME bare segment — see there.
//   6. THE BOTS DO IT TOO. A seeded all-bot 4v4 at Insane with the links on spends a
//      measured share of play with a live link; the CONTROL is the same seed with the
//      bots' pull zeroed (`BOT.linkPull = 0`), in the same run, and Rookie (whose `coop`
//      is 0) is measured beside it. Paired with the match still producing shots, or a
//      side standing in a line for ever would pass.
//   7. DETERMINISTIC: two runs of one seed with the links on hash identically.
//
// ⚠️ MEASUREMENT TRAP: bodies must be `ctrl:'none'` and RE-PINNED every step where the
// probe needs them still — `integrate` still damps and clamps a parked body, and a bot
// wanders into the lane being measured. `_px/_py` too, or `ix`/`iy` draw them mid-slide.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (c, msg) => { if (!c) fails.push(msg); };

const p = await b.newPage({ viewport:{ width:1280, height:900 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear();
  localStorage.setItem('magnetball.firstrun','1'); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const cv = document.getElementById('game'), c2 = cv.getContext('2d');
  const DPR = Math.max(1, cv.width / cv.clientWidth);
  const STEP = 1/60;

  // ---- 0. the shipped default, and the controls ------------------------------
  o.defaultOff = M.defaultSel().synergy;
  o.defaultReach = M.defaultSel().synReach; o.synReachConst = M.SYN.reach;
  o.defaultForm = M.defaultSel().synForm;   o.synFormConst = M.SYN.formMs;
  M.openSection('feel'); M.showSubTab('feel', 'player');
  o.tiles = document.querySelectorAll('#synergyPick .opt').length;
  const dials = () => [...document.querySelectorAll('#feelSlidersPlayer label')]
    .filter(l => /^Synergy/.test(l.textContent)).map(l => l.nextElementSibling);
  o.dialCount = dials().length;
  o.dialsGreyedOff = dials().every(i => i && i.disabled);
  M.sel.synergy = 'on'; M.buildSettings();
  o.dialsLiveOn = dials().every(i => i && !i.disabled);
  M.sel.synergy = 'off'; M.buildSettings();

  // A frozen 2v2: every body `ctrl:'none'`, re-pinned each step, ball parked far away.
  const stage = () => {
    M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.juice = false; M.sel.adsOn = 'off';
    M.sel.length = '5'; M.sel.field = 'classic'; M.sel.kickoffRule = 'off'; M.sel.boxRule = 'off';
    M.sel.autoReplay = false; M.sel.magnet = 0; M.sel.diff = 'normal';
    M.setMatchSeed(7); M.startMatch({ lobby:false });
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (const q of w.players){ q.ctrl = 'none'; q.vx = 0; q.vy = 0; }
    return w;
  };
  const pin = (w, spots) => { spots.forEach(([x, y], i) => { const q = w.players[i];
    q.x = x; q.y = y; q._px = x; q._py = y; q.vx = 0; q.vy = 0; q.inX = 0; q.inY = 0; q.kick = false; });
    w.ball.x = 0; w.ball.y = -300; w.ball.vx = 0; w.ball.vy = 0; };
  // team 0 is indices 0,1 and team 1 is 2,3 on a 2v2 — read it rather than assume it
  const teamsOf = w => w.players.map(q => q.team);
  const stepPinned = (w, spots, n, each) => { for (let i = 0; i < n; i++){ pin(w, spots); if (each) each(i); M.step(w); } };
  const liveAt = (w, spots, max) => { for (let i = 0; i < max; i++){ pin(w, spots); M.step(w);
    if (w.links && w.links.some(l => l.live)) return i + 1; } return null; };

  // ---- 0b. off is off: no link, no wall, over a seeded bot match --------------------
  {
    M.sel.synergy = 'off';
    M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.length = '5'; M.sel.diff = 'insane'; M.sel.autoReplay = false;
    M.setMatchSeed(11); M.startMatch({ lobby:false });
    const w = M.world; w.state = 'play'; w.stateT = 2; w.players.forEach(q => q.ctrl = 'bot');
    let links = 0, walls = 0;
    for (let i = 0; i < 900; i++){ M.step(w); links += (w.links || []).length; walls += (w.linkWalls || []).length; }
    o.offLinks = links; o.offWalls = walls; o.offSynT = w.synT;
  }

  // ---- 1. it takes time, and only between settled bodies ------------------------------
  const w = stage();
  o.teams = teamsOf(w);
  const A = [[-60, 100], [60, 100], [-200, -300], [200, -300]];   // 0,1 side by side; 2,3 far away AND far apart (400 > reach, or THEY link)
  M.sel.synergy = 'on'; M.sel.synForm = 60;
  o.stepsToLive60 = liveAt(w, A, 200);
  o.linkPair = w.links && w.links[0] ? [w.links[0].i, w.links[0].j] : null;
  o.wallCount = (w.linkWalls || []).length;
  o.wallIsBallOnly = !!(w.linkWalls && w.linkWalls[0] && w.linkWalls[0].ballOnly);
  M.sel.synForm = 120; stepPinned(w, A, 3);           // clock cleared? the pair is still eligible, so the clock just runs on;
  w.synT = null; w.links = [];                        // start it again from nothing to measure the dial
  o.stepsToLive120 = liveAt(w, A, 300);
  M.sel.synForm = 60;
  // a body kept moving never links: give player 1 a run every step
  w.synT = null; w.links = [];
  let liveMoving = false;
  stepPinned(w, A, 120, () => { w.players[1].vx = 2.5; if (w.links.some(l => l.live)) liveMoving = true; });
  o.movingNeverLinks = !liveMoving;
  // a forming link shows progress before it is live
  w.synT = null; w.links = [];
  stepPinned(w, A, 18);
  o.formingT = w.links[0] ? +w.links[0].t.toFixed(2) : null; o.formingLive = !!(w.links[0] && w.links[0].live);

  // ---- 2. the ball bounces off a live link, and not off a forming one ----------------------
  const shoot = (on, formSteps) => {
    M.sel.synergy = on ? 'on' : 'off';
    w.synT = null; w.links = []; w.linkWalls = [];
    stepPinned(w, A, formSteps);
    // ball on the line's own side, driven at it: from y=40 toward y=100
    let minGap = 1e9, endY = null, endVy = null;
    for (let i = 0; i < 40; i++){
      A.forEach(([x, y], k) => { const q = w.players[k]; q.x = x; q.y = y; q.vx = 0; q.vy = 0; });
      if (i === 0){ w.ball.x = 0; w.ball.y = 40; w.ball.vx = 0; w.ball.vy = 4; }
      M.step(w);
      minGap = Math.min(minGap, 100 - w.ball.y);
      endY = w.ball.y; endVy = w.ball.vy;
    }
    return { endY: +endY.toFixed(1), endVy: +endVy.toFixed(2), maxY: +(100 - minGap).toFixed(1) };
  };
  o.shotOn = shoot(true, 60);      // link live (60 steps > 36)
  o.shotOff = shoot(false, 60);    // switch off: no wall
  o.shotForming = shoot(true, 10); // link still forming (10 steps < 36): no wall yet
  o.ballBounces = o.shotOn.maxY < 100 && o.shotOn.endVy < 0 && o.shotOff.maxY > 100 && o.shotForming.maxY > 100;

  // ---- 3. an opponent on the line blocks it; near it does not; and breaks a live one ------
  M.sel.synergy = 'on';
  const onLine = [[-60, 100], [60, 100], [0, 100], [200, -300]];
  const nearLine = [[-60, 100], [60, 100], [0, 140], [200, -300]];
  w.synT = null; w.links = [];
  o.blockedSteps = liveAt(w, onLine, 120);
  w.synT = null; w.links = [];
  o.nearSteps = liveAt(w, nearLine, 120);
  // form it, then walk the opponent onto it
  w.synT = null; w.links = [];
  stepPinned(w, A, 60);
  o.liveBefore = w.links.some(l => l.live);
  stepPinned(w, onLine, 1);
  o.liveAfterOpp = w.links.some(l => l.live); o.linksAfterOpp = w.links.length;

  // ---- 4. mainly across, and the reach dial --------------------------------------------------
  const across = [[-75, 100], [75, 100], [-200, -300], [200, -300]];   // 150 apart, across
  const along  = [[0, 25], [0, 175], [-200, -300], [200, -300]];       // 150 apart, goal to goal
  w.synT = null; w.links = []; M.sel.synReach = 170;
  o.acrossSteps = liveAt(w, across, 120);
  w.synT = null; w.links = [];
  o.alongSteps = liveAt(w, along, 120);
  w.synT = null; w.links = []; M.sel.synReach = 100;
  o.acrossShortReach = liveAt(w, across, 120);
  M.sel.synReach = 170;

  // ---- 5. a triangle, drawn -----------------------------------------------------------------------
  M.sel.mode = '3v3'; M.setMatchSeed(7); M.startMatch({ lobby:false });
  const w3 = M.world; w3.state = 'play'; w3.stateT = 2; w3.players.forEach(q => { q.ctrl = 'none'; });
  o.teams3 = teamsOf(w3);
  // team 0 is the first three on a 3v3 — a triangle 120 across and 60 deep
  const T = [[-60, 100], [60, 100], [0, 160], [0, -300], [-200, -300], [200, -300]];   // the other side 200 apart: no link there
  const stepT = (n) => { for (let i = 0; i < n; i++){ T.forEach(([x, y], k) => { const q = w3.players[k];
    q.x = x; q.y = y; q._px = x; q._py = y; q.vx = 0; q.vy = 0; q.inX = 0; q.inY = 0; });
    w3.ball.x = 0; w3.ball.y = -300; w3.ball.vx = 0; w3.ball.vy = 0; M.step(w3); } };
  stepT(60);
  o.triLinks = w3.links.filter(l => l.live).length; o.tris = (w3.tris || []).length;
  M.juiceReset();
  const snap = () => { M.render(); return c2.getImageData(0, 0, cv.width, cv.height).data; };
  const at = (x, y) => { const [sx, sy] = M.screenPt(M.wx(x), M.wy(y)); return [Math.round(sx*DPR), Math.round(sy*DPR)]; };
  const box = (data, cx, cy, r) => { let s = 0; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++){
    const k = (y*cv.width + x)*4; s += data[k] + data[k+1] + data[k+2]; } return s; };
  const diffIn = (a, bb, cx, cy, r) => { let n = 0; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++){
    const k = (y*cv.width + x)*4; if (Math.abs(a[k]-bb[k]) + Math.abs(a[k+1]-bb[k+1]) + Math.abs(a[k+2]-bb[k+2]) > 40) n++; } return n; };
  const withLinks = snap(), again = snap();
  const keep = { links: w3.links, tris: w3.tris };
  w3.links = []; w3.tris = [];
  const noLinks = snap();
  w3.links = keep.links; w3.tris = keep.tris;
  const [mx, my] = at(0, 100), [tx, ty] = at(0, 120);    // the top edge's midpoint; the zone's inside
  o.edgeInk = diffIn(withLinks, noLinks, mx, my, 6);
  o.zoneInk = diffIn(withLinks, noLinks, tx, ty, 12);
  o.twoDrawsAgree = diffIn(withLinks, again, mx, my, 6) === 0 && diffIn(withLinks, again, tx, ty, 12) === 0;
  // a forming link draws fainter than a live one — the SAME bare segment both ways, with
  // the triangle stood down in both, and summed as how much the pixels moved rather than
  // how many. ⚠️ Compared against the live frame WITH its triangle this was vacuous: the
  // streaks touch the edge box, so the live count was higher for the fill and not for
  // the alpha, and a sabotage drawing a forming link exactly like a live one passed.
  const sumIn = (a, bb, cx, cy, r) => { let n = 0; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++){
    const k = (y*cv.width + x)*4; n += Math.abs(a[k]-bb[k]) + Math.abs(a[k+1]-bb[k+1]) + Math.abs(a[k+2]-bb[k+2]); } return n; };
  w3.links = [{ i:0, j:1, t:1, live:true }]; w3.tris = [];
  const liveOnly = snap();
  w3.links = [{ i:0, j:1, t:0.5, live:false }]; w3.tris = [];
  const forming = snap();
  o.liveSum = sumIn(liveOnly, noLinks, mx, my, 6); o.formingSum = sumIn(forming, noLinks, mx, my, 6);
  w3.links = keep.links; w3.tris = keep.tris;
  // the streak is a difference, not a fill: the zone's ink is a fraction of its box
  o.zoneBox = (2*12+1)*(2*12+1);

  // ---- 6. the bots do it, and the control is the same seed with the pull zeroed -----------------
  const botRun = (diff, hook, seed, mode) => {
    // the control is the SAME seed with the whole hook inert: `coopAt` past the top of
    // the ladder gives every tier `coop` 0, which is exactly what Rookie has
    const was = M.BOT.coopAt; if (!hook) M.BOT.coopAt = 2;
    // there is no 5v5 mode key: a fifth body a side is `MODES['4v4'].per` raised, the
    // profile's trick, and put back after
    const perWas = M.MODES['4v4'].per; if (mode === '5v5') M.MODES['4v4'].per = 5;
    M.sel.mode = '4v4'; M.sel.diff = diff; M.sel.synergy = 'on'; M.sel.lobby = 'off'; M.sel.length = '5';
    M.setMatchSeed(seed); M.startMatch({ lobby:false });
    const ww = M.world; ww.state = 'play'; ww.stateT = 2; ww.players.forEach(q => q.ctrl = 'bot');
    let liveSteps = 0, shots = 0, playSteps = 0, tris = 0;
    for (let i = 0; i < 3600; i++){ M.step(ww); if (ww.state !== 'play') continue; playSteps++;
      if (ww.linkWalls.length) liveSteps++; if (ww.tris.length) tris++; }
    for (const q of ww.players) shots += (q.ms && q.ms.shots) || 0;
    M.BOT.coopAt = was; M.MODES['4v4'].per = perWas;
    return { share: +(liveSteps/Math.max(1, playSteps)).toFixed(3), triShare: +(tris/Math.max(1, playSteps)).toFixed(3), shots, goals: ww.score.slice(), playSteps };
  };
  o.botsInsane = [botRun('insane', true, 21), botRun('insane', true, 22)];
  o.botsNoHook = [botRun('insane', false, 21), botRun('insane', false, 22)];
  // ⚠️ SIX SEEDS, NOT TWO. A triangle in a 60-second 5v5 is a rare event — swept over seeds
  // 21..32 under this block's own settings it formed on **6 of 12** seeds on the build before
  // the goal-refill (`refillStamina`) and **4 of 12** after, with the live-link share flat
  // (0.087 against 0.093) — so two seeds is a coin, and it landed tails the day a goal started
  // refilling the rings and re-dealt every seeded match with a goal in it (seed 21, a 0-0, is
  // bit-identical on both builds). Over 27..32 it reads 2 of 6 before and 3 of 6 after; the
  // claim is still "at some point", pooled over the six.
  o.bots5 = [27, 28, 29, 30, 31, 32].map(s => botRun('insane', true, s, '5v5'));
  o.botsRookie = [botRun('rookie', true, 21), botRun('rookie', true, 22)];

  // ---- 7. deterministic with the links on -------------------------------------------------------------
  const hash = (ww) => { const n = x => (typeof x === 'number' ? x.toFixed(6) : String(x));
    const parts = [ww.state, n(ww.timeLeft), ww.score.join(':')];
    for (const q of ww.players) parts.push(n(q.x), n(q.y), n(q.vx), n(q.vy));
    parts.push(n(ww.ball.x), n(ww.ball.y), n(ww.ball.vx), n(ww.ball.vy), (ww.linkWalls||[]).length);
    let h = 2166136261; const s2 = parts.join('|');
    for (let i = 0; i < s2.length; i++){ h ^= s2.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0).toString(16); };
  const detRun = () => { M.sel.mode = '3v3'; M.sel.diff = 'hard'; M.sel.synergy = 'on'; M.setMatchSeed(31); M.startMatch({ lobby:false });
    const ww = M.world; ww.state = 'play'; ww.stateT = 2; ww.players.forEach(q => q.ctrl = 'bot');
    let walls = 0; for (let i = 0; i < 1200; i++){ M.step(ww); walls += ww.linkWalls.length; } return hash(ww) + ':' + walls; };
  o.det1 = detRun(); o.det2 = detRun();

  M.sel.synergy = 'off'; M.toMenu();
  return o;
});

console.log(JSON.stringify(r, null, 1));
ok(r.defaultOff === 'off', 'synergy ships OFF (it changes how the ball moves) — read ' + r.defaultOff);
ok(r.defaultReach === r.synReachConst && r.defaultForm === r.synFormConst, 'the dials\' defaults are SYN\'s own numbers — one owner');
ok(r.tiles === 2 && r.dialCount === 2, 'the switch and its two dials are in the Player pane');
ok(r.dialsGreyedOff && r.dialsLiveOn, 'the two dials grey out while the switch is off and come alive with it');
ok(r.offLinks === 0 && r.offWalls === 0 && r.offSynT == null, 'off is OFF: no link and no wall over 900 bot steps');
ok(r.stepsToLive60 === 36 && r.stepsToLive120 === 72, 'a link goes live after the dial\'s time: 36 steps at 0.6s, 72 at 1.2s — read ' + r.stepsToLive60 + ' / ' + r.stepsToLive120);
ok(r.linkPair && r.linkPair[0] === 0 && r.linkPair[1] === 1 && r.wallCount === 1 && r.wallIsBallOnly, 'the live link is the side-by-side pair and it is one ballOnly wall');
ok(r.movingNeverLinks, 'a body kept moving never links');
ok(r.formingT != null && r.formingT > 0.3 && r.formingT < 0.7 && !r.formingLive, 'a forming link reports its progress before it is live — ' + r.formingT);
ok(r.ballBounces, 'the ball comes back off a live link, and goes through with the switch off or while it is still forming: ' + JSON.stringify([r.shotOn, r.shotOff, r.shotForming]));
ok(r.blockedSteps === null && r.nearSteps != null, 'an opponent ON the line blocks the link; one 40 units off it does not — ' + r.blockedSteps + ' / ' + r.nearSteps);
ok(r.liveBefore && !r.liveAfterOpp && r.linksAfterOpp === 0, 'an opponent walking onto a live link breaks it at once');
ok(r.acrossSteps != null && r.alongSteps === null, 'a pair 150 apart links ACROSS the pitch and not strung goal-to-goal (the ellipse)');
ok(r.acrossShortReach === null, 'the reach dial is the reach: at 100 the 150-apart pair does not link');
ok(r.triLinks === 3 && r.tris === 1, 'three mutual links are one triangle — ' + r.triLinks + ' links, ' + r.tris + ' triangles');
ok(r.edgeInk > 20 && r.zoneInk > 30, 'the line and the streaked zone are drawn (pixel difference against the links stood down): edge ' + r.edgeInk + ', zone ' + r.zoneInk);
ok(r.zoneInk < r.zoneBox * 0.8, 'the zone is STREAKS, not a solid fill: ' + r.zoneInk + ' of ' + r.zoneBox);
ok(r.twoDrawsAgree, 'two draws of one frame agree — nothing advances in the draw');
ok(r.formingSum > 0 && r.formingSum < r.liveSum * 0.7, 'a forming link is drawn fainter than a live one on the same segment: ' + r.formingSum + ' against ' + r.liveSum);
const mean = a => a.reduce((s, x) => s + x.share, 0) / a.length;
ok(mean(r.botsInsane) > mean(r.botsNoHook) * 2 && mean(r.botsInsane) > 0.10, 'Insane bots form a line far more than the same seeds with the hook inert: ' + mean(r.botsInsane).toFixed(3) + ' vs ' + mean(r.botsNoHook).toFixed(3));
ok(r.bots5.some(x => x.triShare > 0), 'a 5v5 side (three outfield bots) forms a triangle at some point: ' + r.bots5.map(x => x.triShare));
ok(mean(r.botsInsane) > mean(r.botsRookie) * 2, 'Rookie (coop 0) forms far fewer links than Insane: ' + mean(r.botsRookie).toFixed(3));
ok(r.botsInsane.every(x => x.shots > 5), 'the bot match with links on is still a match: shots ' + r.botsInsane.map(x => x.shots));
ok(r.det1 === r.det2, 'two runs of one seed with the links on hash identically');
console.log('ERRORS:', errors.length ? errors : 'none');
if (errors.length) fails.push('console/page errors: ' + errors.slice(0,3).join(' | '));
console.log(fails.length ? 'FAILED: ' + JSON.stringify(fails, null, 1) : 'RESULT: ALL PASS');
await b.close();
process.exit(fails.length ? 1 : 0);
