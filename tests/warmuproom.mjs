// THE WARM-UP ROOM, END TO END — the scenarios the other lobby suites do not reach.
//
// `lobby`, `lobbykb`, `lobbyballs`, `lobbydress`, `lobbyhold`, `warmupjoin`, `warmupoffer`
// and `touchstart` between them already cover side picking, balancing, the keyboard, the
// stepper, the shirts, the flags, the balls, the halfway wall, hold-to-start, pads joining
// and leaving, and who is offered the room at all. This file is what was left:
//
//   * THE BOT SKILL ROW (it was a dead control — see below)
//   * the colour swatches as a walk-on control, rather than as pads that exist
//   * "everybody into a goal", the third way to start a match
//   * the bots walking on at the whistle
//   * the idle clock, from both ends
//   * warm-up on every FIELD and in every MODE
//   * an orientation flip while the room is open
//
// ⚠️ **THE HEADLINE IS A BUG THIS SUITE WAS WRITTEN TO CATCH.** `w.diff` is written ONCE,
// in `startMatch`, and nothing else in the file ever touched it — so walking onto INSANE in
// warm-up set `sel.diff`, saved it, relabelled the caption to "BOT SKILL · INSANE", and
// left the bots you then played at whatever tier the match was built with. Measured on the
// broken build: caption **Insane**, storage **insane**, bots reacting at **0.85** (normal)
// rather than 1.1, and the match history filing the match under `normal`. The tier arrived
// on the NEXT match, which is the one place nobody looks.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const errors = [];
let bad = 0;
const ok = (name, cond, note = '') => {
  if (!cond){ bad++; console.log('  FAIL ' + name + (note ? ' — ' + note : '')); }
};

// A page with `nPads` fake standard controllers.
const page = async (nPads = 2, vw = 700, vh = 1000) => {
  const p = await b.newPage({ viewport:{width:vw, height:vh} });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript((n) => {
    window.__MAGNETDEBUG = true; localStorage.clear();
    window.__padN = n;
    window.__pads = Array.from({length:n}, () => ({ axes:[0,0,0,0], buttons:new Array(17).fill(false) }));
    navigator.getGamepads = () => window.__pads.slice(0, window.__padN).map((pd,i) => ({
      index:i, connected:true, id:'f'+i, mapping:'standard', axes:pd.axes,
      buttons: pd.buttons.map(v => ({ pressed:!!v, value:v?1:0 })) }));
  }, nPads);
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  return p;
};

// ⚠️ Driven through `window.__pads`, never by writing `p.kick`: the pad is read every step
// and a directly-set flag is overwritten before `stepLobbyKeys` ever sees it — the trap
// `lobbykb` records. Position is re-pinned every step because `integrate` moves the body.
const PRESS = `(w, M, who, padIdx, k, steps) => {
  for (let i = 0; i < steps; i++){
    who.x = k.x + k.w/2; who.y = k.y + k.h/2; who.vx = who.vy = 0;
    window.__pads[padIdx].buttons[0] = true; M.step(w);
  }
  window.__pads[padIdx].buttons[0] = false; M.step(w);
}`;

