// THE DEDICATED MATCH SERVER — a third party that hosts a match between two players.
//
// It runs the real game. `index.html` is loaded into a headless Chromium exactly as the
// test suites load it, two virtual controllers are plugged in (the same stub
// `tests/fourpads.mjs` uses), and the page's own frame loop steps the match at 60Hz. The
// two players' inputs arrive over the network and are written into those controllers;
// twenty times a second the world is read out and broadcast; the browsers at either end
// draw what they are told and simulate nothing. So the physics, the kickoff rule, the
// clock and the bots are the shipped ones, run once, in one place neither player owns —
// which is the whole point when one side lags and nobody is sure who.
//
// ⚠️ ONE COPY OF THE GAME. Nothing here re-implements a rule; if `index.html` changes, this
// changes with it, because this IS `index.html`. The price is a browser per match (~100MB)
// rather than a few kilobytes of hand-written physics, which is the right trade for a game
// whose physics live in one 36,000-line file and are measured by 140 suites against it.
//
// Transport: Web PubSub, with the server as one more client of the hub. Two groups a room:
//   <ROOM>      server → players: start, snap, over (and the waiting-room roster)
//   <ROOM>.in   players → server: inputs
// so a player's input is never echoed to the other player (a message on the Free tier is a
// message). The dev relay (`relay.mjs`) speaks the same subset, so the same code runs
// against both.
//
//   PORT                   HTTP port (default 7072)
//   GAME_DIR               folder holding index.html (default: the repo root above server/)
//   MATCH_WS               dev relay websocket URL (tests, localhost)
//   WEBPUBSUB_CONNECTION   ...or the Azure connection string; WEBPUBSUB_HUB (default match)
//   SNAP_HZ                snapshots a second (default 20)
//   PLAYWRIGHT_MODULE / CHROME_PATH / PLAYWRIGHT_BROWSERS_PATH  as in tests/_browser.mjs
//
import { createServer } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CFG = {
  port: +(process.env.PORT || 7072),
  gameDir: resolve(process.env.GAME_DIR || join(here, '..', '..')),
  matchWs: process.env.MATCH_WS || '',
  conn: process.env.WEBPUBSUB_CONNECTION || '',
  hub: process.env.WEBPUBSUB_HUB || 'match',
  snapHz: Math.max(5, Math.min(60, +(process.env.SNAP_HZ || 20))),
  seats: 2,                 // two players; the rest of the roster is bots
  waitSecs: 600,            // a room nobody's opponent turns up to
  overSecs: 8,              // how long snapshots keep flowing after full time
  idleSecs: 90,             // a live match with no input from anybody is abandoned
  maxSecs: 40 * 60,         // a hard ceiling on any room
};
// The same whitelist the resume snapshot uses: what a match is started FROM.
const SEL_KEYS = ['mode', 'field', 'length', 'diff', 'ball', 'party', 'botPlan', 'kickoffRule', 'boxRule', 'teamCol', 'teamFlag'];

// ---------- browser ---------------------------------------------------------------------
const pwMod = process.env.PLAYWRIGHT_MODULE || 'playwright';
let chromium = null;
async function browser(){
  if (chromium) return chromium;
  const pkg = await import(pwMod);
  const cr = (pkg.default ?? pkg).chromium;
  const exe = process.env.CHROME_PATH || installedChromium();
  chromium = await cr.launch({ args: ['--allow-file-access-from-files'], ...(exe ? { executablePath: exe } : {}) });
  return chromium;
}
function installedChromium(){
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return null;
  const dirs = readdirSync(root).filter(d => /^chromium(-\d+)?$/.test(d))
    .sort((a, b) => (+(b.split('-')[1] || 0)) - (+(a.split('-')[1] || 0)));
  for (const d of dirs) for (const rel of ['chrome-linux/chrome', 'chrome-win/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']){
    const p = join(root, d, rel); if (existsSync(p)) return p;
  }
  return null;
}

