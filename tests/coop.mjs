import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:420,height:820}, hasTouch:true, isMobile:true });
const errors=[]; p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
// Fake 3 connected gamepads BEFORE load
await p.addInitScript(()=>{
  window.__MAGNETDEBUG=true;
  const mk=i=>({index:i,connected:true,id:'fake'+i,axes:[0,0,0,0],
    buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
  navigator.getGamepads = () => [mk(0),mk(1),mk(2)];
});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(400);
const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const shape = w => w.players.map(x=>`${x.team}:${x.ctrl}`);
  M.sel.controllers='on'; M.sel.mode='3v3';

  // CO-OP: all 3 pads should land on team 0 -> 3 humans vs 3 AI
  M.sel.coop='on'; M.startMatch();
  const c=M.world;
  o.coopShape = shape(c);
  o.coopT0Humans = c.players.filter(x=>x.team===0 && x.ctrl!=='bot').length;
  o.coopT1Bots   = c.players.filter(x=>x.team===1 && x.ctrl==='bot').length;
  o.coopPadIdx   = c.players.filter(x=>x.ctrl==='gamepad').map(x=>x.padIndex);

  // VERSUS: interleaved (you, opponent, teammate)
  M.sel.coop='off'; M.startMatch();
  const v=M.world;
  o.versusShape = shape(v);
  o.versusT1Humans = v.players.filter(x=>x.team===1 && x.ctrl!=='bot').length;

  // ⚠️ 2v2 CO-OP WITH 3 PADS IS A 3v3 NOW. The match GROWS to fit the controllers in
  // the room (see startMatch) rather than turning the third person away — a mode's
  // size is the size you asked for, and a room bigger than it is a room. It used to
  // seat two on your side and push the third onto the OPPOSITION, which in co-op is
  // the one place they did not ask to be.
  M.sel.mode='2v2'; M.sel.coop='on'; M.startMatch();
  const c2=M.world;
  o.coop2v2T0Humans = c2.players.filter(x=>x.team===0 && x.ctrl!=='bot').length;
  o.coop2v2Overflow = c2.players.filter(x=>x.team===1 && x.ctrl!=='bot').length;
  o.coop2v2Per = c2.players.filter(x=>x.team===0).length;

  // info label
  M.sel.mode='3v3'; M.updatePadInfo();
  o.coopInfo = document.getElementById('coopInfo').textContent;
  o.rowVisible = !document.getElementById('coopRow').classList.contains('hidden');

  // (half-line behaviour is covered by test_kickoff; it is kickoff-only now)
  M.sel.controllers='off'; M.sel.coop='off'; M.sel.mode='1v1';
  return o;
});
console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.coopT0Humans===3 && r.coopT1Bots===3 && r.versusT1Humans>=1 &&
  r.coop2v2T0Humans===3 && r.coop2v2Overflow===0 && r.coop2v2Per===3 && errors.length===0;
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
