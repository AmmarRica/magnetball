// WATCHING A REPLAY: the goal TAIL, and the transport.
//
// Two things, and they answer the same complaint — a replay that stops the instant the ball
// crosses the line stops before the bit you wanted to see, and one that plays at a fixed
// speed with no pause is something you watch rather than something you study.
//
// 1. THE TAIL. `checkGoal` sets `state='goal'` and the goal state still integrates ("ball
//    flies into the net; players can keep moving"), so those frames were being captured into
//    the rolling buffer and then thrown away, because `repOnGoal` froze at the crossing.
//    The freeze is delayed by REP_TAIL now, and `goalAt` records where the ball crossed.
// 2. THE TRANSPORT. Pause, four speeds and an exit, but ONLY for a replay you chose to
//    watch. The instant replay after a goal stays a one-gesture skip.
//
// ⚠️ MEASUREMENT TRAP recorded here: the transport first lived inside `#hud`, and playback
// hides the HUD — so `#repCtl` was visible by its own class and ZERO PIXELS TALL in reality.
// `classList.contains('hidden')` said everything was fine. The suite measures rendered
// button boxes, never the class.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const page = async () => {
  const p = await b.newPage({ viewport:{ width:480, height:950 }, isMobile:true, hasTouch:true });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(800);
  await p.evaluate(() => { const d = document.getElementById('dmCollect'); if (d) d.click(); });
  return p;
};

// ---- 1. the goal tail ------------------------------------------------------
{
  const p = await page();
  const r = await p.evaluate(() => {
    const M = window.__magnet, o = {};
    M.setMatchSeed(9); M.sel.mode = '1v1'; M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 1;
    // ⚠️ A REAL goal, not a hand-set state: the tail depends on `checkGoal` firing and on
    // the goal state continuing to integrate, and neither happens if the flag is faked.
    let steps = 0;
    while (w.state !== 'goal' && steps < 6000){ M.step(w); steps++; }
    o.realGoal = w.state === 'goal';
    // Frozen immediately so the replay bar and Save replay are never looking at nothing.
    o.frozenAtOnce = !!(M.lastReplay && M.lastReplay.frames.length);
    const atCross = M.lastReplay.frames.length;
    // ...then the tail is captured.
    for (let i = 0; i < M.REP_TAIL_F + 6; i++) M.step(w);
    const f = M.lastReplay.frames, g = M.lastReplay.goalAt;
    o.goalAt = g;
    o.total = f.length;
    o.tail = f.length - 1 - g;
    o.grew = f.length > atCross;
    // The tail is REP_TAIL long, give or take the frame the freeze lands on.
    o.tailRight = Math.abs(o.tail - M.REP_TAIL_F) <= 2;
    // ⚠️ And it has to contain MOVEMENT, or the frames are padding. The ball travels on
    // into the net after the whistle; that is the whole point of keeping them.
    const cross = f[g], end = f[f.length - 1];
    o.ballTravelled = Math.hypot(end.bx - cross.bx, end.by - cross.by);
    o.ballKeptGoing = o.ballTravelled > 5;
    // ⚠️ THE TAIL MUST NOT EAT THE LEAD-UP, and the honest way to check that depends on
    // whether the ring buffer had filled. A goal can come seconds after kickoff — this one
    // did — so "there are six seconds before it" is an assertion about the fixture, not
    // about the code, and it fails for the wrong reason.
    // While the buffer is under REP_MAX nothing is dropped from the front, so the crossing
    // must still be exactly where it was; and REP_MAX is sized to hold the lead-up AND the
    // tail, which is what guarantees it once the buffer IS full.
    o.atCross = atCross;
    o.max = M.REP_MAX;
    o.neverOverflowed = f.length < M.REP_MAX;
    o.crossingNotShifted = g === atCross - 1;
    o.bufferHoldsBoth = M.REP_MAX >= Math.round((6 + M.REP_TAIL) * 60) - 1;
    o.leadUpSecs = +(g / 60).toFixed(1);
    return o;
  });
  ok('a real goal was scored', r.realGoal);
  ok('the buffer freezes at the crossing too', r.frozenAtOnce,
     'otherwise Save replay has nothing until the tail finishes');
  // ⚠️ FIXTURE-DEPENDENT, exactly like the lead-up check below it, and for the same
  // reason. Once the ring buffer has reached REP_MAX it cannot grow — the tail arrives
  // by shifting the front, not by extending the end. Whether it is full at the crossing
  // depends on how long the fixture's match ran before the goal, which is a fact about
  // the seed rather than about the code: this one started overflowing the moment a
  // change to trapping made bots hold the ball a little longer. What the tail actually
  // has to do is covered either way by `tailRight` and by the marker check below.
  ok('the replay grows past the crossing', !r.neverOverflowed || r.grew,
     `${r.atCross} frames at the whistle, ${r.total} after the tail (REP_MAX ${r.max})`);
  ok('...or the tail arrived by shifting the front', r.grew || r.tailRight,
     `a full buffer must still gain the tail: goalAt ${r.goalAt}, total ${r.total}, tail ${r.tail}`);
  ok('the tail is REP_TAIL long', r.tailRight, r.tail + ' frames');
  ok('goalAt points inside the replay', r.goalAt > 0 && r.goalAt < r.total - 1,
     r.goalAt + ' of ' + r.total);
  ok('the ball carries on into the net', r.ballKeptGoing,
     'moved ' + r.ballTravelled.toFixed(1) + ' units after the line');
  ok('the tail did not shift the crossing', !r.neverOverflowed || r.crossingNotShifted,
     'goalAt ' + r.goalAt + ' vs ' + (r.atCross - 1) + ' at the whistle');
  ok('the buffer is sized for the lead-up AND the tail', r.bufferHoldsBoth,
     r.max + ' frames — keeping the tail must not cost you the approach play');
  await p.close();
}

