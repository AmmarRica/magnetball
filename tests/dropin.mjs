// A controller that joins a match already under way takes over a bot.
//
// ⚠️ THE BUG THIS EXISTS FOR: seats were handed out exactly ONCE, in startMatch, so a
// pad woken up after the whistle did nothing at all for the rest of the match — while
// the warm-up lobby's own help text had been promising "a controller can still join at
// any point by pressing a button" the whole time. It couldn't.
//
// Four lines are held here.
//   1. It joins on a BUTTON PRESS, never on connection. A pad waking up in a bag, or a
//      browser re-enumerating one, must not walk a stranger onto the pitch mid-play.
//   2. It lands in the seat it would have had at the whistle — the SAME `padSeatOrder`
//      the kickoff assignment uses, so Versus gives it the opposition and Co-op gives it
//      your side. Two copies of that ordering would let the two drift apart and neither
//      would look wrong on its own.
//   3. Unplugging hands the body BACK to the AI, keeping its name and its stats: a body
//      nobody is driving stands still in the middle of the pitch, and renaming it means
//      the award ribbon at the end credits a name nobody saw playing.
//   4. It cannot perturb the simulation. It is called from the step loop, so it is not
//      allowed to touch anything physical — checked by hashing the world across a run
//      with the poll firing and one without.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:520,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
// ⚠️ No localStorage.clear() here: addInitScript runs again on the RELOAD at the
// bottom, so clearing would wipe the very save that check is asking about.
await p.addInitScript(()=>{ window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();

  // A fake pad set that `navigator.getGamepads` will report. ⚠️ `connected` AND a
  // non-empty `buttons` array, because connectedGamepadIndices requires both — some
  // mobile browsers expose a stub entry with neither.
  const pad = (down) => ({ connected:true, mapping:'standard', axes:[0,0,0,0],
    buttons: Array.from({length:17}, (_,i)=>({ pressed:(down||[]).includes(i),
                                              value:(down||[]).includes(i)?1:0 })) });
  const real = navigator.getGamepads;
  let PADS = [];
  navigator.getGamepads = () => PADS;

  const match = (mode, coop) => {
    M.sel.controllers='on'; M.sel.coop = coop||'off'; M.sel.dropIn='on';
    M.sel.mode = mode || '2v2'; M.sel.kickoffRule='off';
    PADS = [];                       // nobody connected at the whistle
    M.setMatchSeed(3); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    return w;
  };
  const humans = (w) => w.players.filter(q=>q.ctrl==='gamepad');
  const drive = (w, n) => { for (let i=0;i<(n||1);i++){ M.step(w); M.pollDropIn(w); } };
  // ⚠️ Poll WITHOUT stepping, for the state gates. `w.state='warmup'` on a match that
  // wasn't built as a lobby has no `w.lobby` for stepWarmup to read, and the question
  // here is only whether pollDropIn honours the gate.
  const poll = (w, n) => { for (let i=0;i<(n||1);i++) M.pollDropIn(w); };

  // ---- 1. a connected pad does NOTHING until a button goes down ------------
  let w = match('2v2');
  o.startsWithNoPads = humans(w).length === 0;
  PADS = [pad([])];                        // connected, nothing held
  drive(w, 10);
  o.connectAloneDoesNothing = humans(w).length === 0;
  PADS = [pad([0])];                       // A
  drive(w, 1);
  o.pressJoins = humans(w).length === 1;
  o.joinedIsPad0 = humans(w)[0] && humans(w)[0].padIndex === 0;
  o.joinerNamed = /^P\d+$/.test((humans(w)[0]||{}).name || '');

  // ---- 2. the seat is the one it would have had at the whistle -------------
  // ⚠️ Compared against padSeatOrder itself rather than against a hard-coded index:
  // the point is that drop-in and kickoff ask the SAME question, and an index would
  // still pass if the two ever disagreed in the same way.
  const seatIn = (w2) => {
    const order = M.padSeatOrder(w2.players.filter(q=>q.team===0), w2.players.filter(q=>q.team===1));
    return order.indexOf(humans(w2)[0]);
  };
  w = match('2v2', 'off');                 // Versus: the human is seat 0, so a pad takes seat 1
  PADS = [pad([0])]; drive(w, 1);
  o.versusSeat = seatIn(w);
  o.versusTeam = humans(w)[0] ? humans(w)[0].team : -1;
  o.versusTakesOpposition = o.versusSeat === 1 && o.versusTeam === 1;
  w = match('2v2', 'on');                  // Co-op: your side fills first
  PADS = [pad([0])]; drive(w, 1);
  o.coopSeat = seatIn(w);
  o.coopTeam = humans(w)[0] ? humans(w)[0].team : -1;
  o.coopTakesYourSide = o.coopSeat === 1 && o.coopTeam === 0;

  // ---- two pads get two different seats, one per step ----------------------
  w = match('2v2', 'off');
  PADS = [pad([0]), pad([0])];
  drive(w, 4);
  o.twoPadsTwoSeats = humans(w).length === 2 &&
    new Set(humans(w).map(q=>q.padIndex)).size === 2 &&
    new Set(humans(w).map(q=>q.name)).size === 2;

  // ---- ...and a pad never takes a body that is already driven --------------
  w = match('1v1', 'off');                 // one bot on the pitch, four pads pressing
  PADS = [pad([0]), pad([0]), pad([0]), pad([0])];
  drive(w, 20);
  o.oneBotOneJoin = humans(w).length === 1;
  o.noSeatLeft = M.dropInSeat(w) === null;

  // ---- 3. unplugging hands the body back, name and stats intact -----------
  w = match('2v2', 'off');
  PADS = [pad([0])]; drive(w, 2);
  const joined = humans(w)[0];
  joined.ms.goals = 3;                     // something worth not losing
  const heldName = joined.name;
  joined.inX = 0.9; joined.inY = -0.7; joined.kick = true;   // a stick held at the moment it died
  PADS = [];                               // yanked
  // ⚠️ Polled WITHOUT a step, and read immediately. The handover has to clear the input
  // it inherited; one step later the AI has legitimately steered the body itself, so a
  // `drive` here would measure the bot's own choice and pass whatever the handover did.
  poll(w, 1);
  o.releasedToBot   = joined.ctrl === 'bot';
  o.keptName        = joined.name === heldName;
  o.keptStats       = joined.ms.goals === 3;
  o.releasedIsStill = joined.inX === 0 && joined.inY === 0 && joined.kick === false;
  // ...and coming back gets the same name rather than climbing to P3 forever.
  PADS = [pad([0])]; drive(w, 2);
  o.rejoinKeepsName = joined.ctrl === 'gamepad' && joined.name === heldName;

  // ---- the gates ----------------------------------------------------------
  w = match('2v2', 'off'); PADS = [pad([0])];
  M.sel.dropIn = 'off'; poll(w, 6);
  o.settingOff = humans(w).length === 0;
  M.sel.dropIn = 'on';
  M.sel.controllers = 'off'; poll(w, 6);
  o.touchInputOff = humans(w).length === 0;
  M.sel.controllers = 'on';
  // ⚠️ The attract-mode demo behind the menu is not a match to join, and pressing a
  // button there is how you navigate the menu.
  w.demo = true;  poll(w, 6); o.demoBlocked = humans(w).length === 0; w.demo = false;
  // Warm-up already hands seats to pads; that is what it is for.
  w.state='warmup'; poll(w, 6); o.warmupBlocked = humans(w).length === 0; w.state='play';
  // And after the whistle there is nothing left to play.
  w.state='over';   poll(w, 6); o.overBlocked   = humans(w).length === 0; w.state='play';
  o.blockedAgrees = M.dropInBlocked(null) === true;
  // Now with every gate open it still works, or the checks above passed for free.
  poll(w, 2);
  o.joinsOnceUngated = humans(w).length === 1;

  navigator.getGamepads = real;
  M.sel.controllers='off'; M.sel.dropIn='on';
  return o;
});

