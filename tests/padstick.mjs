// THE MOVE STICK, ON A PAD THAT DOES NOT REPORT A STANDARD MAPPING.
//
// `axes[0]`/`axes[1]` is the left stick ONLY under the standard Gamepad mapping. A pad
// reporting a non-standard one numbers its axes however it likes — which is exactly the trap
// `padKickHeld` already documents for BUTTONS, one layer down. Reported from a Steam Deck in
// a browser: the D-pad worked, because buttons 12-15 happened to line up, and the stick did
// nothing at all.
//
// What this suite holds:
//   1. a STANDARD pad is untouched — axes 0 and 1, exactly as before;
//   2. a NON-STANDARD pad with the stick on other axes is found anyway;
//   3. ⚠️ A TRIGGER RESTS AT -1, so an untouched one reads as a stick held hard over. Naive
//      auto-detection latches onto it and the player drives into a wall for ever. Sticks
//      centre and triggers do not, and that is what separates them — so the fake pad here
//      has two trigger axes at -1 sitting BEFORE the real stick, which is the layout that
//      makes a wrong answer easy;
//   4. ALL EIGHT DIRECTIONS, diagonals included, each giving a distinct heading;
//   5. ...and a diagonal is not faster than a straight line;
//   6. a hand-bound pair beats the automatic one, because that is what binding is for;
//   7. the D-pad still works — the fix must not trade one input for the other;
//   8. the DECK MENU reads the stick through the same helper, or it stays D-pad only there
//      for exactly the same reason.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

// ⚠️ A pad whose sticks are NOT on the first two axes, with triggers resting at -1 in front
// of them. Both halves matter: move the stick to axes 0/1 and the suite proves nothing, and
// drop the triggers and the easy wrong answer never gets a chance to be wrong.
const padInit = (mapping, axes) => `
  window.__MAGNETDEBUG = true;
  window.__pad = { id:'Test Pad', index:0, connected:true, mapping:'${mapping}',
    axes:${JSON.stringify(axes)},
    buttons: Array.from({length:17}, () => ({ pressed:false, value:0 })) };
  navigator.getGamepads = () => [window.__pad];
`;

async function pageWith(mapping, axes){
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(padInit(mapping, axes));
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  return p;
}

