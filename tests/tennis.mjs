// THE TENNIS PALETTE — five supplied colours on an ordinary football pitch.
//
// ⚠️ THIS SUITE EXISTS TO HOLD A LINE THAT WAS CROSSED ONCE. It shipped for one build as
// a whole tennis SET: a court's tram lines and service boxes painted over the pitch,
// racquets and nets for players, a seamed ball. What was asked for was the colours and
// the name. A theme that redraws the pitch as a different sport's court is a different
// game to read — so the claim now is the opposite of a feature, and the checks below are
// mostly checks that things are NOT there.
//
// Colours, and the one job each: #336699 the court, #339966 the surround, #fefff3 the
// lines, #993300 the clay, #c6ed2c the ball. That is the whole vocabulary, and it is what
// decides the team inks: the first three are already spoken for, so a team drawn in any
// of them is a body the same colour as something you are already tracking. Clay against
// white is what is left, and it is a lightness pair rather than a hue one.
//
// ⚠️ Pixel readings, never a look at the registry. "The palette sets a court colour" is
// true of a build that never paints it.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport: { width: 900, height: 1100 } });
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|ERR_TUNNEL/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const cv = document.getElementById('game'), c2 = cv.getContext('2d');
  const DPR = cv.width / cv.clientWidth;
  const atScreen = (sx, sy) => {
    const x = Math.max(1, Math.min(cv.width - 2, Math.round(sx * DPR)));
    const y = Math.max(1, Math.min(cv.height - 2, Math.round(sy * DPR)));
    const d = c2.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]];
  };
  const at = (wxv, wyv) => { const [sx, sy] = M.screenPt(M.wx(wxv), M.wy(wyv)); return atScreen(sx, sy); };
  const near = (a, hex, tol) => {
    const n = parseInt(hex.slice(1), 16);
    const t = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return Math.abs(a[0]-t[0]) <= tol && Math.abs(a[1]-t[1]) <= tol && Math.abs(a[2]-t[2]) <= tol;
  };

  const T = M.THEMES.tennis;
  o.exists = !!T;
  o.name = T && T.name;
  o.roles = T && {
    court: T.pitch.court, surround: T.pitch.fieldBg, line: T.pitch.line,
    ball: T.pitch.ball, spot: T.pitch.ballSpot,
    teamRed: T.pitch.teamRed, teamBlue: T.pitch.teamBlue, accent: T.ui.accent,
  };
  const FIVE = ['#336699', '#339966', '#fefff3', '#993300', '#c6ed2c'];
  o.usesAllFive = T && FIVE.every(h => JSON.stringify(T).toLowerCase().includes(h));
  o.teamsAreNotDecoys = T &&
    ![T.pitch.court, T.pitch.fieldBg, T.pitch.ball].includes(T.pitch.teamRed) &&
    ![T.pitch.court, T.pitch.fieldBg, T.pitch.ball].includes(T.pitch.teamBlue);
  // ⚠️ FLAT. Mown stripes are a grass thing and this is a painted surface, so the two
  // stripe colours are the same one — which is also what "solid colours" means here.
  o.courtIsFlat = T && T.pitch.stripeA === T.pitch.stripeB;

  // ------------------------------------------------------- a PALETTE, and nothing else --
  // ⚠️ The whole point. No field painter, no disc skin, no ball look of its own: the
  // slots fall to the defaults, which is what `bundleSlots` exists to do.
  o.slots = M.bundleSlots('tennis');
  o.isPaletteOnly = o.slots.field === 'none' && o.slots.discs === 'none' &&
                    o.slots.ball === 'classic' && o.slots.trail === 'dots' &&
                    o.slots.sfx === 'classic';
  o.noBundleRow = !M.THEME_BUNDLES || !M.THEME_BUNDLES.tennis;
  // ...and the set that was withdrawn is gone from every registry, not merely unlisted.
  // A leftover entry is a tile in the pickers offering exactly what was rejected.
  // ⚠️ Named EXACTLY, never matched by pattern. A `/tennis|court/` sweep flags `vbcourt`
  // (Videoball's) and `BALL_LOOKS.tennis`, which has been in the file all along and is
  // not this theme's — the withdrawn ball look was a DUPLICATE of it, which is its own
  // small lesson about checking the registry before adding to it.
  o.strayField = Object.keys(M.DYN_FIELDS).filter(k => k === 'tenniscourt');
  o.straySkin  = Object.keys(M.DISC_SKINS).filter(k => k === 'tennis');
  o.strayBall  = Object.keys(M.BALL_LOOKS).filter(k => k === 'seam');
  o.preexistingTennisBall = !!M.BALL_LOOKS.tennis;

  M.applyBundle('tennis');
  o.bundleReadsBack = M.currentBundle() === 'tennis';
  o.liveLook = JSON.parse(JSON.stringify(M.sel.look));

  M.sel.mode = '2v2'; M.sel.kickoffRule = 'off'; M.sel.pitch = 'normal';
  M.setMatchSeed(11); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2; M.computeCam();
  M.render();

  // ------------------------------------------------------------ court and surround --
  const hw = w.bounds.halfW, hl = w.bounds.halfL;
  o.courtPx = at(hw * 0.45, hl * 0.30);
  o.courtIsBlue = near(o.courtPx, '#336699', 14);
  const [ex, ey] = M.screenPt(M.wx(hw), M.wy(0));
  o.surroundPx = atScreen(ex + 26, ey);
  o.surroundIsGreen = near(o.surroundPx, '#339966', 16);

  // ⚠️ SOLID. Sampled at nine points spread over one half, well clear of the markings:
  // every one has to be the same colour, which is what rules out stripes, a dither, a
  // gradient or a court painted over the top.
  // ⚠️ The BODIES are taken off first, and they have to be — the first run of this read
  // [42,55,75] at one sample and called the court striped, and it was a player standing
  // there. Parking them out of the way is not an option (`integrate` clamps a body back
  // inside the bounds on the very next step, which is the trap `fourpads` and `deckstick`
  // both record); emptying the list for one render costs nothing and cannot be dragged
  // back. Restored immediately, and the match below is stepped after it.
  const bodies = w.players.slice();
  w.players = [];
  const keepBall = { x: w.ball.x, y: w.ball.y };
  w.ball.x = 0; w.ball.y = -hl * 0.8;
  M.render();
  const spread = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    spread.push(at(hw * (-0.6 + i*0.6), hl * (0.22 + j*0.2)));
  w.players = bodies; w.ball.x = keepBall.x; w.ball.y = keepBall.y;
  M.render();
  o.spread = spread;
  o.courtIsSolid = spread.every(c => near(c, '#336699', 14));

  // ⚠️ ...and the pitch still carries its OWN markings. "Solid" must not have been
  // achieved by painting over the halfway line — a football pitch is what this is.
  const [mx, my] = M.screenPt(M.wx(hw * 0.55), M.wy(0));
  let halfway = 0;
  for (let dy = -3; dy <= 3; dy++){
    const c = atScreen(mx, my + dy);
    if (near(c, '#fefff3', 40)) halfway++;
  }
  o.halfwayLine = halfway;
  o.pitchStillMarked = halfway > 0;

  // -------------------------------------------------------------------- the ball --
  // The classic football pattern, in the palette's own two inks.
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = 120;
  const bc = cvs.getContext('2d');
  bc.fillStyle = '#339966'; bc.fillRect(0, 0, 120, 120);
  M.paintBall(bc, 60, 60, 40, 0, M.sel.look.ball);
  const d = bc.getImageData(0, 0, 120, 120).data;
  let body = 0, spot = 0;
  for (let i = 0; i < d.length; i += 4){
    if (Math.abs(d[i]-198) < 26 && Math.abs(d[i+1]-237) < 26 && Math.abs(d[i+2]-44) < 26) body++;
    if (Math.abs(d[i]-51) < 30 && Math.abs(d[i+1]-102) < 30 && Math.abs(d[i+2]-153) < 30) spot++;
  }
  o.ball = { body, spot };
  o.ballIsAcid = body > 1200;
  // ⚠️ The pattern is measured as INK ON THE BALL, not as "ballSpot is set" — the Pool
  // cue ball is the write-up for a spot colour that renders invisible against its ball.
  o.patternShows = spot > 150;

  // ------------------------------------------------------------ it plays, and holds --
  let escapes = 0;
  for (let i = 0; i < 2400; i++){
    M.step(w);
    const bl = w.ball;
    if (Math.abs(bl.x) > hw + 40 || Math.abs(bl.y) > hl + w.field.net + 40) escapes++;
  }
  o.escapes = escapes; o.played = isFinite(w.ball.x);

  const hash = () => { M.render(); const dd = c2.getImageData(0,0,cv.width,cv.height).data;
    let h = 0; for (let i = 0; i < dd.length; i += 97) h = (h*31 + dd[i])|0; return h; };
  o.paintIsPure = hash() === hash();
  return o;
});
await p.close();

