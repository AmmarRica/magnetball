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

  // ---- ...and a TOUCH seat does NOT calibrate at all -----------------------
  // ⚠️ THIS ASSERTION WAS THE OTHER WAY ROUND for one build, and the reason is worth
  // keeping: touch calibration was defended on the grounds that "players sitting on
  // different edges of a shared screen genuinely need different rotations". That is
  // true, and it is true of the CONTROLLER seats it was being used to justify a touch
  // path for. Cocktail multiplayer is controllers; a touch seat here is one player,
  // looking at the screen their own thumb zone is drawn on, with nothing to discover.
  // (The one two-touch-player mode, `local`, is a PHONE split — `zoneForTouch` rotates
  // player two by a fixed 180° and never reads `sel.cocktailSides`.) So a lone touch
  // player was being made to hold a stick in two directions, for a second each, to
  // establish a rotation that was never in question.
  o.touchNeedsNoCalibration = !M.needsCalibration(M.lobbyHost(w2));
  o.touchStartsStraightAway = /START/.test(btn().textContent);
  btn().click();
  o.cocktailStartedByTouch = w2.state !== 'warmup';
  o.noCalibrationRan = !(w2.lobby && w2.lobby.calib);
  // ...and their side is still whatever Display → Configure player sides says, so it
  // is set rather than merely defaulted-and-unreachable.
  {
    M.sel.cocktailSides = { 1: 'left' };
    M.setMatchSeed(3); M.startMatch();
    const w4 = M.world;
    const me4 = w4.players.find(q => q.ctrl === 'human1');
    o.seatSideHonoured = me4.rotQuarter === M.sideQuarter('left');
    M.sel.cocktailSides = {};
  }

  // ---- ...while a PAD seat still calibrates --------------------------------
  // ⚠️ The other half, and without it "nobody calibrates" passes everything above.
  // Driven with a fake gamepad, because that is the seat the flow exists for.
  {
    window.__pads = [{ id:'test', mapping:'standard', connected:true,
      axes:[0,0,0,0], buttons:Array.from({length:16},()=>({pressed:false,value:0})) }];
    navigator.getGamepads = () => window.__pads;
    M.sel.controllers = 'on'; M.sel.display = 'cocktail'; M.applyDisplayMode();
    M.setMatchSeed(3); M.startMatch();
    const w5 = M.world;
    const pad = M.lobbyHumans(w5).find(q => q.ctrl === 'gamepad');
    o.padSeatExists = !!pad;
    o.padNeedsCalibration = !!pad && M.needsCalibration(pad);
    M.render();
    o.padAsksSetup = /SET UP/.test(btn().textContent);
    navigator.getGamepads = () => [];
    M.sel.controllers = 'off'; M.applyDisplayMode();
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
ok(r.touchNeedsNoCalibration, 'a TOUCH seat in cocktail is still being asked to calibrate — there is one touch player here and nothing for them to discover');
ok(r.touchStartsStraightAway, 'the button still says SET UP for a touch-only cocktail seat');
ok(r.cocktailStartedByTouch, 'a touch-only cocktail seat could not start the match');
ok(r.noCalibrationRan, 'a calibration was started for a touch seat anyway');
ok(r.seatSideHonoured, 'a touch seat ignored the side set in Display -> Configure player sides, which is the manual route that makes skipping calibration safe');
ok(r.padSeatExists, 'the fixture never produced a gamepad seat, so the half below measures nothing');
ok(r.padNeedsCalibration, 'a PAD seat in cocktail no longer calibrates — that is the case the whole flow exists for');
ok(r.padAsksSetup, 'the button did not ask a pad seat to set up first');
ok(r.stillStuckWithoutPressing, 'the idle auto-start now fires while the player is moving — that is a different change from the one intended');
ok(r.escapeHatchOnScreen && r.escaped, 'an engaged touch player still cannot leave the lobby');
ok(errs.length===0, 'console errors: '+errs.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ntouchstart OK');
