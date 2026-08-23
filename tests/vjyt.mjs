// VJ MODE: A YOUTUBE VIDEO AS THE BACKGROUND OF THE GAME.
//
// ⚠️ A YOUTUBE VIDEO CANNOT BE A DECK — the embed iframe is the only way YouTube plays,
// and an iframe cannot be drawn into a canvas. So the layer is an iframe BEHIND the
// canvas, and `vjPaintVideo` punches the painted ground translucent (destination-out)
// at the exact seam the video decks already own: everything painted before the seam
// lets the video through, everything after — markings, players, ball, HUD — stays as
// opaque as it ever was.
//
// ⚠️ THE PUNCH IS MEASURED ON THE CANVAS'S OWN ALPHA CHANNEL, which is the honest
// instrument here: the iframe never loads in a headless run with no network, but the
// hole in the canvas either exists or it does not, and `getImageData`'s alpha says
// which — at the opacity asked for, where the ground is, and NOT where a player is.
//
// ⚠️ THE ID IS A SECURITY BOUNDARY. It is interpolated into an iframe src, so
// `ytIdFrom` must accept exactly the eleven-character YouTube alphabet and nothing
// else — an unvalidated "id" is an open door to embedding an arbitrary page behind the
// game. The command validates AGAIN game-side, because the /settings panel is a peer
// and not a trust boundary.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|ERR_TUNNEL|youtube/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

// ===================================================== the parser ===================
const pr = await p.evaluate(() => {
  const M = window.__magnet;
  const ID = 'dQw4w9WgXcQ';
  return {
    watch:   M.ytIdFrom('https://www.youtube.com/watch?v=' + ID),
    watch2:  M.ytIdFrom('https://www.youtube.com/watch?list=PL123&v=' + ID + '&t=9'),
    short:   M.ytIdFrom('https://youtu.be/' + ID + '?t=4'),
    shorts:  M.ytIdFrom('https://www.youtube.com/shorts/' + ID),
    embed:   M.ytIdFrom('https://www.youtube.com/embed/' + ID),
    live:    M.ytIdFrom('https://www.youtube.com/live/' + ID),
    nocookie:M.ytIdFrom('https://www.youtube-nocookie.com/embed/' + ID),
    bare:    M.ytIdFrom(ID),
    junk:    M.ytIdFrom('javascript:alert(1)'),
    // ⚠️ The HOST matters, not just the shape: a watch?v= on another domain is a link
    // to another domain, and taking the id off it would play whatever that site says.
    otherHost: M.ytIdFrom('https://evil.example/watch?v=' + ID),
    tooShort: M.ytIdFrom('abc'),
    injection: M.ytIdFrom('"><iframe src=x>'),
    empty:   M.ytIdFrom(''),
  };
});
const ID = 'dQw4w9WgXcQ';
ok('every real YouTube URL shape parses to the id',
   [pr.watch, pr.watch2, pr.short, pr.shorts, pr.embed, pr.live, pr.nocookie, pr.bare].every(v => v === ID),
   JSON.stringify(pr));
ok('...and everything else parses to NOTHING',
   [pr.junk, pr.otherHost, pr.tooShort, pr.injection, pr.empty].every(v => v === ''),
   JSON.stringify(pr) + ' — the id goes into an iframe src, so this is the security boundary');

