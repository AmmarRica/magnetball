// WHAT COMES OUT OF A VIDEO EXPORT: an MP4 wherever one is possible, and no caption in it.
//
// Two separate defects, both measured on the shipped build.
//
// 1) THE CONTAINER. The offline encoder writes WebM, because `VideoEncoder` hands back
//    naked frames and `webmMux` is the only muxer in the file. It was tried FIRST, on
//    speed — so on a phone with `VideoEncoder` (Chrome Android has one, with VP9) every
//    export came out `.webm`, which Instagram will not take and which on iOS will not even
//    import into Photos. A video nobody can post is not a saved video, so the order is by
//    what comes OUT rather than by how fast it comes out: an MP4 beats a fast WebM, and the
//    fast path runs only where no MP4 was on offer anyway — where it costs nothing.
//
// 2) THE CAPTION, which was in the file after all. `drawReplayFrame` has suppressed
//    "▶ REPLAY / TAP TO SKIP" while filming since 2026-08-24, and it does — every frame it
//    paints during a recording is clean. But `captureStream` publishes the canvas AS IT
//    ALREADY IS the moment recording starts, and after a goal the page last drew the
//    auto-replay. Measured on a produced file, frame 0 sat **728** from the stale captioned
//    frame against **1233** from that same frame without the caption and **1815** from
//    where the replay actually starts, on a noise floor of 238. The recording opened on a
//    picture taken before it began. On a short clip that frame is a large share of what
//    anybody sees.
//
// ⚠️ THE DETECTOR NEEDS A MARGIN, NOT A NEAREST-NEIGHBOUR. Once the head frame is a flat
// fill it is far from everything — 13570 / 13724 / 13792 — and "nearest" then picks the
// captioned reference by one percent, which is noise reporting a caption. So a caption
// counts as present only when the captioned reference wins by a real margin: 41% on the
// broken build, 1% on the fixed one.
//
// ⚠️ AND THE DETECTOR IS ITSELF CONTROLLED, in the same run, against a locally rendered
// captioned frame — "no caption found" is equally true of a detector that can never find one.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
// A phone, because that is where it was reported and where `VideoEncoder` decides it.
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
  M.setMatchSeed(3); M.startMatch({lobby:false});
  const w=M.world; w.state='play'; w.stateT=2;
  for (let i=0;i<900;i++) M.step(w);
  const full = M.repMatchFileBuild();
  // Short on purpose: what is under test is the container and the head frame, not the
  // encoder, and every block here films the whole document.
  const doc = { ...full, frames: full.frames.slice(0, 120) };

  const cv = document.getElementById('game');
  const g = cv.getContext('2d', { willReadFrequently:true });
  // The caption is drawn at the PITCH centre. Sample a band across the middle.
  const Y0 = Math.round(cv.height*0.38), H0 = Math.round(cv.height*0.26);
  const band = (ctx, W) => ctx.getImageData(0, Y0, W, H0).data;
  const dist = (a,c) => { let s=0; for (let i=0;i<a.length;i+=4)
    s += Math.abs(a[i]-c[i])+Math.abs(a[i+1]-c[i+1])+Math.abs(a[i+2]-c[i+2]); return Math.round(s/1000); };
  // Present only when the captioned reference wins by a real margin — see the header.
  const CAP_MARGIN = 0.9;
  const hasCaption = (f, refOn, refOff) => dist(f, refOn) < dist(f, refOff) * CAP_MARGIN;

  // ---- references, rendered with the replay's own world live so the pitch is the
  // pitch the file will show. `filming` is the one flag the painter reads for this.
  let refOn=null, refOff=null, bare1=null, bare2=null, capFrame=null;
  {
    const pr = M.playReplayFile(doc, 8);
    await wait(300);
    const fr = M.lastReplay.frames[30];
    M.replay.filming = true;  M.drawReplayFrame(fr); bare1 = band(g, cv.width);
                              M.drawReplayFrame(fr); refOff = band(g, cv.width);
    M.replay.filming = false; M.drawReplayFrame(fr); refOn  = band(g, cv.width);
    M.replay.filming = true;  M.drawReplayFrame(fr); bare2 = band(g, cv.width);
    M.replay.filming = false;
    M.replayAbort(); await pr;
  }
  // ⚠️ The control that says the instrument is measuring anything at all: two renders of
  // the same frame, both suppressed, must be near identical, and the caption must be worth
  // far more than that floor.
  o.noiseFloor  = dist(bare1, bare2);
  o.captionInk  = dist(refOn, refOff);
  o.detectorSeesCaption = hasCaption(refOn, refOn, refOff);      // control: must be true
  o.detectorSeesNone    = hasCaption(refOff, refOn, refOff);     // control: must be false

  // ---- catch the download rather than letting the browser take it
  const A = document.createElement.bind(document);
  const film = async (playDoc) => {
    let got=null;
    document.createElement = (tag)=>{ const el=A(tag);
      if (tag==='a') el.click=function(){ got={name:this.download, href:this.href}; }; return el; };
    // What the bar SAYS is how we see which path ran: the offline encoder shows
    // "Encoding", the real-time recorder shows "Recording".
    let word='';
    const id = setInterval(()=>{ const t=document.getElementById('repRecText');
      const bar=document.getElementById('repRec');
      if (t && bar && !bar.classList.contains('hidden') && !word) word = (t.textContent||'').split(' ·')[0]; }, 20);
    let why;
    try { why = await M.recordAndShareClip(null, () => M.playReplayFile(playDoc, 1), 'match', playDoc, 1); }
    finally { clearInterval(id); document.createElement = A; }
    const r = { why, word, name: got && got.name };
    if (got){ const bl = await (await fetch(got.href)).blob(); r.bytes = bl.size; r.type = bl.type; r.blob = bl; }
    return r;
  };

  // 1) NO MP4 ON OFFER (this browser): the fast path runs and the file says what it is.
  //    ⚠️ This is not the happy case — it is the case where the speed is free, because
  //    the real-time recorder could only have produced a WebM too.
  {
    const r = await film(doc);
    o.noMp4_ranEncoder = r.word === 'Encoding';
    o.noMp4_isWebm     = /\.webm$/.test(r.name || '');
    o.noMp4_saysWebm   = /webm/i.test(r.why || '');
  }

  // 2) AN MP4 IS POSSIBLE: the fast path must stand down, however fast it is.
  //    A stand-in MediaRecorder for a browser with H.264 — this one has none, so the
  //    branch is unreachable here without one. It reports mp4/avc1, which is what
  //    `repMakeRecorder` checks AFTER construction.
  {
    const RealRec = window.MediaRecorder;
    function FakeRec(stream, opts){
      this.stream = stream; this.mimeType = 'video/mp4;codecs=avc1.4d002a'; this.state='inactive';
    }
    FakeRec.isTypeSupported = m => /mp4/i.test(m);
    FakeRec.prototype.start = function(){ this.state='recording';
      this._t = setInterval(()=>{ if (this.ondataavailable)
        this.ondataavailable({ data: new Blob([new Uint8Array(2048)], { type:this.mimeType }) }); }, 80); };
    FakeRec.prototype.requestData = function(){ if (this.ondataavailable)
      this.ondataavailable({ data: new Blob([new Uint8Array(512)], { type:this.mimeType }) }); };
    FakeRec.prototype.stop = function(){ clearInterval(this._t); this.state='inactive';
      setTimeout(()=>{ if (this.onstop) this.onstop(); }, 0); };
    window.MediaRecorder = FakeRec;
    try {
      const r = await film(doc);
      o.mp4_ranRealtime = r.word === 'Recording';
      o.mp4_isMp4       = /\.mp4$/.test(r.name || '');
      o.mp4_quiet       = (r.why || '') === '';        // nothing to warn about
    } finally { window.MediaRecorder = RealRec; }
  }

  // 3) THE HEAD FRAME OF A REAL-TIME RECORDING. Leave a CAPTIONED frame on the canvas —
  //    which is exactly the state the page is in when Save clip is pressed after a goal
  //    replay — then film, and look at what frame 0 of the file turned out to be.
  const hadEncoder = typeof VideoEncoder !== 'undefined';
  o.hadEncoder = hadEncoder;
  try { delete window.VideoEncoder; } catch(e){}
  {
    const pr = M.playReplayFile(doc, 8);
    await wait(300);
    const fr = M.lastReplay.frames[30];
    M.replay.filming = false; M.drawReplayFrame(fr);
    M.replayAbort(); await pr;
    M.replay.filming = false; M.drawReplayFrame(fr);   // ...and put it back after render()
    o.canvasWasCaptioned = hasCaption(band(g, cv.width), refOn, refOff);   // must be true

    const r = await film(doc);
    o.head_ranRealtime = r.word === 'Recording';
    o.head_isWebm = /\.webm$/.test(r.name || '');
    if (r.blob){
      const v = document.createElement('video');
      v.src = URL.createObjectURL(r.blob); v.muted = true;
      const ready = await new Promise(res => { v.onloadedmetadata=()=>res(true); v.onerror=()=>res(false); setTimeout(()=>res(false), 8000); });
      o.head_decoded = ready;
      if (ready){
        const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
        const og = off.getContext('2d', { willReadFrequently:true });
        const seek = t => new Promise(res => { v.onseeked=()=>res(); v.currentTime=t; setTimeout(res, 3000); });
        await seek(0.001);
        og.clearRect(0,0,off.width,off.height); og.drawImage(v, 0, 0, off.width, off.height);
        const f0 = band(og, off.width);
        o.head_toCaption   = dist(f0, refOn);
        o.head_toNoCaption = dist(f0, refOff);
        o.head_hasCaption  = hasCaption(f0, refOn, refOff);      // must be false
      }
    }
  }

  // 4) ON SCREEN the rule is the other way round, and both halves are checked. The painter
  //    is driven with the flags the REAL path left set, so this is the wiring rather than
  //    the painter's own `if`.
  {
    const pr = M.playReplayFile(doc, 8);          // uncontrolled — the shape a goal replay has
    await wait(300);
    M.drawReplayFrame(M.lastReplay.frames[30]);
    o.goalReplayShowsCaption = hasCaption(band(g, cv.width), refOn, refOff);   // must be true
    M.replayAbort(); await pr;
  }
  {
    const pr = M.watchReplayFromMenu(async () => doc);            // the Replays section
    await wait(400);
    M.drawReplayFrame(M.lastReplay.frames[30]);
    o.menuReplayShowsCaption = hasCaption(band(g, cv.width), refOn, refOff);   // must be false
    M.replayAbort(); await pr.catch(()=>{});
  }

  o.filmingClear = M.replay.filming === false && M.replay.active === false;
  return o;
});

