// WARM-UP: the room you dress a side in, and the room you can leave without a mouse.
//
// Six things shipped together and they share one layout, so they are held together:
//   · a flag block beside each half, and walking onto a side wears that side's country
//   · each half OUTLINED in its colour rather than washed over with it
//   · a walk-on START pad in the keyboard block
//   · a keyboard a quarter bigger, with real gaps to the pitch and to the shirts
//   · the difficulty row moved off the bottom of the keyboard
//   · all of it in BOTH court orientations, plus a phone
//
// ⚠️ MEASUREMENT TRAP: a suite that samples pixels has to say which palette it is
// sampling — `grass` throughout here, because the two halves are compared against each
// other and a palette with an asymmetric print would make that comparison meaningless.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const errors = [];
let bad = 0;
const ok = (name, cond, note='') => { if (!cond){ bad++; console.log('  FAIL ' + name + (note ? ' — ' + note : '')); } };

const boot = async (vp, orient) => {
  const p = await b.newPage({ viewport: vp });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.addInitScript(() => {
    window.__MAGNETDEBUG = true;
    const mk = i => ({ axes: [0,0,0,0], buttons: Array.from({length:17}, () => ({pressed:false, value:0})),
                       connected: true, index: i, id: 'Stub Pad (STANDARD GAMEPAD)', mapping: 'standard' });
    window.__pads = [mk(0), mk(1)];
    navigator.getGamepads = () => window.__pads;
  });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  await p.evaluate(o => {
    const M = window.__magnet;
    M.sel.controllers = 'on'; M.sel.lobby = 'on'; M.sel.orient = o;
    M.sel.length = '5'; M.sel.look.palette = 'grass';
    M.sel.teamFlag = ['none', 'none'];
    M.setMatchSeed(7); M.startMatch({ lobby: true });
  }, orient);
  return p;
};

// ================================================== 1. the flag block ==========
{
  const p = await boot({ width: 1280, height: 900 }, 'v');
  const r = await p.evaluate(() => {
    const M = window.__magnet, o = {}, w = M.world, kb = w.kb;
    const pads = kb.keys.filter(k => k.flagTeam !== undefined);
    o.count = pads.length;
    o.perTeam = [0,1].map(t => pads.filter(k => k.flagTeam === t).length);
    o.keys = [...new Set(pads.filter(k => k.flagTeam === 0).map(k => k.flagKey))];
    // ⚠️ Every key must exist in FLAGS. A missing one draws a grey square, which looks
    // like a rendering bug and is really a country nobody can identify — the rule
    // `CUP_TEAMS` already follows, and this list is drawn from it.
    o.allReal = o.keys.filter(k => k !== 'none').every(k => !!M.FLAGS[k]);
    o.noneIsFirst = M.LOBBY_FLAGS[0] === 'none';
    // ⚠️ DERIVED, never a literal. This read `count === 16` and went red the moment the
    // list grew a column — a check that has to be edited every time the thing it watches
    // changes is a check nobody trusts. What is actually being claimed is "one pad per
    // entry per side", and that is what is written now.
    o.listLen = M.LOBBY_FLAGS.length;
    o.colsLen = M.TEAM_COLS.length;

    const human = w.players.find(x => x.ctrl !== 'bot');
    const pick = (team, key) => M.kbHit(w, human, kb.keys.find(k => k.flagTeam === team && k.flagKey === key));
    pick(0, 'brazil');
    for (let i = 0; i < 10; i++) M.step(w);
    o.wornBy0 = [...new Set(w.players.filter(x => x.team === 0).map(x => x.flag))];
    // ⚠️ THE OTHER SIDE KEEPS ITS OWN FACES. A side with no flag must leave every plate
    // alone — "a person's faceplate is their own" is the standing rule this feature bends
    // exactly once, deliberately, and it must not bend twice by accident.
    o.wornBy1 = [...new Set(w.players.filter(x => x.team === 1).map(x => x.flag))];
    o.otherSideUntouched = !o.wornBy1.includes('brazil');

    // ⚠️ WALKING ACROSS CHANGES YOUR COUNTRY — the whole point of a per-SIDE flag.
    const mover = w.players.find(x => x.team === 1);
    o.beforeCross = mover.flag;
    mover.team = 0; M.applyTeamColours(w.players);
    o.afterCross = mover.flag;

    // ⚠️ ...AND WALKING BACK PUTS THE OLD FACE BACK. Without `_ownFlag` this is one-way:
    // a body stamped with Brazil keeps it for ever, because a flagless side is defined as
    // leaving plates alone. Measured exactly that way before the fix.
    mover.team = 1; M.applyTeamColours(w.players);
    o.afterReturn = mover.flag;
    o.returnsOwnFace = o.afterReturn === o.beforeCross;

    // NONE takes it off again, through the same one mechanism.
    pick(0, 'none');
    for (let i = 0; i < 5; i++) M.step(w);
    o.afterNone = [...new Set(w.players.filter(x => x.team === 0).map(x => x.flag))];
    o.noneClears = M.teamFlagOf(0) === null && !o.afterNone.includes('brazil');
    return o;
  });
  console.log('flags', JSON.stringify(r));
  ok('a flag pad per country per side',
     r.count === r.listLen * 2 && r.perTeam[0] === r.listLen && r.perTeam[1] === r.listLen,
     JSON.stringify({ perTeam: r.perTeam, listLen: r.listLen }));
  // ⚠️ ...and the list is not EMPTY, or "one pad per entry" is satisfied by no pads at all.
  ok('...and there are countries in the list', r.listLen >= 8, String(r.listLen));
  ok('every flag key is real', r.allReal, r.keys.join());
  ok('NONE leads the block', r.noneIsFirst, 'a reset is not a choice — the same rule the Cap and Eyes pickers follow');
  ok('picking a country dresses that whole side', r.wornBy0.length === 1 && r.wornBy0[0] === 'brazil', r.wornBy0.join());
  ok('...and leaves the other side alone', r.otherSideUntouched, r.wornBy1.join());
  ok('walking across changes your country', r.afterCross === 'brazil' && r.beforeCross !== 'brazil',
     `${r.beforeCross} → ${r.afterCross}`);
  ok('...and walking back gives your own face back', r.returnsOwnFace,
     `${r.afterCross} → ${r.afterReturn}, wanted ${r.beforeCross} — without \`_ownFlag\` the stamp is one-way`);
  ok('NONE takes it off', r.noneClears, r.afterNone.join());
  await p.close();
}

