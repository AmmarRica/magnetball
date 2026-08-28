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
ok(r.leavesDrillsAlone, 'the result clock armed itself in a drill');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nautoadvance OK');
