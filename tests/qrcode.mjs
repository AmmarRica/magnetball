// A QR CODE OF THE PAGE'S OWN ADDRESS, under About.
//
// ⚠️ THE ENCODER IS WRITTEN OUT IN `index.html`, because every QR library is an npm
// package or a CDN script and this game ships neither. Byte mode, error correction level
// M, versions 1-10.
//
// ⚠️ NOTHING IN THIS REPO CAN CHECK IT, so it is verified five ways, each of which fails
// differently — and the FIFTH is the one that mattered. The first four are self-contained
// and all four passed on a build whose format information was written TRANSPOSED, which
// no scanner on earth would have read:
//
//   1. ROUND TRIP. A decoder is written HERE, independently of the encoder: read the
//      format information, undo the mask, walk the same zigzag, parse the byte-mode
//      header, and get the string back. That is the claim anybody cares about — the code
//      says the URL — and it catches placement, masking, format bits and interleaving.
//   2. THE PARITY IS REAL. A round trip proves nothing about Reed-Solomon: a decoder that
//      ignores the error-correction codewords reads the data perfectly whatever they are,
//      and a QR with wrong parity is one a real scanner refuses. So the syndromes are
//      computed here, over an independent GF(256) built in this file: for a valid
//      codeword R(a^i) is ZERO for every i below the parity count. That is the definition,
//      and it needs no reference vector.
//   3. THE BCH STRINGS ARE DIVISIBLE. Format and version information are short BCH codes.
//      Published tables of them are exactly the kind of thing that gets one row wrong in a
//      copy, so what is checked is the property: unmasked, each string is divisible by its
//      generator polynomial.
//   4. THE TABLE AGREES WITH THE PICTURE. The capacity table is hand-entered, so the
//      modules the function patterns leave FREE are counted on every version and required
//      to equal `codewords x 8 + remainder bits`. That is the one check that catches a
//      wrong row in the table and a misplaced alignment pattern with the same assertion.
//   5. A WHOLE SYMBOL, PINNED, from an encoder nobody here wrote. A round trip cannot
//      catch a misunderstanding the encoder and the decoder SHARE — and they did share
//      one — so one complete matrix that `segno` emits bit for bit is checked in. See the
//      long note above it for what the cross-check established and why it is pinned
//      rather than run: it needs pip packages, and these suites run on Playwright alone.
//
// ⚠️ Plus the thing a scanner needs and none of the above looks at: a QUIET ZONE. Four
// modules of white all the way round, measured in rendered pixels on the real canvas.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|ERR_TUNNEL/i.test(m.text())) errors.push(m.text()); });
await page.addInitScript(() => { window.__MAGNETDEBUG = true; });
await page.goto('file://' + process.cwd() + '/index.html');
await page.waitForTimeout(800);

// ===================================================== the matrices, decoded ========
const TEXTS = [
  'https://ammarrica.github.io/magnetball/',
  'A',
  'https://ammarrica.github.io/magnetball/#room=7F3K2Q',
  'https://example.com/' + 'x'.repeat(120),          // pushes into a multi-block version
  'caf\u00e9 \u2014 \u00fcml\u00e4ut',               // multi-byte UTF-8
];
const enc = await page.evaluate((texts) => {
  const M = window.__magnet;
  return texts.map(t => {
    const m = M.qrMatrix(t);
    return m ? { text: t, version: m.version, mask: m.mask, size: m.size,
                 rows: m.map(r => r.join('')) } : null;
  });
}, TEXTS);

// ---- an independent GF(256), used by the decoder and the syndrome check -------------
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1;
  for (let i = 0; i < 255; i++){ EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, c) => (a && c) ? EXP[LOG[a] + LOG[c]] : 0;

// The same capacity facts, written out AGAIN here on purpose: a decoder that imports the
// encoder's table cannot disagree with it, and disagreeing is the whole job.
const CAP = { 1:[16,10,1,16,0,0], 2:[28,16,1,28,0,0], 3:[44,26,1,44,0,0], 4:[64,18,2,32,0,0],
              5:[86,24,2,43,0,0], 6:[108,16,4,27,0,0], 7:[124,18,4,31,0,0], 8:[154,22,2,38,2,39],
              9:[182,22,3,36,2,37], 10:[216,26,4,43,1,44] };