// ---------------------------------------------------------------------------------
// 1. THE BOT SKILL ROW REACHES THE MATCH IT IS STANDING IN.
// ---------------------------------------------------------------------------------
{
  const p = await page(2);
  const r = await p.evaluate((PRESS) => {
    const press = eval(PRESS);
    const M = window.__magnet, r = {};
    M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = '2v2'; M.sel.diff = 'normal';
    M.startMatch(); const w = M.world;
    const me = w.players.find(q => q.ctrl !== 'bot');
    const pad = key => w.kb.keys.find(k => k.diff === key);
    r.tiers = w.kb.keys.filter(k => k.diff).map(k => k.diff);
    r.startedNormal = w.diff === M.DIFF.normal && w.diffKey === 'normal';

    press(w, M, me, 0, pad('insane'), 3);
    r.selMoved   = M.sel.diff === 'insane';
    r.worldMoved = w.diff === M.DIFF.insane;
    r.keyMoved   = w.diffKey === 'insane';
    // ⚠️ The behavioural number, not just object identity: this is what the bots read.
    r.reactUsed = w.diff && w.diff.react;
    r.reactNormal = M.DIFF.normal.react;
    r.reactInsane = M.DIFF.insane.react;
    // ⚠️ ...and it must be DIFFERENT from where it started, or every assertion above is
    // satisfied by a build where the press did nothing at all and `sel` never moved
    // either — which is exactly the vacuous shape of this check.
    r.reallyChanged = w.diff !== M.DIFF.normal && r.reactNormal !== r.reactInsane;

    // It TRACKS rather than latching once.
    press(w, M, me, 0, pad('rookie'), 3);
    r.tracks = w.diff === M.DIFF.rookie && w.diffKey === 'rookie' && M.sel.diff === 'rookie';

    // ...and survives the whistle into the match that is then played.
    press(w, M, me, 0, pad('elite'), 3);
    M.lobbyStart(w);
    r.survivesTheWhistle = w.diff === M.DIFF.elite && w.diffKey === 'elite';
    for (let i = 0; i < 200; i++) M.step(w);
    r.matchRuns = isFinite(w.ball.x) && isFinite(w.ball.y);
    return r;
  }, PRESS);
  ok('the lobby offers a pad per difficulty tier', r.tiers.length >= 5, r.tiers.join(','));
  ok('the match starts at the tier the menu chose', r.startedNormal);
  ok('pressing a tier moves the SETTING', r.selMoved);
  ok('THE BOT SKILL ROW REACHES THE MATCH IT IS STANDING IN', r.worldMoved,
     `w.diff still reads react ${r.reactUsed} (normal is ${r.reactNormal}, insane ${r.reactInsane}) — ` +
     'the caption said Insane and the bots played Normal');
  ok('...and the KEY moves with it', r.keyMoved,
     'w.diffKey is what the match history, the map vote and a saved replay record — left ' +
     'behind it files the match under a tier it was not played at');
  ok('...to the number the bots actually read', r.reactUsed === r.reactInsane, String(r.reactUsed));
  ok('...and that is a real change, not a no-op', r.reallyChanged,
     'if nothing moved, every check above passes for the wrong reason');
  ok('the row TRACKS rather than latching on the first press', r.tracks);
  ok('the tier survives the whistle', r.survivesTheWhistle);
  ok('...and the match runs', r.matchRuns);
  await p.close();
}

// ---------------------------------------------------------------------------------
// 2. A COLOUR SWATCH IS A CONTROL, not a pad that exists.
// ---------------------------------------------------------------------------------
{
  const p = await page(2);
  const r = await p.evaluate((PRESS) => {
    const press = eval(PRESS);
    const M = window.__magnet, r = {};
    M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = '2v2';
    M.startMatch(); const w = M.world;
    const me = w.players.find(q => q.ctrl !== 'bot');
    const mine = w.kb.keys.filter(k => k.colTeam === 0);
    r.swatchesPerSide = mine.length;
    // A colour neither side is already wearing, so "it changed" cannot be a coincidence.
    const want = mine.find(k => k.col !== M.teamColOf(0) && k.col !== M.teamColOf(1));
    r.before = M.teamColOf(0); r.want = want.col;
    r.otherBefore = M.teamColOf(1);

    // ⚠️ Standing on it must do NOTHING — the room's standing rule is that nothing
    // presses itself, and a swatch that fires on contact would recolour your side while
    // you walked past it on the way to the pitch.
    for (let i = 0; i < 60; i++){ me.x = want.x + want.w/2; me.y = want.y + want.h/2; me.vx = me.vy = 0; M.step(w); }
    r.standingIsSilent = M.teamColOf(0) === r.before;

    press(w, M, me, 0, want, 3);
    r.after = M.teamColOf(0);
    r.changed = r.after === r.want;
    // The BODIES on that side have to follow, or the control is a swatch that recolours
    // a number nobody can see.
    const body = w.players.find(q => q.team === 0);
    r.bodiesFollowed = body && body.color === r.after;
    r.otherSideLeftAlone = M.teamColOf(1) === r.otherBefore;
    try { r.saved = JSON.parse(localStorage.getItem('magnetball.sel')).teamCol[0]; } catch(e){ r.saved = 'ERR'; }
    return r;
  }, PRESS);
  ok('there is a swatch block per side', r.swatchesPerSide >= 4, String(r.swatchesPerSide));
  ok('standing on a swatch does nothing', r.standingIsSilent,
     `a second parked on it and the side went ${r.before} → ${r.after}`);
  ok('KICK on a swatch changes that side\'s colour', r.changed, `${r.before} → ${r.after}, wanted ${r.want}`);
  ok('...and the bodies on that side follow', r.bodiesFollowed);
  ok('...and the other side is left alone', r.otherSideLeftAlone);
  ok('...and it is remembered', r.saved === r.want, `stored ${r.saved}`);
  await p.close();
}

