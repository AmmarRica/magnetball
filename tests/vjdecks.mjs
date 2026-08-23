// VJ DECKS: transport, rotation, eject, the yt zero-opacity rule, the ticker message,
// and the panel's state readout.
//
// The reports these pin, in the owner's words:
//   "Both video decks don't do anything"  — a clip loaded perfectly and sat at opacity
//     zero with nothing on any screen saying so. A fresh load now OPENS the deck
//     (opacity 0 -> 1) and every dark state names its own cause in a status line.
//   "The background video at 0 still shows a video" — the yt command's default-opacity
//     line fired on EVERY command, so the SHOW-THROUGH slider dragged to zero snapped
//     straight back to 0.55. An explicit zero is the operator's zero now, and the
//     iframe host is hidden as well, so nothing depends on the canvas covering it.
//   "Can't change the song" — the library's one button loaded "the deck that is faded
//     out", a rule decided by a crossfader the reader had no reason to connect to it.
//     Every row carries explicit -> A / -> B and every deck head carries LOAD and EJECT.
//
// ⚠️ Measurement traps recorded here:
//   - vjVideoPlay resolves el.play() in a .then, so "playing" is true only after a
//     microtask — every transport probe awaits a timeout(0) before reading it.
//   - The rotation check draws a half-red-half-blue fake clip and samples PIXELS.
//     Asserting "rot is stored" passes on a build that never reads it; the pixels are
//     the claim. The fake is a canvas with videoWidth/videoHeight defined, the same
//     stand-in tests/vjmode.mjs uses at the seam.
//   - The auto-open check loads a REAL webm (recorded in-page off a canvas stream),
//     because vjLoadVideo's await hangs on anything the media stack refuses.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch({ ...LAUNCH,
  args: [...LAUNCH.args, '--autoplay-policy=no-user-gesture-required'] });
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport: { width: 1100, height: 850 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|i\.ytimg/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

// ===================================================== transport ====================
const tr = await p.evaluate(async () => {
  const M = window.__magnet, o = {};
  const tick = () => new Promise(r => setTimeout(r, 0));
  M.vjArm();
  const v = M.vj.va;
  // A stand-in element that records what the transport does to it. ⚠️ readyState 1,
  // deliberately: the attract demo renders in the background of this whole suite, and
  // a stub the seam considers drawable (readyState >= 2) reaches ctx.drawImage as a
  // plain object the moment vj.on and an opacity line up — a timing-dependent throw.
  const el = { currentTime: 5, loop: true, playbackRate: 1, muted: true,
    videoWidth: 64, videoHeight: 32, readyState: 1,
    play(){ return Promise.resolve(); }, pause(){}, load(){}, removeAttribute(){} };
  v.el = el; v.ready = true; v.dur = 60; v.opacity = 1; v.paused = false;
  M.vjExec('vplay', { d: 'a', v: true }); await tick();
  o.playStarts = v.playing === true && v.paused === false;
  M.vjExec('vplay', { d: 'a', v: false }); await tick();
  o.pauseHolds = v.playing === false && v.paused === true;
  // ⚠️ Pause is a flag of its own — raising opacity while paused must NOT restart it.
  // Pause used to be spelled "drag opacity to zero", which also blanked the picture.
  M.vjExec('vop', { d: 'a', v: 0.8 }); await tick();
  o.opacityRespectsPause = v.playing === false && v.opacity === 0.8;
  M.vjExec('vplay', { d: 'a', v: true }); await tick();
  o.resume = v.playing === true;
  // Seek and skip, clamped both ends, computed off the ELEMENT's clock (the panel's
  // copy of the position is a 20Hz snapshot — a skip against it lands twice).
  M.vjExec('vseek', { d: 'a', v: 10 });   o.seek = el.currentTime;
  M.vjExec('vskip', { d: 'a', v: -4 });   o.skipBack = el.currentTime;
  M.vjExec('vskip', { d: 'a', v: -100 }); o.skipClampLo = el.currentTime;
  M.vjExec('vskip', { d: 'a', v: 500 });  o.skipClampHi = el.currentTime;
  M.vjExec('vseek', { d: 'a', v: 999 });  o.seekClamp = el.currentTime;
  // Loop reaches the element; rot is folded into 0..3 whatever arrives.
  M.vjExec('vset', { d: 'a', set: { loop: false } }); o.loopOff = el.loop === false && v.loop === false;
  M.vjExec('vset', { d: 'a', set: { rot: 5 } });  o.rotFold = v.rot;
  M.vjExec('vset', { d: 'a', set: { rot: -1 } }); o.rotNeg = v.rot;
  M.vjExec('vset', { d: 'a', set: { rot: 2 } });  o.rotPlain = v.rot;
  // Eject empties the channel and the board position survives.
  M.vjExec('eject', { kind: 'video', d: 'a' });
  o.ejected = v.ready === false && v.name === '' && v.url === '' && v.playing === false;
  o.ejectKeepsBoard = v.opacity === 0.8 && v.rot === 2;
  v.el = null;               // drop the stand-in — the real-load block below builds a real <video>
  // Audio eject clears the musical state too.
  const d = M.vj.a;
  d.ready = true; d.name = 't'; d.dur = 9; d.bpm = 120; d.wave = new Float32Array(4);
  d.cues[1] = 3; d.loop = { in: 0, out: 1 };
  M.vjExec('eject', { kind: 'audio', d: 'a' });
  o.aEjected = d.ready === false && d.name === '' && d.bpm === null && d.wave === null &&
               d.cues.every(c => c === null) && d.loop === null;
  return o;
});
ok('play starts and pause holds', tr.playStarts && tr.pauseHolds, JSON.stringify(tr));
ok('PAUSE IS A FLAG, NOT AN OPACITY — raising opacity does not restart a paused deck',
   tr.opacityRespectsPause && tr.resume, JSON.stringify(tr));
ok('seek/skip land and clamp both ends',
   tr.seek === 10 && tr.skipBack === 6 && tr.skipClampLo === 0 && tr.skipClampHi === 60 && tr.seekClamp === 60,
   JSON.stringify(tr));
ok('loop reaches the element; rot folds into 0..3',
   tr.loopOff && tr.rotFold === 1 && tr.rotNeg === 3 && tr.rotPlain === 2, JSON.stringify(tr));
ok('eject empties the channel but keeps the board position', tr.ejected && tr.ejectKeepsBoard, JSON.stringify(tr));
ok('audio eject clears the musical state', tr.aEjected, JSON.stringify(tr));

// ===================================================== rotation, in pixels =========
const rot = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // A fake clip: left half red, right half blue, twice as wide as tall.
  const src = document.createElement('canvas'); src.width = 64; src.height = 32;
  const sc = src.getContext('2d');
  sc.fillStyle = '#f00'; sc.fillRect(0, 0, 32, 32);
  sc.fillStyle = '#00f'; sc.fillRect(32, 0, 32, 32);
  Object.defineProperty(src, 'videoWidth',  { value: 64 });
  Object.defineProperty(src, 'videoHeight', { value: 32 });
  const dst = document.createElement('canvas'); dst.width = 64; dst.height = 64;
  const dc = dst.getContext('2d', { willReadFrequently: true });
  const px = (x, y) => [...dc.getImageData(x, y, 1, 1).data].slice(0, 3);
  const draw = r => { dc.clearRect(0, 0, 64, 64); M.vjDrawFit(dc, src, 0, 0, 64, 64, 'stretch', r); };
  draw(0); o.r0 = [px(8, 32), px(56, 32)];      // left red, right blue
  draw(1); o.r1 = [px(32, 8), px(32, 56)];      // a quarter clockwise: red on top
  draw(2); o.r2 = [px(8, 32), px(56, 32)];      // upside down: blue left
  draw(3); o.r3 = [px(32, 8), px(32, 56)];      // the other quarter: blue on top
  // Cover mode still covers after a turn — the fit is computed against the clip AS
  // PRESENTED (dimensions swapped), so no corner of the dest is left bare.
  dc.clearRect(0, 0, 64, 64);
  M.vjDrawFit(dc, src, 0, 0, 64, 64, 'cover', 1);
  o.coverCorners = [px(2, 2), px(62, 2), px(2, 62), px(62, 62)].every(c => c[0] > 100 || c[2] > 100);
  return o;
});
const red = c => c[0] > 180 && c[2] < 60, blue = c => c[2] > 180 && c[0] < 60;
ok('rot 0 is the clip as shot', red(rot.r0[0]) && blue(rot.r0[1]), JSON.stringify(rot.r0));
ok('rot 1 turns a quarter clockwise (left edge to the top)', red(rot.r1[0]) && blue(rot.r1[1]), JSON.stringify(rot.r1));
ok('rot 2 is upside down', blue(rot.r2[0]) && red(rot.r2[1]), JSON.stringify(rot.r2));
ok('rot 3 is the other quarter', blue(rot.r3[0]) && red(rot.r3[1]), JSON.stringify(rot.r3));
ok('cover still covers after the turn', rot.coverCorners,
   'the fit must be computed against the clip as presented, or a turned cover leaves bare corners');

