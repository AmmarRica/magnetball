// THE DIGITAL THUMBSTICK — eight directions and nothing between them.
//
// The on-screen stick was analogue: how far you pushed was how fast you went. It now reports
// one of eight directions, exactly as the keyboard already does. You are holding a direction
// or you are not.
//
// What this suite holds:
//   1. it is DIGITAL by default, and the pad reports -1, 0 or +1 and nothing else, swept over
//      the whole circle at every magnitude;
//   2. ⚠️ SPEED IS THE SAME IN ALL EIGHT, diagonals included. Two axes at full tilt is a
//      vector of length √2, so a diagonal is 41% faster than a straight line unless something
//      normalises it — and something already does, because `pollKeys` has always written ±1
//      for two arrow keys at once. Producing the keyboard's own shape here is what puts the
//      touch stick down that same path instead of a second parallel one;
//   3. a HALF PUSH IS FULL SPEED, which is the whole difference from analogue, and there is a
//      deadzone under it so a resting thumb is not a direction;
//   4. all eight are reachable — a control that can only be pushed four ways would make a
//      diagonal impossible, and the keyboard has been eight-way since it existed;
//   5. ⚠️ THE MARKER STAYS UNDER THE THUMB. The knob is drawn from the RAW touch position,
//      never the snapped one: a control being touched is attached to your finger and must not
//      float away from it — the same rule that keeps a live thumbstick off the tilt UI layer.
//      Measured in pixels, by moving the thumb WITHIN one direction's sector;
//   6. ⚠️ CONTROLLERS ARE UNTOUCHED. A real stick has an in-between and it should mean
//      something. This is the check that stops the snapping being "simplified" into
//      `applyHumanInput`, which every input method goes through;
//   7. turning it off restores the analogue behaviour exactly, and the choice survives a reload.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
// ⚠️ NO localStorage.clear() in here. An init script runs on every navigation, the reload
// included, so clearing here would wipe the very save the reload check is looking for — and
// it would fail as "the setting did not persist" rather than as "the test wiped it". A fresh
// page context starts with empty storage anyway.
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(() => {
  const M = window.__magnet; const o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();

  o.defaultIsDigital = M.defaultSel().touchDigital === 'on';
  o.tiles = Object.keys(M.TOUCHDIGOPT).length;

  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.sel.kickoffRule = 'off';
  M.setMatchSeed(5); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = w.players.find(q => q.ctrl === 'human1');

  // ⚠️ Driven through the REAL touch handlers — onDown/onMove and then applyHumanInput —
  // rather than by writing to `pads.p1`. The snapping happens in onMove, so a probe that set
  // the pad directly would be testing nothing at all.
  // Right thumb moves on a phone, so the move zone is the bottom RIGHT. Asserted below,
  // because a probe aimed at the KICK zone silently never reaches the move branch.
  const HOME = [330, 700];
  o.zone = M.zoneForTouch(HOME[0], HOME[1]);
  const push = (dx, dy) => {
    M.onUp(1);
    M.onDown(1, HOME[0], HOME[1]);
    M.onMove(1, HOME[0] + dx, HOME[1] + dy);
    M.applyHumanInput(me, M.pads.p1);
    return { pad: [M.pads.p1.dx, M.pads.p1.dy],
             raw: [M.pads.p1.rawX, M.pads.p1.rawY],
             inp: [me.inX, me.inY],
             speed: Math.hypot(me.inX, me.inY) };
  };
  const at = (deg, px) => push(Math.cos(deg*Math.PI/180)*px, Math.sin(deg*Math.PI/180)*px);

  // ---- 1 + 4. every angle, every magnitude: only -1/0/+1, and eight of them --
  const seen = new Set(); const speeds = []; let offGrid = null;
  for (let deg = 0; deg < 360; deg += 3){
    for (const px of [20, 34, 55, 90, 200]){
      const v = at(deg, px);
      for (const c of v.pad) if (c !== -1 && c !== 0 && c !== 1) offGrid = offGrid || [deg, px, v.pad];
      if (v.pad[0] || v.pad[1]){ seen.add(v.pad.join(',')); speeds.push(v.speed); }
    }
  }
  o.offGrid = offGrid;
  o.onlyOnesAndZeros = offGrid === null;
  o.directions = [...seen].sort();
  o.eightWay = seen.size === 8;

  // ---- 2. and every one of them at the SAME speed -------------------------
  o.speedMin = +Math.min(...speeds).toFixed(4);
  o.speedMax = +Math.max(...speeds).toFixed(4);
  o.evenSpeed = o.speedMax - o.speedMin < 0.001 && Math.abs(o.speedMax - 1) < 0.001;
  // Named, so a failure says which pair went wrong rather than just "a spread".
  o.rightSpeed = +at(0, 90).speed.toFixed(4);
  o.diagSpeed  = +at(45, 90).speed.toFixed(4);
  o.diagNotFaster = Math.abs(o.diagSpeed - o.rightSpeed) < 0.001;

  // ---- 3. a half push is full speed, and a resting thumb is nothing --------
  const R = 62 / (M.sel.sens || 1);
  o.halfPush = +at(0, R*0.5).speed.toFixed(3);
  o.fullPush = +at(0, R*1.5).speed.toFixed(3);
  o.halfIsFull = Math.abs(o.halfPush - o.fullPush) < 0.001 && o.halfPush > 0.99;
  o.deadPush = +at(0, R*M.TOUCHDIG.dead*0.6).speed.toFixed(3);
  o.hasDeadzone = o.deadPush === 0;
  // ...and just past the deadzone it is already at full speed, not ramping up.
  o.justPast = +at(0, R*M.TOUCHDIG.dead*1.3).speed.toFixed(3);
  o.noRamp = o.justPast > 0.99;

  // ---- 5. the marker follows the THUMB, not the snapped direction ----------
  // Two thumb positions inside ONE sector: the input must be identical and the raw position
  // must not be. Both halves matter — same input alone would also be true of a build that
  // ignored the thumb, and different raw alone says nothing about what the game was told.
  const a1 = at(-8, 55), a2 = at(8, 55);
  o.sameSector = a1.pad.join() === a2.pad.join() && a1.pad.join() === '1,0';
  o.rawDiffers = Math.abs(a1.raw[1] - a2.raw[1]) > 0.05;

  // ---- 6. a CONTROLLER is still analogue -----------------------------------
  // ⚠️ Stubbed at `navigator.getGamepads`, so it goes through the real `gamepadPad`. The
  // snapping lives in onMove precisely so it cannot reach here; if it were moved into
  // `applyHumanInput` — which every input method goes through — this is what would notice.
  const realGP = navigator.getGamepads;
  navigator.getGamepads = () => ([{ axes:[0.5, 0], buttons: Array.from({length:16}, () => ({pressed:false, value:0})), connected:true, mapping:'standard' }]);
  const gp = M.gamepadPad(0);
  const bot = w.players.find(q => q.ctrl !== 'human1');
  const wasCtrl = bot.ctrl, wasIdx = bot.padIndex;
  bot.ctrl = 'gamepad'; bot.padIndex = 0;
  M.applyHumanInput(bot, M.padFor(bot));
  o.padStickRaw = +gp.dx.toFixed(3);
  o.padStickSpeed = +Math.hypot(bot.inX, bot.inY).toFixed(3);
  o.controllerStaysAnalogue = Math.abs(o.padStickSpeed - 0.5) < 0.02;
  bot.ctrl = wasCtrl; bot.padIndex = wasIdx;
  navigator.getGamepads = realGP;

  // ---- 7. off is the old behaviour, exactly --------------------------------
  M.sel.touchDigital = 'off';
  o.analogueHalf = +at(0, R*0.5).speed.toFixed(3);
  o.analogueFull = +at(0, R*1.5).speed.toFixed(3);
  o.offIsAnalogue = o.analogueHalf > 0.4 && o.analogueHalf < 0.6 && Math.abs(o.analogueFull - 1) < 0.01;
  // ...and a diagonal is still not faster there either, because applyHumanInput normalises.
  o.analogueDiag = +at(45, R*1.5).speed.toFixed(3);
  o.analogueDiagOk = Math.abs(o.analogueDiag - o.analogueFull) < 0.01;
  M.sel.touchDigital = 'on';

  // ---- the KEYBOARD is untouched -------------------------------------------
  // It already wrote ±1 into the same fields; that is the shape the touch stick now copies.
  M.onUp(1);
  M.keys['arrowright'] = true; M.keys['arrowup'] = true;
  M.pollKeys();
  o.keyPad = [M.pads.p1.dx, M.pads.p1.dy];
  M.applyHumanInput(me, M.pads.p1);
  o.keySpeed = +Math.hypot(me.inX, me.inY).toFixed(3);
  M.keys['arrowright'] = false; M.keys['arrowup'] = false; M.pollKeys();
  o.keyboardUnchanged = o.keyPad.join() === '1,-1' && Math.abs(o.keySpeed - 1) < 0.001;

  // ---- the control is in the menu ------------------------------------------
  const host = document.getElementById('touchDigPick');
  o.controlExists = !!host;
  o.controlTiles = host ? host.querySelectorAll('.opt').length : 0;
  o.inControlsCard = !!(host && host.closest('.card') && host.closest('.card').dataset.sec === 'controls');
  o.findableBySearch = M.menuSearchRank(M.menuSearchIndex(), 'thumbstick').length > 0
                    && M.menuSearchRank(M.menuSearchIndex(), 'digital').length > 0;
  return o;
});