// ---------------------------------------------------------------------------------
// 3. EVERYBODY INTO A GOAL — the third way to start a match.
// ---------------------------------------------------------------------------------
{
  const p = await page(2);
  const r = await p.evaluate(() => {
    const M = window.__magnet, r = {};
    M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = '2v2';
    M.startMatch(); const w = M.world;
    const hs = w.players.filter(q => q.ctrl !== 'bot');
    const gh = w.bounds.halfL + 20;                    // inside the net pocket
    const park = (list, y) => list.forEach(q => { q.x = 0; q.y = y; q.vx = q.vy = 0; });

    // ⚠️ A body in a goal is NOT "sitting this one out" — `lobbyOutside` has to say so, or
    // everybody-into-a-goal hands every player a bench place on the way in.
    park([hs[0]], gh);
    for (let i = 0; i < 30; i++){ park([hs[0]], gh); park([hs[1]], 0); M.step(w); }
    r.detected = M.lobbyInGoal(w, hs[0]) >= 0;
    r.oneIsNotEnough = w.state === 'warmup' && !M.lobbyAllInGoal(w);

    for (let i = 0; i < 20; i++){ park(hs, gh); M.step(w); }
    r.allIn = M.lobbyAllInGoal(w);
    r.briefIsNotEnough = w.state === 'warmup';         // under LOBBY.goalStart

    for (let i = 0; i < 120 && w.state === 'warmup'; i++){ park(hs, gh); M.step(w); }
    r.held = w.state !== 'warmup';
    return r;
  });
  ok('a body inside the net is seen to be in a goal', r.detected);
  ok('one of two in a goal does not start the match', r.oneIsNotEnough);
  ok('everybody in a goal is recognised', r.allIn);
  ok('...but a moment there is not a request to kick off', r.briefIsNotEnough,
     'jogging through the mouth on the way round the back of the net must not start a match');
  ok('...and holding it does start the match', r.held);
  await p.close();
}
// A room full of BOTS in a goal must not start anything: the rule is about people.
{
  const p = await page(1);
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = '2v2';
    M.startMatch(); const w = M.world;
    const gh = w.bounds.halfL + 20;
    const bots = w.players.filter(q => q.ctrl === 'bot');
    const me = w.players.find(q => q.ctrl !== 'bot');
    for (let i = 0; i < 150; i++){
      bots.forEach(q => { q.x = 0; q.y = gh; q.vx = q.vy = 0; });
      me.x = 0; me.y = 0; me.vx = me.vy = 0;
      M.step(w);
    }
    return { state: w.state, bots: bots.length };
  });
  ok('bots standing in a goal do not start the match', r.state === 'warmup',
     `${r.bots} bots in the net and the room ended anyway`);
  await p.close();
}

