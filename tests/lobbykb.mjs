// THE LOBBY KEYBOARD — walk onto letters to spell your own name, then walk into the pitch.
//
// It is laid out BELOW the back of the net, outside the pitch, and that placement is what
// makes it work rather than being a decoration: `lobbySideOf` answers −1 for any body past
// the touchline, so standing on the keys is "undecided" and walking into a half is still
// the side pick the lobby already had.
//
// ⚠️ THREE THINGS HAVE TO BE TRUE AT ONCE, and each one alone is satisfiable by a build
// that does not work:
//   1. the letters are REACHABLE — `integrate` clamps every body to the pitch plus a
//      margin, so a keyboard outside it is furniture nobody can walk to unless the clamp
//      opens up. Driven with the stick for real, never by teleporting a body onto a key
//      (which passes on a build where the clamp is never widened at all — the trap
//      `tests/targetsdrill.mjs` records);
//   2. they are VISIBLE — a player may never leave the view, so the camera has to frame
//      the keyboard as well as the pitch;
//   3. the letters do not sit UNDER anything — the lobby's headline block at the top and
//      the fixed `#lobbyStartBtn` at the bottom are both screen-space DOM/HUD, and the
//      first build put the bottom two rows of keys underneath the Start button.
//
// ⚠️ A DWELL, not a footstep: typing has to be deliberate, or crossing the keyboard on the
// way to the pitch spells a word. So both halves are measured — standing types, walking
// past does not — and the press is latched, or standing still types sixty letters a second.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

