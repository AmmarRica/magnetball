// Player names typed in settings, applied to seats in order.
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
  const names = () => M.world.players.map(q=>q.name);

  // --- The field exists, writes the setting and persists
  const ta = document.getElementById('seatNames');
  o.fieldExists = !!ta;
  ta.value = 'Ammar\nBoots\nRival\nOther';
  ta.oninput();
  o.writesSetting = M.sel.names.split('\n').length === 4;
  o.persists = JSON.parse(localStorage.getItem('magnetball.sel')||'{}').names === ta.value;

  // --- Applied in seat order: your side first, then the opposition
  M.sel.mode='2v2'; M.sel.spectate='play'; M.sel.controllers='off'; M.startMatch(); await wait(120);
  o.seatNames = names();
  o.appliedInOrder = JSON.stringify(o.seatNames) === JSON.stringify(['Ammar','Boots','Rival','Other']);
  o.yourSeatFirst = M.world.players[0].ctrl === 'human1' && M.world.players[0].name === 'Ammar';
  o.teamsSplit = M.world.players[1].team === M.world.players[0].team &&
                 M.world.players[2].team !== M.world.players[0].team;

  // --- Blank lines keep the DEFAULT for that seat, so you can rename just one.
  // Capture the real defaults with the field empty first — comparing against the
  // previously-typed names would be comparing to the wrong thing entirely.
  ta.value = ''; ta.oninput();
  M.startMatch(); await wait(80);
  const defaults = names();
  ta.value = '\n\nOnlyThisOne'; ta.oninput();
  M.startMatch(); await wait(80);
  const after = names();
  o.defaults = defaults; o.after = after;
  o.blankKeepsDefault = after[0] === defaults[0] && after[1] === defaults[1];
  o.thirdSeatRenamed = after[2] === 'OnlyThisOne';

  // --- More names than seats is harmless; fewer leaves the rest alone
  ta.value = Array.from({length:20},(_,i)=>'N'+i).join('\n'); ta.oninput();
  M.sel.mode='1v1'; M.startMatch(); await wait(80);
  o.overflowSafe = M.world.players.length === 2 && M.world.players[0].name === 'N0';

  // --- Long names are trimmed rather than blowing out the name plate
  ta.value = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; ta.oninput();
  M.startMatch(); await wait(80);
  o.longNameLen = M.world.players[0].name.length;
  o.longNameTrimmed = o.longNameLen <= 12;

  // --- Bigger sides get covered too
  ta.value = Array.from({length:8},(_,i)=>'P'+i).join('\n'); ta.oninput();
  M.sel.mode='4v4'; M.startMatch(); await wait(120);
  o.bigSideNames = names().join(',');
  o.coversEightSeats = names().every((n,i)=>n === 'P'+i);

  // --- Clear puts every default back
  document.getElementById('namesClear').click(); await wait(60);
  o.clearEmpties = M.sel.names === '' && ta.value === '';
  M.startMatch(); await wait(120);
  o.defaultsReturn = !names().some(n=>/^P\d/.test(n));

  // --- The idle demo stays generic — your names don't leak onto the menu match
  ta.value = 'DemoLeak\nDemoLeak2'; ta.oninput();
  M.startDemo(); await wait(120);
  o.demoStaysGeneric = !M.world.players.some(q=>/DemoLeak/.test(q.name));
  // ...but a real match still uses them
  M.sel.mode='1v1'; M.startMatch(); await wait(80);
  o.realMatchUsesThem = M.world.players[0].name === 'DemoLeak';

  // --- The seat counter tracks the mode
  M.sel.mode='3v3'; M.buildSettings();
  ta.oninput();
  o.counterText = document.getElementById('namesInfo').textContent;
  o.counterMentionsSeats = /\/\s*6/.test(o.counterText);

  document.getElementById('namesClear').click();
  M.sel.mode='1v1'; M.saveSel();
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.fieldExists && r.writesSetting && r.persists && r.appliedInOrder && r.yourSeatFirst &&
  r.teamsSplit && r.blankKeepsDefault && r.thirdSeatRenamed && r.overflowSafe && r.longNameTrimmed &&
  r.coversEightSeats && r.clearEmpties && r.defaultsReturn && r.demoStaysGeneric &&
  r.realMatchUsesThem && r.counterMentionsSeats && errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