const ALIGN = { 1:[], 2:[6,18], 3:[6,22], 4:[6,26], 5:[6,30], 6:[6,34],
                7:[6,22,38], 8:[6,24,42], 9:[6,26,46], 10:[6,28,50] };
const REM = { 1:0, 2:7, 3:7, 4:7, 5:7, 6:7, 7:0, 8:0, 9:0, 10:0 };
const MASKS = [
  (i,j)=>(i+j)%2===0, (i,j)=>i%2===0, (i,j)=>j%3===0, (i,j)=>(i+j)%3===0,
  (i,j)=>(Math.floor(i/2)+Math.floor(j/3))%2===0, (i,j)=>(i*j)%2+(i*j)%3===0,
  (i,j)=>((i*j)%2+(i*j)%3)%2===0, (i,j)=>((i+j)%2+(i*j)%3)%2===0,
];

// Which modules the function patterns own — rebuilt here rather than asked for.
function reserved(ver){
  const size = 17 + 4*ver;
  const res = Array.from({length:size}, () => new Array(size).fill(0));
  const mark = (r,c) => { if (r>=0 && c>=0 && r<size && c<size) res[r][c] = 1; };
  const fin = (r0,c0) => { for (let r=-1;r<=7;r++) for (let c=-1;c<=7;c++) mark(r0+r, c0+c); };
  fin(0,0); fin(0,size-7); fin(size-7,0);
  for (let i=0;i<size;i++){ mark(6,i); mark(i,6); }
  const cs = ALIGN[ver];
  for (const r of cs) for (const c of cs){
    if ((r<=8&&c<=8) || (r<=8&&c>=size-9) || (r>=size-9&&c<=8)) continue;
    for (let dr=-2;dr<=2;dr++) for (let dc=-2;dc<=2;dc++) mark(r+dr, c+dc);
  }
  mark(size-8, 8);
  for (let i=0;i<9;i++){ mark(8,i); mark(i,8); }
  for (let i=0;i<8;i++){ mark(8,size-1-i); mark(size-1-i,8); }
  if (ver >= 7) for (let i=0;i<18;i++){
    mark(size-11+(i%3), Math.floor(i/3)); mark(Math.floor(i/3), size-11+(i%3));
  }
  return res;
}
// Read the codewords back out of a finished symbol.
function decode(rows, ver){
  const size = 17 + 4*ver;
  const g = rows.map(r => r.split('').map(Number));
  // format information, first copy, unmasked
  let f = 0;
  for (let i = 0; i < 15; i++){
    let v;
    // ⚠️ DOWN column 8 first, then LEFT along row 8. Written the other way round, this
    // decoder agreed with an encoder that was also transposed — see the pinned reference
    // matrix below, which is what caught it.
    if (i < 6) v = g[i][8];
    else if (i === 6) v = g[7][8];
    else if (i === 7) v = g[8][8];
    else if (i === 8) v = g[8][7];
    else v = g[8][14-i];
    f |= v << i;
  }
  const fmt = f ^ 0x5412;
  const ecLevel = (fmt >> 13) & 3, mask = (fmt >> 10) & 7;
  const res = reserved(ver);
  const un = g.map((row,r) => row.map((v,c) => (!res[r][c] && MASKS[mask](r,c)) ? v^1 : v));
  // the zigzag, in the same order the encoder wrote it
  const bits = [];
  let up = true;
  for (let col = size-1; col > 0; col -= 2){
    if (col === 6) col--;
    for (let n = 0; n < size; n++){
      const row = up ? size-1-n : n;
      for (let k = 0; k < 2; k++){ const cc = col-k; if (!res[row][cc]) bits.push(un[row][cc]); }
    }
    up = !up;
  }
  const cw = [];
  for (let i = 0; i + 8 <= bits.length; i += 8){
    let v = 0; for (let j = 0; j < 8; j++) v = (v<<1) | bits[i+j];
    cw.push(v);
  }
  return { cw, ecLevel, mask, remainderBits: bits.length - cw.length*8, freeModules: bits.length };
}
// De-interleave into blocks, then read the byte-mode payload out of the data stream.
function payload(cw, ver){
  const [dataCw, ecCw, g1, g1len, g2, g2len] = CAP[ver];
  const lens = [];
  for (let i=0;i<g1;i++) lens.push(g1len);
  for (let i=0;i<g2;i++) lens.push(g2len);
  const blocks = lens.map(() => []);
  let at = 0;
  for (let i = 0; i < Math.max(g1len, g2len); i++)
    for (let bI = 0; bI < lens.length; bI++) if (i < lens[bI]) blocks[bI].push(cw[at++]);
  const ecs = blocks.map(() => []);
  for (let i = 0; i < ecCw; i++) for (let bI = 0; bI < blocks.length; bI++) ecs[bI].push(cw[at++]);
  const data = [].concat(...blocks);
  // byte mode: 4-bit mode, then the count, then the bytes
  const bits = [];
  for (const v of data) for (let i = 7; i >= 0; i--) bits.push((v>>>i)&1);
  const take = (n) => { let v = 0; for (let i = 0; i < n; i++) v = (v<<1) | bits.shift(); return v; };
  const mode = take(4);
  const len = take(ver < 10 ? 8 : 16);
  const out = [];
  for (let i = 0; i < len; i++) out.push(take(8));
  return { mode, len, text: new TextDecoder().decode(new Uint8Array(out)), blocks, ecs, dataCw };
}
// Reed-Solomon syndromes. Zero for every parity position IS the definition of a valid
// codeword, so this needs no reference vector to compare against.
function syndromes(block, ec){
  const full = block.concat(ec);
  const out = [];
  for (let i = 0; i < ec.length; i++){
    let acc = 0;
    for (const c of full) acc = mul(acc, EXP[i]) ^ c;
    out.push(acc);
  }
  return out;
}
// Polynomial remainder over GF(2) — used for the two BCH strings.
function bchRem(v, gen){
  let d = v, gb = 32 - Math.clz32(gen);
  for (let i = 32 - Math.clz32(d); i >= gb; i--)
    if ((d >>> (i-1)) & 1) d ^= gen << (i - gb);
  return d;
}

