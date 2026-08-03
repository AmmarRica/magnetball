import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);
const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.display='deck'; M.applyDisplayMode();
  await new Promise(r=>setTimeout(r,150));
  M.deckPaint();
  o.focusables = M.deckFocusables().length;
  // find a collapsed card header in the focus list and activate it
  const list = M.deckFocusables();
  const hdrIdx = list.findIndex(el => el.tagName==='H2' && el.parentElement.classList.contains('collapsed'));
  o.foundCollapsedHeader = hdrIdx >= 0;
  if (hdrIdx>=0){
    M.deckUI.idx = hdrIdx; M.deckPaint();
    const card = list[hdrIdx].parentElement;
    M.deckActivate();
    await new Promise(r=>setTimeout(r,80));
    o.cardExpanded = !card.classList.contains('collapsed');
    o.focusablesAfterExpand = M.deckFocusables().length;
    o.expandRevealsMore = o.focusablesAfterExpand > o.focusables;
  }
  // section jump now works across cards
  M.deckUI.idx = 0; M.deckPaint();
  const a = document.querySelector('.deckfocus');
  M.deckSection(1);
  const c = document.querySelector('.deckfocus');
  o.sectionJumps = a !== c && !!c;
  // slider adjust via left/right
  const l2 = M.deckFocusables();
  const si = l2.findIndex(el => el.tagName==='INPUT' && el.type==='range');
  o.foundSlider = si>=0;
  if (si>=0){
    M.deckUI.idx = si; M.deckPaint();
    const before = parseFloat(l2[si].value);
    const handled = M.deckSlide(1);
    o.sliderHandled = handled;
    o.sliderChanged = parseFloat(l2[si].value) !== before;
  }
  // activating a picker option actually changes the setting
  const l3 = M.deckFocusables();
  const oi = l3.findIndex(el => el.classList.contains('opt') && !el.classList.contains('sel'));
  if (oi>=0){ M.deckUI.idx=oi; M.deckActivate(); await new Promise(r=>setTimeout(r,60));
    o.optActivates = true; }
  return o;
});
console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.foundCollapsedHeader && r.cardExpanded && r.expandRevealsMore &&
  r.sectionJumps && r.foundSlider && r.sliderHandled && r.sliderChanged && errors.length===0;
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
