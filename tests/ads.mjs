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
  // ⚠️ GUARDED, because the over-correction is a real sabotage and it used to THROW here
  // rather than name itself: an `adsDrawn` that answers false everywhere — the whole
  // feature deleted, which is what the phone block's claims are paired against — returns
  // null from `adSlotRects`, and `rects.length` then takes the suite out with a stack
  // trace instead of a finding. A `FAIL`-only output filter hides that entirely.
  const rects = M.adSlotRects(w) || [];
  o.rectsOnDesktop = rects.length;
  // ...and BAIL, named, rather than indexing into an empty list for the next two hundred
  // lines. Everything below assumes there are boards on a desktop, which is the premise the
  // phone block is paired against; when it is false the honest report is that one sentence
  // plus whatever the band diffs above already said, not a stack trace from line 112.
  if (!o.rectsOnDesktop) return o;
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
  // ⚠️ READ OFF `defaultSel()`, never the literal 8 it used to be. A second copy of a
  // default is a check that has to be edited every time the thing it watches moves — and
  // it went red the moment the rollover was slowed, which is the whole of the lesson.
  o.resetRestores = M.sel.adsOn === 'on' && M.sel.adEvery === M.defaultSel().adEvery
                 && M.sel.adOff.length === 0 && M.sel.adText === '';

  // ---- the rollover clock -------------------------------------------------------
  // Reported as the boards rotating too fast. What makes it a finding rather than taste
  // is that EVERY board turns over on the same frame, so one rollover repaints the whole
  // surround — measured below — and at the old 8s a five-minute match did that 37 times.
  o.everyDefault = M.defaultSel().adEvery;
  o.everyConst = M.ADS.every;
  // ⚠️ ONE OWNER. `defaultSel().adEvery` used to be the literal 8 beside `ADS.every`'s 8 —
  // two copies of one number, which is the drift this file keeps recording (`hitStopFrames`'
  // hard-coded 0 against a default of 5). Pinned equal so it cannot happen again.
  o.everyOneOwner = o.everyDefault === o.everyConst;
  o.rolloversPer5min = Math.floor(300 / o.everyDefault);
  // ⚠️ **THE SLIDER MUST REACH EVERYTHING `adEverySecs()` WILL HONOUR.** That function has
  // always clamped to 60 and the control offered 30, so the top half of somebody's own
  // range was unreachable — a control that silently refuses a value it would accept. The
  // ceiling is DISCOVERED by pushing a huge number through, never written out here.
  const wasEvery = M.sel.adEvery;
  // ⚠️ The floor has to be probed with a small POSITIVE value. `-1` fails `adEverySecs`'
  // `isFinite(v) && v > 0` gate and falls back to `ADS.every`, so it reads 20 and the check
  // below then compares the slider's minimum against the DEFAULT — which is a probe bug
  // that reports a perfectly good control as offering too little.
  M.sel.adEvery = 9999; o.clampCeiling = M.adEverySecs();
  M.sel.adEvery = 0.5;  o.clampFloor = M.adEverySecs();
  const sl = document.querySelector('#feelSlidersAds input[type=range]');
  o.sliderMax = sl ? +sl.max : null; o.sliderMin = sl ? +sl.min : null;
  M.sel.adEvery = o.sliderMax; o.maxHonoured = M.adEverySecs() === o.sliderMax;
  o.sliderCoversRange = o.sliderMax === o.clampCeiling;
  M.sel.adEvery = wasEvery;

  // ---- one rollover repaints the whole surround (the number behind the ask) -------
  M.sel.adsOn = 'on'; M.sel.adEvery = M.defaultSel().adEvery; M.sel.scoreStyle = 'num';
  M.setMatchSeed(31); M.startMatch();
  const rw = M.world; rw.state = 'play'; rw.stateT = 2;
  for (const q of rw.players){ q.x = 0; q.y = 0; q.vx = q.vy = 0; q.ctrl = 'none'; }
  rw.ball.x = 0; rw.ball.y = 0; rw.ball.vx = rw.ball.vy = 0;
  M.juiceReset();
  const shot = () => { M.computeCam(); M.render(); return c2.getImageData(0, 0, cv.width, cv.height).data; };
  const px = (A, B) => { let n = 0; for (let i = 0; i < A.length; i += 4)
    if (Math.abs(A[i]-B[i]) + Math.abs(A[i+1]-B[i+1]) + Math.abs(A[i+2]-B[i+2]) > 24) n++; return n; };
  M.adState.t = 0; const f0 = shot();
  M.adState.t = M.adEverySecs(); const f1 = shot();
  o.rolloverPx = px(f0, f1);
  o.framePx = (cv.width * cv.height);
  o.boardsOnScreen = (M.adSlotRects(rw) || []).length;
  return o;
});