let allDecoded = true, worstSyn = 0, versions = [], remainderOk = true, modulesOk = true;
const report = [];
for (let i = 0; i < enc.length; i++){
  const e = enc[i];
  if (!e){ allDecoded = false; report.push({ text: TEXTS[i], encoded: false }); continue; }
  const d = decode(e.rows, e.version);
  const p = payload(d.cw, e.version);
  const got = p.text === TEXTS[i];
  if (!got) allDecoded = false;
  versions.push(e.version);
  // every block's parity must check out
  for (let bI = 0; bI < p.blocks.length; bI++){
    const s = syndromes(p.blocks[bI], p.ecs[bI]);
    worstSyn = Math.max(worstSyn, Math.max.apply(null, s));
  }
  if (d.remainderBits !== REM[e.version]) remainderOk = false;
  if (d.freeModules !== (CAP[e.version][0] + CAP[e.version][1] * (CAP[e.version][2] + CAP[e.version][4])) * 8 + REM[e.version])
    modulesOk = false;
  report.push({ text: TEXTS[i].slice(0, 28), version: e.version, mask: e.mask, size: e.size,
                mode: p.mode, len: p.len, roundTrip: got,
                ecLevel: d.ecLevel, remainder: d.remainderBits, blocks: p.blocks.length });
}

ok('every string encodes and DECODES BACK to itself', allDecoded,
   JSON.stringify(report) + ' — the round trip is the only claim anybody cares about: the code says the URL');
ok('...in byte mode, at the length it says', report.every(x => x.encoded === false || (x.mode === 4 && x.len > 0)),
   JSON.stringify(report.map(x => [x.mode, x.len])));
ok('...at error correction level M', report.every(x => x.encoded === false || x.ecLevel === 0),
   JSON.stringify(report.map(x => x.ecLevel)) + ' — 0 is M in the format information');
ok('THE PARITY IS REAL: every block\'s Reed-Solomon syndromes are zero', worstSyn === 0,
   'worst non-zero syndrome ' + worstSyn + ' — a round trip passes with junk parity, and a real scanner would refuse the code');