// ---------------------------------------------------------------------------------
// 4. THE BOTS WALK ON AT THE WHISTLE.
// ---------------------------------------------------------------------------------
{
  const p = await page(1);
  const r = await p.evaluate(() => {
    const M = window.__magnet, r = {};
    M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = '3v3';
    M.startMatch(); const w = M.world;
    for (let i = 0; i < 30; i++) M.step(w);
    const outside = q => Math.abs(q.y) > w.bounds.halfL || Math.abs(q.x) > w.bounds.halfW;
    const bots = () => w.players.filter(q => q.ctrl === 'bot');
    r.botCount = bots().length;
    r.waitOutside = bots().every(outside);

    // ⚠️ Waiting bots are not DRAWN either — the room you choose sides in must not be
    // mostly bodies nobody is driving. Measured as a difference against the same frame
    // with them moved away: if they were never drawn, nothing changes.
    const cv = document.getElementById('game'), c = cv.getContext('2d');
    M.render();
    const a = c.getImageData(0, 0, cv.width, cv.height).data;
    const saved = bots().map(q => ({ x:q.x, y:q.y }));
    bots().forEach(q => { q.x = 9e5; q.y = 9e5; });
    M.render();
    const z = c.getImageData(0, 0, cv.width, cv.height).data;
    bots().forEach((q,i) => { q.x = saved[i].x; q.y = saved[i].y; });
    let diff = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i] !== z[i]) diff++;
    r.notDrawn = diff === 0; r.drawDiff = diff;
    // ⚠️ **THE CONTROL, and without it this check is vacuous**: "moving them changed
    // nothing" is also true of a render that drew nothing at all. Moving a HUMAN body the
    // same way has to change the picture, which proves the probe can see a body move.
    const you = w.players.find(q => q.ctrl !== 'bot');
    const hx = you.x, hy = you.y;
    you.x = 9e5; you.y = 9e5; M.render();
    const h = c.getImageData(0, 0, cv.width, cv.height).data;
    you.x = hx; you.y = hy;
    let hdiff = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i] !== h[i]) hdiff++;
    r.humanDrawn = hdiff > 200; r.humanDiff = hdiff;

    M.lobbyStart(w);
    r.stagedOutside = bots().every(outside);
    r.entryBusy = M.entryBusy(w);
    let n = 0; while (M.entryBusy(w) && n < 900){ M.step(w); n++; }
    r.walkSteps = n;
    r.allArrived = bots().every(q => !outside(q));
    r.noneStranded = !w.players.some(q => q._subTo);
    return r;
  });
  ok('the bots wait off the pitch during warm-up', r.waitOutside, `${r.botCount} bots`);
  ok('...and are not drawn while they wait', r.notDrawn, `${r.drawDiff} pixels changed`);
  ok('...(control: a HUMAN body IS drawn)', r.humanDrawn,
     `moving the player changed ${r.humanDiff} pixels — if that is zero too, the probe ` +
     'cannot see a body at all and the check above passes for the wrong reason');
  ok('...they are still outside at the whistle', r.stagedOutside,
     'the walk-on is staged from lobbyStart, so they start where they were standing');
  ok('...the kickoff waits for them', r.entryBusy);
  ok('...they all arrive', r.allArrived, `after ${r.walkSteps} steps`);
  ok('...and none is left mid-walk', r.noneStranded);
  await p.close();
}
{
  const p = await page(0);
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    M.sel.lobby = 'off'; M.sel.mode = '3v3';
    M.startMatch(); const w = M.world;
    return { busy: M.entryBusy(w), state: w.state };
  });
  // ⚠️ The walk-on is warm-up's, not every match's — a second added to every kickoff
  // would be charged to people who never opened the room.
  ok('a plain KICK OFF stages no walk-on', !r.busy && r.state !== 'warmup', r.state);
  await p.close();
}

