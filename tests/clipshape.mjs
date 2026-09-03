// THE EXPORTED VIDEO IS A SHAPE THAT CAN BE POSTED.
//
// A canvas is the viewport times the pixel ratio, and that is far outside the range every
// video platform works to: measured on the shipped build, a portrait handset exports at
// 0.462 and a landscape one at 2.164, against a floor of 0.5625 (9:16) and a ceiling of
// 1.91. Out-of-range video gets cropped or padded by whoever it is posted to, in the middle
// of the frame, with no idea where the pitch is.
//
// ⚠️ MEASUREMENT TRAPS, both of which produced a wrong reading first:
//   * `screenPt` takes SCREEN points and returns an ARRAY — it is `screenPt(wx(x), wy(y))`
//     and `[x, y]`, not `screenPt(x, y)` and `{x, y}`. Fed world units it returns NaN and
//     every containment check reads "CUT" on a perfectly good build.
//   * The court box must be measured in DEVICE pixels (`* DPR`), because the frame is
//     measured there. `M.DPR` is not on the debug hook; `cv.width / cv.clientWidth` is.
//
// ⚠️ THE CONTROL IS A SHAPE THAT IS ALREADY IN RANGE, MEASURED IN THE SAME RUN. "the export
// is inside the range" is equally true of a build that crops every export to a fixed box,
// which would take a desktop's own shape away for nothing — so a desktop must come out
// UNTOUCHED, at exactly the canvas it always was.
//
// ⚠️ **WHAT THIS SUITE CANNOT SEE, WRITTEN DOWN RATHER THAN LEFT TO BE DISCOVERED.** Seven
// sabotages of `clipFrameSize` / `clipFramePlan` and the two wirings are each caught by
// their own check here. The eighth is NOT: replacing the court-centred window with a
// canvas-centred one passes everything. That is not a weak check, it is a measured fact —
// swept over all 34 courts on all three shapes that get cropped, a canvas-centred window
// contains the court every time, because the HUD headroom and the thumbstick band leave
// enough slack today. `clipFramePlan` centres on the court anyway, so the crop follows the
// pitch by construction rather than by those two reservations staying as they are; if they
// ever move, this suite will not be what tells you.
import { chromium, LAUNCH } from './_browser.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let bad = 0;
const ok = (name, cond, note) => {
  if (!cond){ bad++; console.log('  ' + name + (note ? ' — ' + note : '')); }
};

const b = await chromium.launch(LAUNCH);
const errs = [];

async function open(w, h, dpr){
  const p = await b.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:dpr,
                              hasTouch: w < 900, isMobile: w < 900 });
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await p.goto('file://' + join(ROOT, 'index.html'));
  await p.waitForTimeout(500);
  return p;
}

// Play a match, then read the canvas, the frame the export would use, and the court's own
// drawn box — all in device pixels, all in one run.
const MEASURE = async () => {
  const M = window.__magnet; const wait = ms => new Promise(r => setTimeout(r, ms));
  M.sel.autoReplay = false; M.sel.lobby = 'off'; M.sel.mode = '2v2'; M.sel.length = '5';
  M.applyDisplayMode(); await wait(200);
  M.setMatchSeed(3); M.startMatch({ lobby:false });
  const w = M.world; w.state = 'play'; w.stateT = 2;
  for (let i = 0; i < 60; i++) M.step(w);
  M.render();
  const cv = document.getElementById('game');
  const S = cv.width / cv.clientWidth;
  const f = w.field, e = f.L/2 + f.net, hw = f.W/2;
  const pts = [[-hw,-e],[hw,-e],[-hw,e],[hw,e]].map(([a,c]) => M.screenPt(M.wx(a), M.wy(c)));
  const xs = pts.map(q => q[0] * S), ys = pts.map(q => q[1] * S);
  const fit = M.clipFrameSize(cv.width, cv.height);
  const at = M.clipFramePlan(cv.width, cv.height, fit.w, fit.h);
  return { W: cv.width, H: cv.height, fit, at, mirrored: !!M.repClipMirror(),
           L: Math.min(...xs), R: Math.max(...xs), T: Math.min(...ys), B: Math.max(...ys) };
};

