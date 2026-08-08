// Joining a match already under way: the touchline, the START, and evening the sides up.
//
// ⚠️ THE BUG THIS STARTED AS: seats were handed out exactly ONCE, in `startMatch`, so a
// pad woken up after the whistle did nothing at all for the rest of the match — while the
// warm-up lobby's own help text had been promising "a controller can still join at any
// point by pressing a button" the whole time.
//
// ⚠️ AND THE FIRST FIX WAS TOO BLUNT: it took a bot over the instant any button went
// down, mid-play, with no way to choose a side and no say in when. A person now walks out
// to the TOUCHLINE on connection, picks a half by standing beside it, presses START, and
// comes on at the next goal. Five things are held here:
//
//   1. A new pad gets a body OUTSIDE the pitch and changes nothing about the match. It is
//      not in `w.players`, so it cannot touch the ball or anybody else — which is what
//      makes it safe to appear on connection alone rather than on a press.
//   2. It only comes on AT A GOAL, and only if it asked. During play it waits.
//   3. The side is the half it was standing beside; undecided falls to what the Extra
//      controllers setting already means.
//   4. The match GROWS to fit — a 3v3 that gains a player is a 4v4, with a bot added to
//      the other side — and shrinks back when they leave, but never below the size it
//      kicked off at.
//   5. Nothing about it may perturb the simulation, and a player who leaves keeps their
//      goals on the scoresheet.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:520,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
// ⚠️ No localStorage.clear() here: addInitScript runs again on the RELOAD at the bottom,
// so clearing would wipe the very save that check is asking about.
await p.addInitScript(()=>{ window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

// Shared fixture, injected into each evaluate: a fake pad set and a match with no pad
// connected at the whistle. ⚠️ `connected` AND a non-empty `buttons` array, because
// connectedGamepadIndices requires both — some mobile browsers expose a stub with neither.
const FIX = `
  const M = window.__magnet;
  const pad = (down) => ({ connected:true, mapping:'standard', axes:[0,0,0,0],
    buttons: Array.from({length:17}, (_,i)=>({ pressed:(down||[]).includes(i),
                                              value:(down||[]).includes(i)?1:0 })) });
  const realPads = navigator.getGamepads;
  let PADS = [];
  navigator.getGamepads = () => PADS;
  const START = 9;
  const match = (mode, coop) => {
    M.sel.controllers='on'; M.sel.coop = coop||'off'; M.sel.dropIn='on';
    M.sel.mode = mode || '3v3'; M.sel.kickoffRule='off'; M.sel.autoReplay = false;
    PADS = [];
    M.setMatchSeed(3); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    return w;
  };
  const bench   = (w) => (w.bench||[]);
  const waiting = (w) => M.benchHumans(w);
  const onPitch = (w) => w.players.filter(q=>q.ctrl==='gamepad');
  const sides   = (w) => [w.players.filter(q=>q.team===0).length,
                          w.players.filter(q=>q.team===1).length];
  const drive = (w, n) => { for (let i=0;i<(n||1);i++){ M.step(w); M.pollDropIn(w); } };
  // A goal, driven through the real step hook rather than by calling runSubs: the whole
  // point is that the goal STATE is what opens the window.
  const goal = (w) => { w.state='goal'; w.stateT=0; w._subDone=false;
                        M.step(w); M.pollDropIn(w); };
`;

const r = await p.evaluate(new Function(FIX + `
  const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();

  // ---- 1. a new pad appears OUTSIDE, and the match is untouched ------------
  let w = match('3v3');
  const before = JSON.stringify(w.players.map(q=>[q.ctrl,q.team,q.name]));
  o.sidesAtKickoff = sides(w);
  PADS = [pad([])];                      // connected, nothing pressed
  drive(w, 5);
  o.waitsOnConnect   = waiting(w).length === 1;
  o.notOnPitch       = onPitch(w).length === 0;
  o.rosterUntouched  = JSON.stringify(w.players.map(q=>[q.ctrl,q.team,q.name])) === before;
  const guest = waiting(w)[0];
  o.outsidePitch = !!guest && Math.abs(guest.x) > w.field.W/2;
  o.atTheGate    = !!guest && Math.abs(guest.y - M.subGate(w).y) < 1 &&
                             Math.abs(guest.x - M.subGate(w).x) < 1;
  drive(w, 10);
  o.oneBodyPerPad = waiting(w).length === 1;

  // ---- 2. a goal does nothing until it has ASKED ---------------------------
  goal(w);
  o.goalWithoutAskingDoesNothing = onPitch(w).length === 0 && waiting(w).length === 1;
  // START arms it, and START again cancels — a long wait needs a way back.
  w.state='play'; w.stateT=2;
  PADS = [pad([START])]; drive(w, 1);
  o.startArms = guest._subIn === true;
  PADS = [pad([])];      drive(w, 1);
  PADS = [pad([START])]; drive(w, 1);
  o.startCancels = guest._subIn === false;
  PADS = [pad([])];      drive(w, 1);
  PADS = [pad([START])]; drive(w, 1);
  PADS = [pad([])];      drive(w, 1);
  o.armedAgain = guest._subIn === true;
  // ⚠️ Armed is not on: it must still be waiting through a stretch of PLAY, or "they
  // join between goals" is really "they join immediately".
  drive(w, 60);
  o.armedStillWaitsDuringPlay = onPitch(w).length === 0 && waiting(w).length === 1;

  // ---- 3 + 4. the goal, the side it picked, and the sides evening up -------
  guest.y = 140;                          // walked well into team 0's half
  o.pickedSide = M.subSideOf(w, guest);
  goal(w);
  o.joinedOnGoal   = onPitch(w).length === 1 && waiting(w).length === 0;
  o.joinedTeam     = onPitch(w)[0] ? onPitch(w)[0].team : -1;
  o.joinedPickedSide = o.joinedTeam === o.pickedSide;
  o.sidesAfterJoin = sides(w);
  o.grewToEven     = o.sidesAfterJoin[0] === 4 && o.sidesAfterJoin[1] === 4;
  o.perAfterJoin   = M.subPer(w);
  // ⚠️ The bot added to the other side came on THROUGH THE GATE, not out of thin air in
  // the middle of the pitch.
  const fresh = w.players.filter(q=>q.team===1 && q._subTo);
  o.freshWalkers = fresh.length;
  o.evenBotWalksOn = fresh.length === 1 && Math.abs(fresh[0].x - M.subGate(w).x) < 40;
  // The AI is suppressed while it walks, or a thinking bot fights walkTo and jitters.
  const walker = fresh[0];
  o.walkerMoves = null;
  if (walker){ const wx0 = walker.x, wy0 = walker.y; M.step(w);
               o.walkerMoves = (walker.x !== wx0 || walker.y !== wy0); }
  // Kickoff closes the window and finishes any walk.
  w.stateT = 2.0; M.step(w);
  o.kickoffClearsWalks = w.players.every(q=>!q._subTo) && w._subDone === false;

  // ---- 5. unplugging: back to 3v3, name and stats kept ---------------------
  const left = onPitch(w)[0];
  left.ms.goals = 2; const leftName = left.name;
  PADS = [];
  drive(w, 2);
  o.sidesAfterLeave = sides(w);
  o.shrankBack      = o.sidesAfterLeave[0] === 3 && o.sidesAfterLeave[1] === 3;
  o.leftToBench     = bench(w).includes(left);
  o.keptNameStats   = left.name === leftName && left.ms.goals === 2;
  o.noOrphanOnPitch = !w.players.includes(left);
  // ⚠️ ...and their goals are still on the scoresheet. Reading only w.players would drop
  // the half they played as though it never happened.
  o.onScoresheet = M.matchRoster(w).includes(left);
  // The same controller coming back reclaims ITS OWN body rather than minting a P3.
  PADS = [pad([])]; drive(w, 2);
  o.reclaimsBody = waiting(w).length === 1 && waiting(w)[0] === left &&
                   waiting(w)[0].ms.goals === 2;

  // ---- the prompt actually says what will happen ---------------------------
  // ⚠️ It has to be on screen and it has to be HONEST: the side it names is read through
  // the same two functions runSubs uses, so it cannot promise a side the goal won't give.
  // And the body is outside the touchline by definition, so a label centred on it hangs
  // off the edge and loses its last few words — which are the side.
  w = match('3v3', 'off');
  PADS = [pad([])]; drive(w, 3);
  const g3 = waiting(w)[0];
  const promptWidth = () => {
    const cv = document.getElementById('game');
    const before = cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
    M.computeCam(); M.render();
    const after = cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
    let diff = 0; for (let i=0;i<after.length;i+=4) if (after[i]!==before[i]) diff++;
    return diff;
  };
  M.computeCam(); M.render();
  // Nothing may be drawn outside the canvas: sample the far-right column and require ink
  // there to have come from a clamped label rather than run off the edge.
  const cv = document.getElementById('game'), cc = cv.getContext('2d');
  g3.y = 140; M.computeCam(); M.render();
  o.promptDrawn = (()=>{                       // the label's plate is opaque, so it shows
    const [sx, sy] = M.screenPt(M.wx(g3.x), M.wy(g3.y));
    const DPR = cv.width / cv.clientWidth;
    const py = Math.round((sy - g3.r*M.cam.s - 30) * DPR);
    let ink = 0;
    for (let x = 0; x < cv.width; x++){
      const d = cc.getImageData(x, py, 1, 1).data;
      if (d[0] + d[1] + d[2] > 40) ink++;
    }
    return ink;
  })();
  o.promptOnScreen = o.promptDrawn > 20;
  // ...and it names HOME for a body beside the +y half, AWAY for the -y half.
  o.sideNamedHome = M.subSideOf(w, g3) === 0;
  g3.y = -140;
  o.sideNamedAway = M.subSideOf(w, g3) === 1;
  g3.y = 0;
  o.sideUndecided = M.subSideOf(w, g3) === -1;
  o.promptHonest = o.sideNamedHome && o.sideNamedAway && o.sideUndecided;

  navigator.getGamepads = realPads;
  M.sel.controllers='off';
  return o;
`));

// ---- sides, caps and floors, each on a fresh match --------------------------
const bal = await p.evaluate(new Function(FIX + `
  const o={};
  const join = (w, y) => {
    PADS = [pad([])]; drive(w, 2);
    const g = waiting(w)[waiting(w).length-1];
    if (g) g.y = y;
    PADS = [pad([START])]; drive(w, 1); PADS = [pad([])]; drive(w, 1);
    goal(w);
    return g;
  };

  // Undecided — standing by the gate — falls to what Extra controllers already means.
  let w = match('3v3', 'off');            // Versus: against you
  join(w, 0);
  o.undecidedVersus = onPitch(w)[0] ? onPitch(w)[0].team : -1;
  w = match('3v3', 'on');                 // Co-op: alongside you
  join(w, 0);
  o.undecidedCoop = onPitch(w)[0] ? onPitch(w)[0].team : -1;
  o.undecidedFollowsCoop = o.undecidedVersus === 1 && o.undecidedCoop === 0;

  // A 1v1 grows to 2v2 — the smallest case, where "add a bot to the other side" is the
  // whole of the change.
  w = match('1v1', 'off');
  join(w, -140);
  o.oneVone = sides(w);
  o.oneVoneGrew = JSON.stringify(o.oneVone) === '[2,2]';

  // ⚠️ The CAP holds. Pads keep arriving and pressing START; the sides must stop growing
  // at LOBBY.maxPerSide rather than filling the pitch with bodies.
  w = match('4v4', 'off');
  for (let k=0;k<14;k++){
    PADS = Array.from({length:k+1}, ()=>pad([]));      drive(w, 2);
    waiting(w).forEach(q=>{ q.y = 140; });
    PADS = Array.from({length:k+1}, ()=>pad([START])); drive(w, 2);
    PADS = Array.from({length:k+1}, ()=>pad([]));      drive(w, 1);
    goal(w);
  }
  o.cappedSides = sides(w);
  o.capHolds = o.cappedSides[0] <= 8 && o.cappedSides[1] <= 8 &&
               o.cappedSides[0] === o.cappedSides[1];

  // ⚠️ The FLOOR is the size the match KICKED OFF at, not mode.per. The lobby can put six
  // a side on a 4v4, and a floor of 4 would have evenUpSides take two bots off each side
  // the first time a controller hiccupped.
  w = match('4v4', 'off');
  for (const t of [0,1]) for (let k=0;k<2;k++){
    const extra = M.spawnLobbyBot(w, t, 6+k, new Set(w.players.map(q=>q.name)));
    w.players.push(extra);
  }
  w.subFloor = null; w.subPer = null;          // as resetKickoff(w, true) would
  o.floor = M.subFloorOf(w);
  o.floorReadsRoster = o.floor === 6;
  join(w, 140);                                // 6v6 → 7v7
  o.fromSix = sides(w);
  o.grewFromSix = JSON.stringify(o.fromSix) === '[7,7]';
  PADS = []; drive(w, 2);                      // ...and back to 6v6, not 4v4
  o.backToFloor = sides(w);
  o.shrankToFloor = JSON.stringify(o.backToFloor) === '[6,6]';

  // evenUpSides is idempotent — running it on a balanced pitch changes nothing.
  const snap = JSON.stringify(sides(w));
  M.evenUpSides(w); M.evenUpSides(w);
  o.idempotent = JSON.stringify(sides(w)) === snap;

  navigator.getGamepads = realPads;
  M.sel.controllers='off';
  return o;
`));

// ---- the gates -------------------------------------------------------------
const gate = await p.evaluate(new Function(FIX + `
  const o={};
  let w = match('3v3');
  const none = () => waiting(w).length === 0 && onPitch(w).length === 0;
  PADS = [pad([])];
  M.sel.dropIn='off';   for(let i=0;i<5;i++) M.pollDropIn(w); o.settingOff = none();
  M.sel.dropIn='on';
  M.sel.controllers='off'; for(let i=0;i<5;i++) M.pollDropIn(w); o.touchInput = none();
  M.sel.controllers='on';
  // ⚠️ The attract-mode demo behind the menu is not a match to join, and a button press
  // there is how you navigate the menu.
  w.demo=true;  for(let i=0;i<5;i++) M.pollDropIn(w); o.demo = none();    w.demo=false;
  // Warm-up already hands seats to pads; that is what it is for.
  w.state='warmup'; for(let i=0;i<5;i++) M.pollDropIn(w); o.warmup = none(); w.state='play';
  w.state='over';   for(let i=0;i<5;i++) M.pollDropIn(w); o.over = none();   w.state='play';
  o.nullWorld = M.dropInBlocked(null) === true;
  // With every gate open it still works, or the checks above passed for free.
  for(let i=0;i<3;i++) M.pollDropIn(w);
  o.worksUngated = waiting(w).length === 1;
  navigator.getGamepads = realPads;
  M.sel.controllers='off';
  return o;
`));

// ---- it cannot perturb the simulation ---------------------------------------
// ⚠️ The poll runs in the step loop and the substitution hook runs inside step() itself,
// so a stray write to a position, a velocity or `w.rng` would change the match. Same
// seed, 600 steps, whole world hashed: once with the poll firing every step, once never.
const det = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const realPads = navigator.getGamepads;
  const hash = (w) => { let h = 2166136261;
    const s = JSON.stringify(w.players.map(q=>[q.x,q.y,q.vx,q.vy,q.faceX,q.faceY,q.gait]))
            + JSON.stringify([w.ball.x,w.ball.y,w.ball.vx,w.ball.vy,w.score,w.rng()]);
    for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0; };
  const run = (poll) => {
    M.sel.controllers = poll ? 'on' : 'off'; M.sel.dropIn='on';
    M.sel.mode='3v3'; M.sel.kickoffRule='off';
    // ⚠️ No pad connected in EITHER run. The question is whether the machinery itself
    // disturbs anything — a run where somebody actually joined is a different match by
    // design, and comparing those two would prove nothing.
    navigator.getGamepads = () => [];
    M.setMatchSeed(21); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    for (let i=0;i<600;i++){ M.step(w); if (poll) M.pollDropIn(w); }
    return hash(w);
  };
  o.withPoll = run(true);
  o.without  = run(false);
  o.identical = o.withPoll === o.without;
  navigator.getGamepads = realPads;
  M.sel.controllers='off';
  return o;
});

