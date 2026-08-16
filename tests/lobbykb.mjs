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

// -------------------------------------------------------------------- report --
ok('the warm-up lobby has a keyboard', r.state === 'warmup' && r.hasKb, JSON.stringify({ state: r.state, kb: r.hasKb }));
ok('...with a key per letter plus DEL and SPACE', r.keyCount === 28, `${r.keyCount} keys: ${r.letters}`);
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

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ r, view, phone }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL lobbykb\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS lobbykb');
