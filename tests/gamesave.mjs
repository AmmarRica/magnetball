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

  // ⚠️ RENDER ONLY. The ring is a tell, not the reach — so winding it to the top must
  // leave the world bit-identical over a stretch of play.
  const runHash = (mul) => {
    M.sel.kickRing = mul; M.setMatchSeed(21); M.startMatch();
    const w2 = M.world; w2.state = 'play'; w2.stateT = 2;
    for (let i = 0; i < 900; i++) M.step(w2);
    return w2.players.map(q => `${q.x.toFixed(6)},${q.y.toFixed(6)}`).join('|') +
           `#${w2.ball.x.toFixed(6)},${w2.ball.y.toFixed(6)}#${w2.score.join('-')}`;
  };
  o.worldSame = runHash(M.KICKRING.min) === runHash(M.KICKRING.max);
  M.sel.kickRing = M.KICKRING.def;
  return o;
});

// ================================================= 3. the name plates ==
const labels = await p.evaluate(() => {
  const M = window.__magnet, o = {};
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
  o.farAway = fadeAt(M.LABEL_BALL.far * 2.2);
  o.midWay  = fadeAt(M.LABEL_BALL.far * 0.55);
  o.onTop   = fadeAt(0);
  o.goesToZero = o.onTop <= 0.004;
  o.isARamp = o.farAway > 0.9 && o.midWay > o.onTop && o.midWay < o.farAway;
  return o;
});

// ====================================== 4. no saving in the middle of a match ==
const btns = await p.evaluate(() => {
  const M = window.__magnet, o = {};
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
const ui = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.buildSettings(); M.openSection('about');
  const ex = document.getElementById('saveExportBtn'), im = document.getElementById('saveImportBtn');
  o.present = !!ex && !!im;
  if (!o.present) return o;
  ex.scrollIntoView({ block: 'center' });
  const r = ex.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
  o.pressable = !!hit && (hit === ex || ex.contains(hit));
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
ok('...and it is RENDER ONLY', ring.worldSame,
   'the ring is a wind-up tell, not the reach — 900 steps at the smallest and largest setting must leave the world bit-identical, or the dial is a hidden gameplay lever');

ok('a name plate goes COMPLETELY at the strongest point', labels.hidesCompletely && labels.goesToZero,
   JSON.stringify({ LABEL_DIM: labels.dim, near: labels.near, onTop: labels.onTop }));
ok('...and it is still a ramp, not a switch', labels.isARamp,
   JSON.stringify({ far: labels.farAway, mid: labels.midWay, onTop: labels.onTop }) +
   ' — plates have to thin out as they approach rather than snapping off at a line');

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