// ---------------------------------------------------------------------------------
// 5. THE IDLE CLOCK, from both ends.
// ---------------------------------------------------------------------------------
{
  const p = await page(2);
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = '2v2';
    M.startMatch(); const w = M.world;
    let n = 0; while (w.state === 'warmup' && n < 60*90){ M.step(w); n++; }
    return { secs: +(n/60).toFixed(1), fired: w.state !== 'warmup' };
  });
  ok('an untouched room kicks off by itself', r.fired, `still warm-up after ${r.secs}s`);
  ok('...after about thirty seconds', r.secs > 20 && r.secs < 45, `${r.secs}s`);
  await p.close();
}
{
  const p = await page(2);
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = '2v2';
    M.startMatch(); const w = M.world;
    // A nudge once a second, for twice the idle limit.
    for (let i = 0; i < 60*60 && w.state === 'warmup'; i++){
      window.__pads[0].axes[1] = (i % 60 === 0) ? 1 : 0;
      M.step(w);
    }
    window.__pads[0].axes[1] = 0;
    return { state: w.state };
  });
  ok('...but somebody moving holds it off', r.state === 'warmup',
     'a minute of nudging the stick and it kicked off anyway');
  await p.close();
}

// ---------------------------------------------------------------------------------
// 6. THE PREVIEW CANNOT DISAGREE WITH WHAT START DOES.
// ---------------------------------------------------------------------------------
{
  const p = await page(3);
  const r = await p.evaluate(() => {
    const M = window.__magnet, r = {};
    M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = '2v2';
    M.startMatch(); const w = M.world;
    const hs = w.players.filter(q => q.ctrl !== 'bot');
    r.pads = hs.length;
    const y = w.bounds.halfL * 0.5;                    // all three onto ONE half
    for (let i = 0; i < 90; i++){ hs.forEach((q,j) => { q.x = (j-1)*40; q.y = y; q.vx = q.vy = 0; }); M.step(w); }
    const plan = M.lobbyPlan(w);
    r.planned = [plan.a.length, plan.b.length, plan.per];
    M.lobbyStart(w);
    r.fielded = [w.players.filter(q => q.team === 0).length,
                 w.players.filter(q => q.team === 1).length];
    return r;
  });
  ok('three people can all walk onto one half', r.pads === 3 && Math.max(r.planned[0], r.planned[1]) === 3,
     JSON.stringify(r.planned));
  ok('...and the room fields exactly what it promised', r.fielded[0] === r.planned[2] && r.fielded[1] === r.planned[2],
     `planned ${r.planned[2]} a side, fielded ${r.fielded.join(' v ')}`);
  await p.close();
}

// ---------------------------------------------------------------------------------
// 7. EVERY FIELD AND EVERY MODE.
// ---------------------------------------------------------------------------------
// ⚠️ The two invariants that hold on ALL of them: no pad may sit on the pitch (standing on
// one would be a side pick as well as a keypress), and every pad has to be inside
// `lobbyReach`, which is the box `integrate` clamps a body into — a pad outside it is a
// control nobody can walk to.
{
  const p = await page(2);
  const r = await p.evaluate(() => {
    const M = window.__magnet, r = { fields: 0, bad: [], modes: 0, modeBad: [] };
    for (const key of Object.keys(M.FIELDS)){
      r.fields++;
      try {
        M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = '2v2'; M.sel.field = key;
        M.startMatch(); const w = M.world;
        for (let i = 0; i < 90; i++) M.step(w);
        const issues = [];
        if (!w.kb || !w.kb.keys.length) issues.push('no keyboard');
        const hw = w.bounds.halfW, hl = w.bounds.halfL;
        const on = (w.kb ? w.kb.keys : []).filter(k =>
          k.x + k.w > -hw && k.x < hw && k.y + k.h > -hl && k.y < hl).length;
        if (on) issues.push(on + ' pads on the pitch');
        const reach = M.lobbyReach(w);
        const out = (w.kb ? w.kb.keys : []).filter(k =>
          k.x < -reach.halfW || k.x + k.w > reach.halfW ||
          k.y < -reach.halfL || k.y + k.h > reach.halfL).length;
        if (out) issues.push(out + ' pads out of reach');
        if (!w.players.every(q => isFinite(q.x) && isFinite(q.y))) issues.push('body NaN');
        if (issues.length) r.bad.push(key + ': ' + issues.join(', '));
      } catch (e){ r.bad.push(key + ' THREW ' + e.message); }
    }
    M.sel.field = 'classic';
    for (const key of Object.keys(M.MODES)){
      r.modes++;
      try {
        M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = key;
        M.startMatch(); const w = M.world;
        for (let i = 0; i < 90; i++) M.step(w);
        M.lobbyStart(w);
        for (let i = 0; i < 200; i++) M.step(w);
        if (w.state === 'warmup') r.modeBad.push(key + ': never left warm-up');
        if (!isFinite(w.ball.x) || !isFinite(w.ball.y)) r.modeBad.push(key + ': ball NaN');
      } catch (e){ r.modeBad.push(key + ' THREW ' + e.message); }
    }
    return r;
  });
  ok('warm-up lays out on every field', r.bad.length === 0, `${r.fields} fields: ` + r.bad.slice(0,4).join(' | '));
  ok('...on enough fields to mean something', r.fields >= 20, String(r.fields));
  ok('warm-up starts a match in every mode', r.modeBad.length === 0, r.modeBad.slice(0,4).join(' | '));
  ok('...in enough modes to mean something', r.modes >= 5, String(r.modes));
  await p.close();
}

