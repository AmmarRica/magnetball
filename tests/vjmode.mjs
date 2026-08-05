// VJ Mode: two video decks + two DJ decks, run from /settings.
//
// Four claims carry the whole feature, and each of them is the kind that passes by
// inspection and fails in a dark room with a PA. They are all checked here.
//
// 1. ADDITIVE AND OFF. With VJ Mode off the render path and the audio graph must be
//    what they were. Not "close" — the markings alpha must be exactly 1 and the seam
//    must be a no-op, verified by pixel-comparing a whole frame.
// 2. PLAYERS ARE UNTOUCHABLE. Video composites inside drawPitch between the surface
//    and the markings, and the discs draw later in render(). That is a claim about
//    DRAW ORDER, so it is tested by driving a deck to full opacity and sampling a
//    player — no deck value may dim one.
// 3. THE FLOOR HOLDS. Markings can never go below VJ.lineFloor whatever the decks do.
// 4. ZERO SIM IMPACT. Same seed, same inputs, VJ on vs off — the world must be
//    bit-identical, because the sim must not be able to see any of this.
//
// The measurement trap here: `render()` is called from three places in loop() and
// again by playReplay. Testing the seam by calling drawPitch directly would prove
// nothing about the path the projector actually takes, so this drives render().
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const cv=document.getElementById('game'), c2=cv.getContext('2d');
  const DPR = cv.width / cv.clientWidth;
  const frameSig = () => { const d=c2.getImageData(0,0,cv.width,cv.height).data;
    let h=0; for(let i=0;i<d.length;i+=53) h=(h*31+d[i])|0; return h; };
  const at = (wxv,wyv) => { const [sx,sy]=M.screenPt(M.wx(wxv), M.wy(wyv));
    const d=c2.getImageData(Math.round(sx*DPR), Math.round(sy*DPR), 1, 1).data; return [d[0],d[1],d[2]]; };
  const start = seed => { M.sel.mode='2v2'; M.sel.kickoffRule='off'; M.setMatchSeed(seed); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2; M.computeCam(); return w; };

  // ---- 1) default OFF, and off means untouched -----------------------------
  o.defaultOff = M.vj.on === false && M.sel.vj.on === false;
  o.markAExactlyOne = M.vjMarkA() === 1;              // not 0.999 — exactly
  o.seamIsNoOp = (()=>{ const w=start(5); M.render(); const a=frameSig();
    M.vjPaintVideo(0,0,100,100); M.render(); return frameSig()===a; })();
  // The config block is one object and every value in it is a number or a string.
  o.configKeys = Object.keys(M.VJ).length;
  o.configIsFlat = Object.values(M.VJ).every(v =>
    typeof v==='number' || typeof v==='string' || Array.isArray(v));

  // ---- 2) master clock: ONE tempo system -----------------------------------
  M.vjClockReset();
  let t=1000; for(let i=0;i<6;i++){ M.vjTap(t); t+=0.5; }      // 0.5s apart = 120
  o.tapBpm = M.vj.clock.bpm;
  o.tapIsRight = Math.abs(o.tapBpm - 120) < 0.6;
  M.vjClockReset();
  t=2000; for(let i=0;i<6;i++){ M.vjTap(t); t+=0.25; }          // 240 -> folded to 120
  o.foldedBpm = M.vj.clock.bpm;
  o.foldsIntoRange = o.foldedBpm >= M.VJ.bpmMin && o.foldedBpm <= M.VJ.bpmMax;
  o.beatLen = +M.vjBeatLen().toFixed(4);
  // No tempo yet must mean "fire now", not "never".
  M.vjClockReset(); M.vj.clock.bpm = 0;
  o.noTempoFiresNow = M.vjTimeToGrid('beat') === 0;
  M.vj.clock.bpm = 120; M.vj.clock.phase0 = performance.now()/1000;
  const g = M.vjTimeToGrid('beat'), gb = M.vjTimeToGrid('bar');
  o.gridInRange = g >= 0 && g <= 0.5001 && gb >= 0 && gb <= 2.0001;

  // ---- 3) crossfader laws ---------------------------------------------------
  const sm = x => +M.vjXGain(x,'a','smooth').toFixed(3), sh = x => +M.vjXGain(x,'a','sharp').toFixed(3);
  o.smooth = [sm(0), sm(0.5), sm(1)];
  o.sharp  = [sh(0), sh(0.25), sh(0.5), sh(0.75), sh(1)];
  o.smoothIsEqualPower = o.smooth[0]===1 && o.smooth[2]===0 && Math.abs(o.smooth[1]-0.707)<0.002;
  // A CUT law is not "fades sooner" — it HOLDS FULL across the first half and then
  // cuts, so a scratch/stab lands at full level right up to the edge. Asserting it
  // fades at centre (as this suite first did) describes the smooth law instead.
  o.sharpHoldsThenCuts = o.sharp[0]===1 && o.sharp[1]===1 && o.sharp[2]===1 &&
                         o.sharp[3]===0.5 && o.sharp[4]===0;
  o.sharpBeatsSmoothEarly = [0.1,0.25,0.4].every(x=>sh(x) >= sm(x));
  // A and B together never dip below unity power in the middle (no hole in a blend).
  o.noHole = [0,0.25,0.5,0.75,1].every(x=>{
    const a=M.vjXGain(x,'a','smooth'), bb=M.vjXGain(x,'b','smooth');
    return Math.abs(a*a + bb*bb - 1) < 0.002; });

  // ---- 4) EQ is a real KILL, not a dip -------------------------------------
  o.eqKill = M.vjEqDb(-1); o.eqUnity = M.vjEqDb(0); o.eqBoost = M.vjEqDb(1);
  o.eqIsAKill = o.eqKill <= -30 && o.eqUnity === 0 && o.eqBoost > 0;

  // ---- 5) arming, and the graph it builds ----------------------------------
  o.armOk = M.vjArm();
  o.armedFlag = M.vj.armed === true;
  o.decksExist = !!(M.vj.a && M.vj.b && M.vj.va && M.vj.vb);
  o.deckIds = [M.vj.a.id, M.vj.b.id, M.vj.va.id, M.vj.vb.id].join(',');

  // ---- 6) VJ ON: the floor holds, whatever the decks do --------------------
  M.vjSetOn(true);
  o.onSetsFlag = M.vj.on === true && M.sel.vj.on === true;
  o.cleanOutput = document.body.classList.contains('vjlive');
  const va = M.vj.va;
  va.ready = true; va.opacity = 0;
  o.markAAtZero = +M.vjMarkA().toFixed(3);
  va.opacity = 1; M.vj.vxf = 0;                       // deck A fully up, fader hard A
  o.markAAtFull = +M.vjMarkA().toFixed(3);
  o.dimsUnderVideo = o.markAAtFull < o.markAAtZero;
  va.opacity = 99;                                     // absurd values must still clamp
  o.markAAbsurd = +M.vjMarkA().toFixed(3);
  o.floorHolds = o.markAAbsurd >= M.VJ.lineFloor - 1e-9;
  // ...and the floor is the ONLY thing between the markings and nothing.
  o.floorIsTheFloor = o.markAAbsurd === M.VJ.lineFloor;
  va.opacity = 0; va.ready = false;

  // ---- 7) PLAYERS ARE UNTOUCHABLE (the draw-order guarantee) ---------------
  // A fake "video" the seam will happily composite: a canvas standing in for the
  // element, driven to full opacity. A disc sampled after must be unchanged.
  const w = start(7);
  w.players.forEach((q,i)=>{ q.x = i===0 ? 0 : 9999; q.y = i===0 ? 0 : 9999; q.vx=0; q.vy=0; });
  w.ball.x = 200; w.ball.y = 200; w.ball.vx=0; w.ball.vy=0;
  M.computeCam(); M.render();
  // ⚠️ Sample a point that is demonstrably ON the player and is NOT black. The first
  // version of this read world (0,0) and got [0,0,0] — the disc's own rim colour —
  // which would have passed just as happily had the sample missed the player
  // entirely. Find a pixel on the disc that differs from the bare pitch first.
  const bare = at(0, 260);
  let probe = null;
  for (const [dx,dy] of [[0,0],[4,0],[0,4],[-4,0],[0,-4],[6,6],[-6,-6]]){
    const px = at(dx,dy);
    if (px.some((v,i)=>Math.abs(v-bare[i])>24) && px.some(v=>v>40)){ probe=[dx,dy]; break; }
  }
  o.probeAt = probe;
  o.foundThePlayer = !!probe;
  const discClean = probe ? at(probe[0],probe[1]) : [0,0,0];
  const fake = document.createElement('canvas'); fake.width=64; fake.height=64;
  const fc = fake.getContext('2d'); fc.fillStyle='#ff00ff'; fc.fillRect(0,0,64,64);
  // Stand the canvas in for the <video>: the seam only asks for readyState and size.
  Object.defineProperty(fake, 'readyState', { value: 4 });
  Object.defineProperty(fake, 'videoWidth', { value: 64 });
  Object.defineProperty(fake, 'videoHeight', { value: 64 });
  M.vj.va.el = fake; M.vj.va.ready = true; M.vj.va.opacity = 1; M.vj.vxf = 0;
  M.render();
  const discOver = probe ? at(probe[0],probe[1]) : [0,0,0];
  o.discClean = discClean; o.discOver = discOver;
  o.playerUntouched = discClean.every((v,i)=>Math.abs(v-discOver[i]) <= 1);
  // ...and the video really did land, or the check above proves nothing.
  const pitchPx = at(0, 260);
  o.pitchPx = pitchPx;
  o.videoActuallyPainted = pitchPx[0] > 120 && pitchPx[2] > 120 && pitchPx[1] < pitchPx[0]-40;
  M.vj.va.el = null; M.vj.va.ready = false; M.vj.va.opacity = 0;

  // ---- 8) ZERO SIM IMPACT --------------------------------------------------
  // Same seed, same steps, VJ off vs VJ on with both decks blazing. The world has to
  // come out bit-identical or the sim can see the render layer.
  const snap = ww => JSON.stringify(ww.players.map(q=>[q.x,q.y,q.vx,q.vy])
    .concat([[ww.ball.x, ww.ball.y, ww.ball.vx, ww.ball.vy]]));
  M.vjSetOn(false);
  let w1 = start(4242); for(let i=0;i<600;i++) M.step(w1);
  const off = snap(w1);
  M.vjSetOn(true);
  M.vj.va.el = fake; M.vj.va.ready = true; M.vj.va.opacity = 0.9;
  M.vj.vb.el = fake; M.vj.vb.ready = true; M.vj.vb.opacity = 0.7;
  M.vj.vxf = 0.5; M.vj.clock.bpm = 128;
  let w2 = start(4242); for(let i=0;i<600;i++){ M.step(w2); M.vjTick(); }
  const on = snap(w2);
  o.simBitIdentical = off === on;
  o.simSample = off.slice(0,60);
  M.vj.va.el=null; M.vj.va.ready=false; M.vj.va.opacity=0;
  M.vj.vb.el=null; M.vj.vb.ready=false; M.vj.vb.opacity=0;

  // ---- 9) the cross-tab contract -------------------------------------------
  // The snapshot must be structured-cloneable — a node or an element in it would
  // throw the moment it hit the channel, in the room, at showtime.
  const snapObj = M.vjSnap(true);
  let cloneOk = true, cloneErr = '';
  try { structuredClone(snapObj); } catch(e){ cloneOk=false; cloneErr=e.message; }
  o.snapshotCloneable = cloneOk; o.cloneErr = cloneErr;
  o.snapshotHasNoNodes = !JSON.stringify(snapObj).includes('AudioNode');
  // Meter pushes are throttled, not per frame.
  o.meterHz = M.VJ.meterHz;
  o.meterThrottled = M.VJ.meterHz > 0 && M.VJ.meterHz <= 30;
  // Every command the panel can send exists and is a function.
  o.cmdCount = Object.keys(M.VJ_CMDS).length;
  o.everyCmdReal = Object.values(M.VJ_CMDS).every(f=>typeof f==='function');
  // An unknown command must be ignored, not thrown — a stale panel will send them.
  let threw=false; try { M.vjExec('nonsense', {}); } catch(e){ threw=true; }
  o.unknownCmdSafe = !threw;

  // ---- 10) PANIC ------------------------------------------------------------
  M.vjSetOn(true); M.vj.master = 0.9;
  M.vj.va.ready=true; M.vj.va.opacity=1; M.vj.vb.ready=true; M.vj.vb.opacity=1;
  M.vjPanic();
  o.panicOff = M.vj.on === false;
  o.panicMaster = M.vj.master === 0;
  o.panicVideo = M.vj.va.opacity === 0 && M.vj.vb.opacity === 0;
  o.panicClearsChrome = !document.body.classList.contains('vjlive') || M.vj.on === false;
  o.panicRestoresMarkings = M.vjMarkA() === 1;
  // The panic key is bound on the game page and does not need the panel.
  M.vjSetOn(true);
  M.vjKey({ key:'Escape', shiftKey:true, preventDefault(){} });
  o.panicByKey = M.vj.on === false;

  // ---- 11) presets round-trip ----------------------------------------------
  M.vjSetOn(true); M.vj.a.eq.low = -0.8; M.vj.a.sweep = 0.4; M.vj.xf = 0.25;
  M.vj.va.tintAmt = 0.6; M.vj.master = 0.55;
  M.vjPresetSave('__test');
  M.vj.a.eq.low = 0; M.vj.a.sweep = 0; M.vj.xf = 0.9; M.vj.va.tintAmt = 0; M.vj.master = 1;
  M.vjPresetApply('__test');
  o.presetRoundTrip = Math.abs(M.vj.a.eq.low + 0.8) < 1e-9 && Math.abs(M.vj.a.sweep-0.4) < 1e-9 &&
                      Math.abs(M.vj.xf-0.25) < 1e-9 && Math.abs(M.vj.va.tintAmt-0.6) < 1e-9 &&
                      Math.abs(M.vj.master-0.55) < 1e-9;
  // A preset is a board position, not a playlist — it must carry no media.
  const raw = localStorage.getItem('magnetball.vjpresets') || '';
  o.presetBytes = raw.length;
  o.presetCarriesNoMedia = !/data:|blob:|"file"/.test(raw) && raw.length < 8000;
  M.vjPresetDelete('__test');

  // ---- 12) auto-loop reads the MASTER clock, not a second one -------------
  M.vj.clock.bpm = 120; M.vj.a.ready = true;
  M.vj.a.el = { currentTime: 10, play:()=>Promise.resolve(), pause(){} };
  M.vjAutoLoop(M.vj.a, 4);
  o.loop4 = M.vj.a.loop && +(M.vj.a.loop.out - M.vj.a.loop.in).toFixed(4);
  o.loopUsesMasterClock = Math.abs(o.loop4 - 2) < 1e-6;      // 4 beats at 120 = 2s
  M.vjAutoLoop(M.vj.a, 0);
  o.loopOff = M.vj.a.loop === null;
  M.vj.a.el = null; M.vj.a.ready = false;

  M.vjSetOn(false); M.setMatchSeed(null);
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.defaultOff, 'VJ Mode is not off by default');
ok(r.markAExactlyOne, 'markings alpha is not EXACTLY 1 with VJ Mode off — the off path is not the old path');
ok(r.seamIsNoOp, 'the video seam changed the frame with VJ Mode off');
ok(r.configIsFlat, 'the VJ config block holds something that is not a plain value');
ok(r.configKeys > 25, `the config block looks too small to be "all values": ${r.configKeys} keys`);
ok(r.tapIsRight, `tap tempo read ${r.tapBpm} BPM from taps 0.5s apart, expected 120`);
ok(r.foldsIntoRange, `a 240 BPM tap did not fold into range: ${r.foldedBpm}`);
ok(r.noTempoFiresNow, 'with no tempo, a quantised action waits forever instead of firing now');
ok(r.gridInRange, 'time-to-grid is outside one beat / one bar');
ok(r.smoothIsEqualPower, `smooth crossfader is not equal power: ${JSON.stringify(r.smooth)}`);
ok(r.sharpHoldsThenCuts, `the sharp law is not a cut curve — it should hold full to centre then cut: ${JSON.stringify(r.sharp)}`);
ok(r.sharpBeatsSmoothEarly, 'the sharp law fades earlier than the smooth one, so it is not a cut curve');
ok(r.noHole, 'the smooth crossfader dips in the middle — a blend would lose level');
ok(r.eqIsAKill, `EQ minimum is ${r.eqKill}dB — that is a dip, not a kill`);
ok(r.armOk && r.armedFlag, 'arming the audio failed');
ok(r.decksExist, 'arming did not create four decks');
ok(r.deckIds === 'a,b,a,b', `deck ids are wrong: ${r.deckIds}`);
ok(r.onSetsFlag, 'turning VJ Mode on did not stick');
ok(r.cleanOutput, 'VJ Mode did not switch the projector output to clean chrome');
ok(r.dimsUnderVideo, `markings did not dim under video: ${r.markAAtZero} -> ${r.markAAtFull}`);
ok(r.floorHolds, `markings went below the floor: ${r.markAAbsurd} < ${0.2}`);
ok(r.floorIsTheFloor, `an absurd opacity should land exactly on the floor, got ${r.markAAbsurd}`);
ok(r.videoActuallyPainted, `the video never reached the pitch, so the player check proves nothing: ${JSON.stringify(r.pitchPx)}`);
ok(r.foundThePlayer, 'the probe never landed on a player, so the draw-order check would pass vacuously');
ok(r.playerUntouched, `a video deck dimmed a PLAYER: clean ${JSON.stringify(r.discClean)} vs over ${JSON.stringify(r.discOver)}`);
ok(r.simBitIdentical, 'the sim diverged with VJ Mode on — the render layer is reachable from step()');
ok(r.snapshotCloneable, `the state snapshot cannot cross the channel: ${r.cloneErr}`);
ok(r.snapshotHasNoNodes, 'the snapshot carries an audio node');
ok(r.meterThrottled, `meter pushes are not throttled sensibly: ${r.meterHz}Hz`);
ok(r.cmdCount > 20, `only ${r.cmdCount} remote commands — the panel cannot drive the rig`);
ok(r.everyCmdReal, 'a remote command is not a function');
ok(r.unknownCmdSafe, 'an unknown command threw — a stale panel would take the rig down');
ok(r.panicOff && r.panicMaster && r.panicVideo, 'PANIC did not kill the decks and the master');
ok(r.panicRestoresMarkings, 'PANIC left the markings dimmed');
ok(r.panicByKey, 'the panic hotkey does not work without the panel');
ok(r.presetRoundTrip, 'a preset did not restore the full board position');
ok(r.presetCarriesNoMedia, `a preset carries media or is enormous: ${r.presetBytes} bytes`);
ok(r.loopUsesMasterClock, `a 4-beat auto-loop at 120 BPM came out ${r.loop4}s, expected 2s`);
ok(r.loopOff, 'auto-loop off did not clear the loop');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nvjmode OK');
