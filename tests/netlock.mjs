// DIRECT ONLINE (LOCKSTEP) — two real pages, the real relay, the real rAF loop.
//
// The OTHER online path — a match hosted by a third party — is `tests/netmatch.mjs`.
// These two must both stay green: they are two different answers to "play somebody who is
// not in the room", and the whole point of keeping both is that neither quietly eats the
// other. See LOCK and NET in index.html.
//
// This suite deliberately does NOT call step() by hand: the feature under test IS the
// wiring between loop()'s gate, the wire buffers and the relay, and a hand-stepped probe
// would bypass all three (the goalcam lesson: a suite that calls computeCam() itself
// measures the maths and never the wiring). Both pages run their own requestAnimationFrame
// loop and the only thing crossing between them is the WebSocket traffic through a relay
// spawned fresh on an ephemeral port.
//
// ⚠️ MEASUREMENT TRAPS recorded here:
//   · Inputs are driven with REAL keyboard events (page.keyboard.down), never by writing
//     pads.p1 — the real loop calls pollKeys() every frame, which overwrites pads.p1 from
//     the `keys` map, so a written pad is erased before it is sampled.
//   · "Frames advance" alone is vacuous — an offline match advances too. The claim is the
//     HASHES: both sims hash identically at the same frame numbers, over frames where both
//     players were steering. And hash EQUALITY alone is vacuous the other way (a hash
//     function returning 0 passes it), so the suite also requires the hash to CHANGE
//     across frames on one machine.
//   · Chromium throttles rAF in pages it thinks are backgrounded, which turns a lockstep
//     pair into a slideshow that still technically progresses — the launch args below
//     switch that off rather than letting the suite measure the throttle.
//
// ⚠️ ONE SABOTAGE IS INERT BY CONSTRUCTION AND IS WRITTEN DOWN RATHER THAN CHASED.
// Perturbing `lockSample`'s quantiser (a 2% chance of a ±1 error) leaves this suite green,
// and that is correct: the quantised integer is stored in the sampler's OWN buffer and sent
// on the wire, so both machines apply the identical value. It changes what the player asked
// for, never whether the two sims agree — there is no defect there for a determinism check
// to see. The quantiser's real guarantee, that both sides divide the same integer by the
// same 127, is symmetric for the same reason. Ten sabotages are caught, each by its own
// check; this is the eleventh and it is a no-op.
import { chromium, LAUNCH } from './_browser.mjs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// ---------- the relay, on an ephemeral port ----------
// ⚠️ `server/lockstep/relay.mjs`, NOT `server/match/relay.mjs`. The second is the hosted
// path's local stand-in for Azure Web PubSub and speaks a different protocol entirely.
const srv = spawn(process.execPath, [join(root, 'server', 'lockstep', 'relay.mjs'), '0'],
                  { stdio: ['ignore', 'pipe', 'pipe'] });
let srvOut = '';
const port = await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('relay did not start:\n' + srvOut)), 8000);
  const look = () => { const m = srvOut.match(/ws:\/\/127\.0\.0\.1:(\d+)/); if (m){ clearTimeout(to); res(+m[1]); } };
  srv.stdout.on('data', d => { srvOut += d; look(); });
  srv.stderr.on('data', d => { srvOut += d; });
});
const RELAY = `ws://127.0.0.1:${port}`;

const b = await chromium.launch({
  ...LAUNCH,
  args: [...LAUNCH.args,
         '--disable-background-timer-throttling',
         '--disable-renderer-backgrounding',
         '--disable-backgrounding-occluded-windows'],
});

