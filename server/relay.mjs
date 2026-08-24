#!/usr/bin/env node
// ============================================================
//  MAGNETBALL ONLINE RELAY — a room-code signaling + input relay server
// ============================================================
// One file, ZERO dependencies, plain Node (18+). The game's no-dependency rule is
// about the PAGE; this server keeps the same discipline anyway because a hand-rolled
// RFC 6455 endpoint is ~150 lines and `npm install` is a supply chain.
//
// What it does — and deliberately ALL it does:
//   · hands out 5-character room codes ({t:'hello'} with no room creates one)
//   · puts a joiner in the host's room ({t:'hello', room:'ABCDE'})
//   · relays every other message verbatim to the other peers in the room
// It never parses game messages, never simulates, never stores anything. The game's
// lockstep protocol lives entirely in index.html; a smarter server would be a second
// copy of it to keep in step.
//
//   node server/relay.mjs            # port 9977
//   node server/relay.mjs 0          # ephemeral port (printed) — the test suite uses this
//   PORT=8080 node server/relay.mjs
//
// ⚠️ DEPLOYMENT NEEDS TLS IN FRONT. The game is served over https (GitHub Pages), and a
// secure page may only open wss:// — plain ws:// is blocked as mixed content everywhere
// except localhost. This server speaks plain ws on purpose (TLS termination is the
// front door's job, and doing certs here would mean doing them badly): put it behind
// Caddy / nginx / a Cloudflare Tunnel / an Azure App Gateway and point the game at the
// wss:// address. On localhost, ws://localhost:9977 works from an https page as-is.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 9977);
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';   // RFC 6455 magic accept string
// ⚠️ 2 for now — the game's lockstep is written for two peers. The relay itself is
// N-way (a room is a set and a relay is a loop), so raising this is a one-line change
// the day the game speaks more seats.
const ROOM_CAP = 2;
const MAX_FRAME = 1 << 20;        // 1MB — the biggest legal message; inputs are ~50 bytes
const CODE_LEN = 5;
// No I/L/O/0/1: a room code is read out loud across a room and typed on a phone.
const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const rooms = new Map();          // code → Set(client)
let nextId = 1;

function roomCode(){
  for (let tries = 0; tries < 50; tries++){
    let c = '';
    const b = randomBytes(CODE_LEN);
    for (let i = 0; i < CODE_LEN; i++) c += CODE_ALPHA[b[i] % CODE_ALPHA.length];
    if (!rooms.has(c)) return c;
  }
  return null;                    // fifty collisions means the box has bigger problems
}

// ---------- WebSocket framing (server → client frames are unmasked) ----------
function wsFrame(opcode, payload){
  const len = payload.length;
  let head;
  if (len < 126){ head = Buffer.from([0x80 | opcode, len]); }
  else if (len < 65536){ head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}
function sendText(cl, obj){
  if (cl.sock.destroyed) return;
  try { cl.sock.write(wsFrame(0x1, Buffer.from(JSON.stringify(obj)))); } catch (e) {}
}
function sendRaw(cl, text){
  if (cl.sock.destroyed) return;
  try { cl.sock.write(wsFrame(0x1, Buffer.from(text))); } catch (e) {}
}

// Pulls one complete frame off the front of `buf`, or returns null if it isn't all
// here yet. Client → server frames MUST be masked (RFC 6455 §5.1) — an unmasked one
// is a protocol error and the connection is dropped rather than guessed at.
function parseFrame(buf){
  if (buf.length < 2) return null;
  const fin = !!(buf[0] & 0x80), opcode = buf[0] & 0x0f;
  const masked = !!(buf[1] & 0x80);
  let len = buf[1] & 0x7f, off = 2;
  if (len === 126){ if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127){
    if (buf.length < 10) return null;
    const big = buf.readBigUInt64BE(2);
    if (big > BigInt(MAX_FRAME)) return { err: 'frame too large' };
    len = Number(big); off = 10;
  }
  if (len > MAX_FRAME) return { err: 'frame too large' };
  if (!masked) return { err: 'unmasked client frame' };
  if (buf.length < off + 4 + len) return null;
  const mask = buf.subarray(off, off + 4);
  const payload = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) payload[i] = buf[off + 4 + i] ^ mask[i & 3];
  return { fin, opcode, payload, rest: buf.subarray(off + 4 + len) };
}