const RANGE = { min: 0.5625, max: 1.91 };
const shapes = [
  { name: 'phone portrait',  w: 390,  h: 844,  dpr: 3, snap: true  },
  { name: 'phone landscape', w: 844,  h: 390,  dpr: 3, snap: true  },
  { name: 'ultrawide',       w: 2560, h: 1080, dpr: 1, snap: true  },
  { name: 'desktop',         w: 1280, h: 800,  dpr: 1, snap: false },
  { name: 'tablet',          w: 820,  h: 1180, dpr: 2, snap: false },
];

console.log('shape               canvas          aspect   frame           aspect   court');
for (const s of shapes){
  const p = await open(s.w, s.h, s.dpr);
  const r = await p.evaluate(MEASURE);
  await p.close();

  const wasA = r.W / r.H, nowA = r.fit.w / r.fit.h;
  const courtIn = r.L >= r.at.sx - 0.5 && r.R <= r.at.sx + r.at.sw + 0.5 &&
                  r.T >= r.at.sy - 0.5 && r.B <= r.at.sy + r.at.sh + 0.5;
  console.log(`${s.name.padEnd(18)} ${(r.W+'x'+r.H).padEnd(15)} ${wasA.toFixed(3)}    ` +
              `${(r.fit.w+'x'+r.fit.h).padEnd(15)} ${nowA.toFixed(3)}    ` +
              `${Math.round(r.R-r.L)}x${Math.round(r.B-r.T)} ${courtIn ? 'inside' : 'CUT'}`);

  // The claim, on every shape: what comes out can be posted...
  ok(s.name + ': the exported frame is in range',
     nowA >= RANGE.min - 1e-6 && nowA <= RANGE.max + 1e-6, 'aspect ' + nowA.toFixed(4));
  // ...and the pitch survives it. A crop that cuts the court is worse than an odd aspect.
  ok(s.name + ': the court is wholly inside the exported frame', courtIn,
     JSON.stringify({ court:[Math.round(r.L),Math.round(r.T),Math.round(r.R),Math.round(r.B)],
                      from:[r.at.sx, r.at.sy, Math.round(r.at.sx+r.at.sw), Math.round(r.at.sy+r.at.sh)] }));
  // Even, or a 4:2:0 encoder refuses the configuration outright.
  ok(s.name + ': the frame has even sides', !(r.fit.w & 1) && !(r.fit.h & 1),
     r.fit.w + 'x' + r.fit.h);
  // ⚠️ Classic fits on every shipped shape, so this is the ordinary path and the scale is
  // the thing that says the picture was not resampled for nothing.
  ok(s.name + ': Classic is a straight 1:1 crop, never rescaled', r.at.scale === 1,
     'scale ' + r.at.scale);
  ok(s.name + ': it only takes pixels the canvas has',
     r.at.sx >= 0 && r.at.sy >= 0 && r.at.sx + r.at.sw <= r.W + 0.5 &&
     r.at.sy + r.at.sh <= r.H + 0.5);

  if (s.snap){
    // ⚠️ Paired with the control below: without it, "in range" is satisfied by a build
    // that snaps everything, and one that snaps nothing would fail here — so both halves
    // are needed to say the rule is the rule and not a constant.
    ok(s.name + ': a shape outside the range really was snapped',
       (wasA < RANGE.min - 1e-6 || wasA > RANGE.max + 1e-6) && r.mirrored,
       'was ' + wasA.toFixed(3) + ', mirrored ' + r.mirrored);
  } else {
    // THE CONTROL. A shape that can already be posted is left exactly alone — same pixels,
    // no mirror, no crop, no resample.
    ok(s.name + ': an in-range shape is untouched',
       !r.mirrored && r.fit.w >= r.W - 1 && r.fit.h >= r.H - 1 &&
       r.at.sx === 0 && r.at.sy === 0 && r.at.scale === 1,
       JSON.stringify({ mirrored:r.mirrored, fit:r.fit, at:r.at, W:r.W, H:r.H }));
  }
}

