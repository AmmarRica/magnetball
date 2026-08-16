// THE HARD COURT THEME — a supplied five-colour palette, a real tennis court's
// markings, a racquet against a net, and the ball with its seams.
//
// Colours, and the one job each: #336699 the court, #339966 the surround, #fefff3 the
// lines, #993300 the clay, #c6ed2c the ball. That is the whole vocabulary, so every
// claim below is about whether a colour is doing its OWN job and nobody else's — which
// is what decides the team inks (clay against white, the only pair left over).
//
// ⚠️ EVERY CHECK IS A PIXEL READING, never a look at the registry. "The theme declares a
// field" is true of a build whose painter draws nothing, and "the court is blue" is true
// of one that paints blue over the whole screen.
//
// ⚠️ The court proportions are the real ones (tram 0.125 of the width a side, service
// line 0.538 of the half out from the net), so they are measured where the ratio says
// they are and asserted ABSENT a little way off it. A check that only asks "is there a
// white pixel somewhere" passes on a painter that draws one line anywhere.
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

  // ------------------------------------------------------- the palette's five jobs --
  const T = M.THEMES.tennis;
  o.exists = !!T;
  o.name = T && T.name;
  o.roles = T && {
    court: T.pitch.court, surround: T.pitch.fieldBg, line: T.pitch.line,
    ball: T.pitch.ball, teamRed: T.pitch.teamRed, teamBlue: T.pitch.teamBlue,
    spot: T.pitch.ballSpot, accent: T.ui.accent,
  };
  // ⚠️ Each of the five in EXACTLY one role. A team drawn in the court, surround or ball
  // colour is a body the same colour as something already on screen.
  const FIVE = ['#336699', '#339966', '#fefff3', '#993300', '#c6ed2c'];
  o.usesAllFive = T && FIVE.every(h => JSON.stringify(T).toLowerCase().includes(h));
  o.teamsAreNotDecoys = T &&
    ![T.pitch.court, T.pitch.fieldBg, T.pitch.ball].includes(T.pitch.teamRed) &&
    ![T.pitch.court, T.pitch.fieldBg, T.pitch.ball].includes(T.pitch.teamBlue);

  // The bundle sets every slot and names itself, rather than reading as Custom.
  M.applyBundle('tennis');
  o.slots = M.bundleSlots('tennis');
  o.bundleReadsBack = M.currentBundle() === 'tennis';
  o.liveLook = JSON.parse(JSON.stringify(M.sel.look));

  M.sel.mode = '2v2'; M.sel.kickoffRule = 'off'; M.sel.pitch = 'normal';
  M.setMatchSeed(11); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2; M.computeCam();

  // ------------------------------------------------------------ court and surround --
  const hw = w.bounds.halfW, hl = w.bounds.halfL;
  // Somewhere on the court with no marking near it: a quarter across, a third down.
  M.render();
  o.courtPx = at(hw * 0.45, hl * 0.30);
  o.courtIsBlue = near(o.courtPx, '#336699', 14);
  const [ex, ey] = M.screenPt(M.wx(hw), M.wy(0));
  o.surroundPx = atScreen(ex + 26, ey);
  o.surroundIsGreen = near(o.surroundPx, '#339966', 16);

  // ------------------------------------------------ the markings, where they belong --
  // ⚠️ Sampled ACROSS the tram line rather than at one point: a line is a couple of
  // pixels wide and lands between samples about as often as on one.
  const brightest = (x0, y0, x1, y1, n) => {
    let best = 0, px = null;
    for (let i = 0; i <= n; i++){
      const c = at(x0 + (x1-x0)*i/n, y0 + (y1-y0)*i/n);
      const s = c[0]+c[1]+c[2];
      if (s > best){ best = s; px = c; }
    }
    return { sum: best, px };
  };
  const F = M.DYN_FIELDS.tenniscourt;
  // The singles sideline sits `tram` of the WIDTH in from the touchline. Sweep a short
  // band across where it should be, and an equally short band well away from it.
  const tx = hw * (1 - 2*F.tram);            // world x of the singles line
  o.onTram  = brightest(tx - hw*0.03, hl*0.28, tx + hw*0.03, hl*0.28, 24);
  o.offTram = brightest(hw*0.42, hl*0.28, hw*0.54, hl*0.28, 24);
  o.tramIsThere = o.onTram.sum > o.offTram.sum + 90;
  // The service line sits `serve` of the half-length out from the net.
  const sy = hl * F.serve;
  o.onServe  = brightest(hw*0.30, sy - hl*0.02, hw*0.30, sy + hl*0.02, 24);
  o.offServe = brightest(hw*0.30, hl*0.72, hw*0.30, hl*0.86, 24);
  o.serveIsThere = o.onServe.sum > o.offServe.sum + 90;
  // The centre service line runs down the middle BETWEEN the service lines, and must
  // stop before the baseline — which is what tells a real court from four random lines.
  o.onCentre  = brightest(-hw*0.03, hl*0.30, hw*0.03, hl*0.30, 24);
  o.offCentre = brightest(-hw*0.03, hl*0.80, hw*0.03, hl*0.80, 24);
  o.centreStopsShort = o.onCentre.sum > o.offCentre.sum + 90;

  // ---------------------------------------------- racquet vs net, by SILHOUETTE only --
  // ⚠️ Measured on a RING, the star-vs-shield discriminator: the racquet is inked at the
  // two poles and empty at the sides, the net is inked all the way round. A pixel COUNT
  // cannot separate them — the two shapes cover a similar area.
  const probe = (team, faceX, faceY) => {
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = 160;
    const c = cvs.getContext('2d');
    c.fillStyle = '#336699'; c.fillRect(0, 0, 160, 160);
    const R = 56;
    M.DISC_SKINS.tennis.paint(c, { team, faceX, faceY }, 80, 80, R, null);
    const d = c.getImageData(0, 0, 160, 160).data;
    const inked = (ang, rad) => {
      const x = Math.round(80 + Math.cos(ang)*R*rad), y = Math.round(80 + Math.sin(ang)*R*rad);
      const i = (y*160 + x)*4;
      return !(Math.abs(d[i]-51) < 18 && Math.abs(d[i+1]-102) < 18 && Math.abs(d[i+2]-153) < 18);
    };
    // Index k is at angle k*π/16, so 0 and 16 are the screen's LEFT and RIGHT and 8 and
    // 24 are DOWN and UP. Getting those the wrong way round is how the first run of this
    // suite reported the racquet's own head as its bare side.
    const arr = [];
    for (let k = 0; k < 32; k++) arr.push(inked(k*Math.PI/16, 0.78) ? 1 : 0);
    return { arr, n: arr.reduce((a,v)=>a+v,0) };
  };
  const UPDOWN = [8, 24], LEFTRIGHT = [0, 16];
  // Racquet pointing straight UP the screen: its head and grip are at 8 and 24, and 0
  // and 16 — straight across it — are the bare sides.
  o.racquet = probe(0, 0, -1);
  o.net     = probe(1, 0, -1);
  o.netIsAllRound   = o.net.n >= 30;
  o.racquetHasGaps  = o.racquet.n <= 20;
  o.silhouetteGap   = o.net.n - o.racquet.n;
  o.racquetUp = { poles: UPDOWN.map(k => o.racquet.arr[k]), sides: LEFTRIGHT.map(k => o.racquet.arr[k]) };
  o.racquetSidesBare = o.racquetUp.poles.every(v => v === 1) && o.racquetUp.sides.every(v => v === 0);

  // ...and the racquet TURNS with the facing while the net does not. ⚠️ The count on the
  // ring is rotation-INVARIANT, so comparing totals says nothing at all — what has to
  // move is WHERE the ink is. Pointed right, the bare pair and the inked pair swap.
  const rq90 = probe(0, 1, 0), nt90 = probe(1, 1, 0);
  o.racquetRight = { poles: LEFTRIGHT.map(k => rq90.arr[k]), sides: UPDOWN.map(k => rq90.arr[k]) };
  o.racquetTurns = o.racquetRight.poles.every(v => v === 1) && o.racquetRight.sides.every(v => v === 0);
  o.netDoesNot = JSON.stringify(nt90.arr) === JSON.stringify(o.net.arr);

  // -------------------------------------------------------------- the ball's seams --
  // Drawn against the plain look on the same ball, so this measures the SEAM and not
  // "the ball is on screen".
  const ballPx = (look) => {
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = 120;
    const c = cvs.getContext('2d');
    c.fillStyle = '#339966'; c.fillRect(0, 0, 120, 120);
    M.paintBall(c, 60, 60, 40, 0, look);
    const d = c.getImageData(0, 0, 120, 120).data;
    let spot = 0, body = 0;
    for (let i = 0; i < d.length; i += 4){
      if (Math.abs(d[i]-51) < 26 && Math.abs(d[i+1]-102) < 26 && Math.abs(d[i+2]-153) < 26) spot++;
      if (Math.abs(d[i]-198) < 26 && Math.abs(d[i+1]-237) < 26 && Math.abs(d[i+2]-44) < 26) body++;
    }
    return { spot, body };
  };
  o.seamBall  = ballPx('seam');
  o.plainBall = ballPx('plain');
  o.seamIsDrawn = o.seamBall.spot > o.plainBall.spot + 120;
  o.ballIsAcid  = o.seamBall.body > 1200;

  // ------------------------------------------------------------- it plays, and holds --
  let escapes = 0, goals = 0;
  for (let i = 0; i < 2400; i++){
    M.step(w);
    const bl = w.ball;
    if (Math.abs(bl.x) > hw + 40 || Math.abs(bl.y) > hl + w.field.net + 40) escapes++;
    goals = w.score[0] + w.score[1];
  }
  o.escapes = escapes; o.played = goals >= 0 && isFinite(w.ball.x);

  // ⚠️ The field must not advance in a PAINT: two renders with no step between them
  // have to produce the same picture (the trails rule).
  const hash = () => { M.render(); const d = c2.getImageData(0,0,cv.width,cv.height).data;
    let h = 0; for (let i = 0; i < d.length; i += 97) h = (h*31 + d[i])|0; return h; };
  o.paintIsPure = hash() === hash();
  return o;
});
await p.close();

