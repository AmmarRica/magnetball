// THE MP4 A RECORDER HANDS BACK SAYS IT IS ZERO SECONDS LONG.
//
// `MediaRecorder` writes a STREAMING fragmented MP4. It cannot know the length while it
// is recording, so it writes 0 into the movie header and never returns to fix it, and it
// appends no index either. Measured on a reported 13.8MB file: **4,286 frames = 91.3
// seconds** of real video, with `mvhd` duration **0** and `mdhd` duration
// **1664/30000 = 0.055s**. An app that reads the container — Instagram's picker, Photos —
// sees a zero-length clip and shows it as broken or refuses it, which is what
// *"video not showing as full regular video when I try to pick it to post"* was.
//
// ⚠️ **EVERY EXISTING CHECK WAS BLIND TO IT, AND NOT BY BAD LUCK.** Chrome plays the file
// perfectly by scanning fragments, so `clipfile`, `filmrec`, `fastexport` and `replayfile`
// — which decode frames, count them and measure playback — all pass on the broken file.
// The defect exists ONLY in the declared metadata, so the check has to read the bytes.
//
// ⚠️ **THE ASPECT RATIO WAS THE FIRST DIAGNOSIS AND IT WAS WRONG.** A phone-shaped export
// is 0.462 against Instagram's tallest 0.5625, which is real, is worth fixing, and is NOT
// what was reported. Recorded because it is the plausible answer somebody reaches for.
//
// ⚠️ **A REMUX NEEDS NO H.264 ENCODER OR DECODER**, which is why this is verifiable here
// when an MP4 muxer for `VideoEncoder` output is not: the compressed samples are copied
// through and only the tables are rebuilt. So the load-bearing check is a BYTE COMPARE of
// the video payload — "the picture is unchanged" is measured, not asserted.
//
// ⚠️ **THE FIXTURE IS SYNTHETIC AND MUST STAY FAITHFUL.** It is built to what
// MediaRecorder actually emits — **version 1 headers**, `default-base-is-moof`, per-sample
// duration/size/flags in `trun` — because a v0 fixture cannot see the bug that was hit
// while writing this: `tkhd`'s duration sits at +28 in v0 and +36 in v1, so a v0-only
// writer silently overwrites `track_ID`. Both versions are fed in.
import { chromium, LAUNCH } from './_browser.mjs';