// ============================ 2. the half is OUTLINED, not washed over =========
{
  const p = await boot({ width: 1280, height: 900 }, 'v');
  const r = await p.evaluate(() => {
    const M = window.__magnet, o = {}, w = M.world;
    // Park every body far away so nobody's shirt is inside a sample band.
    for (const pl of w.players){ pl.x = 9e4; pl.y = 9e4; pl._px = pl.x; pl._py = pl.y; }
    for (const bl of (w.extraBalls || [])) { bl.x = 9e4; bl.y = 9e4; }
    w.ball.x = 9e4; w.ball.y = 9e4;
    M.render();
    const cv = document.getElementById('game'), g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const at = (x, y) => { const i = (Math.round(y)*cv.width + Math.round(x))*4; return [d[i], d[i+1], d[i+2]]; };
    const halfW = w.field.W/2, halfL = w.field.L/2;
    // ⚠️ **MIRRORED SAMPLES, one per half at the same distance from halfway.** A wash
    // tints each half in its own team's colour, so the two disagree; an outline leaves
    // both halves as plain grass, so mirrored points are the same pixel. This is the
    // direct measurement of "one side of the field is dimmed".
    // ⚠️ **THE MEDIAN, NOT THE WORST — and the worst is reported beside it.** A wash tints
    // EVERY interior pixel, so the claim is about the whole area and the median is the
    // instrument that measures it. The max is dominated by whatever object happens to sit
    // on one sample (a warm-up ball, a goal-box line at a slightly different offset) and
    // read 574 of 765 on a build with no wash at all.
    // ⚠️ **AGAINST THE PITCH'S OWN ASYMMETRY, NOT AGAINST ZERO.** A bare pitch does not
    // mirror perfectly — the goal boxes and the mown stripes put it at 29 of 765 here — so
    // a fixed threshold is either vacuous or impossible depending which side of that it
    // lands. What has to be true is that warm-up adds NOTHING: the same measurement with
    // the team-sides block standing down is the control, taken in the same run at the same
    // camera on the same frame.
    const median = () => {
      const dd = g.getImageData(0, 0, cv.width, cv.height).data;
      const px = (x, y) => { const i = (Math.round(y)*cv.width + Math.round(x))*4; return [dd[i], dd[i+1], dd[i+2]]; };
      const out = [];
      for (let fx = -0.6; fx <= 0.6; fx += 0.2)
        for (let fy = 0.15; fy <= 0.75; fy += 0.15){
          const a = M.screenPt(M.wx(fx*halfW), M.wy( fy*halfL));
          const c = M.screenPt(M.wx(fx*halfW), M.wy(-fy*halfL));
          const A = px(a[0], a[1]), C = px(c[0], c[1]);
          out.push(Math.abs(A[0]-C[0]) + Math.abs(A[1]-C[1]) + Math.abs(A[2]-C[2]));
        }
      out.sort((x, y) => x - y);
      return { pairs: out.length, med: out[out.length >> 1], max: out[out.length - 1] };
    };
    const withLobby = median();
    // The control: one human means `drawLobby`'s team-sides block stands down entirely.
    const hs = w.players.filter(x => x.ctrl !== 'bot'), was = hs.map(x => x.ctrl);
    hs.slice(1).forEach(x => x.ctrl = 'bot');
    M.render();
    const bare = median();
    hs.forEach((x, i) => x.ctrl = was[i]);
    M.render();
    o.pairs = withLobby.pairs;
    o.medHalfDiff = withLobby.med; o.worstHalfDiff = withLobby.max;
    o.medBarePitch = bare.med;
    // ⚠️ ...and the OUTLINE really is there, or "not dimmed" is satisfied by drawing
    // nothing at all — which would lose what the wash was for (which half is which).
    // Scanned just inside each touchline, looking for the team's own hue.
    // ⚠️ **MEASURED AGAINST THE GRASS IT IS DRAWN OVER, not against an absolute hue.** The
    // two borders are deliberately not equally loud — the line thickens and firms up with
    // how many people are on that side — so a fixed red-vs-blue test finds the claimed
    // half and misses the quiet one (126 against 13 on a build where both were there).
    // What has to be true of both is that the edge differs from the interior.
    // ⚠️ **WALKED IN SCREEN PIXELS, NEVER IN WORLD STEPS — the quiet half's outline is ONE
    // anti-aliased pixel wide.** It thickens and firms up with how many people are standing
    // on that side, so with nobody there it is the thinnest mark on the pitch; a scan that
    // steps in world units lands between screen pixels and walks straight over it. Measured
    // on ONE build at two camera scales 2% apart: **99 and 24**, with the line plainly on
    // screen in both — so the reading was about where the samples fell, not about what was
    // drawn. Walking every pixel between the two endpoints cannot step over anything.
    const scan = (sy) => {
      const ref = at.apply(null, M.screenPt(M.wx(0), M.wy(sy*halfL*0.55)));
      const a = M.screenPt(M.wx(0), M.wy(sy*(halfL - 0.005*halfL)));
      const z = M.screenPt(M.wx(0), M.wy(sy*(halfL - 0.14*halfL)));
      const n = Math.max(2, Math.ceil(Math.hypot(z[0]-a[0], z[1]-a[1])));
      let best = 0;
      for (let i = 0; i <= n; i++){
        const c = at(a[0] + (z[0]-a[0])*i/n, a[1] + (z[1]-a[1])*i/n);
        best = Math.max(best, Math.abs(c[0]-ref[0]) + Math.abs(c[1]-ref[1]) + Math.abs(c[2]-ref[2]));
      }
      return best;
    };
    o.edge0 = scan(1); o.edge1 = scan(-1);
    return o;
  });
  console.log('dimming', JSON.stringify(r));
  ok('warm-up adds no dimming the bare pitch does not have', r.medHalfDiff <= r.medBarePitch + 4,
     `median mirrored pair ${r.medHalfDiff} of 765 with the lobby against ${r.medBarePitch} without it, across ${r.pairs} pairs (worst ${r.worstHalfDiff}) — it read 147 against 29 when the headline plate's fill() was also filling the leftover half-rectangle path in the surround colour at 0.86`);
  ok('...but each half is still marked in its colour', r.edge0 > 40 && r.edge1 > 40,
     `${r.edge0} / ${r.edge1} against the grass — "not dimmed" is also satisfied by drawing nothing, which loses the thing the wash was for`);
  await p.close();
}