// ============================================================
//  Pixels: the knob is drawn where the thumb is
// ============================================================
// ⚠️ Measured on the canvas, because "raw differs from the snapped value" only proves the
// number exists — `drawPad` still has to READ it. Two thumb positions inside one sector: the
// knob must move between them (it follows the finger) while the pip on the rim must not (it
// shows the direction, which has not changed).
const px = await p.evaluate(() => {
  const M = window.__magnet; const o = {};
  M.sel.touchDigital = 'on';
  M.sel.mode = '1v1'; M.sel.lobby = 'off';
  M.setMatchSeed(5); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const cv = document.getElementById('game'), c = cv.getContext('2d', { willReadFrequently:true });
  const HOME = [330, 700];
  const shot = (deg, px2) => {
    M.onUp(1); M.onDown(1, HOME[0], HOME[1]);
    M.onMove(1, HOME[0] + Math.cos(deg*Math.PI/180)*px2, HOME[1] + Math.sin(deg*Math.PI/180)*px2);
    c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
    M.drawPad(M.pads.p1, false);
    return c.getImageData(HOME[0]-90, HOME[1]-90, 180, 180).data;
  };
  // The centroid of everything drawn, weighted by brightness — the knob is the biggest mark.
  const centroid = (f) => {
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < 180; y++) for (let x = 0; x < 180; x++){
      const i = (y*180 + x)*4, l = f[i]*0.2126 + f[i+1]*0.7152 + f[i+2]*0.0722;
      if (l > 40){ sx += x*l; sy += y*l; n += l; }
    }
    return n ? [sx/n, sy/n, n] : [0, 0, 0];
  };
  const up = centroid(shot(-14, 55)), down = centroid(shot(14, 55));
  o.inkUp = Math.round(up[2]); o.inkDown = Math.round(down[2]);
  o.drewSomething = up[2] > 1000 && down[2] > 1000;
  o.knobMoved = +Math.abs(up[1] - down[1]).toFixed(2);
  o.knobFollowsThumb = o.knobMoved > 3;
  // ...and both of those are the same direction, so the movement is the thumb and not the pip.
  M.onUp(1); M.onDown(1, HOME[0], HOME[1]); M.onMove(1, HOME[0]+53, HOME[1]-13);
  o.sectorA = [M.pads.p1.dx, M.pads.p1.dy];
  M.onMove(1, HOME[0]+53, HOME[1]+13);
  o.sectorB = [M.pads.p1.dx, M.pads.p1.dy];
  o.oneSector = o.sectorA.join() === o.sectorB.join();
  M.onUp(1);
  return o;
});

