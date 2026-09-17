// RESUME — the match the game was closed on comes back.
//
// A phone call or a tab the browser threw away used to cost the whole match: 2-1 with a
// minute left was gone and "again" is a different match. `resumeSave` keeps a SNAPSHOT
// (the settings the match was started from, the seed, the score, the clock, the roster's
// names and stats, the snail and the berries) on the wall clock from `loop()` and on
// `pagehide`/`visibilitychange`; `resumeOffer` puts it on screen at boot; `resumeApply`
// starts the match again through `startMatch` on the same seed and lays the numbers over
// it, from a KICKOFF.
//
// ⚠️ DRIVEN THROUGH THE REAL EVENTS AND THE REAL BUTTON. A probe that calls `resumeSave`
// and `resumeApply` by hand proves the helpers exist and nothing about the wiring — the
// listener that fires on the way out, the offer at boot, a button a finger can press
// (hit-tested, never `.click()`), and every deliberate exit clearing the key.
// ⚠️ STORAGE HAS TO SURVIVE THE RELOAD, so the init script clears it on the FIRST load of
// the tab only (a sessionStorage latch) — every other suite here clears on every load,
// which is exactly what makes a reload-driven check vacuous.
// ⚠️ A PHONE VIEWPORT, on purpose: there is no attract demo on it, so "Discard leaves no
// match" is checkable — on a desktop a demo world is always there.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.addInitScript(() => {
  window.__MAGNETDEBUG = true;
  if (!sessionStorage.getItem('mb-keep')){ localStorage.clear(); sessionStorage.setItem('mb-keep', '1'); }
});
const URL = 'file://' + process.cwd() + '/index.html';
await p.goto(URL); await p.waitForTimeout(700);
const fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const modalUp = () => p.evaluate(() => { const el = document.getElementById('resumeModal'); return !!el && !el.classList.contains('hidden'); });
const keyUp = () => p.evaluate(() => !!localStorage.getItem('magnetball.resume'));
// Press a modal button the way a finger does: hit-test its centre, then click there.
const press = async id => {
  const r = await p.evaluate(id => { const el = document.getElementById(id), r = el.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2, at = document.elementFromPoint(cx, cy);
    return { cx, cy, hit: !!at && (at === el || el.contains(at)) }; }, id);
  if (r.hit) await p.mouse.click(r.cx, r.cy);
  return r.hit;
};
// A seeded bot match, stepped synchronously to some way in. Returns what a snapshot should carry.
const play = (mode, seed, secs) => p.evaluate(({ mode, seed, secs }) => {
  const M = window.__magnet;
  M.sel.mode = mode; M.sel.length = '5'; M.sel.lobby = 'off'; M.sel.autoReplay = false; M.sel.diff = 'hard'; M.sel.field = 'classic';
  M.setMatchSeed(seed); M.startMatch(); M.setMatchSeed(null);
  const w = M.world; w.state = 'play'; w.stateT = 1; w.players.forEach(q => { q.ctrl = 'bot'; });
  for (let i = 0; i < secs * 60 && w.state !== 'over'; i++) M.step(w);
  return { score: w.score.slice(), timeLeft: w.timeLeft, matchT: w.matchT, n: w.players.length,
           names: w.players.map(q => q.team + ':' + q.name), goals: w.players.map(q => q.ms.goals),
           hive: w.hive ? w.hive.slice() : null, extra: (w.extraBalls || []).map(e => [+e.x.toFixed(2), +e.y.toFixed(2), !!e.banked]),
           modeKey: w.modeKey, fieldKey: w.fieldKey, diffKey: w.diffKey, seed: w.seed };
}, { mode, seed, secs });
const snap = () => p.evaluate(() => JSON.parse(localStorage.getItem('magnetball.resume') || 'null'));
const readWorld = () => p.evaluate(() => { const M = window.__magnet, w = M.world; if (!w) return null;
  return { state: w.state, score: w.score.slice(), timeLeft: w.timeLeft, matchT: w.matchT, n: w.players.length,
           names: w.players.map(q => q.team + ':' + q.name), goals: w.players.map(q => q.ms.goals),
           hive: w.hive ? w.hive.slice() : null, extra: (w.extraBalls || []).map(e => [+e.x.toFixed(2), +e.y.toFixed(2), !!e.banked]),
           modeKey: w.modeKey, fieldKey: w.fieldKey, diffKey: w.diffKey, seed: w.seed, kickTeam: w.kickTeam }; });

