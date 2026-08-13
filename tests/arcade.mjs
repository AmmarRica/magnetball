// THE STANDUP ARCADE — a cabinet, four panels, one keyboard.
//
// A fourth Display layout beside Auto, Steam Deck and Cocktail: an upright cab with four sets
// of controls, everybody stood shoulder to shoulder facing one screen. Four people against the
// AI, or two a side. The panel is wired to the keyboard the way a real cabinet is — a JAMMA
// harness into an encoder — so the map is MAME's own defaults and needs no configuration.
//
// What this suite holds:
//   1. FOUR PANELS, FOUR SEATS, with no gamepad plugged in at all. The panels are presented
//      as virtual pads through `connectedGamepadIndices`/`gamepadPad`, which is the whole
//      design — everything downstream (seat handout, the lobby, drop-in, evening the sides
//      up) inherits a cabinet instead of growing a parallel path;
//   2. ⚠️ BOUND TO `e.code`, NOT `e.key`, and the trap is P4. A numpad key's `e.key` is never
//      its own name: with NumLock ON, `Numpad6` reports "6" — P2's coin slot — and with it
//      OFF it reports "ArrowRight", which is P1's stick. So an `e.key` build cross-wires two
//      panels whichever way the cabinet's encoder leaves the lock, and P4 pushing right
//      either drops somebody else's coin or drives somebody else's player. Chromium drives
//      synthetic keys NumLock-off, so what this suite measures is the second: press Numpad6,
//      P4 goes right and NOTHING ELSE MOVES. ⚠️ A suite that only checked "P4 goes right"
//      passes on the broken build, because on `e.key` P4 still moves — it is the collateral
//      that has to be asserted, not the press;
//   3. the ordinary KEYBOARD SEAT stands down — leaving it live hands P1's stick to two
//      players at once, the one they were given and whoever holds `human1`;
//   4. a panel stick is DIGITAL, ±1 per axis and nothing else, because a cabinet stick is
//      four microswitches;
//   5. COIN-OP takes a credit and refuses without one; FREE PLAY takes none but still counts
//      the play, because an operator wants to know how much the cab is used either way;
//   6. a coin is EDGE-TRIGGERED — holding the switch banks one credit, not one a frame;
//   7. ⚠️ START only starts a game FROM THE MENU. Mid-match it is the lobby's ready button,
//      and hijacking it would take the game off four people because one leant on the panel;
//   8. ⚠️ THE LOBBY IS LEAVABLE FROM THE PANEL. `pollLobbyStart` reads the Gamepad API
//      directly rather than through `gamepadPad`, so it is the one place the virtual-pad
//      trick does NOT carry a cabinet for free — and before `arcadeStartHeld` it did not, so
//      four people stood at a live START switch waiting on the 30-second auto-start;
//   9. the takings PERSIST and are kept OUT of `sel` — `saveSel()` serialises all of `sel`
//      and `syncAdopt()` shallow-merges it between two windows, which is exactly the wrong
//      thing to do to a counter;
//  10. the operator screen builds, the service key opens it, and the reset ARMS first;
//  11. a cabinet is NOT a touch layout however narrow its monitor, or two thumbsticks nobody
//      can press are drawn over the pitch.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

// ⚠️ A DESKTOP viewport with no touch. A cabinet is neither a phone nor a pad, and sizing
// this like a handset would make `isTouchLayout` false for the wrong reason.
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const arm = () => p.evaluate(() => {
  const M = window.__magnet, S = M.sel;
  S.display = 'arcade'; S.lobby = 'off'; S.dropIn = 'off';
  M.arcade = { credits: 0, coins: 0, plays: 0 };
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
});