// ⚠️ A pad has to be connected or there is no warm-up lobby at all: `warmupUseful()` is
// false for a desktop with no controller, and the match goes straight to kickoff. The
// first run of this suite read `w.kb` as null for exactly that reason.
const page = async (vp) => {
  const p = await b.newPage(vp);
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|ERR_TUNNEL/i.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => {
    window.__MAGNETDEBUG = true;
    const mk = i => ({ index: i, id: 'Pad ' + i, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
    const pads = [mk(0), mk(1)];
    navigator.getGamepads = () => pads;
    window.__pads = pads;
  });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(800);
  return p;
};

const p = await page({ viewport: { width: 820, height: 1000 } });

const r = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode = '2v2'; M.sel.lobby = 'on'; M.setMatchSeed(4); M.startMatch();
  const w = M.world;
  o.state = w.state;
  o.hasKb = !!w.kb;
  if (!o.hasKb) return o;
  o.keyCount = w.kb.keys.length;
  o.letters = w.kb.keys.map(k => k.ch).join('');

  // ---- 1. OUTSIDE the pitch: every key is past the back of the net ----------------
  const back = w.field.L/2 + (w.field.net || 0);
  o.allOutside = w.kb.keys.every(k => k.y > back);
  o.nearestKey = Math.round(Math.min.apply(null, w.kb.keys.map(k => k.y)) - back);
  // ...so a body standing on one has not picked a side.
  const probe = w.players[0], keepY = probe.y, keepX = probe.x;
  const k0 = w.kb.keys[0];
  probe.x = k0.x + k0.w/2; probe.y = k0.y + k0.h/2;
  o.sideOnKeyboard = M.lobbySideOf(probe, w);
  probe.x = keepX; probe.y = keepY;

  // ---- 2. REACHABLE: driven with the stick, never teleported ---------------------
  const me = M.firstHumanSeat(w);
  o.seatIsPad = !!me && me.ctrl === 'gamepad';
  o.seatCtrl = me && me.ctrl;
  // ⚠️ NOT down the middle. A warm-up ball pushed ahead of you rolls into the net, and
  // `clampBallInside` holds it there — the pocket is the one place the ball may go past
  // the goal line — so it wedges in the goal mouth and stops you dead at y 410. That is
  // pre-existing (a player is contained by the clamp, never by a wall, so every other
  // line down is clear) and it cost an hour reading it as the clamp not opening up.
  me.x = w.field.W * 0.32; me.y = 0; me.vx = 0; me.vy = 0;
  window.__pads[0].axes[1] = 1;                    // hold DOWN, toward the keyboard
  for (let i = 0; i < 420; i++) M.step(w);
  window.__pads[0].axes[1] = 0;
  o.walkedTo = Math.round(me.y);
  o.reachedTheKeys = me.y >= w.kb.T;
  o.reach = M.lobbyReach(w);

  // ---- 3. a DWELL types, walking past does not -----------------------------------
  const key = ch => w.kb.keys.find(q => q.ch === ch);
  const standOn = (k, steps) => {
    for (let i = 0; i < steps; i++){ me.x = k.x + k.w/2; me.y = k.y + k.h/2; me.vx = 0; me.vy = 0; M.step(w); }
  };
  const leave = () => { for (let i = 0; i < 4; i++){ me.x = 0; me.y = 0; me.vx = 0; me.vy = 0; M.step(w); } };
  const dwellSteps = Math.ceil(M.LOBBYKB.dwell * 60) + 4;

  me.name = 'ZZZ'; me.kbTyped = false;
  o.before = me.name;
  standOn(key('K'), dwellSteps); leave();
  o.afterFirst = me.name;
  // ⚠️ The first press CLEARS: you are writing your name, not appending to whatever the
  // game called you.
  o.firstPressClears = me.name === 'K';
  standOn(key('A'), dwellSteps); leave();
  standOn(key('I'), dwellSteps); leave();
  o.spelled = me.name;

  // Walking past is NOT a press: fewer steps on the key than the dwell takes.
  const short = Math.max(1, Math.floor(M.LOBBYKB.dwell * 60) - 8);
  standOn(key('Z'), short); leave();
  o.afterBrush = me.name;
  o.walkingPastIsSilent = me.name === o.spelled;

  // ⚠️ LATCHED: three seconds of standing still is one letter, not a hundred and eighty.
  standOn(key('X'), 180); leave();
  o.afterLongStand = me.name;
  o.latched = me.name === o.spelled + 'X';

  // DEL and SPACE.
  // ⚠️ Measured as a CHANGE from whatever the name is by now, not against a literal —
  // the checks above have already added an X, and hard-coding "KA" here made this fail
  // on perfectly good code.
  const preDel = me.name;
  standOn(key('\b'), dwellSteps); leave();
  o.afterDel = me.name;
  o.delRemovesOne = me.name === preDel.slice(0, -1);
  standOn(key(' '), dwellSteps); leave();
  o.afterSpace = me.name;
  o.spaceAddsOne = me.name === o.afterDel + ' ';

  // The cap, which is the name box's own.
  for (let i = 0; i < 20; i++){ standOn(key(i % 2 ? 'A' : 'B'), dwellSteps); leave(); }
  o.capped = me.name.length;
  o.capIsTheNameBoxCap = me.name.length === M.LOBBYKB.maxLen;

  // ---- 4. bots never type --------------------------------------------------------
  const bot = w.players.find(q => q.ctrl === 'bot');
  const botName = bot.name;
  for (let i = 0; i < 200; i++){ const k = key('Q'); bot.x = k.x + k.w/2; bot.y = k.y + k.h/2; M.step(w); }
  o.botUntouched = bot.name === botName && !bot.kbTyped;

  // ---- 5. it is gone in play -----------------------------------------------------
  me.name = 'KAI'; me.kbTyped = true;
  M.lobbyKbCommit(w);
  o.committedProfile = M.profile.name;
  M.lobbyStart(w);
  o.stateAfterStart = w.state;
  o.kbGoneInPlay = !w.kb;
  return o;
});