// ===================================================== the layer, end to end ========
const r = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.applyTheme('grass');
  M.sel.mode = '1v1'; M.sel.lobby = 'off';
  M.setMatchSeed(5); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  M.juiceReset();
  // Park everything at known spots: the player where we will probe "player stays
  // opaque", everything else far away, the ball off the probe line.
  const me = w.players[0];
  for (const q of w.players) if (q !== me){ q.x = 0; q.y = 9e3; }
  me.x = -80; me.y = -120; me.vx = me.vy = 0; me.name = '';
  w.ball.x = 9e3; w.ball.y = 9e3;
  const cvEl = document.getElementById('game'), c = cvEl.getContext('2d');
  const dpr = cvEl.width / cvEl.clientWidth;
  const alphaAt = (wxx, wyy) => {
    const x = Math.round(M.wx(wxx) * dpr), y = Math.round(M.wy(wyy) * dpr);
    return c.getImageData(x, y, 1, 1).data[3];
  };
  const cornerAlpha = () => c.getImageData(4, 4, 1, 1).data[3];   // the surround
  const shot = () => { M.computeCam(); M.renderAlpha = 1; M.render(); };
  const iframe = () => document.querySelector('#ytbg iframe');

  // ---- off: no layer, fully opaque everywhere ----
  o.offIframe = !!iframe();
  shot();
  o.offCourtA = alphaAt(80, 120); o.offCornerA = cornerAlpha();

  // ---- on: the command builds the iframe ----
  M.vjExec('on', true);
  M.vjExec('yt', { id: 'https://youtu.be/dQw4w9WgXcQ' });   // a URL, proving the command parses too
  const f = iframe();
  o.onIframe = !!f;
  o.src = f ? f.src : '';
  o.srcRight = /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/.test(o.src);
  o.muted = /[?&]mute=1/.test(o.src) && /[?&]autoplay=1/.test(o.src) && /[?&]loop=1/.test(o.src);
  o.wrapperLive = document.getElementById('ytbg').classList.contains('live');
  o.noPointer = f ? getComputedStyle(f).pointerEvents === 'none' &&
    getComputedStyle(document.getElementById('ytbg')).pointerEvents === 'none' : false;
  // ⚠️ BEHIND the canvas, measured with a hit test rather than trusted from the markup:
  // whatever is at the screen centre must be the canvas (or something over it), never
  // the video layer — a layer that wins the hit test is a layer eating every tap.
  const mid = document.elementFromPoint(500, 400);
  o.centreHit = mid ? (mid.id || mid.tagName) : 'null';
  o.canvasOnTop = !!mid && mid.id !== 'ytbg' && (!f || !f.contains(mid));

  // ---- the punch: ground translucent at the asked-for opacity, bodies not ----
  M.vjExec('yt', { op: 0.55 });
  shot();
  o.courtA55  = alphaAt(80, 120);          // clear court, no markings
  o.cornerA55 = cornerAlpha();             // the surround, outside the pitch
  o.lineA55   = alphaAt(0, 0);             // the halfway line / centre spot — a MARKING
  o.playerA55 = alphaAt(me.x, me.y);       // the body itself
  M.vjExec('yt', { op: 0.25 });
  shot();
  o.courtA25 = alphaAt(80, 120);
  // ---- the punch holds under DECK VIEW's quarter-turn ----
  // ⚠️ This is the probe that makes the identity-transform line load-bearing: at
  // rotation zero the frame is near-identity and an un-transformed punch happens to
  // cover the screen anyway — a sabotage of `setTransform` PASSED every check above.
  // Turned a quarter, a punch in the pitch frame cuts a rotated rectangle and leaves
  // the corners sealed.
  // ⚠️ Through the REAL layout, not by poking `cam.rot` — `render()` calls `computeCam`
  // at its top (the goal-camera fix), so a hand-set rotation is put back before a single
  // pixel is drawn and the probe silently measures the unrotated frame. That version of
  // this probe PASSED with the setTransform deleted, which is the vacuity it had to lose.
  M.vjExec('yt', { id: 'dQw4w9WgXcQ' });
  M.vjExec('yt', { op: 0.55 });
  const dispWas = M.sel.display;
  M.sel.display = 'deck';
  shot();
  o.deckRot = M.cam.rot;                  // proof the quarter-turn actually took
  o.deckCornerA = cornerAlpha();
  M.sel.display = dispWas;
  // ---- clearing the id removes the iframe and reseals the canvas ----
  M.vjExec('yt', { id: '' });
  o.clearedIframe = !!iframe();
  shot();
  o.clearedCourtA = alphaAt(80, 120);
  // ---- the id survives VJ OFF (tonight's video, not gone) and PANIC kills it ----
  M.vjExec('yt', { id: 'dQw4w9WgXcQ' });
  M.vjExec('on', false);
  o.offAgainIframe = !!iframe();
  M.vjExec('on', true);
  o.backIframe = !!iframe();
  M.vjPanic();
  o.panicIframe = !!iframe();
  o.panicId = M.vj ? undefined : undefined;
  return o;
});

ok('with VJ off there is no layer and the canvas is sealed', !r.offIframe && r.offCourtA === 255 && r.offCornerA === 255,
   JSON.stringify({ iframe: r.offIframe, court: r.offCourtA, corner: r.offCornerA }));
ok('the command builds the embed, from a pasted URL', r.onIframe && r.srcRight,
   JSON.stringify({ iframe: r.onIframe, src: r.src }) + ' — the privacy-enhanced domain, and the command must parse a URL because the panel is a peer, not a gatekeeper');
ok('...muted, autoplaying, looping', r.muted, r.src + ' — autoplay policy requires the mute, and its audio could not join the mix anyway');
ok('...and it can never eat a tap', r.noPointer && r.canvasOnTop,
   JSON.stringify({ noPointer: r.noPointer, centreHit: r.centreHit }) + ' — a layer that wins the hit test is the #lobbyStartBtn bug from the other direction');
ok('THE GROUND OPENS BY THE OPACITY ASKED FOR', Math.abs(r.courtA55 - 255 * 0.45) <= 8 && Math.abs(r.cornerA55 - 255 * 0.45) <= 8,
   JSON.stringify({ court: r.courtA55, corner: r.cornerA55, want: Math.round(255 * 0.45) }) +
   ' — court and surround both, measured on the canvas alpha channel');