// ------------------------------------------------- 2,3,4,5,6,7 (non-standard) --
const p = await pageWith('', [-1, -1, 0, 0, 0, 0]);   // LT, RT at rest, stick on 2/3
const r = await p.evaluate(async () => {
  const M = window.__magnet, P = window.__pad, o = {};
  M.sel.display = 'deck'; M.sel.controllers = 'on'; M.sel.mode = '1v1'; M.sel.lobby = 'off';
  M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = w.players.find(q => q.ctrl === 'gamepad');
  o.gotASeat = !!me;
  // Let the rest-tracker watch the pad sit still, which is what a pad does at boot.
  for (let i = 0; i < 3; i++) M.gamepadPad(0);
  o.detected = M.padStickAxes(P);

  const push = (x, y) => {
    P.axes[2] = x; P.axes[3] = y;
    const pad = M.gamepadPad(0);
    M.applyHumanInput(me, pad);
    return { dx: +pad.dx.toFixed(2), dy: +pad.dy.toFixed(2),
             ix: +me.inX.toFixed(2), iy: +me.inY.toFixed(2),
             speed: +Math.hypot(me.inX, me.inY).toFixed(3) };
  };

  const D = [['right',1,0], ['left',-1,0], ['up',0,-1], ['down',0,1],
             ['up-right',0.7,-0.7], ['down-right',0.7,0.7],
             ['down-left',-0.7,0.7], ['up-left',-0.7,-0.7]];
  o.dirs = {};
  for (const [n, x, y] of D) o.dirs[n] = push(x, y);
  o.allMoved = D.every(([n]) => o.dirs[n].speed > 0.5);
  // ⚠️ EIGHT DISTINCT HEADINGS. "They all move" is also true of a build that reports the
  // same direction for every push.
  o.headings = [...new Set(D.map(([n]) => o.dirs[n].ix + ',' + o.dirs[n].iy))].length;
  const straights = ['right','left','up','down'].map(n => o.dirs[n].speed);
  const diags = ['up-right','down-right','down-left','up-left'].map(n => o.dirs[n].speed);
  o.diagNotFaster = Math.max(...diags) <= Math.max(...straights) + 0.02;
  o.speeds = { straights, diags };

  push(0, 0);
  o.restIsStill = Math.abs(me.inX) + Math.abs(me.inY) < 0.01;

  // ---- 3. the triggers must never be taken for the stick ----
  P.axes[0] = 1; P.axes[1] = 1;
  const t = M.gamepadPad(0);
  P.axes[0] = -1; P.axes[1] = -1;
  o.triggersIgnored = Math.abs(t.dx) + Math.abs(t.dy) < 0.01;

  // ---- 7. the D-pad is untouched ----
  const dpad = (i) => { P.buttons[i].pressed = true; const pad = M.gamepadPad(0);
                        P.buttons[i].pressed = false; return [pad.dx, pad.dy]; };
  o.dpad = { up: dpad(12), down: dpad(13), left: dpad(14), right: dpad(15) };
  o.dpadWorks = o.dpad.up[1] === -1 && o.dpad.down[1] === 1 &&
                o.dpad.left[0] === -1 && o.dpad.right[0] === 1;

  // ---- 6. a hand-bound pair wins ----
  M.sel.pad = Object.assign({}, M.sel.pad, { axX: 4, axY: 5 });
  o.boundWins = JSON.stringify(M.padStickAxes(P)) === '[4,5]';
  P.axes[4] = 1; P.axes[2] = 0;
  o.boundMoves = Math.abs(M.gamepadPad(0).dx) > 0.9;
  P.axes[4] = 0;
  delete M.sel.pad.axX; delete M.sel.pad.axY;
  o.autoAgain = JSON.stringify(M.padStickAxes(P)) === '[2,3]';

  // ---- 8. the deck menu goes through the same helper ----
  o.deckUsesHelper = /padStick\(/.test(M.pollDeckUI ? M.pollDeckUI.toString() : '');
  return o;
});
await p.close();

// ----------------------------------------------------- 1 (standard is untouched) --
const q = await pageWith('standard', [0, 0, 0, 0]);
const std = await q.evaluate(() => {
  const M = window.__magnet, P = window.__pad, o = {};
  o.axes = M.padStickAxes(P);
  P.axes[0] = 1;
  o.right = +M.gamepadPad(0).dx.toFixed(2);
  P.axes[0] = 0; P.axes[1] = 1;
  o.down = +M.gamepadPad(0).dy.toFixed(2);
  P.axes[1] = 0;
  return o;
});
await q.close();

// ------------------------------------------------------------------- report --
ok('the pad takes a seat', r.gotASeat, JSON.stringify(r));
ok('a NON-STANDARD pad still finds its stick', JSON.stringify(r.detected) === '[2,3]',
   `picked axes ${JSON.stringify(r.detected)} — axes 0 and 1 are the triggers here, and 0/1 is what the old code always read`);
ok('...and never mistakes a TRIGGER for it', r.triggersIgnored,
   'a trigger rests at -1, so an untouched one reads as a stick held hard over — pick it and the player drives into a wall for ever');
ok('all eight directions move', r.allMoved, JSON.stringify(r.dirs));
ok('...and all eight are DIFFERENT', r.headings === 8,
   `${r.headings} distinct headings from 8 pushes — "they all move" is true of a build that reports one direction for everything`);
ok('...with diagonals no faster than straights', r.diagNotFaster, JSON.stringify(r.speeds));
ok('a centred stick is still', r.restIsStill);
ok('the D-pad still works', r.dpadWorks, JSON.stringify(r.dpad));
ok('a hand-bound pair beats the automatic one', r.boundWins && r.boundMoves,
   JSON.stringify({ bound: r.boundWins, moves: r.boundMoves }));
ok('...and clearing it goes back to automatic', r.autoAgain);
ok('the deck menu reads the stick the same way', r.deckUsesHelper,
   'otherwise the menu is D-pad only on exactly the pads the player is D-pad only on');

ok('a STANDARD pad is untouched', JSON.stringify(std.axes) === '[0,1]', JSON.stringify(std));
ok('...and still moves', std.right === 1 && std.down === 1, JSON.stringify(std));

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ r, std }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL padstick\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS padstick');
