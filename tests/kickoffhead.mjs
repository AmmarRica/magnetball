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
  // ⚠️ Collapsed, the chevron is rotated -90°, so getBoundingClientRect returns the
  // AXIS-ALIGNED bounds of a turned box — its "height" is really its width. Widening
  // the button then reads as a height change and fails a check about height. Use the
  // untransformed layout box for size; the rect is only right for POSITION.
  const rb = btn.getBoundingClientRect(), rc = chev.getBoundingClientRect();
  o.buttonVisibleWhenCollapsed = rb.width > 100 && rb.height > 30;
  o.chevronOnTheRight = rc.left >= rb.right - 2 && chev.offsetWidth > 20;
  o.chevSize = [chev.offsetWidth, chev.offsetHeight, btn.offsetHeight];
  o.chevronSameHeight = Math.abs(chev.offsetHeight - btn.offsetHeight) < 6;
  // ...and it is big enough to hit and to read — it is the only way to open the card.
  o.chevronIsATapTarget = chev.offsetWidth >= 44 && chev.offsetHeight >= 44 &&
                          parseFloat(getComputedStyle(chev).fontSize) >= 18;
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
  // Two things pin above the section headers: the KICK OFF bar at the very top and the
  // jump-to chip row under it. The offset has to clear BOTH, or a section header lands on
  // top of one of them.
  // ⚠️ THE ORDER IS KICK OFF → CHIPS → HEADERS, and it used to be the other way round —
  // which put the one button everything else is in service of underneath a row of nav chips,
  // reported as "the kick off button is still under other tabs".
  const jump = document.getElementById('jumpBar');
  o.jumpH = jump ? jump.getBoundingClientRect().height : 0;
  // ⚠️ The bar carries the scroll container's top padding itself (it is pulled up by the same
  // amount so nothing can scroll through a band above it), so the space it OCCUPIES when
  // pinned is its box minus that padding. Comparing against the raw box is off by 26px.
  const kpad = parseFloat(getComputedStyle(head).paddingTop) || 0;
  o.headH = head.getBoundingClientRect().height - kpad;
  o.stickyMatchesHeader = Math.abs(off - (o.headH + o.jumpH)) < 3;
  // ...measured on the REAL pinned rectangles rather than the computed `top` values, because
  // what was reported is what you SEE: three bars, nested, in that order, with no gaps.
  const su2 = document.getElementById('setup');
  su2.scrollTop = 1400;
  const feelHdr = document.querySelector('#setup .card.collapsible[data-sec="feel"] > h2');
  const kb = head.getBoundingClientRect(), jb = jump.getBoundingClientRect(),
        hb = feelHdr.getBoundingClientRect();
  o.pinned = { kick:[Math.round(kb.top), Math.round(kb.bottom)],
               jump:[Math.round(jb.top), Math.round(jb.bottom)], hdr: Math.round(hb.top) };
  o.jumpAboveHeader = kb.bottom <= jb.top + 1 && jb.bottom <= hb.top + 1;
  // ⚠️ And NOTHING may scroll through a band above the KICK OFF bar: sticky is measured from
  // the container's PADDING box, so `top:0` alone left 26px of tiles and chips sliding past
  // above it — which reads as exactly the same bug.
  o.nothingAboveKick = kb.top <= 1;
  su2.scrollTop = 0;
  o.headerIsTheStickyOne = getComputedStyle(head).position === 'sticky' &&
                           getComputedStyle(btn).position !== 'sticky';
  return o;
});

console.log(JSON.stringify(r,null,1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const must = ['cardIsCollapsible','buttonIsTheHeader','chevronIsInHeader','optionsAreTheBody',
  'noDuplicateIds','startsCollapsed','buttonVisibleWhenCollapsed','chevronOnTheRight',
  'chevronSameHeight','chevronIsATapTarget','optionsHiddenWhenCollapsed','chevronExpands','optionsShowWhenOpen',
  'buttonStillVisibleWhenOpen','ariaTracksState','canPickAModeWhileOpen','chevronCollapses',
  'ariaTracksClosed','buttonStartsMatch','buttonDoesNotExpand','buttonDoesNotCollapse',
  'matchAloneWhenOpen','otherSectionClosesMatch','stickyMatchesHeader','jumpAboveHeader',
  'nothingAboveKick',
  'headerIsTheStickyOne'];
const bad = must.filter(k => r[k] !== true);
const ok = bad.length === 0 && errors.length === 0;
if (bad.length) console.log('FAILED:', bad);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
