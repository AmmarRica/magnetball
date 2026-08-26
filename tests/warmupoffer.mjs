// WARM-UP IS ONLY OFFERED WHERE IT HAS SOMETHING TO DO.
//
// The lobby exists to do three things: test a stick before the whistle, walk onto the
// side you want, and tell a cocktail seat which way is up. ⚠️ On a PHONE WITH NO
// CONTROLLER there is none of that — it is one or two thumbs on one screen, the sides
// are fixed and there is no stick — so the menu's Warm-up button and the result
// screen's Warm-up option were both a trip to an empty room.
//
// So this pins the shape of `warmupUseful()` from both ends, because a rule that only
// ever hides things is one typo away from hiding the feature outright:
//   · a phone with nothing connected hides BOTH ways in;
//   · a desktop keeps them — two people on one keyboard still pick sides;
//   · and each of the three things that give warming up a job puts it back.
//
// ⚠️ Measured as COMPUTED display on the real elements, not as the predicate alone.
// The predicate being right and the button still being on screen is the bug.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

// A pad the game will actually count: `connectedGamepadIndices` skips entries with no
// buttons, because some mobile browsers expose a stub with none.
const FAKE_PAD = () => {
  const pad = { connected:true, mapping:'standard', index:0, id:'test pad',
                axes:[0,0,0,0], buttons:Array.from({length:16},()=>({pressed:false,value:0})) };
  navigator.getGamepads = () => [pad];
};

// `setup` runs in the page before the result screen is built, so a test can change
// settings or fake a pad and see the answer both on the menu and on the result.
// ⚠️ It ends with `buildSettings()`, which is the path every option tile in the menu
// actually takes (`sel.x = k; saveSel(); buildSettings();`). Poking `sel` and reading
// the DOM straight after measures a screen nobody has told to redraw, which is a
// property of the fixture rather than of the game.
async function probe({ w, h, mobile, pad, setup }){
  const p = await b.newPage({ viewport:{ width:w, height:h }, isMobile:!!mobile, hasTouch:!!mobile });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
  if (pad) await p.addInitScript(FAKE_PAD);
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  const r = await p.evaluate((setupSrc) => {
    const M = window.__magnet;
    const dm = document.getElementById('dmCollect'); if (dm) dm.click();
    if (setupSrc){ (new Function('M', setupSrc))(M); M.buildSettings(); }
    const shown = id => getComputedStyle(document.getElementById(id)).display !== 'none';
    const o = { touch: M.isTouchLayout(), useful: M.warmupUseful(), menu: shown('warmupBtn') };
    M.setMatchSeed(4); M.sel.mode = '3v3'; M.startMatch();
    const w2 = M.world; w2.state = 'play'; w2.stateT = 1;
    M.endMatch(w2); M.finishMatch(w2);
    o.result = shown('ovRematch');
    o.buttons = ['ovResume','ovRematch','ovMenu'].filter(shown);
    return o;
  }, setup || '');
  await p.close();
  return r;
}

const PHONE   = { w:390,  h:844, mobile:true };
const DESKTOP = { w:1280, h:900, mobile:false };

// ---- 1. a phone with nothing connected: gone from both places ---------------
{
  const r = await probe(PHONE);
  ok('phone: is actually the touch layout', r.touch, 'viewMode says otherwise — the fixture is wrong');
  ok('phone: warm-up has nothing to do', !r.useful);
  ok('phone: the menu button is hidden', !r.menu);
  ok('phone: the result option is hidden', !r.result);
  // ⚠️ And what is LEFT has to be a complete choice. Hiding a button is only correct
  // if the screen still answers "what now?" — Restart and Main Menu do.
  ok('phone: Restart and Main Menu remain', r.buttons.join() === 'ovResume,ovMenu', r.buttons.join());
}

// ---- 2. desktop is untouched ------------------------------------------------
{
  const r = await probe(DESKTOP);
  ok('desktop: still offered', r.useful && r.menu && r.result);
  ok('desktop: all three buttons', r.buttons.length === 3, r.buttons.join());
}

// ---- 3. each thing that gives warming up a job puts it back -----------------
// ⚠️ This half matters more than the hiding half. A predicate that only ever returns
// false passes every check above, and would have deleted the feature.
{
  // A controller on a phone: sides to pick and a stick to test, exactly what it is for.
  // ⚠️ Input has to be switched on as well — `controllers` defaults to 'off' ("tap to
  // steer"), so a fixture that only fakes the hardware proves nothing.
  const r = await probe({ ...PHONE, pad:true, setup:"M.sel.controllers='on';" });
  ok('phone + pad: offered again', r.useful && r.menu && r.result,
     JSON.stringify({ useful:r.useful, menu:r.menu, result:r.result }));
}
{
  // ...and NOT while Input is "tap to steer": a pad in the room driving nobody has no
  // stick to test. Same page, same hardware, one setting apart from the case above.
  const r = await probe({ ...PHONE, pad:true, setup:"M.sel.controllers='off';" });
  ok('phone + pad + tap-to-steer: still hidden', !r.useful && !r.menu && !r.result,
     JSON.stringify({ useful:r.useful, menu:r.menu, result:r.result }));
}
{
  // "Everyone" is an explicit ask for the lobby on touch, so it is honoured.
  const r = await probe({ ...PHONE, setup:"M.sel.lobby='touch';" });
  ok('phone + Everyone: offered again', r.useful && r.menu && r.result,
     JSON.stringify({ useful:r.useful, menu:r.menu, result:r.result }));
}
{
  // Cocktail always needs it — each seat has to say which way is up.
  const r = await probe({ ...PHONE, setup:"M.sel.display='cocktail'; M.applyDisplayMode();" });
  ok('cocktail: offered whatever it is running on', r.useful && r.menu && r.result,
     JSON.stringify({ useful:r.useful, menu:r.menu, result:r.result }));
}
{
  // ⚠️ "Skip" must NOT hide it. Skip means "don't drop me in automatically"; the
  // button is the manual way in, and hiding it there leaves no way in at all.
  const r = await probe({ ...DESKTOP, setup:"M.sel.lobby='off';" });
  ok('Skip keeps the manual way in', r.useful && r.menu && r.result,
     JSON.stringify({ useful:r.useful, menu:r.menu, result:r.result }));
}

