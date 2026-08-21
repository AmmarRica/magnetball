// WARM-UP: A CONTROLLER ARRIVING, A CONTROLLER LEAVING, AND THE KEY UNDER YOUR FEET.
//
// Three defects in the one room that exists for people joining, all found by reading the
// lobby against what it claims:
//
//   1. A pad connected DURING warm-up got no body. `pollDropIn` returns early on
//      `w.state === 'warmup'` under the comment "warm-up already hands seats to pads
//      (that is what it is for)" — and it does not. Seats are dealt once, in
//      `startMatch`, and `subWaitFor` is the only other thing in the file that ever
//      hands one out. So the room DID notice: `syncLobbyBalls` brought a ball on and
//      `stepLobbyClock` reset the idle countdown, and there was nothing to drive. Same
//      shape as the four-controllers bug — the game could see the pad and gave it nothing.
//   2. A pad UNPLUGGED during warm-up kept its seat: a body nobody can drive, still
//      counted by `lobbyPlan` as a person on that half, so the side preview lied and
//      `lobbyStart` fielded a statue for the whole match.
//   3. `drawLobbyKeys` divided by `LOBBYKB.dwell`, a constant that was DELETED when
//      nothing-presses-itself replaced the dwell. `x / undefined` is NaN, `NaN > 0` is
//      false, so the highlight map was never written and NO KEY EVER LIT UP.
//
// ⚠️ THE JOIN AND THE LEAVE ARE EACH CHECKED FROM BOTH ENDS, because one end alone is
// satisfied by a build that is broken the other way. "A body appears for a new pad" is
// true of a build that hands out a body per FRAME; "the seat is given up" is true of a
// build that deletes the body and leaves the side a player short.
//
// ⚠️ THE HIGHLIGHT TAKES TWO COMPARISONS, and sabotage shows each catching a different
// build. Lit-against-rest on the SAME plate catches the real defect (nothing ever lights)
// and also a board lit permanently, since then rest and lit are equal. What it cannot see
// is a board that lights ALL of its keys the moment somebody steps on one — rest is dark,
// lit is bright, and one plate reads perfectly — which says exactly as little about which
// letter KICK will press. That one is caught by the second reading: a key nobody is
// standing on, in the same frame, must be untouched.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|ERR_TUNNEL/i.test(m.text())) errors.push(m.text()); });
// One pad at boot; the list is mutable so a second can be plugged in mid-lobby and the
// first can be pulled out. A disconnected pad is a NULL SLOT, which is what a browser
// really does — splicing the array instead would renumber every pad above it and the
// test would be measuring its own stub.
await page.addInitScript(() => {
  window.__MAGNETDEBUG = true;
  const mk = i => ({ index: i, id: 'Fake Pad ' + i, connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
  window.__mk = mk;
  const pads = [mk(0)];
  navigator.getGamepads = () => pads;
  window.__pads = pads;
});
await page.goto('file://' + process.cwd() + '/index.html');
await page.waitForTimeout(900);

// ===================================================== a pad arriving and leaving ==
const r = await page.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.controllers = 'on'; M.sel.lobby = 'on'; M.sel.mode = '3v3';
  M.setMatchSeed(11); M.startMatch();
  const w = M.world;
  if (w.state !== 'warmup') M.enterWarmup(w);
  const warm = (n) => { for (let i = 0; i < n; i++) M.step(w); };
  warm(4);

  const humans = () => M.lobbyHumans(w);
  const seatFor = (i) => w.players.find(p => p.ctrl === 'gamepad' && p.padIndex === i);
  const plan = () => M.lobbyPlan(w);
  // How many bodies this side will actually field — the humans standing on it plus the
  // bots the plan wants to fill it. This is the number that must not move when somebody
  // unplugs: `stepLobbyBots` is supposed to put a bot in the empty shirt.
  const fielded = () => { const p = plan(); return [p.a.length + p.need0, p.b.length + p.need1]; };

  o.startedWarm = w.state === 'warmup';
  o.oneSeat = humans().length;
  o.balls0 = M.lobbyBallCount(w);
  o.fielded0 = fielded();

  // ---- 1. a second controller wakes up in the lobby --------------------------------
  window.__pads.push(window.__mk(1));
  warm(6);
  const joined = seatFor(1);
  o.joinedExists = !!joined;
  o.joinedOnPitch = !!joined && w.players.includes(joined);
  o.joinedNotBenched = !(w.bench || []).includes(joined);
  // It must land somewhere it can actually walk from: inside the pitch, beside halfway,
  // and not sitting out. Out on the touchline is the MID-MATCH answer, and asking for a
  // START there would be asking for the button that ends warm-up.
  o.joinedInside = !!joined && Math.abs(joined.x) < w.field.W/2 && Math.abs(joined.y) < w.field.L/2;
  o.joinedNearHalfway = !!joined && Math.abs(joined.y) <= 60;
  o.joinedSittingOut = !!joined && !!joined.sittingOut;
  o.twoHumans = humans().length;
  // The rest of the room agrees: a person who joined brings a ball with them.
  o.ballsAfterJoin = M.lobbyBallCount(w);
  // ...and nobody already standing was moved to make room.
  o.fieldedAfterJoin = fielded();

  // ⚠️ ONE body, not one per frame. The joiner is found by "a connected pad with no
  // body", so a build that forgets to check would mint a fresh P-number every step.
  warm(30);
  o.stillTwoHumans = humans().length;
  o.padOneBodies = w.players.filter(p => p.ctrl === 'gamepad' && p.padIndex === 1).length;

  // ⚠️ Bail rather than throw if no body arrived. A suite that dies on the first missing
  // thing reports a stack trace instead of the sentence that says what broke, and every
  // check below it is simply lost — which is exactly what the joiner sabotage produced.
  if (!joined) return o;

  // Give the joiner a name and walk them onto a half, so the leave below is losing a
  // real participant rather than a body still sat on the halfway line.
  joined.name = 'Joiner'; joined.y = w.field.L * 0.25;
  warm(4);
  o.joinerPicked = M.lobbySideOf(joined, w);
  o.fieldedWithJoiner = fielded();

  // ---- 2. that controller is pulled out --------------------------------------------
  window.__pads[1] = null;
  warm(6);
  o.seatGoneAfterUnplug = !seatFor(1);
  o.humansAfterUnplug = M.lobbyHumans(w).length;
  // ⚠️ The body is KEPT and becomes a bot, which is `dropOut`'s rule mid-match. Deleting
  // it would leave the side a player short until something else noticed, and would throw
  // away the name for the reclaim below.
  const wasJoiner = w.players.find(p => p.name === 'Joiner');
  o.bodyKept = !!wasJoiner;
  o.bodyIsBot = !!wasJoiner && wasJoiner.ctrl === 'bot';
  o.remembersPad = !!wasJoiner && wasJoiner._padWas === 1;
  // ⚠️ AND THE SIDE STAYS FULL. This is the half of the fix a "the seat is gone" check
  // cannot see: `lobbyPlan` is read fresh every frame, so the half that just lost a
  // person is one short and the converted body is the spare bot standing right there.
  o.fieldedAfterUnplug = fielded();

  // ---- 3. it comes back ------------------------------------------------------------
  window.__pads[1] = window.__mk(1);
  warm(6);
  const back = seatFor(1);
  o.reclaimed = !!back;
  o.reclaimedSameBody = !!back && back.name === 'Joiner';
  o.reclaimedNoDouble = w.players.filter(p => p.name === 'Joiner').length;
  o.humansAfterReclaim = M.lobbyHumans(w).length;
  return o;
});