console.log(JSON.stringify(o,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
// ⚠️ Named conditions, not "which values are false": half the claims here must be FALSE
// (no caption in the file, none on a menu replay), so a false-hunting failure line points
// at the wrong keys and reads as the opposite defect.
const checks = {
  instrumentHasAFloor:  o.noiseFloor < o.captionInk * 0.3,
  detectorSeesCaption:  o.detectorSeesCaption === true,
  detectorSeesNone:     o.detectorSeesNone === false,
  noMp4_ranEncoder:     o.noMp4_ranEncoder === true,
  noMp4_isWebm:         o.noMp4_isWebm === true,
  noMp4_saysWebm:       o.noMp4_saysWebm === true,
  mp4_ranRealtime:      o.mp4_ranRealtime === true,
  mp4_isMp4:            o.mp4_isMp4 === true,
  mp4_quiet:            o.mp4_quiet === true,
  canvasWasCaptioned:   o.canvasWasCaptioned === true,
  head_ranRealtime:     o.head_ranRealtime === true,
  head_decoded:         o.head_decoded === true,
  head_hasNoCaption:    o.head_hasCaption === false,
  goalReplayShowsCaption: o.goalReplayShowsCaption === true,
  menuReplayHidesCaption: o.menuReplayShowsCaption === false,
  filmingClear:         o.filmingClear === true,
  noConsoleErrors:      errors.length === 0,
};
const ok = Object.values(checks).every(Boolean);
if(!ok) console.log('FAILED:', Object.entries(checks).filter(([,v])=>!v).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