// ---- 8. the TEAM SIZE stepper: + and − squares right of the letters -----------------
// ⚠️ The point of it is turning a 1v1 into a 3v3 without going back to the menu, so the
// checks are about what gets FIELDED, not about a number in `w.lobby`. And it repeats
// while you stand on it, which is the opposite rule from the letters — going 1v1 to 6v6
// through a latch would be eleven trips on and off a square.
const step = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode = '1v1'; M.sel.lobby = 'on'; M.setMatchSeed(4); M.startMatch();
  const w = M.world;
  const me = M.firstHumanSeat(w);
  const plus = w.kb.keys.find(k => k.act === 1), minus = w.kb.keys.find(k => k.act === -1);
  o.hasBoth = !!plus && !!minus;
  // RIGHT of every letter, which is where they were asked for.
  const letterR = Math.max.apply(null, w.kb.keys.filter(k => !k.act).map(k => k.x + k.w));
  o.rightOfLetters = plus.x >= letterR && minus.x >= letterR;
  o.stacked = plus.y < minus.y && Math.abs(plus.x - minus.x) < 1;

  const stand = (k, steps) => { for (let i = 0; i < steps; i++){ me.x = k.x + k.w/2; me.y = k.y + k.h/2; me.vx = 0; me.vy = 0; M.step(w); } };
  const off = () => { for (let i = 0; i < 4; i++){ me.x = 0; me.y = -200; me.vx = 0; me.vy = 0; M.step(w); } };
  const dwellSteps = Math.ceil(M.LOBBYKB.dwell * 60) + 4;

  o.startPer = M.lobbyPlan(w).per;
  o.botsAtStart = w.players.filter(q => q.ctrl === 'bot').length;
  stand(plus, dwellSteps); off();
  o.afterOnePress = M.lobbyPlan(w).per;
  // ⚠️ It REPEATS while a foot stays on it — measured against one press, not against a
  // constant, so the check survives the repeat rate being retuned.
  stand(plus, 150); off();
  o.afterHold = M.lobbyPlan(w).per;
  o.repeats = o.afterHold > o.afterOnePress + 1;
  o.cappedAt = M.LOBBY.maxPerSide;
  stand(plus, 900); off();
  o.holdsAtCap = M.lobbyPlan(w).per === M.LOBBY.maxPerSide;

  // ...and the bodies really are there, not just the number under each half.
  o.botsAtCap = w.players.filter(q => q.ctrl === 'bot').length;
  const pl = M.lobbyPlan(w);
  o.previewShowsBodies = o.botsAtCap >= pl.need0 + pl.need1;

  // − brings it back down.
  stand(minus, 900); off();
  o.afterMinus = M.lobbyPlan(w).per;
  o.minusWorks = o.afterMinus < o.afterHold;

  // ⚠️ FLOORED by the humans on a half, and pressing + right afterwards has to respond
  // AT ONCE. A stored value allowed to sink below the floor is a control that ignores
  // the next four presses, which reads as broken.
  // ⚠️ Driven through `lobbySizeBump` rather than by walking, and the reason is the
  // feature itself: standing on the stepper puts you PAST THE TOUCHLINE, which the lobby
  // reads as sitting this one out — so the body pressing − is not one of the bodies the
  // floor counts, and a walked version of this can never raise the floor above what the
  // OTHER humans hold. The walked path is covered by the − check above.
  const hs = w.players.filter(q => q.ctrl !== 'bot');
  hs.forEach(q => { q.y = w.field.L * 0.25; q.x = 0; });   // both humans onto one half
  for (let i = 0; i < 4; i++) M.step(w);
  o.humansOneSide = M.lobbyPlan(w).a.length;
  for (let i = 0; i < 12; i++) M.lobbySizeBump(w, -1);
  o.flooredAt = M.lobbyPlan(w).per;
  o.floorHolds = o.flooredAt === Math.max(1, o.humansOneSide);
  M.lobbySizeBump(w, 1);
  o.plusAfterFloor = M.lobbyPlan(w).per;
  o.respondsAtOnce = o.plusAfterFloor === o.flooredAt + 1;

  // What actually gets fielded is the whole claim.
  w.lobby.per = 3;
  hs.forEach((q, i) => { q.y = i ? -w.field.L*0.25 : w.field.L*0.25; });
  for (let i = 0; i < 4; i++) M.step(w);
  M.lobbyStart(w);
  o.fielded = [w.players.filter(q => q.team === 0).length, w.players.filter(q => q.team === 1).length];
  o.fieldedThreeAside = o.fielded[0] === 3 && o.fielded[1] === 3;
  return o;
});

