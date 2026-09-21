// A stand-in for Azure Web PubSub, for running the match server on one machine.
//
// It speaks the subset of the `json.webpubsub.azure.v1` subprotocol the game and the
// match server use — joinGroup, leaveGroup, sendToGroup and the `message` envelope a
// group member receives — over a WebSocket server written against RFC 6455 directly, so
// this folder needs no `ws` package. It also answers `GET /api/room-token`, the one API
// call the client makes before opening a socket, so the browser goes through exactly the
// same steps against this as against Azure and nothing in `index.html` knows which it is
// talking to.
//
// ⚠️ NOT FOR THE INTERNET. There is no authentication (every token is "dev"), no limits
// and no TLS. It exists so `tests/netmatch.mjs` can run without an Azure account and so a
// developer can play a hosted match on localhost. In production the game's `online.json`
// names the real Web PubSub through the Functions API, and this file is never started.
//
//   node server/match/relay.mjs --port 7071
//
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeFrame(text){
  const data = Buffer.from(text, 'utf8');
  const len = data.length;
  let head;
  if (len < 126){ head = Buffer.from([0x81, len]); }
  else if (len < 65536){ head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, data]);
}
function closeFrame(code){ const b = Buffer.alloc(4); b[0] = 0x88; b[1] = 2; b.writeUInt16BE(code, 2); return b; }

// Parses as many complete frames as `buf` holds; returns [frames, rest]. Client frames
// are masked, which is what the four-byte XOR below undoes. Continuation frames are
// joined into the message they continue.
function parseFrames(buf, state){
  const out = [];
  let off = 0;
  while (buf.length - off >= 2){
    const b0 = buf[off], b1 = buf[off + 1];
    const fin = !!(b0 & 0x80), op = b0 & 0x0f, masked = !!(b1 & 0x80);
    let len = b1 & 0x7f, p = off + 2;
    if (len === 126){ if (buf.length < p + 2) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127){ if (buf.length < p + 8) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    let mask = null;
    if (masked){ if (buf.length < p + 4) break; mask = buf.subarray(p, p + 4); p += 4; }
    if (buf.length < p + len) break;
    const payload = Buffer.from(buf.subarray(p, p + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    off = p + len;
    if (op === 0x0){ state.parts.push(payload); if (fin){ out.push({ op: state.op, data: Buffer.concat(state.parts) }); state.parts = []; } }
    else if (op === 0x1 || op === 0x2){ if (fin) out.push({ op, data: payload }); else { state.op = op; state.parts = [payload]; } }
    else out.push({ op, data: payload });
  }
  return [out, buf.subarray(off)];
}

export function createRelay(opts = {}){
  const groups = new Map();          // group name → Set of sockets
  const conns = new Set();
  let nextId = 1;
  const stats = { connections: 0, messages: 0 };

  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type',
                 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
  const http = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS'){ res.writeHead(204, cors); res.end(); return; }
    const json = (code, body) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/health') return json(200, { ok: true, relay: true, connections: conns.size, groups: groups.size, ...stats });
    if (url.pathname === '/api/room-token'){
      // The same shape `server/src/roomToken.js` returns, so the client code is one path.
      const room = String(url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (room.length !== 4) return json(400, { error: 'room must be four letters' });
      const name = String(url.searchParams.get('name') || 'Player').slice(0, 24);
      const host = req.headers.host || ('127.0.0.1:' + http.address().port);
      const userId = name + '#' + randomBytes(3).toString('hex');
      return json(200, { url: 'ws://' + host + '/client/hubs/match?access_token=dev&user=' + encodeURIComponent(userId), room, userId });
    }
    json(404, { error: 'not found' });
  });

  http.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://x');
    const key = req.headers['sec-websocket-key'];
    if (!key || !url.pathname.startsWith('/client/hubs/')){ socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    const proto = /json\.webpubsub\.azure\.v1/.test(req.headers['sec-websocket-protocol'] || '') ? 'Sec-WebSocket-Protocol: json.webpubsub.azure.v1\r\n' : '';
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
                 'Sec-WebSocket-Accept: ' + accept + '\r\n' + proto + '\r\n');
    const c = { socket, id: 'c' + (nextId++), userId: url.searchParams.get('user') || ('anon' + nextId),
                groups: new Set(), buf: Buffer.alloc(0), state: { op: 1, parts: [] }, open: true };
    conns.add(c); stats.connections++;
    const send = (obj) => { if (c.open) try { socket.write(encodeFrame(JSON.stringify(obj))); } catch (_) {} };
    c.send = send;
    send({ type: 'system', event: 'connected', connectionId: c.id, userId: c.userId });
    const leaveAll = () => { for (const g of c.groups){ const s = groups.get(g); if (s){ s.delete(c); if (!s.size) groups.delete(g); } } c.groups.clear(); };
    const close = () => { if (!c.open) return; c.open = false; leaveAll(); conns.delete(c); try { socket.end(); } catch (_) {} };
    socket.on('data', chunk => {
      c.buf = Buffer.concat([c.buf, chunk]);
      const [frames, rest] = parseFrames(c.buf, c.state);
      c.buf = Buffer.from(rest);
      for (const f of frames){
        if (f.op === 0x8){ try { socket.write(closeFrame(1000)); } catch (_) {} close(); return; }
        if (f.op === 0x9){ try { socket.write(Buffer.concat([Buffer.from([0x8a, f.data.length]), f.data])); } catch (_) {} continue; }
        if (f.op !== 0x1) continue;
        let m; try { m = JSON.parse(f.data.toString('utf8')); } catch (_) { continue; }
        stats.messages++;
        const ack = (ok, err) => { if (m.ackId != null) send({ type: 'ack', ackId: m.ackId, success: !!ok, ...(err ? { error: { name: 'Failed', message: err } } : {}) }); };
        if (m.type === 'joinGroup' && typeof m.group === 'string'){
          let s = groups.get(m.group); if (!s){ s = new Set(); groups.set(m.group, s); }
          s.add(c); c.groups.add(m.group); ack(true);
        } else if (m.type === 'leaveGroup' && typeof m.group === 'string'){
          const s = groups.get(m.group); if (s){ s.delete(c); if (!s.size) groups.delete(m.group); }
          c.groups.delete(m.group); ack(true);
        } else if (m.type === 'sendToGroup' && typeof m.group === 'string'){
          const s = groups.get(m.group);
          const env = { type: 'message', from: 'group', group: m.group, dataType: m.dataType || 'json',
                        data: m.data, fromUserId: c.userId };
          if (s) for (const o of s){ if (m.noEcho && o === c) continue; o.send(env); }
          ack(true);
        } else if (m.type === 'event'){ ack(true); }
        else ack(false, 'unknown message type');
      }
    });
    socket.on('close', close);
    socket.on('error', close);
  });

  const listen = (port = opts.port || 0, host = opts.host || '127.0.0.1') =>
    new Promise(res => http.listen(port, host, () => res(http.address().port)));
  const stop = () => new Promise(res => { for (const c of [...conns]){ try { c.socket.destroy(); } catch (_) {} } http.close(() => res()); });
  return { listen, stop, http, groups, conns, stats };
}

// CLI
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())){
  const args = process.argv.slice(2);
  const at = args.indexOf('--port');
  const port = at >= 0 ? +args[at + 1] : +(process.env.RELAY_PORT || 7071);
  const host = process.env.RELAY_HOST || '127.0.0.1';
  const relay = createRelay({ port, host });
  const p = await relay.listen(port, host);
  console.log('[relay] listening on http://' + host + ':' + p + '  (ws at /client/hubs/match)');
}