// ---------------------------------------------------------------------------------
// 8. TURNING THE WINDOW WHILE THE ROOM IS OPEN.
// ---------------------------------------------------------------------------------
// ⚠️ `buildLobbyKeys` lays the board out in screen terms and asks `pitchHorizontal()` which
// way round that is, and `resize()` re-answers it. A room open across that threshold has to
// come back laid out for the orientation it is now in, with everything still on screen.
{
  const p = await page(2, 500, 900);
  await p.evaluate(() => {
    const M = window.__magnet;
    M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = '2v2'; M.sel.orient = 'auto';
    M.startMatch(); for (let i = 0; i < 30; i++) M.step(M.world);
  });
  const before = await p.evaluate(() => {
    const M = window.__magnet, q = M.world.kb.keys.find(k => k.ch === 'Q');
    return { turned: M.pitchHorizontal(), q: { x:q.x, y:q.y }, keys: M.world.kb.keys.length };
  });
  await p.setViewportSize({ width: 1200, height: 600 });
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => {
    const M = window.__magnet, w = M.world;
    for (let i = 0; i < 10; i++) M.step(w);
    const q = w.kb.keys.find(k => k.ch === 'Q');
    const off = w.kb.keys.filter(k => [[k.x,k.y],[k.x+k.w,k.y],[k.x,k.y+k.h],[k.x+k.w,k.y+k.h]]
      .map(([x,y]) => M.screenPt(M.wx(x), M.wy(y)))
      .some(([sx,sy]) => sx < 0 || sy < 0 || sx > window.innerWidth || sy > window.innerHeight)).length;
    return { turned: M.pitchHorizontal(), q: { x:q.x, y:q.y }, keys: w.kb.keys.length,
             off, state: w.state };
  });
  ok('the window really crossed the orientation threshold', before.turned !== after.turned,
     `${before.turned} → ${after.turned} — without this the checks below are vacuous`);
  ok('the board is rebuilt for the new orientation',
     before.q.x !== after.q.x || before.q.y !== after.q.y,
     'Q did not move, so the layout was not re-asked');
  ok('...with every pad still there', after.keys === before.keys, `${before.keys} → ${after.keys}`);
  ok('...and every pad still on screen', after.off === 0, `${after.off} off screen`);
  ok('...and the room is still open', after.state === 'warmup', after.state);
  await p.close();
}