// ---- 1b. goalAt survives a save and load ------------------------------------
{
  const p = await page();
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    M.setMatchSeed(9); M.sel.mode = '1v1'; M.startMatch();
    const w = M.world; w.state='play'; w.stateT=1;
    let n = 0; while (w.state !== 'goal' && n < 6000){ M.step(w); n++; }
    for (let i = 0; i < M.REP_TAIL_F + 6; i++) M.step(w);
    const live = M.lastReplay.goalAt;
    const doc = M.repFileParse(JSON.stringify(M.repFileBuild()));
    return { live, inFile: doc.goalAt, frames: doc.frames.length };
  });
  ok('the file records where the ball crossed', r.inFile === r.live && r.inFile > 0,
     r.live + ' vs ' + r.inFile);
  ok('...within the frames it carries', r.inFile < r.frames - 1, r.inFile + ' of ' + r.frames);
  await p.close();
}

// ---- 2. the transport -------------------------------------------------------
{
  const p = await page();
  const setup = () => p.evaluate(async () => {
    const M = window.__magnet;
    M.setMatchSeed(9); M.sel.mode='1v1'; M.startMatch();
    const w = M.world; w.state='play'; w.stateT=1;
    let n = 0; while (w.state !== 'goal' && n < 6000){ M.step(w); n++; }
    for (let i = 0; i < M.REP_TAIL_F + 6; i++) M.step(w);
    window.__doc = M.repFileParse(JSON.stringify(M.repFileBuild()));
    M.toMenu(); M.openSection('replay');
    M.watchReplayFile(() => { M.dockOrFull('setup'); M.openSection('replay'); },
                      async () => window.__doc);
    await new Promise(r => setTimeout(r, 250));
  });
  await setup();

  const shape = await p.evaluate(() => {
    const ctl = document.getElementById('repCtl');
    const box = ctl.getBoundingClientRect();
    return {
      // ⚠️ RENDERED, not the class. Inside #hud this was `hidden`-free and 0px tall.
      visible: getComputedStyle(ctl).display !== 'none' && box.height > 0,
      onScreen: box.top >= 0 && box.bottom <= innerHeight + 1,
      taps: [...ctl.querySelectorAll('button')].map(x => Math.round(Math.min(
        x.getBoundingClientRect().width, x.getBoundingClientRect().height))),
      speeds: [...document.querySelectorAll('#repSpeeds .repspd')].map(x => x.textContent),
      speedList: window.__magnet.REP_SPEEDS,
      startsAtOne: window.__magnet.replay.speed === 1,
      // ⚠️ Toasts also live at the bottom, and "now playing" landed on the speed buttons.
      toastsClear: document.getElementById('toasts').getBoundingClientRect().bottom <= box.top + 1,
      // A banner from the match just played would read as part of the replay.
      bannerClear: document.getElementById('banner').textContent === '',
      goalMark: getComputedStyle(document.getElementById('repProgGoal')).display !== 'none',
    };
  });
  ok('the bar is really on screen', shape.visible,
     'it was 0px tall while it lived inside #hud');
  ok('...and inside the viewport', shape.onScreen);
  // ⚠️ EIGHT now: pause, four speeds, Save, Video and exit. The count is pinned on purpose
  // — a control arriving on this bar should make somebody look — and both writers moved
  // here from the in-match bar, which is never to offer a file write mid-match. Video is
  // the one export whose scope is not chosen from a menu: it films whatever is on screen.
  ok('every control is a 44px target', shape.taps.length === 8 && shape.taps.every(t => t >= 44),
     shape.taps.join());
  ok('four speeds are offered', shape.speeds.length === shape.speedList.length && shape.speeds.length >= 3,
     shape.speeds.join());
  ok('a chosen replay starts at normal speed', shape.startsAtOne,
     'the goal replay is the one that wants slow motion, not this');
  ok('the toasts move out of the way', shape.toastsClear);
  ok('a stale banner is cleared', shape.bannerClear);
  ok('the crossing is marked on the progress line', shape.goalMark);

  // ---- pause actually stops it, and resume does not fast-forward -----------
  const pause = await p.evaluate(async () => {
    const M = window.__magnet, o = {};
    const fill = () => document.getElementById('repProgFill').style.width;
    document.getElementById('repPause').click();
    o.paused = M.replay.paused;
    const a = fill();
    // ⚠️ A LONG pause, and the delta measured over a SHORT window straight after resuming.
    // The first version paused 320ms and allowed 25% of drift, which is far more than
    // 320ms of banked frames — so deleting the fix passed it. A full second of pause is
    // ~60 banked frames; sampling 60ms later, an honest resume can only have advanced 3 or
    // 4, so the two answers are an order of magnitude apart instead of a hair.
    await new Promise(r => setTimeout(r, 1000));
    o.frozen = fill() === a;
    document.getElementById('repPause').click();
    o.resumed = !M.replay.paused;
    await new Promise(r => setTimeout(r, 60));
    const a2 = parseFloat(a), b2 = parseFloat(fill());
    o.advanced = b2 > a2;
    o.jumpPct = +(b2 - a2).toFixed(2);
    o.didNotJump = (b2 - a2) < 4;
    return o;
  });
  ok('pause stops the playhead', pause.paused && pause.frozen);
  ok('resume starts it again', pause.resumed && pause.advanced);
  ok('...without banking the paused time', pause.didNotJump,
     'jumped ' + pause.jumpPct + '% in 60ms — `last` kept accumulating while paused');

  // ---- speed is live -------------------------------------------------------
  const spd = await p.evaluate(async () => {
    const M = window.__magnet;
    const at = (s) => [...document.querySelectorAll('#repSpeeds .repspd')]
      .find(x => parseFloat(x.dataset.spd) === s);
    const fill = () => parseFloat(document.getElementById('repProgFill').style.width);
    at(0.25).click();
    const slowSel = at(0.25).classList.contains('sel') && M.replay.speed === 0.25;
    let a = fill(); await new Promise(r => setTimeout(r, 300)); const slow = fill() - a;
    at(2).click();
    a = fill(); await new Promise(r => setTimeout(r, 300)); const fast = fill() - a;
    return { slowSel, fastSel: M.replay.speed === 2, slow, fast };
  });
  ok('picking a speed marks it', spd.slowSel && spd.fastSel);
  // ⚠️ Measured as PROGRESS PER WALL SECOND, not by reading the variable back — the whole
  // point is that `dur` is recomputed every tick, and a `dur` captured once would still
  // set the variable while ignoring it.
  ok('2× really is faster than 0.25×', spd.fast > spd.slow * 2,
     spd.slow.toFixed(2) + '%/300ms vs ' + spd.fast.toFixed(2));

  // ---- a tap on the pitch must NOT end it ---------------------------------
  const tap = await p.evaluate(async () => {
    const M = window.__magnet;
    const cv = document.getElementById('game');
    cv.dispatchEvent(new TouchEvent('touchstart', { bubbles:true, cancelable:true,
      changedTouches:[new Touch({ identifier:1, target:cv, clientX:200, clientY:300 })] }));
    await new Promise(r => setTimeout(r, 120));
    return { stillPlaying: M.replay.active };
  });
  ok('a mis-tap on the pitch does not end it', tap.stillPlaying,
     'the transport is the way out, not the whole screen');

  // ---- ...but the exit button does ----------------------------------------
  const exit = await p.evaluate(async () => {
    const M = window.__magnet;
    document.getElementById('repExit').click();
    await new Promise(r => setTimeout(r, 300));
    return { stopped: !M.replay.active,
             barGone: document.getElementById('repCtl').classList.contains('hidden'),
             bodyClean: !document.body.classList.contains('repctl'),
             menuBack: !document.getElementById('setup').classList.contains('hidden') };
  });
  ok('the exit button stops it', exit.stopped);
  ok('the bar goes with it', exit.barGone && exit.bodyClean);
  ok('and the menu comes back', exit.menuBack);
  await p.close();
}

