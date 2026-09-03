// A VIDEO EXPORT DOES NOT PLAY IN REAL TIME.
//
// Asked for as "I don't want to watch the video to get it saved — press the button and
// have the file start downloading". The old export filmed the canvas with MediaRecorder,
// which stamps frames when they ARRIVE, so a five-minute match took five minutes.
//
// ⚠️ THAT LIMIT WAS MEASURED, NOT ASSUMED, and both ways round it were tried:
// `captureStream(0)` driven flat out turned ten seconds of content into a 0.43s file, and
// a `MediaStreamTrackGenerator` fed `VideoFrame`s with explicit timestamps produced 1.6s.
// `VideoEncoder` takes the timestamp as an argument, so the timeline is stated rather than
// observed — and the price is that nothing muxes the result, hence `webmMux`.
//
// ⚠️ THE LOAD-BEARING CHECK IS THE FILE'S OWN DURATION, not the wall clock. "It finished
// quickly" is exactly what the broken MediaRecorder builds also did — they just produced a
// video that was short. Fast AND correct length is the claim, and neither half alone is it.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:420,height:860}, hasTouch:true, isMobile:true });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const o = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.autoReplay=false; M.sel.lobby='off'; M.sel.kickoffRule='off';
  M.sel.mode='2v2'; M.sel.length='5'; M.applyDisplayMode(); await wait(150);

  o.possible = M.repFastPossible();
  if (!o.possible) return o;               // no WebCodecs here: the fallback is the feature

  M.setMatchSeed(3); M.startMatch({lobby:false});
  const w=M.world; w.state='play'; w.stateT=2;
  // ⚠️ FORTY seconds, not thirty, and the length is the point. A SimpleBlock's timestamp
  // is a SIGNED 16-BIT offset from its cluster, so it overflows past ~32.7s — a 30-second
  // fixture never reaches the boundary and a muxer that opens exactly one cluster passes.
  // The far sample below sits at 38s, on the other side of it.
  for (let i=0;i<2400;i++) M.step(w);       // 40 seconds of match
  const doc = M.repMatchFileBuild();
  o.contentSecs = +(doc.frames.length / doc.fps).toFixed(2);

  // Catch the download instead of taking it.
  const A = document.createElement.bind(document);
  const grab = (fn) => {
    let got=null;
    document.createElement = (t)=>{ const el=A(t);
      if (t==='a') el.click=function(){ got={name:this.download, href:this.href}; }; return el; };
    return fn().then(async why => { document.createElement = A;
      const r = { why }; if (got){ r.name = got.name; r.href = got.href;
        const bl = await (await fetch(got.href)).blob(); r.bytes = bl.size; r.blob = bl; }
      return r; });
  };
  // Read a file back through the browser's OWN demuxer, and sample two frames from it.
  const probeFile = async (blob, at1, at2) => {
    const v = document.createElement('video');
    v.src = URL.createObjectURL(blob); v.muted = true;
    const meta = await new Promise(res=>{ let d=false; const s=x=>{if(!d){d=true;res(x);}};
      v.onloadedmetadata = () => {
        if (isFinite(v.duration) && v.duration>0) return s(+v.duration.toFixed(2));
        v.onseeked = () => s(+v.currentTime.toFixed(2)); v.currentTime = 1e6; };
      v.onerror = () => s(-1); setTimeout(()=>s(-2), 8000); });
    const r = { duration: meta, w: v.videoWidth, h: v.videoHeight };
    if (meta > 0 && v.videoWidth){
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      const g = c.getContext('2d');
      const shot = async (t) => {
        await new Promise(res=>{ let d=false; const s=()=>{if(!d){d=true;res();}};
          v.onseeked = s; v.currentTime = t; setTimeout(s, 3000); });
        g.drawImage(v,0,0);
        return g.getImageData(0,0,c.width,c.height).data;
      };
      const a = await shot(at1), z = await shot(at2);
      let diff = 0;
      for (let i=0;i<a.length;i+=4)
        if (Math.abs(a[i]-z[i])+Math.abs(a[i+1]-z[i+1])+Math.abs(a[i+2]-z[i+2]) > 24) diff++;
      r.movingPx = diff;
      let ink = 0;
      for (let i=0;i<a.length;i+=4) if (a[i]||a[i+1]||a[i+2]) ink++;
      r.inkPx = ink;
    }
    return r;
  };

  // 1) THE FAST PATH — press the button, get a file, far quicker than the match.
  const t0 = performance.now();
  const fast = await grab(() => M.saveMatchClip(null));
  o.fastWall = +((performance.now()-t0)/1000).toFixed(2);
  o.fastWhy = fast.why; o.fastName = fast.name; o.fastBytes = fast.bytes;
  o.speedup = +(o.contentSecs / Math.max(0.01, o.fastWall)).toFixed(1);
  o.fasterThanRealTime = o.fastWall < o.contentSecs * 0.6;
  // ⚠️ NOT `why === ''` any more: every export now says so when the file it made is a
  // `.webm`, because this browser has no H.264 encoder and a WebM cannot be posted to
  // Instagram. That note is a FACT about the file, not a failure — what must not appear
  // is a warning or a truncation.
  o.saysSaved = !/⚠|Stopped/.test(fast.why || '');
  if (fast.blob){
    const r = await probeFile(fast.blob, 1, o.contentSecs - 2);
    o.fastFile = r;
    // ⚠️ THE DURATION IS THE CLAIM. A quick export that produced a 2-second video is
    // precisely the defect this replaces, so "it was fast" is checked WITH "it is the
    // right length" and never instead of it. Within a frame either way.
    o.rightLength = Math.abs(r.duration - o.contentSecs) < 0.2;
    o.rightSize = r.w > 0 && r.h > 0;
    // ...and the picture MOVES. A file of one frame repeated has a perfect duration.
    o.picturePlays = r.movingPx > 500;
    // ...and it is not a black rectangle: drawReplayFrame really painted the pitch.
    o.pictureInked = r.inkPx > (r.w * r.h) * 0.5;
  }

  // 2) THE FALLBACK IS THE FEATURE'S OTHER HALF. With no VideoEncoder the export must
  //    still produce a file the old way — this can add speed and never take a file away.
  const VE = window.VideoEncoder;
  try {
    delete window.VideoEncoder;
    o.fallbackEngaged = M.repFastPossible() === false;
    M.setMatchSeed(4); M.startMatch({lobby:false});
    const w2=M.world; w2.state='play'; w2.stateT=2;
    for (let i=0;i<180;i++) M.step(w2);     // 3 seconds, so real time is affordable
    const t1 = performance.now();
    const slow = await grab(() => M.saveMatchClip(null));
    o.slowWall = +((performance.now()-t1)/1000).toFixed(2);
    o.slowName = slow.name; o.slowBytes = slow.bytes;
    o.fallbackSaves = !!slow.bytes && slow.bytes > 0 && !/⚠|Stopped/.test(slow.why || '');
    // ⚠️ ...and it is REAL TIME, which is what says the fallback really is the old path
    // rather than the fast one under another name.
    o.fallbackIsRealTime = o.slowWall > 2.0;
  } finally { window.VideoEncoder = VE; }

  // 2b) ⚠️ AND THE OTHER WAY THE FAST PATH DECLINES: the encoder EXISTS and refuses the
  //     configuration. Removing `VideoEncoder` only exercises the capability gate — the
  //     fall-through when `repFastExport` comes back null is a different line, and a
  //     sabotage of it passed until this block existed, because nothing reached it.
  const ICS = VideoEncoder.isConfigSupported;
  try {
    VideoEncoder.isConfigSupported = async () => ({ supported: false });
    o.refusedPick = (await M.repFastPick(320, 240, 30)) === null;
    M.setMatchSeed(6); M.startMatch({lobby:false});
    const w4=M.world; w4.state='play'; w4.stateT=2;
    for (let i=0;i<180;i++) M.step(w4);
    const t3 = performance.now();
    const refused = await grab(() => M.saveMatchClip(null));
    o.refusedWall = +((performance.now()-t3)/1000).toFixed(2);
    o.refusedSaves = !!refused.bytes && refused.bytes > 0 && !/⚠|Stopped/.test(refused.why || '');
    o.refusedIsRealTime = o.refusedWall > 2.0;
  } finally { VideoEncoder.isConfigSupported = ICS; }

  // 3) STOP STILL WORKS during an offline encode — it is not a replay, so the latch is
  //    the only thing that can end it, and the bar is the only way to press it.
  {
    // ⚠️ The SAME forty-second document the fast block used, so `fastWall` is the control
    // for how long a whole encode takes — measured in this run, never a constant. A fixed
    // "under two seconds" passed with the latch deleted, because a shorter fixture simply
    // finished inside it.
    const doc3 = doc;
    const bar = document.getElementById('repRec');
    o.barHiddenBefore = bar.classList.contains('hidden');
    const run = grab(() => M.recordAndShareClip(null, () => M.playReplayFile(doc3,1), 'match', doc3, 1));
    await wait(600);
    o.barShown = !bar.classList.contains('hidden');
    o.barText = document.getElementById('repRecText').textContent;
    // ⚠️ The word changes with the mode: an ENCODE is not a recording, and a bar that
    // says "Recording" over one is the same class of lie as "NEXT MATCH IN 5S".
    o.barSaysEncoding = /^Encoding/.test(o.barText || '');
    const btn = document.getElementById('repRecStop');
    const r = btn.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
    o.stopReachable = !!hit && (hit === btn || btn.contains(hit));
    const t2 = performance.now();
    btn.click();
    const res = await run;
    o.stopWall = +((performance.now()-t2)/1000).toFixed(2);
    o.stopWhy = res.why;
    o.stopStops = o.stopWall < o.fastWall * 0.4;
    o.stopSaysSo = /Stopped/.test(res.why || '');
    await wait(60);
    o.barHiddenAfter = bar.classList.contains('hidden');
  }
  o.clean = M.replay.filming === false && M.replay.active === false && !!M.world;
  return o;
});