// ===================================================== a real load OPENS the deck ==
const ld = await p.evaluate(async () => {
  const M = window.__magnet, o = {};
  const cv = document.createElement('canvas'); cv.width = 160; cv.height = 90;
  const c = cv.getContext('2d'); let hue = 0;
  const iv = setInterval(() => { hue = (hue + 30) % 360;
    c.fillStyle = `hsl(${hue},100%,50%)`; c.fillRect(0, 0, 160, 90); }, 50);
  let file = null;
  try {
    const rec = new MediaRecorder(cv.captureStream(15), { mimeType: 'video/webm' });
    const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
    const done = new Promise(r => rec.onstop = r);
    rec.start(); await new Promise(r => setTimeout(r, 900)); rec.stop(); await done;
    file = new File(chunks, 'clip.webm', { type: 'video/webm' });
  } catch (e) { o.skipped = 'MediaRecorder: ' + e.message; }
  clearInterval(iv);
  if (!file) return o;
  const v = M.vj.va;
  v.opacity = 0; v.paused = true;                      // the shipped dead state
  await M.vjLoadVideo('a', file);
  // play() resolves in a .then; give it real room — under a loaded parallel run 120ms
  // was not obviously enough, and this claim is about state, not latency.
  for (let i = 0; i < 20 && !v.playing; i++) await new Promise(r => setTimeout(r, 100));
  o.ready = v.ready; o.opacity = v.opacity; o.paused = v.paused; o.playing = v.playing;
  M.vjExec('eject', { kind: 'video', d: 'a' });
  return o;
});
if (!ld.skipped){
  ok('A FRESH LOAD OPENS THE DECK — opacity 0 -> 1, transport cleared, playing',
     ld.ready && ld.opacity === 1 && ld.paused === false && ld.playing === true,
     JSON.stringify(ld) + ' — "both video decks don\'t do anything" was a clip loaded perfectly behind an invisible zero');
} else { console.log('load check skipped: ' + ld.skipped); }