// ---- every court, not just Classic -----------------------------------------------------
// ⚠️ **THIS IS THE BLOCK THAT FOUND THE REAL LIMIT, AND CHECKING CLASSIC ALONE MISSED IT.**
// Classic fits the snapped frame on all five shapes with room to spare, which made a pure
// crop look safe. Swept over all 34 courts, FIVE are cut on an ultrawide — the long narrow
// ones, which turn goal-to-goal and then span nearly the whole width — so the zoom-out
// branch is a measured requirement rather than defensive padding.
{
  const p = await open(2560, 1080, 1);
  const r = await p.evaluate(async () => {
    const M = window.__magnet; const wait = ms => new Promise(r => setTimeout(r, ms));
    M.sel.autoReplay = false; M.sel.lobby = 'off'; M.sel.mode = '2v2'; M.sel.length = '5';
    const rows = [];
    for (const key of Object.keys(M.FIELDS)){
      M.sel.field = key; M.applyDisplayMode(); await wait(20);
      M.setMatchSeed(3); M.startMatch({ lobby:false });
      const w = M.world; w.state = 'play'; w.stateT = 2;
      for (let i = 0; i < 20; i++) M.step(w);
      M.render();
      const cv = document.getElementById('game'); const S = cv.width / cv.clientWidth;
      const f = w.field, e = f.L/2 + f.net, hw = f.W/2;
      const pts = [[-hw,-e],[hw,-e],[-hw,e],[hw,e]].map(([a,c]) => M.screenPt(M.wx(a), M.wy(c)));
      const xs = pts.map(q => q[0] * S), ys = pts.map(q => q[1] * S);
      const fit = M.clipFrameSize(cv.width, cv.height);
      const at = M.clipFramePlan(cv.width, cv.height, fit.w, fit.h);
      rows.push({ key, scale: at.scale,
        // the court, mapped through the plan into the exported frame
        inside: Math.min(...xs) >= at.sx - 0.5 && Math.max(...xs) <= at.sx + at.sw + 0.5 &&
                Math.min(...ys) >= at.sy - 0.5 && Math.max(...ys) <= at.sy + at.sh + 0.5 });
    }
    return rows;
  });
  await p.close();
  const cut = r.filter(x => !x.inside);
  const zoomed = r.filter(x => x.scale < 0.999);
  console.log(`\nultrawide, all ${r.length} courts: ${cut.length} cut, ` +
              `${zoomed.length} needed a zoom-out ` +
              `(${zoomed.map(x => x.key + ' ' + x.scale.toFixed(3)).join(', ') || 'none'})`);
  ok('no court is cut out of its own exported frame, on any field', cut.length === 0,
     cut.map(x => x.key).join(', '));
  // ⚠️ Paired with the above, or "nothing is cut" is satisfied by a build that zooms every
  // export out to nothing. The five long courts are the ones that need it and the other 29
  // must stay a 1:1 crop.
  ok('and the zoom-out is only used where it is needed',
     zoomed.length > 0 && zoomed.length < r.length / 2,
     zoomed.length + ' of ' + r.length);
}