await p.evaluate(() => { window.__magnet.sel.touchDigital = 'off'; window.__magnet.saveSel(); });
await p.reload();
await p.waitForTimeout(700);
const afterReload = await p.evaluate(() => window.__magnet.sel.touchDigital);

ok('it is DIGITAL by default', r.defaultIsDigital, String(r.defaultIsDigital));
ok('the probe is aimed at the MOVE zone', r.zone && r.zone.kind === 'move',
   `${JSON.stringify(r.zone)} — a probe aimed at the kick zone never reaches the move branch and every check below would pass on a stick that was never touched`);
ok('the pad reports only -1, 0 or +1', r.onlyOnesAndZeros,
   `found ${JSON.stringify(r.offGrid)} — swept over the whole circle at five magnitudes, there is no in-between`);
ok('all EIGHT directions are reachable', r.eightWay,
   `got ${r.directions.length}: ${JSON.stringify(r.directions.slice(0, 10))}${r.directions.length > 10 ? ' …' : ''} — four would make a diagonal impossible, and the keyboard has been eight-way since it existed`);
ok('every direction moves you at the SAME speed', r.evenSpeed,
   `speeds ran ${r.speedMin} to ${r.speedMax} — two axes at full tilt is a vector of length √2, so a diagonal is 41% faster than a straight line unless it is normalised`);
