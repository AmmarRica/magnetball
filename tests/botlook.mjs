// Bots must not wear your face. Dressing every bot in profile.* made all eight
// discs identical — the only thing separating you from an opponent was the ring.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const look = q => [q.flag, q.cap, q.eyes, q.color].join('|');

  // A distinctive player look, so "copied from you" is unmistakable.
  M.profile.flag='none'; M.profile.cap='crown'; M.profile.eyes='googly'; M.profile.color='#46d17a';
  M.saveProfile();
  M.sel.spectate='play'; M.sel.controllers='off'; M.sel.mode='2v2'; M.startMatch(); await wait(150);

  const w=M.world, ps=w.players;
  const you = ps.find(q=>q.ctrl==='human1');
  const bots = ps.filter(q=>q!==you);
  o.seats = ps.length;
  o.youKeepYourLook = you.cap==='crown' && you.color==='#46d17a';
  o.noBotCopiesYou = bots.every(q=>look(q) !== look(you));
  o.botsDifferFromEachOther = new Set(bots.map(look)).size === bots.length;
  o.botFacesVary = new Set(bots.map(q=>q.flag)).size > 1;
  o.botCapsVary  = new Set(bots.map(q=>q.cap)).size > 1;
  // Teams still read as teams: bot colours sit in their side's family.
  o.teamColoursSplit = new Set(ps.filter(q=>q.team===0).map(q=>q.color)).size >= 1 &&
    ps.filter(q=>q.team===1).every(q=>q.color !== you.color);

  // Deterministic: the same match twice gives the same faces (no per-frame churn).
  const sig = () => M.world.players.map(look).join(',');
  M.startMatch(); await wait(120); const a1 = sig();
  M.startMatch(); await wait(120); const a2 = sig();
  o.stableAcrossRestarts = a1 === a2;

  // Bigger sides still don't collapse onto one look.
  M.sel.mode='4v4'; M.startMatch(); await wait(150);
  const big = M.world.players.filter(q=>q.ctrl==='bot');
  o.bigSeats = big.length;
  o.bigLooksVary = new Set(big.map(look)).size >= Math.min(6, big.length);

  // The idle demo keeps its own rule: one country per side, and NOT your face.
  M.startDemo(); await wait(150);
  const dps = M.world.players;
  const t0f = new Set(dps.filter(q=>q.team===0).map(q=>q.flag));
  const t1f = new Set(dps.filter(q=>q.team===1).map(q=>q.flag));
  o.demoOneFlagPerTeam = t0f.size===1 && t1f.size===1 && [...t0f][0] !== [...t1f][0];
  o.demoNotYourCap = dps.every(q=>q.cap==='none');

  // Every disc still renders (a bad cap/flag key would throw here).
  o.rendersClean = true;
  try { M.sel.mode='3v3'; M.startMatch(); const ww=M.world; ww.state='play'; ww.stateT=1;
        for(let i=0;i<10;i++) M.step(ww); M.render(); }
  catch(e){ o.rendersClean=false; o.renderErr=e.message; }

  M.sel.mode='1v1';
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.seats===4 && r.youKeepYourLook && r.noBotCopiesYou && r.botsDifferFromEachOther &&
  r.botFacesVary && r.botCapsVary && r.teamColoursSplit && r.stableAcrossRestarts &&
  r.bigLooksVary && r.demoOneFlagPerTeam && r.demoNotYourCap && r.rendersClean &&
  errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
