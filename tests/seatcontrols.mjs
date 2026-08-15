// THE CONTROLS, SIMPLIFIED — five things asked for together, because they are one idea:
// you should be able to walk up, pick up whatever is nearest, stand wherever you like, and
// play without configuring anything.
//
//   1. ⚠️ THE KEYBOARD AND THE FIRST CONTROLLER DRIVE THE SAME PLAYER. A pad taking seat one
//      set `ctrl = 'gamepad'`, which silently took the keyboard away — and `pollKeys` was
//      called from inside a DRAW behind "is there a `human1` on the pitch", so with a pad in
//      seat one the keyboard was not even read. Both now land on one body.
//   2. ⚠️ SELECT TURNS YOUR CONTROLS A QUARTER TURN, per pad, persisted. Four people round a
//      screen do not face the same way, and the only previous answer was cocktail's
//      calibration wizard.
//   3. ⚠️ ...AND THE BOTTOM-RIGHT ICON TURNS WITH IT. That row is the only readout there is,
//      so without it you would press SELECT and have to walk to the pitch to find out what
//      it did.
//   4. ⚠️ EVERY BUTTON KICKS, except Start, Select and the D-PAD. The D-pad exclusion is the
//      one that is easy to miss: it is a button as far as the API is concerned, so an
//      unqualified "any button" makes every step you take fire a shot.
//   5. ⚠️ THE LOBBY PROMPTS ARE OFF THE PITCH. They floated over each player's head, which in
//      deck/side view meant a line of text running down the middle of the field.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const withPads = async (n, opts = {}) => {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, ...opts });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
  await p.addInitScript((count) => {
    window.__MAGNETDEBUG = true;
    const mk = i => ({ index: i, id: 'Pad ' + i, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
    const pads = Array.from({ length: count }, (_, i) => mk(i));
    navigator.getGamepads = () => pads;
    window.__pads = pads;
  }, n);
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(900);
  return p;
};

// ================================== 1. keyboard + first pad, one player ==
const p = await withPads(2);
const share = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = M.firstHumanSeat(w);
  o.seatIsPad = me.ctrl === 'gamepad';
  // ⚠️ `pollKeys` is driven explicitly: it runs once per frame in `loop()`, and a
  // synchronous step loop never calls it. Without this the keyboard reads as dead on a
  // build where it works perfectly.
  const run = setup => {
    me.x = 0; me.y = 0; me.vx = 0; me.vy = 0;
    w.players.filter(q => q !== me).forEach(q => { q.x = 9e3; q.y = 9e3; });
    w.ball.x = 9e3; w.ball.y = 9e3;
    setup();
    for (let i = 0; i < 25; i++){ M.pollKeys(); M.step(w); }
    return +me.x.toFixed(1);
  };
  o.stickOnly = run(() => { window.__pads[0].axes[0] = 1; });
  window.__pads[0].axes[0] = 0;
  o.keysOnly = run(() => { M.keys['arrowright'] = true; });
  M.keys['arrowright'] = false;
  o.both = run(() => { window.__pads[0].axes[0] = 1; M.keys['arrowright'] = true; });
  window.__pads[0].axes[0] = 0; M.keys['arrowright'] = false;
  // KICK from either, ORed rather than one winning.
  o.kickPad = (() => { window.__pads[0].buttons[0].pressed = true;
    for (let i = 0; i < 4; i++){ M.pollKeys(); M.step(w); }
    const k = me.kick; window.__pads[0].buttons[0].pressed = false; return k; })();
  o.kickKeys = (() => { M.pads.p1.kick = true;
    for (let i = 0; i < 4; i++) M.step(w);
    const k = me.kick; M.pads.p1.kick = false; return k; })();
  // ⚠️ ...and the SECOND pad's seat is NOT shared with the keyboard, or pressing a key
  // would move two players.
  const others = w.players.filter(q => q.ctrl === 'gamepad' && q !== me);
  o.secondSeatExists = others.length > 0;
  if (others.length){
    const q2 = others[0];
    q2.x = 0; q2.y = 200; q2.vx = 0; q2.vy = 0;
    M.keys['arrowright'] = true;
    for (let i = 0; i < 25; i++){ M.pollKeys(); M.step(w); }
    M.keys['arrowright'] = false;
    o.secondSeatMoved = +Math.abs(q2.x).toFixed(1);
  }
  return o;
});

