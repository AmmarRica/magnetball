// A STEAM DECK, IN EVERY SHAPE IT ACTUALLY REPORTS ITSELF AS.
//
// "The joystick does nothing on Steam Deck" has been reported three times and diagnosed
// wrong twice, so this stops relying on one fake pad that happens to match one theory. A
// Deck reaches the page as one of a small number of genuinely different things depending
// on the browser, the Steam Input layout and whether it is in game mode:
//
//   A. STANDARD mapping, left stick on axes 0/1 — what Chrome usually reports.
//   B. NON-STANDARD, stick further up the axis list, with the two TRIGGERS resting at -1
//      in front of it. A trigger never centres, so an untouched one reads as a stick held
//      hard over, which is the layout that makes a wrong answer easy.
//   C. NON-STANDARD with the D-PAD arriving as an AXIS PAIR (a hat) rather than buttons.
//      This is the one that defeated every "identify the move stick" heuristic: pushed
//      hard, a hat and a stick are the same reading.
//   D. STEAM INPUT sending the D-pad as ARROW KEYS while the stick arrives as a gamepad.
//      ⚠️ This is the configuration the keyboard/controller merge changed, and it is the
//      new risk worth checking: before the merge, arrow keys drove a DIFFERENT body from
//      the stick. Both must now land on one player.
//
// Every case is measured the same way — eight pushes, eight DISTINCT headings — because
// "it moves" is true of a build that reports one direction for everything.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

// `shape` decides how the fake pad presents itself.
const deckPage = async (shape) => {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', e => errors.push(shape + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(shape + ': ' + m.text()); });
  await p.addInitScript((shape) => {
    window.__MAGNETDEBUG = true;
    const btns = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    // A: [lx, ly, rx, ry]                      standard
    // B: [trigL, trigR, lx, ly]                triggers first, resting at -1
    // C: [trigL, trigR, hatX, hatY, lx, ly]    ...and a hat pair before the stick
    // D: as A, plus Steam Input's arrow keys
    const axes = shape === 'B' ? [-1, -1, 0, 0]
               : shape === 'C' ? [-1, -1, 0, 0, 0, 0]
               : [0, 0, 0, 0];
    const pad = { index: 0, id: 'Steam Deck (' + shape + ')', connected: true,
                  mapping: (shape === 'A' || shape === 'D') ? 'standard' : '', axes, buttons: btns };
    navigator.getGamepads = () => [pad];
    window.__pad = pad;
    window.__shape = shape;
    // Where the left stick lives in each shape, for the harness to drive.
    window.__stick = shape === 'B' ? [2, 3] : shape === 'C' ? [4, 5] : [0, 1];
  }, shape);
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(900);
  return p;
};

const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];