// ---------- build a fragmented MP4 the way MediaRecorder does ----------
const u8 = (...a) => new Uint8Array(a);
const u32 = n => u8((n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255);
const u64 = n => new Uint8Array([...u32(Math.floor(n/4294967296)), ...u32(n>>>0)]);
const u16 = n => u8((n>>8)&255, n&255);
function cat(parts){
  let n=0; for (const p of parts) n+=p.length;
  const o=new Uint8Array(n); let i=0; for (const p of parts){ o.set(p,i); i+=p.length; } return o;
}
function box(type, ...parts){
  const body = cat(parts), t = new Uint8Array(4);
  for (let i=0;i<4;i++) t[i]=type.charCodeAt(i);
  return cat([u32(body.length+8), t, body]);
}
const zeros = n => new Uint8Array(n);
const MATRIX = cat([u32(0x00010000),u32(0),u32(0),u32(0),u32(0x00010000),u32(0),u32(0),u32(0),u32(0x40000000)]);

function makeFrag({ ver = 1, samples, mediaTs = 30000, movieTs = 1000, w = 1007, h = 1861 }){
  const T = (n) => ver ? u64(n) : u32(n);
  const CREATE = 0xe6be8d76;
  // ⚠️ Durations are written as MediaRecorder writes them: mvhd 0, tkhd/mdhd a stub.
  const mvhd = box('mvhd', u8(ver,0,0,0), T(CREATE), T(CREATE), u32(movieTs), T(0),
    u32(0x00010000), u16(0x0100), zeros(2), zeros(8), MATRIX, zeros(24), u32(2));
  const tkhd = box('tkhd', u8(ver,0,0,3), T(CREATE), T(CREATE), u32(1), zeros(4), T(1664),
    zeros(8), u16(0), u16(0), u16(0), zeros(2), MATRIX, u32(w<<16), u32(h<<16));
  const mdhd = box('mdhd', u8(ver,0,0,0), T(CREATE), T(CREATE), u32(mediaTs), T(1664),
    u16(0x55c4), u16(0));
  const hdlr = box('hdlr', u32(0), u32(0), u8(0x76,0x69,0x64,0x65), zeros(12), u8(0));
  // An opaque stand-in for the avc1 sample entry — the remuxer copies `stsd` verbatim and
  // never looks inside it, which is exactly what makes it codec-agnostic.
  const stsd = box('stsd', u32(0), u32(1), box('avc1', zeros(6), u16(1), zeros(16),
    u16(w), u16(h), u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(24), u16(0xffff),
    box('avcC', u8(1,0x64,0,0x1f,0xff,0xe1,0,4, 0x67,0x64,0,0x1f, 1,0,4, 0x68,0xee,0x3c,0xb0))));
  const stbl = box('stbl', stsd, box('stts',u32(0),u32(0)), box('stsc',u32(0),u32(0)),
    box('stsz',u32(0),u32(0),u32(0)), box('stco',u32(0),u32(0)));
  const dinf = box('dinf', box('dref', u32(0), u32(1), box('url ', u32(1))));
  const minf = box('minf', box('vmhd', u32(1), zeros(8)), dinf, stbl);
  const trak = box('trak', tkhd, box('mdia', mdhd, hdlr, minf));
  const mvex = box('mvex', box('trex', u32(0), u32(1), u32(1), u32(0), u32(0), u32(0)));
  const ftyp = box('ftyp', u8(0x69,0x73,0x6f,0x6d), u32(0),
    u8(0x69,0x73,0x6f,0x6d), u8(0x69,0x73,0x6f,0x36), u8(0x61,0x76,0x63,0x31));
  const moov = box('moov', mvhd, mvex, trak);

  // fragments of 10 samples each
  const frags = [];
  const payloads = [];
  for (let f = 0; f * 10 < samples.length; f++){
    const grp = samples.slice(f*10, f*10+10);
    const data = cat(grp.map(s => s.bytes));
    payloads.push(data);
    // trun: data-offset(0x1) + per-sample duration(0x100), size(0x200), flags(0x400)
    const trunEntries = cat(grp.map(s => cat([
      u32(s.dur), u32(s.bytes.length), u32(s.sync ? 0x02000000 : 0x00010000) ])));
    const trunLen = 8 + 8 + 4 + trunEntries.length;       // hdr + vf/cnt + dataOffset + rows
    // tfhd with default-base-is-moof (0x020000) and NO base offset — MediaRecorder's shape,
    // so `trun.data_offset` is measured from the start of the `moof`.
    const tfhd = box('tfhd', u8(0,0x02,0,0x20), u32(1), u32(0));   // + default_sample_flags
    const mfhd = box('mfhd', u32(0), u32(f+1));
    const tfdt = box('tfdt', u8(1,0,0,0), u64(grp.length ? f*10*grp[0].dur : 0));
    // moof size must be known before the data offset can be written, and the offset is
    // part of the moof — so size it first with a placeholder, then write the real value.
    const trafLen = 8 + tfhd.length + tfdt.length + trunLen;
    const moofLen = 8 + mfhd.length + trafLen;
    const dataOffset = moofLen + 8;                        // past moof + mdat header
    const trun = box('trun', u8(0,0,0x07,0x01), u32(grp.length), u32(dataOffset), trunEntries);
    const moof = box('moof', mfhd, box('traf', tfhd, tfdt, trun));
    if (moof.length !== moofLen) throw new Error('fixture: moof size drifted');
    frags.push(moof, box('mdat', data));
  }
  return { bytes: cat([ftyp, moov, ...frags]), payload: cat(payloads) };
}

function mkSamples(n){
  const out = [];
  for (let i = 0; i < n; i++){
    // distinctive bytes so a byte-compare of the payload actually means something
    const len = 40 + (i % 7) * 8;
    const b = new Uint8Array(len);
    for (let j = 0; j < len; j++) b[j] = (i * 31 + j * 7) & 255;
    out.push({ bytes: b, dur: 1000 + (i % 3 === 0 ? 1 : 0), sync: i % 10 === 0 });
  }
  return out;
}

// ---------- read a progressive MP4 back ----------
const rd32 = (b,o) => ((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0;
const rd64 = (b,o) => rd32(b,o)*4294967296 + rd32(b,o+4);
function walk(b, off, end, dep=0){
  const out=[];
  while (off+8<=end){
    let sz=rd32(b,off); const typ=String.fromCharCode(b[off+4],b[off+5],b[off+6],b[off+7]);
    let hdr=8;
    if (sz===1){ sz=rd64(b,off+8); hdr=16; } else if (sz===0) sz=end-off;
    if (sz<hdr) break;
    out.push({dep,typ,off,sz,body:off+hdr});
    if (['moov','trak','mdia','minf','stbl'].includes(typ)) out.push(...walk(b,off+hdr,off+sz,dep+1));
    off+=sz;
  }
  return out;
}
const DUR_AT = { mvhd:[24,32], tkhd:[28,36], mdhd:[24,32] };
function durOf(b, box){
  const ver = b[box.off+8] ? 1 : 0, at = box.off + DUR_AT[box.typ][ver];
  return ver ? rd64(b, at) : rd32(b, at);
}

const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:420,height:860}, hasTouch:true, isMobile:true });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const o = {};