// ---------------------------------------------------------------- 1, 3, 11 --
await arm();
const seats = await p.evaluate(() => {
  const M = window.__magnet, S = M.sel, o = {};
  // ⚠️ No gamepad is stubbed anywhere in this file. The point is that a cabinet needs none.
  o.realPads = ((navigator.getGamepads && navigator.getGamepads()) || []).filter(Boolean).length;
  o.controllersSetting = S.controllers;          // left at its default, deliberately
  o.takesSeats = M.padsTakeSeats();
  o.indices = M.connectedGamepadIndices();
  o.keyboardStandsDown = M.keyboardDrivesGame() === false;
  o.viewMode = M.viewMode();
  o.notTouch = M.isTouchLayout() === false;

  S.mode = '2v2'; S.coop = 'off';
  M.startMatch();
  o.twoVtwo = M.world.players.map(q => q.ctrl[0] + q.team).join(' ');
  o.humans2v2 = M.world.players.filter(q => q.ctrl === 'gamepad').length;

  S.mode = '4v4'; S.coop = 'on';
  M.startMatch();
  o.fourVai = M.world.players.map(q => q.ctrl[0] + q.team).join(' ');
  o.humansOnOneSide = M.world.players.filter(q => q.ctrl === 'gamepad')
                       .every(q => q.team === M.world.players.find(z => z.ctrl === 'gamepad').team);
  o.humans4vAI = M.world.players.filter(q => q.ctrl === 'gamepad').length;
  o.botsFacing = M.world.players.filter(q => q.ctrl === 'bot').length;

  // The layout is what makes any of this true — with it off, nothing above holds.
  S.display = 'auto';
  o.offAgain = { seats: M.padsTakeSeats(), idx: M.connectedGamepadIndices().length,
                 kbd: M.keyboardDrivesGame() };
  S.display = 'arcade';
  return o;
});

// -------------------------------------------------------------------- 2, 4 --
// Every panel driven through REAL key events, so `e.code` is what the page sees.
const stick = { };
for (const [name, keyDowns, seat] of [
  ['p1right', ['ArrowRight'], 0], ['p1fire', ['ControlLeft'], 0],
  ['p2up',    ['KeyR'],       1], ['p2fire', ['KeyS'],       1],
  ['p3left',  ['KeyJ'],       2], ['p3fire', ['ShiftRight'], 2],
  ['p4right', ['Numpad6'],    3], ['p4up',   ['Numpad8'],    3],
  ['p4fire',  ['Numpad0'],    3],
  ['p4diag',  ['Numpad8', 'Numpad6'], 3],
]){
  for (const k of keyDowns) await p.keyboard.down(k);
  stick[name] = await p.evaluate(i => {
    const M = window.__magnet;
    return { pad: M.arcadePad(i), coins: M.arcade.coins, credits: M.arcade.credits,
             others: [0,1,2,3].filter(j => j !== i)
                       .map(j => M.arcadePad(j))
                       .filter(q => q.dx || q.dy || q.kick).length };
  }, seat);
  for (const k of keyDowns) await p.keyboard.up(k);
}

// Sweep every panel key and confirm the axes never leave {-1,0,1}.
const sweep = await p.evaluate(() => {
  const M = window.__magnet;
  const bad = [];
  for (let i = 0; i < 4; i++){
    const v = M.arcadePad(i);
    for (const c of [v.dx, v.dy]) if (c !== -1 && c !== 0 && c !== 1) bad.push([i, c]);
  }
  return { bad, resting: [0,1,2,3].every(i => { const v = M.arcadePad(i); return !v.dx && !v.dy && !v.kick; }) };
});

// --------------------------------------------------------------------- 5-6 --
await arm();
const free = await p.evaluate(() => {
  const M = window.__magnet;
  M.sel.arcadePlay = 'free';
  const a = M.arcadeSpend(), b2 = M.arcadeSpend();
  return { a, b2, plays: M.arcade.plays, credits: M.arcade.credits, coins: M.arcade.coins };
});

