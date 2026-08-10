// A touch-only player could not start a match.
//
// ⚠️ THE DEFECT, measured before the fix: Start was bound to a gamepad button or the
// Enter key, and nothing at all to touch. In cocktail — which forces the warm-up
// lobby regardless of what is connected — a touch-only player entered the lobby and
// could not leave it. The 30-second idle auto-start does not rescue them, because it
// resets on any movement: an engaged player nudging the stick sat in the lobby for
// 90 simulated seconds and never kicked off.
//
// ⚠️ And the fix is OPT-IN. `lobby:'controllers'` is the default and behaves exactly
// as before — no pad, no lobby. This suite checks the default is untouched as
// carefully as it checks the new path works, because a defect fix that changes what
// everyone else sees is a second defect.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);

const page = async () => {
  const p = await b.newPage({ viewport:{width:420,height:820} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  await p.addInitScript(()=>{
    window.__MAGNETDEBUG = true;
    navigator.getGamepads = () => [];        // NO controllers, ever
  });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(900);
  return { p, errs };
};

const { p, errs } = await page();
const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const btn = () => document.getElementById('lobbyStartBtn');
  const shown = () => !!btn() && !btn().classList.contains('hidden');

  // ---- the DEFAULT is untouched -------------------------------------------
  M.sel.display='auto'; M.applyDisplayMode();
  M.sel.lobby='on'; M.sel.mode='2v2'; M.setMatchSeed(3); M.startMatch();
  o.defaultSkipsLobby = M.world.state === 'kickoff';
  M.render();
  o.noButtonWhenNoLobby = !shown();
  o.defaultOptionValue = 'on';

  // ---- opting in gives a touch player a lobby AND a way out ----------------
  M.sel.lobby='touch'; M.setMatchSeed(3); M.startMatch();
  const w = M.world;
  o.optInEntersLobby = w.state === 'warmup';
  M.render();
  o.buttonShows = shown();
  o.buttonLabel = btn() ? btn().textContent : null;
  // ⚠️ MEASUREMENT TRAP, and it let a real bug through for four builds: every check
  // below presses the button with `btn().click()`, which dispatches straight at the
  // node and does no hit testing at all — so a control that is drawn, lit up and
  // completely untappable passes all of them. `#hud` is `pointer-events: none` so the
  // pitch underneath stays steerable, and `#lobbyStartBtn` forgot to opt back in with
  // `auto`; on a phone every tap fell through to the canvas. Ask the DOCUMENT what is
  // at the button's own centre instead.
  {
    const el = btn(), b2 = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b2.left + b2.width/2, b2.top + b2.height/2);
    o.hitCentre = hit ? (hit.id || hit.tagName) : null;
    o.reallyTappable = !!hit && (hit === el || el.contains(hit));
    o.onScreen = b2.width > 0 && b2.height > 0 &&
                 b2.top >= 0 && b2.bottom <= innerHeight && b2.left >= 0 && b2.right <= innerWidth;
    o.bigEnough = b2.width >= 44 && b2.height >= 44;   // a touch target, on a touch-only path
  }
  // Side selection already works by walking: the touch stick moves you, and
  // lobbyPlan reads where you stand. Prove the plan follows a touch player.
  const me = M.lobbyHumans(w)[0];
  me.x = 0; me.y = -w.field.L/2 * 0.5;                  // walk into the TOP half
  for (let i=0;i<5;i++) M.step(w);
  o.sidePreview = [...w.lobby.sides.values()].join(',');
  o.touchPicksASide = M.lobbyPlan(w).b.includes(me);
  // ...and bots fill the rest.
  const plan = M.lobbyPlan(w);
  o.botsFillSeats = plan.need0 + plan.need1 > 0;

  // ---- pressing it starts the match, through the same path -----------------
  btn().click();
  o.startedByTouch = w.state !== 'warmup';
  o.lobbyCleared = !w.lobby;
  o.balanced = w.players.filter(q=>q.team===0).length === w.players.filter(q=>q.team===1).length;
  o.keptItsSide = me.team === 1;
  M.render();
  o.buttonHidesAfterStart = !shown();

  // ---- COCKTAIL: the layout that made this a hard block --------------------
  M.sel.display='cocktail'; M.applyDisplayMode();
  M.sel.lobby='on';                                     // even on the default
  M.setMatchSeed(3); M.startMatch();
  const w2 = M.world;
  o.cocktailStillWarmsUp = w2.state === 'warmup';
  M.render();
  o.cocktailButtonShows = shown();
  // An uncalibrated cocktail seat is asked to set up first, exactly as the pad path
  // does — starting a match you cannot steer is not a fix.
  o.cocktailAsksSetupFirst = /SET UP/.test(btn().textContent);
  btn().click();
  o.cocktailBeginsCalibration = !!(w2.lobby && w2.lobby.calib);
  o.cocktailDidNotStart = w2.state === 'warmup';
  // The button gets out of the way while calibrating.
  M.render();
  o.hiddenDuringCalibration = !shown();

  // ---- ...and a TOUCH seat can FINISH that calibration ---------------------
  // ⚠️ This was reported as a dead end — "a cocktail seat with no controller calls
  // beginCalibration, which has no touch path, so the player is stuck" — and it is not
  // true. `padFor` maps `human1` to `pads.p1`, which is the on-screen thumbstick, so
  // holding a direction on the touch stick registers exactly as a pad's would. The
  // claim was made from reading `beginCalibration` and never driving it, so it is
  // pinned here rather than argued about: removing calibration on touch would have
  // deleted the one thing that makes cocktail work, since players sitting on different
  // edges of a shared screen genuinely need different rotations.
  const hold = (dx, dy, n) => { for (let i=0;i<n;i++){ M.pads.p1.dx=dx; M.pads.p1.dy=dy; M.step(w2); } };
  o.calMag = LOBBY_HOLDMIN_OK();
  hold(0, -1, 75);                          // "UP", held past LOBBY.holdTicks
  o.calStepAdvanced = !!(w2.lobby && w2.lobby.calib) && w2.lobby.calib.step === 1;
  hold(1, 0, 75);                           // "RIGHT"
  M.pads.p1.dx = 0; M.pads.p1.dy = 0;
  o.calFinishedByTouch = !w2.lobby.calib && !!M.lobbyHost(w2).calibrated;
  M.render();
  o.startsAfterCalibration = shown() && /START/.test(btn().textContent);
  btn().click();
  o.cocktailStartedAfterCal = w2.state !== 'warmup';
  function LOBBY_HOLDMIN_OK(){
    // The touch stick normalises to at most 1 (`pad.dx = dx/R` after clamping to R),
    // so the threshold has to be reachable by a thumb. A holdMin above 1 would be a
    // calibration nobody on a phone could ever satisfy.
    return M.LOBBY.holdMin <= 1;
  }

  // ---- ...and the old blockage is genuinely gone ---------------------------
  // Same scenario as the pre-fix measurement: an engaged touch player who keeps
  // moving. Before, this never left the lobby. Now there is a control to press.
  M.sel.display='auto'; M.applyDisplayMode(); M.sel.lobby='touch';
  M.setMatchSeed(3); M.startMatch();
  const w3 = M.world;
  for (let i=0;i<60*40;i++){ M.pads.p1.dx=Math.sin(i/20); M.pads.p1.dy=Math.cos(i/20); M.step(w3); }
  M.pads.p1.dx=0; M.pads.p1.dy=0;
  o.stillStuckWithoutPressing = w3.state === 'warmup';    // the idle timer keeps resetting
  M.render();
  o.escapeHatchOnScreen = shown();
  btn().click();
  o.escaped = w3.state !== 'warmup';

  M.sel.lobby='on'; M.sel.mode='1v1'; M.setMatchSeed(null);
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.defaultSkipsLobby, 'the DEFAULT now shows a lobby to a touch-only player — the fix was supposed to be opt-in');
ok(r.noButtonWhenNoLobby, 'the Start button shows when there is no lobby');
ok(r.optInEntersLobby, 'opting in did not give a touch player a warm-up lobby');
ok(r.buttonShows, 'no on-screen Start in a touch lobby — this is the whole defect');
ok(/START/.test(r.buttonLabel||''), `the Start control reads "${r.buttonLabel}"`);
ok(r.reallyTappable, `a tap at the Start button's own centre lands on <${r.hitCentre}> instead — the control is drawn but dead`);
ok(r.onScreen, 'the Start button is not fully inside the viewport');
ok(r.bigEnough, 'the Start button is under 44px — the one control a touch-only player must hit');
ok(r.touchPicksASide, `a touch player walking into a half was not put on that side: preview ${r.sidePreview}`);
ok(r.botsFillSeats, 'bots do not fill the empty seats for a lone touch player');
ok(r.startedByTouch && r.lobbyCleared, 'pressing the on-screen Start did not kick off');
ok(r.balanced, 'the touch start produced uneven sides');
ok(r.keptItsSide, 'the touch player did not keep the side they walked to');
ok(r.buttonHidesAfterStart, 'the Start button stayed on screen during the match');
ok(r.cocktailStillWarmsUp, 'cocktail no longer warms up');
ok(r.cocktailButtonShows, 'cocktail — the layout where this was a HARD block — still has no touch Start');
ok(r.cocktailAsksSetupFirst, `cocktail should calibrate before starting; the control reads "${r.buttonLabel}"`);
ok(r.cocktailBeginsCalibration && r.cocktailDidNotStart, 'cocktail started a match before the seat knew which way is up');
ok(r.hiddenDuringCalibration, 'the Start button sat on top of the calibration prompt');
ok(r.calMag, 'LOBBY.holdMin is above 1 — the touch stick tops out at 1, so no thumb could ever satisfy it');
ok(r.calStepAdvanced, 'holding UP on the TOUCH stick did not advance cocktail calibration');
ok(r.calFinishedByTouch, 'a cocktail seat could not finish calibration by touch — this is the reported dead end, and it must stay fixed');
ok(r.startsAfterCalibration, 'after calibrating by touch the button did not go back to START');
ok(r.cocktailStartedAfterCal, 'a calibrated cocktail touch seat still could not start the match');
ok(r.stillStuckWithoutPressing, 'the idle auto-start now fires while the player is moving — that is a different change from the one intended');
ok(r.escapeHatchOnScreen && r.escaped, 'an engaged touch player still cannot leave the lobby');
ok(errs.length===0, 'console errors: '+errs.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ntouchstart OK');
