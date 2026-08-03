import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const errors=[];
// 1) Mobile portrait must be completely unaffected
const mp = await b.newPage({ viewport:{width:420,height:820}, hasTouch:true, isMobile:true });
mp.on('pageerror',e=>errors.push('mobile:'+e.message));
mp.on('console',m=>{if(m.type()==='error')errors.push('mobile:'+m.text());});
await mp.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await mp.goto('file://' + process.cwd() + '/index.html');
await mp.waitForTimeout(500);
const mob = await mp.evaluate(()=>{
  const M=window.__magnet;
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.display='auto'; M.applyDisplayMode(); M.startMatch();
  const w=M.world; w.state='play'; w.stateT=1; for(let i=0;i<40;i++) M.step(w);
  return { rot:(M.cam.rot||0), touch:M.isTouchLayout(), pad:M.uiPadLeft,
           rq: w.players.find(x=>x.ctrl==='human1').rotQuarter };
});
await mp.close();

// 2) Deck: render every field + grass + a bunch of flags/eyes without throwing
const dp = await b.newPage({ viewport:{width:1280,height:800} });
dp.on('pageerror',e=>errors.push('deck:'+e.message));
dp.on('console',m=>{if(m.type()==='error')errors.push('deck:'+m.text());});
await dp.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await dp.goto('file://' + process.cwd() + '/index.html');
await dp.waitForTimeout(500);
const deck = await dp.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.display='deck'; M.applyDisplayMode();
  await new Promise(r=>setTimeout(r,150));
  let esc=0, bad=0;
  const grasses=['stripes','vertical','check','diagonal','rings','solid'];
  const flags=Object.keys(M.FLAGS).slice(0,14);
  let gi=0, fi=0;
  for (const f of Object.keys(M.FIELDS)){
    M.sel.field=f; M.sel.grass=grasses[gi++%grasses.length];
    M.profile.flag=flags[fi++%flags.length];
    M.sel.mode='2v2'; M.startMatch();
    const w=M.world; w.state='play'; w.stateT=1;
    for(let i=0;i<120;i++){
      w.ball.vx+=Math.sin(i*1.7)*26; w.ball.vy+=Math.cos(i*2.2)*26;
      if(i%30===0) w.possTeam = (i/30)%2;
      M.step(w);
      if(Math.abs(w.ball.x)>w.bounds.halfW+40||Math.abs(w.ball.y)>w.bounds.halfL+w.bounds.net+40) esc++;
      for(const pl of w.players) if(!isFinite(pl.x)||!isFinite(pl.y)) bad++;
    }
  }
  o.ballEscapes=esc; o.badPlayers=bad;
  o.rot = M.cam.rot;
  // switching back and forth is stable
  M.sel.display='auto'; M.applyDisplayMode(); await new Promise(r=>setTimeout(r,120));
  M.computeCam(); o.backToPortrait=(M.cam.rot||0)===0;
  M.sel.display='deck'; M.applyDisplayMode(); await new Promise(r=>setTimeout(r,120));
  M.computeCam(); o.backToDeck=Math.abs(M.cam.rot+Math.PI/2)<0.001;
  M.sel.display='cocktail'; M.applyDisplayMode(); await new Promise(r=>setTimeout(r,120));
  M.computeCam(); o.cocktailPortrait=(M.cam.rot||0)===0;
  return o;
});
await dp.close(); await b.close();
console.log('MOBILE:', JSON.stringify(mob));
console.log('DECK  :', JSON.stringify(deck));
console.log('ERRORS:', errors.length?errors.slice(0,6):'none');
const ok = mob.rot===0 && mob.touch===true && mob.pad===0 && mob.rq===0 &&
  deck.ballEscapes===0 && deck.badPlayers===0 && deck.backToPortrait &&
  deck.backToDeck && deck.cocktailPortrait && errors.length===0;
console.log('RESULT:', ok?'ALL PASS':'FAIL');
process.exit(ok?0:1);