// ===================================================== yt at zero ==================
const yt = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.vjSetOn(true);
  M.vjExec('yt', { id: 'dQw4w9WgXcQ' });
  o.freshDefault = M.vj.yt.op;                        // a fresh id with no op gets 0.55
  M.vjExec('yt', { op: 0 });                          // the slider dragged to zero
  o.explicitZero = M.vj.yt.op;
  const host = document.getElementById('ytbg');
  o.dark = host.classList.contains('dark');
  o.visibility = getComputedStyle(host).visibility;
  o.iframeKept = !!host.querySelector('iframe');      // hidden, NOT removed — a remove reloads
  // the punch is skipped too: the canvas stays sealed
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(4); M.startMatch();
  M.world.state = 'play'; M.world.stateT = 2; M.juiceReset();
  M.computeCam(); M.renderAlpha = 1; M.render();
  const cvEl = document.getElementById('game'), c = cvEl.getContext('2d');
  const dpr = cvEl.width / cvEl.clientWidth;
  o.courtAlpha = c.getImageData(Math.round(M.wx(80) * dpr), Math.round(M.wy(120) * dpr), 1, 1).data[3];
  M.vjExec('yt', { op: 0.4 });
  o.backUp = M.vj.yt.op; o.darkAfter = host.classList.contains('dark');
  // an id and an op in ONE command: the op wins, no default overwrites it
  M.vjExec('yt', { id: '' });
  M.vjExec('yt', { id: 'dQw4w9WgXcQ', op: 0 });
  o.bothAtOnce = M.vj.yt.op;
  M.vjPanic();
  return o;
});
ok('a fresh id with no opacity still starts visible', yt.freshDefault === 0.55, String(yt.freshDefault));
ok('AN EXPLICIT ZERO IS ZERO — the slider no longer snaps back to the default',
   yt.explicitZero === 0, String(yt.explicitZero) + ' — "the background video at 0 still shows a video", reported');