// ---- and the control is reachable, and survives a reload -------------------
const ui = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  M.sel.controllers='on'; M.sel.mode='1v1'; M.buildSettings && M.buildSettings();
  M.updatePadInfo && M.updatePadInfo();
  const row = document.getElementById('dropInRow');
  o.tiles = document.querySelectorAll('#dropIn .opt').length;
  // ⚠️ Shown on 1v1 too. Extra controllers hides there, and a 1v1 grows to a 2v2 like any
  // other match — folding this into that row hid it exactly where it is most useful.
  o.shownOn1v1 = row && !row.classList.contains('hidden');
  M.sel.controllers='off'; M.updatePadInfo && M.updatePadInfo();
  o.hiddenOnTouch = row && row.classList.contains('hidden');
  M.sel.dropIn='off'; M.saveSel();
  return o;
});
await p.reload();
await p.waitForTimeout(900);
const after = await p.evaluate(()=> window.__magnet.sel.dropIn);

const all = { ...r, ...bal, ...gate, ...det, ...ui, afterReload: after };
const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(all.waitsOnConnect, 'plugging a controller in mid-match produced no waiting player at all');
ok(all.notOnPitch, 'a controller that had only just been plugged in was put straight into the match');
ok(all.rosterUntouched, 'connecting a pad changed the roster — a body on the touchline is what makes appearing on CONNECTION safe, and it stops being safe the moment it touches the match');
ok(all.outsidePitch && all.atTheGate, `the waiting body is not outside the pitch at the gate: outside ${all.outsidePitch}, gate ${all.atTheGate}`);
ok(all.oneBodyPerPad, 'a connected pad grew a second body on a later step');
ok(all.goalWithoutAskingDoesNothing, 'a goal dragged a waiting player on who never pressed START');
ok(all.startArms && all.startCancels && all.armedAgain, `START does not arm/cancel cleanly: arm ${all.startArms}, cancel ${all.startCancels}, again ${all.armedAgain}`);
ok(all.armedStillWaitsDuringPlay, 'an armed player came on during PLAY — "they join between goals" is the whole timing rule, and joining mid-play drops a body into a live ball');
ok(all.joinedOnGoal, 'an armed player did not come on at the goal');
ok(all.joinedPickedSide, `the joiner went to team ${all.joinedTeam} having stood beside half ${all.pickedSide} — the side you walk to is the side you get`);
ok(all.grewToEven, `a 3v3 that gained a player became ${JSON.stringify(all.sidesAfterJoin)} instead of 4v4 — arriving must add a bot to the other side, never cost a body its place`);
ok(all.perAfterJoin === 4, `the match size reads ${all.perAfterJoin} after a 3v3 grew`);
ok(all.evenBotWalksOn, `the bot added to even the sides up did not walk on through the touchline gate (${all.freshWalkers} walkers)`);
ok(all.walkerMoves !== false, 'a bot walking on through the gate never moved — walkTo sets position directly, so the AI has to be suppressed for it or the two fight');
ok(all.kickoffClearsWalks, 'the kickoff left a half-finished walk-on steering a body away from its mark, or the substitution window stayed open');
ok(all.shrankBack, `unplugging left the sides at ${JSON.stringify(all.sidesAfterLeave)} instead of back at 3v3`);
ok(all.leftToBench && all.noOrphanOnPitch, 'a departed player was left on the pitch with nobody driving it, standing still in the middle');
ok(all.keptNameStats, 'a departed player lost its name or its stats');
ok(all.onScoresheet, 'a player who left mid-match vanished from the scoresheet — the half they played would read as though it never happened');
ok(all.reclaimsBody, 'a controller coming back got a fresh body instead of reclaiming its own, stranding its half-match on the bench');
ok(all.undecidedFollowsCoop, `an undecided joiner went to ${all.undecidedVersus} on Versus and ${all.undecidedCoop} on Co-op — Extra controllers already means exactly this question`);
ok(all.oneVoneGrew, `a 1v1 became ${JSON.stringify(all.oneVone)} instead of a 2v2`);
ok(all.capHolds, `pads kept arriving and the sides reached ${JSON.stringify(all.cappedSides)} — the per-side cap has to hold`);
ok(all.floorReadsRoster, `the floor read ${all.floor} for a 6v6 on a 4v4 mode — the lobby can field six a side, and a floor of mode.per would take two bots off each side`);
ok(all.grewFromSix, `a 6v6 became ${JSON.stringify(all.fromSix)} instead of 7v7`);
ok(all.shrankToFloor, `a 7v7 losing its guest became ${JSON.stringify(all.backToFloor)} — it may never shrink past the size it kicked off at`);
ok(all.idempotent, 'evenUpSides changed a balanced pitch, so it is not safe to call twice');
ok(all.settingOff, 'Joining late = At kickoff still produced a waiting player');
ok(all.touchInput, 'a waiting player appeared while Input was set to Touch');
ok(all.demo, 'a controller joined the attract-mode demo behind the menu');
ok(all.warmup, 'drop-in fired during warm-up, which already hands seats to pads');
ok(all.over, 'a controller joined after the final whistle');
ok(all.nullWorld, 'dropInBlocked did not reject a null world');
ok(all.worksUngated, 'with every gate open it stopped working, so the gate checks passed for free');
ok(all.identical, `the world differs with the machinery running (${all.withPoll}) and without it (${all.without})`);
ok(all.tiles === 2, `the Joining late control has ${all.tiles} tiles`);
ok(all.shownOn1v1, 'the control is hidden on 1v1, where it is most useful');
ok(all.hiddenOnTouch, 'the control is offered while Input is Touch, where it can do nothing');
ok(all.promptOnScreen, `nothing was drawn where the touchline prompt should be (${all.promptDrawn} lit pixels) — a body waiting out there with no label is a controller whose holder is told nothing at all`);
ok(all.promptHonest, `the side read off a waiting position is wrong: home ${all.sideNamedHome}, away ${all.sideNamedAway}, undecided ${all.sideUndecided}`);
ok(all.afterReload === 'off', `the choice did not survive a reload: ${all.afterReload}`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(all, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ndropin OK');
