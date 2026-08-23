// FIVE THINGS THAT SHIPPED TOGETHER, and the first one is a correction.
//
//  1. THE WIND-UP RING IS SOLID. It pulsed at `3.5 + f*8` Hz, so a full charge strobed
//     the ring nearly twelve times a second — reported as "holding kick makes the circle
//     around the player flash instead of staying solid". ⚠️ This was first misdiagnosed
//     as the screen shake, so the check here is on the RING and nothing else: two draws
//     of one frame, with the charge held at a fixed value, must put the same ink on the
//     same pixels.
//  2. A SLIDER for how big that ring is drawn, as a multiple of the player's radius —
//     and it must move the drawing WITHOUT moving the physics.
//  3. NAME PLATES GO COMPLETELY at the strongest point of either fade rule, rather than
//     receding to 5%.
//  4. THE SAVE-REPLAY BUTTON IS NEVER OFFERED MID-MATCH: not on the bar that comes up
//     between a goal and the kickoff. It lives on the playback transport and the result
//     screen, where there is nothing to interrupt.
//  5. A GAME SAVE as one JSON file — settings, player, record, unlocks, maps, drill
//     times, a run in progress — that survives a round trip.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };
const p = await b.newPage({ viewport: { width: 1000, height: 1000 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|ERR_TUNNEL/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

// ============================================ 1 + 2. the wind-up ring ==
const ring = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  o.dial = { def: M.KICKRING.def, mul: M.kickRingMul() };
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.sel.charge = 'on'; M.setMatchSeed(4); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = w.players[0];
  w.players.slice(1).forEach(q => { q.x = w.bounds.halfW*0.8; q.y = w.bounds.halfL*0.8; });
  w.ball.x = w.bounds.halfW*0.8; w.ball.y = -w.bounds.halfL*0.8;
  me.x = 0; me.y = 0; me.vx = 0; me.vy = 0;

  const cv = document.getElementById('game'), c2 = cv.getContext('2d');
  const hash = () => { const d = c2.getImageData(0, 0, cv.width, cv.height).data;
    let h = 0; for (let i = 0; i < d.length; i += 51) h = (h*31 + d[i])|0; return h; };
  // A charge held at a FIXED value: nothing about the world changes between draws, so
  // any difference is the ring painting itself differently.
  const hold = t => { me.kick = true; me.chargeT = t; me.holdT = t; M.computeCam(); };

  hold(0.30);
  M.render(); const a1 = hash();
  M.render(); const a2 = hash();
  o.solidAtOneCharge = a1 === a2;
  // ⚠️ ...and at a DIFFERENT phase of the old oscillator, because a pulse could sit at a
  // turning point and read as steady for one value of the charge.
  hold(0.44);
  M.render(); const b1 = hash();
  M.render(); const b2 = hash();
  o.solidAtAnother = b1 === b2;
  // The ring is really being drawn at all — otherwise everything above is vacuous.
  hold(0.30); M.render(); const withRing = hash();
  me.kick = false; me.chargeT = 0; me.holdT = 0; M.render(); const without = hash();
  o.ringIsDrawn = withRing !== without;

  // ---- the size dial ----
  o.mulAtDefault = (M.sel.kickRing = M.KICKRING.def, M.kickRingMul());
  o.mulAtMax = (M.sel.kickRing = M.KICKRING.max, M.kickRingMul());
  o.mulAtMin = (M.sel.kickRing = M.KICKRING.min, M.kickRingMul());
  o.dialSpansARealRange = o.mulAtMax > o.mulAtDefault && o.mulAtDefault > o.mulAtMin;
  o.clampsRubbish = (M.sel.kickRing = 9999, M.kickRingMul()) === M.KICKRING.max/100 &&
                    (M.sel.kickRing = null, M.kickRingMul()) === M.KICKRING.def/100;

  // ⚠️ **THE RENDER-ONLY CLAIM IS WITHDRAWN, and this asserts the opposite now.** The ring
  // used to be a tell drawn well inside the real reach, and this block proved the dial
  // could never become a hidden gameplay lever. It was reported that the ring does not
  // show where you can actually kick: measured, the ring sat at 30 world units while the
  // kick condition was `dist < p.r + b.r + 14` = 39, so a ball resting against the OUTSIDE
  // of the ring was 40 away and did not kick — out by one unit, which is the kind of
  // near-miss that makes an indicator feel broken. The ring IS the reach now, so the dial
  // moves both and a bit-identical world would mean the fix had not landed.
  const runHash = (mul) => {
    M.sel.kickRing = mul; M.setMatchSeed(21); M.startMatch();
    const w2 = M.world; w2.state = 'play'; w2.stateT = 2;
    for (let i = 0; i < 900; i++) M.step(w2);
    return w2.players.map(q => `${q.x.toFixed(6)},${q.y.toFixed(6)}`).join('|') +
           `#${w2.ball.x.toFixed(6)},${w2.ball.y.toFixed(6)}#${w2.score.join('-')}`;
  };
  o.dialMovesTheGame = runHash(M.KICKRING.min) !== runHash(M.KICKRING.max);
  // ⚠️ ...and the PICTURE agrees with the physics, which is the actual claim: a ball
  // touching the ring is within reach. Walked inward from well outside until KICK first
  // connects, and compared against where the drawn ring is — measured at every dial value,
  // never just the default, since the whole point is that the two move together.
  // ⚠️ A trap needs TAP_HOLD seconds of holding, so ONE step measures the hold timer
  // rather than the reach and reports no kick at any distance. Positions are re-pinned
  // every step, because `integrate` moves both bodies out of the band being tested.
  o.reach = {};
  for (const dial of [M.KICKRING.min, M.KICKRING.def, M.KICKRING.max]){
    M.sel.kickRing = dial; M.setMatchSeed(4); M.startMatch();
    const w2 = M.world; w2.state = 'play'; w2.stateT = 2;
    const me2 = w2.players[0];
    for (const q of w2.players) if (q !== me2){ q.x = 0; q.y = 9000; }
    const ringWorld = 15 * (dial/100), touchAt = ringWorld + 10;
    let furthest = -1;
    for (let d = touchAt + 6; d >= 18 && furthest < 0; d -= 0.25){
      const b2 = w2.ball;
      me2.trap = null; me2.trapUsed = false; me2.kickUsed = false; me2.tapArmed = false; me2.tapT = 0;
      b2._trappedBy = null;
      M.pads.p1.kick = true; M.pads.p1.dx = 0; M.pads.p1.dy = 0;
      for (let k = 0; k < 20 && furthest < 0; k++){
        b2.x = d; b2.y = 0; b2.vx = b2.vy = 0;
        me2.x = 0; me2.y = 0; me2.vx = me2.vy = 0;
        M.step(w2);
        // ⚠️ The TRAP flags only, never "the ball moved". At the smallest dial the reach is
        // zero, so a ball at the touch distance is resting against the player's body and
        // the ordinary disc collision shoves it — which a velocity test scores as a kick
        // and reported the reach as 2.25 units LONGER than the ring at that setting.
        if (b2._trappedBy === me2 || me2.trap) furthest = d;
      }
    }
    M.pads.p1.kick = false;
    o.reach[dial] = { touchAt: +touchAt.toFixed(2), furthest: +furthest.toFixed(2) };
  }
  // ⚠️ The probe steps in 0.25, so agreement to within a step is exact agreement. The
  // tolerance is 1.0 rather than 0.25 for one case only: at the SMALLEST dial the reach is
  // zero, so the ball sits against the player's body and the disc collision separates them
  // before the trap can latch, costing a couple of extra steps. At the default and the
  // maximum — the settings anyone actually plays on — the two agree to within one step.
  o.ringIsTheReach = Object.values(o.reach).every(x => x.furthest > 0 && Math.abs(x.touchAt - x.furthest) <= 1.0);
  M.sel.kickRing = M.KICKRING.def;
  return o;
});

// ================================================= 3. the name plates ==
const labels = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  o.dim = M.LABEL_DIM;
  o.near = M.LABEL_BALL.near;
  o.hidesCompletely = M.LABEL_DIM === 0 && M.LABEL_BALL.near === 0;
  // ...and it is still a RAMP rather than a switch: a plate well away from the ball is
  // fully lit, one at the far edge of the rule is part way down.
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(4); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  const me = w.players[0];
  w.ball.x = 0; w.ball.y = 0;
  const fadeAt = d => { me.x = d; me.y = 0; M.computeCam(); M.render(); M.advanceLabels();
    for (let i = 0; i < 60; i++) M.advanceLabels(); return +(M.labelA[0] ?? 1).toFixed(3); };
  // ⚠️ **THE RAMP HAS A FLOOR NOW (`LABEL_MIN`), so where this probes matters.** It used
  // to sample `far * 0.55`, which the `t²` fade puts at 0.30 — under the floor, so it
  // reads exactly 0 and "part way down" became "gone". The regime the ramp still lives in
  // is [LABEL_MIN, 1], so the mid probe is derived from the floor rather than picked:
  // t = sqrt((1 + LABEL_MIN) / 2) puts the value halfway between the floor and full.
  const midT = Math.sqrt((1 + M.LABEL_MIN) / 2);
  o.farAway = fadeAt(M.LABEL_BALL.far * 2.2);
  o.midWay  = fadeAt(M.LABEL_BALL.far * midT);
  o.onTop   = fadeAt(0);
  o.goesToZero = o.onTop <= 0.004;
  o.isARamp = o.farAway > 0.9 && o.midWay > o.onTop && o.midWay < o.farAway;
  // ⚠️ ...and it SNAPS at the floor rather than trailing off into an unreadable band —
  // the half of the rule that answers "if it is that blurry then just hide it". Just
  // under the floor is exactly zero, not merely small.
  o.floor = M.LABEL_MIN;
  o.justUnderTheFloor = fadeAt(M.LABEL_BALL.far * Math.sqrt(Math.max(0, M.LABEL_MIN - 0.03)));
  o.snapsAtTheFloor = o.justUnderTheFloor === 0 && o.midWay >= M.LABEL_MIN;
  return o;
});