await arm();
const coinRefuse = await p.evaluate(() => {
  const M = window.__magnet;
  M.sel.arcadePlay = 'coin';
  return { spend: M.arcadeSpend(), plays: M.arcade.plays };
});
// One press = one credit. ⚠️ HELD DOWN, and the repeats dispatched by hand: Chromium's
// synthetic keyboard does not auto-repeat, so `keyboard.down` + a wait proves nothing at all
// about a held switch — it is one keydown either way, and the `e.repeat` guard can be deleted
// with the suite still green. A real OS sends `keydown` with `repeat: true` every few tens of
// milliseconds while a key is down, and that is what an unguarded coin slot banks a credit for.
await p.keyboard.down('Digit5');
await p.waitForTimeout(120);
await p.evaluate(() => {
  for (let i = 0; i < 20; i++)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit5', key: '5', repeat: true, bubbles: true }));
});
const heldCoin = await p.evaluate(() => ({ ...window.__magnet.arcade }));
await p.keyboard.up('Digit5');
const coinSpend = await p.evaluate(() => {
  const M = window.__magnet;
  return { before: M.arcade.credits, spend: M.arcadeSpend(),
           after: M.arcade.credits, plays: M.arcade.plays, coins: M.arcade.coins };
});
// A second coin slot belongs to a different player and banks the same credit pool.
await p.keyboard.press('Digit8');
const coinP4 = await p.evaluate(() => ({ ...window.__magnet.arcade }));

// ----------------------------------------------------------------------- 7 --
await arm();
const startRules = await p.evaluate(() => {
  const M = window.__magnet;
  M.sel.arcadePlay = 'free'; M.sel.mode = '1v1';
  M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 3;
  return { seed: w.seed, plays: M.arcade.plays };
});
await p.keyboard.press('Digit1');                       // START, mid-match
const startMid = await p.evaluate(() => {
  const M = window.__magnet;
  return { sameMatch: M.world.seed === M.world.seed, state: M.world.state,
           plays: M.arcade.plays, stateT: M.world.stateT };
});
// ...and once the match is OVER it does. ⚠️ Driven by ending the match rather than by
// calling `toMenu()`, because on a desktop-sized window the menu is a left DOCK and the
// match on the right keeps playing — so `toMenu` there is not "no game in progress" and
// START is right to ignore it. A cabinet's own idle screen is the attract demo, checked
// separately below.
await p.evaluate(() => { window.__magnet.world.state = 'over'; });
await p.keyboard.press('Digit2');
await p.waitForTimeout(80);
const startOver = await p.evaluate(() => ({ running: window.__magnet.running,
                                            plays: window.__magnet.arcade.plays,
                                            state: window.__magnet.world && window.__magnet.world.state }));
// The attract demo is NOT a game in progress — it is what the cab does while nobody plays.
const idlePred = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.world.state = 'play'; o.livePlay = M.arcadeIdle();
  M.world.demo = true;    o.demo = M.arcadeIdle();
  M.world.demo = false; M.world.state = 'over'; o.over = M.arcadeIdle();
  // ⚠️ A PAUSED match is still a game in progress. This is the one place `arcadeIdle`
  // deliberately differs from `updCanShow`, which asks a similar question and counts a pause
  // as fine — an update prompt over a pause is, starting a fresh game over one is not.
  M.world.state = 'play'; M.paused = true; o.paused = M.arcadeIdle(); M.paused = false;
  return o;
});

// ----------------------------------------------------------------------- 8 --
// The warm-up lobby, left from the panel. ⚠️ Driven through the REAL `pollLobbyStart`, which
// is the function that reaches for the Gamepad API — a probe that called `lobbyStart()`
// directly would pass on the build where the switch does nothing.
const lobby = await p.evaluate(() => {
  const M = window.__magnet, S = M.sel;
  S.display = 'arcade'; S.mode = '2v2'; S.coop = 'off'; S.lobby = 'on';
  M.startMatch();
  return { wanted: M.lobbyWanted(M.world), state: M.world.state,
           humans: M.lobbyHumans(M.world).map(q => q.ctrl + q.padIndex).join(' ') };
});
const lobbyIdle = await p.evaluate(() => {
  const M = window.__magnet;
  for (let i = 0; i < 5; i++) M.pollLobbyStart(M.world);
  return M.world.state;
});
await p.keyboard.down('Digit1');
const lobbyOut = await p.evaluate(() => {
  const M = window.__magnet;
  for (let i = 0; i < 5; i++) M.pollLobbyStart(M.world);
  return M.world.state;
});
await p.keyboard.up('Digit1');

