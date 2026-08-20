// Debug readout + build stamp: the numbers must be real (they track the live
// simulation and the actual feel settings), and the toggle must actually gate them.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.autoReplay=false; M.sel.mode='1v1'; M.sel.debug=false;
  M.startMatch(); await wait(150);
  const w=M.world; w.state='play'; w.stateT=1; M.computeCam();

  const cv=document.getElementById('game'), c2=cv.getContext('2d');
  const DPR = cv.width/cv.clientWidth, cw=cv.clientWidth, ch=cv.clientHeight;
  // Count lit pixels in a bottom-left block, above where the build stamp sits.
  const ink = (x0,y0,ww,hh) => {
    const d=c2.getImageData(Math.round(x0*DPR),Math.round(y0*DPR),
                            Math.round(ww*DPR),Math.round(hh*DPR)).data;
    let n=0; for(let i=0;i<d.length;i+=4) if(d[i]+d[i+1]+d[i+2] > 260) n++;
    return n;
  };
  const statsInk = () => ink(8, ch-120, 260, 90);
  const stampInk = () => ink(8, ch-26,  150, 20);

  // ⚠️ **THE BUILD STAMP IS DEBUG-ONLY NOW, and this check used to say "shows regardless".**
  // It printed `v20260820…` over the bottom-left of the pitch in every match on every
  // player's screen — a build number is a thing a developer needs and a thing nobody else
  // has any use for. What it was for survives and is better: the About card's version block
  // is a one-tap copy that carries the screen size and layout with it, which is why
  // `versionInDom` below is the half of this that still matters.
  o.versionIsTimeStamped = /^\d{8}\.\d{4}(AM|PM)$/.test(M.VERSION);
  o.versionInDom = (document.getElementById('ver')||{}).textContent === 'v'+M.VERSION;

  // --- Toggle off: no stats block, and no stamp over the pitch either
  M.sel.debug=false; await wait(200);
  o.statsHiddenWhenOff = statsInk() < 15;
  o.stampHiddenWhenOff = stampInk() < 15;

  // --- Toggle on: stats block appears, and so does the stamp
  M.sel.debug=true; await wait(250);
  o.statsShownWhenOn = statsInk() > 60;
  o.stampShownWhenOn = stampInk() > 20;

  // --- The numbers are LIVE, not placeholders: change the sim, the block changes.
  const sample = () => { const d=c2.getImageData(8*DPR, Math.round((ch-120)*DPR),
                              Math.round(260*DPR), Math.round(90*DPR)).data;
    let h=0; for(let i=0;i<d.length;i+=16) h=(h*31 + d[i])|0; return h; };
  w.ball.vx=0; w.ball.vy=0; await wait(120); const still = sample();
  w.ball.vx=18; w.ball.vy=-9; await wait(120); const fast = sample();
  o.readoutTracksBall = still !== fast;

  // --- And it reflects the feel settings, not hardcoded text
  M.sel.feel = { accel:40, pdamp:905, ballcap:32, kick:55, bdamp:990 };
  M.applyFeel(); await wait(150); const feelA = sample();
  M.sel.feel = { accel:77, pdamp:930, ballcap:61, kick:80, bdamp:975 };
  M.applyFeel(); await wait(150); const feelB = sample();
  o.readoutTracksFeel = feelA !== feelB;
  M.sel.feel = { accel:40, pdamp:905, ballcap:32, kick:55, bdamp:990 }; M.applyFeel();

  // --- Toggle is wired in the settings UI
  M.buildSettings();
  const tiles=[...document.querySelectorAll('#debugPick .opt')];
  o.toggleExists = tiles.length === 2;
  M.sel.debug=false; M.buildSettings();
  tiles[1] && [...document.querySelectorAll('#debugPick .opt')][1].click();
  await wait(60);
  o.toggleTurnsOn = M.sel.debug === true;
  [...document.querySelectorAll('#debugPick .opt')][0].click(); await wait(60);
  o.toggleTurnsOff = M.sel.debug === false;

  // --- Debug off must not disturb a drill either
  M.sel.debug=true; M.startDrill('straight_up'); await wait(200);
  o.drillSurvivesDebug = M.world.drillMode === true;
  M.sel.debug=false;
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.stampHiddenWhenOff && r.stampShownWhenOn && r.versionIsTimeStamped && r.versionInDom &&
  r.statsHiddenWhenOff && r.statsShownWhenOn && r.readoutTracksBall && r.readoutTracksFeel &&
  r.toggleExists && r.toggleTurnsOn && r.toggleTurnsOff && r.drillSurvivesDebug &&
  errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