// ⚠️ Bots are now spawned from inside `step()`, so two lobbies on one seed have to come
// out identical — `spawnLobbyBot` is deterministic (`pickNames` indexes arithmetically,
// `randEyes` is `(i*3+1) % n`), and this is what holds that.
const det = await p.evaluate(() => {
  const M = window.__magnet;
  const run = () => {
    M.sel.mode = '1v1'; M.sel.lobby = 'on'; M.setMatchSeed(12); M.startMatch();
    const w = M.world; w.lobby.per = 5;
    for (let i = 0; i < 200; i++) M.step(w);
    return w.players.map(q => `${q.name}:${q.ctrl}:${q.x.toFixed(3)}:${q.y.toFixed(3)}`).join('|');
  };
  const a = run(), b = run();
  return { same: a === b, sample: a.slice(0, 90) };
});

// ---- 6. framing: on screen, clear of the chrome, and the pitch really is smaller ----
const view = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode = '2v2'; M.sel.lobby = 'on'; M.setMatchSeed(4); M.startMatch();
  const w = M.world;
  M.computeCam(); M.render();
  const cv = document.getElementById('game');
  const box = k => {
    const pts = [[k.x, k.y], [k.x + k.w, k.y], [k.x + k.w, k.y + k.h], [k.x, k.y + k.h]]
      .map(([x, y]) => M.screenPt(M.wx(x), M.wy(y)));
    return { L: Math.min(...pts.map(q => q[0])), R: Math.max(...pts.map(q => q[0])),
             T: Math.min(...pts.map(q => q[1])), B: Math.max(...pts.map(q => q[1])) };
  };
  const boxes = w.kb.keys.map(box);
  const W = cv.clientWidth, H = cv.clientHeight;
  o.onScreen = boxes.every(q => q.L >= 0 && q.R <= W && q.T >= 0 && q.B <= H);
  o.worst = boxes.reduce((a, q) => ({ L: Math.min(a.L, q.L), R: Math.max(a.R, q.R),
                                      T: Math.min(a.T, q.T), B: Math.max(a.B, q.B) }), boxes[0]);
  o.canvas = [W, H];

  // ⚠️ The fixed Start button is a DOM node over the canvas, and the first build drew the
  // bottom two rows of keys underneath it. Measured as a real rect overlap.
  M.syncLobbyStartBtn();
  const bt = document.getElementById('lobbyStartBtn');
  const br = bt.getBoundingClientRect();
  o.buttonShown = !bt.classList.contains('hidden') && br.height > 10;
  o.buttonHitsAKey = boxes.some(q => q.L < br.right && q.R > br.left && q.T < br.bottom && q.B > br.top);

  // ...and the lobby's headline block at the top does not sit on the pitch.
  o.headlineBottom = Math.round(H * 0.085) + 40;
  const [, topNet] = M.screenPt(M.wx(0), M.wy(-(w.field.L/2 + (w.field.net || 0))));
  o.topNetY = Math.round(topNet);
  o.headlineIsClear = topNet > o.headlineBottom;

  // The pitch IS smaller than it would be with no keyboard — which is the ask.
  const withKb = M.cam.s;
  const keep = w.kb; w.kb = null; M.computeCam();
  const without = M.cam.s;
  w.kb = keep; M.computeCam();
  o.scale = { withKb: +withKb.toFixed(4), without: +without.toFixed(4) };
  o.pitchIsSmaller = withKb < without;

  // ⚠️ Draw only: two renders with no step between them must be identical (the trails
  // rule). The dwell fill is read from `p.kbT`, which the step loop owns.
  const c2 = cv.getContext('2d');
  const hash = () => { M.render(); const d = c2.getImageData(0, 0, cv.width, cv.height).data;
    let h = 0; for (let i = 0; i < d.length; i += 97) h = (h*31 + d[i])|0; return h; };
  o.paintIsPure = hash() === hash();
  return o;
});
await p.close();