ok('...and the layer is COMPLETELY gone: host hidden, iframe kept, canvas sealed',
   yt.dark && yt.visibility === 'hidden' && yt.iframeKept && yt.courtAlpha === 255, JSON.stringify(yt));
ok('...and it comes back when the fader does', yt.backUp === 0.4 && !yt.darkAfter, JSON.stringify(yt));
ok('id + op in one command: the explicit op wins', yt.bothAtOnce === 0, String(yt.bothAtOnce));

// ===================================================== ticker ======================
const tk = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const el = document.getElementById('cupTicker'), track = document.getElementById('cupTickerTrack');
  M.vjSetOn(false);
  M.vjExec('ticker', { text: 'HELLO <b>ROOM</b>' });
  o.offHidden = el.classList.contains('hidden');       // VJ off must stay the untouched game
  o.stored = M.vj.ticker;
  M.vjSetOn(true);
  o.onShown = !el.classList.contains('hidden');
  o.doubled = track.textContent.split('HELLO').length - 1;
  // typed by a person, so NODES — markup must come out as literal text
  o.literal = track.textContent.includes('<b>ROOM</b>') && !track.querySelector('b');
  // the cup's own stop must not take the message down (its timeout used to)
  M.cupTickerStop();
  o.survivesCupStop = !el.classList.contains('hidden');
  M.vjExec('ticker', { text: '' });
  o.cleared = el.classList.contains('hidden') && M.vj.ticker === '';
  M.vjExec('ticker', { text: 'BYE' });
  o.again = !el.classList.contains('hidden');
  M.vjPanic();
  o.panicClears = el.classList.contains('hidden') && M.vj.ticker === '';
  return o;
});
ok('the message shows only while VJ MODE is on, and survives until STOP',
   tk.offHidden && tk.stored === 'HELLO <b>ROOM</b>' && tk.onShown && tk.survivesCupStop, JSON.stringify(tk));
ok('the track is doubled so the marquee has something to run into', tk.doubled === 2, String(tk.doubled));
ok('a typed message is NODES, never markup', tk.literal, 'the reason mapClean exists');
ok('STOP clears it and PANIC kills it', tk.cleared && tk.again && tk.panicClears, JSON.stringify(tk));