// ----------------------------------------------------------------------- 9 --
const book = await p.evaluate(() => {
  const M = window.__magnet;
  M.arcade = { credits: 3, coins: 11, plays: 7 };
  M.saveArcade(); M.saveSel();
  const selRaw = localStorage.getItem('magnetball.sel') || '';
  return { stored: JSON.parse(localStorage.getItem('magnetball.arcade') || 'null'),
           inSel: /coins|credits|plays/.test(selRaw),
           selHasMode: /arcadePlay/.test(selRaw) };
});
await p.reload();
await p.waitForTimeout(700);
const afterReload = await p.evaluate(() => ({ ...window.__magnet.arcade,
                                              mode: window.__magnet.sel.arcadePlay,
                                              display: window.__magnet.sel.display }));

// -------------------------------------------------------------------- 10 --
const screen = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.display = 'arcade';
  M.openArcadeCfg();
  const el = document.getElementById('arcadeCfg');
  o.opens = !el.classList.contains('hidden');
  o.bookRows = document.getElementById('arcadeBook').children.length;
  o.keyRows = document.getElementById('arcadeKeys').children.length;
  o.modeTiles = document.getElementById('arcadePlayPick').children.length;
  o.status = document.getElementById('arcadeStatus').textContent;
  // The panel map has to name the SWITCHES, not the codes a programmer reads.
  o.p4row = document.getElementById('arcadeKeys').children[3].textContent;
  o.readable = /Num 8/.test(o.p4row) && !/Numpad8/.test(o.p4row);
  o.p1row = document.getElementById('arcadeKeys').children[0].textContent;
  o.p1readable = /L-Ctrl/.test(o.p1row) && !/ControlLeft/.test(o.p1row);
  // ...and the takings really are on it.
  o.showsCoins = [...document.getElementById('arcadeBook').children]
                   .some(r => /11/.test(r.textContent));
  // The Display card carries the way in.
  M.openLook('display');
  const bx = document.getElementById('arcadeBox');
  o.boxShown = bx && bx.style.display !== 'none';
  M.sel.display = 'auto'; M.buildSettings();
  o.boxHidden = document.getElementById('arcadeBox').style.display === 'none';
  M.sel.display = 'arcade'; M.buildSettings();
  return o;
});
// The service key opens it from the panel.
await p.evaluate(() => window.__magnet.toMenu());
await p.waitForTimeout(60);
await p.keyboard.press('F2');
await p.waitForTimeout(80);
const service = await p.evaluate(() => !document.getElementById('arcadeCfg').classList.contains('hidden'));
// Reset ARMS first.
const armReset = await p.evaluate(() => {
  const M = window.__magnet;
  M.arcade = { credits: 2, coins: 9, plays: 4 }; M.buildArcadeRows();
  const btn = document.getElementById('arcadeClear');
  const label0 = btn.textContent;
  btn.onclick();                                     // first press: arms only
  const armed = { label: btn.textContent, coins: M.arcade.coins };
  btn.onclick();                                     // second press: does it
  return { label0, armed, after: { ...M.arcade }, label2: btn.textContent };
});

// ----------------------------------------------------------------- report --
ok('a cabinet needs NO real gamepad', seats.realPads === 0, `${seats.realPads} connected`);
ok('...and takes seats anyway', seats.takesSeats && seats.controllersSetting !== 'on',
   `padsTakeSeats ${seats.takesSeats} with controllers="${seats.controllersSetting}" — the layout is what turns seats on here, not the Controllers setting`);
ok('four panels arrive as four pads', JSON.stringify(seats.indices) === '[0,1,2,3]', JSON.stringify(seats.indices));
ok('2v2 fields four people', seats.humans2v2 === 4, `${seats.twoVtwo}`);
ok('4-vs-AI puts all four on one side', seats.humans4vAI === 4 && seats.humansOnOneSide && seats.botsFacing === 4,
   `${seats.fourVai}`);
