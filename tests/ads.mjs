// PITCH-SIDE ADS — hoardings along both touchlines, outside the line, rolling over on a
// clock, with a tab of their own under Game Feel.
//
// ⚠️ EVERY PIXEL READING HERE IS A DIFFERENCE AGAINST THE SAME FRAME WITH THE ADS OFF —
// the rule this file's pitch checks all follow. A band outside a touchline is surround,
// and a surround is not one flat colour on every theme, so an absolute ink count is either
// vacuous or impossible depending on the palette. Two renders of one frame differ by the
// boards or by nothing.
//
// ⚠️ RENDER ONLY IS THE LOAD-BEARING CLAIM, and it is measured the determinism way: the
// whole world hashed over 900 steps with the boards on and off has to come out identical,
// or a pinned seed stops reproducing a match depending on a cosmetic switch.
//
// ⚠️ THE BOARDS' WORDS ARE READ OFF `fillText`, never off the table. "The three named boards
// are in `AD_BOARDS`" is true of a build that never paints one; what is claimed is that a
// full rotation puts each of them on the pitch, and that a board switched off never is.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [];
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(async () => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const cv = document.getElementById('game'), c2 = cv.getContext('2d');
  const DPR = cv.width / cv.clientWidth;

  // ---- 1) shipped defaults, and the three that were asked for by name ----------
  const d = M.defaultSel();
  o.defaults = { on: d.adsOn, every: d.adEvery, off: d.adOff, text: d.adText };
  o.shippedOn = d.adsOn === 'on' && Array.isArray(d.adOff) && d.adOff.length === 0 && d.adText === '';
  const texts = M.AD_BOARDS.map(a => a.text);
  o.namedThree = ['exit 3A the game', 'potion and pixels', 'The Charlotte Newspaper'].every(t => texts.includes(t));
  o.boardCount = M.AD_BOARDS.length;
  o.keysDistinct = new Set(M.AD_BOARDS.map(a => a.key)).size === M.AD_BOARDS.length;
  o.allInRotationByDefault = M.adList().length === M.AD_BOARDS.length;

  // ---- 2) render-only: the world cannot see the boards -------------------------
  const hashWorld = (w) => { let h = 0; const s = JSON.stringify([w.ball.x, w.ball.y, w.ball.vx, w.ball.vy,
      w.players.map(q => [q.x, q.y, q.vx, q.vy, q.aiState])]); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  const runHash = (on) => { M.sel.adsOn = on ? 'on' : 'off'; M.setMatchSeed(31); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 1;
    for (let i = 0; i < 900; i++){ M.step(w); M.advanceAds(w); if (i % 30 === 0) M.render(); }
    return hashWorld(w); };
  o.hashOn = runHash(true); o.hashOff = runHash(false);
  o.renderOnly = o.hashOn === o.hashOff;
  M.sel.adsOn = 'on';

  // ---- 3) pixels: ink OUTSIDE the touchlines, none ON the court ------------------
  M.setMatchSeed(31); M.startMatch(); const w = M.world; w.state = 'play'; w.stateT = 1;
  for (let i = 0; i < 20; i++) M.step(w);
  M.render();
  const bd = w.bounds;
  const boxOf = (pts) => { const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const L = Math.max(0, Math.floor(Math.min(...xs))), T = Math.max(0, Math.floor(Math.min(...ys)));
    const R = Math.min(cv.clientWidth, Math.ceil(Math.max(...xs))), B = Math.min(cv.clientHeight, Math.ceil(Math.max(...ys)));
    return { L, T, W: Math.max(1, R - L), H: Math.max(1, B - T) }; };
  const grab = (bx) => c2.getImageData(Math.round(bx.L * DPR), Math.round(bx.T * DPR), Math.max(1, Math.round(bx.W * DPR)), Math.max(1, Math.round(bx.H * DPR))).data;
  const diffCount = (a, b2) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b2[i] || a[i+1] !== b2[i+1] || a[i+2] !== b2[i+2]) n++; return n; };
  const band = (side) => boxOf([
    M.screenPt(M.wx(side * (bd.halfW + M.ADS.gap)), M.wy(-bd.halfL)),
    M.screenPt(M.wx(side * (bd.halfW + M.ADS.gap + M.ADS.depth)), M.wy(bd.halfL)),
    M.screenPt(M.wx(side * (bd.halfW + M.ADS.gap)), M.wy(bd.halfL)),
    M.screenPt(M.wx(side * (bd.halfW + M.ADS.gap + M.ADS.depth)), M.wy(-bd.halfL)) ]);
  // ...and behind each goal: the row stands beyond the BACK of the net.
  const endBand = (side) => { const y0 = side * (bd.halfL + bd.net + M.ADS.gap), y1 = side * (bd.halfL + bd.net + M.ADS.gap + M.ADS.depth);
    return boxOf([ M.screenPt(M.wx(-bd.halfW), M.wy(y0)), M.screenPt(M.wx(bd.halfW), M.wy(y1)),
                   M.screenPt(M.wx(-bd.halfW), M.wy(y1)), M.screenPt(M.wx(bd.halfW), M.wy(y0)) ]); };
  // The net pocket itself, between the goal line and the end row: nothing may land there.
  const pocket = (side) => { const y0 = side * (bd.halfL + 2), y1 = side * (bd.halfL + bd.net - 2), x = bd.gh * 0.9;
    return boxOf([ M.screenPt(M.wx(-x), M.wy(y0)), M.screenPt(M.wx(x), M.wy(y1)), M.screenPt(M.wx(-x), M.wy(y1)), M.screenPt(M.wx(x), M.wy(y0)) ]); };
  const court = boxOf([
    M.screenPt(M.wx(-bd.halfW * 0.92), M.wy(-bd.halfL * 0.92)), M.screenPt(M.wx(bd.halfW * 0.92), M.wy(bd.halfL * 0.92)),
    M.screenPt(M.wx(-bd.halfW * 0.92), M.wy(bd.halfL * 0.92)), M.screenPt(M.wx(bd.halfW * 0.92), M.wy(-bd.halfL * 0.92)) ]);
  const snap = () => ({ l: grab(band(-1)), r: grab(band(1)), c: grab(court), t: grab(endBand(-1)), b: grab(endBand(1)), pt: grab(pocket(-1)), pb: grab(pocket(1)) });
  // ⚠️ Two renders of ONE frame with nothing changed must be identical — that is the
  // control that says the difference below is the boards and not the renderer.
  const a1 = snap(); M.render(); const a2 = snap();
  o.sameFrameStable = diffCount(a1.l, a2.l) === 0 && diffCount(a1.c, a2.c) === 0 && diffCount(a1.t, a2.t) === 0;
  // ⚠️ THE CONTROL IS THE SAME CAMERA WITH EVERY BOARD STOOD DOWN — never `adsOn = 'off'`,
  // because the camera HOLDS the rows and switching them off refits the frame, so every
  // pixel on the pitch moves and the court reads 88,782 changed on a perfectly good build.
  // An empty rotation draws nothing and reserves exactly the same frame.
  const standDown = (fn) => { const keep = [M.sel.adOff, M.sel.adText]; M.sel.adOff = M.AD_BOARDS.map(a => a.key); M.sel.adText = '';
    M.render(); const out = fn(); M.sel.adOff = keep[0]; M.sel.adText = keep[1]; M.render(); return out; };
  const off = standDown(snap);
  o.leftBandDiff = diffCount(a1.l, off.l); o.rightBandDiff = diffCount(a1.r, off.r);
  o.leftBandPx = a1.l.length / 4;
  o.inkOutsideBothTouchlines = o.leftBandDiff > o.leftBandPx * 0.25 && o.rightBandDiff > o.leftBandPx * 0.25;
  o.topEndDiff = diffCount(a1.t, off.t); o.botEndDiff = diffCount(a1.b, off.b); o.endBandPx = a1.t.length / 4;
  o.inkBehindBothGoals = o.topEndDiff > o.endBandPx * 0.25 && o.botEndDiff > o.endBandPx * 0.25;
  o.pocketDiff = diffCount(a1.pt, off.pt) + diffCount(a1.pb, off.pb);
  o.nothingInTheNet = o.pocketDiff === 0;
  o.courtDiff = diffCount(a1.c, off.c);
  o.nothingOnTheCourt = o.courtDiff === 0;
  // The gap: a body standing 20 out (the bench ring, and a player's step past the line)
  // does not reach the near edge of a board when it is stood beside it — the row is
  // "spaced out of the field" by more than the 10 it shipped at.
  o.gap = M.ADS.gap;
  o.rowsClearTheLine = M.ADS.gap >= 20;

  // ---- 3b) the frame HOLDS the rows: every board's four corners are on screen -----
  const rects = M.adSlotRects(w);
  const corners = (rc) => { const hx = (rc.along === 'y' ? rc.depth : rc.len) / 2, hy = (rc.along === 'y' ? rc.len : rc.depth) / 2;
    return [[-hx,-hy],[hx,-hy],[-hx,hy],[hx,hy]].map(([dx,dy]) => M.screenPt(M.wx(rc.x + dx), M.wy(rc.y + dy))); };
  o.rowCount = rects.length; o.fourRows = new Set(rects.map(rc => rc.id.split(':')[0])).size === 4;
  o.offScreen = rects.filter(rc => corners(rc).some(([x, y]) => x < 0 || y < 0 || x > cv.clientWidth || y > cv.clientHeight)).map(rc => rc.id);
  o.everyBoardOnScreen = o.offScreen.length === 0;
  // ...and what holding them costs, as a ratio against the same camera with the ads off —
  // the switch is what gives it back, so the control has to be measured in the same run.
  M.sel.adsOn = 'off'; M.computeCam(); const sOff = M.cam.s; M.sel.adsOn = 'on'; M.computeCam(); M.render();
  o.camCost = 1 - M.cam.s / sOff;
  o.frameGrowsForTheRows = M.cam.s < sOff && o.camCost < 0.08;
  // ...and every board's words read left-to-right or top-to-bottom on SCREEN, never
  // upside down or bottom-to-top, whichever way the pitch is turned.
  const norm = (a) => ((a % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI);
  o.readAngles = [...new Set(rects.map(rc => norm(M.adReadAngle(rc.along === 'y' ? Math.PI/2 : 0) + M.cam.rot).toFixed(3)))];
  o.wordsReadable = o.readAngles.every(a => Math.abs(+a) < 1e-3 || Math.abs(+a - Math.PI/2) < 1e-3);

  // ---- 3c) a body standing over a board DIMS it -------------------------------------
  // The body is parked at the START of a touchline slot and the FAR HALF of that slot is
  // sampled, so the body's own pixels are never in the reading: what changes there is the
  // board and nothing else. Eased in `advanceAds`, so it is run to rest before each frame.
  const slot = rects.find(rc => rc.id === 's1:0');
  const q = w.players[0], qx0 = q.x, qy0 = q.y;
  const park = (x, y) => { q.x = x; q.y = y; q._px = x; q._py = y; for (let i = 0; i < 90; i++) M.advanceAds(w); };
  const farHalf = boxOf([ M.screenPt(M.wx(slot.x - slot.depth/2), M.wy(slot.y + 2)), M.screenPt(M.wx(slot.x + slot.depth/2), M.wy(slot.y + slot.len/2 - 2)),
                          M.screenPt(M.wx(slot.x - slot.depth/2), M.wy(slot.y + slot.len/2 - 2)), M.screenPt(M.wx(slot.x + slot.depth/2), M.wy(slot.y + 2)) ]);
  const sumDiff = (a, b2) => { let n = 0; for (let i = 0; i < a.length; i += 4) n += Math.abs(a[i]-b2[i]) + Math.abs(a[i+1]-b2[i+1]) + Math.abs(a[i+2]-b2[i+2]); return n; };
  park(slot.x, slot.y - slot.len/2 + q.r);            // standing on the board's near end
  o.dimAfterEase = M.adState.dim.get(slot.id);
  M.render(); const overF = grab(farHalf);
  park(0, 0);                                          // nowhere near it
  o.dimRestored = M.adState.dim.get(slot.id);
  M.render(); const clearF = grab(farHalf);
  const noneF = standDown(() => grab(farHalf));
  o.boardVsSurround = sumDiff(clearF, noneF); o.dimmedVsSurround = sumDiff(overF, noneF);
  o.boardIsThere = o.boardVsSurround > farHalf.W * farHalf.H * 30;
  o.dimmedBoardFades = o.dimmedVsSurround < o.boardVsSurround * 0.45;
  o.dimSettles = Math.abs(o.dimAfterEase - M.ADS.dimA) < 1e-6 && o.dimRestored === 1;
  // ...and it EASES rather than snapping: one step over the board is between the two.
  q.x = slot.x; q.y = slot.y - slot.len/2 + q.r; M.advanceAds(w);
  o.dimOneStep = M.adState.dim.get(slot.id);
  o.dimEases = o.dimOneStep < 1 && o.dimOneStep > M.ADS.dimA;
  park(qx0, qy0);

  // ---- 4) the rollover: same picture inside a period, a different one across it ---
  M.adState.t = 0; M.render(); const t0 = snap();
  M.adState.t = M.adEverySecs() * 0.5; M.render(); const tHalf = snap();
  M.adState.t = M.adEverySecs() * 1.01; M.render(); const tNext = snap();
  o.holdsWithinPeriod = diffCount(t0.l, tHalf.l) === 0;
  o.rollsAcrossPeriod = diffCount(t0.l, tNext.l) > o.leftBandPx * 0.1;
  // ...and the clock is the setting: a slower rollover has NOT rolled at the old period.
  M.sel.adEvery = 20; M.adState.t = 0; M.render(); const s0 = snap();
  M.adState.t = 8.5; M.render(); const s8 = snap();
  o.sliderSetsTheClock = diffCount(s0.l, s8.l) === 0 && M.adEverySecs() === 20;
  M.sel.adEvery = 8;

  // ---- 5) the WORDS: read off fillText across one full rotation -----------------
  const seen = new Set();
  const proto = CanvasRenderingContext2D.prototype, orig = proto.fillText;
  proto.fillText = function(t, ...a){ seen.add(String(t)); return orig.call(this, t, ...a); };
  const sweep = () => { seen.clear(); for (let i = 0; i < M.adList().length; i++){ M.adState.t = i * M.adEverySecs() + 0.1; M.render(); } };
  try {
    sweep();
    o.namedThreePainted = ['exit 3A the game', 'potion and pixels', 'The Charlotte Newspaper'].every(t => seen.has(t));
    o.everyBoardPainted = M.AD_BOARDS.every(a => seen.has(a.text));
    // switch one out: its words never land; the rest still do
    M.sel.adOff = ['kestrel']; sweep();
    o.switchedOffGone = !seen.has('Kestrel Air') && seen.has('exit 3A the game');
    M.sel.adOff = [];
    // your own line joins the rotation
    M.sel.adText = '  Hello   from  the   suite  '; sweep();
    o.customPainted = seen.has('Hello from the suite');
    o.customTrimmed = M.adCustomText() === 'Hello from the suite';
    M.sel.adText = '';
    // switched off entirely: not a word
    M.sel.adsOn = 'off'; sweep();
    o.offPaintsNothing = M.AD_BOARDS.every(a => !seen.has(a.text));
    M.sel.adsOn = 'on';
    // ⚠️ WARM-UP: the keyboard, the shirts and the flags occupy the strip the boards use.
    M.sel.controllers = 'on'; M.applyDisplayMode();
    window.__pads = [{ axes:[0,0,0,0], buttons:new Array(17).fill(false) }];
    navigator.getGamepads = () => window.__pads.map((pd, i) => ({ index:i, connected:true, id:'f'+i, mapping:'standard', axes:pd.axes, buttons: pd.buttons.map(v => ({ pressed:!!v, value:v?1:0 })) }));
    M.setMatchSeed(31); M.startMatch();
    o.warmupState = M.world.state;
    seen.clear(); M.adState.t = 0.1; M.render();
    o.noBoardsInWarmup = M.world.state === 'warmup' && M.AD_BOARDS.every(a => !seen.has(a.text));
    navigator.getGamepads = () => []; M.sel.controllers = 'off';
    // ...nor in a drill, which paints its own box
    M.startDrill('straight_up'); seen.clear(); M.render();
    o.noBoardsInDrill = M.world.drillMode === true && M.AD_BOARDS.every(a => !seen.has(a.text));
  } finally { proto.fillText = orig; }

  // ---- 6) slots are derived from the court, never stretched ---------------------
  const shortL = Math.min(...Object.values(M.FIELDS).map(f => f.L)), longL = Math.max(...Object.values(M.FIELDS).map(f => f.L));
  o.slotsShort = M.adSlots(shortL); o.slotsLong = M.adSlots(longL);
  o.slotsFollowTheCourt = o.slotsLong.n > o.slotsShort.n &&
    Math.abs(o.slotsLong.len - o.slotsShort.len) < M.ADS.slotLen * 0.6;

  // ---- 7) the tab, driven the way a person drives it ------------------------------
  M.toMenu(); M.openSection('feel'); M.showSubTab('options', 'feel'); M.showSubTab('feel', 'ads');
  const chip = document.querySelector('.subtabs[data-tabs="feel"] .subchip[data-pane="ads"]');
  o.chipExists = !!chip; o.chipHasMark = !!(chip && chip.querySelector('svg'));
  const pane = document.querySelector('.subpane[data-group="feel"][data-pane="ads"]');
  o.paneShown = !!pane && getComputedStyle(pane).display !== 'none';
  o.sliderInPane = !!pane && pane.querySelectorAll('#feelSlidersAds input').length === 1;
  o.tiles = document.querySelectorAll('#adBoards .opt').length;
  o.tileCountMatches = o.tiles === M.AD_BOARDS.length;
  o.tilesLitByDefault = [...document.querySelectorAll('#adBoards .opt')].every(t => t.classList.contains('sel'));
  o.tilesPainted = [...document.querySelectorAll('#adBoards .opt')].every(t => !!t.querySelector('canvas'));
  // press a tile at its CENTRE, hit-tested — `.click()` does no hit testing
  const tile = document.querySelectorAll('#adBoards .opt')[3]; tile.scrollIntoView({ block: 'center' });
  const rc = tile.getBoundingClientRect(); const hit = document.elementFromPoint(rc.left + rc.width/2, rc.top + rc.height/2);
  o.tileReachable = !!hit && (hit === tile || tile.contains(hit));
  (hit === tile || tile.contains(hit) ? hit : tile).click();
  o.tileToggledOff = Array.isArray(M.sel.adOff) && M.sel.adOff.includes(M.AD_BOARDS[3].key) && M.adList().length === M.AD_BOARDS.length - 1;
  o.tileUnlit = !document.querySelectorAll('#adBoards .opt')[3].classList.contains('sel');
  document.querySelectorAll('#adBoards .opt')[3].click();
  o.tileToggledBack = M.sel.adOff.length === 0;
  o.countReadout = (document.getElementById('adCount') || {}).textContent || '';
  // type your own board through the real input
  const inp = document.getElementById('adText'); inp.value = 'Hello Charlotte'; inp.dispatchEvent(new Event('input', { bubbles: true }));
  o.typedStored = M.sel.adText === 'Hello Charlotte' && M.adList().some(a => a.key === 'custom' && a.text === 'Hello Charlotte');
  o.typedSaved = (() => { try { return JSON.parse(localStorage.getItem('magnetball.sel') || '{}').adText === 'Hello Charlotte'; } catch { return false; } })();
  // the switch through its own tiles
  const offTile = [...document.querySelectorAll('#adsPick .opt')].find(t => /off/i.test(t.textContent));
  offTile && offTile.click();
  o.switchOff = M.sel.adsOn === 'off' && !M.adsOn();
  // ↺ puts the shipped set back
  document.getElementById('feelReset').click();
  o.resetRestores = M.sel.adsOn === 'on' && M.sel.adEvery === 8 && M.sel.adOff.length === 0 && M.sel.adText === '';
  return o;
});