// ⚠️ TWO MUXER CHECKS THAT NO DEMUXER CAN MAKE FOR US: the SIZE VINT's reserved value.
// The all-ones pattern at each length means "unknown size — this element runs to the end
// of the file", so a payload of exactly 127 bytes must spill to two bytes. Written `>`
// instead of `>=` it emits 0xFF, and the round trip above CANNOT see it: the browser that
// wrote the file is forgiving enough to play it back, which is exactly the trap the QR
// encoder's transposed format bits recorded — a writer and a reader agreeing with each
// other and with nothing else.
const vint = await p.evaluate(() => {
  const M = window.__magnet, out = {};
  for (const n of [1, 126, 127, 128, 16382, 16383])
    out[n] = Array.from(M.ebSize(n));
  // ...and the same boundary driven through the REAL muxer. A SimpleBlock's payload is
  // four header bytes plus the frame, so 123 bytes of frame is a payload of exactly 127.
  const sz = (n) => M.webmMux([{ data:new Uint8Array(n), ms:0, key:true }],
                              { cid:'V_VP9', width:2, height:2, frameMs:33 }).size;
  out.at126 = sz(122); out.at127 = sz(123);
  return out;
});
o.vint = vint;
// 127 must be two bytes and 126 one; 16383 two-or-more and 16382 two.
o.vintReserves127 = vint['126'].length === 1 && vint['127'].length === 2;
o.vintReserves16383 = vint['16382'].length === 2 && vint['16383'].length === 3;
o.vintNeverAllOnes = ![1,126,127,128,16382,16383].some(n => vint[String(n)][0] === 0xFF);
// One more frame byte AND one more size byte, so the file grows by two rather than one.
o.vintSpillsInAFile = (vint.at127 - vint.at126) === 2;