ok('the keyboard seat stands down', seats.keyboardStandsDown,
   'leaving it live gives P1s stick to two players at once — the seat it was assigned AND whoever holds human1');
ok('a cabinet is not a touch layout', seats.notTouch && seats.viewMode === 'arcade',
   `viewMode ${seats.viewMode} — on-screen thumbsticks on a cab are two controls nobody can press, drawn over the pitch`);
ok('...and none of it holds with the layout off', !seats.offAgain.seats && seats.offAgain.idx === 0 && seats.offAgain.kbd,
   JSON.stringify(seats.offAgain) + ' — without this the checks above pass on a build where every layout behaves this way');

ok('P1 stick reads', stick.p1right.pad.dx === 1 && stick.p1right.pad.dy === 0, JSON.stringify(stick.p1right.pad));
ok('P1 fire reads', stick.p1fire.pad.kick, JSON.stringify(stick.p1fire.pad));
ok('P2 stick reads', stick.p2up.pad.dy === -1, JSON.stringify(stick.p2up.pad));
ok('P2 fire reads', stick.p2fire.pad.kick, JSON.stringify(stick.p2fire.pad));
ok('P3 stick reads', stick.p3left.pad.dx === -1, JSON.stringify(stick.p3left.pad));
ok('P3 fire reads', stick.p3fire.pad.kick, JSON.stringify(stick.p3fire.pad));
ok('P4 stick reads on the numpad', stick.p4right.pad.dx === 1 && stick.p4up.pad.dy === -1,
   JSON.stringify([stick.p4right.pad, stick.p4up.pad]));
ok('P4 fire reads', stick.p4fire.pad.kick, JSON.stringify(stick.p4fire.pad));
ok('...and a diagonal is both axes at once', stick.p4diag.pad.dx === 1 && stick.p4diag.pad.dy === -1,
   JSON.stringify(stick.p4diag.pad));
// ⚠️ THE `e.code` ASSERTION. On `e.key` the numpad and the number row are indistinguishable,
// so P4 pushing right lands in P2's coin slot. "P4 goes right" alone passes either way.
ok('P4s numpad stick moves NOBODY ELSE', stick.p4right.others === 0 && stick.p4up.others === 0,
   `Numpad6/Numpad8 also moved ${stick.p4right.others}/${stick.p4up.others} other panels — a numpad key's e.key is never its own name: NumLock off it is "ArrowRight"/"ArrowUp", which is P1's stick, and NumLock on it is "6"/"8", which is P2's coin slot. Either way an e.key build cross-wires two panels, and "P4 goes right" passes on it`);
ok('...and drops no coin', stick.p4right.coins === 0 && stick.p4right.credits === 0,
   `Numpad6 banked ${stick.p4right.coins} coins — the NumLock-on half of the same collision`);
ok('...and no other panel bleeds either', stick.p3left.others === 0 && stick.p2up.others === 0,
   `${stick.p3left.others} / ${stick.p2up.others}`);
ok('a panel stick is digital', sweep.bad.length === 0 && sweep.resting,
   JSON.stringify(sweep) + ' — a cabinet stick is four microswitches and has no in-between');

ok('free play charges nothing', free.a && free.b2 && free.credits === 0 && free.coins === 0,
   JSON.stringify(free));
ok('...but still counts the games', free.plays === 2,
   `${free.plays} — how much a cab gets used is worth knowing whether or not it takes money`);
ok('coin-op refuses with no credit', coinRefuse.spend === false && coinRefuse.plays === 0,
   JSON.stringify(coinRefuse));
ok('a HELD coin switch banks exactly one', heldCoin.coins === 1 && heldCoin.credits === 1,
   `${heldCoin.coins} coins from one press and 20 auto-repeats — without the e.repeat guard a coin slot leant on is free credits for as long as somebody leans on it`);