// ===================================================== the panel readout ===========
const ui = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.vjBuildPanel();
  // The controls the reports asked for, present and wired.
  o.transport = ['vjVPlaya', 'vjVHomea', 'vjVBacka', 'vjVFwda', 'vjVLoopa', 'vjVSeeka'].every(id => !!document.getElementById(id));
  o.rotate = [0, 1, 2, 3].every(r => !!document.getElementById('vjVRota' + r));
  o.loadEject = ['vjVLoada', 'vjVEjecta', 'vjALoada', 'vjAEjecta'].every(id => !!document.getElementById(id));
  o.preview = !!document.getElementById('vjVPreva');
  o.tickerRow = !!document.getElementById('vjTickText') && !!document.getElementById('vjTickSend') && !!document.getElementById('vjTickStop');
  o.ytRow = !!document.getElementById('vjYtThumb') && !!document.getElementById('vjYtStat');
  // The library offers BOTH decks on every row.
  M.vjAddFiles([new File([new Uint8Array(8)], 'x.mp3', { type: 'audio/mpeg' })]);
  const rowBtns = [...document.querySelectorAll('#vjLib .vjitem button')].map(b => b.textContent);
  o.libButtons = rowBtns;
  o.libExplicit = rowBtns.includes('→ A') && rowBtns.includes('→ B');
  // The status lines name each dark state's own cause. Driven through the real
  // vjSyncControls with crafted snapshots — the panel draws only from vjView.
  const vBase = { id: 'a', name: 'clip', ready: true, playing: true, paused: false, dur: 10, pos: 1,
    opacity: 1, fitMode: 'cover', rate: 1, loop: true, rot: 0, tint: '', tintAmt: 0, filter: '', audioOn: false, audioGain: 0 };
  const dBase = { id: 'a', name: 't', ready: true, playing: true, dur: 10, pos: 1, level: 0, bpm: null, bpmAuto: null,
    grid: 0, gainTrim: 1, fader01: 1, assign: 'main', cue: false, eq: { low: 0, mid: 0, high: 0 }, sweep: 0,
    pitch: 0, pitchRange: 8, keyLock: true, cues: [null, null, null, null], loop: null, loopBeats: 0, sync: false };
  const view = over => Object.assign({ on: true, armed: true, armError: '', yt: { id: '', op: 0 }, ticker: '',
    a: { ...dBase }, b: { ...dBase, id: 'b' }, va: { ...vBase }, vb: { ...vBase, id: 'b' },
    xf: 0.5, xfCurve: 'smooth', vxf: 0.5, vxfCurve: 'smooth', master: 0.8, masterL: 0, masterR: 0,
    sfxLevel: 0.15, duck: true, bpm: 0, cue: { level: 0.8, ok: false, why: '', deviceId: '' } }, over);
  const stat = () => document.getElementById('vjVStata').textContent;
  const astat = () => document.getElementById('vjAStata').textContent;
  M.vjSyncControls(view({ armed: false }));       o.sNotArmed = stat();
  M.vjSyncControls(view({ on: false }));          o.sVjOff = stat();
  let v = view({}); v.va.ready = false;           M.vjSyncControls(v); o.sEmpty = stat();
  v = view({}); v.va.opacity = 0;                 M.vjSyncControls(v); o.sOpZero = stat();
  v = view({ vxf: 1, vxfCurve: 'sharp' });        M.vjSyncControls(v); o.sFadedOut = stat();
  v = view({}); v.va.paused = true; v.va.playing = false; M.vjSyncControls(v); o.sPaused = stat();
  M.vjSyncControls(view({}));                     o.sOnAir = stat();
  v = view({ xf: 1, xfCurve: 'sharp' });          M.vjSyncControls(v); o.aFaded = astat();
  v = view({}); v.a.fader01 = 0;                  M.vjSyncControls(v); o.aVolZero = astat();
  v = view({}); v.yt = { id: 'dQw4w9WgXcQ', op: 0.5 }; M.vjSyncControls(v); o.ytStat = document.getElementById('vjYtStat').textContent;
  return o;
});
ok('the video strip has a real transport: play/pause, home, ±5s, loop, scrub', ui.transport, JSON.stringify(ui));
ok('...and rotate 0/90/180/270', ui.rotate);
ok('every deck head has LOAD and EJECT — nobody guesses which deck a click hits', ui.loadEject);
ok('...and a self-preview element', ui.preview);
ok('the panel has the ticker row and the yt readout', ui.tickerRow && ui.ytRow, JSON.stringify(ui));
ok('THE LIBRARY OFFERS BOTH DECKS ON EVERY ROW', ui.libExplicit, JSON.stringify(ui.libButtons) +
   ' — "can\'t change the song": the old single button picked a deck off the crossfader in silence');
ok('every dark state names its own cause', /NOT ARMED/.test(ui.sNotArmed) && /VJ MODE is OFF/.test(ui.sVjOff) &&
   /empty/.test(ui.sEmpty) && /OPACITY is at zero/.test(ui.sOpZero) && /CROSSFADER/.test(ui.sFadedOut) &&
   /PAUSED/.test(ui.sPaused) && /ON AIR/.test(ui.sOnAir),
   JSON.stringify(ui) + ' — "the decks don\'t do anything" was a rig with no state readout');
ok('...for the audio decks too', /CROSSFADER/.test(ui.aFaded) && /VOLUME is at zero/.test(ui.aVolZero), JSON.stringify(ui));
ok('THE YT LAYER SAYS IT IS SILENT, AND WHY', /silent/.test(ui.ytStat) && /own frame/.test(ui.ytStat),
   ui.ytStat + ' — "audio from the youtube video not working" is answered in the UI, not the docs');