// ================================ 3. the walk-on START pad =====================
{
  const p = await boot({ width: 1280, height: 900 }, 'v');
  const r = await p.evaluate(() => {
    const M = window.__magnet, o = {}, w = M.world;
    const pad = w.kb.keys.find(k => k.start);
    o.exists = !!pad;
    if (!pad) return o;
    // ⚠️ Wide enough to walk onto without aiming — the reason DEL and SPACE are wide.
    o.wideAsABody = Math.min(pad.w, pad.h) > 2 * (w.players[0].r);
    // ⚠️ Below the letters, never among them: it is not a letter, and it is the thing
    // you do last. Measured on the SCREEN box, because "below" is a screen word.
    const box = k => { const q = M.screenPt(M.wx(k.x + k.w/2), M.wy(k.y + k.h/2)); return q; };
    const letters = w.kb.keys.filter(k => k.ch).map(box);
    o.belowTheLetters = box(pad)[1] > Math.max(...letters.map(q => q[1])) + 4;
    const human = w.players.find(x => x.ctrl !== 'bot');
    M.kbHit(w, human, pad);
    o.state = w.state;
    return o;
  });
  console.log('startpad', JSON.stringify(r));
  ok('there is a START pad you can stand on', r.exists,
     'every other control here is a pad you walk onto; the one button the lobby exists to get you past was the exception');
  ok('...a body wide, and below the letters', r.wideAsABody && r.belowTheLetters, JSON.stringify(r));
  ok('...and pressing it starts the match', r.state && r.state !== 'warmup', r.state);
  await p.close();
}