// ---- 7. a phone, where the reservations are tightest --------------------------------
const ph = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const phone = await ph.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode = '2v2'; M.sel.lobby = 'on'; M.setMatchSeed(4); M.startMatch();
  const w = M.world; M.computeCam(); M.render();
  const cv = document.getElementById('game');
  const pts = [[w.kb.L, w.kb.T], [w.kb.R, w.kb.B]].map(([x, y]) => M.screenPt(M.wx(x), M.wy(y)));
  o.span = pts.map(q => q.map(Math.round));
  o.onScreen = pts.every(q => q[0] >= 0 && q[0] <= cv.clientWidth && q[1] >= 0 && q[1] <= cv.clientHeight);
  o.state = w.state;
  return o;
});
await ph.close();

// ============================================================ 8. IT IS READABLE ==
// ⚠️ THE KEYBOARD IS THE ONE THING ON THE PITCH MADE OF WORDS, so "it is drawn" is not
// the bar. Two separate faults made it unreadable and NEITHER shows up in any geometry
// check — the keys were in the right places both times.
//
//   · THE LETTERS LAY ON THEIR SIDE IN DECK VIEW. `uprightAt` CANCELS the pitch's
//     quarter-turn, so it only works INSIDE `pitchXform`; called out here in screen
//     space it ADDS one. Measured on a multi-letter label, because a rotated "SPACE"
//     is taller than it is wide and an upright one is wider than it is tall.
//   · THE PLATE AND THE LETTER CAME OUT THE SAME COLOUR. `rgba(col, a)` handed a
//     non-hex colour back untouched, and Grass — the DEFAULT palette — sets
//     `line: 'rgba(255,255,255,0.95)'`. So the 8% plate wash and the 55% letter were
//     both painted at 0.95 and the board was a near-white slab with nothing on it.
//     ⚠️ Measured on RENDERED PIXELS against the plate, never on the palette hex: a
//     hex says nothing about what alpha did to it.
const rp = await page({ viewport: { width: 1298, height: 914 } });
const read = await rp.evaluate(() => {
  const M = window.__magnet, o = {};
  // ⚠️ rgba() first, on its own — it is the root of the contrast half and it is used
  // everywhere, so a check here says which of the two broke if this suite goes red.
  o.rgbaKeepsAlpha = M.rgba('rgba(255,255,255,0.95)', 0.08) === 'rgba(255,255,255,0.076)';
  o.rgbaHexUnchanged = M.rgba('#ffffff', 0.5) === 'rgba(255,255,255,0.5)';

  const probe = (deck) => {
    M.sel.display = deck ? 'deck' : 'auto'; M.applyDisplayMode();
    window.dispatchEvent(new Event('resize'));
    M.sel.mode = '2v2'; M.sel.lobby = 'on'; M.setMatchSeed(4); M.startMatch();
    const w = M.world; for (let i = 0; i < 20; i++) M.step(w);
    M.computeCam(); M.render();
    const cv = document.getElementById('game'), c = cv.getContext('2d');
    const dpr = cv.width / cv.clientWidth;
    const key = w.kb.keys.find(k => k.label === 'SPACE');
    const pts = [[key.x, key.y], [key.x+key.w, key.y], [key.x+key.w, key.y+key.h], [key.x, key.y+key.h]]
      .map(([x, y]) => M.screenPt(M.wx(x), M.wy(y)));
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    // A pixel or two in from the plate's edge, so the outline stroke is not sampled.
    const x0 = Math.round((Math.min.apply(null, xs) + 3) * dpr);
    const y0 = Math.round((Math.min.apply(null, ys) + 3) * dpr);
    const bw = Math.round((Math.max.apply(null, xs) - Math.min.apply(null, xs) - 6) * dpr);
    const bh = Math.round((Math.max.apply(null, ys) - Math.min.apply(null, ys) - 6) * dpr);
    const d = c.getImageData(x0, y0, bw, bh).data;
    const lum = i => (d[i]*0.2126 + d[i+1]*0.7152 + d[i+2]*0.0722);
    // The plate is the commonest tone inside the box; the letter is what stands off it.
    const hist = new Map();
    for (let i = 0; i < d.length; i += 4){ const v = Math.round(lum(i));
      hist.set(v, (hist.get(v) || 0) + 1); }
    let plate = 0, best = -1;
    for (const [v, n] of hist) if (n > best){ best = n; plate = v; }
    let ink = plate, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, inkPx = 0;
    for (let py = 0; py < bh; py++) for (let px = 0; px < bw; px++){
      const i = (py*bw + px)*4, v = lum(i);
      if (Math.abs(v - plate) < 18) continue;                 // still the plate
      inkPx++;
      if (Math.abs(v - plate) > Math.abs(ink - plate)) ink = v;
      if (px < minx) minx = px; if (px > maxx) maxx = px;
      if (py < miny) miny = py; if (py > maxy) maxy = py;
    }
    return { plate, ink, gap: Math.round(Math.abs(ink - plate)), inkPx,
             box: [bw, bh],
             wordW: maxx - minx, wordH: maxy - miny,
             insideX: minx >= 0 && maxx <= bw - 1, insideY: miny >= 0 && maxy <= bh - 1 };
  };
  o.flat = probe(false);
  o.deck = probe(true);
  M.sel.display = 'auto'; M.applyDisplayMode();
  return o;
});
await rp.close();

