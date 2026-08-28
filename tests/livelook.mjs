// Customising your player must show on the pitch immediately, not at the next
// kickoff. And the idle demo must never announce OVERTIME or throw a result
// overlay across the menu — it's wallpaper, not a match.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1000,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const me = () => M.world.players.find(q=>q.ctrl==='human1');

  // --- Live customisation, mid-match, without restarting
  M.sel.names=''; M.sel.mode='2v2'; M.sel.spectate='play'; M.sel.controllers='off';
  M.profile.color='#46d17a'; M.profile.cap='none'; M.profile.flag='none'; M.profile.eyes='googly';
  M.profile.name='Before'; M.saveProfile();
  M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
  for(let i=0;i<30;i++) M.step(w);
  o.startLook = { color:me().color, cap:me().cap, flag:me().flag, name:me().name };

  // change the profile the way the pickers do — no restart
  M.profile.color='#e05a5a'; M.profile.cap='crown'; M.profile.flag='poland';
  M.profile.eyes='angry'; M.profile.name='After';
  M.saveProfile();
  o.liveLook = { color:me().color, cap:me().cap, flag:me().flag, eyes:me().eyes, name:me().name };
  o.updatesLive = o.liveLook.color==='#e05a5a' && o.liveLook.cap==='crown' &&
                  o.liveLook.flag==='poland' && o.liveLook.eyes==='angry' && o.liveLook.name==='After';
  o.matchNotRestarted = M.world === w && w.state === 'play';

  // ...and it's what actually gets drawn: the disc's pixels move.
  const cv=document.getElementById('game'), c2=cv.getContext('2d');
  const DPR=cv.width/cv.clientWidth;
  const discPx = () => { const q=me(); const [sx,sy]=M.screenPt(M.wx(q.x), M.wy(q.y));
    const d=c2.getImageData(Math.round(sx*DPR)-6, Math.round(sy*DPR)-6, 12, 12).data;
    let h=0; for(let i=0;i<d.length;i+=4) h=(h*31+d[i]+d[i+1]*3+d[i+2]*7)|0; return h; };
  M.computeCam(); M.render(); const pxA = discPx();
  // Snapshot an opponent BEFORE the change: "differs from your colour" would be a
  // trap, because team 1's base tint is #5a7de0 and picking that as your colour
  // makes a passing test look like a failing one.
  const foe = M.world.players.find(q=>q.team===1);
  const foeBefore = JSON.stringify({c:foe.color, f:foe.flag, e:foe.eyes, p:foe.cap, n:foe.name});
  M.profile.color='#ff00ff'; M.saveProfile(); M.render();
  o.repaints = discPx() !== pxA;

  // Opponents must NOT follow your look (that was the old bug)
  o.foeUnchanged = JSON.stringify({c:foe.color, f:foe.flag, e:foe.eyes, p:foe.cap, n:foe.name}) === foeBefore;

  // A typed seat name still wins over your profile name
  M.sel.names='Custom1'; M.saveSel(); M.startMatch();
  const w2=M.world; w2.state='play';
  M.profile.name='ShouldNotWin'; M.saveProfile();
  o.seatNameWins = w2.players[0].name === 'Custom1';
  M.sel.names=''; M.saveSel();

  // --- The idle demo is a timed SHOWCASE now: a real DEMO.secs clock that rolls
  // into the next match, top tier on both benches. What must still never happen is
  // the ceremony — no OVERTIME banner and no result overlay across the menu.
  M.startDemo(); await wait(60);
  const dw=M.world;
  o.demoIsDemo = dw.demo === true;
  o.demoIsTimed = dw.len.secs === M.DEMO.secs && !dw.len.goals;
  o.demoClockLabel = document.getElementById('clock').textContent;
  dw.state='play'; dw.stateT=1;
  for(let i=0;i<400;i++) M.step(dw);
  o.demoNeverOvertime = dw.overtime === false;
  o.noOvertimeBanner = !/OVERTIME/i.test(document.getElementById('banner').textContent) ||
                       !document.getElementById('banner').classList.contains('show');
  o.noResultOverlay = !document.getElementById('overlay').classList.contains('show');
  o.demoStillPlaying = dw.state !== 'over';

  // ...and your look never leaks onto the demo
  M.profile.color='#ff00ff'; M.saveProfile();
  o.demoIgnoresYou = !M.world.players.some(q=>q.color === '#ff00ff');

  // --- A real timed match still goes to overtime when level at full time
  M.sel.mode='1v1'; M.sel.length='3'; M.startMatch();
  const rw=M.world; rw.state='play'; rw.stateT=1; rw.timeLeft=0.05; rw.score=[1,1];
  for(let i=0;i<10;i++) M.step(rw);
  o.realMatchOvertime = rw.overtime === true;
  o.realMatchClock = document.getElementById('clock').textContent;
  M.sel.length='5';
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.updatesLive && r.matchNotRestarted && r.repaints && r.foeUnchanged && r.seatNameWins &&
  r.demoIsDemo && r.demoIsTimed && r.demoNeverOvertime && r.noOvertimeBanner &&
  r.noResultOverlay && r.demoStillPlaying && r.demoIgnoresYou && r.realMatchOvertime &&
  errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