const runShape = async (shape) => {
  const p = await deckPage(shape);
  const r = await p.evaluate((DIRS) => {
    const M = window.__magnet, o = {};
    // ⚠️ `sel.controllers` is LEFT AT ITS DEFAULT and `display` is set to deck — the whole
    // point is that a Deck needs no toggle. It defaults to 'on' now, which is the fix for
    // "four controllers cannot join"; before that it was the Deck exception that carried
    // this, and either way nothing here is configured by hand.
    M.sel.display = 'deck'; M.applyDisplayMode();
    o.controllersSetting = M.sel.controllers;
    o.takesSeats = M.padsTakeSeats();
    M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(7); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    const me = M.firstHumanSeat(w);
    o.gotAPadSeat = !!me && me.ctrl === 'gamepad';
    if (!o.gotAPadSeat) return o;

    // ⚠️ PARKING AT 9e3 DOES NOT PARK ANYTHING, and that cost a red merge here. Both
    // clamps are hard containment backstops — `clampBallInside` for the ball,
    // `integrate`'s bounds+20 for a body — so a thing shoved off to 9e3 is dragged back
    // to the touchline on the very next step, and the 1v1 opponent then chases the ball
    // around the pitch and into the body being measured. It read as a merge that doubled
    // the speed (62 alone against 162 together) and it was a collision.
    // The others are re-pinned to a far corner AFTER every step instead, and the match
    // seed is pinned, so where they end up is not a lottery. Same trap `fourpads` records.
    const others = w.players.filter(q => q !== me);
    const PX = w.bounds.halfW * 0.95, PY = -w.bounds.halfL * 0.95;
    const stow = () => {
      others.forEach((q, i) => { q.x = PX; q.y = PY + i * 40; q.vx = 0; q.vy = 0; });
      w.ball.x = PX; w.ball.y = PY - 40; w.ball.vx = 0; w.ball.vy = 0;
    };
    stow();

    // Let the rest-detector see a settled pad before anything is pushed. On shape B and C
    // that is what tells it the triggers never centre.
    for (let i = 0; i < 8; i++){ M.step(w); stow(); }

    const [AX, AY] = window.__stick;
    const push = (dx, dy, useKeys) => {
      me.x = 0; me.y = 0; me.vx = 0; me.vy = 0;
      if (useKeys){
        M.keys['arrowright'] = dx > 0; M.keys['arrowleft'] = dx < 0;
        M.keys['arrowdown']  = dy > 0; M.keys['arrowup']   = dy < 0;
      } else {
        window.__pad.axes[AX] = dx; window.__pad.axes[AY] = dy;
      }
      for (let i = 0; i < 25; i++){ M.pollKeys(); M.step(w); stow(); }
      window.__pad.axes[AX] = 0; window.__pad.axes[AY] = 0;
      M.keys['arrowright'] = M.keys['arrowleft'] = M.keys['arrowdown'] = M.keys['arrowup'] = false;
      const d = Math.hypot(me.x, me.y);
      return { moved: d, head: d > 3 ? Math.round(Math.atan2(me.y, me.x) * 180 / Math.PI / 15) * 15 : null };
    };

    o.stick = DIRS.map(([dx, dy]) => push(dx, dy, false));
    o.allMoved = o.stick.every(s => s.moved > 3);
    o.headings = o.stick.map(s => s.head);
    o.distinct = new Set(o.headings.filter(h => h !== null)).size;
    o.chosenAxes = M.padStickAxes(window.__pad);

    // ⚠️ SHAPE D: Steam Input's arrow keys AND the stick, on one body. Before the merge
    // these drove two different players; now the keys have to move the same seat.
    if (window.__shape === 'D'){
      o.keys = DIRS.map(([dx, dy]) => push(dx, dy, true));
      o.keysAllMoved = o.keys.every(s => s.moved > 3);
      o.keysDistinct = new Set(o.keys.map(s => s.head).filter(h => h !== null)).size;
      // ...and holding both does not travel at double speed.
      me.x = 0; me.y = 0; me.vx = 0; me.vy = 0;
      window.__pad.axes[AX] = 1; M.keys['arrowright'] = true;
      for (let i = 0; i < 25; i++){ M.pollKeys(); M.step(w); stow(); }
      window.__pad.axes[AX] = 0; M.keys['arrowright'] = false;
      // ⚠️ DISTANCE against DISTANCE. Comparing `me.x` here against `o.stick[0].moved`
      // (a hypot) is comparing two different quantities — and on a deck the pitch is
      // turned a quarter, so pushing "right" moves the body along y and `me.x` reads ~0,
      // which looks exactly like the two inputs cancelling each other out.
      o.bothTogether = +Math.hypot(me.x, me.y).toFixed(1);
      o.stickAlone = +o.stick[0].moved.toFixed(1);
    }

    // Every button kicks except Start, Select and the D-pad — checked on the real pad
    // object, because a Deck has back paddles beyond the standard sixteen.
    o.kickByIndex = window.__pad.buttons.map((_, i) => {
      window.__pad.buttons[i].pressed = true;
      const k = M.padKickHeld(navigator.getGamepads()[0]);
      window.__pad.buttons[i].pressed = false;
      return k;
    });
    o.dpadNeverKicks = [12, 13, 14, 15].every(i => o.kickByIndex[i] === false);
    o.startSelectNeverKick = o.kickByIndex[8] === false && o.kickByIndex[9] === false;
    o.everythingElseKicks = o.kickByIndex.every((v, i) => M.KICK_NEVER.has(i) ? !v : v);

    // ⚠️ SELECT ROTATES, and on a Deck the pitch is already turned a quarter — so the
    // rotation has to COMPOSE with that rather than replace it.
    M.sel.seatRot = {};
    const before = push(1, 0, false).head;
    window.__pad.buttons[8].pressed = true; M.pollSeatRotate();
    window.__pad.buttons[8].pressed = false; M.pollSeatRotate();
    const after = push(1, 0, false).head;
    o.rotBefore = before; o.rotAfter = after;
    o.selectTurns = before !== null && after !== null && before !== after;
    M.sel.seatRot = {};
    return o;
  }, DIRS);
  await p.close();
  return r;
};

