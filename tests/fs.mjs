import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(500);
// open the Display card so the settings button is visible
await p.evaluate(()=>{ const M=window.__magnet;
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.display='auto'; M.applyDisplayMode(); M.buildSettings();
  document.querySelectorAll('.card.collapsible').forEach(c=>c.classList.remove('collapsed'));
});
await p.waitForTimeout(200);
const before = await p.evaluate(()=>!!document.fullscreenElement);
// real user click on the settings fullscreen button
await p.locator('#fsBtn').click();
await p.waitForTimeout(500);
const afterClick = await p.evaluate(()=>({fs:!!document.fullscreenElement, label:document.getElementById('fsBtn').textContent}));
// F key toggles back
await p.keyboard.press('f');
await p.waitForTimeout(500);
const afterKey = await p.evaluate(()=>({fs:!!document.fullscreenElement, label:document.getElementById('fsBtn').textContent}));
console.log('before:', before, '| after click:', JSON.stringify(afterClick), '| after F:', JSON.stringify(afterKey));
console.log('ERRORS:', errors.length?errors.slice(0,4):'none');
const entered = afterClick.fs===true && afterClick.label.includes('Exit');
const exited  = afterKey.fs===false && afterKey.label.includes('Enter');
console.log('enterWorks:', entered, '| exitWorks:', exited);
console.log('RESULT:', (entered&&exited&&errors.length===0)?'PASS':'FAIL');
await b.close(); process.exit((entered&&exited&&errors.length===0)?0:1);
