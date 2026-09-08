// THE MAGNET IS ITS OWN TAB, AND THE ONE DIAL WAS DOING FOUR JOBS.
//
// Asked for as "add a tab for magnet and options for magnets". `sel.magnet` scaled the
// spring that pulls the ball to your feet, the velocity match that carries it along, the
// REACH at which either happens, and a power bonus on a kick — and the last two were
// hard-coded constants (`+ 18` in `handleBallControl`, `0.5`/`0.7` in `oneShotKick` and
// `releaseTrap`) that nobody could see, let alone move.
//
// ⚠️ THE TWO NEW DIALS DEFAULT TO EXACTLY THOSE CONSTANTS, so the shipped game is
// unchanged until somebody turns one — and that is the first thing checked here, because
// "the dial exists" is worth nothing if shipping it moved the game under everybody.
//
// ⚠️ EVERY PULL READING IS A DIFFERENCE AGAINST THE SAME STEP WITH THE MAGNET OFF. A ball
// is damped every step, so an absolute velocity reading scores "the magnet moved it" on a
// build where nothing was near it — the trap `tests/golf.mjs` records for its own pushes.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [];
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(async () => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();

  // ---- 1) the shipped defaults ARE the constants they replaced ---------------
  o.shippedReach = M.defaultSel().magReach;
  o.shippedKick  = M.defaultSel().magKick;

  // ---- 2) REACH: how far away the magnet still grabs -------------------------
  // ⚠️ Everyone else is parked at 9e3 and the reading is a DIFFERENCE against the same
  // gap with strength at 0, which is the control: at that setting the pull block is
  // skipped entirely, so whatever the ball does there is damping and nothing else.
  const pullAt = (gap, reach, strength) => {
    M.sel.magnet = strength; M.sel.magReach = reach; M.sel.trapOff = true;
    M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(3); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    const me = w.players[0];
    w.players.forEach(q => { if (q !== me){ q.x = 9e3; q.y = 9e3; } });
    me.x = 0; me.y = 0; me.vx = me.vy = 0; me.faceX = 1; me.faceY = 0; me.kick = false;
    const bl = w.ball; bl.x = me.r + bl.r + gap; bl.y = 0; bl.vx = bl.vy = 0;
    M.handleBallControl(w, me, bl, false);
    return +Math.abs(bl.vx).toFixed(4);
  };
  o.offIsTheControl   = pullAt(10, 18, 0);        // must be exactly 0
  o.shippedGrabsClose = pullAt(10, 18, 100);
  o.shippedRefusesFar = pullAt(30, 18, 100);      // 30 is outside the shipped 18
  o.widenedGrabsFar   = pullAt(30, 40, 100);      // ...and inside a widened 40
  o.zeroReachGrabsNothing = pullAt(2, 0, 100);

  // ---- 3) KICK BONUS ---------------------------------------------------------
  // ⚠️ Read off the BALL after a real `oneShotKick`, never off the multiplier: what is
  // under test is that the dial reaches the impulse, and a helper returning a number
  // proves only that a helper exists.
  const kickPow = (pct, strength) => {
    M.sel.magnet = strength; M.sel.magKick = pct; M.sel.trapOff = true;
    M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(3); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    const me = w.players[0];
    w.players.forEach(q => { if (q !== me){ q.x = 9e3; q.y = 9e3; } });
    me.x = 0; me.y = 0; me.vx = me.vy = 0; me.faceX = 1; me.faceY = 0;
    const bl = w.ball; bl.x = me.r + bl.r + 4; bl.y = 0; bl.vx = bl.vy = 0;
    M.oneShotKick(w, me, bl, bl.x - me.x, 0, bl.x - me.x, false);
    return +bl.vx.toFixed(2);
  };
  o.kickNoMagnet = kickPow(100, 0);      // the control: no magnet, no bonus, whatever the dial says
  o.kick0   = kickPow(0,   100);
  o.kick100 = kickPow(100, 100);
  o.kick200 = kickPow(200, 100);

  // ---- 4) the tab, and the rows in it ---------------------------------------
  M.sel.magnet = 0; M.sel.magReach = 18; M.sel.magKick = 100; M.saveSel();
  M.openSection('feel'); await new Promise(x => setTimeout(x, 200));
  o.chipExists = M.SUBTABS.feel.some(t => t[0] === 'magnet');
  M.showSubTab('feel', 'magnet'); await new Promise(x => setTimeout(x, 120));
  const pane = document.querySelector('.subpane[data-group="feel"][data-pane="magnet"]');
  o.paneShown = !!pane && getComputedStyle(pane).display !== 'none';
  o.rows = [...document.querySelectorAll('#feelSlidersMagnet label.field')].map(l => l.textContent.trim());
  o.rowCount = o.rows.length;
  // ⚠️ The readout is the PERCENT, not the multiplier. Folding the slider's getter into
  // the physics one put `1%` under the bonus, because the number the control is born at
  // and the number the maths wants are not the same unit.
  o.kickReadsPercent = o.rows.some(t => /kick bonus/i.test(t) && /100%/.test(t));
  o.reachReadsUnits  = o.rows.some(t => /magnet reach/i.test(t) && /18u/.test(t));
  // ...and the magnet has LEFT the Ball pane rather than being copied into two.
  o.notAlsoInBall = ![...document.querySelectorAll('#feelSlidersBall label.field')]
    .some(l => /magnet/i.test(l.textContent));

  // ---- 5) THE PRESET ROW IS GONE, and ↺ still gives Pro back ----------------
  // ⚠️ The reset used to hand back CASUAL by hand (a second copy of those numbers that
  // never moved when the shipped feel became Pro). With no preset tiles that is a ONE-WAY
  // trip, off the one button whose whole promise is "put it back".
  o.presetRowGone = !document.getElementById('feelPresets');
  M.sel.feel.accel = 3; M.sel.magnet = 80; M.sel.magReach = 55; M.sel.magKick = 10; M.saveSel();
  document.getElementById('feelReset').click();
  await new Promise(x => setTimeout(x, 250));
  o.resetIsPro = M.presetMatches(M.FEEL_PRESETS.pro);
  o.resetRestoresMagnetTab = M.sel.magReach === M.defaultSel().magReach &&
                             M.sel.magKick  === M.defaultSel().magKick;
  return o;
});