const A = await runShape('A');
const B = await runShape('B');
const C = await runShape('C');
const D = await runShape('D');

// -------------------------------------------------------------------- report --
for (const [name, r, why] of [
  ['A standard', A, 'the plain case: Chrome usually reports a Deck as a standard pad'],
  ['B triggers-first', B, 'a trigger rests at -1 and never centres, so an untouched one reads as a stick held hard over'],
  ['C hat-before-stick', C, 'the D-pad arriving as an AXIS PAIR is what defeated every "identify the stick" heuristic — pushed hard, a hat and a stick are the same reading'],
  ['D steam-input-keys', D, 'the stick as a gamepad with Steam Input also sending the D-pad as arrow keys'],
]){
  ok(`${name}: takes a pad seat with nothing configured`, r.takesSeats && r.gotAPadSeat,
     `${JSON.stringify({ controllers: r.controllersSetting, seats: r.takesSeats, seat: r.gotAPadSeat })} — ${why}`);
  if (!r.gotAPadSeat) continue;
  ok(`${name}: the stick moves in all eight directions`, r.allMoved,
     `${JSON.stringify(r.stick.map(s => +s.moved.toFixed(1)))} — chose axes ${JSON.stringify(r.chosenAxes)}`);
  ok(`${name}: ...as eight DISTINCT headings`, r.distinct === 8,
     `${r.distinct} distinct of 8: ${JSON.stringify(r.headings)} — "they all move" is true of a build that reports one direction for everything`);
  ok(`${name}: the D-pad never kicks`, r.dpadNeverKicks,
     'it is a button as far as the API is concerned, so an unqualified "any button kicks" fires a shot on every step you take');
  ok(`${name}: Start and Select never kick`, r.startSelectNeverKick);
  ok(`${name}: every other button does`, r.everythingElseKicks, JSON.stringify(r.kickByIndex));
  ok(`${name}: SELECT turns the controls`, r.selectTurns,
     `${r.rotBefore}° then ${r.rotAfter}° — on a deck the pitch is already turned a quarter, so this has to COMPOSE with that rather than replace it`);
}

ok('D: the ARROW KEYS drive the same seat as the stick', D.keysAllMoved,
   `${JSON.stringify((D.keys || []).map(s => +s.moved.toFixed(1)))} — Steam Input commonly sends the D-pad as arrow keys, and before the merge that drove a DIFFERENT body from the stick`);
ok('D: ...in all eight directions too', D.keysDistinct === 8, `${D.keysDistinct} distinct of 8`);
ok('D: ...and holding both is not double speed', Math.abs(D.bothTogether - D.stickAlone) < 3,
   `stick alone ${D.stickAlone}, both ${D.bothTogether} — the merge takes the louder axis, never the sum`);

ok('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));

console.log(JSON.stringify({ A, B, C, D }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL deckstick\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS deckstick');
