// FOUR CONTROLLERS, PLUGGED IN, PLAYING.
//
// ⚠️ THE BUG THIS EXISTS FOR: four pads connected, four controller icons drawn on screen,
// the Input hint reading "4 controllers detected", the warm-up lobby up — and **zero
// seats handed out**, because `sel.controllers` defaulted to `'off'` and `padsTakeSeats()`
// is the only thing that reads it. Every surface that could reassure a player said the
// controllers were there; the one function that decides whether they play said no. So the
// player is hunting for a setting whose existence nothing on screen implies.
//
// It is the same shape as the Steam Deck bug one layer up: the game could SEE the
// controller and still gave it nothing to drive. Both are now "a connected controller
// takes a seat", and this suite is the one that would have caught it.
//
// ⚠️ "A seat was handed out" is NOT the claim. A seat that exists but is driven by the
// wrong pad, or that four pads share, looks identical from `w.players`. So every pad is
// pushed ON ITS OWN and has to move ITS OWN body and nobody else's.
//
// ⚠️ Two measurement traps, both hit while writing this:
//   1. bots parked at 9e4 do not stay there — `integrate` clamps every player to
//      bounds+20, so they are dragged back onto the touchline and can land on top of a
//      seat, which reads exactly like one pad driving another player's body;
//   2. seats spaced 100 units apart COLLIDE — a body travelling 65 with two 15-unit radii
//      bumps its neighbour, and the run scored a tidy 65.1/14.7 on all four pads, which
//      looks like consistent cross-talk and is just physics. The others are parked at the
//      far end now.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const withPads = async (n) => {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
  await p.addInitScript((count) => {
    window.__MAGNETDEBUG = true;
    const mk = i => ({ index: i, id: 'Fake Pad ' + i, connected: true, mapping: 'standard',
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

// ===================================================== four pads, out of the box ==
const p = await withPads(4);
const o = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // ⚠️ NOTHING IS CONFIGURED FIRST. That is the whole point — the report was four
  // controllers that could not join on the settings a player actually has.
  o.defaultControllers = M.defaultSel().controllers;
  o.padsSeen = M.connectedGamepadIndices().length;
  o.takeSeats = M.padsTakeSeats();

  M.sel.mode = '4v4'; M.setMatchSeed(5); M.startMatch();
  const w = M.world;
  const seats = w.players.filter(q => q.ctrl === 'gamepad');
  o.seatCount = seats.length;
  o.padIndices = seats.map(q => q.padIndex).sort();
  o.eachPadOnce = new Set(o.padIndices).size === o.padIndices.length;
  o.teams = seats.map(q => q.team);
  // Versus interleaves, so four pads land two a side rather than all on one.
  o.splitTwoAndTwo = o.teams.filter(t => t === 0).length === 2 &&
                     o.teams.filter(t => t === 1).length === 2;
  // ...and the lobby comes up, which is where people pick sides.
  o.lobbyWanted = M.lobbyWanted(w);
  o.state = w.state;
  o.humans = M.lobbyHumans(w).length;
  return o;
});

// ============================================ each pad drives its own body, alone ==
const drive = await p.evaluate(() => {
  const M = window.__magnet, o = { rows: [] };
  M.sel.mode = '4v4'; M.sel.lobby = 'off'; M.setMatchSeed(5); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const seats = w.players.filter(q => q.ctrl === 'gamepad');
  const hw = w.bounds.halfW, hl = w.bounds.halfL;
  // Bots at VALID coordinates, well away — see trap 1 in the header.
  w.players.filter(q => q.ctrl === 'bot').forEach((q, i) => {
    q.x = -hw * 0.6 + i * (hw * 0.35); q.y = hl * 0.85; q.vx = 0; q.vy = 0; });
  w.ball.x = 0; w.ball.y = hl * 0.9;

  for (let k = 0; k < 4; k++){
    const mine = seats.findIndex(q => q.padIndex === k);
    // The other three at the far end — see trap 2.
    seats.forEach((q, i) => {
      if (i === mine){ q.x = 0; q.y = -hl * 0.55; } else { q.x = -hw * 0.7 + i * (hw * 0.45); q.y = hl * 0.55; }
      q.vx = 0; q.vy = 0;
    });
    const before = seats.map(q => q.x);
    window.__pads[k].axes[0] = 1;                   // this pad only, hard right
    for (let i = 0; i < 30; i++) M.step(w);
    window.__pads[k].axes[0] = 0;
    const d = seats.map((q, i) => +(q.x - before[i]).toFixed(1));
    o.rows.push({ pad: k, seat: mine, deltas: d,
                  onlyMine: d.every((v, i) => i === mine ? v > 5 : Math.abs(v) < 1) });
  }
  o.allIsolated = o.rows.every(r => r.onlyMine);

  // KICK reaches one seat and only one, the same way.
  seats.forEach((q, i) => { q.x = -hw * 0.7 + i * (hw * 0.45); q.y = 0; q.vx = 0; q.vy = 0; });
  window.__pads[1].buttons[0].pressed = true;
  for (let i = 0; i < 10; i++) M.step(w);
  const kicked = seats.map(q => !!q.kick);
  window.__pads[1].buttons[0].pressed = false;
  o.kicked = kicked;
  o.oneKick = kicked.filter(Boolean).length === 1 &&
              seats[kicked.indexOf(true)].padIndex === 1;
  return o;
});

// ================================================= START gets them out of the lobby ==
const start = await p.evaluate(() => {
  const M = window.__magnet;
  M.sel.mode = '4v4'; M.sel.lobby = 'on'; M.setMatchSeed(5); M.startMatch();
  const w = M.world;
  const wasWarmup = w.state === 'warmup';
  for (const pd of window.__pads) pd.buttons[9].pressed = true;    // Start
  for (let i = 0; i < 300; i++){ M.step(w); if (w.state !== 'warmup') break; }
  for (const pd of window.__pads) pd.buttons[9].pressed = false;
  return { wasWarmup, after: w.state, left: w.state !== 'warmup' };
});
await p.close();

// ============================================================ one pad, and none ==
// A single controller has to drive YOU, not an opponent — and with no pad at all nothing
// about this may change, or the fix has cost every touch and keyboard player their seat.
const one = await withPads(1);
const solo = await one.evaluate(() => {
  const M = window.__magnet;
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.startMatch();
  const w = M.world;
  const seats = w.players.filter(q => q.ctrl === 'gamepad');
  return { seats: seats.length, isYou: seats.length === 1 && w.players[0] === seats[0],
           team: seats.length ? seats[0].team : null };
});
await one.close();

const none = await withPads(0);
const bare = await none.evaluate(() => {
  const M = window.__magnet;
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.startMatch();
  const w = M.world;
  return { takeSeats: M.padsTakeSeats(), gamepadSeats: w.players.filter(q => q.ctrl === 'gamepad').length,
           youAreHuman1: w.players[0].ctrl === 'human1',
           keyboardDrives: M.keyboardDrivesGame(),
           lobbyWanted: M.lobbyWanted(w), warmupOffered: M.warmupUseful() };
});
// ...and the keyboard still moves you with no pad connected.
const kb = await none.evaluate(() => {
  const M = window.__magnet;
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = w.players[0];
  me.x = 0; me.y = 0; me.vx = 0; me.vy = 0;
  w.players[1].x = 9e3; w.players[1].y = 0;
  M.pads.p1.dx = 1; M.pads.p1.dy = 0;
  for (let i = 0; i < 30; i++) M.step(w);
  M.pads.p1.dx = 0;
  return { moved: +me.x.toFixed(1) };
});
await none.close();

// -------------------------------------------------------------------- report --
ok('a connected controller takes a seat OUT OF THE BOX', o.defaultControllers === 'on' && o.takeSeats,
   `default is '${o.defaultControllers}' — it shipped as 'off', so four pads showed four icons, listed themselves in the Input hint, brought up the warm-up lobby, and drove nothing`);
ok('all four pads are seen', o.padsSeen === 4, `${o.padsSeen}`);
ok('...and all four get a seat', o.seatCount === 4, `${o.seatCount} seats from ${o.padsSeen} pads`);
ok('...one pad each, no sharing', o.eachPadOnce, JSON.stringify(o.padIndices));
ok('...two a side', o.splitTwoAndTwo, `${JSON.stringify(o.teams)} — Versus interleaves, so four people are 2v2 rather than everyone on one team`);
ok('...and the lobby comes up so they can pick sides', o.lobbyWanted && o.state === 'warmup' && o.humans === 4,
   JSON.stringify({ wanted: o.lobbyWanted, state: o.state, humans: o.humans }));

ok('EACH PAD MOVES ITS OWN BODY AND NOBODY ELSE\'S', drive.allIsolated,
   JSON.stringify(drive.rows) + ' — a seat driven by the wrong pad, or four pads sharing one, looks identical from w.players, so each is pushed on its own');
ok('...and KICK reaches exactly one seat', drive.oneKick, JSON.stringify(drive.kicked));
ok('START gets four players out of the lobby', start.wasWarmup && start.left,
   JSON.stringify(start) + ' — a lobby four people cannot leave is the same bug wearing a different hat');

ok('one controller drives YOU', solo.seats === 1 && solo.isYou && solo.team === 0,
   JSON.stringify(solo) + ' — a single pad taking the opponent\'s seat would be worse than none');

ok('no controller changes nothing', bare.gamepadSeats === 0 && bare.youAreHuman1 && bare.keyboardDrives,
   `${JSON.stringify(bare)} — the seat is only ever handed out when a pad exists, which is why there is no separate "auto" state`);
ok('...and the keyboard still moves you', kb.moved > 5,
   `${kb.moved} units — the fix must not cost touch and keyboard players their seat`);
ok('...and the lobby is not forced on somebody with no pad', !bare.lobbyWanted,
   'the lobby exists to test a stick and pick a side; with no controller there is neither');

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ o, drive, start, solo, bare, kb }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL fourpads\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS fourpads');