// ---- NOT ON A PHONE ------------------------------------------------------------
// Asked for as "disable them for mobile", and the reason is a measurement: a board's text
// starts at `depth * 0.52` of the DRAWN depth, so it shrinks with `cam.s`. On a 390×844
// handset the slot is 92.3 × 15px and the words fit at 6.1–7.8px against a desktop's
// 12.6–16.1; turned sideways the slot is 45.5 × 7.4 and the starting size is 3.85, under
// `ADS.minPx`, so `paintAdBoard` returns before `fillText` and every board is a blank
// coloured rectangle. All of it costing 4.44% of pitch scale.
//
// ⚠️ **THE CONTROL IS THE DESKTOP PAGE ABOVE, IN THE SAME RUN.** "No boards on a phone" is
// equally true of a build that paints none anywhere — the whole feature deleted — so a
// sabotage of `adsDrawn` that always answers false reddens the desktop blocks instead.
//
// ⚠️ **AND THE PANE IS A SEPARATE CHANGE, sabotaged separately.** A build that stands the
// boards down and leaves the controls pressable is the dead control this repo refuses; one
// that hides the controls and still paints boards is worse. Neither check sees the other's
// defect. The pane and its CHIP stay either way — an empty tab behind a chip is worse than
// both, so a sentence takes the controls' place.
const mp = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
                             hasTouch: true, isMobile: true });
mp.on('pageerror', e => errors.push('phone: ' + e.message));
mp.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push('phone: ' + m.text()); });
await mp.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
await mp.goto('file://' + process.cwd() + '/index.html');
await mp.waitForTimeout(800);