// ---------------------------------------------------------------------------------
// 9. THE ROOM USES THE SCREEN IT IS ON.
// ---------------------------------------------------------------------------------
// Reported as the lobby being far too small with the sides empty, and measured as a
// content box that came out nearly SQUARE — 1048 × 980 world units — on a 1.87 screen,
// because the shirts, the flags and the difficulty row were all stacked on the vertical
// while the horizontal went unused. At 1678×895 the whole room occupied x 637..1116 of
// 1678: **71% of the width was empty.**
//
// ⚠️ **THE CONTROL IS THE SAME COURT IN A LIVE MATCH, measured in the same run on the same
// window.** An absolute "the pitch must be N px" is a number tuned to one viewport and one
// field; what the furniture costs is a RATIO, and the match is what it is a ratio of. The
// lobby will always be smaller — it has a keyboard round it — but a third was too much.
// Measured: **0.333 before, 0.500 after.**
{
  const p = await page(1, 1678, 895);
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    const wide = () => {
      const f = M.world.field;
      const c = [[-f.W/2, -f.L/2], [f.W/2, f.L/2]].map(([x, y]) => M.screenPt(M.wx(x), M.wy(y)));
      return Math.abs(c[1][0] - c[0][0]);
    };
    const box = () => {
      const w = M.world, pts = [];
      w.kb.keys.forEach(k => [[k.x,k.y],[k.x+k.w,k.y],[k.x,k.y+k.h],[k.x+k.w,k.y+k.h]]
        .forEach(([x, y]) => pts.push(M.screenPt(M.wx(x), M.wy(y)))));
      const f = w.field;
      [[-f.W/2,-f.L/2],[f.W/2,f.L/2],[-f.W/2,f.L/2],[f.W/2,-f.L/2]]
        .forEach(([x, y]) => pts.push(M.screenPt(M.wx(x), M.wy(y))));
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = '1v1';
    M.startMatch(); for (let i = 0; i < 30; i++) M.step(M.world); M.render();
    const lobbyPitch = wide(), b = box(), turned = M.pitchHorizontal();
    M.sel.lobby = 'off';
    M.startMatch(); for (let i = 0; i < 10; i++) M.step(M.world); M.render();
    return { lobbyPitch, matchPitch: wide(), box: b, turned,
             usedW: b.w / window.innerWidth, usedH: b.h / window.innerHeight };
  });
  const ratio = r.lobbyPitch / r.matchPitch;
  console.log(`  wide desktop: warm-up pitch ${Math.round(r.lobbyPitch)}px against the same ` +
              `court in a match at ${Math.round(r.matchPitch)}px (${ratio.toFixed(3)}), ` +
              `box ${Math.round(r.box.w)}x${Math.round(r.box.h)}`);
  ok('the wide window really turns the pitch', r.turned,
     'this block is about the turned layout — untuned, everything below means nothing');
  ok('THE WARM-UP ROOM USES THE SCREEN IT IS ON',
     ratio >= 0.42,
     `the warm-up pitch is ${(ratio*100).toFixed(0)}% of the same court in a match on the ` +
     'same window — it was 33% when the dressing was stacked above the court instead of ' +
     'out in the margins, and the sides of the screen were empty');
  // ⚠️ The second half of the same claim, and it is NOT implied by the first: a build could
  // grow the pitch by cropping the furniture off the screen entirely. What has to be true
  // is that the box uses BOTH axes — the whole complaint was one axis carrying everything.
  ok('...on both axes', r.usedW >= r.usedH * 0.5,
     `the content box fills ${(r.usedW*100).toFixed(0)}% of the width against ` +
     `${(r.usedH*100).toFixed(0)}% of the height — it read 29% against 78%, which is a ` +
     'square room on a widescreen');
  await p.close();
}