ok('warm-up is where this happens at all', r.startedWarm);
ok('one pad, one seat, to start with', r.oneSeat === 1, 'humans=' + r.oneSeat);

ok('A CONTROLLER THAT WAKES UP IN THE LOBBY GETS A BODY', r.joinedExists,
   'a pad connected during warm-up got a ball and a reset idle clock and nothing to drive');
ok('...and it walks straight on, no touchline and no START', r.joinedOnPitch && r.joinedNotBenched && !r.joinedSittingOut,
   JSON.stringify({ onPitch: r.joinedOnPitch, benched: !r.joinedNotBenched, sittingOut: r.joinedSittingOut }) +
   ' — the bench is the mid-match answer; out here START is the button that ENDS warm-up');
ok('...beside the halfway line, undecided', r.joinedInside && r.joinedNearHalfway,
   JSON.stringify({ inside: r.joinedInside, nearHalfway: r.joinedNearHalfway }) +
   ' — you pick a side by walking into a half, so a joiner must start where nothing is picked');
ok('...counted as a person', r.twoHumans === 2, 'humans=' + r.twoHumans);
ok('...and the room agrees: a ball comes on with them', r.ballsAfterJoin > r.balls0,
   JSON.stringify({ before: r.balls0, after: r.ballsAfterJoin }));
ok('...ONE body, not one a frame', r.stillTwoHumans === 2 && r.padOneBodies === 1,
   JSON.stringify({ humans: r.stillTwoHumans, bodiesForPad1: r.padOneBodies }) +
   ' — the joiner is found by "a connected pad with no body", and a build that skips that mints a P-number every step');
ok('...and they can walk onto a half like anybody else', r.joinerPicked === 0,
   'side=' + r.joinerPicked);

ok('A CONTROLLER PULLED OUT GIVES UP ITS SEAT', r.seatGoneAfterUnplug && r.humansAfterUnplug === 1,
   JSON.stringify({ seatGone: r.seatGoneAfterUnplug, humans: r.humansAfterUnplug }) +
   ' — left as a seat it is a body nobody drives that lobbyPlan still counts as a person on that half');
ok('...the body is kept and becomes a bot', r.bodyKept && r.bodyIsBot,
   JSON.stringify({ kept: r.bodyKept, isBot: r.bodyIsBot }) + ' — dropOut’s rule mid-match, and the same one here');
ok('...AND THE SIDE STAYS FULL', !!r.fieldedAfterUnplug && !!r.fieldedWithJoiner &&
   JSON.stringify(r.fieldedAfterUnplug) === JSON.stringify(r.fieldedWithJoiner),
   JSON.stringify({ withJoiner: r.fieldedWithJoiner, after: r.fieldedAfterUnplug }) +
   ' — the half that just lost a person has to be filled back in, or the preview reads 2v3');