// ---- 4. it cannot perturb the simulation -----------------------------------
// ⚠️ The poll runs inside the step loop, so a stray write to a position, a velocity or
// `w.rng` would change the match. Same seed, same steps, hashed whole-world: once with
// pollDropIn firing on every step and once with it never called.
const det = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const real = navigator.getGamepads;
  const hash = (w) => { let h = 2166136261;
    const s = JSON.stringify(w.players.map(q=>[q.x,q.y,q.vx,q.vy,q.faceX,q.faceY,q.gait]))
            + JSON.stringify([w.ball.x,w.ball.y,w.ball.vx,w.ball.vy,w.score,w.rng()]);
    for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0; };
  const run = (poll) => {
    M.sel.controllers = poll ? 'on' : 'off'; M.sel.dropIn='on';
    M.sel.mode='2v2'; M.sel.kickoffRule='off';
    // ⚠️ No pad connected in EITHER run. The question is whether the poll itself
    // disturbs anything, so the two runs have to be the same match — a run where a
    // human actually took a bot over is a different match by design.
    navigator.getGamepads = () => [];
    M.setMatchSeed(21); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    for (let i=0;i<600;i++){ M.step(w); if (poll) M.pollDropIn(w); }
    return hash(w);
  };
  o.withPoll = run(true);
  o.without  = run(false);
  o.identical = o.withPoll === o.without;
  navigator.getGamepads = real;
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
  // ⚠️ Shown on 1v1 too. Extra controllers hides there, and a 1v1 has an opposition
  // bot to take over like any other match — folding this into that row hid it.
  o.shownOn1v1 = row && !row.classList.contains('hidden');
  M.sel.controllers='off'; M.updatePadInfo && M.updatePadInfo();
  o.hiddenOnTouch = row && row.classList.contains('hidden');
  M.sel.dropIn='off'; M.saveSel();
  return o;
});
await p.reload();
await p.waitForTimeout(900);
const after = await p.evaluate(()=> window.__magnet.sel.dropIn);