const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };
ok(r.shippedOn, `ads ship ON with every board in and no custom line: ${JSON.stringify(r.defaults)}`);
ok(r.namedThree, 'the three boards asked for by name are not all in AD_BOARDS');
ok(r.keysDistinct && r.boardCount >= 10, `board keys collide or the list is thin (${r.boardCount})`);
ok(r.allInRotationByDefault, 'a shipped board is out of the rotation by default');
ok(r.renderOnly, `the boards reach the SIM: world hash ${r.hashOn} with ads against ${r.hashOff} without — a pinned seed no longer reproduces`);
ok(r.sameFrameStable, 'two renders of one frame differ with nothing changed — the control is broken, so no diff below means anything');
ok(r.inkOutsideBothTouchlines, `no boards outside the touchlines: left ${r.leftBandDiff}, right ${r.rightBandDiff} of ${r.leftBandPx}px differ against ads off`);
ok(r.nothingOnTheCourt, `${r.courtDiff} court pixels changed with the ads on — a board on the pitch is a decoy`);
ok(r.inkBehindBothGoals, `no boards behind the goals: top ${r.topEndDiff}, bottom ${r.botEndDiff} of ${r.endBandPx}px differ against ads off`);
ok(r.nothingInTheNet, `${r.pocketDiff} net-pocket pixels changed with the ads on — the end row must stand beyond the net's back, never across the mouth`);
ok(r.rowsClearTheLine, `the rows sit ${r.gap} units off the line — a body stands 20 out, so they are not spaced out of the field`);
ok(r.fourRows && r.everyBoardOnScreen, `boards off the screen on a 1280×900 desktop: ${JSON.stringify(r.offScreen)} (rows ${r.rowCount})`);
ok(r.frameGrowsForTheRows, `the camera does not hold the rows, or holding them costs too much: ${(r.camCost*100).toFixed(1)}% of pitch scale`);
ok(r.wordsReadable, `a row's words read backwards on screen: angles ${JSON.stringify(r.readAngles)}`);
ok(r.boardIsThere, `control: the sampled slot shows no board at all (${r.boardVsSurround})`);
ok(r.dimmedBoardFades, `a body standing over a board does not dim it: ${r.dimmedVsSurround} against ${r.boardVsSurround} with nobody there`);
ok(r.dimSettles && r.dimEases, `the dim does not ease and settle: one step ${r.dimOneStep}, settled ${r.dimAfterEase}, restored ${r.dimRestored}`);
ok(r.holdsWithinPeriod, 'the boards changed before the rollover was due');
ok(r.rollsAcrossPeriod, 'the boards did not roll over after a period — "different things" means the picture has to change');
ok(r.sliderSetsTheClock, 'the Ads-change-every slider does not set the rollover clock');
ok(r.namedThreePainted, 'a full rotation never painted all three named boards');
ok(r.everyBoardPainted, 'a full rotation left a board unpainted');
ok(r.switchedOffGone, 'a board switched off in the picker still reached the pitch, or switching one off took the others');
ok(r.customPainted && r.customTrimmed, `your own line did not reach the pitch, or was not tidied: ${JSON.stringify(r.customTrimmed)}`);
ok(r.offPaintsNothing, 'ads OFF still painted a board');
ok(r.noBoardsInWarmup, `boards painted over the warm-up room (state ${r.warmupState}) — the keyboard and shirts live in that strip`);
ok(r.noBoardsInDrill, 'boards painted in a drill');
ok(r.slotsFollowTheCourt, `slots do not follow the court: ${JSON.stringify(r.slotsShort)} vs ${JSON.stringify(r.slotsLong)}`);
ok(r.chipExists && r.chipHasMark && r.paneShown, `the Ads tab is not reachable: chip ${r.chipExists}, mark ${r.chipHasMark}, pane ${r.paneShown}`);
ok(r.sliderInPane, 'the rollover slider is not in the Ads pane');
ok(r.tileCountMatches && r.tilesLitByDefault && r.tilesPainted, `board tiles: ${r.tiles}, lit ${r.tilesLitByDefault}, painted ${r.tilesPainted}`);
ok(r.tileReachable, 'a board tile cannot be pressed at its centre');
ok(r.tileToggledOff && r.tileUnlit && r.tileToggledBack, 'pressing a board tile does not take it out of (and back into) the rotation');
ok(r.typedStored && r.typedSaved, `typing your own board did not store it: ${r.typedStored} / ${r.typedSaved}`);
ok(r.switchOff, 'the On/Off tiles do not switch the ads');
ok(r.resetRestores, '↺ did not give the shipped ads back');
ok(errors.length === 0, 'console errors: ' + errors.slice(0, 3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nads OK');
