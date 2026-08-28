// The menu's idle background match is bot vs bot. It must not look like the
// player's own team playing itself, and it must say it's a demo.
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
  M.sel.autoReplay=false; M.sel.mode='2v2';
  // Give the player a distinctive look so "bots copied me" would be obvious.
  M.profile.flag = 'none'; M.profile.cap = 'star'; M.profile.color = '#ff00ff';

  // --- Demo: two random countries, one per side
  const seen = new Set();
  let allDistinct = true, allCountries = true, teamsUniform = true;
  for (let run = 0; run < 8; run++){
    M.startDemo(); await wait(80);
    const w = M.world;
    const t0 = w.players.filter(x=>x.team===0), t1 = w.players.filter(x=>x.team===1);
    const a = t0[0].flag, c = t1[0].flag;
    if (!t0.every(q=>q.flag===a) || !t1.every(q=>q.flag===c)) teamsUniform = false;
    if (a === c) allDistinct = false;
    if (a === 'none' || c === 'none' ||
        !M.FLAG_KEYS.includes(a) || !M.FLAG_KEYS.includes(c)) allCountries = false;
    seen.add(a); seen.add(c);
  }
  o.teamsUniform  = teamsUniform;      // one country per side, shared by that side
  o.sidesDiffer   = allDistinct;       // never the same country on both sides
  o.realCountries = allCountries;      // never the empty 'none' faceplate
  o.varietyAcrossRuns = seen.size > 3; // genuinely random, not a fixed pair
  o.isDemoWorld = M.world.demo === true;
  o.notPlayerFlag = M.world.players.every(q => q.flag !== 'none');   // player's own look not copied

  // --- The "Demo" tag is actually painted, bottom right
  const cv=document.getElementById('game'), c2=cv.getContext('2d');
  const DPR = cv.width / cv.clientWidth;
  const cw = cv.clientWidth, ch = cv.clientHeight;
  // Sample the corner block the tag occupies and count near-white pixels.
  const whiteCount = () => {
    const x0 = Math.round((cw-110)*DPR), y0 = Math.round((ch-40)*DPR);
    const d = c2.getImageData(x0, y0, Math.round(100*DPR), Math.round(30*DPR)).data;
    let n=0;
    for (let i=0;i<d.length;i+=4) if (d[i]>200 && d[i+1]>200 && d[i+2]>200) n++;
    return n;
  };
  M.startDemo(); await wait(300);
  o.demoTagPixels = whiteCount();

  // A real match must NOT carry the tag.
  M.startMatch(); await wait(300);
  o.realMatchTagPixels = whiteCount();
  o.realMatchIsNotDemo = !M.world.demo;

  // In a real match only YOUR disc wears your look — bots have their own
  // (see botlook.mjs). This used to assert the opposite, which was the bug.
  M.profile.flag = 'poland';
  M.startMatch(); await wait(120);
  const ps = M.world.players, me = ps.find(q=>q.ctrl==='human1');
  o.realMatchKeepsYours = !!me && me.flag === 'poland';
  o.realMatchBotsDiffer = ps.filter(q=>q!==me).every(q => q.flag !== 'poland');

  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.teamsUniform && r.sidesDiffer && r.realCountries && r.varietyAcrossRuns &&
  r.isDemoWorld && r.notPlayerFlag &&
  r.demoTagPixels > 30 && r.realMatchTagPixels === 0 && r.realMatchIsNotDemo &&
  r.realMatchKeepsYours && r.realMatchBotsDiffer && errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
