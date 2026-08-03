import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

console.log('DUP IDS:', await p.evaluate(()=>{
  const seen={},dup=[]; document.querySelectorAll('[id]').forEach(el=>seen[el.id]=(seen[el.id]||0)+1);
  for(const k in seen) if(seen[k]>1) dup.push(k+' x'+seen[k]); return dup.length?dup:'none'; }));

console.log('SCREENS:', await p.evaluate(async ()=>{
  const M=window.__magnet; const out=[];
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const fns={stats:M.openStats,shop:M.openShop,social:M.openSocial,leaderboard:M.openLeaderboard,
             rogue:M.openRogue,padConfig:M.openPadConfig,settings:M.openSettings,daily:M.openDailyView};
  for(const n in fns){ try{ fns[n](); await new Promise(r=>setTimeout(r,140)); }catch(e){ out.push(n+':THREW '+e.message); } }
  M.toMenu(); return out.length?out:'all ok'; }));

console.log('PICKERS:', await p.evaluate(()=>{
  const M=window.__magnet; const bad=[];
  for(const f of ['buildFlagPicker','buildEyesPicker','buildCaps','buildPartyMods','buildSettings','buildStats','buildShop'])
    try{ M[f](); }catch(e){ bad.push(f+':'+e.message); }
  return bad.length?bad:'all ok'; }));

console.log('THEMES:', await p.evaluate(()=>{
  const M=window.__magnet; const bad=[];
  for(const k of Object.keys(M.THEMES)) try{ M.applyTheme(k); }catch(e){ bad.push(k); }
  M.applyTheme(M.sel.theme); return bad.length?bad:'all ok'; }));

console.log('DRILLS:', await p.evaluate(()=>{
  const M=window.__magnet; const bad=[];
  for(const k of Object.keys(M.DRILLS)){
    try{ M.startDrill(k); const w=M.world;
      for(let i=0;i<90;i++) M.stepDrill(w);
      if(!isFinite(w.ball.x)) bad.push(k+':NaN');
      if(Math.abs(w.ball.x)>w.field.W/2+60||Math.abs(w.ball.y)>w.field.L/2+60) bad.push(k+':ballOut');
    }catch(e){ bad.push(k+':THREW '+e.message); } }
  return bad.length?bad:'all ok'; }));

console.log('MODES:', await p.evaluate(()=>{
  const M=window.__magnet; const bad=[];
  for(const k of ['1v1','2v2','3v3','4v4','duo','local','train']){
    try{ M.sel.mode=k; M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
      for(let i=0;i<150;i++) M.step(w);
      if(!isFinite(w.ball.x)) bad.push(k+':NaN');
    }catch(e){ bad.push(k+':THREW '+e.message); } }
  M.sel.mode='1v1'; return bad.length?bad:'all ok'; }));

// party modifiers combined
console.log('PARTY:', await p.evaluate(()=>{
  const M=window.__magnet; const bad=[];
  const combos=[{big:1},{lowg:1},{sudden:1},{multi:1},{big:1,lowg:1,sudden:1,multi:1}];
  for(const c of combos){
    try{ M.sel.party={big:!!c.big,lowg:!!c.lowg,sudden:!!c.sudden,multi:!!c.multi};
      M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
      for(let i=0;i<200;i++){ w.ball.vx+=Math.sin(i)*20; M.step(w); }
      if(!isFinite(w.ball.x)) bad.push(JSON.stringify(c)+':NaN');
    }catch(e){ bad.push(JSON.stringify(c)+':THREW '+e.message); } }
  M.sel.party={big:false,lowg:false,sudden:false,multi:false};
  return bad.length?bad:'all ok'; }));

console.log('ERRORS:', errs.length?errs.slice(0,8):'none');
await b.close();