ok('...and FOLLOWS the fader', Math.abs(r.courtA25 - 255 * 0.75) <= 8,
   JSON.stringify({ at25: r.courtA25, want: Math.round(255 * 0.75) }));
ok('...INCLUDING under deck view\'s quarter-turn', r.deckRot !== 0 && Math.abs(r.deckCornerA - 255 * 0.45) <= 8,
   JSON.stringify({ rot: r.deckRot, corner: r.deckCornerA, want: Math.round(255 * 0.45) }) +
   ' — the punch runs at IDENTITY transform on purpose: in the pitch frame it cuts a rotated rectangle and leaves the screen corners sealed, and at rotation zero that mistake is invisible (a sabotage of the setTransform passed every other check here)');
ok('THE MARKINGS AND THE PLAYERS DO NOT OPEN', r.lineA55 >= 250 && r.playerA55 >= 250,
   JSON.stringify({ line: r.lineA55, player: r.playerA55 }) +
   ' — the punch sits at the deck seam: over the surface, under the markings, so a body can never go see-through');
ok('clearing the id removes the layer and reseals the canvas', !r.clearedIframe && r.clearedCourtA === 255,
   JSON.stringify({ iframe: r.clearedIframe, court: r.clearedCourtA }));
ok('VJ OFF parks the layer and VJ ON brings the same video back', !r.offAgainIframe && r.backIframe,
   JSON.stringify({ offAgain: r.offAgainIframe, back: r.backIframe }) + ' — tonight\'s video is not a setting, but switching the rig off is not choosing a new one');
ok('PANIC kills it outright', !r.panicIframe, 'the background video is a deck for PANIC purposes');

// ===================================================== render only ==================
const det = await p.evaluate(() => {
  const M = window.__magnet;
  const hash = (ww) => {
    const n = x => x.toFixed(9), a = [ww.state, n(ww.stateT), ww.score.join(':')];
    for (const q of ww.players) a.push(n(q.x), n(q.y), n(q.vx), n(q.vy));
    a.push(n(ww.ball.x), n(ww.ball.y), n(ww.ball.vx), n(ww.ball.vy));
    return a.join('|');
  };
  const run = (yt) => {
    M.vjExec('on', true);
    M.vjExec('yt', { id: yt ? 'dQw4w9WgXcQ' : '' });
    if (yt) M.vjExec('yt', { op: 0.6 });
    M.sel.mode = '2v2'; M.sel.lobby = 'off';
    M.setMatchSeed(17); M.startMatch();
    const ww = M.world; ww.state = 'play'; ww.stateT = 2;
    for (let i = 0; i < 400; i++){ M.step(ww); if (i % 7 === 0){ M.renderAlpha = 1; M.render(); } }
    return hash(ww);
  };
  const withYt = run(true), without = run(false);
  M.vjPanic();
  return { same: withYt === without };
});
ok('the layer is RENDER ONLY — the world is bit-identical with it on and off', det.same,
   'a background video that changes a match result is a hole in the determinism rule');

// ===================================================== the panel row ================
// The same document holds the panel builder, so the row is built for real and probed as
// DOM — including that a dropped link lands, which is the feature as asked for.
const ui = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.vjBuildPanel();
  const inEl = document.getElementById('vjYtUrl');
  o.hasInput = !!inEl;
  o.hasSet = !!document.getElementById('vjYtSet');
  o.hasClear = !!document.getElementById('vjYtClr');
  o.hasFader = !!document.getElementById('vjYtOp');
  if (!inEl) return o;
  // a DROPPED link: the real handler, driven with a synthetic drop event
  const row = inEl.closest('.vjrow');
  const dt = new DataTransfer();
  dt.setData('text/uri-list', 'https://youtu.be/dQw4w9WgXcQ\r\nhttps://ignored.example/');
  row.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  o.dropLanded = inEl.value.includes('youtu.be/dQw4w9WgXcQ');
  // junk is refused visibly rather than silently
  inEl.value = 'not a link';
  document.getElementById('vjYtSet').click();
  o.junkFlagged = inEl.classList.contains('bad');
  return o;
});
ok('the panel has the row: input, SET, CLEAR, fader', ui.hasInput && ui.hasSet && ui.hasClear && ui.hasFader,
   JSON.stringify(ui));
ok('...a DROPPED link lands', ui.dropLanded, JSON.stringify(ui) + ' — "drop a youtube video" is the ask, so the drop path is the feature');
ok('...and junk is refused visibly', ui.junkFlagged, 'a SET that silently does nothing reads as a broken button');

await p.close();
await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
console.log(JSON.stringify({ pr, r, det, ui }, null, 1));
if (fails.length){ console.log('FAIL vjyt'); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log('PASS vjyt');