// ============================ 2 & 3. SELECT turns the seat, and the icon ==
const rot = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.seatRot = {};
  M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = M.firstHumanSeat(w);
  const push = () => {
    me.x = 0; me.y = 0; me.vx = 0; me.vy = 0;
    w.players.filter(q => q !== me).forEach(q => { q.x = 9e3; q.y = 9e3; });
    w.ball.x = 9e3; w.ball.y = 9e3;
    window.__pads[0].axes[0] = 1; window.__pads[0].axes[1] = 0;
    for (let i = 0; i < 25; i++) M.step(w);
    window.__pads[0].axes[0] = 0;
    return Math.round(me.x) + ',' + Math.round(me.y);
  };
  const tapSelect = () => {
    window.__pads[0].buttons[8].pressed = true; M.pollSeatRotate();
    window.__pads[0].buttons[8].pressed = false; M.pollSeatRotate();
  };
  o.headings = []; o.quarters = [];
  for (let k = 0; k < 5; k++){ o.quarters.push(M.seatRotOf(0)); o.headings.push(push()); tapSelect(); }
  o.fourDistinct = new Set(o.headings.slice(0, 4)).size === 4;
  o.wrapsBack = o.headings[4] === o.headings[0];
  // ⚠️ PER PAD. Pad 1 was never touched and must not have moved.
  o.otherPadUntouched = M.seatRotOf(1) === 0;
  // ⚠️ HELD ACROSS A MATCH — it describes the room, not that kickoff.
  tapSelect();                                  // pad 0 back to a quarter turn
  const before = M.seatRotOf(0);
  M.startMatch();
  o.survivesRestart = M.seatRotOf(0) === before && before !== 0;
  o.savedInSel = (M.sel.seatRot || {})[0] === before;
  M.sel.seatRot = {};
  return o;
});

// The icon row turns with it — measured off the canvas, because that row is the only
// readout the feature has.
const icon = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.seatRot = {};
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  // The bottom-right corner, where drawPadFlairs lives.
  const grab = () => { M.render();
    const d = g.getImageData(c.width - 90, c.height - 90, 90, 90).data;
    let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i+1] * 3 + d[i+2] * 7) | 0;
    return h; };
  const a = grab();
  M.bumpSeatRot(0);
  const b2 = grab();
  M.bumpSeatRot(0); M.bumpSeatRot(0); M.bumpSeatRot(0);      // all the way round
  const c4 = grab();
  o.changed = a !== b2;
  o.backAfterFour = a === c4;
  M.sel.seatRot = {};
  return o;
});

// ================================================== 4. every button kicks ==
const kick = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.pad = Object.assign({}, M.sel.pad, { kick: null });   // no hand binding
  const g = () => navigator.getGamepads()[0];
  const press = i => { window.__pads[0].buttons[i].pressed = true;
                       const k = M.padKickHeld(g());
                       window.__pads[0].buttons[i].pressed = false; return k; };
  o.byIndex = Array.from({ length: 17 }, (_, i) => press(i));
  o.startNo  = o.byIndex[9] === false;
  o.selectNo = o.byIndex[8] === false;
  o.dpadNo   = [12, 13, 14, 15].every(i => o.byIndex[i] === false);
  o.restYes  = o.byIndex.every((v, i) => M.KICK_NEVER.has(i) ? v === false : v === true);
  // ⚠️ A HAND BINDING STILL WINS. "Any button" is the default for somebody who has not
  // chosen; somebody who has, has.
  M.sel.pad = Object.assign({}, M.sel.pad, { kick: 3 });
  o.boundOnly = press(3) === true && press(0) === false;
  M.sel.pad = Object.assign({}, M.sel.pad, { kick: null });
  return o;
});
await p.close();