ok('...and the match did not shrink to make room for the joiner',
   !!r.fieldedAfterJoin && !!r.fielded0 &&
   r.fieldedAfterJoin[0] + r.fieldedAfterJoin[1] >= r.fielded0[0] + r.fielded0[1],
   JSON.stringify({ before: r.fielded0, after: r.fieldedAfterJoin }));

ok('A CONTROLLER THAT COMES BACK RECLAIMS ITS OWN BODY', r.reclaimed && r.reclaimedSameBody,
   JSON.stringify({ reclaimed: r.reclaimed, sameBody: r.reclaimedSameBody }) +
   ' — minting a fresh P3 strands the first one, name, colour, faceplate and typed letters and all');
ok('...and does not leave a second copy behind', r.reclaimedNoDouble === 1 && r.humansAfterReclaim === 2,
   JSON.stringify({ copies: r.reclaimedNoDouble, humans: r.humansAfterReclaim }));

// ===================================================== the key under your feet =====
// ⚠️ GRASS ON PURPOSE, and pinned: a suite that samples pixels has to say which palette
// it is sampling. ⚠️ And `juiceReset()` first — `flash` is module-level juice decayed in
// `decayJuice()`, which `loop()` calls and a headless probe never does, so anything that
// scored earlier would still be washing the whole canvas in a team colour.
const k = await page.evaluate(() => {
  const M = window.__magnet, o = {};
  M.applyTheme('grass');
  M.sel.controllers = 'on'; M.sel.lobby = 'on'; M.sel.mode = '1v1';
  M.setMatchSeed(3); M.startMatch();
  const w = M.world;
  if (w.state !== 'warmup') M.enterWarmup(w);
  M.juiceReset();
  for (let i = 0; i < 4; i++) M.step(w);
  const me = M.lobbyHumans(w)[0];
  o.haveKb = !!(w.kb && w.kb.keys && w.kb.keys.length);
  // SPACE is the wide key (`LOBBYKB.wideW`, 3.2 key widths), which is what makes an
  // honest sample possible at all: a body is 30 across and an ordinary key is 30 wide,
  // so a player standing on one covers it. Stand at one end and read the other.
  const wide = w.kb.keys.filter(q => q.label === 'SPACE')[0];
  const other = w.kb.keys.filter(q => q.label === 'DEL')[0];
  o.haveWide = !!wide && !!other;
  if (!o.haveWide) return o;
  const cv = document.getElementById('game'), c = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  // Sample the far quarter of each plate, well clear of the disc standing at the near end.
  const probe = (key) => {
    const pts = [];
    for (let f = 0.72; f <= 0.94; f += 0.055)
      for (let g = 0.2; g <= 0.8; g += 0.3)
        pts.push([key.x + key.w * f, key.y + key.h * g]);
    let sum = 0;
    for (const [wxx, wyy] of pts){
      const s = M.screenPt(M.wx(wxx), M.wy(wyy));
      const q = c.getImageData(Math.round(s[0]*dpr), Math.round(s[1]*dpr), 1, 1).data;
      sum += q[0] + q[1] + q[2];
    }
    return sum / pts.length;
  };
  const park = () => { me.x = 0; me.y = 0; me.kbKey = null; me.kbT = 0; };
  // Baseline: nobody on the board at all.
  park();
  M.computeCam(); M.renderAlpha = 1; M.render();
  o.restWide = +probe(wide).toFixed(1);
  o.restOther = +probe(other).toFixed(1);
  // Now stand on SPACE, at the near end so the body is nowhere near the sampled quarter,
  // and let the real `stepLobbyKeys` decide which key is under the feet.
  me.x = wide.x + me.r + 2; me.y = wide.y + wide.h/2; me.vx = me.vy = 0;
  M.stepLobbyKeys(w);
  o.standingOn = me.kbKey === wide;
  M.computeCam(); M.renderAlpha = 1; M.render();
  o.litWide = +probe(wide).toFixed(1);
  o.litOther = +probe(other).toFixed(1);
  return o;
});

ok('the lobby keyboard is there to check', k.haveKb && k.haveWide);
ok('...and the game knows which key you are standing on', k.standingOn,
   'stepLobbyKeys did not put the wide key under the body');
ok('THE KEY YOU STAND ON LIGHTS UP', k.litWide > k.restWide + 8,
   JSON.stringify({ rest: k.restWide, lit: k.litWide }) +
   ' — this divided by the deleted LOBBYKB.dwell, so f was NaN, the map was never written and no key ever lit');
ok('...and the ones you are NOT standing on do not', Math.abs(k.litOther - k.restOther) < 6,
   JSON.stringify({ rest: k.restOther, lit: k.litOther }) +
   ' — lighting the whole board says exactly as little as lighting none of it, and passes a one-plate check');

await page.close();
await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
console.log(JSON.stringify({ pads: r, keys: k }, null, 1));
if (fails.length){ console.log('FAIL warmupjoin'); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log('PASS warmupjoin');