// -------------------------------------------------------------------- report --
ok('the warm-up lobby has a keyboard', r.state === 'warmup' && r.hasKb, JSON.stringify({ state: r.state, kb: r.hasKb }));
ok('...with a key per letter, DEL and SPACE, and the two stepper squares', r.keyCount === 30,
   `${r.keyCount} keys: ${r.letters}`);
ok('every key is OUTSIDE the pitch', r.allOutside,
   `nearest is ${r.nearestKey} units past the back of the net — on the pitch it would be a second meaning for standing somewhere, fighting the side pick the lobby is for`);
ok('...so standing on one is not a side pick', r.sideOnKeyboard === -1,
   `lobbySideOf said ${r.sideOnKeyboard} — you spell your name out here and then walk INTO a half`);

ok('a player can WALK to the keys', r.reachedTheKeys,
   `held the stick down for 420 steps and got to y ${r.walkedTo}, keys start at ${JSON.stringify(r.reach)} — driven with the stick and never teleported, because a teleport passes on a build where the clamp was never widened`);

ok('standing on a letter types it', r.spelled === 'KAI', `"${r.before}" then "${r.spelled}"`);
ok('...and the first press CLEARS the old name', r.firstPressClears,
   `"${r.afterFirst}" — you are writing your name, not appending to what the game called you`);
ok('walking past a letter types nothing', r.walkingPastIsSilent,
   `"${r.afterBrush}" — a dwell is what stops crossing the keyboard on the way to the pitch spelling a word`);
ok('standing still is ONE letter, not sixty a second', r.latched,
   `three seconds on one key gave "${r.afterLongStand}"`);
ok('DEL removes a letter and SPACE adds one', r.delRemovesOne && r.spaceAddsOne,
   JSON.stringify({ del: r.afterDel, space: r.afterSpace }));
ok('the name is capped at the name box\'s own cap', r.capIsTheNameBoxCap, `${r.capped} characters`);
ok('a bot never types', r.botUntouched,
   'bots walk on and off in the lobby and the bench is outside the touchline, so the exclusion is by ctrl and never by where a body is');
// ⚠️ The seat here is a GAMEPAD seat, because a pad is connected — which is the whole
// point. `ctrl === 'human1'` does not exist on a machine with a controller plugged in, so
// a commit keyed on it put the profile seat's name in the Player names box instead. This
// assertion is what caught that.
ok('the typed name is committed to the PROFILE at the whistle', r.committedProfile === 'KAI',
   `profile.name is "${r.committedProfile}", seat ctrl is "${r.seatCtrl}" — persisted where the lobby ends rather than per keystroke, because saveProfile is a synchronous localStorage write reached from inside step()`);
ok('the keyboard is gone once play starts', r.kbGoneInPlay && r.stateAfterStart !== 'warmup',
   JSON.stringify({ state: r.stateAfterStart, kb: !r.kbGoneInPlay }));