const all = { ...r, ...det, ...ui, afterReload: after };
const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(all.startsWithNoPads, 'the fixture started with a pad already seated, so nothing below is testing a JOIN');
ok(all.connectAloneDoesNothing, 'a merely CONNECTED pad took over a bot — a pad waking up in a bag must not walk a stranger onto the pitch mid-play; joining is a button press');
ok(all.pressJoins, 'pressing a button on a spare pad did not take over a bot, which is the whole feature');
ok(all.joinedIsPad0 && all.joinerNamed, `the joiner is wrong: pad ${all.joinedIsPad0}, name ${all.joinerNamed}`);
ok(all.versusTakesOpposition, `Versus put the joiner in seat ${all.versusSeat} on team ${all.versusTeam} — a late joiner must land in the seat it would have had at the whistle, which in Versus is the opposition`);
ok(all.coopTakesYourSide, `Co-op put the joiner in seat ${all.coopSeat} on team ${all.coopTeam} — Co-op fills YOUR side first, and drop-in reads the same padSeatOrder the kickoff assignment does`);
ok(all.twoPadsTwoSeats, 'two pads pressing did not get two different seats and two different names');
ok(all.oneBotOneJoin && all.noSeatLeft, `four pads on a 1v1 produced ${all.oneBotOneJoin} — a pad may never take a body somebody is already driving`);
ok(all.releasedToBot, 'unplugging left a body nobody was driving, which stands still in the middle of the pitch for the rest of the match');
ok(all.keptName && all.keptStats, 'a released body lost its name or its stats — the award ribbon would credit a name nobody saw playing');
ok(all.releasedIsStill, 'a released body kept the last input the pad gave it, so the AI inherited a held stick');
ok(all.rejoinKeepsName, 'a pad coming back was renamed instead of keeping the seat name it already had');
ok(all.settingOff, 'Joining late = At kickoff still let a pad join');
ok(all.touchInputOff, 'a pad joined while Input was set to Touch');
ok(all.demoBlocked, 'a pad joined the attract-mode demo behind the menu — that is not a match, and pressing a button there is how you navigate');
ok(all.warmupBlocked, 'drop-in fired during warm-up, which already hands seats to pads');
ok(all.overBlocked, 'a pad joined after the final whistle');
ok(all.blockedAgrees, 'dropInBlocked did not reject a null world');
ok(all.joinsOnceUngated, 'with every gate open it stopped working, so the gate checks above passed for free');
ok(all.identical, `the world differs with the poll running (${all.withPoll}) and without it (${all.without}) — pollDropIn is called from the step loop and may write only ctrl/padIndex/name/rotQuarter`);
ok(all.tiles === 2, `the Joining late control has ${all.tiles} tiles`);
ok(all.shownOn1v1, 'the control is hidden on 1v1, which has an opposition bot to take over like any other match');
ok(all.hiddenOnTouch, 'the control is offered while Input is Touch, where it can do nothing');
ok(all.afterReload === 'off', `the choice did not survive a reload: ${all.afterReload}`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(all, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ndropin OK');