// ==================== 4. every layout: on screen, and nothing overlapping ======
for (const [name, vp, orient] of [['flat', {width:1280,height:900}, 'v'],
                                  ['turned', {width:1280,height:900}, 'h'],
                                  ['phone', {width:390,height:844}, 'v'],
                                  ['deck', {width:1280,height:800}, 'h']]){
  const p = await boot(vp, orient);
  const r = await p.evaluate(() => {
    const M = window.__magnet, w = M.world, kb = w.kb;
    const fam = k => k.colTeam !== undefined ? 'col' : k.flagTeam !== undefined ? 'flag'
              : k.diff ? 'diff' : k.act ? 'act' : k.start ? 'start' : 'letter';
    const counts = {}; for (const k of kb.keys) counts[fam(k)] = (counts[fam(k)] || 0) + 1;
    // ⚠️ **NO TWO FAMILIES MAY OVERLAP.** The difficulty row and the colour rows both sat
    // at −284 when turned and the numbers were drawn straight through the shirts — a
    // collision no count or bounds check could see, because both were exactly where their
    // own arithmetic put them.
    let overlaps = 0;
    for (let i = 0; i < kb.keys.length; i++)
      for (let j = i+1; j < kb.keys.length; j++){
        const a = kb.keys[i], c = kb.keys[j];
        if (fam(a) === fam(c)) continue;
        if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) overlaps++;
      }
    const off = kb.keys.filter(k => { const q = M.screenPt(M.wx(k.x + k.w/2), M.wy(k.y + k.h/2));
      return q[0] < 0 || q[1] < 0 || q[0] > innerWidth || q[1] > innerHeight; }).length;
    const perBoard = M.LOBBYKB.rows.reduce((n, r2) => n + r2.length, 0) + 2;   // letters + DEL + SPACE
    return { counts, overlaps, off, camS: +M.cam.s.toFixed(3),
             boards: kb.keys.some(k => k.far) ? 2 : 1, perBoard,
             listLen: M.LOBBY_FLAGS.length, colsLen: M.TEAM_COLS.length };
  });
  console.log(name, JSON.stringify(r));
  ok(`${name}: every family of pads is there`,
     r.counts.col === r.colsLen * 2 && r.counts.flag === r.listLen * 2 &&
     // ⚠️ **THE LETTER BLOCK IS MIRRORED BEHIND BOTH GOALS IN THE FLAT LAYOUT**, so the
     // letters and the START pad come in ONE or TWO boards depending on orientation — and
     // the count is derived from `LOBBYKB.rows`, never a literal, so retuning the keyboard
     // cannot make this need editing. The stepper and the difficulty row stay single: they
     // are match-wide controls rather than part of the board.
     r.counts.diff === 7 && (r.counts.start === r.boards) &&
     r.counts.letter === r.perBoard * r.boards,
     JSON.stringify(r.counts));
  ok(`${name}: no two families overlap`, r.overlaps === 0, String(r.overlaps));
  ok(`${name}: every pad is on screen`, r.off === 0, String(r.off));
  await p.close();
}

