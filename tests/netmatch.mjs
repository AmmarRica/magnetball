// A MATCH HOSTED BY A THIRD PARTY: the dedicated match server, end to end, on one machine.
//
// ⚠️ THE CLAIM IS NOT "TWO BROWSERS SEE THE SAME MATCH". It is that the match is stepped in
// ONE place neither player owns, and that each player's stick moves their own body there
// and nobody else's. So the server is a real `server/match/matchServer.mjs` child process
// running `index.html` in its own headless Chromium, the hub is the dev relay speaking the
// same subprotocol subset Azure Web PubSub does, and the two players are two Playwright
// pages that go through the REAL `netPlay` — token, socket, seat, start — with the servers
// named through `__MAGNETONLINE` the way `__MAGNETPANEL` names a route.
//
// What is held, and the control beside each:
//   • both players reach `live` with a seat each, and the server says the room is live;
//   • the SERVER steps (its tick grows) and the CLIENTS do not (`w.aiTick`, which `step`
//     increments every step, stays at zero on both) — paired with the clients' bodies
//     still moving, or "the client does not step" is true of a client drawing nothing;
//   • ArrowRight held on player A moves seat A's body ON THE SERVER by a body-length and
//     seat B's by nothing, then the same the other way round — measured on the server's
//     own status endpoint, never on a client's picture of it;
//   • the player's own body FOLLOWS on their client, so the snapshot path is closed;
//   • the clock reaches the HUD;
//   • the first joiner's settings are what is played, are borrowed by the second joiner's
//     `sel`, and are given BACK on leaving;
//   • the server outlives a player who drops: B closes its socket, the server's tick keeps
//     growing and A keeps receiving, while B's picture freezes — the freeze being the same
//     bodies that were measured moving a moment earlier.
//
// ⚠️ Measurement traps: the pitch is pinned upright on both clients (`sel.orient = 'v'`),
// because on a wide page `auto` turns it and ArrowRight becomes a push up the pitch — which
// during the kickoff the half-line rule pushes straight back, and the isolation check then
// reads "did not move" on a build that works. And the drive waits for the server to reach
// `play` (the kickoff's six-second timeout with nobody touching the ball), for the reason
// above. Sabotage-verified: `step` in place of `netStep` reddens `clientsNeverStep`; the
// server's input flush cut reddens both isolation checks; `netApply` returning early
// reddens `snapshotsLand` and `ownBodyFollows` and nothing else.
import { chromium, LAUNCH } from './_browser.mjs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';

const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };
const freePort = () => new Promise(res => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => { const r = await fetch(u); return r.json(); };
const until = async (fn, ms, every = 100) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms){ v = await fn(); if (v) return v; await sleep(every); } return v; };