// ---- 1. a match, closed on, comes back ------------------------------------------------
const before = await play('2v2', 77, 60);
ok('the fixture match got going', before.matchT >= 10 && before.score[0] + before.score[1] >= 1, JSON.stringify(before));
ok('nothing is stored before the page goes away', !(await keyUp()), 'the heartbeat is wall-clock and this was stepped synchronously');
await p.evaluate(() => window.dispatchEvent(new Event('pagehide')));
const doc = await snap();
ok('pagehide writes the snapshot', !!doc && doc.score.join() === before.score.join() && Math.abs(doc.matchT - before.matchT) < 1e-6,
   JSON.stringify(doc && { score: doc.score, matchT: doc.matchT }));
await p.reload(); await p.waitForTimeout(800);
ok('the offer is up at boot', await modalUp());
const info = await p.evaluate(() => document.getElementById('resumeInfo').textContent);
ok('...and it names the score', info.includes(before.score[0] + ' – ' + before.score[1]), info);
ok('...Resume is a button a finger can press', await press('resumeYes'));
await p.waitForTimeout(300);
const after = await readWorld();
ok('the same match is back: mode, pitch, tier, seed', !!after && after.modeKey === before.modeKey && after.fieldKey === before.fieldKey
   && after.diffKey === before.diffKey && after.seed === before.seed, JSON.stringify(after && { m: after.modeKey, f: after.fieldKey, d: after.diffKey, s: after.seed }));
ok('...same score and clock', !!after && after.score.join() === before.score.join() && Math.abs(after.timeLeft - before.timeLeft) < 1e-6
   && Math.abs(after.matchT - before.matchT) < 1e-6, JSON.stringify(after && { score: after.score, t: after.timeLeft, mt: after.matchT }));
// ⚠️ The names come off the SEED, not the snapshot: `pickNames` is arithmetic, so the same
// seed deals the same bots. A name overlay was written and deleted, because sabotaging it
// left this line green — it is the seed being checked here, and it is a real claim (a
// different seed would deal different names) rather than a copy of a helper.
ok('...same roster, the bots keeping their names', !!after && after.n === before.n && after.names.join() === before.names.join(),
   JSON.stringify(after && after.names) + ' vs ' + JSON.stringify(before.names));
ok('...and everybody keeps their match stats', !!after && after.goals.join() === before.goals.join(), JSON.stringify(after && after.goals));
ok('...from a kickoff', !!after && after.state === 'kickoff', after && after.state);
ok('...with the offer down and the key gone', !(await modalUp()) && !(await keyUp()));
const played = await p.evaluate(() => { const M = window.__magnet, w = M.world; if (!w) return null;
  const s0 = w.score.slice(); for (let i = 0; i < 600; i++) M.step(w); return { s0, s1: w.score.slice(), state: w.state }; });
ok('...and it plays on', !!played && played.s1[0] >= played.s0[0] && played.s1[1] >= played.s0[1], JSON.stringify(played));

// ---- 2. Discard --------------------------------------------------------------------------
await play('2v2', 78, 40);
await p.evaluate(() => window.dispatchEvent(new Event('pagehide')));
await p.reload(); await p.waitForTimeout(800);
ok('a second closed match is offered', await modalUp());
ok('...Discard is pressable', await press('resumeNo'));
await p.waitForTimeout(200);
ok('...and leaves no match and no key', !(await modalUp()) && !(await keyUp()) && (await readWorld()) === null);

// ---- 3. the heartbeat, on the real frame loop ------------------------------------------
await play('1v1', 79, 30);
const beat = await p.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const t0 = performance.now(); let at = null;
  while (performance.now() - t0 < 9000){ await wait(100); if (localStorage.getItem('magnetball.resume')){ at = performance.now() - t0; break; } }
  return { at, every: window.__magnet.RESUME.every };
});
ok('the frame loop writes a snapshot on its own', beat.at != null && beat.at <= (beat.every + 2) * 1000,
   JSON.stringify(beat) + ' — a phone that kills the tab fires no pagehide, so the heartbeat is the half that matters there');

