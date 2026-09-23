// Nobody should have to reach for a menu to keep a session going.
//
//  Lobby  → 30s and it kicks off by itself, but the clock goes back to FULL on any
//           sign of life: a stick, KICK, someone walking about, a pad appearing.
//           So it only ever runs out on a room that has genuinely stopped deciding.
//  Result → 30s and the next match starts on the same config with the same teams.
//           Any input resets it, so Player 1 deliberating never gets kicked into one.
//
// The interesting failures here are the timer firing when it SHOULDN'T, so most of
// this suite pushes on the reset paths rather than the happy countdown.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:1000} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{
  window.__MAGNETDEBUG=true;
  window.__pads = Array.from({length:2},(_,i)=>({index:i,id:'pad'+i,connected:true,mapping:'standard',
    axes:[0,0,0,0], buttons:Array.from({length:17},()=>({pressed:false,value:0}))}));
  navigator.getGamepads = () => window.__pads;
});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.controllers='on'; M.sel.mode='2v2'; M.applyDisplayMode();

  const lobby = () => { M.setMatchSeed(3); M.startMatch(); return M.world; };

  // ---- the lobby clock exists and counts down -----------------------------
  let w = lobby();
  o.startsInWarmup = w.state === 'warmup';
  o.duration = M.AUTO.warmup;
  for (let i=0;i<60;i++) M.step(w);              // 1s of quiet
  o.afterOneSecond = +w.lobby.idle.toFixed(2);
  o.countsDown = o.afterOneSecond < M.AUTO.warmup && o.afterOneSecond > M.AUTO.warmup - 1.5;

  // ---- ...and moving puts it back to full ---------------------------------
  const me = M.lobbyHumans(w)[0];
  for (let i=0;i<120;i++) M.step(w);
  const beforeMove = w.lobby.idle;
  me.x += 12;                                    // somebody walks
  M.step(w);
  o.beforeMove = +beforeMove.toFixed(2);
  o.afterMove = +w.lobby.idle.toFixed(2);
  o.movementResets = o.afterMove > o.beforeMove + 1;
  // A stick push with NO displacement counts too — leaning into a wall is still
  // somebody deciding. Driven through stepLobbyClock directly: a full step() would
  // have applyHumanInput rewrite inY from the pad before the clock ever saw it
  // (the documented trap), and any pad push that moves you would pass via position
  // instead, which is not the branch being tested.
  for (let i=0;i<120;i++) M.step(w);
  const beforeStick = w.lobby.idle;
  M.lobbyHumans(w)[0].inY = -1;
  M.stepLobbyClock(w);
  o.stickResets = w.lobby.idle > beforeStick + 1;
  M.lobbyHumans(w)[0].inY = 0;
  // ...as does a controller appearing.
  for (let i=0;i<120;i++) M.step(w);
  const beforePad = w.lobby.idle;
  window.__pads.push({index:2,id:'pad2',connected:true,mapping:'standard',
    axes:[0,0,0,0], buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
  M.step(w);
  o.padResets = w.lobby.idle > beforePad + 1;
  window.__pads.length = 2;
  M.step(w);

  // ---- it really does kick off on its own ---------------------------------
  w = lobby();
  // Settle first: the very first tick has no previous position to compare against,
  // so it always reads as movement and puts the clock back to full.
  for (let i=0;i<60;i++) M.step(w);
  M.lobbyHumans(w).forEach(q=>{ q.inX=0; q.inY=0; q.kick=false; });
  w.lobby.idle = 0.2;                            // wind it near the end
  let kicked = false;
  for (let i=0;i<120 && !kicked;i++){ M.step(w); if (M.world.state !== 'warmup') kicked = true; }
  o.lobbyAutoStarts = kicked && M.world.state === 'kickoff';
  o.playersFielded = M.world.players.length;

  // ---- mid-calibration it must NOT run out --------------------------------
  w = lobby();
  M.beginCalibration(w, M.lobbyHumans(w)[0]);   // real shape, not a hand-rolled stub
  w.lobby.idle = 0.4;
  for (let i=0;i<200;i++) M.step(w);
  o.calibHolds = M.world.state === 'warmup' && w.lobby.idle >= M.AUTO.warmup - 0.01;

  // ---- the result clock ----------------------------------------------------
  M.sel.controllers='off'; M.applyDisplayMode();
  M.setMatchSeed(5); M.startMatch();
  const w2 = M.world; w2.state='play'; w2.stateT=2; w2.score=[2,1];
  const teamsBefore = w2.players.map(q=>q.team+':'+q.ctrl).join('|');
  M.endMatch(w2); M.finishMatch(w2);
  o.resultDuration = M.AUTO.result;
  o.clockArmed = M.resultIdle === M.AUTO.result;
  // The hint is written by the clock, which loop() drives — tick it once by hand
  // rather than idling for a real frame.
  M.stepResultClock(0.001);
  o.hintCountsDown = /NEXT MATCH IN/.test(document.getElementById('ovHint').textContent || '');
  // A held button must hold the clock open.
  window.__pads[0].buttons[0].pressed = true;
  M.resultIdle = 4; M.stepResultClock(1);
  o.inputHoldsResult = M.resultIdle === M.AUTO.result;
  window.__pads[0].buttons[0].pressed = false;
  // ...and with nothing held it runs out and starts the next match.
  M.resultIdle = 0.5; M.stepResultClock(1);
  o.resultAutoStarts = !document.getElementById('overlay').classList.contains('show')
                    && M.world.state === 'kickoff';
  // ⚠️ **AND A KEYBOARD-ONLY DESKTOP IS STILL A PLAIN RESTART.** Full time now takes
  // everybody off the pitch and they walk back in — but only where a lobby is wanted at
  // all. Gated on `warmupUseful` instead, whose last line is `!isTouchLayout()`, this
  // player's one body was put outside the touchline and they had to walk it back on and
  // press START to play again: two steps added to the button whose whole job is "again".
  // That is what this block caught, and `sameTeams` is what says which build it is.
  o.sameTeams = M.world.players.map(q=>q.team+':'+q.ctrl).join('|') === teamsBefore;
  o.sameField = M.world.fieldKey === M.sel.field;
  o.scoreReset = M.world.score.join('-') === '0-0';

  // ---- the AFTER-MATCH room: nobody walked on means "same again", never bots-only --
  // Full time puts everybody outside the touchline with the stepper at ONE, so the result
  // clock lands in a room whose plan is empty by definition. Measured with four pads on a
  // 2v2 before the fix: result screen left alone 30s, room left alone 30s, and the match
  // that kicked off was BOT v BOT with all four controllers on the bench — and a host
  // START tap in that room did the same. The room is asked through the real doors: the
  // idle clock and the host's START tap, driven through step().
  M.sel.controllers='on'; M.sel.lobby='on'; M.applyDisplayMode();
  if (M.padForgetAll) M.padForgetAll();          // the third pad above is still inside PAD_GRACE
  M.setMatchSeed(7); M.startMatch({ lobby:false });
  const w3 = M.world; w3.state='play'; w3.stateT=2; w3.score=[1,0];
  const seats3 = M.lobbyHumans(w3).map(q=>q.padIndex+':'+q.team).sort().join('|');
  const size3 = Math.max(w3.players.filter(q=>q.team===0).length, w3.players.filter(q=>q.team===1).length);
  o.padsFielded = M.lobbyHumans(w3).length;
  o.sizeBefore = size3;
  M.endMatch(w3); M.finishMatch(w3);
  M.resultIdle = 0.5; M.stepResultClock(1);
  o.stepOutRoom = M.world.state==='warmup' && !!(M.world.lobby && M.world.lobby.reJoin);
  const pl0 = M.lobbyPlan(M.world);
  o.roomStartsEmpty = pl0.a.length===0 && pl0.b.length===0;
  for (let i=0;i<60;i++) M.step(M.world);
  M.lobbyHumans(M.world).forEach(q=>{ q.inX=0; q.inY=0; q.kick=false; });
  if (M.world.lobby) M.world.lobby.idle = 0.2;      // null on a build whose last kickoff benched every pad: named below, not thrown
  for (let i=0;i<120 && M.world.state==='warmup';i++) M.step(M.world);
  const fielded = () => M.world.players.filter(q=>q.ctrl!=='bot');
  const sizeNow = () => Math.max(M.world.players.filter(q=>q.team===0).length, M.world.players.filter(q=>q.team===1).length);
  o.emptyRoomKicksOff = M.world.state==='kickoff';
  o.idleSameAgain = fielded().map(q=>q.padIndex+':'+q.team).sort().join('|') === seats3
                 && fielded().length === o.padsFielded;
  o.idleSameSize = sizeNow() === size3;
  // ...and the host's START TAP with nobody having moved — the door the person actually
  // presses. Through the real poll: START goes down on pad 0 and the world is stepped.
  M.endMatch(M.world); M.finishMatch(M.world);
  M.resultIdle = 0.5; M.stepResultClock(1);
  o.stepOutRoom2 = M.world.state==='warmup' && !!(M.world.lobby && M.world.lobby.reJoin);
  for (let i=0;i<60;i++) M.step(M.world);
  window.__pads[0].buttons[9].pressed = true; window.__pads[0].buttons[9].value = 1;
  for (let i=0;i<10 && M.world.state==='warmup';i++) M.step(M.world);
  window.__pads[0].buttons[9].pressed = false; window.__pads[0].buttons[9].value = 0;
  o.startTapKicksOff = M.world.state==='kickoff';
  o.tapSameAgain = fielded().map(q=>q.padIndex+':'+q.team).sort().join('|') === seats3
                && sizeNow() === size3;
  // CONTROL: somebody who DOES walk onto a half still decides the roster — the room is
  // not simply a restart. Pad 1 walks onto the top half alone; the other person benches.
  M.endMatch(M.world); M.finishMatch(M.world);
  M.resultIdle = 0.5; M.stepResultClock(1);
  for (let i=0;i<60;i++) M.step(M.world);
  const walker = M.lobbyHumans(M.world).find(q=>q.padIndex===1);
  // ⚠️ Named rather than thrown: on the build with no same-again rule the previous kickoff
  // benched every pad, and a TypeError here is a stack trace where a sentence is wanted.
  o.walkerFound = !!walker;
  if (walker){ walker.x = 0; walker.y = -M.world.bounds.halfL * 0.45; walker._px = walker.x; walker._py = walker.y; }
  for (let i=0;i<60;i++) M.step(M.world);          // settle: a body still moving resets the clock
  M.lobbyHumans(M.world).forEach(q=>{ q.inX=0; q.inY=0; q.kick=false; q.vx=0; q.vy=0; });
  const plW = M.lobbyPlan(M.world);
  o.walkOnCounts = (plW.a.length + plW.b.length) === 1 && plW.out.length === o.padsFielded - 1;
  if (M.world.lobby) M.world.lobby.idle = 0.2;      // null on a build whose last kickoff benched every pad: named below, not thrown
  for (let i=0;i<120 && M.world.state==='warmup';i++) M.step(M.world);
  o.walkOnState = M.world.state + ' ' + fielded().map(q=>q.padIndex+':'+q.team).join('|') + ' bench ' + (M.world.bench||[]).map(q=>q.ctrl+q.padIndex).join('|');
  o.walkOnDecides = M.world.state==='kickoff' && fielded().length === 1 && fielded()[0].padIndex === 1
                 && (M.world.bench||[]).some(q=>q.padIndex===0);
  M.sel.controllers='off'; M.applyDisplayMode();

  // ---- and it does NOT hijack the other result screens ---------------------
  M.resultIdle = null;
  M.startDrill && M.startDrill(Object.keys(M.DRILLS)[0]);
  M.stepResultClock(60);
  o.leavesDrillsAlone = M.resultIdle == null;
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.startsInWarmup, 'never reached the lobby, so none of this was tested');
ok(r.duration === 30, `lobby timeout should be 30s, got ${r.duration}`);
ok(r.countsDown, `the lobby clock did not tick down: ${r.afterOneSecond} of ${r.duration}`);
ok(r.movementResets, `walking about did not reset the clock: ${r.beforeMove} → ${r.afterMove}`);
ok(r.stickResets, 'pushing the stick did not reset the clock');
ok(r.padResets, 'connecting a controller did not reset the clock');
ok(r.lobbyAutoStarts, 'the lobby never kicked off on its own');
ok(r.playersFielded >= 4, `auto-start fielded only ${r.playersFielded} players`);
ok(r.calibHolds, 'the clock ran during controller calibration — it would start mid-setup');
ok(r.resultDuration === 30, `result timeout should be 30s, got ${r.resultDuration}`);
ok(r.clockArmed, 'the result screen did not arm its clock');
ok(r.hintCountsDown, 'the result screen does not say a match is coming');
ok(r.inputHoldsResult, 'a held button did not hold the result clock open');
ok(r.resultAutoStarts, 'the result screen never started the next match');
ok(r.sameTeams, 'the auto-started match changed the teams. With no controller in play a restart is a plain restart: the re-join room (everybody outside, walk back in) is gated on lobbyWanted, and gating it on warmupUseful instead reaches every desktop, pad or no pad');
ok(r.sameField, 'the auto-started match changed the field');
ok(r.scoreReset, 'the auto-started match kept the old score');
ok(r.padsFielded >= 2, `the after-match block needs at least two pad seats, got ${r.padsFielded}`);
ok(r.stepOutRoom && r.stepOutRoom2, 'the result clock did not land in the step-out room, so the after-match checks are vacuous');
ok(r.roomStartsEmpty, 'the step-out room did not start with everybody outside, so "nobody walked on" was never tested');
ok(r.emptyRoomKicksOff, 'the after-match room never kicked off on its own clock');
ok(r.idleSameAgain, 'nobody walked on and the idle clock did not give the SAME match back — this is the bot-v-bot-with-everybody-benched defect');
ok(r.idleSameSize, `nobody walked on and the match came back a different size (${r.sizeBefore} a side before)`);
ok(r.startTapKicksOff, 'a host START tap in the empty after-match room did not kick off');
ok(r.tapSameAgain, 'a host START tap with nobody having moved did not give the same match back');
ok(r.walkerFound, 'pad 1 has no body in the after-match room (the previous kickoff lost it)');
ok(r.walkOnCounts, 'the control never had exactly one person on the pitch and one outside');
ok(r.walkOnDecides, 'somebody walking onto a half must still decide the roster — "same again" fired over a real choice');
ok(r.leavesDrillsAlone, 'the result clock armed itself in a drill');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nautoadvance OK');