// ====================================== 4. no saving in the middle of a match ==
const btns = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  const bar = document.getElementById('replayBar');
  o.inMatchButtons = [...bar.querySelectorAll('button')].map(x => x.id);
  o.noSaveOnTheMatchBar = !o.inMatchButtons.some(id => /save/i.test(id));
  // It IS on the playback transport...
  const ctl = document.getElementById('repCtl');
  o.transportButtons = [...ctl.querySelectorAll('button')].map(x => x.id);
  o.saveOnTheTransport = o.transportButtons.includes('repSaveBtn');
  // ...and the result screen still has both saves, which is the other place it lives.
  // ⚠️ A match has to be PLAYED first: the result screen's save buttons only appear once
  // there is a replay to save, so ending a match on frame one lists neither and the check
  // below fails for the wrong reason. `autoReplay` off, or the goal replay's promise can
  // never resolve inside a synchronous loop.
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.sel.autoReplay = false;
  M.setMatchSeed(4); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  for (let i = 0; i < 900; i++) M.step(w);
  M.endMatch(w); M.finishMatch(w);
  const ov = document.getElementById('overlay');
  o.resultButtons = [...ov.querySelectorAll('button')].map(x => (x.textContent || '').trim());
  o.resultHasBothSaves = o.resultButtons.filter(t => /save/i.test(t) && /replay/i.test(t)).length >= 2;
  return o;
});

