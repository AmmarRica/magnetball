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
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  const pad = (down) => ({ connected:true, mapping:'standard', id:'Fake Controller (STANDARD GAMEPAD)', axes:[0,0,0,0],
    buttons: Array.from({length:17}, (_,i)=>({ pressed:(down||[]).includes(i),
                                              value:(down||[]).includes(i)?1:0 })) });
  const realPads = navigator.getGamepads;
  let PADS = [];
  // WARNING: NO BACKTICKS IN HERE — this file builds its page with new Function() and a
  // template literal, so one closes the string early (the trap tests/lobbykb.mjs records).
  // THE FIXTURE FIRES gamepaddisconnected, because a real browser always does. Without it
  // this emulates a pad that silently stops being REPORTED, which the game now treats as a
  // poll glitch and rides out for PAD_GRACE: a slot of nulls for a frame is exactly what a
  // re-enumerating browser hands back, and it used to bench a body and blank the controller
  // row in the corner. A genuine unplug comes with the event and is acted on at once.
  let _padN = 0;
  // A TRANSIENT POLL GAP, which is a DIFFERENT THING from an unplug and is the whole of
  // what block 5d measures: the browser hands back a slot of nulls for one poll and fires
  // NO gamepaddisconnected. Deliberately returns before the shrink counting below, so no
  // event goes out — telling those two apart is the game's job, not the fixture's.
  let GLITCH = null;
  navigator.getGamepads = () => {
    if (GLITCH) return GLITCH;
    // Counts LIVE entries rather than array length: a pad is unplugged in these suites by
    // writing null into its slot, which leaves the length alone.
    // _padN is updated BEFORE the dispatch: the game's handler calls getGamepads() itself
    // to sweep, which re-enters this and would recurse for ever otherwise.
    const n = PADS.reduce((c, g) => c + (g && g.connected && g.buttons && g.buttons.length ? 1 : 0), 0);
    const shrank = n < _padN;
    _padN = n;
    if (shrank) window.dispatchEvent(new Event('gamepaddisconnected'));
    return PADS;
  };
  const START = 9;
  const match = (mode, coop) => {
    // A fresh match here is also a fresh PLATFORM: PADS is reassigned wholesale between
    // blocks, and a slot remembered from the last one stays live for PAD_GRACE, which is
    // state leaking across two scenarios that are meant to be independent. A real browser
    // never swaps its own gamepad list out like this.
    M.padForgetAll();
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
  // A goal, driven through the real step hook. It no longer brings anybody on — the hold
  // does that — but the goal state is still what several other rules key off.
  const goal = (w) => { w.state='goal'; w.stateT=0;
                        M.step(w); M.pollDropIn(w); };
  // Bring a waiting body on the way a PERSON does: hold the stick straight into the pitch
  // for three seconds. It mutates the live pad object rather than rebuilding PADS, so every
  // other seat keeps whatever it was doing, and it drives the real step loop, because
  // pollSubHold reads inX/inY exactly as stepBench wrote them. Setting the flag by hand
  // would test nothing about the wiring, which is the whole of what changed.
  const holdIn = (w, p, steps) => {
    const g = PADS[p.padIndex];
    if (!g) return false;
    const inw = M.subInward(w, p);
    g.axes = [inw.x, inw.y, 0, 0];
    drive(w, steps || 220);
    g.axes = [0, 0, 0, 0];
    drive(w, 1);
    return w.players.includes(p);
  };
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

  // ---- 2. NO BUTTON JOINS — you hold toward the pitch --------------------
  // ⚠️ **THIS BLOCK IS REVERSED, DELIBERATELY.** It used to check that START armed you,
  // that START again cancelled, and that a goal was what brought you on. That whole
  // mechanism is gone: a goal can be minutes away, and out on the touchline every button
  // is spare, so a press was a gesture with no weight behind it. Holding the stick INTO
  // the pitch for three seconds is the gate now, and these lines check the OLD gate is
  // shut — pressing everything for a good while must leave the guest exactly where it is.
  goal(w);
  o.goalBringsNobodyOn = onPitch(w).length === 0 && waiting(w).length === 1;
  w.state='play'; w.stateT=2;
  PADS = [pad([START])]; drive(w, 40);
  PADS = [pad([0])];     drive(w, 40);   // ...and a kick button, which the old gate took
  PADS = [pad([])];      drive(w, 5);
  o.buttonsDoNotJoin = onPitch(w).length === 0 && waiting(w).length === 1;
  // ⚠️ ...and neither does walking about. stepBench pushes a waiting body back out, so
  // "held the stick toward the pitch" and "crossed the line" are different claims and only
  // the first one is the gate — without this, a build with no hold at all but a leaky
  // touchline would pass the block below.
  guest.y = 140;                          // walked well into team 0's half
  o.pickedSide = M.subSideOf(w, guest);

  // ---- 3 + 4. THE THREE-SECOND HOLD, the side it picked, and evening up ----
  // The gate is at +x, so "into the pitch" is -x. Driven through the real stick, because
  // pollSubHold reads inX/inY as stepBench wrote them — writing the flag by hand would
  // test nothing about the wiring, and writing the stick tests the seat rotation too.
  const inw = M.subInward(w, guest);
  o.inward = [inw.x, inw.y];
  // ⚠️ Counted BEFORE, because "the side lost a bot" is the claim and an absolute number
  // is a different one. There is already a KEYBOARD seat on team 0 (startMatch gives seat
  // one to the keys when no pad has taken it), so team 0 is a person and two bots rather
  // than three — the first version of this asserted 2 bots after and was measuring that
  // seat rather than the rule.
  o.botsOnSideBefore = w.players.filter(q=>q.team===o.pickedSide && q.ctrl==='bot').length;
  const push = () => { const g = pad([]); g.axes = [inw.x, inw.y, 0, 0]; return g; };
  PADS = [push()]; drive(w, 60);          // one second in
  o.holdShows = M.joinHoldFrac(guest) > 0.2 && M.joinHoldFrac(guest) < 0.6;
  o.stillWaitingAt1s = onPitch(w).length === 0;
  // ⚠️ AND IT RESETS when the stick comes off, or three seconds of holding is really
  // three seconds of nudging it whenever you remember.
  PADS = [pad([])]; drive(w, 3);
  o.holdResets = M.joinHoldFrac(guest) === 0;
  PADS = [push()]; drive(w, 200);         // and now hold it out
  o.joinedOnHold   = onPitch(w).length === 1 && waiting(w).length === 0;
  o.joinedTeam     = onPitch(w)[0] ? onPitch(w)[0].team : -1;
  o.joinedPickedSide = o.joinedTeam === o.pickedSide;
  o.joinedDuringPlay = w.state === 'play';
  PADS = [pad([])]; drive(w, 1);
  o.sidesAfterJoin = sides(w);
  o.perAfterJoin   = M.subPer(w);
  o.botsOnSideAfter = w.players.filter(q=>q.team===o.joinedTeam && q.ctrl==='bot').length;
  // ⚠️ **THE SIDE WAS ALL BOTS, SO THE JOINER TAKES A SHIRT AND THE MATCH DOES NOT GROW.**
  // This assertion is REVERSED from what it used to be (a 3v3 that gained a player had to
  // become a 4v4). The growth branch is measured in the balance block, on a side that is
  // all people — the two are different halves of one rule and neither alone is it.
  o.rosterAfterJoin = w.players.map(q=>q.team+':'+q.ctrl).join('|');
  o.takesTheBotsShirt = o.sidesAfterJoin[0] === 3 && o.sidesAfterJoin[1] === 3 &&
                        o.perAfterJoin === 3 &&
                        o.botsOnSideAfter === o.botsOnSideBefore - 1;
  // The AI is suppressed while a body walks on, or a thinking bot fights walkTo and jitters.
  const walker = w.players.find(q => q._subTo);
  o.walkerMoves = null;
  if (walker){ const wx0 = walker.x, wy0 = walker.y; M.step(w);
               o.walkerMoves = (walker.x !== wx0 || walker.y !== wy0); }
  // Kickoff closes the window and finishes any walk.
  w.stateT = 2.0; M.step(w);
  o.kickoffClearsWalks = w.players.every(q=>!q._subTo);

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
  // ⚠️ ...AND IT DRIVES AGAIN. "The same body came back" and "that person can play" are
  // different claims — the seat is only real once padIndex is pointing at the pad that
  // actually returned, and a body handed back with a stale index sits there for the rest
  // of the match looking exactly like a reclaim that worked. Same lesson fourpads
  // records: a seat existing is not a pad moving its own body.
  // WARNING: A RECONNECT IS A TAKEOVER NOW, NOT A JOIN — the press puts them straight
  // back on, MID-PLAY, with no goal in between. That is the whole change, so the goal is
  // deliberately not staged here: if this only passes once a goal has been forced, the
  // old wait is still in place. The walk in through the gate then has to be allowed to
  // finish before anything is measured, or stepSubWalk is still steering the body and
  // the probe below reads the walk instead of the stick.
  w.state = 'play'; w.stateT = 1;                      // mid-play, no goal anywhere near
  holdIn(w, left);
  o.reclaimedState = w.state;
  o.reclaimedComesBackOnAtOnce = w.players.includes(left) && w.state === 'play';
  for (let i = 0; i < 240 && left._subTo; i++){ M.step(w); M.pollDropIn(w); }
  o.reclaimedWalkFinished = !left._subTo;
  o.reclaimedComesBackOn = w.players.includes(left);
  if (o.reclaimedComesBackOn){
    // Park everybody else at the far end and take the ball away, or a shove from a bot
    // reads as the stick working. Only this body's own travel is being measured.
    for (const q of w.players) if (q !== left){ q.x = 0; q.y = 9e3; }
    w.ball.x = 9e3; w.ball.y = 9e3;
    left.x = 0; left.y = 0; left.vx = left.vy = 0;
    PADS = [Object.assign(pad([]), { axes:[1,0,0,0] })];
    for (let i=0;i<40;i++){ M.step(w); M.pollDropIn(w); }
    o.reclaimedDrives = left.x > 40 && Math.abs(left.y) < 10;
    o.reclaimedTravel = [Math.round(left.x), Math.round(left.y)];
  }

  // ---- 5b. ...AND IT COMES BACK ON A DIFFERENT INDEX -----------------------
  // ⚠️ THE CASE THAT ACTUALLY STRANDED PEOPLE. _padWas matched on the index alone, and
  // a pad does not always get its old slot back — unplug one while another is connected,
  // or replug over Bluetooth, and the browser hands out the next FREE index. Measured on
  // the build before the fix: a guest with two goals came back as a brand-new P2 with
  // none, and the half-match they had played sat on the bench, unreachable, for the rest
  // of the game. The device id is the fallback.
  // ⚠️ The old slot is left as a NULL HOLE rather than spliced out, because that is what
  // a browser really does — splicing renumbers every pad above it and the check would be
  // measuring its own stub.
  {
    const w2 = match('3v3');
    PADS = [pad([])]; drive(w2, 3);
    const guest = waiting(w2)[0];
    const guestName = guest.name;
    o.movedIdxCameOn = holdIn(w2, guest);
    guest.ms.goals = 2;
    PADS = []; drive(w2, 3);
    PADS = [null, pad([])]; drive(w2, 3);          // back, on index 1
    const wl = waiting(w2);
    o.movedIdxOneBody   = wl.length === 1;
    o.movedIdxSameBody  = wl.length === 1 && wl[0] === guest && wl[0].name === guestName;
    o.movedIdxKeptGoals = wl.length === 1 && wl[0].ms.goals === 2;
    o.movedIdxNewIndex  = wl.length === 1 && wl[0].padIndex === 1;
    o.movedIdxNames     = wl.map(q => q.name);
  }

  // ---- 5c. TWO IDENTICAL CONTROLLERS, and why the INDEX is tried first ------
  // ⚠️ gamepad.id is a MODEL NAME, so two of the same controller report the same string
  // and the device fallback cannot tell them apart. That is exactly why it is a fallback:
  // the index is tried first, and it is the only match that cannot be a guess. Sabotage
  // shows why this block has to exist at all — dropping the index branch entirely leaves
  // every other check in this suite green, because with one pad the device matches too.
  {
    const w3 = match('3v3');
    PADS = [pad([]), pad([])]; drive(w3, 3);       // same id on both, by construction
    const g = waiting(w3);
    o.twoGuests = g.length === 2;
    if (o.twoGuests){
      g[0].name = 'GuestA'; g[1].name = 'GuestB';
      const idxOf = {}; g.forEach(q => { idxOf[q.name] = q.padIndex; });
      o.twoGuestIdx = [idxOf.GuestA, idxOf.GuestB];
      // ⚠️ They have to COME ON first. A body that never made it onto the pitch is
      // deliberately discarded when its pad goes away (dropOut's !wasOn branch clears
      // the touchline), so a twin check on two waiting bodies measures two bodies that
      // no longer exist — which is what the first version of this block did, and it
      // reported a brand-new P2 for a reason that had nothing to do with the rule.
      g.forEach(q => holdIn(w3, q));
      o.twinsCameOn = g.every(q => w3.players.includes(q));
      PADS = []; drive(w3, 3);                     // both walk away
      o.bothGone = waiting(w3).length === 0;
      // Only the one that was on slot 1 comes back, on slot 1.
      PADS = [null, pad([])]; drive(w3, 3);
      const backList = waiting(w3);
      const want = idxOf.GuestA === 1 ? 'GuestA' : 'GuestB';
      o.twinBackOne  = backList.length === 1;
      o.twinRightOne = backList.length === 1 && backList[0].name === want;
      o.twinGot      = backList.map(q => q.name);
      o.twinWanted   = want;
    }
  }

  // ---- 4b. THE HOLD IS DRAWN, as a ring round the waiting body -------------
  // ⚠️ Measured as a DIFFERENCE against the same frame with the hold stood down, taken at
  // the same camera in the same run. A bench body already carries a rim and a faceplate,
  // so an absolute ink count in that annulus reads well over zero on a build that draws no
  // ring at all — the trap tests/lobbyhold.mjs records for the other two holds.
  // ⚠️ ...and paired with the ring being GONE at zero, or "there is ink there" is equally
  // true of something painted round every waiting body all the time, which is furniture.
  {
    const w5 = match('3v3');
    PADS = [pad([])]; drive(w5, 4);
    const g5 = waiting(w5)[0];
    o.ringGuest = !!g5;
    if (g5){
      const cv = document.getElementById('game'), gx = cv.getContext('2d');
      const grab = () => gx.getImageData(0, 0, cv.width, cv.height).data;
      g5.joinHold = M.LOBBY.holdJoin * 0.6;
      M.computeCam(); M.render();
      const withRing = grab();
      g5.joinHold = 0;
      M.computeCam(); M.render();
      const without = grab();
      const c = M.screenPt(M.wx(g5.x), M.wy(g5.y));
      const r0 = g5.r * M.cam.s * 1.6, r1 = g5.r * M.cam.s * 3.4;
      let angles = 0;
      for (let a = 0; a < 360; a += 2){
        for (let rr = r0; rr <= r1; rr += 0.5){
          const x = Math.round(c[0] + Math.cos(a*Math.PI/180)*rr);
          const y = Math.round(c[1] + Math.sin(a*Math.PI/180)*rr);
          if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) continue;
          const i = (y*cv.width + x)*4;
          if (Math.abs(withRing[i]-without[i]) + Math.abs(withRing[i+1]-without[i+1]) +
              Math.abs(withRing[i+2]-without[i+2]) > 40){ angles++; break; }
        }
      }
      o.ringAngles = angles;
      // 60% of the way round, from twelve o'clock — well clear of a full circle and well
      // clear of nothing.
      o.ringDrawn = angles > 60 && angles < 175;
      // ...and nothing at all when the hold is not running.
      M.computeCam(); M.render();
      const again = grab();
      let idle = 0;
      for (let a = 0; a < 360; a += 2){
        for (let rr = r0; rr <= r1; rr += 0.5){
          const x = Math.round(c[0] + Math.cos(a*Math.PI/180)*rr);
          const y = Math.round(c[1] + Math.sin(a*Math.PI/180)*rr);
          if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) continue;
          const i = (y*cv.width + x)*4;
          if (Math.abs(again[i]-without[i]) + Math.abs(again[i+1]-without[i+1]) +
              Math.abs(again[i+2]-without[i+2]) > 40){ idle++; break; }
        }
      }
      o.ringIdle = idle;
      o.ringGoesAway = idle === 0;
    }
  }

  // ---- 4c. A WAITING BODY'S STICK POINTS THE SAME WAY AS A PLAYING ONE'S ----
  // ⚠️ **EVERY ONE OF THE ELEVEN applySeatRotation CALL SITES PASSED w.players, which
  // is exactly the list a waiting body is NOT in.** So a controller standing on the
  // touchline got neither the layout's quarter-turn nor SELECT's — mkPlayer leaves
  // rotQuarter undefined and nothing on that path ever wrote it. Measured on the shipped
  // build: the body on the pitch travelled (+60, 0) for a stick pushed up and the body
  // waiting beside it travelled (0, -104) for the SAME push, ninety degrees apart; SELECT
  // stored the turn in sel.seatRot and left the body alone.
  // ⚠️ **THE PITCH HAS TO BE TURNED OR THIS CHECK IS VACUOUS.** The fixture pins
  // sel.orient = 'v' on purpose (this suite is not about orientation), and upright the
  // layout's base rotation is 0 — so both bodies read 0 and the broken build passes. It is
  // forced to 'h' here and put back afterwards.
  // ⚠️ Compared as the HEADING the game was told (inX/inY after applyHumanInput),
  // never as travel: stepBench holds a waiting body in the ring outside the pitch, so a
  // push toward the outer margin reads as zero movement on a perfectly rotated body.
  {
    const wasOrient = M.sel.orient;
    M.sel.orient = 'h';
    const w6 = match('3v3');
    if (M.syncPitchTurn) M.syncPitchTurn();
    PADS = [pad([])]; drive(w6, 4);
    // The on-pitch control is the KEYBOARD seat, which startMatch gives seat one when no
    // pad took it — a human either way, and the thing a waiting body has to agree with.
    const onPitch = w6.players.find(q => q.ctrl !== 'bot');
    const wait6 = waiting(w6)[0];
    o.rotGuest = !!(onPitch && wait6);
    if (o.rotGuest){
      o.turned = M.pitchHorizontal();
      o.onPitchRot = onPitch.rotQuarter;
      o.waitRot = wait6.rotQuarter;
      o.rotMatches = wait6.rotQuarter === onPitch.rotQuarter;
      // The same physical stick, pushed once, read off both bodies.
      const g = PADS[0]; g.axes = [0, -1, 0, 0];
      M.pads.p1.dx = 0; M.pads.p1.dy = -1;
      M.step(w6); M.pollDropIn(w6);
      o.onPitchIn = [Math.round(onPitch.inX*100)/100, Math.round(onPitch.inY*100)/100];
      o.waitIn = [Math.round(wait6.inX*100)/100, Math.round(wait6.inY*100)/100];
      o.sameHeading = Math.abs(onPitch.inX - wait6.inX) < 0.02 &&
                      Math.abs(onPitch.inY - wait6.inY) < 0.02;
      g.axes = [0,0,0,0]; M.pads.p1.dx = 0; M.pads.p1.dy = 0;
      // ⚠️ ...AND SELECT REACHES IT. Driven through bumpSeatRot, which is what the real
      // poll calls — pollSeatRotate fires on a RELEASE inside pollWarmupHold during a
      // live match, and what is under test here is that the turn reaches the BENCH.
      const before = wait6.rotQuarter;
      M.bumpSeatRot(wait6.padIndex);
      o.selStored = (M.sel.seatRot || {})[wait6.padIndex];
      o.waitRotAfterSel = wait6.rotQuarter;
      o.selectReaches = wait6.rotQuarter !== before && wait6.rotQuarter === (before + 1) % 4;
      M.sel.seatRot = {};
    }
    M.sel.orient = wasOrient;
    if (M.syncPitchTurn) M.syncPitchTurn();
  }

  // ---- 5d. A DROPPED POLL IS NOT AN UNPLUG ---------------------------------
  // ⚠️ THE BUG (no backticks in here — see the fixture's warning): pollDropIn's leaver
  // test read navigator.getGamepads() ITSELF rather than connectedGamepadIndices(), which
  // is the file's one answer to "is this pad here" and the only thing that knows about
  // PAD_GRACE. So the debounce that stopped a re-enumeration blanking the controller row
  // in the corner did nothing for the ROSTER: one dropped poll benched a player,
  // evenUpSides walked a filler bot on in their shirt, and the pad came back only as a
  // touchline prompt. Measured on the shipped build, sixty frames later it was still gone.
  // ⚠️ THE CONTROL IS A REAL UNPLUG IN THE SAME RUN. "A poll gap changes nothing" is also
  // true of a build where drop-out never fires at all, which would be a worse bug than the
  // one being fixed — so the same pad is then genuinely unplugged (event and all) and must
  // leave. Blocks 5/5b already prove the reclaim; this one is only about telling the two
  // events apart.
  {
    // ⚠️ The pads have to be there AT THE WHISTLE. match() clears PADS before
    // startMatch, and a pad that connects afterwards is a GUEST on the touchline — so a
    // block built on it measures nobody on the pitch, which is what the guard above is
    // for. Seats are dealt in startMatch; this is about keeping one.
    M.padForgetAll();
    M.sel.controllers='on'; M.sel.coop='off'; M.sel.dropIn='on';
    M.sel.mode='3v3'; M.sel.kickoffRule='off'; M.sel.autoReplay=false;
    PADS = [pad([]), pad([]), pad([])];
    M.setMatchSeed(3); M.startMatch();
    const w4 = M.world; w4.state='play'; w4.stateT=2;
    drive(w4, 3);
    o.glitchSeats = onPitch(w4).length;
    GLITCH = [PADS[0], null, PADS[2]];   // one poll with the middle slot missing
    drive(w4, 1);
    GLITCH = null;
    drive(w4, 2);
    o.glitchKeptSeats = onPitch(w4).length;
    o.glitchBenched   = bench(w4).length;
    o.glitchRidesOut  = o.glitchSeats === 3 && o.glitchKeptSeats === 3 && o.glitchBenched === 0;
    PADS = [PADS[0], null, PADS[2]];     // ...and now it really goes away
    drive(w4, 3);
    o.realUnplugSeats = onPitch(w4).length;
    o.realUnplugLeaves = o.realUnplugSeats === 2;
  }

  // ---- 5e. AN ARCADE CABINET'S PANEL SEATS ARE NOT REAL GAMEPADS ------------
  // ⚠️ A cabinet's four panels are VIRTUAL pads — the harness wires them into a keyboard
  // encoder and connectedGamepadIndices() answers for them directly — so
  // navigator.getGamepads() is EMPTY by construction. Reading it for liveness therefore
  // benched every seat on the machine: measured on the shipped build, all four gone
  // within ten frames of the whistle, with every stick driving a bot.
  {
    const wasDisp = M.sel.display, wasPlay = M.sel.arcadePlay;
    M.sel.display = 'arcade'; M.sel.arcadePlay = 'free';
    PADS = [];                                  // a cabinet has no real pads at all
    M.padForgetAll();
    M.sel.mode = '2v2'; M.setMatchSeed(3); M.startMatch();
    const wc = M.world; wc.state = 'play'; wc.stateT = 2;
    o.cabSeats = onPitch(wc).length;
    drive(wc, 10);
    o.cabKeptSeats = onPitch(wc).length;
    o.cabHoldsSeats = o.cabSeats === 4 && o.cabKeptSeats === 4 && bench(wc).length === 0;
    M.sel.display = wasDisp; M.sel.arcadePlay = wasPlay;
  }

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
    if (g){ g.y = y; holdIn(w, g); }
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

  // ⚠️ **TWO BRANCHES, AND THE OLD SUITE ONLY HAD ONE.** It required a 1v1 to become a 2v2
  // whatever the joiner walked onto, under the rule "arriving must never cost a body its
  // place". Asked for instead: they either replace the bot or a bot joins the other team.
  // Which of the two happens is decided by the PEOPLE on that side — a side carrying a bot
  // has a shirt going spare and the size does not move; a side that is all people has to
  // grow, and the other half gets a bot to match. Counting BODIES cannot separate them: it
  // grows in both cases, and the first then reads as arriving having cost the other side a
  // bot for nothing.
  // (a) REPLACE: a 1v1 with nobody on the pitch is a bot each way, so a joiner takes one.
  w = match('1v1', 'off');
  {
    const g = join(w, -140);
    o.replaceSides = sides(w);
    o.replaceTeam  = g ? g.team : -1;
    o.replaceBots  = w.players.filter(q => q.team === o.replaceTeam && q.ctrl === 'bot').length;
    o.replacesBot  = JSON.stringify(o.replaceSides) === '[1,1]' && o.replaceBots === 0 &&
                     M.subPer(w) === 1 && o.replaceTeam >= 0;
  }
  // (b) GROW: now that side is a person, so the next one onto it makes the match bigger.
  {
    PADS = [PADS[0], pad([])]; drive(w, 3);
    const g2 = waiting(w)[0];
    o.growSecondWaiting = !!g2;
    if (g2){
      g2.y = -140;                                  // the same half, which is now a person
      const other = 1 - o.replaceTeam;
      o.growOtherBefore = w.players.filter(q => q.team === other && q.ctrl === 'bot').length;
      holdIn(w, g2);
      o.growSides = sides(w);
      o.growPer   = M.subPer(w);
      o.growOtherBots = w.players.filter(q => q.team === other && q.ctrl === 'bot').length;
      o.growsToTwo = JSON.stringify(o.growSides) === '[2,2]' && o.growPer === 2 &&
                     o.growOtherBots === o.growOtherBefore + 1;
    }
  }

  // ⚠️ The CAP holds. Pads keep arriving and pressing START; the sides must stop growing
  // at LOBBY.maxPerSide rather than filling the pitch with bodies.
  w = match('4v4', 'off');
  for (let k=0;k<14;k++){
    PADS = Array.from({length:k+1}, ()=>pad([]));      drive(w, 2);
    waiting(w).forEach(q=>{ q.y = 140; });
    waiting(w).slice().forEach(q=>{ holdIn(w, q, 200); });
  }
  o.cappedSides = sides(w);
  // WARNING: this block is inside a new Function(...) TEMPLATE LITERAL, so a backtick in
  // a comment here ends the template and the whole file stops parsing. Plain words only.
  // Read from LOBBY.maxPerSide rather than a literal 8: the cap is a number the owner
  // moves (it went to 11 for a full-size team), and a check that has to be edited every
  // time it changes is one nobody trusts. The RULE is that it holds and the sides stay even.
  o.capValue = M.LOBBY.maxPerSide;
  o.capHolds = o.cappedSides[0] <= o.capValue && o.cappedSides[1] <= o.capValue &&
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
  // ⚠️ A joiner onto a 6v6 of BOTS takes a shirt rather than making it a 7v7 — the same
  // two-branch rule as above, and the floor is what this block is really about: the match
  // must not fall back to the mode's 4v4 when the pad goes away again.
  join(w, 140);
  o.fromSix = sides(w);
  o.holdsAtSix = JSON.stringify(o.fromSix) === '[6,6]';
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
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
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
    // Swapping the platform out from under the game leaves slots remembered from the
    // blocks above alive for PAD_GRACE, so the first arm can see a ghost pad the second
    // one does not. A real browser never swaps its own gamepad API.
    M.padForgetAll();
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
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
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
ok(all.goalBringsNobodyOn, 'a goal dragged a waiting player onto the pitch — a goal is not a gate any more, the three-second hold is');
ok(all.buttonsDoNotJoin, 'a BUTTON put a waiting player on. The press was replaced deliberately: a goal can be minutes away, and out on the touchline every button is spare, so a press was a gesture with nothing behind it');
ok(all.holdShows, `one second of holding toward the pitch read ${all.holdShows} — the hold has to be running and visibly part way, or the ring has nothing to draw and the three seconds are not being counted`);
ok(all.stillWaitingAt1s, 'a waiting player came on after one second — three seconds is the whole safeguard, and it is what makes the stick safe to use for this at all');
ok(all.holdResets, 'letting go did not reset the hold, so three seconds of holding is really three seconds of nudging it whenever you remember');
ok(all.joinedOnHold, `holding toward the pitch (${JSON.stringify(all.inward)}) for three seconds did not bring the waiting player on`);
ok(all.joinedDuringPlay, 'the hold only took effect once the state had left PLAY — a hold that long is a decision already taken, and waiting for a goal on top of it is the thing being removed');
ok(all.joinedPickedSide, `the joiner went to team ${all.joinedTeam} having stood beside half ${all.pickedSide} — the side you walk to is the side you get`);
ok(all.takesTheBotsShirt, `a joiner onto a side of BOTS left it at ${JSON.stringify(all.sidesAfterJoin)} with ${all.botsOnSideAfter} bots and a size of ${all.perAfterJoin} — asked for as "they either replace the bot or a bot joins other team", and a side carrying a bot has a shirt going spare, so the match must not get bigger`);
ok(all.walkerMoves !== false, 'a bot walking on through the gate never moved — walkTo sets position directly, so the AI has to be suppressed for it or the two fight');
ok(all.kickoffClearsWalks, 'the kickoff left a half-finished walk-on steering a body away from its mark, or the substitution window stayed open');
ok(all.shrankBack, `unplugging left the sides at ${JSON.stringify(all.sidesAfterLeave)} instead of back at 3v3`);
ok(all.leftToBench && all.noOrphanOnPitch, 'a departed player was left on the pitch with nobody driving it, standing still in the middle');
ok(all.keptNameStats, 'a departed player lost its name or its stats');
ok(all.onScoresheet, 'a player who left mid-match vanished from the scoresheet — the half they played would read as though it never happened');
ok(all.reclaimsBody, 'a controller coming back got a fresh body instead of reclaiming its own, stranding its half-match on the bench');
ok(all.reclaimedComesBackOnAtOnce && all.reclaimedWalkFinished,
   `a reconnecting player did not come straight back on: onAtOnce ${all.reclaimedComesBackOnAtOnce}, walkFinished ${all.reclaimedWalkFinished}. Unplugging benches the body and a filler bot takes the shirt; coming back it used to be handed over as a stranger ("START = JOIN HOME") and then made to wait for a goal, which is a long time out of a match you were already playing for a cable somebody kicked`);
