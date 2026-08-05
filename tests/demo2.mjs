// Demo polish + controller wording + the longer crowd cheers.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{
  window.__MAGNETDEBUG=true;
  // A fake pad, so a match can be genuinely controller-only.
  window.__pad = { axes:[0,0,0,0], buttons:new Array(17).fill(false) };
  navigator.getGamepads = () => [{ index:0, connected:true, id:'fake', mapping:'standard',
    axes: window.__pad.axes, buttons: window.__pad.buttons.map(v=>({pressed:!!v,value:v?1:0})) }];
});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.autoReplay = true; M.sel.mode='2v2'; M.sel.field='classic'; M.sel.display='auto';
  M.applyDisplayMode(); await wait(120);

  // --- Demo picks a random court, not the one you selected
  const fields = new Set();
  for (let i=0;i<12;i++){ M.startDemo(); await wait(50); fields.add(M.world.field.name); }
  o.demoFieldsVary = fields.size > 2;
  o.demoIsDemo = M.world.demo === true;

  // A real match still uses YOUR field.
  M.startMatch(); await wait(120);
  o.realMatchUsesSelected = M.world.field === M.FIELDS['classic'];

  // --- Demo never replays, even with auto-replay on
  M.startDemo(); await wait(120);
  const dw = M.world; dw.state='play'; dw.stateT=1;
  // Force a goal and let the goal state run out; a replay would set replay.active.
  dw.ball.x = 0; dw.ball.y = -(dw.field.L/2 - 2); dw.ball.vy = -6;
  M.checkGoal(dw);
  for (let i=0;i<200;i++) M.step(dw);          // past the 1.8s goal hold
  await wait(120);
  o.demoNeverReplays = M.replay.active === false;
  o.autoReplayStillOn = M.sel.autoReplay === true;   // setting untouched

  // --- Controller wording
  M.sel.controllers='off'; M.sel.display='auto'; M.applyDisplayMode(); await wait(100);
  M.sel.mode='2v2'; M.startMatch(); await wait(120);
  o.padOnlyWhenTouch = M.padOnly() === false;
  const touchWord = M.skipWord();
  o.touchWordNoButton = !/button/i.test(touchWord);

  M.sel.controllers='on'; M.startMatch(); await wait(120);   // fake pad -> seats become gamepad
  o.seatsArePad = M.world.players.some(q=>q.ctrl==='gamepad');
  o.padOnlyWhenPads = M.padOnly() === true;
  o.padWord = M.skipWord();
  o.padWordSaysButton = /press any button/i.test(o.padWord);

  // Deck layout is controller-only by definition
  M.sel.controllers='off'; M.sel.display='deck'; M.applyDisplayMode(); await wait(180);
  o.padOnlyOnDeck = M.padOnly() === true;
  M.sel.display='auto'; M.applyDisplayMode(); await wait(150);

  // --- The demo is a SHOWCASE: top-tier bots on BOTH sides, a real 3-minute clock,
  // and it rolls straight into the next one. It must ignore the player's own
  // difficulty and length — those are for matches the player actually plays.
  M.sel.diff = 'rookie'; M.sel.length = '5';
  M.startDemo();
  const sw = M.world;
  o.demoIsDemo2 = !!sw.demo;
  o.demoAllBots = sw.players.every(q => q.ctrl === 'bot');
  const tiers = Object.keys(M.DIFF);
  o.demoDiff = sw.diff && sw.diff.name;
  o.demoIsTopTier = sw.diff === M.DIFF[tiers[tiers.length-1]];
  // Derived, not spelled: adding a harder tier must move the demo up with it.
  o.demoIgnoresPlayerDiff = sw.diff !== M.DIFF.rookie;
  // Both sides read ONE w.diff, so top tier on one bench is top tier on both.
  o.oneDiffForBothSides = sw.players.filter(q=>q.team===0).length > 0 &&
                          sw.players.filter(q=>q.team===1).length > 0;
  o.demoSecs = sw.len.secs;
  o.demoIsTimed = sw.len.secs === M.DEMO.secs && M.DEMO.secs === 180;
  o.demoIgnoresPlayerLength = sw.len.secs !== M.LENGTHS['5'].secs;
  // ⚠️ A LEVEL demo must NOT go to sudden death. It would hang on the menu until
  // someone scored and throw OVERTIME! across the screen — the demo just ends and
  // the next one starts.
  sw.state='play'; sw.stateT=2; sw.score=[2,2]; sw.timeLeft=0.01;
  const swBefore = sw;
  M.step(sw);
  o.demoSkipsOvertime = sw.overtime === false;
  o.demoEndedOrRolled = M.world !== swBefore || sw.state === 'over';
  // ...and a real match at exactly the same point still goes to overtime.
  M.sel.diff='normal'; M.sel.length='3'; M.startMatch();
  const rw = M.world; rw.state='play'; rw.stateT=2; rw.score=[1,1]; rw.timeLeft=0.01;
  M.step(rw);
  o.realMatchKeepsOvertime = rw.overtime === true;
  o.realMatchKeepsItsDiff = rw.diff === M.DIFF.normal;

  // --- Crowd cheers: the three STADIUM ones longer than the three originals.
  // Counts are derived, not pinned at six — themed sets have since added more, and a
  // suite that says "exactly six" only ever measures how recently someone edited it.
  // What must hold is that every sound is labelled (an unlabelled one is unpickable)
  // and that no two are the same closure.
  o.crowdCount = M.SFX.crowd.length;
  o.crowdLabels = M.SFX_LABELS.crowd.length;
  o.everyCatLabelled = Object.keys(M.SFX).every(c => M.SFX[c].length === M.SFX_LABELS[c].length);
  o.unlabelled = Object.keys(M.SFX).filter(c => M.SFX[c].length !== M.SFX_LABELS[c].length);
  // The SFX closures capture the module-scope Aud, so a spy can't intercept them.
  // Assert the declared durations from the source instead.
  const src = M.SFX.crowd.map(f=>f.toString());
  // noise(DUR, opts) -> 1st arg; tone(FREQ, DUR, ...) -> 2nd arg. Capture groups,
  // not a blanket strip: stripping non-digits leaves the dot from "Aud." and turns
  // 2.2 into 0.2, which silently understates every duration.
  const durOf = t => {
    let m, best = 0;
    const reN = /Aud\.noise\(\s*([0-9.]+)/g;
    while ((m = reN.exec(t))) best = Math.max(best, parseFloat(m[1]));
    const reT = /Aud\.tone\(\s*[0-9.]+\s*,\s*([0-9.]+)/g;
    while ((m = reT.exec(t))) best = Math.max(best, parseFloat(m[1]));
    return best;
  };
  const lens = src.map(durOf);
  o.origMax = Math.max(...lens.slice(0,3));
  o.newMin  = Math.min(...lens.slice(3,6));      // Stadium / Chant / Ovation only
  o.lens = lens;
  o.newAreLonger = o.newMin > o.origMax;
  o.allDistinct = new Set(src).size === src.length;

  M.sel.controllers='off'; M.sel.mode='1v1';
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.demoFieldsVary && r.demoIsDemo && r.realMatchUsesSelected &&
  r.demoNeverReplays && r.autoReplayStillOn &&
  r.padOnlyWhenTouch && r.touchWordNoButton && r.seatsArePad && r.padOnlyWhenPads &&
  r.padWordSaysButton && r.padOnlyOnDeck &&
  r.crowdCount >= 6 && r.everyCatLabelled && r.newAreLonger && r.allDistinct &&
  r.demoIsDemo2 && r.demoAllBots && r.demoIsTopTier && r.demoIgnoresPlayerDiff &&
  r.oneDiffForBothSides && r.demoIsTimed && r.demoIgnoresPlayerLength &&
  r.demoSkipsOvertime && r.demoEndedOrRolled &&
  r.realMatchKeepsOvertime && r.realMatchKeepsItsDiff &&
  errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