// ============================================================================
//  NO SCOREBUG OVER THE WARM-UP ROOM
//
//  ⚠️ NOTHING USED TO DECIDE THIS. `startMatch` showed the scorebug unconditionally and
//  nothing ever took it back down, so the lobby carried a score that CANNOT change
//  (`checkGoal` is gated on `state === 'play'`) beside a clock that is not running (it
//  prints the match LENGTH). At 30px it was also the loudest text on the screen, while the
//  lines that tell you how the room works are 9px — the biggest thing on the page was the
//  one thing with nothing to say.
//
//  ⚠️ THE ORDERING TRAP, which is why `syncScorebug` is a function and not a hide inside
//  `enterWarmup`: `startMatch` calls `enterWarmup` and only THEN shows the bug, so a hide
//  in there is clobbered a few lines later. The three OTHER ways into the lobby
//  (`restartToWarmup`, the cup's lite lobby, the menu's warm-up button) reach `enterWarmup`
//  LAST, where a hide would stick. One function reading `world.state` is right on every
//  path whatever order they run in — so both orders are exercised below.
// ============================================================================
{
  const q = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  q.on('pageerror', e => errors.push(e.message));
  await q.addInitScript(() => {
    window.__MAGNETDEBUG = true;
    const mk = i => ({ axes:[0,0,0,0], buttons: Array.from({length:17},()=>({pressed:false,value:0})),
                       connected:true, index:i, id:'Stub Pad (STANDARD GAMEPAD)', mapping:'standard' });
    window.__pads = [mk(0), mk(1)]; navigator.getGamepads = () => window.__pads;
  });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);
  const sb = await q.evaluate(() => {
    const M = window.__magnet, o = {};
    // ⚠️ COMPUTED style, not the inline property: a suite that reads `style.display`
    // passes on a build where a CSS rule shows it anyway.
    const vis = () => getComputedStyle(document.getElementById('scorebug')).display !== 'none';
    M.sel.controllers='on'; M.sel.lobby='on'; M.sel.length='5';
    // (1) startMatch straight into warm-up — the order where enterWarmup runs FIRST
    M.setMatchSeed(7); M.startMatch({ lobby:true });
    o.state1 = M.world.state; o.warmupHidden = !vis();
    // (2) ...and it comes back the moment the room closes
    M.lobbyStart(M.world);
    o.state2 = M.world.state; o.afterStartShown = vis();
    // (3) restartToWarmup — the order where enterWarmup runs LAST
    M.restartToWarmup(M.world);
    o.state3 = M.world.state; o.restartHidden = !vis();
    M.lobbyStart(M.world); o.restartBackShown = vis();
    // (4) an ordinary match never hides it, or this is a feature that broke the HUD
    M.sel.lobby='off'; M.setMatchSeed(9); M.startMatch();
    o.state4 = M.world.state; o.plainMatchShown = vis();
    return o;
  });
  await q.close();

  ok('warm-up came up and the scorebug did not', sb.state1 === 'warmup' && sb.warmupHidden,
     JSON.stringify(sb) + ' — a score that cannot change and a clock that is not running');
  ok('...and it is back once the room closes', sb.state2 !== 'warmup' && sb.afterStartShown,
     JSON.stringify(sb));
  ok('...on the path that reaches enterWarmup LAST too', sb.state3 === 'warmup' && sb.restartHidden,
     JSON.stringify(sb) + ' — restartToWarmup starts the match and only then enters the room, which is ' +
     'the opposite order from startMatch; a hide at one site alone gets exactly one of them right');
  ok('...and that one restores it as well', sb.restartBackShown, JSON.stringify(sb));
  ok('an ordinary match still HAS a scorebug', sb.state4 !== 'warmup' && sb.plainMatchShown,
     JSON.stringify(sb) + ' — "hidden in warm-up" is also true of a build that hid it for good');
}