ok(all.reclaimedComesBackOn && all.reclaimedDrives,
   `a reclaimed body did not DRIVE again — came back on: ${all.reclaimedComesBackOn}, travel ${JSON.stringify(all.reclaimedTravel)}. "The same body came back" and "that person can play" are different claims, and a stale padIndex looks exactly like a reclaim that worked`);
ok(all.rotGuest, 'no guest reached the touchline, so the stick-rotation checks below measure nothing');
ok(all.turned === true, `the pitch is not turned (${all.turned}), so both bodies read rotation 0 and the check below passes on the broken build`);
ok(all.rotMatches, `a waiting body's stick rotation is ${all.waitRot} against ${all.onPitchRot} on the pitch — every applySeatRotation call site passed w.players, which is the one list a waiting body is not in, so a joiner got neither the layout's quarter-turn nor SELECT's`);
ok(all.sameHeading, `the same stick gave ${JSON.stringify(all.onPitchIn)} on the pitch and ${JSON.stringify(all.waitIn)} on the touchline — ninety degrees apart is what "the controller direction does not match" is`);
ok(all.selectReaches, `SELECT stored ${all.selStored} and left the waiting body at ${all.waitRotAfterSel} — the turn has to reach the bench, or flipping it does nothing for the one body you are trying to steer`);
ok(all.ringGuest, 'no guest reached the touchline, so the ring check measures nothing');
ok(all.ringDrawn, `the join hold drew ${all.ringAngles} of 180 probe angles round the waiting body — the hold has to be SEEN, or three seconds of nothing happening reads as a controller that is not working`);
ok(all.ringGoesAway, `${all.ringIdle} angles were still inked with no hold running — a ring round every waiting body all the time is furniture, not a progress arc`);
ok(all.glitchSeats === 3, `only ${all.glitchSeats} of 3 pads took a seat, so the poll-gap check below is measuring nothing`);
ok(all.glitchRidesOut,
   `one dropped getGamepads() poll benched a player: seats ${all.glitchSeats} -> ${all.glitchKeptSeats}, bench ${all.glitchBenched}. A slot of nulls for a frame with no gamepaddisconnected is a browser re-enumerating, not somebody pulling a cable — PAD_GRACE rides it out, and the roster has to ask connectedGamepadIndices() the same as everything else rather than reading the raw snapshot itself`);