ok('...and starting spends it', coinSpend.spend === true && coinSpend.after === 0 && coinSpend.plays === 1,
   JSON.stringify(coinSpend));
ok('every slot feeds one pool', coinP4.coins === 2 && coinP4.credits === 1,
   JSON.stringify(coinP4) + ' — P4s coin key is Digit8 and banks the same credit');

ok('START does NOT restart a live match', startMid.state === 'play' && startMid.plays === startRules.plays,
   `state ${startMid.state}, plays ${startMid.plays} vs ${startRules.plays} — mid-match START is the ready button, and taking the game off four people because one leant on the panel is the worst thing this could do`);
ok('...and DOES start one once it is over', startOver.running && startOver.state !== 'over' && startOver.plays === startRules.plays + 1,
   JSON.stringify(startOver) + ' — otherwise there is no way to start a game on a cabinet at all');
ok('the attract demo is not a game in progress', idlePred.demo && idlePred.over && !idlePred.livePlay,
   JSON.stringify(idlePred) + ' — the demo is what the cab does while nobody is playing, which is exactly when START means start');
ok('...but a PAUSED match is', !idlePred.paused,
   'this is where arcadeIdle deliberately parts company with updCanShow: a prompt over a pause is fine, a fresh game over one takes four people\'s match away');

ok('the lobby comes up on a cabinet', lobby.wanted && lobby.state === 'warmup', JSON.stringify(lobby));
ok('...and stays up with START released', lobbyIdle === 'warmup', lobbyIdle);
ok('...and the panel START leaves it', lobbyOut !== 'warmup',
   `still ${lobbyOut} — pollLobbyStart reads the Gamepad API directly, so this is the one place the virtual-pad trick does not carry a cabinet for free. Without arcadeStartHeld four people stand at a live switch waiting on the 30-second auto-start`);

ok('the takings persist', book.stored && book.stored.coins === 11 && book.stored.plays === 7,
   JSON.stringify(book.stored));
ok('...and are NOT in sel', !book.inSel,
   'saveSel serialises all of sel and syncAdopt shallow-merges it between two windows — a merge is exactly the wrong thing to do to a counter');
ok('...while the MODE is', book.selHasMode, 'free play vs coin-op is a preference, so it belongs there');
ok('...and they survive a reload', afterReload.coins === 11 && afterReload.credits === 3 && afterReload.plays === 7,
   JSON.stringify(afterReload));

ok('the operator screen opens', screen.opens, JSON.stringify(screen));
ok('...with the takings on it', screen.bookRows === 3 && screen.showsCoins, `${screen.bookRows} rows`);
ok('...and the panel map', screen.keyRows === 5, `${screen.keyRows} rows — four panels plus the service key`);
ok('...naming the switches, not the codes', screen.readable && screen.p1readable,
   `${screen.p4row} / ${screen.p1row} — this is read by somebody wiring a harness, not by a programmer`);
ok('...and the mode picker', screen.modeTiles === 2, `${screen.modeTiles} tiles`);
ok('the Display card carries the way in', screen.boxShown && screen.boxHidden,
   `shown ${screen.boxShown}, hidden on another layout ${screen.boxHidden}`);
ok('the service key opens it from the panel', service,
   'a cabinet has no menu — the operator is stood in front of it with the coin door open and the panel is their only input');
ok('reset ARMS before it clears', armReset.armed.coins === 9 && /9|4/.test(armReset.armed.label),
   JSON.stringify(armReset.armed) + ' — it cannot be undone and it is pressed with a queue waiting');
ok('...and clears on the second press', armReset.after.coins === 0 && armReset.after.plays === 0 && armReset.after.credits === 0,
   JSON.stringify(armReset.after));
ok('...then disarms', armReset.label2 === armReset.label0, `${armReset.label2}`);

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ seats, stick, sweep, free, coinRefuse, heldCoin, coinSpend, coinP4,
                             startMid, startOver, idlePred, lobby, lobbyIdle, lobbyOut, book, afterReload,
                             screen, service, armReset }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL arcade\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS arcade');