const root = process.cwd();
const relayPort = await freePort(), matchPort = await freePort();
const node = process.execPath;
const kids = [];
const spawnKid = (args, env, tag) => {
  const k = spawn(node, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  k.stdout.on('data', d => { if (process.env.MB_VERBOSE) process.stdout.write('[' + tag + '] ' + d); });
  k.stderr.on('data', d => process.stderr.write('[' + tag + ' err] ' + d));
  kids.push(k); return k;
};
spawnKid([join(root, 'server/match/relay.mjs'), '--port', String(relayPort)], {}, 'relay');
spawnKid([join(root, 'server/match/matchServer.mjs')], {
  PORT: String(matchPort), HOST: '127.0.0.1', GAME_DIR: root, SNAP_HZ: '20',
  MATCH_WS: 'ws://127.0.0.1:' + relayPort + '/client/hubs/match?access_token=dev&user=server',
}, 'match');
const relayUp = await until(() => getJson('http://127.0.0.1:' + relayPort + '/health').catch(() => null), 10000);
const matchUp = await until(() => getJson('http://127.0.0.1:' + matchPort + '/health').catch(() => null), 10000);
ok('relayUp', relayUp && relayUp.relay);
ok('matchUp', matchUp && matchUp.ok);

const b = await chromium.launch(LAUNCH);
const online = { api: 'http://127.0.0.1:' + relayPort, match: 'http://127.0.0.1:' + matchPort };
const mkPage = async () => {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
  await p.addInitScript((o) => { window.__MAGNETDEBUG = true; window.__MAGNETONLINE = o; }, online);
  await p.goto('file://' + root + '/index.html');
  await p.waitForTimeout(700);
  return p;
};
const A = await mkPage(), B = await mkPage();

// The row exists and is SHOWN when a server is named; that is the reachable half.
ok('onlineRowShown', await A.evaluate(() => { const r = document.getElementById('onlineRow'); return !!r && !r.classList.contains('hidden') && window.__magnet.ONLINE.match !== ''; }));

// A joins with 2v2 / five minutes; B with 3v3 / first to 3. A's settings must be the ones played.
await A.evaluate(() => { const M = window.__magnet; M.sel.orient = 'v'; M.sel.mode = '2v2'; M.sel.length = '5'; M.sel.lobby = 'off'; });
await B.evaluate(() => { const M = window.__magnet; M.sel.orient = 'v'; M.sel.mode = '3v3'; M.sel.length = 'g3'; M.sel.lobby = 'off'; });
const joinedA = await A.evaluate(() => window.__magnet.netPlay('TEST'));
ok('aTookSeat', joinedA === true);
const waitingA = await A.evaluate(() => window.__magnet.NET.status);
ok('aWaitsAlone', waitingA === 'waiting', waitingA);
const joinedB = await B.evaluate(() => window.__magnet.netPlay('test'));   // lower case: the code is folded
ok('bTookSeat', joinedB === true);

const live = async (p) => p.evaluate(() => { const M = window.__magnet; return M.NET.status === 'live' && M.NET.remote && !!M.world; });
ok('aLive', await until(() => live(A), 25000, 200));
ok('bLive', await until(() => live(B), 25000, 200));
const seatOf = async (p) => p.evaluate(() => { const M = window.__magnet, w = M.world, me = M.NET.me;
  return { seat: M.NET.seat, n: w.players.length, meCtrl: me && me.ctrl, meIdx: w.players.indexOf(me), mode: M.sel.mode, length: M.sel.length,
           names: w.players.map(q => q.name), teams: w.players.map(q => q.team) }; });
const sa = await seatOf(A), sb = await seatOf(B);
ok('seatsDiffer', sa.seat === 0 && sb.seat === 1, JSON.stringify([sa.seat, sb.seat]));
ok('rosterIsTwoVTwo', sa.n === 4 && sb.n === 4, JSON.stringify([sa.n, sb.n]));
ok('ownBodyIsHuman', sa.meCtrl === 'human1' && sb.meCtrl === 'human1' && sa.meIdx >= 0 && sb.meIdx >= 0 && sa.meIdx !== sb.meIdx, JSON.stringify([sa, sb]));
ok('firstJoinerSettingsPlayed', sb.mode === '2v2' && sb.length === '5', JSON.stringify(sb));
ok('sameRosterBothEnds', JSON.stringify(sa.names) === JSON.stringify(sb.names) && JSON.stringify(sa.teams) === JSON.stringify(sb.teams));

const status = () => getJson('http://127.0.0.1:' + matchPort + '/match/TEST');
const st0 = await status();
ok('serverSaysLive', st0.state === 'live', st0.state);
// The server steps; the clients do not.
const playing = await until(async () => { const s = await status(); return s.st === 'play' ? s : null; }, 9000, 200);
ok('serverReachesPlay', !!playing, JSON.stringify(await status()));
const t1 = (await status()).tick; await sleep(1000); const t2 = (await status()).tick;
ok('serverSteps', t2 - t1 > 30, t2 - t1);
const ticks = async (p) => p.evaluate(() => window.__magnet.world.aiTick || 0);
ok('clientsNeverStep', (await ticks(A)) === 0 && (await ticks(B)) === 0, JSON.stringify([await ticks(A), await ticks(B)]));
// ...paired: a bot body on A's picture moves anyway (the server's bots are playing).
const botPos = (p) => p.evaluate(() => { const w = window.__magnet.world; const q = w.players.find(x => x !== window.__magnet.NET.me && x.name !== window.__magnet.NET.me.name);
  return [q.x, q.y, w.ball.x, w.ball.y]; });
const bp1 = await botPos(A); await sleep(1200); const bp2 = await botPos(A);
const moved = Math.hypot(bp2[0] - bp1[0], bp2[1] - bp1[1]) + Math.hypot(bp2[2] - bp1[2], bp2[3] - bp1[3]);
ok('snapshotsLand', moved > 5, moved.toFixed(1));

// Each stick moves its own seat on the SERVER and nobody else's.
const drive = async (p, name) => {
  const before = (await status()).bodies;
  const meBefore = await p.evaluate(() => [window.__magnet.NET.me.x, window.__magnet.NET.me.y]);
  await p.keyboard.down('ArrowRight'); await sleep(900); await p.keyboard.up('ArrowRight');
  await sleep(250);
  const after = (await status()).bodies;
  const meAfter = await p.evaluate(() => [window.__magnet.NET.me.x, window.__magnet.NET.me.y]);
  const d = after.map((q, i) => Math.hypot(q.x - before[i].x, q.y - before[i].y));
  return { d, own: Math.hypot(meAfter[0] - meBefore[0], meAfter[1] - meBefore[1]) };
};
const dA = await drive(A, 'A');
// ⚠️ "Nobody else's" is a RATIO, not zero: the other seat's body is on a live pitch with
// bots and a ball on it, and it coasts for most of a second after its own drive (measured
// 2.2 units of drift a second after A let go). A pad written to both seats reads ~136 on
// both, which is what the ratio is for.
const alone = (d, mine) => d[mine] > 15 && d[1 - mine] < 5 && d[1 - mine] < d[mine] / 8;
ok('aMovesOnlySeatA', alone(dA.d, 0), JSON.stringify(dA.d));
ok('ownBodyFollows', dA.own > 15, dA.own.toFixed(1));
await sleep(1200);
const dB = await drive(B, 'B');
ok('bMovesOnlySeatB', alone(dB.d, 1), JSON.stringify(dB.d));

ok('clockReachesHud', await until(() => A.evaluate(() => { const t = document.getElementById('clock').textContent; return t !== '5:00' && /^\d:\d\d$/.test(t); }), 4000, 200));

// B drops. The server keeps stepping, A keeps receiving, B's picture freezes.
const snapsA0 = await A.evaluate(() => window.__magnet.NET.snaps.length && window.__magnet.NET.snaps[window.__magnet.NET.snaps.length - 1].k);
await B.evaluate(() => { window.__magnet.NET.ws.close(); });
await sleep(400);
const bf1 = await botPos(B), tt1 = (await status()).tick;
await sleep(1200);
const bf2 = await botPos(B), tt2 = (await status()).tick;
const snapsA1 = await A.evaluate(() => window.__magnet.NET.snaps[window.__magnet.NET.snaps.length - 1].k);
ok('serverOutlivesDrop', tt2 - tt1 > 30, tt2 - tt1);
ok('aStillReceives', snapsA1 > snapsA0 + 10, JSON.stringify([snapsA0, snapsA1]));
ok('droppedClientFreezes', Math.hypot(bf2[0] - bf1[0], bf2[1] - bf1[1]) + Math.hypot(bf2[2] - bf1[2], bf2[3] - bf1[3]) < 0.01);

// Leaving gives the borrowed settings back.
const backB = await B.evaluate(() => { const M = window.__magnet; M.netLeave(); return { mode: M.sel.mode, length: M.sel.length, remote: M.NET.remote }; });
ok('settingsReturned', backB.mode === '3v3' && backB.length === 'g3' && backB.remote === false, JSON.stringify(backB));

ok('noPageErrors', errors.length === 0, errors.join(' | '));
await b.close();
for (const k of kids){ try { k.kill('SIGTERM'); } catch (_) {} }
console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'OK netmatch');
process.exit(fails.length ? 1 : 0);