const ph = await mp.evaluate(() => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const cv = document.getElementById('game'), c2 = cv.getContext('2d');
  o.viewMode = M.viewMode();
  // The pane, read at boot with nothing called by hand — the wiring, not the helper.
  const row = document.getElementById('adsRow'), note = document.getElementById('adsPhoneNote');
  o.controlsHidden = !!row && getComputedStyle(row).display === 'none';
  o.noteShown = !!note && getComputedStyle(note).display !== 'none';
  o.offered = M.adsOffered();
  // ⚠️ `display !== 'none'` IS NOT ENOUGH FOR THE NOTE, because `buildHintToggles` walks
  // every `.hint` and folds it behind an info toggle on its label — a folded one is still
  // `display: block` with no height, so the check would pass on a pane that says nothing.
  // Open the pane for real and measure what is on the screen. (Measured: 115 x 312px.)
  M.openSection('feel'); if (M.showSubTab) M.showSubTab('feel', 'ads');
  const nb = note ? note.getBoundingClientRect() : { height: 0, width: 0 };
  o.noteHeight = Math.round(nb.height); o.noteWidth = Math.round(nb.width);
  o.noteReadable = o.noteHeight > 20 && o.noteWidth > 100;
  o.controlsStillHidden = !!row && row.getBoundingClientRect().height === 0;
  // ...and the chip and the pane are still THERE, or a tab vanished from the card.
  o.chipExists = [...document.querySelectorAll('.subtabs[data-tabs="feel"] .subchip')]
                   .some(c => c.dataset.pane === 'ads');

  M.sel.look.palette = 'grass'; M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.juice = false;
  M.sel.length = '5'; M.sel.field = 'classic'; M.sel.adsOn = 'on'; M.sel.scoreStyle = 'num';
  M.setMatchSeed(31); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  for (const q of w.players){ q.x = 0; q.y = 0; q.vx = q.vy = 0; q.ctrl = 'none'; }
  w.ball.x = 0; w.ball.y = 0; w.ball.vx = w.ball.vy = 0;
  M.juiceReset(); M.computeCam();
  o.adsDrawn = M.adsDrawn(w);
  o.rects = (M.adSlotRects(w) || []).length;
  o.reach = M.adReach(w);
  // Nothing is painted ANYWHERE: the whole frame, not a band — with the rows stood down
  // there is no band to aim at, and a whole-frame diff cannot miss a board drawn somewhere
  // a band probe was not looking.
  const shot = () => { M.computeCam(); M.render(); return c2.getImageData(0, 0, cv.width, cv.height).data; };
  const px = (A, B) => { let n = 0; for (let i = 0; i < A.length; i += 4)
    if (Math.abs(A[i]-B[i]) + Math.abs(A[i+1]-B[i+1]) + Math.abs(A[i+2]-B[i+2]) > 24) n++; return n; };
  M.sel.adsOn = 'off'; M.computeCam(); const camOff = M.cam.s; const off = shot();
  M.sel.adsOn = 'on';  M.computeCam(); const camOn  = M.cam.s; const on  = shot();
  o.frameUnchanged = px(on, off);
  o.camOff = +camOff.toFixed(4); o.camOn = +camOn.toFixed(4);
  // ...and the pitch scale the rows used to cost is GIVEN BACK, not merely unchanged: the
  // number to beat is what the same phone measured with the rows up (0.627 against 0.6561).
  o.scaleBack = camOn === camOff;
  return o;
});
await mp.close();

// ---- A DEVICE STILL ON THE EIGHT-SECOND ROLLOVER IS MOVED ON, ONCE ---------------
// `magnetball.adfold`. A factory default only ever meets a fresh install, so without this
// the change reaches nobody who has ever opened the menu — which includes the person who
// reported it. Three cases, the `zoomfold` set: it fires on the old value, it leaves a
// DELIBERATE value alone, and it is one-shot.
const foldCase = async (sel, stamp) => {
  const c = await b.newContext();
  const fp = await c.newPage();
  fp.on('pageerror', e => errors.push('fold: ' + e.message));
  await fp.addInitScript(([s, st]) => {
    window.__MAGNETDEBUG = true;
    localStorage.clear();
    localStorage.setItem('magnetball.sel', s);
    if (st) localStorage.setItem('magnetball.adfold', '1');
  }, [JSON.stringify(sel), stamp]);
  await fp.goto('file://' + process.cwd() + '/index.html');
  await fp.waitForTimeout(700);
  const got = await fp.evaluate(() => ({
    every: window.__magnet.sel.adEvery,
    stamped: !!localStorage.getItem('magnetball.adfold'),
  }));
  await c.close();
  return got;
};
const fold = {
  old:        await foldCase({ adEvery: 8 },  false),   // the old default → moves
  deliberate: await foldCase({ adEvery: 9 },  false),   // somebody's own number → left
  already:    await foldCase({ adEvery: 8 },  true),    // stamped → never again
};

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

// the rollover clock
ok(r.everyOneOwner,
   `the shipped rollover and ADS.every are two different numbers (${r.everyDefault} vs ` +
   `${r.everyConst}) — one owner, or they drift the way hitStopFrames' fallback did`);
ok(r.sliderCoversRange && r.maxHonoured,
   `the Ads-change-every slider tops out at ${r.sliderMax}s while adEverySecs() honours up ` +
   `to ${r.clampCeiling}s — the control refuses a value the code would take`);