// ============================================ 5. lobby prompts off the pitch ==
const four = await withPads(4);
const lob = await four.evaluate(() => {
  const M = window.__magnet, o = {};
  // ⚠️ MEASURED ON A PALETTE WHOSE PLATE IS NOT THE PITCH. On grass, `TH.nameBg` is within
  // a few points of the turf, so a colour probe counts the whole field and reports 106,082
  // "plate pixels" across the middle of the play — which reads as "the prompts are still on
  // the pitch" on a build where they are plainly below it. The claim being tested is about
  // POSITION and is palette-independent, so the palette is chosen to make the probe work.
  M.applyBundle('neon');
  M.sel.mode = '4v4'; M.setMatchSeed(5); M.startMatch();
  const w = M.world;
  o.inWarmup = w.state === 'warmup';
  M.render();
  const c = document.getElementById('game');
  const g = c.getContext('2d');
  // The pitch, including the net pocket the prompts also have to clear.
  const back = w.field.L / 2 + (w.field.net || 0);
  const yb = M.screenPt(M.wx(0), M.wy(back))[1];
  const yt = M.screenPt(M.wx(0), M.wy(-back))[1];
  o.pitchLo = Math.round(Math.min(yt, yb));
  o.pitchHi = Math.round(Math.max(yt, yb));
  // ⚠️ THE ROW'S OWN y, not a colour probe. The prompt plates and the players' NAME
  // plates are drawn in the same colour, and the name plates are legitimately on the
  // pitch — so counting plate-coloured pixels over the play measures the wrong feature
  // entirely (1,265 of them on a build where the prompts are plainly below the field).
  // `drawLobby` records where it put the row; this checks that against the pitch.
  o.promptY = w.lobby._promptY;
  o.canvasH = c.height;
  // ...and that something was actually drawn down there, so the coordinate is not just a
  // number nobody used.
  const hex = (M.TH.nameBg || '#000000').replace('#', '');
  const nr = parseInt(hex.slice(0, 2), 16), ng = parseInt(hex.slice(2, 4), 16), nb = parseInt(hex.slice(4, 6), 16);
  const band = (y0, y1) => {
    const top = Math.max(0, Math.round(y0)), h = Math.min(Math.round(y1 - y0), c.height - top);
    if (h <= 0) return 0;
    const d = g.getImageData(0, top, c.width, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (Math.abs(d[i] - nr) + Math.abs(d[i+1] - ng) + Math.abs(d[i+2] - nb) < 18) n++;
    return n;
  };
  o.inkAtRow = band(o.promptY - 12, o.promptY + 12);
  o.promptsAreBelow = o.promptY != null && o.promptY > o.pitchHi;
  return o;
});
await four.close();

// ===================================================== the defaults, reset ==
const bare = await withPads(0);
const def = await bare.evaluate(() => {
  const M = window.__magnet, d = M.defaultSel();
  M.sel.mode = '4v4'; M.sel.lobby = 'off'; M.startMatch();
  return {
    palette: d.look.palette,
    livePalette: M.sel.look.palette,
    profileFlag: M.defaultProfile().flag,
    // ⚠️ Every bot wears a NUMBER, not a country. The first-run continent lineup used to
    // dress a brand-new install in flags, which is the opposite of "players are numbered".
    botFlags: M.world.players.filter(q => q.ctrl === 'bot').map(q => q.flag),
  };
});
await bare.close();

// -------------------------------------------------------------------- report --
ok('a pad takes seat one', share.seatIsPad);
ok('...and the STICK moves it', share.stickOnly > 5, `${share.stickOnly}`);
ok('...and so does the KEYBOARD, at the same time', share.keysOnly > 5,
   `${share.keysOnly} — a pad in seat one used to set ctrl='gamepad', and pollKeys was called from a draw behind "is there a human1", so the keyboard was not even read`);
ok('...without doubling the speed', Math.abs(share.both - share.stickOnly) < 2,
   `stick ${share.stickOnly}, both ${share.both} — the merge takes the louder axis, never the sum`);
ok('...and KICK works from either', share.kickPad && share.kickKeys,
   JSON.stringify({ pad: share.kickPad, keys: share.kickKeys }));
ok('...and the SECOND pad\'s seat is not shared', share.secondSeatExists && share.secondSeatMoved < 1,
   `moved ${share.secondSeatMoved} — the keyboard joins the first seat only, or a keypress drives two players`);

ok('SELECT gives four distinct headings', rot.fourDistinct, JSON.stringify(rot.headings));
ok('...and the fourth press comes back round', rot.wrapsBack, JSON.stringify(rot.headings));
ok('...per pad, not globally', rot.otherPadUntouched);
ok('...and it survives the next match', rot.survivesRestart && rot.savedInSel,
   'standing the right way round is something you told the game about the ROOM, not about that kickoff');
ok('the controller icon turns with the seat', icon.changed,
   'that row is the only readout this feature has — without it you press SELECT and have to walk to the pitch to see what happened');
ok('...and comes back after four', icon.backAfterFour);

ok('START does not kick', kick.startNo);
ok('SELECT does not kick', kick.selectNo, 'it turns your controls, and a button cannot be both');
ok('the D-PAD does not kick', kick.dpadNo,
   'it is a button as far as the API is concerned, so an unqualified "any button kicks" fires a shot on every step you take');
ok('...and EVERY other button does', kick.restYes, JSON.stringify(kick.byIndex));
ok('...unless one is bound by hand', kick.boundOnly,
   '"any button" is the default for somebody who has not chosen, not an override of somebody who has');

ok('the lobby is up with four pads', lob.inWarmup);
ok('the prompts are BELOW the pitch, not over the play', lob.promptsAreBelow,
   `row at y=${lob.promptY}, pitch ends at ${lob.pitchHi} — floating over each player they ran down the middle of the field in deck view, where the text stays upright while the pitch is turned`);
ok('...and something is actually drawn there', lob.inkAtRow > 200,
   `${lob.inkAtRow} plate pixels in the row's own band — without this the coordinate above is a number nobody drew with`);

ok('the default theme is grass', def.palette === 'grass' && def.livePalette === 'grass',
   `${def.palette} — a plain green pitch is what a football game looks like before you have chosen anything, and it is what a reset gives back`);
ok('...and you are numbered', /^num\d$/.test(def.profileFlag), def.profileFlag);
ok('...and so is every bot', def.botFlags.length > 0 && def.botFlags.every(f => /^num\d$/.test(f)),
   `${JSON.stringify(def.botFlags)} — the first-run continent lineup dressed a fresh install in country flags, which is the opposite of "players are numbered"`);

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ share, rot, icon, kick, lob, def }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL seatcontrols\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS seatcontrols');