// ---------- the hub connection ----------------------------------------------------------
// One socket for the whole server, joined to every live room's two groups. Reconnects on
// its own; a room whose messages cannot be delivered simply keeps stepping until they can.
const hub = { ws: null, open: false, want: new Set(), queue: [], onMsg: null, connecting: null };
async function hubUrl(){
  if (CFG.matchWs) return CFG.matchWs;
  if (!CFG.conn) throw new Error('set MATCH_WS (dev relay) or WEBPUBSUB_CONNECTION');
  const { WebPubSubServiceClient } = await import('@azure/web-pubsub');
  const svc = new WebPubSubServiceClient(CFG.conn, CFG.hub);
  // Every room's groups, so one token covers the server's whole life. Roles on a group
  // that does not exist yet are fine — they are strings.
  const t = await svc.getClientAccessToken({ userId: 'server', expirationTimeInMinutes: 60 * 12,
    roles: ['webpubsub.joinLeaveGroup', 'webpubsub.sendToGroup'] });
  return t.url;
}
function hubSend(obj){
  if (hub.open){ try { hub.ws.send(JSON.stringify(obj)); return; } catch (_) {} }
  if (hub.queue.length < 200) hub.queue.push(obj);
}
function hubJoin(group){ hub.want.add(group); hubSend({ type: 'joinGroup', group }); }
function hubLeave(group){ hub.want.delete(group); hubSend({ type: 'leaveGroup', group }); }
function hubGroup(group, data){ hubSend({ type: 'sendToGroup', group, dataType: 'json', data, noEcho: true }); }
async function hubConnect(){
  if (hub.connecting) return hub.connecting;
  hub.connecting = (async () => {
    const url = await hubUrl();
    await new Promise((res) => {
      const ws = new WebSocket(url, 'json.webpubsub.azure.v1');
      hub.ws = ws;
      ws.onopen = () => {
        hub.open = true;
        for (const g of hub.want) ws.send(JSON.stringify({ type: 'joinGroup', group: g }));
        const q = hub.queue.splice(0); for (const o of q) hubSend(o);
        log('hub connected');
        res();
      };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch (_) { return; }
        if (m.type === 'message' && m.from === 'group' && hub.onMsg) hub.onMsg(m.group, m.data, m.fromUserId);
      };
      ws.onclose = () => { hub.open = false; hub.ws = null; hub.connecting = null; log('hub closed; reconnecting');
                           setTimeout(() => hubConnect().catch(e => log('hub reconnect failed: ' + e.message)), 2000); };
      ws.onerror = () => {};
    });
  })();
  return hub.connecting;
}

// ---------- rooms -----------------------------------------------------------------------
const rooms = new Map();
const log = (s) => console.log('[match ' + new Date().toISOString().slice(11, 19) + '] ' + s);
const roomCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
function pickSel(src){
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const k of SEL_KEYS) if (src[k] !== undefined) out[k] = src[k];
  return out;
}
function roomStatus(r){
  return { room: r.code, state: r.state, seats: r.seats.map(s => s ? { name: s.name } : null),
           tick: r.tick, st: r.st, score: r.score, since: Date.now() - r.at, bodies: r.bodies };
}
function getRoom(code){
  let r = rooms.get(code);
  if (!r){
    r = { code, state: 'waiting', seats: [null, null], sel: null, at: Date.now(), tick: 0, st: '', score: [0, 0],
          inputs: [[0, 0, 0], [0, 0, 0]], dirty: false, page: null, ctx: null, timer: null, lastIn: Date.now(),
          bodies: null, flush: null, overAt: 0 };
    rooms.set(code, r);
    hubJoin(code + '.in');      // the server only ever LISTENS on .in; it sends to <ROOM>
  }
  return r;
}
async function closeRoom(r, why){
  if (!rooms.has(r.code)) return;
  rooms.delete(r.code);
  log('room ' + r.code + ' closed: ' + why);
  if (r.timer) clearInterval(r.timer);
  if (r.flush) clearInterval(r.flush);
  hubLeave(r.code + '.in');
  try { if (r.ctx) await r.ctx.close(); } catch (_) {}
}

// A player asks for a seat. The first joiner's settings decide what is played; a
// returning `userId` gets its own seat back, so a reload mid-wait is not a third player.
function takeSeat(r, who){
  let i = r.seats.findIndex(s => s && s.userId === who.userId);
  if (i < 0) i = r.seats.findIndex(s => !s);
  if (i < 0) return -1;
  r.seats[i] = { userId: who.userId, name: String(who.name || 'Player').slice(0, 12) };
  if (!r.sel) r.sel = pickSel(who.sel);
  return i;
}