const errors = [];
async function mkPage(tag){
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(tag + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(tag + ': ' + m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await p.goto('file://' + root + '/index.html');
  await p.waitForTimeout(600);
  return p;
}
async function until(p, fn, ms, what){
  const t0 = Date.now();
  for (;;){
    const v = await p.evaluate(fn);
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for: ' + what);
    await p.waitForTimeout(120);
  }
}

const A = await mkPage('A');   // host — team 0
const B = await mkPage('B');   // joiner — team 1

// ---------- the Online row offers what it can actually do ----------
// ⚠️ NO `online.json` HERE, so hosted play is not on the table and direct play is. This
// block is what caught a shipped defect: `#onlineRow.hidden` had no CSS rule at all, so
// the hosted room-code box rendered at 305x87px on every build with no match server —
// the dead control the old Online card was deleted for. There is no generic `.hidden`
// rule in this stylesheet; every user of that class needs an id rule of its own.
const rowState = await A.evaluate(() => {
  const M = window.__magnet;
  M.openSection('match');
  const disp = id => { const el = document.getElementById(id); return el ? getComputedStyle(el).display : 'MISSING'; };
  const probe = document.createElement('div');
  probe.className = 'hidden'; document.body.appendChild(probe);
  const bare = getComputedStyle(probe).display;
  probe.remove();
  return { api: M.ONLINE.api, match: M.ONLINE.match, bareHidden: bare,
           row: disp('onlineRow'), hosted: disp('hostedOnline'), direct: disp('directOnline'),
           directOffered: M.directOnlineOffered() };
});

// The two run different settings on purpose, so the override AND the restore are both
// observable: the host's '5' (timed) must govern the joiner's sim during the match and the
// joiner's own 'g3' must come back the moment the session ends. Timed on the host side is
// also load-bearing for the suite itself: the goal phase below must not be able to END the
// match ('g3' ends at three goals), because the host-leaves phase needs a match still
// running to leave.
await A.evaluate(() => { window.__magnet.sel.length = '5'; });
await B.evaluate(() => { window.__magnet.sel.length = 'g3'; });

// ---------- host, join, and the automatic start ----------
await A.evaluate(url => window.__magnet.lockHost(url), RELAY);
const code = await until(A, () => window.__magnet.lock.room || null, 8000, 'room code');
await B.evaluate(([url, c]) => window.__magnet.lockJoin(url, c), [RELAY, code]);

await until(A, () => window.__magnet.lock.playing && window.__magnet.world && window.__magnet.world.lockFrame > 5 || null, 12000, 'A playing');
await until(B, () => window.__magnet.lock.playing && window.__magnet.world && window.__magnet.world.lockFrame > 5 || null, 12000, 'B playing');

const snap = p => p.evaluate(() => {
  const M = window.__magnet, w = M.world;
  const p0 = w.players.find(q => q.team === 0), p1 = w.players.find(q => q.team === 1);
  return { f: w.lockFrame, state: w.state, score: [...w.score],
           p0: { x: p0.x, y: p0.y, ctrl: p0.ctrl, name: p0.name },
           p1: { x: p1.x, y: p1.y, ctrl: p1.ctrl, name: p1.name },
           ball: { x: w.ball.x, y: w.ball.y },
           len: M.sel.length, desynced: M.lock.desynced,
           netRemote: M.NET.remote,
           hashes: Array.from(M.lock.myHash.entries()) };
});

const a0 = await snap(A), b0 = await snap(B);

// ---------- both players steer, through the real keyboard ----------
// Host (team 0) spawns on +y and attacks -y; the joiner mirrors it. Held long enough that
// the kickoff touch fires and real play happens on both machines.
// ⚠️ **ArrowLEFT / ArrowRIGHT, and they were Up / Down until the seat rotation was fixed.**
// The layout turns the pitch on this viewport, so a key's (x,y) maps to (-y,x): ArrowLeft
// is world (0,-1) — the end the host attacks — and ArrowUp is world (+1,0), a run straight
// across. On the old build, which ignored the rotation, Up WAS -y; once it was honoured the
// scripted keys walked both players sideways, the ball was never touched, and the goal
// phase below stopped scoring. The suite stayed green throughout, because it asserts the
// two sims AGREE rather than that anything happened — which is exactly how a suite quietly
// stops exercising the transition it was written for.
await A.keyboard.down('ArrowLeft');
await B.keyboard.down('ArrowRight');
await A.waitForTimeout(800);
// ⚠️ **THE SEAT'S ROTATION, READ MID-HOLD THROUGH THE WHOLE REAL PATH** — keyboard →
// pollKeys → lockSample → quantise → wire → buffer → lockApplySeat → `p.inX`. The scratch
// body the local pad is resolved onto shipped with `rotQuarter` pinned at 0, and
// `applySeatRotation` gives every non-bot a base of `pitchHorizontal() ? 1 : 0` — so on any
// wide screen (this suite is 1280x800) a direct-online player's stick was a quarter turn
// off what they were looking at, which is a desktop's ordinary case rather than an edge one.
// A quarter turn maps ArrowLeft's (-1,0) onto world (0,-1), so the test is which component
// wins AND which way it points: a build that ignores the rotation steers (-1,0) instead.
// ⚠️ **AND IT HAS TO BE MEASURED ON BOTH PAGES, because the defect lands on the JOINER.**
// `startMatch` runs `applySeatRotation` over a roster where seat 1 is still a BOT — bots get
// 0 — and `lockDress` then turns both seats into `ctrl:'lock'`. So without `lockDress`
// calling `syncSeatRotation` the host's own body is right (it was `human1`, so it got the
// base) and the joiner's is a quarter turn out. A host-only probe reads perfectly on a build
// where half the players are broken, and a sabotage that deleted that call was MISSED until
// this second reading was added.
const headOf = p => p.evaluate(() => {
  const M = window.__magnet, w = M.world;
  const me = w.players.find(q => q.lockLocal);
  return { turned: M.pitchHorizontal(), rotQuarter: me.rotQuarter | 0, team: me.team,
           inX: me.inX, inY: me.inY, sample: M.lockSample() };
});
const headA = await headOf(A), headB = await headOf(B);
await A.waitForTimeout(1800);
await A.keyboard.up('ArrowLeft');
await B.keyboard.up('ArrowRight');
await B.keyboard.down('ArrowUp');
await A.waitForTimeout(1400);
await B.keyboard.up('ArrowUp');

// ⚠️ Movement is measured HERE, mid-play — the goal phase below can end in a
// resetKickoff, which teleports every body back to its formation spot, and the first run
// of this suite read "the host never moved" off exactly that: a final position eight units
// from the kickoff mark, identical to the decimal on both pages (the lockstep working
// perfectly while the probe measured the wrong moment).
const aMid = await snap(A), bMid = await snap(B);

// ---------- try to put a goal through the lockstep ----------
// The goal branch is the riskiest transition for two synced sims (subs hook, the
// celebration hold, resetKickoff teleporting every body), so the suite leans on it: both
// players drive the ball at the top net while the host hammers KICK. Whether a goal
// actually lands depends on the scramble — what is asserted is that BOTH sims agree on the
// score and keep hashing identically through whatever happened.
// ⚠️ **ArrowLEFT, and it was ArrowUp until the seat rotation was fixed.** On this viewport
// the layout turns the pitch, so the quarter turn maps a key's (x,y) to (-y,x): ArrowUp is
// world (+1,0), a run ACROSS the pitch, and ArrowLeft is world (0,-1), which is the end the
// host attacks. The old keys were written against a build that ignored the rotation, and
// the moment it was honoured this phase stopped producing a goal — the suite stayed green,
// because it asserts agreement rather than a scoreline, but it had stopped exercising what
// it is here for.
await A.keyboard.down('ArrowLeft');
await B.keyboard.down('ArrowLeft');
for (let i = 0; i < 12; i++){
  await A.keyboard.down('Space');
  await A.waitForTimeout(90);
  await A.keyboard.up('Space');
  await A.waitForTimeout(150);
}
await A.keyboard.up('ArrowLeft');
await B.keyboard.up('ArrowLeft');
await A.waitForTimeout(1600);

const a1 = await snap(A), b1 = await snap(B);

// ---------- a SLOW PEER, which is the only thing the gate exists for ----------
// ⚠️ **WITHOUT THIS PHASE THE GATE CANNOT BE TESTED AT ALL, and a sabotage proved it:**
// deleting `lockCanStep`'s block from loop() left this suite fully green, because over a
// localhost relay every input arrives inside the 3-frame (50ms) buffer and the gate never
// once has to hold. So one side's outgoing socket is delayed past that buffer, which is a
// real slow connection rather than a stubbed predicate. With the gate, the pair advances
// at the slower machine's pace and stays bit-identical; without it, the faster sim runs on
// with EMPTY input records for frames that have not arrived and the two part company.
await B.evaluate(ms => {
  const ws = window.__magnet.lock.ws, real = ws.send.bind(ws);
  // ⚠️ The readyState test has to be re-taken WHEN THE DEFERRED SEND FIRES, not when it is
  // queued. `lockSend` guards `readyState === 1` before calling this, and deferring hops
  // straight over that guard — so once the host leaves, every packet still in flight lands
  // on a closing socket and the page logs an error. That is the probe's bug, not the
  // game's, and it failed the suite's own "no console errors" check until it was fixed.
  ws.send = d => setTimeout(() => { if (ws.readyState === 1){ try { real(d); } catch (e) {} } }, ms);
}, 130);
const aSlow0 = await snap(A);
await A.keyboard.down('ArrowLeft');
await B.keyboard.down('ArrowRight');
await A.waitForTimeout(2400);
await A.keyboard.up('ArrowLeft');
await B.keyboard.up('ArrowRight');
await A.waitForTimeout(400);
const a2 = await snap(A), b2 = await snap(B);

// ---------- the host leaves; the joiner's match must survive it ----------
await A.evaluate(() => window.__magnet.lockStop('test: host left'));
await until(B, () => !window.__magnet.lock.playing || null, 8000, 'B noticed the host left');
await B.waitForTimeout(300);
const bAfter = await B.evaluate(() => {
  const M = window.__magnet, w = M.world;
  const p0 = w && w.players.find(q => q.team === 0), p1 = w && w.players.find(q => q.team === 1);
  return { len: M.sel.length, p0ctrl: p0 && p0.ctrl, p1ctrl: p1 && p1.ctrl, on: M.lock.on };
});

// ---------- a local match ends the session, and the dead-session world does not linger ----------
// ⚠️ `lockGuardStart` is the one place that says so, and without it `loop()` gates a world
// `lockBegin` no longer owns: the match would freeze on the first frame whose inputs never
// arrive. Driven through the REAL startMatch, not by calling the guard.
await A.evaluate(url => window.__magnet.lockHost(url), RELAY);
await until(A, () => window.__magnet.lock.on || null, 8000, 'A hosting again');
await A.evaluate(() => { window.__magnet.sel.mode = '1v1'; window.__magnet.startMatch({ lobby: false }); });
await A.waitForTimeout(400);
const afterLocal = await A.evaluate(() => {
  const M = window.__magnet, w = M.world;
  return { on: M.lock.on, playing: M.lock.playing,
           anyLockSeat: !!(w && w.players.some(p => p.ctrl === 'lock')) };
});

// ---------- verdicts ----------
const fails = [];
const ok = (cond, name, detail) => { if (!cond) fails.push(name + (detail ? ' — ' + JSON.stringify(detail) : '')); };

ok(rowState.bareHidden === 'block', 'the stylesheet still has no generic .hidden rule (so the id rules matter)', rowState);
ok(!rowState.api && !rowState.match, 'no match server is configured in this suite', rowState);
ok(rowState.hosted === 'none', 'the hosted room-code box is HIDDEN with no match server', rowState);
ok(rowState.direct !== 'none' && rowState.directOffered, 'direct play IS offered with no match server', rowState);
ok(rowState.row !== 'none', 'the Online row is up, because one of the two paths is available', rowState);

ok(a1.f > 150 && b1.f > 150, 'both sims advanced under the gate', { a: a1.f, b: b1.f });

// The seat rotation, all the way through the wire. Paired with the layout REALLY being
// turned in this run, or "the heading is sideways" is a claim about nothing; and with the
// body carrying a non-zero rotQuarter, which is what `lockDress`'s `syncSeatRotation` is
// for. A build with the scratch pinned at 0 sends (0,-127) for ArrowUp and reads
// |inY| > |inX| here.
ok(headA.turned, 'the pitch really is turned on this viewport (or the rotation check is vacuous)', headA);
ok(headA.rotQuarter !== 0, "the local seat carries the layout's quarter turn", headA);
ok(Math.abs(headA.inY) > Math.abs(headA.inX) && headA.inY < 0,
   'a turned seat steers ArrowLeft down the pitch, not across it, through the wire', headA);
ok(Math.abs(headA.sample[1]) > Math.abs(headA.sample[0]) && headA.sample[1] < 0,
   'the SAMPLED vector is rotated before it is quantised', headA);
// The joiner's half of the same claim, mirrored: it is holding ArrowRight, which a turned
// seat maps to world (0,+1) — up the pitch toward the end it attacks.
ok(headB.rotQuarter !== 0, "the JOINER's seat carries the layout's quarter turn too", headB);
ok(Math.abs(headB.sample[1]) > Math.abs(headB.sample[0]) && headB.sample[1] > 0,
   "the joiner's sampled vector is rotated too", headB);
ok(Math.abs(headB.inY) > Math.abs(headB.inX) && headB.inY > 0,
   'a turned joiner steers ArrowRight up the pitch, through the wire', headB);

const dist = (m, n) => Math.hypot(m.x - n.x, m.y - n.y);
// Your input moves your body — and moves it ON THE OTHER MACHINE, which is the half an
// offline build cannot fake.
ok(dist(aMid.p0, a0.p0) > 30, 'host body moved on the host page', { from: a0.p0, to: aMid.p0 });
ok(dist(bMid.p0, b0.p0) > 30, 'host body moved on the JOINER page', { from: b0.p0, to: bMid.p0 });
ok(dist(aMid.p1, a0.p1) > 30, 'joiner body moved on the HOST page', { from: a0.p1, to: aMid.p1 });
ok(dist(bMid.p1, b0.p1) > 30, 'joiner body moved on the joiner page', { from: b0.p1, to: bMid.p1 });

// Bit-identical worlds: every hashed frame both machines have in common agrees. At 60
// frames a hash and ~5 seconds of play there must be SEVERAL in common — one common frame
// would mostly be frame 0, which two freshly-built worlds pass without any input ever
// crossing the wire.
const ah = new Map(a1.hashes), bh = new Map(b1.hashes);
const common = [...ah.keys()].filter(f => bh.has(f)).sort((x, y) => x - y);
ok(common.length >= 3, 'enough hashed frames in common', { common: common.length, a: ah.size, b: bh.size });
const mismatch = common.filter(f => ah.get(f) !== bh.get(f));
ok(mismatch.length === 0, 'worlds hash identically at every common frame', { mismatch });
ok(common.some(f => f > 120), 'hashes cover frames after the players steered', { last: common[common.length - 1] });
// ...and the hash is not a constant, or the equality above is measuring nothing.
ok(new Set([...ah.values()]).size >= 3, 'the world hash actually varies over time', { distinct: new Set([...ah.values()]).size });

ok(!a1.desynced && !b1.desynced, 'no desync was flagged', { a: a1.desynced, b: b1.desynced });
ok(a1.score[0] === b1.score[0] && a1.score[1] === b1.score[1], 'both sims agree on the score',
   { a: a1.score, b: b1.score });
ok(a1.p0.ctrl === 'lock' && a1.p1.ctrl === 'lock', 'both seats are wire-fed on the host', a1);
ok(b0.len === '5', "the host's settings governed the joiner's sim during play", { len: b0.len });
// The two online paths are mutually exclusive — a direct session may never leave the
// hosted client half-live, or loop() would be asked to take both branches for one world.
ok(!a1.netRemote && !b1.netRemote, 'no hosted session is live alongside the direct one', { a: a1.netRemote, b: b1.netRemote });

// The slow-peer phase, and it is a PAIR of claims. "Still in sync" alone is true of a
// build that stopped simulating altogether, and "it slowed down" alone is true of a build
// that stalled and then diverged anyway.
const ah2 = new Map(a2.hashes), bh2 = new Map(b2.hashes);
const common2 = [...ah2.keys()].filter(f => bh2.has(f) && f > aSlow0.f);
const mismatch2 = common2.filter(f => ah2.get(f) !== bh2.get(f));
const slowFrames = a2.f - aSlow0.f;
ok(!a2.desynced && !b2.desynced, 'a slow peer did not desync the pair', { a: a2.desynced, b: b2.desynced });
ok(mismatch2.length === 0, 'worlds still hash identically under a slow peer', { mismatch: mismatch2, common: common2.length });
ok(slowFrames > 5, 'the pair kept advancing under the delay', { slowFrames });
ok(Math.abs(a2.f - b2.f) < 30, 'neither sim ran away from the other', { a: a2.f, b: b2.f });
// ⚠️ **A FRAME-COUNT CEILING WAS TRIED HERE AND DROPPED, and the number is why.** The first
// version required fewer than 120 frames in 2.8s against ~168 at 60Hz, on the reasoning
// that a gated pair must crawl. It measured 110 — a 9% margin — because a UNIFORM delay
// does not slow lockstep at all once it is running: every packet is shifted by the same
// 130ms, so the stream still arrives at 60 packets a second and the gate only pays the
// initial catch-up. A ceiling that close is a threshold waiting to be tuned on the first
// slow CI box, and it discriminates weakly anyway — a gateless build reaches full rate AND
// desyncs, which the hash check above catches outright. That check is the sabotage-verified
// one; this is the sanity beside it.

ok(bAfter.p0ctrl === 'bot', "the vanished host's body became a bot on the joiner", bAfter);
ok(bAfter.p1ctrl === 'human1' || bAfter.p1ctrl === 'gamepad', 'the joiner got local control back', bAfter);
ok(bAfter.len === 'g3', "the joiner's own settings came back at lockStop", bAfter);
ok(!bAfter.on, 'the session closed on the joiner', bAfter);

ok(!afterLocal.on && !afterLocal.playing, 'starting a local match left the online session', afterLocal);
ok(!afterLocal.anyLockSeat, 'the local match has no wire-fed seats left on it', afterLocal);

ok(errors.length === 0, 'no console errors on either page', errors.slice(0, 6));

await b.close();
srv.kill();

if (fails.length){
  console.error('netlock: FAIL');
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`netlock: OK — ${common.length} common hashed frames agree (last f=${common[common.length - 1]}), ` +
            `A ran to f=${a1.f}, B to f=${b1.f}, score ${a1.score.join('-')}, host-leave handled, ` +
            `turned seat steers (${headA.inX.toFixed(2)}, ${headA.inY.toFixed(2)}) for ArrowLeft, ` +
            `slow peer ${slowFrames} frames in 2.8s, hosted box hidden with no match server`);
process.exit(0);