ok(all.realUnplugLeaves,
   `a REAL unplug left ${all.realUnplugSeats} seats instead of 2 — "a poll gap changes nothing" is also true of a build where nobody can ever leave, which is why the control is measured in the same run`);
ok(all.cabSeats === 4, `an arcade cabinet dealt ${all.cabSeats} of 4 panel seats, so the check below is measuring nothing`);
ok(all.cabHoldsSeats,
   `an arcade cabinet lost its panel seats in ten frames: ${all.cabSeats} -> ${all.cabKeptSeats}. A panel is a VIRTUAL pad, so navigator.getGamepads() is empty by construction and reading it for liveness benches every stick on the machine`);
ok(all.movedIdxCameOn, 'the guest never made it onto the pitch, so the different-index check below is measuring nothing');
ok(all.twoGuests && all.twinsCameOn && all.bothGone,
   `the two-identical-controllers fixture did not set up (two guests ${all.twoGuests}, both came on ${all.twinsCameOn}, both left ${all.bothGone}), so the check below measures nothing`);
ok(all.twinBackOne && all.twinRightOne,
   `two identical controllers: slot 1 came back and got ${JSON.stringify(all.twinGot)} instead of ${all.twinWanted} — gamepad.id is a MODEL name, so the device fallback cannot tell two of the same pad apart and the INDEX has to be tried first`);