ok('...and the versions really do differ across those strings', new Set(versions).size >= 3,
   JSON.stringify(versions) + ' — one version proves nothing about the capacity table');
ok('the remainder bits are what the version says', remainderOk, JSON.stringify(report.map(x => x.remainder)));
ok('THE CAPACITY TABLE AGREES WITH THE PICTURE: free modules = codewords x 8 + remainder', modulesOk,
   'a wrong row in the table and a misplaced alignment pattern both land here');


// ===================================================== a known-good matrix ==========
// ⚠️ **THE ONE CHECK THE ROUND TRIP CANNOT BE.** A decoder written by the same hand as
// the encoder shares its misunderstandings: this suite's decoder read the format
// information transposed in exactly the way the encoder wrote it, so the two agreed with
// each other, round-tripped perfectly, and disagreed with every scanner in the world.
// What caught it was diffing whole matrices against an INDEPENDENT encoder.
//
// ⚠️ That cross-check is not run here, and deliberately: it needs `segno` and OpenCV from
// pip, and these suites run on Playwright and nothing else. What it produced is pinned
// instead — one complete symbol that a third-party encoder emits bit for bit. Any
// regression in placement, masking, format bits, Reed-Solomon or interleaving moves at
// least one of these 841 modules.
//
// ⚠️ The string is at v3's EXACT byte capacity on purpose. Below capacity the two
// implementations legitimately differ: `segno` appends a spurious zero codeword when the
// stream is already byte-aligned (`8 - (length % 8)` yields 8 rather than 0), which the
// specification does not ask for and which this encoder does not do. At exact capacity
// the terminator is truncated, there is no padding at all, and the two agree exactly.
//
// ⚠️ What the cross-check established, recorded so nobody has to do it twice: v3, v7, v9
// and v10 at exact capacity are byte-identical to `segno`; the mask choice is scored
// against the specification's own penalty rules and agrees with an independent scoring
// of them (`segno` sometimes picks a different mask, which is an optimisation rather
// than a correctness matter); and over 150 random URLs rendered and read back by
// OpenCV's detector, this encoder failed 4 and `segno` failed 5 — the same, and the
// detector's limit rather than either encoder's.
const REF_TEXT = 'MAGNETBALL-MAGNETBALL-MAGNETBALL-MAGNETBAL';
const REF_MASK = 1, REF_VER = 3;
const REF = [
  '11111110101010110011001111111',
  '10000010010101101010101000001',
  '10111010110111100101001011101',
  '10111010000110100011001011101',
  '10111010011011110110101011101',
  '10000010100110101000001000001',
  '11111110101010101010101111111',
  '00000000010110100010100000000',
  '10100011000011011100100100101',
  '01010100100100101000100101100',
  '10010011110011010001111011001',
  '11111000101000001010110111011',
  '01000111110111001100101111101',
  '00010100101010001100100101000',
  '00000111111000110001001010101',
  '00011100011010001000011111010',
  '01100010111011001101101100111',
  '00010000100000010000100001000',
  '11110010010001111101100111101',
  '00011101011110101011001111010',
  '11101110101111001101111111100',
  '00000000100001001010100010000',
  '11111110110111011101101011001',
  '10000010001000001001100011001',
  '10111010011111101101111111110',
  '10111010001111001000010000001',
  '10111010100110010010111010111',
  '10000010001011100001010001000',
  '11111110111001111100101001101',
];
const got = await page.evaluate((t) => {
  const m = window.__magnet.qrMatrix(t);
  return { rows: m.map(r => r.join('')), version: m.version, mask: m.mask };
}, REF_TEXT);
// ⚠️ Braced. Written without them the `else` binds to the innermost `if` — the one
// inside both loops — so every module that MATCHED set the counter to -1.
let modDiff = 0;
if (got.rows.length !== REF.length){
  modDiff = -1;
} else {
  for (let r = 0; r < REF.length; r++)
    for (let c = 0; c < REF[r].length; c++)
      if (REF[r][c] !== got.rows[r][c]) modDiff++;
}
ok('the whole symbol matches a third-party encoder, bit for bit', modDiff === 0,
   modDiff + ' modules differ from the pinned reference (version ' + got.version + ' mask ' + got.mask +
   ') — this is the only check that catches the encoder and this suite\'s decoder being wrong in the same way');