// ===================================================== the timeline is a seek bar ==
// "Allow me to skip songs by clicking on that timeline" — the waveform and the video
// timeline are clickable, through the REAL pointer handlers. On this page PANEL is
// false, so vjCmd executes locally and the click's effect lands on the deck itself.
// ⚠️ The card ships collapsed and a hidden canvas has a zero-width rect, which makes
// every click read as position 0 — the card is opened first, or the check is vacuous.
const sk = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.vjArm();
  M.vjBuildPanel();
  const card = document.querySelector('.card[data-sec="vj"]');
  if (card) card.classList.remove('collapsed');
  // the panel draws from vjView; the command lands on vj.* — both need the duration
  const mkEl = () => ({ currentTime: 0, loop: true, playbackRate: 1, muted: true,
    readyState: 1,   // below the seam's drawable threshold — see the transport block
    play(){ return Promise.resolve(); }, pause(){}, load(){}, removeAttribute(){} });
  M.vj.a.el = mkEl(); M.vj.a.ready = true; M.vj.a.dur = 100;
  M.vj.va.el = mkEl(); M.vj.va.ready = true; M.vj.va.dur = 200;
  M.vjView = { a: { dur: 100 }, va: { dur: 200 } };
  const click = (id, frac) => {
    const cvEl = document.getElementById(id);
    const r = cvEl.getBoundingClientRect();
    o[id + 'w'] = Math.round(r.width);
    cvEl.dispatchEvent(new PointerEvent('pointerdown',
      { clientX: r.left + r.width * frac, clientY: r.top + 2, buttons: 1, bubbles: true, cancelable: true }));
  };
  click('vjWavea', 0.5);  o.audioSeek = M.vj.a.el.currentTime;     // half of 100
  click('vjWavea', 0.9);  o.audioSeek2 = M.vj.a.el.currentTime;
  click('vjVSeeka', 0.25); o.videoSeek = M.vj.va.el.currentTime;   // quarter of 200
  o.wide = o.vjWaveaw > 50 && o.vjVSeekaw > 50;
  M.vj.a.el = null; M.vj.a.ready = false; M.vj.a.dur = 0;
  M.vj.va.el = null; M.vj.va.ready = false; M.vj.va.dur = 0;
  M.vjView = null;
  return o;
});
ok('the canvases render at a real width, or the clicks below prove nothing', sk.wide, JSON.stringify(sk));
ok('CLICKING THE WAVEFORM SEEKS THE TRACK', Math.abs(sk.audioSeek - 50) <= 2 && Math.abs(sk.audioSeek2 - 90) <= 2,
   JSON.stringify(sk) + ' — the waveform is the timeline, not a picture');
ok('CLICKING THE VIDEO TIMELINE SEEKS THE CLIP', Math.abs(sk.videoSeek - 50) <= 2, JSON.stringify(sk));

// ===================================================== drop a file on a deck =======
const dp = await p.evaluate(async () => {
  const M = window.__magnet, o = {};
  const strips = [...document.querySelectorAll('#vjPanel .vjstrip')];   // audio a, b, video a, b
  const wav = (() => {
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
    const w = (off, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i)); };
    w(0,'RIFF'); dv.setUint32(4, 36 + n*2, true); w(8,'WAVE'); w(12,'fmt ');
    dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,1,true);
    dv.setUint32(24,sr,true); dv.setUint32(28,sr*2,true); dv.setUint16(32,2,true); dv.setUint16(34,16,true);
    w(36,'data'); dv.setUint32(40,n*2,true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i*2, Math.sin(i/sr*2*Math.PI*330)*9000, true);
    return new File([buf], 'drop.wav', { type: 'audio/wav' });
  })();
  const drop = (elx, file) => { const dt = new DataTransfer(); dt.items.add(file);
    elx.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); };
  // the right kind lands: a wav on audio deck B loads it (PANEL false -> loads directly)
  drop(strips[1], wav);
  for (let i = 0; i < 30 && !M.vj.b.ready; i++) await new Promise(r => setTimeout(r, 100));
  o.audioLanded = M.vj.b.ready && M.vj.b.name === 'drop.wav';
  // the wrong kind is REFUSED visibly, never guessed into another deck
  const before = M.vj.va.name;
  drop(strips[2], wav);
  o.flashed = strips[2].classList.contains('badfile');
  await new Promise(r => setTimeout(r, 150));
  o.videoUntouched = M.vj.va.name === before && !M.vj.va.ready;
  M.vjExec('eject', { kind: 'audio', d: 'b' });
  return o;
});
ok('A FILE DROPPED ON A DECK LOADS INTO THAT DECK', dp.audioLanded,
   JSON.stringify(dp) + ' — the literal reading of "drop into Deck A or B"');
ok('...and the wrong kind flashes a refusal instead of guessing', dp.flashed && dp.videoUntouched, JSON.stringify(dp));

await p.close();
await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
console.log(JSON.stringify({ tr, rot, ld, yt, tk, ui, sk, dp }, null, 1));
if (fails.length){ console.log('FAIL vjdecks'); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log('PASS vjdecks');