// ============================================================================
//  THE FRAME ROUND A HALF IS THE COLOUR THAT HALF PICKED
//
//  ⚠️ It read `team === 0 ? T.teamRed : T.teamBlue` — the THEME's red and blue — so a side
//  that had chosen GREEN off the swatches was outlined in red, and its "1 PLAYER" head
//  count printed in red, while its shirts were green. Two answers to "whose half is this".
//  `drawGoal` already reads `teamColOf` for exactly this reason; the lobby's own outline
//  was the one place left that did not.
//
//  ⚠️ **MEASURED AS A DIFFERENCE AGAINST THE SAME FRAME WITH THE BLOCK OFF, and the
//  obvious probe is VACUOUS — verified by a sabotage that PASSED.** Scanning the edge band
//  for "the pixel furthest from grass" finds the pitch's own WHITE TOUCHLINE, which is far
//  further from grass than a tinted stroke, so it returns the same white pixel whichever
//  colour the outline is drawn in and the comparison below is a constant. The team-sides
//  block stands down at one human (`hs.length > 1`), so rendering the identical frame with
//  one human is the control: the pixels that CHANGE between the two are the outline, by
//  construction. That is the same instrument the dimming check above uses, for the same
//  reason.
//  ⚠️ And then "nearer to which", not an absolute hue: the stroke is laid over grass at
//  partial width, so its rendered pixels are never the palette hex.
// ============================================================================
{
  const q = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  q.on('pageerror', e => errors.push(e.message));
  await q.addInitScript(() => {
    window.__MAGNETDEBUG = true;
    const mk = i => ({ axes:[0,0,0,0], buttons: Array.from({length:17},()=>({pressed:false,value:0})),
                       connected:true, index:i, id:'Stub Pad (STANDARD GAMEPAD)', mapping:'standard' });
    window.__pads = [mk(0), mk(1)]; navigator.getGamepads = () => window.__pads;
  });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);
  const fr = await q.evaluate(() => {
    const M = window.__magnet, o = {};
    M.sel.controllers='on'; M.sel.lobby='on'; M.sel.length='5'; M.sel.look.palette='grass';
    M.sel.teamFlag = ['none','none'];
    // GREEN for side 0 — deliberately neither of the theme's team inks, so "it followed"
    // and "it did nothing" cannot look the same.
    const green = M.TEAM_COLS.find(c=>c.key==='green').col;
    M.sel.teamCol = [green, M.TEAM_COLS.find(c=>c.key==='blue').col];
    M.setMatchSeed(7); M.startMatch({ lobby:true });
    const w = M.world;
    const hs = w.players.filter(x=>x.ctrl!=='bot');
    hs[0].x=0; hs[0].y=-w.field.L*0.25; hs[0]._px=hs[0].x; hs[0]._py=hs[0].y;
    hs[1].x=0; hs[1].y= w.field.L*0.25; hs[1]._px=hs[1].x; hs[1]._py=hs[1].y;
    for (let i=0;i<40;i++) M.step(w);

    const cv = document.getElementById('game'), g = cv.getContext('2d');
    const dpr = cv.width / cv.getBoundingClientRect().width;
    const grab = () => g.getImageData(0,0,cv.width,cv.height).data;
    M.render(); const on = grab();
    // THE CONTROL: one human, so `drawLobby`'s team-sides block stands down and nothing
    // else about the frame changes.
    const keep = hs[1].ctrl; hs[1].ctrl = 'bot';
    M.render(); const off = grab();
    hs[1].ctrl = keep; M.render();

    const at = (d,x,y) => { const i=((y*cv.width)+x)*4; return [d[i],d[i+1],d[i+2]]; };
    const hexRgb = h => [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
    const dist = (a,c) => Math.hypot(a[0]-c[0],a[1]-c[1],a[2]-c[2]);
    // ⚠️ **TEAM 0 IS THE BOTTOM HALF, and sampling the top one made this vacuous** —
    // verified by a sabotage that PASSED. `drawLobby` gives team 0 `sign = +1`, so it owns
    // world +y, which upright is screen-DOWN. Probing the top edge measures TEAM 1, whose
    // colour is blue in both builds (the theme's teamBlue and the palette's blue are both
    // blue), so the green-versus-red comparison never engaged at all. Sample the edge of
    // the half whose colour was actually changed.
    const bb = w.bounds;
    const yBot = M.screenPt(M.wx(0), M.wy(bb.halfL))[1] * dpr;
    const xa = M.screenPt(M.wx(-bb.halfW), M.wy(0))[0] * dpr;
    const xb = M.screenPt(M.wx( bb.halfW), M.wy(0))[0] * dpr;
    let best = null, far = -1, changed = 0;
    for (let x = Math.round(xa)+6; x < Math.round(xb)-6; x++)
      for (let dy = -14; dy <= 0; dy++){
        const y = Math.round(yBot) + dy;
        const a = at(on,x,y), c = at(off,x,y);
        const d = dist(a,c);
        if (d > 12) changed++;
        if (d > far){ far = d; best = a; }
      }
    o.changedPx = changed; o.edge = best;
    o.picked = M.teamColOf(0); o.themeRed = M.TH.teamRed;
    o.toPicked = +dist(best, hexRgb(o.picked)).toFixed(1);
    o.toThemeRed = +dist(best, hexRgb(o.themeRed)).toFixed(1);
    return o;
  });
  await q.close();

  // ⚠️ The block has to have DRAWN something, or "it is the picked colour" is decided by
  // whichever hex happens to be nearer to a patch of unchanged grass.
  ok('the team-sides outline is drawn at all', fr.changedPx > 100,
     fr.changedPx + ' pixels differ from the same frame with the block off');
  ok('the half is framed in the colour that half PICKED', fr.toPicked < fr.toThemeRed,
     JSON.stringify(fr) + ' — the edge pixel is nearer the theme\'s red than the green this side chose, ' +
     'so the frame and the shirts are telling you different things');
  ok('...and the two candidates really are different colours', fr.picked !== fr.themeRed,
     'the check above says nothing if the picked colour happens to BE the theme red');
}