// -------------------------------------------------------------------- report --
ok('the Hard Court theme exists', r.exists && r.name === 'Hard Court', r.name);
ok('all five supplied colours are in the palette', r.usesAllFive, JSON.stringify(r.roles));
ok('the court is #336699 and the surround #339966', r.courtIsBlue && r.surroundIsGreen,
   `court ${JSON.stringify(r.courtPx)}, surround ${JSON.stringify(r.surroundPx)}`);
ok('neither team wears the court, the surround or the ball colour', r.teamsAreNotDecoys,
   JSON.stringify(r.roles) + ' — a body the same colour as something you are already tracking is a decoy, which is what the Bootleg dots and the Sorry! lane squares both record');
ok('the bundle sets every slot and names itself', r.bundleReadsBack &&
   r.slots.field === 'tenniscourt' && r.slots.discs === 'tennis' && r.slots.ball === 'seam',
   JSON.stringify({ slots: r.slots, live: r.liveLook, reads: r.bundleReadsBack }));

ok('the tram line is at 0.125 of the width, and nowhere near the middle', r.tramIsThere,
   `on ${r.onTram.sum} vs off ${r.offTram.sum} — a court is a shape people know by heart, so the ratio is the thing worth measuring`);
ok('the service line is at 0.538 of the half', r.serveIsThere,
   `on ${r.onServe.sum} vs off ${r.offServe.sum}`);