// ---- and it reaches a real file --------------------------------------------------------
// ⚠️ **THE HELPERS AGREEING WITH THEMSELVES PROVES NOTHING** — what has to be true is that
// the video that comes out of the real export is that shape. Driven on the offline encoder,
// which is the one path this environment can actually run end to end (there is no H.264
// encoder here, so the real-time path never produces a file).
{
  const p = await open(390, 844, 3);
  const r = await p.evaluate(async () => {
    const M = window.__magnet; const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
    M.sel.autoReplay = false; M.sel.lobby = 'off'; M.sel.mode = '2v2'; M.sel.length = '5';
    M.applyDisplayMode(); await wait(200);
    M.setMatchSeed(3); M.startMatch({ lobby:false });
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (let i = 0; i < 600; i++) M.step(w);
    const full = M.repMatchFileBuild();
    const doc = { ...full, frames: full.frames.slice(0, 90) };
    const cv = document.getElementById('game');
    o.canvas = { w: cv.width, h: cv.height };
    o.want = M.clipFrameSize(cv.width, cv.height);
    if (!M.repFastPossible()) return o;
    const fast = await M.repFastExport(doc, 1, () => {});
    if (!fast || !fast.blob) return o;
    o.bytes = fast.blob.size;
    // Read the shape back out of the produced file with the browser's own demuxer.
    const v = document.createElement('video');
    v.src = URL.createObjectURL(fast.blob); v.muted = true;
    const ready = await new Promise(res => {
      v.onloadedmetadata = () => res(true); v.onerror = () => res(false);
      setTimeout(() => res(false), 8000);
    });
    if (!ready) return o;
    o.got = { w: v.videoWidth, h: v.videoHeight };

    // ⚠️ **THE RIGHT SHAPE IS NOT THE RIGHT PICTURE, and a sabotage proved it.** Encoding
    // the whole canvas into a frame configured at the snapped size does not fail — the
    // encoder simply squashes it — so the file comes out 1170x2080 with the court the wrong
    // shape inside it, and every dimension check above stays green. What separates them is
    // the CONTENT, compared against the same frame rendered locally BOTH ways: the crop the
    // export should have taken, and the squashed whole canvas it takes when the mirror is
    // not wired in. Compression noise is common to both comparisons, so it cancels.
    const idx = 20, at = idx / (doc.fps || 60);
    await new Promise(res => { v.onseeked = () => res(); v.currentTime = at; setTimeout(res, 4000); });
    const shot = document.createElement('canvas');
    shot.width = o.got.w; shot.height = o.got.h;
    const sg = shot.getContext('2d', { willReadFrequently:true });
    sg.drawImage(v, 0, 0, shot.width, shot.height);
    const decoded = sg.getImageData(0, 0, shot.width, shot.height).data;

    // Re-render that exact frame with the document installed, the way the export did.
    const ref = document.createElement('canvas');
    ref.width = o.got.w; ref.height = o.got.h;
    const rg = ref.getContext('2d', { willReadFrequently:true });
    const grab = () => rg.getImageData(0, 0, ref.width, ref.height).data;
    const dist = (a2, b2) => { let s = 0;
      for (let i = 0; i < a2.length; i += 4 * 97)
        s += Math.abs(a2[i]-b2[i]) + Math.abs(a2[i+1]-b2[i+1]) + Math.abs(a2[i+2]-b2[i+2]);
      return Math.round(s / 1000); };

    // ⚠️ `world` is a GETTER on the debug hook — it cannot be swapped from out here, and a
    // reference drawn against the LIVE match world would be a different field. So the
    // references are taken during a real `playReplayFile`, which installs the document's
    // world itself; the same lever `clipfile` uses, and for the same reason.
    let cropped = null, squashed = null;
    {
      const pr = M.playReplayFile(doc, 8);
      await wait(300);
      const fr = M.lastReplay.frames[idx];
      M.replay.filming = true;
      M.drawReplayFrame(fr);
      // (a) what the export SHOULD contain
      const m = M.repClipMirror();
      M.clipBlit(m);
      rg.setTransform(1,0,0,1,0,0); rg.clearRect(0,0,ref.width,ref.height);
      rg.drawImage(m.cv, 0, 0, ref.width, ref.height);
      cropped = grab();
      // (b) what it contains when the mirror is skipped — the whole canvas, squashed in
      rg.clearRect(0,0,ref.width,ref.height);
      rg.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, ref.width, ref.height);
      squashed = grab();
      M.replay.filming = false;
      M.replayAbort(); await pr;
    }
    o.toCrop = dist(decoded, cropped);
    o.toSquash = dist(decoded, squashed);
    // ⚠️ The control: the two references must be far apart in the same run, or "the decoded
    // frame is nearer the crop" is a coin toss between two pictures that look alike.
    o.refGap = dist(cropped, squashed);
    return o;
  });
  await p.close();
  const a = r.got ? r.got.w / r.got.h : 0;
  console.log('\nreal export (phone) ' + JSON.stringify(r.canvas) + ' -> ' +
              JSON.stringify(r.got) + '  aspect ' + a.toFixed(4) +
              '  (' + (r.bytes || 0) + ' bytes)  frame: toCrop ' + r.toCrop +
              ' toSquash ' + r.toSquash + ' (refs ' + r.refGap + ' apart)');
  ok('a produced file really is the snapped shape',
     !!r.got && r.got.w === r.want.w && r.got.h === r.want.h,
     JSON.stringify({ want: r.want, got: r.got }));
  ok('and that shape can be posted', a >= RANGE.min - 1e-6 && a <= RANGE.max + 1e-6,
     'aspect ' + a.toFixed(4));
  ok('the file has real content in it', (r.bytes || 0) > 2000, (r.bytes || 0) + ' bytes');
  ok('the two references really are different pictures', (r.refGap || 0) > 200,
     'refs ' + r.refGap + ' apart — the comparison below means nothing without this');
  ok('the encoded frame is the CROP, not the squashed canvas',
     r.toCrop != null && r.toSquash != null && r.toCrop < r.toSquash * 0.7,
     'toCrop ' + r.toCrop + ' vs toSquash ' + r.toSquash);
}