// -------------------------------------------------------------------- report --
ok('the Tennis theme exists and is called that', r.exists && r.name === 'Tennis', r.name);
ok('all five supplied colours are in the palette', r.usesAllFive, JSON.stringify(r.roles));
ok('neither team wears the court, the surround or the ball colour', r.teamsAreNotDecoys,
   JSON.stringify(r.roles) + ' — a body the same colour as something you are already tracking is a decoy, which is what leaves clay against white as the pair');

ok('it is a PALETTE and nothing else', r.isPaletteOnly && r.noBundleRow,
   JSON.stringify(r.slots) + ' — it shipped for one build as a whole tennis court with racquets for players, and what was asked for was the colours and the name');
ok('...and the withdrawn set is gone from every registry',
   r.strayField.length === 0 && r.straySkin.length === 0 && r.strayBall.length === 0 &&
   r.preexistingTennisBall,
   JSON.stringify({ field: r.strayField, discs: r.straySkin, ball: r.strayBall }) +
   ' — a leftover entry is a tile in the pickers offering exactly what was rejected');
ok('the bundle still names itself rather than reading as Custom', r.bundleReadsBack,
   JSON.stringify(r.liveLook));

ok('the court is #336699 and the surround #339966', r.courtIsBlue && r.surroundIsGreen,
   `court ${JSON.stringify(r.courtPx)}, surround ${JSON.stringify(r.surroundPx)}`);
ok('the court is a SOLID colour', r.courtIsSolid && r.courtIsFlat,
   JSON.stringify(r.spread) + ' — nine points across one half, all the same: no stripes, no dither, no court painted over the top');
ok('...and the pitch still has its own markings', r.pitchStillMarked,
   `${r.halfwayLine} line pixels at halfway — "solid" must not have been achieved by painting over the football pitch`);

ok('the ball is acid yellow', r.ballIsAcid, `${r.ball.body} px`);
ok('...and its pattern actually shows on it', r.patternShows,
   `${r.ball.spot} px — measured as ink on the ball, not as "ballSpot is set": the Pool cue ball is the write-up for a spot that renders invisible`);

ok('the ball never leaves the pitch', r.escapes === 0, `${r.escapes} escapes over 2400 steps`);
ok('a match plays out on it', r.played);
ok('nothing advances in a draw', r.paintIsPure,
   'two renders with no step between them must be identical — the trails rule');

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL tennis\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS tennis');
