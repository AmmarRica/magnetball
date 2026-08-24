// ONLINE LOCKSTEP — two real pages, the real relay, the real rAF loop.
//
// This suite deliberately does NOT call step() by hand: the feature under test IS the
// wiring between loop()'s gate, the wire buffers and the relay, and a hand-stepped
// probe would bypass all three (the goalcam lesson: a suite that calls computeCam()
// itself measures the maths and never the wiring). Both pages run their own
// requestAnimationFrame loop and the only thing crossing between them is the
// WebSocket traffic through a relay spawned fresh on an ephemeral port.
//
// ⚠️ MEASUREMENT TRAPS recorded here:
//   · Inputs are driven with REAL keyboard events (page.keyboard.down), never by
//     writing pads.p1 — the real loop calls pollKeys() every frame, which overwrites
//     pads.p1 from the `keys` map, so a written pad is erased before it is sampled.
//   · "Frames advance" alone is vacuous — an offline match advances too. The claim is
//     the HASHES: both sims hash identically at the same frame numbers, over frames
//     where both players were steering. And hash EQUALITY alone is vacuous the other
//     way (a hash function returning 0 passes it), so the suite also requires the
//     hash to CHANGE across frames on one machine.
//   · Chromium throttles rAF in pages it thinks are backgrounded, which turns a
//     lockstep pair into a slideshow that still technically progresses — the launch
//     args below switch that off rather than letting the suite measure the throttle.
import { chromium, LAUNCH } from './_browser.mjs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// ---------- the relay, on an ephemeral port ----------
const srv = spawn(process.execPath, [join(root, 'server', 'relay.mjs'), '0'],
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

// The two run different settings on purpose, so the override AND the restore are both
// observable: the host's '5' (timed) must govern the joiner's sim during the match and
// the joiner's own 'g3' must come back the moment the session ends. Timed on the host
// side is also load-bearing for the suite itself: the goal phase below must not be
// able to END the match ('g3' ends at three goals), because the host-leaves phase
// needs a match still running to leave.
await A.evaluate(() => { window.__magnet.sel.length = '5'; });
await B.evaluate(() => { window.__magnet.sel.length = 'g3'; });

// ---------- host, join, and the automatic start ----------
await A.evaluate(url => window.__magnet.netHostStart(url), RELAY);
const code = await until(A, () => window.__magnet.net.room || null, 8000, 'room code');
await B.evaluate(([url, c]) => window.__magnet.netJoinStart(url, c), [RELAY, code]);

const playing = p => p.evaluate(() =>
  window.__magnet.net.playing && window.__magnet.world && window.__magnet.world.netFrame > 5 || null);
await until(A, () => window.__magnet.net.playing && window.__magnet.world && window.__magnet.world.netFrame > 5 || null, 12000, 'A playing');
await until(B, () => window.__magnet.net.playing && window.__magnet.world && window.__magnet.world.netFrame > 5 || null, 12000, 'B playing');

const snap = p => p.evaluate(() => {
  const M = window.__magnet, w = M.world;
  const p0 = w.players.find(q => q.team === 0), p1 = w.players.find(q => q.team === 1);
  return { f: w.netFrame, state: w.state, score: [...w.score],
           p0: { x: p0.x, y: p0.y, ctrl: p0.ctrl, name: p0.name },
           p1: { x: p1.x, y: p1.y, ctrl: p1.ctrl, name: p1.name },
           ball: { x: w.ball.x, y: w.ball.y },
           len: M.sel.length, desynced: M.net.desynced,
           hashes: Array.from(M.net.myHash.entries()) };
});

const a0 = await snap(A), b0 = await snap(B);

// ---------- both players steer, through the real keyboard ----------
// Host (team 0) spawns on +y and attacks -y, so ArrowUp runs at the ball; the joiner
// mirrors it with ArrowDown. Held long enough that the kickoff touch fires and real
// play happens on both machines.
await A.keyboard.down('ArrowUp');
await B.keyboard.down('ArrowDown');
await A.waitForTimeout(2600);
await A.keyboard.up('ArrowUp');
await B.keyboard.up('ArrowDown');
await B.keyboard.down('ArrowLeft');
await A.waitForTimeout(1400);
await B.keyboard.up('ArrowLeft');

// ⚠️ Movement is measured HERE, mid-play — the goal phase below can end in a
// resetKickoff, which teleports every body back to its formation spot, and the first
// run of this suite read "the host never moved" off exactly that: a final position
// eight units from the kickoff mark, identical to the decimal on both pages (the
// lockstep working perfectly while the probe measured the wrong moment).
const aMid = await snap(A), bMid = await snap(B);

// ---------- try to put a goal through the lockstep ----------
// The goal branch is the riskiest transition for two synced sims (subs hook, the
// celebration hold, resetKickoff teleporting every body), so the suite leans on it:
// both players drive the ball at the top net while the host hammers KICK. Whether a
// goal actually lands depends on the scramble — what is asserted is that BOTH sims
// agree on the score and keep hashing identically through whatever happened.
await A.keyboard.down('ArrowUp');
await B.keyboard.down('ArrowUp');
for (let i = 0; i < 12; i++){
  await A.keyboard.down('Space');
  await A.waitForTimeout(90);
  await A.keyboard.up('Space');
  await A.waitForTimeout(150);
}
await A.keyboard.up('ArrowUp');
await B.keyboard.up('ArrowUp');
await A.waitForTimeout(1600);

const a1 = await snap(A), b1 = await snap(B);

// ---------- the host leaves; the joiner's match must survive it ----------
await A.evaluate(() => window.__magnet.netStop('test: host left'));
await until(B, () => !window.__magnet.net.playing || null, 8000, 'B noticed the host left');
await B.waitForTimeout(300);
const bAfter = await B.evaluate(() => {
  const M = window.__magnet, w = M.world;
  const p0 = w && w.players.find(q => q.team === 0), p1 = w && w.players.find(q => q.team === 1);
  return { len: M.sel.length, p0ctrl: p0 && p0.ctrl, p1ctrl: p1 && p1.ctrl, on: M.net.on };
});

// ---------- verdicts ----------
const fails = [];
const ok = (cond, name, detail) => { if (!cond) fails.push(name + (detail ? ' — ' + JSON.stringify(detail) : '')); };

ok(a1.f > 150 && b1.f > 150, 'both sims advanced under the gate', { a: a1.f, b: b1.f });

const dist = (m, n) => Math.hypot(m.x - n.x, m.y - n.y);
// Your input moves your body — and moves it ON THE OTHER MACHINE, which is the half
// an offline build cannot fake.
ok(dist(aMid.p0, a0.p0) > 30, 'host body moved on the host page', { from: a0.p0, to: aMid.p0 });
ok(dist(bMid.p0, b0.p0) > 30, 'host body moved on the JOINER page', { from: b0.p0, to: bMid.p0 });
ok(dist(aMid.p1, a0.p1) > 30, 'joiner body moved on the HOST page', { from: a0.p1, to: aMid.p1 });
ok(dist(bMid.p1, b0.p1) > 30, 'joiner body moved on the joiner page', { from: b0.p1, to: bMid.p1 });

// Bit-identical worlds: every hashed frame both machines have in common agrees. At
// 60 frames a hash and ~5 seconds of play there must be SEVERAL in common — one
// common frame would mostly be frame 0, which two freshly-built worlds pass without
// any input ever crossing the wire.
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
ok(a1.p0.ctrl === 'net' && a1.p1.ctrl === 'net', 'both seats are wire-fed on the host', a1);
ok(b0.len === '5', "the host's settings governed the joiner's sim during play", { len: b0.len });

ok(bAfter.p0ctrl === 'bot', "the vanished host's body became a bot on the joiner", bAfter);
ok(bAfter.p1ctrl === 'human1' || bAfter.p1ctrl === 'gamepad', 'the joiner got local control back', bAfter);
ok(bAfter.len === 'g3', "the joiner's own settings came back at netStop", bAfter);
ok(!bAfter.on, 'the session closed on the joiner', bAfter);

ok(errors.length === 0, 'no console errors on either page', errors.slice(0, 6));

await b.close();
srv.kill();

if (fails.length){
  console.error('netlock: FAIL');
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`netlock: OK — ${common.length} common hashed frames agree (last f=${common[common.length - 1]}), ` +
            `A ran to f=${a1.f}, B to f=${b1.f}, score ${a1.score.join('-')}, host-leave handled`);
process.exit(0);