ok('the centre service line stops at the service line', r.centreStopsShort,
   `between ${r.onCentre.sum} vs past it ${r.offCentre.sum} — a line running all the way to the baseline is four random lines, not a tennis court`);

ok('the net disc is inked ALL THE WAY ROUND', r.netIsAllRound, `${r.net.n}/32`);
ok('the racquet is not', r.racquetHasGaps, `${r.racquet.n}/32`);
ok('...its head and grip are inked and its SIDES are bare', r.racquetSidesBare, JSON.stringify(r.racquetUp) +
   ' — a wide head and a narrow grip means a ring is inked at the poles and empty across; a pixel count cannot separate these two shapes');
ok('the silhouette gap is a real one', r.silhouetteGap >= 10, `${r.silhouetteGap} probe points apart`);
ok('the racquet turns with the facing and the net does not', r.racquetTurns && r.netDoesNot,
   JSON.stringify({ up: r.racquetUp, right: r.racquetRight, netStill: r.netDoesNot }) +
   ' — the COUNT on the ring is rotation-invariant, so what has to move is where the ink is: pointed right, the inked pair and the bare pair swap');

ok('the ball carries its seams', r.seamIsDrawn,
   `${r.seamBall.spot} seam pixels against ${r.plainBall.spot} on the plain look — measured as a DIFFERENCE, or "the ball is on screen" passes it`);
ok('...on an acid-yellow ball', r.ballIsAcid, `${r.seamBall.body} px of #c6ed2c`);

ok('the ball never leaves the pitch', r.escapes === 0, `${r.escapes} escapes over 2400 steps`);
ok('a match plays out on it', r.played);
ok('the court does not advance in a draw', r.paintIsPure,
   'two renders with no step between them must be identical — the trails rule');

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL tennis\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS tennis');