function joinRoom(cl, code){
  const room = rooms.get(code);
  if (!room){ sendText(cl, { t: 'err', why: 'no such room' }); return; }
  if (room.size >= ROOM_CAP){ sendText(cl, { t: 'err', why: 'room is full' }); return; }
  room.add(cl); cl.room = code;
  sendText(cl, { t: 'joined', room: code, peers: room.size });
  for (const peer of room) if (peer !== cl) sendText(peer, { t: 'peer', n: cl.n });
}

function makeRoom(cl){
  const code = roomCode();
  if (!code){ sendText(cl, { t: 'err', why: 'could not allocate a room' }); return; }
  rooms.set(code, new Set([cl])); cl.room = code;
  sendText(cl, { t: 'room', code });
}

function leaveRoom(cl){
  if (!cl.room) return;
  const room = rooms.get(cl.room);
  if (room){
    room.delete(cl);
    for (const peer of room) sendText(peer, { t: 'gone', n: cl.n });
    if (!room.size) rooms.delete(cl.room);
  }
  cl.room = null;
}

function onMessage(cl, text){
  let m = null;
  try { m = JSON.parse(text); } catch (e) {}
  if (m && m.t === 'hello'){
    leaveRoom(cl);                       // a second hello starts over cleanly
    if (m.room) joinRoom(cl, String(m.room).toUpperCase().trim());
    else makeRoom(cl);
    return;
  }
  // Everything else is relayed verbatim to the other peers in the room. Verbatim
  // matters: re-encoding would make the relay a participant in the game protocol.
  if (!cl.room) return;
  const room = rooms.get(cl.room);
  if (!room) return;
  for (const peer of room) if (peer !== cl) sendRaw(peer, text);
}

const server = createServer((req, res) => {
  // A health endpoint, so a load balancer / uptime check / curious human gets an
  // answer instead of a hang.
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(`magnetball relay ok — rooms: ${rooms.size}\n`);
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket'){
    socket.destroy(); return;
  }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
               'Upgrade: websocket\r\n' +
               'Connection: Upgrade\r\n' +
               `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);              // input packets are tiny and latency is the product

  const cl = { sock: socket, buf: Buffer.alloc(0), room: null, n: nextId++, alive: true, frag: null };

  socket.on('data', chunk => {
    cl.alive = true;
    cl.buf = cl.buf.length ? Buffer.concat([cl.buf, chunk]) : chunk;
    if (cl.buf.length > MAX_FRAME * 2){ socket.destroy(); return; }
    for (;;){
      const f = parseFrame(cl.buf);
      if (!f) return;
      if (f.err){ socket.destroy(); return; }
      cl.buf = f.rest;
      if (f.opcode === 0x8){                                    // close
        try { socket.write(wsFrame(0x8, f.payload.subarray(0, 2))); } catch (e) {}
        socket.end(); return;
      }
      if (f.opcode === 0x9){ try { socket.write(wsFrame(0xA, f.payload)); } catch (e) {} continue; }  // ping → pong
      if (f.opcode === 0xA) continue;                           // pong
      // Text/binary, possibly fragmented. Browsers won't fragment 50-byte inputs,
      // but "won't" is not "can't", so continuations are assembled rather than refused.
      if (f.opcode === 0x1 || f.opcode === 0x2){
        if (f.fin){ onMessage(cl, f.payload.toString('utf8')); }
        else cl.frag = [f.payload];
      } else if (f.opcode === 0x0 && cl.frag){
        cl.frag.push(f.payload);
        if (cl.frag.reduce((a, b) => a + b.length, 0) > MAX_FRAME){ socket.destroy(); return; }
        if (f.fin){ onMessage(cl, Buffer.concat(cl.frag).toString('utf8')); cl.frag = null; }
      }
    }
  });

  const bye = () => { leaveRoom(cl); clients.delete(cl); };
  socket.on('close', bye);
  socket.on('error', bye);
  clients.add(cl);
});

// Heartbeat: a peer that vanishes without a FIN (phone lock, network drop) would
// otherwise hold its room open forever. Any traffic counts as life; inputs at 60Hz
// mean a playing client never even sees a ping.
const clients = new Set();
const beat = setInterval(() => {
  for (const cl of clients){
    if (!cl.alive){ cl.sock.destroy(); continue; }
    cl.alive = false;
    try { cl.sock.write(wsFrame(0x9, Buffer.alloc(0))); } catch (e) {}
  }
}, 30000);
beat.unref();

server.listen(PORT, () => {
  const addr = server.address();
  console.log(`relay listening on ws://127.0.0.1:${addr.port}`);
});
