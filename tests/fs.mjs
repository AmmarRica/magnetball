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
// F must NOT toggle any more — F11 is the browser's, and swallowing a bare letter
// fought every text field on the page.
await p.keyboard.press('f');
await p.waitForTimeout(400);
const afterF = await p.evaluate(()=>!!document.fullscreenElement);
// The button toggles back out
await p.locator('#fsBtn').click();
await p.waitForTimeout(500);
const afterSecondClick = await p.evaluate(()=>({fs:!!document.fullscreenElement, label:document.getElementById('fsBtn').textContent}));
// ...and typing "f" into the seat-names box types an f rather than doing anything else
const typed = await (async ()=>{
  await p.evaluate(()=>{ const t=document.getElementById('seatNames'); t.value=''; t.focus(); });
  await p.keyboard.type('fox');
  return p.evaluate(()=>document.getElementById('seatNames').value);
})();

console.log('before:', before, '| after click:', JSON.stringify(afterClick),
            '| still fs after F:', afterF, '| after 2nd click:', JSON.stringify(afterSecondClick),
            '| typed:', JSON.stringify(typed));
console.log('ERRORS:', errors.length?errors.slice(0,4):'none');
const entered  = afterClick.fs===true && afterClick.label.includes('Exit');
const fInert   = afterF === true;                    // F changed nothing
const exited   = afterSecondClick.fs===false && afterSecondClick.label.includes('Enter');
const typesOk  = typed === 'fox';
console.log('enterWorks:', entered, '| F is inert:', fInert, '| exitWorks:', exited, '| typing ok:', typesOk);
const ok = entered && fInert && exited && typesOk && errors.length===0;
console.log('RESULT:', ok?'PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