await p.close(); await b.close();

const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };
console.log(JSON.stringify(r, null, 1));

ok(r.shippedReach === 18 && r.shippedKick === 100,
   `the new dials must ship AT the constants they replaced (reach ${r.shippedReach}, kick ${r.shippedKick}) — ` +
   'a default that is not the old hard-coded number moves the game under everybody who never opens the tab');

ok(r.offIsTheControl === 0,
   `strength 0 still moved the ball by ${r.offIsTheControl} — the control is what makes every reading below a measurement`);
ok(r.shippedGrabsClose > 0,
   'the magnet did not grab a ball 10 units away at full strength, so the reach readings below prove nothing');
ok(r.shippedRefusesFar === 0,
   `reach 18 grabbed a ball 30 units away (${r.shippedRefusesFar}) — the dial is not reaching the grab test`);
ok(r.widenedGrabsFar > 0,
   `reach 40 did NOT grab the same 30-unit gap (${r.widenedGrabsFar}) — the dial does nothing, which is what a ` +
   'hard-coded 18 looks like from outside');
ok(r.zeroReachGrabsNothing === 0,
   `reach 0 still grabbed (${r.zeroReachGrabsNothing}) — the bottom of the dial has to mean it`);

ok(r.kickNoMagnet > 0 && r.kick0 > 0,
   'a kick with no bonus produced nothing at all, so the bonus readings are measuring a dead kick');
ok(Math.abs(r.kick0 - r.kickNoMagnet) < 0.01,
   `bonus 0% (${r.kick0}) does not match a kick with the magnet off (${r.kickNoMagnet}) — 0 has to mean no bonus`);
ok(r.kick100 > r.kick0 * 1.2,
   `the shipped bonus (${r.kick100}) is no bigger than none (${r.kick0}) — the default must reproduce the old 0.5`);
ok(r.kick200 > r.kick100,
   `200% (${r.kick200}) is not harder than 100% (${r.kick100}) — the dial is clamped or ignored`);

ok(r.chipExists && r.paneShown, `the Magnet tab is not reachable: chip ${r.chipExists}, pane ${r.paneShown}`);
ok(r.rowCount === 3, `the Magnet pane holds ${r.rowCount} rows, expected strength/reach/bonus: ${JSON.stringify(r.rows)}`);
ok(r.kickReadsPercent, `the kick bonus reads ${JSON.stringify(r.rows)} — the slider shows the stored PERCENT, not the multiplier`);
ok(r.reachReadsUnits, `the reach reads ${JSON.stringify(r.rows)} — world units, so the number means something on the pitch`);
ok(r.notAlsoInBall, 'the magnet is still in the Ball pane as well — one control, one tab');

ok(r.presetRowGone, 'the Casual/Pro preset row is still on the card');
ok(r.resetIsPro, 'the Game Feel reset does not give the shipped Pro feel back — with no preset tiles that is a one-way trip');
ok(r.resetRestoresMagnetTab, 'the reset left the Magnet tab where it was — it acts on the WHOLE card');

ok(errors.length === 0, 'console errors: ' + errors.slice(0, 3).join(' | '));
if (fail.length){ console.log('FAIL magnet\n  ' + fail.join('\n  ')); process.exit(1); }
console.log('PASS magnet');