ok(r.sliderMin >= r.clampFloor,
   `the slider offers ${r.sliderMin}s, below the ${r.clampFloor}s floor adEverySecs() clamps to`);
// ⚠️ NOT a bar on taste. What is pinned is that ONE rollover repaints most of the surround,
// which is what makes the interval the thing worth slowing — and the interval is then read
// back as rollovers per five-minute match so the number is in the output rather than in a
// comment somebody has to trust. 8s was 37 of these a match; 20s is 15.
ok(r.rolloverPx > r.framePx * 0.02,
   `one rollover changed only ${r.rolloverPx} of ${r.framePx} pixels — if the boards barely ` +
   `move the picture, the interval is not what anybody is reacting to and this check is wrong`);
ok(r.boardsOnScreen >= 8 && r.rolloversPer5min <= 20,
   `${r.boardsOnScreen} boards all turn over together ${r.rolloversPer5min} times in a ` +
   `five-minute match at the shipped ${r.everyDefault}s`);

// not on a phone, each claim paired with the desktop page above
ok(ph.viewMode === 'mobile', `the phone context is not a phone layout (${ph.viewMode}) — the rest is vacuous`);
ok(!ph.adsDrawn && ph.rects === 0,
   `hoardings are still drawn on a phone (${ph.rects} boards), where a board's words fit at ` +
   `6.1–7.8px against ${r.boardsOnScreen ? '12.6–16.1px' : '—'} on a desktop`);
ok(ph.frameUnchanged === 0,
   `${ph.frameUnchanged} pixels differ between ads on and off on a phone — something is still painted`);
ok(ph.reach === 0 && ph.scaleBack,
   `the phone still pays for rows it does not draw: reach ${ph.reach}, camera ${ph.camOff} → ${ph.camOn}`);
ok(ph.controlsHidden && !ph.offered && ph.controlsStillHidden,
   `the Ads controls are still on the menu on a phone (${ph.controlsStillHidden ? '' : 'the row renders ' })— ` +
   `a tile that sets a value nothing acts on is a dead control`);
ok(ph.noteReadable,
   `the phone note is ${ph.noteHeight}x${ph.noteWidth}px with the pane open — a hint folded ` +
   `behind an info toggle is still display:block, so the pane would say nothing`);
ok(ph.noteShown && ph.chipExists,
   `the Ads pane on a phone says nothing (note ${ph.noteShown}) or lost its chip ` +
   `(${ph.chipExists}) — relabel rather than hide, or somebody hunts for a setting that vanished`);
// The other half of both pairings: a desktop must still HAVE the boards and the controls,
// or "hidden on a phone" is satisfied by a build that hid them everywhere.
ok(r.rectsOnDesktop > 0 && r.fourRows && r.paneShown && r.sliderInPane,
   `the boards or their controls are gone on a desktop too (${r.rectsOnDesktop} boards) — ` +
   `"none on a phone" must not be satisfied by the feature being deleted`);

// the fold
ok(fold.old.every === r.everyDefault && fold.old.stamped,
   `a device on the old 8s rollover was not moved on: ${fold.old.every}s, stamped ${fold.old.stamped}`);
ok(fold.deliberate.every === 9,
   `the fold overwrote a rollover somebody chose (9s → ${fold.deliberate.every}s)`);
ok(fold.already.every === 8,
   `the fold ran twice — a stamped device was moved from 8s to ${fold.already.every}s, so ` +
   `setting it back by hand would be undone every morning`);

ok(errors.length === 0, 'console errors: ' + errors.slice(0, 3).join(' | '));

console.log(JSON.stringify(r, null, 1));
console.log('PHONE:', JSON.stringify(ph, null, 1));
console.log('FOLD:', JSON.stringify(fold));
console.log('ROLLOVER: ' + r.boardsOnScreen + ' boards turn over together every ' + r.everyDefault +
  's (' + r.rolloversPer5min + ' times in a five-minute match), repainting ' + r.rolloverPx +
  ' of ' + r.framePx + ' pixels each time.');
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nads OK');