ok('...at the version and mask it was pinned at', got.version === REF_VER && got.mask === REF_MASK,
   JSON.stringify({ version: got.version, mask: got.mask }));

// ===================================================== the two BCH strings ==========
const bch = await page.evaluate(() => {
  const M = window.__magnet, o = { fmt: [], ver: [] };
  for (let k = 0; k < 8; k++) o.fmt.push(M.qrFormatBits(k));
  for (let v = 7; v <= 10; v++) o.ver.push([v, M.qrVersionBits(v)]);
  return o;
});
ok('the FORMAT strings are valid BCH', bch.fmt.every(f => bchRem((f ^ 0x5412) >>> 0, 0x537) === 0),
   JSON.stringify(bch.fmt.map(f => (f ^ 0x5412).toString(2))) +
   ' — unmasked, each must divide by 0x537. Checked as the property rather than against a copied table, which is where these go wrong');
ok('...and they are 15 bits and all different', new Set(bch.fmt).size === 8 && bch.fmt.every(f => f >= 0 && f < 32768),
   JSON.stringify(bch.fmt));
ok('the VERSION strings are valid BCH', bch.ver.every(([v, x]) => bchRem(x >>> 0, 0x1f25) === 0 && (x >>> 12) === v),
   JSON.stringify(bch.ver.map(([v, x]) => [v, x.toString(2)])) + ' — must divide by 0x1F25 and carry the version in its top six bits');

// ===================================================== capacity and refusal =========
const cap = await page.evaluate(() => {
  const M = window.__magnet, o = {};
  o.caps = []; for (let v = 1; v <= 10; v++) o.caps.push(M.qrCapacity(v));
  o.picksSmallest = M.qrMatrix('x').version === 1;
  o.growsWithText = M.qrMatrix('x'.repeat(120)).version > M.qrMatrix('x'.repeat(20)).version;
  // ⚠️ Refuses rather than truncating. A code that silently drops the end of a URL is a
  // code that leads somewhere else, which is worse than no code at all.
  o.tooLong = M.qrMatrix('x'.repeat(4000));
  o.atTheLimit = !!M.qrMatrix('x'.repeat(M.qrCapacity(10)));
  o.justOver = M.qrMatrix('x'.repeat(M.qrCapacity(10) + 1));
  o.emptyStillWorks = !!M.qrMatrix('');
  return o;
}, null);
ok('capacity rises with the version', cap.caps.every((v, i) => i === 0 || v > cap.caps[i-1]),
   JSON.stringify(cap.caps));
ok('the smallest version that fits is the one used', cap.picksSmallest && cap.growsWithText,
   JSON.stringify({ smallest: cap.picksSmallest, grows: cap.growsWithText }));
ok('a string that does not fit is REFUSED, not truncated', cap.tooLong === null && cap.justOver === null,
   'a code that silently drops the end of a URL leads somewhere else, which is worse than no code');
ok('...and the last string that DOES fit still encodes', cap.atTheLimit && cap.emptyStillWorks,
   JSON.stringify({ atLimit: cap.atTheLimit, empty: cap.emptyStillWorks }) +
   ' — without this, "it refuses" is satisfied by a build that refuses everything');

// ===================================================== on the page ==================
// ⚠️ Served over HTTP, because the whole feature is gated on there being an address
// somebody else could open — on the file:// page every other suite uses, the honest
// answer is the refusal, and that is checked too, below.
const { createServer } = await import('node:http');
const { readFileSync } = await import('node:fs');
const html = readFileSync(process.cwd() + '/index.html');
const srv = createServer((rq, rs) => { rs.writeHead(200, {'content-type':'text/html'}); rs.end(html); });
await new Promise(r => srv.listen(0, r));
const port = srv.address().port;