// ---------------------------------------------------------------------------------
// 10. WARM-UP FROM THE RESULT SCREEN IS "SAME AGAIN, BUT LET ME CHANGE SOMETHING FIRST".
// ---------------------------------------------------------------------------------
// ⚠️ `enterWarmup` spreads everybody along the halfway line so nobody is pre-committed to
// a side — right when you open the room from the menu, and wrong coming out of a match:
// pressing START immediately then gives a DIFFERENT match from the one that just finished.
// On a solo game it is worse than a shuffle, because `lobbyPlan`'s undecided rule puts a
// lone player on team 0 whichever half they had.
{
  const p = await page(2);
  const r = await p.evaluate(() => {
    const M = window.__magnet, o = {};
    M.sel.controllers = 'on'; M.sel.lobby = 'off'; M.sel.mode = '3v3';
    M.startMatch(); const w = M.world;
    const humans = () => M.matchRoster(w).filter(q => q.ctrl !== 'bot');
    const shot = () => humans().map(q => q.name + ':' + q.team).sort().join(',');
    o.before = shot();
    o.beforeSides = [w.players.filter(q => q.team === 0).length,
                     w.players.filter(q => q.team === 1).length];
    o.twoHumansApart = new Set(humans().map(q => q.team)).size === 2;

    M.endMatch(w); M.finishMatch(w);
    // ⚠️ Through the pad, on the real path: START on the result screen is the way in.
    window.__pads[0].buttons[9] = true;  M.pollOverOptions();
    window.__pads[0].buttons[9] = false; M.pollOverOptions();
    o.inWarmup = w.state === 'warmup';
    o.per = w.lobby && w.lobby.per;
    o.sidesKept = M.lobbyHumans(w).every(q => M.lobbySideOf(q, w) === q.team);
    o.where = M.lobbyHumans(w).map(q => q.name + ':' + M.lobbySideOf(q, w)).sort().join(',');
    // ⚠️ ...and nobody is standing OUTSIDE, which `lobbySideOf` would also report as a
    // side of -1 and which means "sitting this one out".
    o.nobodyOut = M.lobbyPlan(w).out.length === 0;

    M.lobbyStart(w);
    o.after = shot();
    o.afterSides = [w.players.filter(q => q.team === 0).length,
                    w.players.filter(q => q.team === 1).length];
    return o;
  });
  ok('the match really had people on both sides', r.twoHumansApart, r.before);
  ok('START on the result screen opens warm-up', r.inWarmup);
  ok('EVERYBODY IS STANDING ON THE HALF THEY WERE JUST PLAYING', r.sidesKept,
     `${r.where} — dropped on the halfway line, an immediate START fields a different match`);
  ok('...nobody is left outside the touchline', r.nobodyOut);
  ok('...and the size comes back too', r.per === r.beforeSides[0],
     `lobby.per ${r.per} against a ${r.beforeSides.join('v')} match — the stepper and a ` +
     'mid-match drop-in can both take the match away from mode.per');
  ok('...so an immediate START fields the SAME match', r.after === r.before &&
     r.afterSides[0] === r.beforeSides[0] && r.afterSides[1] === r.beforeSides[1],
     `${r.before} (${r.beforeSides.join('v')}) → ${r.after} (${r.afterSides.join('v')})`);
  await p.close();
}
// ⚠️ **THE CONTROL, and without it "sides are kept" is satisfied by a build that pins
// everybody to their team's half ALWAYS.** Opening the room from the menu has to keep
// putting people on the halfway line undecided — that is what makes walking into a half a
// choice, and it is the whole mechanism the lobby is built on.
{
  const p = await page(2);
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    M.sel.controllers = 'on'; M.sel.lobby = 'on'; M.sel.mode = '2v2';
    M.startMatch(); const w = M.world;
    const hs = M.lobbyHumans(w);
    return { neutral: hs.every(q => Math.abs(q.y) < M.LOBBY.neutral),
             ys: hs.map(q => Math.round(q.y)).join(','),
             lim: M.LOBBY.neutral };
  });
  ok('a room opened fresh still starts everybody undecided', r.neutral,
     `y = ${r.ys} against a neutral band of ±${r.lim} — pre-committing everybody would ` +
     'take away the one thing the lobby is for');
  await p.close();
}

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(bad ? 'FAIL warmuproom' : 'PASS warmuproom');
await b.close();
process.exit(bad ? 1 : 0);