async function startRoom(r){
  r.state = 'starting';
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  r.ctx = ctx;
  const page = await ctx.newPage();
  r.page = page;
  page.on('pageerror', e => log('room ' + r.code + ' page error: ' + e.message));
  await page.addInitScript((count) => {
    window.__MAGNETDEBUG = true;
    window.__MAGNETONLINE = null;               // the server page never joins anything itself
    const mk = i => ({ index: i, id: 'Net Pad ' + i, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
    const pads = Array.from({ length: count }, (_, i) => mk(i));
    navigator.getGamepads = () => pads;
    window.__pads = pads;
    // [ [x, y, kick], ... ] per seat, straight into the virtual sticks.
    window.__netSet = (arr) => { arr.forEach((v, i) => { const g = pads[i]; if (!g) return;
      g.axes[0] = v[0]; g.axes[1] = v[1]; g.buttons[0].pressed = !!v[2]; g.buttons[0].value = v[2] ? 1 : 0; }); };
  }, CFG.seats);
  await page.exposeFunction('__netEmit', (s) => onSnap(r, s));
  await page.goto(pathToFileURL(join(CFG.gameDir, 'index.html')).href);
  await page.waitForFunction(() => !!window.__magnet, null, { timeout: 20000 });
  const names = r.seats.map(s => s.name);
  const start = await page.evaluate(({ sel, names, hz, keys }) => {
    const M = window.__magnet;
    // The first joiner's match settings, then the pins a hosted match needs: two pads take
    // the two seats, no warm-up room (nobody is there to walk about in it), no auto-replay
    // (a replay owns the canvas and freezes the loop), an upright pitch so a stick's world
    // axes are the client's world axes, and match speed 1.
    for (const k of keys) if (sel[k] !== undefined) M.sel[k] = sel[k];
    Object.assign(M.sel, { controllers: 'on', lobby: 'off', autoReplay: false, orient: 'v', matchSpeed: 1,
                           spectate: 'play', coop: 'off', dropIn: 'off', hitStop: 0 });
    if (typeof M.applyFeel === 'function') M.applyFeel();
    M.startMatch({ lobby: false });
    const w = M.world;
    const seats = [];
    for (let i = 0; i < names.length; i++){
      const idx = w.players.findIndex(p => p.ctrl === 'gamepad' && p.padIndex === i);
      seats.push(idx);
      if (idx >= 0) w.players[idx].name = names[i];
    }
    const roster = w.players.map(p => ({ team: p.team, name: p.name, color: p.color, cap: p.cap, flag: p.flag,
                                         eyes: p.eyes, r: p.r, net: p.ctrl === 'gamepad' }));
    const selOut = {}; for (const k of keys) selOut[k] = M.sel[k];
    // Snapshots, on the page's own clock. Read-only: the world is never written here.
    let k = 0;
    window.__netSnap = () => {
      const w = M.world; if (!w) return null;
      const f = [+w.ball.x.toFixed(1), +w.ball.y.toFixed(1)];
      for (const p of w.players) f.push(+p.x.toFixed(1), +p.y.toFixed(1), p.kick ? 1 : 0,
                                        +(p.faceX || 0).toFixed(2), +(p.faceY || 0).toFixed(2), +(p.chargeT || 0).toFixed(2));
      const ex = (w.extraBalls || []).map(b => [+b.x.toFixed(1), +b.y.toFixed(1)]);
      return { t: 'snap', k: k++, st: w.state, sc: w.score.slice(), clk: +(w.timeLeft || 0).toFixed(2), ot: !!w.overtime,
               ms: +(w.matchT || 0).toFixed(2), tick: w.aiTick || 0, f, ex, over: w.state === 'over' };
    };
    window.__netTimer = setInterval(() => { const s = window.__netSnap(); if (s) window.__netEmit(JSON.stringify(s)); }, Math.round(1000 / hz));
    return { t: 'start', seed: w.seed, sel: selOut, roster, seats, hz, fieldKey: w.fieldKey };
  }, { sel: r.sel, names, hz: CFG.snapHz, keys: SEL_KEYS });
  r.start = start;
  r.state = 'live';
  r.startedAt = Date.now();
  r.lastIn = Date.now();
  hubGroup(r.code, start);
  // Inputs are written once a frame at most, whatever rate they arrive at.
  r.flush = setInterval(() => {
    if (!r.dirty || !r.page) return;
    r.dirty = false;
    r.page.evaluate((arr) => window.__netSet(arr), r.inputs).catch(() => {});
  }, 16);
  log('room ' + r.code + ' live: ' + names.join(' vs ') + ' on ' + (start.sel.mode || '?') + ' / ' + start.fieldKey);
}

function onSnap(r, s){
  if (!rooms.has(r.code) || r.state === 'closed') return;
  let snap; try { snap = JSON.parse(s); } catch (_) { return; }
  r.tick = snap.tick; r.score = snap.sc; r.st = snap.st;
  // The seat bodies' positions, for the status endpoint (and the suite).
  const st = r.start;
  if (st) r.bodies = st.seats.map(i => i < 0 ? null : { x: snap.f[2 + i * 6], y: snap.f[3 + i * 6] });
  hubGroup(r.code, snap);
  const now = Date.now();
  if (snap.over && !r.overAt){ r.overAt = now; hubGroup(r.code, { t: 'over', sc: snap.sc }); log('room ' + r.code + ' full time ' + snap.sc.join('-')); }
  if (r.overAt && now - r.overAt > CFG.overSecs * 1000) closeRoom(r, 'match over');
  else if (now - r.lastIn > CFG.idleSecs * 1000) closeRoom(r, 'nobody playing');
  else if (now - r.startedAt > CFG.maxSecs * 1000) closeRoom(r, 'time cap');
}

// An input from a player: `{t:'in', s:seat, x, y, k}` on <ROOM>.in. The seat must belong
// to the sender when the hub says who sent it.
hub.onMsg = (group, data, from) => {
  if (!group.endsWith('.in') || !data || data.t !== 'in') return;
  const r = rooms.get(group.slice(0, -3));
  if (!r || r.state !== 'live') return;
  const s = data.s | 0;
  if (s < 0 || s >= CFG.seats || !r.seats[s]) return;
  if (from && r.seats[s].userId !== from) return;
  const clamp = v => Math.max(-1, Math.min(1, +v || 0));
  r.inputs[s] = [clamp(data.x), clamp(data.y), data.k ? 1 : 0];
  r.dirty = true; r.lastIn = Date.now();
};

// ---------- HTTP ------------------------------------------------------------------------
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type',
               'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (code, body) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'OPTIONS'){ res.writeHead(204, cors); res.end(); return; }
  try {
    if (url.pathname === '/health') return json(200, { ok: true, rooms: rooms.size, hub: hub.open, hz: CFG.snapHz });
    let m;
    if (req.method === 'POST' && url.pathname === '/match'){
      let body = ''; for await (const c of req){ body += c; if (body.length > 16384){ return json(413, { error: 'too big' }); } }
      let who; try { who = JSON.parse(body || '{}'); } catch (_) { return json(400, { error: 'bad json' }); }
      const code = roomCode(who.room);
      if (code.length !== 4) return json(400, { error: 'room must be four letters' });
      if (!who.userId) return json(400, { error: 'userId required (from /api/room-token)' });
      await hubConnect();
      const r = getRoom(code);
      if (r.state !== 'waiting'){
        const i = r.seats.findIndex(s => s && s.userId === who.userId);
        if (i < 0) return json(409, { error: 'match already running', ...roomStatus(r) });
        // A reconnecting player: hand the start doc back so the client can rebuild.
        return json(200, { seat: i, start: r.start, ...roomStatus(r) });
      }
      const seat = takeSeat(r, who);
      if (seat < 0) return json(409, { error: 'room is full', ...roomStatus(r) });
      hubGroup(code, { t: 'lobby', seats: r.seats.map(s => s ? s.name : null) });
      const full = r.seats.every(Boolean);
      if (full) startRoom(r).catch(e => { log('room ' + code + ' failed to start: ' + e.message); closeRoom(r, 'start failed'); });
      return json(200, { seat, ...roomStatus(r) });
    }
    if (req.method === 'GET' && (m = url.pathname.match(/^\/match\/([A-Za-z]{4})$/))){
      const r = rooms.get(roomCode(m[1]));
      if (!r) return json(404, { error: 'no such room' });
      return json(200, roomStatus(r));
    }
    json(404, { error: 'not found' });
  } catch (e){ log('http error: ' + e.message); json(500, { error: 'server error' }); }
});

// Rooms nobody's opponent turned up to.
setInterval(() => { const now = Date.now();
  for (const r of [...rooms.values()]) if (r.state === 'waiting' && now - r.at > CFG.waitSecs * 1000) closeRoom(r, 'no opponent'); }, 30000).unref();

const host = process.env.HOST || '0.0.0.0';
server.listen(CFG.port, host, () => log('listening on http://' + host + ':' + CFG.port + '  game: ' + CFG.gameDir + '  hub: ' + (CFG.matchWs ? 'dev relay' : (CFG.conn ? 'Web PubSub ' + CFG.hub : 'NONE — set MATCH_WS or WEBPUBSUB_CONNECTION'))));
process.on('SIGTERM', async () => { for (const r of [...rooms.values()]) await closeRoom(r, 'shutdown'); try { if (chromium) await chromium.close(); } catch (_) {} process.exit(0); });