const web = await b.newPage({ viewport: { width: 1280, height: 900 } });
web.on('pageerror', e => errors.push(e.message));
await web.addInitScript(() => { window.__MAGNETDEBUG = true; });
await web.goto('http://127.0.0.1:' + port + '/index.html');
await web.waitForTimeout(800);
const shown = await web.evaluate(() => {
  const M = window.__magnet, o = {};
  M.openSection('about');
  M.buildAbout();
  const host = document.getElementById('qrWrap');
  const cv = host && host.querySelector('canvas');
  o.hasCanvas = !!cv;
  o.url = M.shareUrl();
  // ⚠️ NOT location.href: that carries the query and the hash this session happens to
  // have, and the code is meant to open the game rather than reproduce this tab.
  o.notHref = o.url === location.origin + location.pathname;
  o.caption = (host.querySelector('.qrurl') || {}).textContent || '';
  if (!cv) return o;
  const r = cv.getBoundingClientRect();
  o.w = Math.round(r.width); o.h = Math.round(r.height);
  o.square = Math.abs(r.width - r.height) < 1;
  o.onScreen = r.width > 80 && r.top > -1e5;
  // the code really is of the URL
  const m = M.qrMatrix(o.url);
  o.encodesUrl = !!m;
  // ---- the quiet zone, measured on the canvas itself ----
  const c = cv.getContext('2d');
  const px = cv.width / (m.size + 8);
  o.modulePx = px;
  const at = (x, y) => { const d = c.getImageData(Math.round(x), Math.round(y), 1, 1).data;
                         return d[0] + d[1] + d[2]; };
  // four modules of white on every side, sampled just inside the border
  let quiet = true;
  for (let t = 0; t < 1; t += 0.05){
    const s = cv.width;
    for (const p of [[t*s, px*2], [t*s, s - px*2], [px*2, t*s], [s - px*2, t*s]])
      if (at(p[0], p[1]) < 700) quiet = false;
  }
  o.quietZoneWhite = quiet;
  // ...and there is real ink inside it, or "all white" would satisfy the line above
  let dark = 0;
  const img = c.getImageData(0, 0, cv.width, cv.height).data;
  for (let i = 0; i < img.length; i += 4) if (img[i] < 128) dark++;
  o.darkFraction = +(dark / (cv.width * cv.height)).toFixed(3);
  return o;
});
srv.close();
await web.close();

ok('the About card shows a QR canvas', shown.hasCanvas, JSON.stringify(shown));
ok('...of the page address, not of location.href', shown.notHref && /^https?:\/\//.test(shown.url),
   JSON.stringify({ url: shown.url, matches: shown.notHref }));
ok('...with the address written under it too', shown.caption === shown.url,
   JSON.stringify({ caption: shown.caption, url: shown.url }) + ' — somebody without a camera has to be able to type it');
ok('...square, and big enough to point a phone at', shown.square && shown.w >= 120,
   JSON.stringify({ w: shown.w, h: shown.h }));
ok('THE QUIET ZONE IS WHITE all the way round', shown.quietZoneWhite,
   'four modules of white is what lets a scanner find the finder patterns at all — without it the code is unreadable however correct the modules are');
ok('...and there is real ink inside it', shown.darkFraction > 0.15 && shown.darkFraction < 0.7,
   'dark fraction ' + shown.darkFraction + ' — "the border is white" is also true of a blank canvas');

// ===================================================== and on a file:// page ========
const off = await page.evaluate(() => {
  const M = window.__magnet;
  M.openSection('about'); M.buildAbout();
  const host = document.getElementById('qrWrap');
  return { url: M.shareUrl(), canvas: !!host.querySelector('canvas'),
           says: host.textContent.trim(), leaksPath: /file:|\/home\/|C:\\\\/.test(host.textContent) };
});
ok('a downloaded copy says there is no address to share', off.url === '' && !off.canvas && off.says.length > 10,
   JSON.stringify(off) + ' — the downloadOffline rule: relabel rather than hide, and never claim something you cannot do');
ok('...and it does not print the local path', !off.leaksPath,
   JSON.stringify(off.says) + ' — location.href on a file:// page is an absolute path on somebody\'s disk');

await page.close();
await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
console.log(JSON.stringify({ report, bchFmt: bch.fmt.length, cap: cap.caps, shown, off }, null, 1));
if (fails.length){ console.log('FAIL qrcode'); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log('PASS qrcode');