ok('the stepper is two squares RIGHT of the letters', step.hasBoth && step.rightOfLetters && step.stacked,
   JSON.stringify({ both: step.hasBoth, right: step.rightOfLetters, stacked: step.stacked }));
ok('one press adds a body a side', step.afterOnePress === step.startPer + 1,
   `${step.startPer} then ${step.afterOnePress}`);
ok('...and holding REPEATS', step.repeats,
   `one press ${step.afterOnePress}, held ${step.afterHold} — the opposite rule from the letters, because going 1v1 to 6v6 through a latch is eleven trips on and off a square`);
ok('...up to the per-side cap and no further', step.holdsAtCap, `capped at ${step.cappedAt}`);
ok('the bots are really THERE, not just counted', step.previewShowsBodies,
   `${step.botsAtCap} bots on the sheet — the lobby's one promise is that the preview cannot disagree with what Start does, and a 1v1 world holds one bot`);
ok('− takes them away again', step.minusWorks, `${step.afterHold} then ${step.afterMinus}`);
ok('the size is floored by the humans on a half', step.floorHolds,
   `${step.humansOneSide} humans on one side, floor held at ${step.flooredAt}`);
ok('...and + responds at once against that floor', step.respondsAtOnce,
   `${step.flooredAt} then ${step.plusAfterFloor} — a stored value allowed to sink below the floor ignores the next four presses, which reads as a broken control`);
ok('a 1v1 becomes a real 3v3', step.fieldedThreeAside, JSON.stringify(step.fielded));
ok('two lobbies on one seed are identical', det.same,
   `${det.sample} — bots are spawned from inside step() now, so spawnLobbyBot has to stay deterministic`);
ok('every key is on screen', view.onScreen,
   `${JSON.stringify(view.worst)} in a ${JSON.stringify(view.canvas)} canvas — a player may never leave the view, and the keys are where they are walking`);
ok('the Start button does not sit on the keys', view.buttonShown && !view.buttonHitsAKey,
   'the first build drew the bottom two rows underneath the one button the lobby exists to get you past');
ok('the headline block does not sit on the pitch', view.headlineIsClear,
   `top net at y ${view.topNetY}, headline ends at ${view.headlineBottom} — packing the pitch tight enough to fit the keyboard brought the goal up into it`);
ok('the pitch really is smaller in the lobby', view.pitchIsSmaller, JSON.stringify(view.scale));
ok('the keyboard does not advance in a draw', view.paintIsPure,
   'two renders with no step between them must be identical — the trails rule');

ok('a phone frames it too', phone.state === 'warmup' && phone.onScreen,
   `${JSON.stringify(phone.span)} — the top and bottom reservations are tightest here`);

ok('rgba() honours the alpha on a colour that already has one', read.rgbaKeepsAlpha,
   'it used to hand a non-hex colour straight back, and Grass, the default palette, sets line: rgba(255,255,255,0.95) — so an 8% plate wash painted at 0.95');
ok('...and a hex colour is unchanged', read.rgbaHexUnchanged);
for (const [tag, m] of [['flat', read.flat], ['deck view', read.deck]]){
  ok(`the letter is INKED on its plate (${tag})`, m.inkPx > 20 && m.gap >= 25,
     `${m.inkPx} px at a luminance gap of ${m.gap} over the plate (${m.plate}) — the plate and the letter came out the same colour, so the board was a near-white slab with nothing on it`);
  ok(`...upright, not on its side (${tag})`, m.wordW > m.wordH,
     `"SPACE" measured ${m.wordW}x${m.wordH} — uprightAt cancels the pitch turn, so out here in screen space it ADDS one and every letter lies down`);
  ok(`...and inside the key it is on (${tag})`, m.insideX && m.insideY,
     `ink box vs plate ${JSON.stringify(m.box)} — a key is wide in world x and deck view turns world x into screen y, so a word-length label ran off both ends of the plate`);
}

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ r, step, det, view, phone, read }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL lobbykb\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS lobbykb');