// ==================================================== 5. the game save ==
const save = await p.evaluate(async () => {
  const M = window.__magnet, o = {};
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  // Something distinctive in every corner the save is meant to carry.
  M.sel.kickRing = 205; M.sel.hitStop = 9; M.sel.mode = '4v4';
  M.profile.name = 'Rosalind';
  M.saveSel(); M.saveProfile();
  localStorage.setItem('magnetball.stats', JSON.stringify({ points: 4321, mmr: 1337, wins: 9 }));
  localStorage.setItem('magnetball.drills', JSON.stringify({ targets: 17 }));

  const doc = M.buildSaveDoc();
  o.format = doc.format; o.v = doc.v;
  o.carries = M.SAVEFILE.keys.filter(k => k in doc.data);
  o.hasSettings = doc.data.sel && doc.data.sel.kickRing === 205 && doc.data.sel.hitStop === 9;
  o.hasProfile = doc.data.profile && doc.data.profile.name === 'Rosalind';
  o.hasStats = doc.data.stats && doc.data.stats.points === 4321;
  o.hasDrills = !!doc.data.drills;
  // ⚠️ PARSED VALUES, not strings of strings — a save file is meant to be readable.
  o.notDoubleEncoded = typeof doc.data.sel === 'object';
  // ⚠️ The forced-update record must never travel: another device's copy could arrive
  // already overdue and lock the game on a build with nothing wrong with it.
  localStorage.setItem('magnetball.upd', JSON.stringify({ v: '20990101.0101AM', first: 1 }));
  const doc2 = M.buildSaveDoc();
  o.skipsUpd = !('upd' in doc2.data) && M.SAVEFILE.skip.includes('upd');
  o.skipsAll = M.SAVEFILE.skip.every(k => !(k in doc2.data));

  // ---- the round trip, which is the whole claim ----
  const text = JSON.stringify(doc);
  localStorage.setItem('magnetball.sel', JSON.stringify({ kickRing: 100, hitStop: 0 }));
  localStorage.setItem('magnetball.stats', JSON.stringify({ points: 0 }));
  localStorage.setItem('magnetball.profile', JSON.stringify({ name: 'Somebody Else' }));
  const back = M.parseSaveDoc(text);
  const n = M.applySaveDoc(back);
  o.restoredCount = n;
  const sel2 = JSON.parse(localStorage.getItem('magnetball.sel'));
  const st2 = JSON.parse(localStorage.getItem('magnetball.stats'));
  const pr2 = JSON.parse(localStorage.getItem('magnetball.profile'));
  o.roundTrip = sel2.kickRing === 205 && sel2.hitStop === 9 &&
                st2.points === 4321 && pr2.name === 'Rosalind';
  // An import must not have written the update record.
  o.updUntouched = JSON.parse(localStorage.getItem('magnetball.upd')).v === '20990101.0101AM';

  // ---- every refusal is a sentence somebody can act on ----
  const refuse = t => { try { M.parseSaveDoc(t); return null; } catch(e){ return e.message; } };
  o.refusals = {
    notJson: refuse('<html>hello'),
    otherJson: refuse('{"name":"my-package","version":"1.0.0"}'),
    newer: refuse(JSON.stringify({ format: 'magnetball-save', v: 99, data: {} })),
    empty: refuse(JSON.stringify({ format: 'magnetball-save', v: 1 })),
  };
  o.allRefused = Object.values(o.refusals).every(m => typeof m === 'string' && m.length > 12 && !/undefined/.test(m));
  // ⚠️ A doctored file cannot write a key that is not on the list.
  localStorage.removeItem('magnetball.evil');
  M.applySaveDoc({ data: { evil: 'x', sel: { kickRing: 205 } } });
  o.ignoresUnknownKeys = localStorage.getItem('magnetball.evil') === null;
  o.filename = M.saveFilename();
  o.filenameSaysWhatItIs = /magnetball-save-/.test(o.filename) && /\.json$/.test(o.filename);
  return o;
});