// ---- 1+2) remux a v1 fixture (what MediaRecorder really writes) and a v0 one
for (const ver of [1, 0]){
  const tag = 'v' + ver;
  const samples = mkSamples(40);
  const fix = makeFrag({ ver, samples });
  const expectMedia = samples.reduce((s,x)=>s+x.dur, 0);
  const expectMovie = Math.round(expectMedia * 1000 / 30000);

  const got = await p.evaluate(async (arr) => {
    const out = window.__magnet.mp4Remux(new Uint8Array(arr));
    return out ? Array.from(out) : null;
  }, Array.from(fix.bytes));
  o[tag + '_remuxed'] = !!got;
  if (!got) continue;
  const d = new Uint8Array(got);
  const bx = walk(d, 0, d.length);
  const by = Object.fromEntries(bx.map(x => [x.typ, x]));

  o[tag + '_progressive'] = !bx.some(x => ['moof','mvex','mfra','sidx'].includes(x.typ));
  o[tag + '_mvhdDur'] = durOf(d, by.mvhd);
  o[tag + '_mdhdDur'] = durOf(d, by.mdhd);
  o[tag + '_tkhdDur'] = durOf(d, by.tkhd);
  o[tag + '_durTrue'] = durOf(d, by.mvhd) === expectMovie &&
                        durOf(d, by.tkhd) === expectMovie &&
                        durOf(d, by.mdhd) === expectMedia;

  // ⚠️ THE LOAD-BEARING CHECK: the compressed video is passed through untouched.
  const mdat = by.mdat;
  const outPayload = d.subarray(mdat.body, mdat.off + mdat.sz);
  o[tag + '_videoIdentical'] = outPayload.length === fix.payload.length &&
    outPayload.every((v,i) => v === fix.payload[i]);

  // tables agree with each other and with the mdat
  const stsz = by.stsz, nS = rd32(d, stsz.body+8);
  let sum = 0; for (let i=0;i<nS;i++) sum += rd32(d, stsz.body+12+i*4);
  const stts = by.stts, nR = rd32(d, stts.body+4);
  let cnt = 0, ticks = 0;
  for (let i=0;i<nR;i++){ const c=rd32(d,stts.body+8+i*8), v=rd32(d,stts.body+12+i*8); cnt+=c; ticks+=c*v; }
  const stco = by.stco;
  o[tag + '_tables'] = nS === samples.length && cnt === samples.length &&
    sum === mdat.sz - 8 && ticks === expectMedia &&
    rd32(d, stco.body+8) === mdat.body && rd32(d, stco.body+4) === 1;

  // sync samples: exactly the keyframes, 1-based
  const stss = by.stss, nK = stss ? rd32(d, stss.body+4) : 0;
  const keys = []; for (let i=0;i<nK;i++) keys.push(rd32(d, stss.body+8+i*4));
  const want = samples.map((s,i)=>s.sync?i+1:0).filter(Boolean);
  o[tag + '_syncTable'] = keys.length === want.length && keys.every((v,i)=>v===want[i]);

  // ⚠️ ONLY the duration may change in a header. This is the check that catches writing
  // a v1 duration at a v0 offset — which clobbers `track_ID` and is the bug that was hit.
  const src = fix.bytes, sbx = walk(src, 0, src.length);
  const sby = Object.fromEntries(sbx.map(x => [x.typ, x]));
  let headersClean = true, clobbered = [];
  for (const t of ['mvhd','tkhd','mdhd']){
    const a = src.subarray(sby[t].off, sby[t].off + sby[t].sz);
    const c = d.subarray(by[t].off, by[t].off + by[t].sz);
    if (a.length !== c.length){ headersClean = false; clobbered.push(t+':size'); continue; }
    const at = DUR_AT[t][d[by[t].off+8] ? 1 : 0], w = d[by[t].off+8] ? 8 : 4;
    for (let i=0;i<a.length;i++){
      if (a[i] !== c[i] && (i < at || i >= at + w)){ headersClean = false; clobbered.push(`${t}@${i}`); }
    }
  }
  o[tag + '_headersClean'] = headersClean;
  if (!headersClean) o[tag + '_clobbered'] = clobbered.slice(0,8);
  // and the track survived intact — read at the version's own offset
  const tv = d[by.tkhd.off+8] ? 1 : 0;
  o[tag + '_trackId'] = rd32(d, by.tkhd.off + (tv ? 28 : 20));
}

