// The Match section's header IS the KICK OFF button: collapsed it's just the green
// bar, and the chevron beside it opens the match options. Pressing the button must
// start a match, never expand the section — and vice versa.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:560,height:1000} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const card = document.getElementById('matchCard');
  const btn  = document.getElementById('playBtn');
  const chev = document.getElementById('matchChev');
  const body = document.getElementById('matchBody');
  const collapsed = () => card.classList.contains('collapsed');

  // --- The button and the chevron live in the section's header, and the options
  // are the section's body.
  o.cardIsCollapsible = card.classList.contains('collapsible') && card.dataset.sec === 'match';
  o.buttonIsTheHeader = btn.closest('h2') === card.querySelector('h2');
  o.chevronIsInHeader = chev.closest('h2') === card.querySelector('h2');
  o.optionsAreTheBody = body.contains(document.getElementById('modes')) &&
                        body.contains(document.getElementById('diffs')) &&
                        body.contains(document.getElementById('fields'));
  // ...and there is only ONE of each (a duplicate id would break $()).
  o.noDuplicateIds = ['matchCard','playBtn','matchChev','matchBody','modes']
    .every(id => document.querySelectorAll('#'+id).length === 1);

  // --- Collapsed: the green bar is visible, the options are not.
  M.collapseAllSections(); await wait(60);
  o.startsCollapsed = collapsed();
  const rb = btn.getBoundingClientRect(), rc = chev.getBoundingClientRect();
  o.buttonVisibleWhenCollapsed = rb.width > 100 && rb.height > 30;
  o.chevronOnTheRight = rc.left >= rb.right - 2 && rc.width > 20;
  o.chevronSameHeight = Math.abs(rc.height - rb.height) < 6;
  o.optionsHiddenWhenCollapsed = body.getBoundingClientRect().height === 0;

  // --- The chevron expands it, and shows the mode picker.
  chev.click(); await wait(80);
  o.chevronExpands = !collapsed();
  o.optionsShowWhenOpen = body.getBoundingClientRect().height > 100 &&
                          document.getElementById('modes').getBoundingClientRect().height > 20;
  o.buttonStillVisibleWhenOpen = btn.getBoundingClientRect().height > 30;
  o.ariaTracksState = chev.getAttribute('aria-expanded') === 'true';
  // ...and you can actually pick a mode from it.
  const before = M.sel.mode;
  const other = [...document.querySelectorAll('#modes .opt')]
    .find(t => !t.classList.contains('sel'));
  other.click(); await wait(60);
  o.canPickAModeWhileOpen = M.sel.mode !== before;

  // --- Clicking the chevron again closes it.
  chev.click(); await wait(80);
  o.chevronCollapses = collapsed();
  o.ariaTracksClosed = chev.getAttribute('aria-expanded') === 'false';

  // --- Pressing KICK OFF starts a match and does NOT toggle the section.
  M.collapseAllSections(); await wait(60);
  let started = 0; const realStart = M.startMatch;
  btn.click(); await wait(80);
  o.buttonStartsMatch = !!(M.running && M.world);
  o.buttonDoesNotExpand = collapsed();
  // ...and with the section OPEN, the button still doesn't collapse it.
  M.toMenu(); await wait(80);
  M.openSection('match'); await wait(60);
  btn.click(); await wait(80);
  o.buttonDoesNotCollapse = !document.getElementById('matchCard').classList.contains('collapsed');
  M.toMenu(); await wait(80);

  // --- It obeys the accordion: opening Match closes everything else, and opening
  // another section closes Match.
  M.openSection('match'); await wait(60);
  const openOnes = () => [...document.querySelectorAll('#setup .card.collapsible')]
    .filter(c=>!c.classList.contains('collapsed')).map(c=>c.dataset.sec);
  o.matchAloneWhenOpen = JSON.stringify(openOnes()) === '["match"]';
  M.openLook('theme'); await wait(80);
  o.otherSectionClosesMatch = JSON.stringify(openOnes()) === '["theme"]';

  // --- The other sections' sticky headers pin below the KICK OFF bar, and the
  // offset is measured from the HEADER (a sticky button nested in a sticky header
  // would pin below itself).
  M.collapseAllSections(); await wait(80);
  const head = card.querySelector('h2');
  const off = parseFloat(getComputedStyle(document.getElementById('setup'))
    .getPropertyValue('--sticky-top'));
  o.stickyTop = off;
  o.stickyMatchesHeader = Math.abs(off - head.getBoundingClientRect().height) < 3;
  o.headerIsTheStickyOne = getComputedStyle(head).position === 'sticky' &&
                           getComputedStyle(btn).position !== 'sticky';
  return o;
});

console.log(JSON.stringify(r,null,1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const must = ['cardIsCollapsible','buttonIsTheHeader','chevronIsInHeader','optionsAreTheBody',
  'noDuplicateIds','startsCollapsed','buttonVisibleWhenCollapsed','chevronOnTheRight',
  'chevronSameHeight','optionsHiddenWhenCollapsed','chevronExpands','optionsShowWhenOpen',
  'buttonStillVisibleWhenOpen','ariaTracksState','canPickAModeWhileOpen','chevronCollapses',
  'ariaTracksClosed','buttonStartsMatch','buttonDoesNotExpand','buttonDoesNotCollapse',
  'matchAloneWhenOpen','otherSectionClosesMatch','stickyMatchesHeader','headerIsTheStickyOne'];
const bad = must.filter(k => r[k] !== true);
const ok = bad.length === 0 && errors.length === 0;
if (bad.length) console.log('FAILED:', bad);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