// ---- 4. every deliberate exit clears it, and what is not a match is never kept ---------
const exits = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const mk = (seed, secs) => { M.sel.mode = '1v1'; M.setMatchSeed(seed); M.startMatch(); M.setMatchSeed(null);
    const w = M.world; w.state = 'play'; w.stateT = 1; w.players.forEach(q => { q.ctrl = 'bot'; });
    for (let i = 0; i < secs * 60; i++) M.step(w); return w; };
  const has = () => !!localStorage.getItem('magnetball.resume');
  let w = mk(80, 20); M.resumeSave(w); o.saved = has();
  M.endMatch(w); M.finishMatch(w); o.finishClears = !has();
  const ov = document.getElementById('overlay'); if (ov) ov.classList.remove('show');
  w = mk(81, 20); M.resumeSave(w); o.saved2 = has();
  M.toMenu(); o.menuClears = !has();
  w = mk(82, 20); M.resumeSave(w); const k0 = has(); M.startMatch(); o.newMatchClears = k0 && !has();
  // too young to be worth offering back
  w = mk(83, 3); o.youngRefused = !M.resumeSave(w) && !has();
  // and nothing but an ordinary match
  w = mk(84, 20); w.cup = { kind: 'countries' }; o.cupRefused = !M.resumable(w);
  w.cup = null; w.demo = true; o.demoRefused = !M.resumable(w);
  w.demo = false; w.state = 'over'; o.overRefused = !M.resumable(w);
  w.state = 'play'; o.thenAllowed = M.resumable(w);
  // stale
  localStorage.setItem('magnetball.resume', JSON.stringify(Object.assign(M.resumeDoc(w), { at: Date.now() - M.RESUME.maxAge - 60e3 })));
  o.staleRefused = M.resumeLoad() === null;
  localStorage.setItem('magnetball.resume', 'not json'); o.junkRefused = M.resumeLoad() === null;
  localStorage.removeItem('magnetball.resume');
  return o;
});
ok('a finished match is not offered back', exits.saved && exits.finishClears, JSON.stringify(exits));
ok('...nor one walked out of', exits.saved2 && exits.menuClears, JSON.stringify(exits));
ok('...and a new match replaces it', exits.newMatchClears, JSON.stringify(exits));
ok('a match seconds old is not kept', exits.youngRefused, JSON.stringify(exits));
ok('a cup tie, the demo and a finished match are never resumable', exits.cupRefused && exits.demoRefused && exits.overRefused && exits.thenAllowed, JSON.stringify(exits));
ok('a stale or unreadable snapshot is ignored', exits.staleRefused && exits.junkRefused, JSON.stringify(exits));

// ---- 5. Killer Lobsters: the hive and the objective stand where they stood ------------
const kqBefore = await play('kq', 85, 25);
await p.evaluate(() => { const w = window.__magnet.world; w.hive = [3, 1]; window.dispatchEvent(new Event('pagehide')); });
await p.reload(); await p.waitForTimeout(800);
ok('a Killer Lobsters match is offered', await modalUp());
await press('resumeYes'); await p.waitForTimeout(300);
const kqAfter = await readWorld();
ok('...with its hive', !!kqAfter && kqAfter.hive && kqAfter.hive.join() === '3,1', JSON.stringify(kqAfter && kqAfter.hive));
ok('...and the snail and the berries where they stood', !!kqAfter && JSON.stringify(kqAfter.extra) === JSON.stringify(kqBefore.extra),
   JSON.stringify(kqAfter && kqAfter.extra) + ' vs ' + JSON.stringify(kqBefore.extra));
ok('...and the same six berries and one snail', !!kqAfter && kqAfter.extra.length === kqBefore.extra.length, kqAfter && kqAfter.extra.length);

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
if (fails.length){ console.log('FAIL resume\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS resume');