// ---- 3) THE WIRING: the real export path must remux what the recorder gives it.
// A stand-in MediaRecorder that emits a genuine fragmented MP4 in chunks, because this
// Chromium has no H.264 encoder and cannot produce one itself.
{
  const samples = mkSamples(40);
  const fix = makeFrag({ ver: 1, samples });
  const expectMovie = Math.round(samples.reduce((s,x)=>s+x.dur,0) * 1000 / 30000);
  const got = await p.evaluate(async (arr) => {
    const M = window.__magnet; const wait = ms => new Promise(r=>setTimeout(r,ms));
    M.sel.autoReplay=false; M.sel.lobby='off'; M.sel.mode='2v2'; M.sel.length='5';
    M.applyDisplayMode(); await wait(120);
    M.setMatchSeed(3); M.startMatch({lobby:false});
    const w = M.world; w.state='play'; w.stateT=2;
    for (let i=0;i<300;i++) M.step(w);
    const full = M.repMatchFileBuild();
    const doc = { ...full, frames: full.frames.slice(0, 60) };
    try { delete window.VideoEncoder; } catch(e){}       // force the real-time path

    const bytes = new Uint8Array(arr);
    const RealRec = window.MediaRecorder;
    function FakeRec(){ this.mimeType = 'video/mp4;codecs=avc1.4d002a'; this.state='inactive'; this._at=0; }
    FakeRec.isTypeSupported = m => /mp4/i.test(m);
    FakeRec.prototype._emit = function(n){
      if (this._at >= bytes.length || !this.ondataavailable) return;
      const end = Math.min(bytes.length, this._at + n);
      this.ondataavailable({ data: new Blob([bytes.subarray(this._at, end)], { type:this.mimeType }) });
      this._at = end;
    };
    FakeRec.prototype.start = function(){ this.state='recording';
      this._t = setInterval(()=>this._emit(700), 60); };
    FakeRec.prototype.requestData = function(){ this._emit(bytes.length); };
    FakeRec.prototype.stop = function(){ clearInterval(this._t); this._emit(bytes.length);
      this.state='inactive'; setTimeout(()=>{ if (this.onstop) this.onstop(); }, 0); };
    window.MediaRecorder = FakeRec;

    let out=null;
    const A = document.createElement.bind(document);
    document.createElement = (t)=>{ const el=A(t);
      if (t==='a') el.click=function(){ out={name:this.download, href:this.href}; }; return el; };
    let why;
    try { why = await M.recordAndShareClip(null, () => M.playReplayFile(doc, 1), 'match', doc, 1); }
    finally { document.createElement = A; window.MediaRecorder = RealRec; }
    if (!out) return { why, none:true };
    const bl = await (await fetch(out.href)).blob();
    return { why, name: out.name, type: bl.type, bytes: Array.from(new Uint8Array(await bl.arrayBuffer())) };
  }, Array.from(fix.bytes));

  o.wire_named = /\.mp4$/.test(got.name || '');
  o.wire_quiet = !/⚠|Stopped|webm/i.test(got.why || '');
  if (got.bytes){
    const d = new Uint8Array(got.bytes);
    const bx = walk(d,0,d.length), by = Object.fromEntries(bx.map(x=>[x.typ,x]));
    o.wire_progressive = !bx.some(x => ['moof','mvex'].includes(x.typ));
    o.wire_duration = by.mvhd ? durOf(d, by.mvhd) : -1;
    o.wire_durTrue = o.wire_duration === expectMovie;
    const md = by.mdat;
    const pay = md ? d.subarray(md.body, md.off+md.sz) : new Uint8Array(0);
    o.wire_videoIdentical = pay.length === fix.payload.length && pay.every((v,i)=>v===fix.payload[i]);
  }
  o.wire_expectDuration = expectMovie;
}

