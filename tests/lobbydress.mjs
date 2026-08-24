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
  ok('a flag pad per country per side', r.count === 16 && r.perTeam[0] === 8 && r.perTeam[1] === 8, JSON.stringify(r.perTeam));
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
    const scan = (sy) => {
      const ref = at.apply(null, M.screenPt(M.wx(0), M.wy(sy*halfL*0.55)));
      let best = 0;
      for (let fy = 0.01; fy <= 0.12; fy += 0.005){
        const q = M.screenPt(M.wx(0), M.wy(sy*(halfL - fy*halfL)));
        const c = at(q[0], q[1]);
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
    return { counts, overlaps, off, camS: +M.cam.s.toFixed(3) };
  });
  console.log(name, JSON.stringify(r));
  ok(`${name}: every family of pads is there`,
     r.counts.col === 16 && r.counts.flag === 16 && r.counts.diff === 7 && r.counts.start === 1 && r.counts.letter >= 28,
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

ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));
console.log(bad ? 'FAIL lobbydress' : 'PASS lobbydress');
await b.close();
process.exit(bad ? 1 : 0);