ok(all.movedIdxOneBody && all.movedIdxSameBody && all.movedIdxKeptGoals && all.movedIdxNewIndex,
   `a controller that came back on a DIFFERENT index was treated as a new player: ${JSON.stringify(all.movedIdxNames)}, one body ${all.movedIdxOneBody}, same body ${all.movedIdxSameBody}, goals kept ${all.movedIdxKeptGoals}, new index ${all.movedIdxNewIndex} — a pad rarely gets its old slot back once another is connected, and matching on the index alone stranded a two-goal half-match on the bench`);
ok(all.undecidedFollowsCoop, `an undecided joiner went to ${all.undecidedVersus} on Versus and ${all.undecidedCoop} on Co-op — Extra controllers already means exactly this question`);
ok(all.replacesBot, `a joiner onto a bot's side made it ${JSON.stringify(all.replaceSides)} with ${all.replaceBots} bots still on that half — replacing is the no-growth branch`);
ok(all.growSecondWaiting, 'the second guest never reached the touchline, so the growth check below measures nothing');
ok(all.growsToTwo, `a joiner onto a side that is ALL PEOPLE left the match at ${JSON.stringify(all.growSides)} (size ${all.growPer}, ${all.growOtherBots} bots opposite) instead of a 2v2 — with no bot to replace, the other half has to gain one`);
ok(all.capHolds, `pads kept arriving and the sides reached ${JSON.stringify(all.cappedSides)} — the per-side cap has to hold`);
ok(all.floorReadsRoster, `the floor read ${all.floor} for a 6v6 on a 4v4 mode — the lobby can field six a side, and a floor of mode.per would take two bots off each side`);
ok(all.holdsAtSix, `a joiner onto a 6v6 of bots made it ${JSON.stringify(all.fromSix)} — there was a bot's shirt going spare, so the size must not move`);
ok(all.shrankToFloor, `a 7v7 losing its guest became ${JSON.stringify(all.backToFloor)} — it may never shrink past the size it kicked off at`);
ok(all.idempotent, 'evenUpSides changed a balanced pitch, so it is not safe to call twice');
ok(all.settingOff, 'Joining late = At kickoff still produced a waiting player');
ok(all.touchInput, 'a waiting player appeared while Input was set to Touch');
ok(all.demo, 'a controller joined the attract-mode demo behind the menu');
ok(all.warmup, 'drop-in fired during warm-up. It used to say warm-up "already hands seats to pads", which was simply untrue and is the bug tests/warmupjoin.mjs was written for; warm-up has its own path now (pollLobbyPads) and the two must not both run, or a joiner gets a body AND a touchline stranger');
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
