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
  // ⚠️ No `color` in the identity. It is the TEAM's now, so including it here would
  // make "every bot looks different" trivially false on one side and trivially true
  // across sides — measuring the shirt instead of the player.
  const look = q => [q.flag, q.cap, q.eyes].join('|');

  // A distinctive player look, so "copied from you" is unmistakable.
  M.profile.flag='none'; M.profile.cap='crown'; M.profile.eyes='googly'; M.profile.color='#46d17a';
  M.saveProfile();
  M.sel.spectate='play'; M.sel.controllers='off'; M.sel.mode='2v2'; M.startMatch(); await wait(150);

  const w=M.world, ps=w.players;
  const you = ps.find(q=>q.ctrl==='human1');
  const bots = ps.filter(q=>q!==you);
  o.seats = ps.length;
  // ⚠️ COLOUR IS NOT PART OF "YOUR LOOK" ANY MORE — it belongs to the TEAM. A side
  // used to be three or four shades of nearly-red, and telling the two teams apart at
  // a glance is the one thing a shirt colour has to do. What is yours is your cap,
  // your face, your eyes and your name; the shirt is the side you are on.
  o.youKeepYourLook = you.cap==='crown' && you.eyes==='googly';
  o.yourShirtIsTheTeamS = you.color === M.teamColOf(0);
  o.noBotCopiesYou = bots.every(q=>look(q) !== look(you));
  // ⚠️ ...so "bots differ" is measured WITHOUT the colour, for the same reason. They
  // are still individuals — name, face, eyes — and they are all in their side's shirt.
  o.botsDifferFromEachOther = new Set(bots.map(look)).size === bots.length;
  o.oneShadeASide = new Set(ps.filter(q=>q.team===0).map(q=>q.color)).size === 1 &&
                    new Set(ps.filter(q=>q.team===1).map(q=>q.color)).size === 1;
  o.botFacesVary = new Set(bots.map(q=>q.flag)).size > 1;
  // ⚠️ Bots wear NO cap now. They used to cycle the whole CAPS table, which put a
  // different hat on every disc and made a cap read as decoration rather than as
  // YOUR mark. What must still hold is that bots are individuals — colour, shirt
  // number and eyes vary — and that your own cap is untouched by any of it.
  o.botCaps      = [...new Set(bots.map(q=>q.cap))];
  o.botsWearNoCap = bots.every(q=>q.cap === 'none' || q.cap == null);
  // Teams still read as teams: bot colours sit in their side's family.
  o.teamColoursSplit = new Set(ps.filter(q=>q.team===0).map(q=>q.color)).size === 1 &&
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
const ok = r.seats===4 && r.youKeepYourLook && r.yourShirtIsTheTeamS && r.oneShadeASide &&
  r.noBotCopiesYou && r.botsDifferFromEachOther &&
  r.botFacesVary && r.botsWearNoCap && r.teamColoursSplit && r.stableAcrossRestarts &&
  r.bigLooksVary && r.demoOneFlagPerTeam && r.demoNotYourCap && r.rendersClean &&
  errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