// ============================================================================
//  A COUNTRY CARRIES A COLOUR
//
//  ⚠️ Picking a flag used to change only the FACES, so a side could wear Brazil's flag in
//  purple shirts. ⚠️ The fallback only gives way to another COUNTRY, never to a default —
//  the first version avoided whatever the other side wore, and since side 1 starts on the
//  default blue it never chose, FRANCE CAME OUT IN RED on the very first pick.
// ============================================================================
{
  const q = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  q.on('pageerror', e => errors.push(e.message));
  await q.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(600);
  const nc = await q.evaluate(() => {
    const M = window.__magnet, o = {};
    const nameOf = h => (M.TEAM_COLS.find(c=>c.col===h)||{}).key || h;
    const fresh = () => { M.sel.teamCol = null; M.sel.teamFlag = ['none','none']; };
    o.each = {};
    for (const k of M.LOBBY_FLAGS){ fresh(); M.setTeamFlag(0, k); o.each[k] = nameOf(M.teamColOf(0)); }
    fresh(); M.setTeamFlag(0,'spain'); M.setTeamFlag(1,'portugal');
    o.twoReds = [nameOf(M.teamColOf(0)), nameOf(M.teamColOf(1))];
    fresh(); M.setTeamFlag(0,'france'); M.setTeamFlag(1,'argentina');
    o.twoBlues = [nameOf(M.teamColOf(0)), nameOf(M.teamColOf(1))];
    fresh(); M.setTeamFlag(0,'brazil'); const was = nameOf(M.teamColOf(0));
    M.setTeamFlag(0,'none');
    o.noneKeeps = [was, nameOf(M.teamColOf(0))];
    o.everyCountryHasOne = M.LOBBY_FLAGS.filter(k => k !== 'none' && !M.NATION_COLS[k]);
    return o;
  });
  await q.close();

  ok('every country carries a colour', nc.everyCountryHasOne.length === 0,
     'no colour for: ' + nc.everyCountryHasOne.join(', ') + ' — a flag that does not dress the side is half the feature');
  // The three that the "give way to a default" bug got wrong, named individually.
  ok('France, the USA and Argentina play in BLUE',
     nc.each.france === 'blue' && nc.each.usa === 'blue' && nc.each.argentina === 'blue',
     JSON.stringify({ france: nc.each.france, usa: nc.each.usa, argentina: nc.each.argentina }) +
     ' — a default nobody chose has no claim on a colour, and Les Bleus in red is the one thing this must not do');
  ok('...Mexico in GREEN, Brazil in YELLOW, the Netherlands in ORANGE',
     nc.each.mexico === 'green' && nc.each.brazil === 'yellow' && nc.each.netherl === 'orange',
     JSON.stringify(nc.each) + ' — Mexico is the one that snapping to the nearest colour numerically gets wrong ' +
     '(its dark green measures closer to TEAL)');
  ok('two red nations end up in different shirts', nc.twoReds[0] !== nc.twoReds[1], JSON.stringify(nc.twoReds));
  ok('...and so do two blue ones', nc.twoBlues[0] !== nc.twoBlues[1], JSON.stringify(nc.twoBlues));
  ok('taking the flag off leaves the colour alone', nc.noneKeeps[0] === nc.noneKeeps[1],
     JSON.stringify(nc.noneKeeps) + ' — None removes a country, it is not a request to be recoloured');
}