// The two buttons are real, reachable press targets in the About card.
const ui = await p.evaluate(async () => {
  const M = window.__magnet, o = {};
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  // WARNING: A MATCH STARTED EARLIER IN THIS SUITE, AND A MATCH NOW COLLAPSES THE DOCK
  // (matchCollapse). buildSettings + openSection do not go through dockOrFull, so the
  // card is built inside a panel that is slid off the screen and elementFromPoint at the
  // button's own centre answers the canvas. Opening it is what a person does with the
  // ‹ tab, and it is also what clears the match's own collapse.
  M.setDockCollapsed(false);
  // ...and let the slide finish. The dock animates in, so a rect read on the same frame
  // catches the panel still 287px off the left of the window and elementFromPoint at the
  // button's own centre answers nothing at all.
  await new Promise(r => setTimeout(r, 400));
  M.buildSettings(); M.openSection('about');
  const ex = document.getElementById('saveExportBtn'), im = document.getElementById('saveImportBtn');
  o.present = !!ex && !!im;
  if (!o.present) return o;
  ex.scrollIntoView({ block: 'center' });
  const r = ex.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
  o.pressable = !!hit && (hit === ex || ex.contains(hit));
  o.hitWas = hit ? (hit.id || hit.tagName) + '.' + hit.className : null;
  o.size = [Math.round(r.width), Math.round(r.height)];
  // ⚠️ Import ARMS rather than firing: it replaces your record with somebody's file.
  const was = im.textContent;
  im.click();
  o.armsFirst = im.textContent !== was && /\?/.test(im.textContent);
  // ...and the menu search can find it, which is the only other route in.
  o.inSearch = M.menuSearchIndex().some(row => /import save|export save|another device/i.test(JSON.stringify(row)));
  return o;
});
await p.close();