// ---- and it reaches a REAL-TIME recording, which is the half that matters ---------------
// ⚠️ **THE FAST PATH ONLY RUNS WHERE MP4 WAS NEVER ON OFFER, so on the phone this was
// reported from it is the real-time recorder that produces the file.** Wiring the crop into
// the offline encoder alone would leave the reported case exactly as it was and every check
// above would still be green, because they read the helpers rather than a recording.
// ⚠️ `VideoEncoder` is deleted so the fast path declines — the same lever `clipfile` uses —
// and the file comes out WebM here, which is fine: what is under test is its SHAPE.
{
  const p = await open(390, 844, 3);
  const r = await p.evaluate(async () => {
    const M = window.__magnet; const o = {}; const wait = ms => new Promise(r => setTimeout(r, ms));
    M.sel.autoReplay = false; M.sel.lobby = 'off'; M.sel.mode = '2v2'; M.sel.length = '5';
    M.applyDisplayMode(); await wait(200);
    M.setMatchSeed(3); M.startMatch({ lobby:false });
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (let i = 0; i < 600; i++) M.step(w);
    const full = M.repMatchFileBuild();
    const doc = { ...full, frames: full.frames.slice(0, 60) };
    const cv = document.getElementById('game');
    o.canvas = { w: cv.width, h: cv.height };
    o.want = M.clipFrameSize(cv.width, cv.height);
    try { delete window.VideoEncoder; } catch(e){}
    let got = null;
    const A = document.createElement.bind(document);
    document.createElement = (t) => { const el = A(t);
      if (t === 'a') el.click = function(){ got = { name:this.download, href:this.href }; };
      return el; };
    o.why = await M.recordAndShareClip(null, () => M.playReplayFile(doc, 4), 'match', doc, 4);
    document.createElement = A;
    if (!got) return o;
    const bl = await (await fetch(got.href)).blob();
    o.bytes = bl.size;
    const v = document.createElement('video');
    v.src = URL.createObjectURL(bl); v.muted = true;
    const ready = await new Promise(res => {
      v.onloadedmetadata = () => res(true); v.onerror = () => res(false);
      setTimeout(() => res(false), 8000);
    });
    if (!ready) return o;
    o.got = { w: v.videoWidth, h: v.videoHeight };
    // ⚠️ A frame is decoded as well, or "the right shape" is satisfied by a file with no
    // picture in it — the mirror is a canvas nothing may have drawn into.
    const off = document.createElement('canvas'); off.width = o.got.w; off.height = o.got.h;
    const g = off.getContext('2d', { willReadFrequently:true });
    await new Promise(res => { v.onseeked = () => res(); v.currentTime = 0.2; setTimeout(res, 4000); });
    g.drawImage(v, 0, 0, off.width, off.height);
    const d = g.getImageData(0, 0, off.width, off.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 977)
      seen.add((d[i] >> 4) + ',' + (d[i+1] >> 4) + ',' + (d[i+2] >> 4));
    o.tones = seen.size;
    return o;
  });
  await p.close();
  const a = r.got ? r.got.w / r.got.h : 0;
  console.log('real-time (phone)   ' + JSON.stringify(r.canvas) + ' -> ' +
              JSON.stringify(r.got) + '  aspect ' + a.toFixed(4) +
              '  (' + (r.bytes || 0) + ' bytes, ' + (r.tones || 0) + ' tones)  ' + (r.why || ''));
  ok('a real-time recording is the snapped shape too',
     !!r.got && r.got.w === r.want.w && r.got.h === r.want.h,
     JSON.stringify({ want: r.want, got: r.got, why: r.why }));
  ok('...and that shape can be posted', a >= RANGE.min - 1e-6 && a <= RANGE.max + 1e-6,
     'aspect ' + a.toFixed(4));
  ok('...with a picture in it, not an empty mirror', (r.tones || 0) >= 4,
     (r.tones || 0) + ' tones');
}

ok('no page errors', errs.length === 0, errs.join(' | '));
await b.close();
console.log(bad ? '\nFAIL clipshape' : '\nPASS clipshape');
process.exit(bad ? 1 : 0);