// ---- 3. the instant replay after a goal is UNCHANGED ------------------------
// ⚠️ The half that stops this becoming a regression. A transport in front of the kickoff
// would put four things to read between a goal and playing on, and "any button skips" is
// what makes that replay free.
{
  const p = await page();
  const r = await p.evaluate(async () => {
    const M = window.__magnet, o = {};
    M.setMatchSeed(9); M.sel.mode='1v1'; M.startMatch();
    const w = M.world; w.state='play'; w.stateT=1;
    let n = 0; while (w.state !== 'goal' && n < 6000){ M.step(w); n++; }
    for (let i = 0; i < M.REP_TAIL_F + 6; i++) M.step(w);
    M.playReplay(0.5);                      // exactly what the goal branch calls
    await new Promise(r => setTimeout(r, 150));
    o.noBar = document.getElementById('repCtl').classList.contains('hidden');
    o.notControlled = !M.replay.controls;
    o.playing = M.replay.active;
    // any tap ends it, as it always did
    const cv = document.getElementById('game');
    cv.dispatchEvent(new TouchEvent('touchstart', { bubbles:true, cancelable:true,
      changedTouches:[new Touch({ identifier:1, target:cv, clientX:200, clientY:300 })] }));
    await new Promise(r => setTimeout(r, 150));
    o.tapSkipped = !M.replay.active;
    return o;
  });
  ok('a goal replay shows no transport', r.noBar && r.notControlled);
  ok('it plays', r.playing);
  ok('and any tap still skips it', r.tapSkipped);
  await p.close();
}

await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
if (fails.length){ console.log('FAIL replaywatch\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS replaywatch');