// ⚠️ **AND THE CLUSTER RULE IS READ OFF THE BYTES, because no demuxer will tell us.**
// A SimpleBlock's timestamp is a SIGNED 16-BIT offset from its cluster, so a muxer that
// opens one cluster for a whole match wraps every frame past ~32.7s into the past.
// Sabotaged that way, Chrome still reported the right duration (it comes from the Info
// element, which is written explicitly) and still returned two different frames — so the
// round trip above CANNOT see it, which a passing sabotage is what proved. What can is the
// invariant itself, checked on the file this muxer actually wrote. Same instrument as the
// QR suite's own decoder: read it back with something that does not share the writer's
// assumptions.
const clusters = await p.evaluate(async () => {
  const M = window.__magnet;
  // 1800 synthetic frames 33ms apart — a minute of video, no encoder needed.
  const frames = [];
  for (let i=0;i<1800;i++)
    frames.push({ data:new Uint8Array(8).fill(i & 0xff), ms: Math.round(i*1000/30), key: i % 60 === 0 });
  const blob = M.webmMux(frames, { cid:'V_VP9', width:2, height:2, frameMs: 1000/30 });
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
});
{
  const buf = Uint8Array.from(clusters);
  const dv = new DataView(buf.buffer);
  // A minimal EBML reader: enough to walk into clusters and read every block's offset.
  const vlen = (b) => { for (let i=0;i<8;i++) if (b & (0x80 >> i)) return i+1; return 8; };
  const readId = (at) => { const n = vlen(buf[at]); let v = 0;
    for (let i=0;i<n;i++) v = v*256 + buf[at+i]; return { v, n }; };
  const readSz = (at) => { const n = vlen(buf[at]); let v = buf[at] & (0xff >> n);
    for (let i=1;i<n;i++) v = v*256 + buf[at+i]; return { v, n }; };
  let nClusters = 0, worst = 0, blocks = 0, bad = 0;
  const walk = (at, end, inCluster) => {
    while (at < end - 1){
      const id = readId(at), sz = readSz(at + id.n);
      const body = at + id.n + sz.n, next = body + sz.v;
      if (id.v === 0x18538067) walk(body, next, false);            // Segment
      else if (id.v === 0x1F43B675){ nClusters++; walk(body, next, true); }
      else if (id.v === 0xA3 && inCluster){                        // SimpleBlock
        const rel = dv.getInt16(body + 1);                         // after the track vint
        blocks++;
        if (rel < 0) bad++;
        if (Math.abs(rel) > Math.abs(worst)) worst = rel;
      }
      at = next;
    }
  };
  walk(0, buf.length, false);
  o.mux = { clusters: nClusters, blocks, worstRel: worst, negativeRel: bad };
  // Every block must sit inside the signed range, and none may have wrapped negative.
  o.blocksInRange = blocks === 1800 && Math.abs(worst) <= 32767 && bad === 0;
  // ...and that is only true because the muxer opened more than one cluster for a minute.
  o.splitsClusters = nClusters > 1;
}

console.log(JSON.stringify(o,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = o.possible === false ? errors.length === 0 : (
           o.fasterThanRealTime && o.saysSaved && o.rightLength && o.rightSize &&
           o.picturePlays && o.pictureInked &&
           o.fallbackEngaged && o.fallbackSaves && o.fallbackIsRealTime &&
           o.refusedPick && o.refusedSaves && o.refusedIsRealTime &&
           o.barHiddenBefore && o.barShown && o.barSaysEncoding && o.stopReachable &&
           o.stopStops && o.stopSaysSo && o.barHiddenAfter && o.clean &&
           o.vintReserves127 && o.vintReserves16383 && o.vintNeverAllOnes &&
           o.vintSpillsInAFile && o.blocksInRange && o.splitsClusters &&
           errors.length === 0);
if(!ok) console.log('FAILED:', Object.entries(o).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