// ---- 4) IT MAY NEVER COST SOMEBODY A FILE. Anything it cannot read comes back whole.
{
  const junk = Array.from(new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12]));
  const r = await p.evaluate(async (arr) => {
    const M = window.__magnet;
    const webm = new Blob([new Uint8Array(arr)], { type:'video/webm' });
    const back = await M.mp4Fixup(webm);
    const bad  = new Blob([new Uint8Array(arr)], { type:'video/mp4' });
    const back2 = await M.mp4Fixup(bad);
    return { webmSame: back === webm, badSize: back2.size, badType: back2.type,
             nullOnJunk: M.mp4Remux(new Uint8Array(arr)) === null };
  }, junk);
  o.keep_webmUntouched = r.webmSame;
  o.keep_badMp4Survives = r.badSize === 12 && /mp4/.test(r.badType);
  o.keep_nullOnJunk = r.nullOnJunk;
}

console.log(JSON.stringify(o,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const checks = {
  v1_remuxed: o.v1_remuxed, v1_progressive: o.v1_progressive, v1_durTrue: o.v1_durTrue,
  v1_videoIdentical: o.v1_videoIdentical, v1_tables: o.v1_tables, v1_syncTable: o.v1_syncTable,
  v1_headersClean: o.v1_headersClean, v1_trackKept: o.v1_trackId === 1,
  v0_remuxed: o.v0_remuxed, v0_progressive: o.v0_progressive, v0_durTrue: o.v0_durTrue,
  v0_videoIdentical: o.v0_videoIdentical, v0_headersClean: o.v0_headersClean,
  v0_trackKept: o.v0_trackId === 1,
  wire_named: o.wire_named, wire_quiet: o.wire_quiet, wire_progressive: o.wire_progressive,
  wire_durTrue: o.wire_durTrue, wire_videoIdentical: o.wire_videoIdentical,
  keep_webmUntouched: o.keep_webmUntouched, keep_badMp4Survives: o.keep_badMp4Survives,
  keep_nullOnJunk: o.keep_nullOnJunk,
  noConsoleErrors: errors.length === 0,
};
const ok = Object.values(checks).every(Boolean);
if(!ok) console.log('FAILED:', Object.entries(checks).filter(([,v])=>!v).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