// ---- 4. it re-syncs, rather than being decided once at boot -----------------
{
  const p = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  const live = await p.evaluate((padSrc) => {
    const M = window.__magnet;
    const dm = document.getElementById('dmCollect'); if (dm) dm.click();
    const shown = () => getComputedStyle(document.getElementById('warmupBtn')).display !== 'none';
    M.sel.controllers = 'on'; M.buildSettings();     // Input on, but still no hardware
    const before = shown();
    // A pad waking up mid-menu has to bring the button back without a reload.
    (new Function(padSrc))();
    window.dispatchEvent(new Event('gamepadconnected'));
    const after = shown();
    // ...and leaving has to take it away again.
    navigator.getGamepads = () => [];
    window.dispatchEvent(new Event('gamepaddisconnected'));
    return { before, after, gone: shown() };
  }, '(' + FAKE_PAD.toString() + ')()');
  ok('a pad connecting brings it back live', live.before === false && live.after === true,
     JSON.stringify(live));
  ok('a pad leaving takes it away again', live.gone === false, JSON.stringify(live));
  await p.close();
}

// ============================================================================
// START ON THE RESULT SCREEN GOES STRAIGHT TO WARM-UP.
// ============================================================================
// ⚠️ START used to be folded in with A and KICK as a second CONFIRM button, so the only
// way into the room from a result screen was to walk the cursor onto the Warm-up option
// first. START already means "get me playing" everywhere else — it begins the match from
// the lobby, and with nothing running it opens warm-up — so this screen was the one place
// it meant something else.
{
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => {
    window.__MAGNETDEBUG = true; localStorage.clear();
    window.__pads = [{ axes:[0,0,0,0], buttons:new Array(17).fill(false) }];
    navigator.getGamepads = () => window.__pads.map((pd,i) => ({
      index:i, connected:true, id:'f'+i, mapping:'standard', axes:pd.axes,
      buttons: pd.buttons.map(v => ({ pressed:!!v, value:v?1:0 })) }));
  });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const M = window.__magnet, o = {};
    const press = (i) => { window.__pads[0].buttons[i] = true;  M.pollOverOptions();
                           window.__pads[0].buttons[i] = false; M.pollOverOptions(); };
    const toResult = () => {
      M.sel.controllers = 'on'; M.sel.lobby = 'off'; M.sel.mode = '2v2';
      M.startMatch(); M.endMatch(M.world); M.finishMatch(M.world);
    };
    toResult();
    const ov = document.getElementById('ovRematch');
    o.warmupOffered = !!(ov && ov.dataset.role === 'warmup' && ov.style.display !== 'none');
    // ⚠️ The cursor is deliberately NOT on the Warm-up option — that is the whole point.
    o.cursorAt = M.overButtons()[0] && M.overButtons()[0].id;
    o.cursorIsNotWarmup = o.cursorAt !== 'ovRematch';
    press(9);                                   // START
    o.wentToWarmup = M.world && M.world.state === 'warmup';

    // ⚠️ KICK/A must still confirm whatever the cursor is on, or this took a meaning away
    // without putting one back — every option has to stay reachable.
    toResult();
    const btns = M.overButtons();
    o.buttons = btns.map(x => x.id);
    let clicked = null;
    const idx = btns.findIndex(x => x.id === 'ovMenu');
    if (idx >= 0){
      const b2 = btns[idx], was = b2.onclick;
      b2.onclick = () => { clicked = 'ovMenu'; };
      for (let i = 0; i < idx; i++) press(15);   // walk right with the D-pad
      press(0);                                 // A confirms
      b2.onclick = was;
    }
    o.aStillConfirms = clicked === 'ovMenu';

    // ⚠️ ...and where warm-up is NOT on offer, START falls back to confirming the cursor,
    // or it is dead on exactly the screens that borrow that button for Menu / Cup.
    toResult();
    const ov2 = document.getElementById('ovRematch');
    ov2.dataset.role = '';                      // a cup tie / Gauntlet run borrows it
    let fb = null;
    const first = M.overButtons()[0];
    const wasFb = first.onclick; first.onclick = () => { fb = first.id; };
    press(9);
    first.onclick = wasFb;
    o.startFallsBack = fb === first.id;
    return o;
  });
  if (!r.warmupOffered) fails.push('result screen: warm-up was not on offer to begin with');
  if (!r.cursorIsNotWarmup)
    fails.push('result screen: the cursor started ON the warm-up option, so the check is vacuous — ' + r.cursorAt);
  if (!r.wentToWarmup) fails.push('START on the result screen did not go to warm-up');
  if (!r.aStillConfirms)
    fails.push('A no longer confirms the selected option (buttons: ' + JSON.stringify(r.buttons) + ')');
  if (!r.startFallsBack)
    fails.push('START is dead where warm-up is not offered — it must fall back to confirming the cursor');
  await p.close();
}

await b.close();
if (errors.length) fails.push('console/page errors: '  + errors.slice(0, 4).join(' | '));
if (fails.length){ console.log('FAIL warmupoffer\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS warmupoffer');
