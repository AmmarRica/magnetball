// Settings sections behave as an accordion: at most one open, ever.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  // ⚠️ Hidden cards are skipped. The VJ card still exists in the DOM (the /vj route is
  // the same document) and is `display:none` on this page, so clicking its header is not
  // something a player can do and counting it would make "one open" a lie. Measured once,
  // at the top: `display:none` is decided by CSS and cannot change under the clicks below,
  // and re-asking per call made `cards()` disagree with itself mid-loop.
  const HIDDEN = new Set([...document.querySelectorAll('#setup .card.collapsible')]
    .filter(c => getComputedStyle(c).display === 'none').map(c => c.dataset.sec));
  const cards = () => [...document.querySelectorAll('#setup .card.collapsible')]
                        .filter(c => !HIDDEN.has(c.dataset.sec));
  const openOnes = () => cards().filter(c=>!c.classList.contains('collapsed')).map(c=>c.dataset.sec);
  const head = sec => cards().find(c=>c.dataset.sec===sec).querySelector('h2');

  o.sections = cards().map(c=>c.dataset.sec);
  // Eleven cards folded into four: Match, Your Player, Options, Replays. The accordion
  // is what it always was; there is simply less of it.
  o.enoughSections = o.sections.length >= 4;

  // --- Clicking a header opens exactly that one
  // ⚠️ Start from nothing open. Match is the card that is open on a first run now (it was
  // `more`), so clicking its header first CLOSES it — which is correct behaviour and a
  // useless place to start a test about opening.
  M.collapseAllSections(); await wait(40);
  head('match').click(); await wait(60);
  o.afterMatch = openOnes();
  o.onlyMatchOpen = o.afterMatch.length === 1 && o.afterMatch[0] === 'match';

  // --- Opening another closes the first
  head('options').click(); await wait(60);
  o.afterFeel = openOnes();
  o.onlyFeelOpen = o.afterFeel.length === 1 && o.afterFeel[0] === 'options';

  // --- Every section in turn: never more than one open
  o.maxOpenSeen = 0;
  for (const sec of o.sections){
    head(sec).click(); await wait(20);
    const n = openOnes().length;
    if (n > o.maxOpenSeen) o.maxOpenSeen = n;
    if (n !== 1 || openOnes()[0] !== sec) o.wrongAt = sec;
  }
  o.neverTwoOpen = o.maxOpenSeen === 1 && !o.wrongAt;

  // --- Clicking the open one closes it (nothing left open is allowed)
  const last = o.sections[o.sections.length-1];
  head(last).click(); await wait(60);        // it is currently open
  o.closesOnSecondClick = openOnes().length === 0;

  // --- Deep-linking a section (the ⚙ tile, /#settings, "bring inline") obeys it too
  head('match').click(); await wait(40);
  // ⚠️ Theme is a section INSIDE Display inside Options now, so the card that opens is
  // `options` — and "deep link" has to mean more than that, or this passes on a build
  // that opens the card and leaves you on the Controls tab. The Theme controls have to be
  // ON SCREEN, which is the thing a deep link promises.
  M.openLook('theme'); await wait(120);
  o.deepLinked = openOnes();
  const themeNode = document.querySelector('#setup [data-sec="theme"]:not(.jumpchip)');
  o.themeOnScreen = !!themeNode && themeNode.getBoundingClientRect().height > 0;
  o.deepLinkIsAlone = o.deepLinked.length === 1 && o.deepLinked[0] === 'options' && o.themeOnScreen;

  // --- It persists, and a stale multi-open state from an older build is repaired
  o.persisted = JSON.parse(localStorage.getItem('magnetball.ui')||'{}');
  o.persistsOneOpen = Object.values(o.persisted).filter(v=>v===false).length === 1;
  localStorage.setItem('magnetball.ui', JSON.stringify(
    Object.fromEntries(o.sections.map(s2=>[s2,false]))));   // everything open — the old shape
  return o;
});

// Reload with that deliberately-broken state and confirm it collapses back to one.
await p.reload();
await p.waitForTimeout(700);
const after = await p.evaluate(()=>{
  const cards=[...document.querySelectorAll('#setup .card.collapsible')];
  return cards.filter(c=>!c.classList.contains('collapsed')).map(c=>c.dataset.sec);
});
r.repairedOnLoad = after.length <= 1;
r.repairedTo = after;

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.enoughSections && r.onlyMatchOpen && r.onlyFeelOpen && r.neverTwoOpen &&
  r.closesOnSecondClick && r.deepLinkIsAlone && r.persistsOneOpen && r.repairedOnLoad &&
  errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