// ============================================================================
//  THE BAKED BOARD IS NOT A STALE ONE
//
//  ⚠️ The warm-up board is drawn ONCE into an offscreen canvas and blitted — it was
//  costing 0.99ms a frame against a live 4v4 match's 0.18ms, because ~70 pads were fully
//  repainted every frame with a save/clip/drawImage/restore each. Baked, that is 0.32ms.
//  ⚠️ **WHAT A CACHE CAN GET WRONG IS BEING STALE**, so the three things checked here are
//  the three ways this one could be: the live highlight must not be baked into it, a
//  change of selection must invalidate it, and it must not wobble between two draws of
//  one frame. Measured as picture differences, because "the signature contains X" is a
//  restatement of the code rather than a test of it.
//  ⚠️ The bake is not bit-identical to painting each pad directly and cannot be: the pads
//  are TRANSLUCENT, so compositing them onto a transparent layer and blitting that once
//  differs from compositing each onto the pitch in turn. Measured over a whole frame,
//  99.9% of the pixels that differ do so by <= 2 levels of 255 and only 126 of 810,000
//  exceed 8 — edge antialiasing, not a structural change.
// ============================================================================
{
  const q = await b.newPage({ viewport:{ width:900, height:900 } });
  q.on('pageerror', e => errors.push(e.message));
  await q.addInitScript(() => {
    window.__MAGNETDEBUG = true;
    const mk = i => ({ axes:[0,0,0,0], buttons: Array.from({length:17},()=>({pressed:false,value:0})),
                       connected:true, index:i, id:'Stub Pad (STANDARD GAMEPAD)', mapping:'standard' });
    window.__pads = [mk(0), mk(1)]; navigator.getGamepads = () => window.__pads;
  });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);
  const bk = await q.evaluate(() => {
    const M = window.__magnet, o = {};
    M.sel.controllers='on'; M.sel.lobby='on'; M.sel.length='5'; M.sel.look.palette='grass';
    M.sel.teamFlag = ['none','none']; M.sel.teamCol = null;
    M.setMatchSeed(7); M.startMatch({ lobby:true });
    const w = M.world;
    for (let i=0;i<40;i++) M.step(w);
    const cv = document.getElementById('game'), g = cv.getContext('2d');

    // ⚠️ **THE DIFF IS RESTRICTED TO THE BOARD, and without that BOTH checks below are
    // VACUOUS — verified by sabotages that PASSED.** Moving a body onto a key also moves
    // the body, and recolouring a side also recolours the shirts on the pitch: a
    // whole-frame diff is satisfied by either of those with the board completely stale.
    // So the bodies are parked in the middle of the COURT (the pads are all outside the
    // touchlines) and only the pads' own bounding box is compared.
    // ⚠️ **EACH CHECK MEASURES ITS OWN PADS' BOX, and the obvious "box round all the
    // pads" is VACUOUS — verified by a sabotage that PASSED.** In the upright layout the
    // swatches are beside the court and the keyboard below it, so a rectangle enclosing
    // every pad also encloses THE PITCH: the parked bodies sit inside it, and recolouring
    // a side changes their shirts, which satisfies the diff with the board fully stale.
    const dpr = cv.width / cv.getBoundingClientRect().width;
    const boxOf = (keys) => {
      const cor = [];
      for (const k of keys) for (const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]])
        cor.push(M.screenPt(M.wx(k.x+dx*k.w/2), M.wy(k.y+dy*k.h/2)));
      const x0 = Math.max(0, Math.floor(Math.min(...cor.map(c=>c[0]))*dpr) - 3);
      const x1 = Math.min(cv.width,  Math.ceil(Math.max(...cor.map(c=>c[0]))*dpr) + 3);
      const y0 = Math.max(0, Math.floor(Math.min(...cor.map(c=>c[1]))*dpr) - 3);
      const y1 = Math.min(cv.height, Math.ceil(Math.max(...cor.map(c=>c[1]))*dpr) + 3);
      return [x0, y0, x1-x0, y1-y0];
    };
    const grabIn = bx => g.getImageData(bx[0], bx[1], bx[2], bx[3]).data;
    const diff = (a,c) => { let n=0; for (let i=0;i<a.length;i+=4)
      if (Math.abs(a[i]-c[i])+Math.abs(a[i+1]-c[i+1])+Math.abs(a[i+2]-c[i+2]) > 24) n++; return n; };

    const gKey    = w.kb.keys.find(k => k.ch === 'G');
    const boxG    = boxOf([gKey]);
    const boxSw   = boxOf(w.kb.keys.filter(k => k.colTeam === 0));
    const boxFlag = boxOf(w.kb.keys.filter(k => k.flagTeam === 0));
    o.boxes = { g: boxG.slice(2), sw: boxSw.slice(2), flag: boxFlag.slice(2) };

    // Park every human on the court, far from the pads. Bots are not drawn in warm-up.
    const hs = w.players.filter(x => x.ctrl !== 'bot');
    hs.forEach((q2, i2) => { q2.x = (i2 ? 40 : -40); q2.y = 0; q2._px = q2.x; q2._py = q2.y;
                             q2.vx = q2.vy = 0; q2.kbKey = null; });

    M.render(); const baseG = grabIn(boxG);
    M.render(); o.stable = diff(baseG, grabIn(boxG)) === 0;

    // ⚠️ THE HIGHLIGHT IS LIVE. `kbKey` is set WITHOUT stepping and WITHOUT moving the
    // body — stepping would recompute it from the position and walk the body into shot.
    hs[0].kbKey = gKey;
    M.render(); o.highlightShows = diff(baseG, grabIn(boxG)) > 8;
    hs[0].kbKey = null;

    // ⚠️ A CHANGE OF SELECTION INVALIDATES THE BAKE. The worn swatch is drawn at rest, so
    // it lives in the baked image; a signature that missed it would keep showing the old
    // one until the camera moved, which no geometry check can see.
    M.render(); const beforeSw = grabIn(boxSw);
    M.setTeamCol(0, M.TEAM_COLS.find(c => c.key === 'purple').col);
    M.render(); o.shirtPickShows = diff(beforeSw, grabIn(boxSw)) > 8;

    const beforeFl = grabIn(boxFlag);
    M.setTeamFlag(0, 'brazil');
    M.render(); o.flagPickShows = diff(beforeFl, grabIn(boxFlag)) > 8;
    return o;
  });
  await q.close();

  ok('the warm-up board does not wobble between draws', bk.stable,
     'two draws of one frame differ — every check below would be measuring that instead');
  ok('...the highlight under a body is LIVE, not baked in', bk.highlightShows,
     'standing on a key changed nothing, so the board would never light up');
  ok('...picking a shirt invalidates the board', bk.shirtPickShows,
     'the worn swatch is drawn at rest, so it is in the bake — a signature that misses it shows the old colour');
  ok('...and so does picking a flag', bk.flagPickShows, JSON.stringify(bk));
}

ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));
console.log(bad ? 'FAIL lobbydress' : 'PASS lobbydress');
await b.close();
process.exit(bad ? 1 : 0);