ok('...including the diagonals specifically', r.diagNotFaster,
   `straight ${r.rightSpeed} against diagonal ${r.diagSpeed}`);

ok('a HALF push is full speed', r.halfIsFull,
   `half ${r.halfPush} against full ${r.fullPush} — this is the whole difference from analogue`);
ok('...but a resting thumb is nothing', r.hasDeadzone, `inside the deadzone gave ${r.deadPush}`);
ok('...and there is no ramp just past it', r.noRamp,
   `${r.justPast} just outside the deadzone — a digital stick is on or off, not on-ish`);

ok('the marker follows the THUMB, not the direction', r.sameSector && r.rawDiffers,
   `two thumb positions in one sector: input ${JSON.stringify(r.sameSector)}, raw moved ${r.rawDiffers} — a control being touched is attached to your finger and must not float away from it`);
ok('the knob was actually drawn', px.drewSomething, `${px.inkUp} / ${px.inkDown} lit`);
ok('...and it MOVES with the thumb inside one sector', px.knobFollowsThumb,
   `the drawn knob shifted ${px.knobMoved}px between two thumb positions that give the same input — "raw differs from snapped" only proves the number exists, drawPad still has to read it`);
ok('...which really is one sector', px.oneSector,
   `${JSON.stringify(px.sectorA)} vs ${JSON.stringify(px.sectorB)} — if the two probes straddled a boundary the knob would have moved because the DIRECTION changed, which proves nothing`);

ok('a CONTROLLER is still analogue', r.controllerStaysAnalogue,
   `a stick at 0.5 drove the player at ${r.padStickSpeed} — a real stick has an in-between and it should mean something. This is what would notice the snapping being moved into applyHumanInput, which every input method goes through`);
ok('the KEYBOARD is unchanged', r.keyboardUnchanged,
   `right+up gave ${JSON.stringify(r.keyPad)} at speed ${r.keySpeed} — it already wrote ±1 into these fields, and that is the shape the touch stick now copies`);

ok('turning it off restores analogue', r.offIsAnalogue,
   `half ${r.analogueHalf}, full ${r.analogueFull} — off has to be the old behaviour exactly, or it is not an escape hatch`);
ok('...where a diagonal is still not faster', r.analogueDiagOk, `${r.analogueDiag} vs ${r.analogueFull}`);

ok('the control is in the Controls card', r.controlExists && r.inControlsCard && r.controlTiles === 2,
   `${r.controlTiles} tiles, in controls: ${r.inControlsCard}`);
ok('...and search reaches it', r.findableBySearch);
ok('the choice survives a reload', afterReload === 'off', String(afterReload));
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify({ ...r, ...px, afterReload }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL digitalpad\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS digitalpad');
