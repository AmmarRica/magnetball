// A RECORDING IS NOT A REPLAY YOU CAN TAP AWAY.
//
// Exporting a replay as video plays it back with the transport DOWN, so `replay.controls`
// is false — and every "skip an uncontrolled replay" path therefore ended the RECORDING.
// Measured on the shipped build: a 20-second match export came out at 1.53s from one tap
// and 1.54s from one keypress, and reported "✓ Video saved" both times. That is what
// "generated video only makes a 2 second video despite the replay being for a full match"
// was; the file that arrived was 1.60s, filmed on a phone.
//
// ⚠️ THE CONTROL IS THE OTHER HALF AND IT IS NOT OPTIONAL: an ordinary uncontrolled replay
// must STILL be skippable by a tap. "Filming ignores input" is equally true of a build
// where nothing can ever be skipped, which would take the goal replay's one-gesture skip
// away — a worse bug than the one being fixed, and invisible to every check above.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
// A phone, because that is where it was reported and where a stray tap is likeliest.
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

  // A SHORT match on purpose — what is under test is when the recording stops, not the
  // encoder, and every block here films the whole thing.
  M.setMatchSeed(3); M.startMatch({lobby:false});
  const w=M.world; w.state='play'; w.stateT=2;
  for (let i=0;i<300;i++) M.step(w);              // 5 sim-seconds
  const doc = M.repMatchFileBuild();
  o.docFrames = doc.frames.length; o.docFps = doc.fps;
  o.expectSecs = +(doc.frames.length / doc.fps).toFixed(2);

  let PADS = [];
  navigator.getGamepads = () => PADS;
  const pad = (pressed) => ({ connected:true, mapping:'standard', id:'Fake Controller (STANDARD GAMEPAD)',
    axes:[0,0,0,0], buttons: Array.from({length:17},(_,i)=>({ pressed: !!pressed && i===1,
                                                             value: (!!pressed && i===1)?1:0 })) });

  // Film the document and hand back what the file came out as, catching the download.
  const film = () => {
    let got=null;
    const A = document.createElement.bind(document);
    document.createElement = (tag)=>{ const el=A(tag);
      if (tag==='a') el.click=function(){ got={href:this.href}; }; return el; };
    const t0 = performance.now();
    return M.recordAndShareClip(null, () => M.playReplayFile(doc, 1), 'match')
      .then(async why => { document.createElement = A;
        const r = { why, wall:+((performance.now()-t0)/1000).toFixed(2) };
        if (got) r.bytes = (await (await fetch(got.href)).blob()).size;
        return r; });
  };
  const tap = () => {
    const cv = document.getElementById('game');
    const t = { identifier: 7, clientX: 200, clientY: 500, target: cv };
    cv.dispatchEvent(new TouchEvent('touchstart', { bubbles:true, cancelable:true,
      changedTouches:[new Touch(t)], touches:[new Touch(t)], targetTouches:[new Touch(t)] }));
  };
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown',
    { key:k, code:(k==='Escape'?'Escape':'KeyA'), bubbles:true }));

  // 1) CONTROL — an undisturbed export runs the whole document.
  PADS = [];
  o.clean = await film();
  o.cleanRuns = o.clean.wall >= o.expectSecs * 0.9;

  // 2) A TAP DOES NOT END IT. This is the reported defect.
  { const run = film(); await wait(700); tap(); o.tapped = await run; }
  o.tapSurvives = o.tapped.wall >= o.expectSecs * 0.9;

  // 3) NOR A KEY.
  { const run = film(); await wait(700); key('a'); o.keyed = await run; }
  o.keySurvives = o.keyed.wall >= o.expectSecs * 0.9;

  // 4) NOR A PAD BUTTON RESTING UNDER A THUMB.
  { PADS = [pad(true)]; const run = film(); o.padded = await run; PADS = []; }
  o.padSurvives = o.padded.wall >= o.expectSecs * 0.9;

  // 5) ⚠️ THE CONTROL, AND IT IS THE LOAD-BEARING HALF: an ordinary uncontrolled replay is
  //    still ended by a tap. Same code path (`!controls && !filming`), no recorder.
  { const run = M.playReplayFile(doc, 1); await wait(500);
    const t0 = performance.now(); tap(); await run;
    o.plainSkipWall = +((performance.now()-t0)/1000).toFixed(2); }
  o.plainStillSkippable = o.plainSkipWall < 0.6;

  // 6) THE BAR SAYS A RECORDING IS RUNNING — DOM, never painted on the canvas, because
  //    `captureStream` films the canvas and anything drawn there is in the file for ever.
  const bar = document.getElementById('repRec');
  o.barHiddenBefore = bar.classList.contains('hidden');
  { const run = film(); await wait(700);
    const box = bar.getBoundingClientRect();
    o.barShown = !bar.classList.contains('hidden') && box.width > 0 && box.height > 0;
    o.barText = document.getElementById('repRecText').textContent;
    // ⚠️ PRESSED where a finger would land, and the point has to resolve to the button —
    // `.click()` does no hit testing and passes over a control nothing can reach.
    const btn = document.getElementById('repRecStop');
    const r = btn.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    o.stopReachable = !!hit && (hit === btn || btn.contains(hit));
    o.stopBox = { w: Math.round(r.width), h: Math.round(r.height) };
    btn.click();
    o.stopped = await run;
  }
  await wait(60);
  o.barHiddenAfter = bar.classList.contains('hidden');
  // The bar names how far through it is AND how long the whole thing is — a recording with
  // no end in sight is what makes an un-tappable one feel like a hung game.
  o.barNamesTotal = /Recording · \d+:\d\d \/ \d+:\d\d/.test(o.barText||'');
  o.stopWorks = o.stopped.wall < o.expectSecs * 0.7;
  // ⚠️ ...and it is REPORTED as stopped. Saying "✓ Video saved" over a truncated file is
  // how the original defect stayed invisible: the export always claimed success.
  o.stopSaysSo = /Stopped/.test(o.stopped.why || '');
  // ⚠️ NOT `why === ''`: an export now names the container when it could only make a
  // `.webm`. That is a fact about the file; a warning or a truncation is not.
  o.cleanSaysSaved = !/⚠|Stopped/.test(o.clean.why || '');
  // A stopped recording still hands the partial file over — it is what was asked to be kept.
  o.stopStillSaves = !!o.stopped.bytes && o.stopped.bytes > 0;

  // 7) ESCAPE is the keyboard's deliberate way out, and it is the only key that is.
  { const run = film(); await wait(700); key('Escape'); o.escaped = await run; }
  o.escapeStops = o.escaped.wall < o.expectSecs * 0.7 && /Stopped/.test(o.escaped.why||'');

  o.filmingClear = M.replay.filming === false && M.replay.active === false;
  return o;
});

console.log(JSON.stringify(o,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = o.cleanRuns && o.cleanSaysSaved &&
           o.tapSurvives && o.keySurvives && o.padSurvives &&
           o.plainStillSkippable &&
           o.barHiddenBefore && o.barShown && o.barNamesTotal && o.barHiddenAfter &&
           o.stopReachable && o.stopWorks && o.stopSaysSo && o.stopStillSaves &&
           o.escapeStops && o.filmingClear && errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(o).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