// -------------------------------------------------------------------- report --
ok('the wind-up ring is SOLID, not pulsing', ring.solidAtOneCharge && ring.solidAtAnother,
   JSON.stringify({ a: ring.solidAtOneCharge, b: ring.solidAtAnother }) +
   ' — it strobed at up to 11.5Hz while KICK was held, which is what "the circle flashes" was; two draws of one frame at a fixed charge must be identical');
ok('...and the ring is actually drawn', ring.ringIsDrawn,
   'otherwise the check above passes on a build that draws no ring at all');
ok('the size dial spans a real range and clamps rubbish', ring.dialSpansARealRange && ring.clampsRubbish,
   JSON.stringify({ min: ring.mulAtMin, def: ring.mulAtDefault, max: ring.mulAtMax }));
ok('...and the ring IS the reach', ring.ringIsTheReach,
   JSON.stringify(ring.reach) + ' — a ball touching the ring has to be within kicking distance at every dial value, or the circle is not showing you where you can kick; `touchAt` is where a ball\'s edge meets the drawn ring and `furthest` is the greatest distance at which KICK connects');
ok('...so the dial moves the GAME, not just the picture', ring.dialMovesTheGame,
   'the render-only guarantee is deliberately withdrawn — the ring was a tell drawn well inside the real reach, which is exactly what "it does not show where you can kick" was reporting');

ok('a name plate goes COMPLETELY at the strongest point', labels.hidesCompletely && labels.goesToZero,
   JSON.stringify({ LABEL_DIM: labels.dim, near: labels.near, onTop: labels.onTop }));
ok('...and it is still a ramp, not a switch', labels.isARamp,
   JSON.stringify({ far: labels.farAway, mid: labels.midWay, onTop: labels.onTop }) +
   ' — plates have to thin out as they approach rather than snapping off at a line');
ok('...down to a LEGIBLE floor, then nothing', labels.snapsAtTheFloor,
   JSON.stringify({ floor: labels.floor, mid: labels.midWay, justUnder: labels.justUnderTheFloor }) +
   ' — everything the draw accepts must be readable, and everything below it exactly zero: a plate too faint to read is a smear that says a name is there without saying which');

ok('the in-match bar offers NO save', btns.noSaveOnTheMatchBar,
   JSON.stringify(btns.inMatchButtons) + ' — it comes up between a goal and the kickoff, and saving a file is not something to offer while there is a match to get back to');
ok('...the playback transport does', btns.saveOnTheTransport, JSON.stringify(btns.transportButtons));
ok('...and the result screen still has both saves', btns.resultHasBothSaves, JSON.stringify(btns.resultButtons));

ok('the save carries settings, player, record and drills', save.hasSettings && save.hasProfile && save.hasStats && save.hasDrills,
   JSON.stringify(save.carries));
ok('...as readable JSON rather than strings of strings', save.notDoubleEncoded);
ok('...and it NEVER carries the update deadline', save.skipsUpd && save.skipsAll,
   'another device\'s copy could arrive already overdue and lock the game on a build with nothing wrong with it');
ok('a round trip restores every corner of it', save.roundTrip,
   `${save.restoredCount} keys restored`);
ok('...without touching the update record on the way in', save.updUntouched);
ok('every refusal is a sentence somebody can act on', save.allRefused, JSON.stringify(save.refusals));
ok('...and an unknown key in a file is ignored', save.ignoresUnknownKeys,
   'the picker will hand us any JSON on the disk, so only keys on the list are ever written');
ok('the filename says what it is', save.filenameSaysWhatItIs, save.filename);

ok('both buttons are in the About card and pressable', ui.present && ui.pressable,
   JSON.stringify({ present: ui.present, pressable: ui.pressable, size: ui.size }));
ok('...Import ARMS before it fires', ui.armsFirst,
   'it replaces your settings, record and unlocks with somebody else\'s file and cannot be undone');
ok('...and the menu search finds it', ui.inSearch);

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ ring, labels, btns, save, ui }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL gamesave\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS gamesave');
