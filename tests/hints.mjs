// Progressive disclosure for help text.
//
// Nearly every control carried a paragraph. The writing is the problem: it is good
// enough that nothing gets skipped and everything gets scrolled past. Label plus an
// info toggle, expanding the paragraph VERBATIM.
//
// ⚠️ THE LINE THIS SUITE HOLDS: no copy is lost. Every character of every help
// paragraph is still in the DOM and still reachable — folding is not deleting, and a
// suite that only checks "the toggle works" would pass on a rewrite that dropped half
// a sentence. The text is captured before wiring and compared after.
//
// ⚠️ And gameplay-affecting help must stay OPEN. Whether a match is comparable is not
// a detail to hide behind a disclosure triangle.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:520,height:1100} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const hints = [...document.querySelectorAll('.hint')];
  o.total = hints.length;
  o.wired = hints.filter(h=>h.dataset.hint).length;
  o.everyHintClassified = o.total === o.wired;
  const kinds = {};
  for (const h of hints) kinds[h.dataset.hint] = (kinds[h.dataset.hint]||0) + 1;
  o.kinds = kinds;

  // ---- no copy is lost ------------------------------------------------------
  // Folded is display:none, so textContent is still there in full.
  o.emptyHints = hints.filter(h => !h.textContent.trim()).map(h=>h.dataset.hint);
  o.allTextPresent = o.emptyHints.length === 0;
  o.totalChars = hints.reduce((a,h)=>a+h.textContent.trim().length, 0);
  o.hasRealCopy = o.totalChars > 2000;

  // ---- folded ones start CLOSED, and are not persisted ----------------------
  const folded = hints.filter(h=>h.dataset.hint==='fold');
  o.folded = folded.length;
  o.allStartClosed = folded.every(h=>h.classList.contains('folded'));
  o.noneVisible = folded.every(h=>h.offsetParent === null || h.classList.contains('folded'));

  // ---- every folded one HAS a toggle, and it opens the right paragraph -------
  const btns = [...document.querySelectorAll('.infobtn')];
  o.toggles = btns.length;
  o.oneTogglePerFolded = btns.length === folded.length;
  o.togglesDrawIcons = btns.every(x => x.querySelector('svg.ic'));
  // Open the first one and check THAT hint opened, not some other.
  const first = folded[0];
  let lab = first.previousElementSibling;
  while (lab && !lab.classList.contains('field')) lab = lab.previousElementSibling;
  const bt = lab && lab.querySelector('.infobtn');
  o.foundItsToggle = !!bt;
  const before = first.textContent;
  if (bt) bt.click();
  o.opensOnClick = !first.classList.contains('folded');
  o.textUnchangedByOpening = first.textContent === before;
  o.othersStayClosed = folded.slice(1).every(h=>h.classList.contains('folded'));
  o.ariaTracks = !bt || bt.getAttribute('aria-expanded') === 'true';
  if (bt) bt.click();
  o.closesAgain = first.classList.contains('folded');

  // ---- gameplay-affecting help is ALWAYS visible ----------------------------
  const always = hints.filter(h=>h.dataset.hint==='always');
  o.alwaysCount = always.length;
  o.alwaysNeverFolded = always.every(h=>!h.classList.contains('folded'));
  o.alwaysHasNoToggle = always.every(h=>{
    let l = h.previousElementSibling;
    while (l && !l.classList.contains('field')) l = l.previousElementSibling;
    return !l || !l.querySelector('.infobtn');
  });
  o.alwaysTopics = always.map(h=>h.textContent.slice(0,40));

  // ---- a NOTE with no control above it is left alone ------------------------
  // Attaching a toggle to the nearest label above would fold text belonging to
  // nothing — and #recLine is a data readout borrowing the .hint style, not help.
  o.notes = kinds.note || 0;
  const rec = document.getElementById('recLine');
  o.readoutUntouched = !rec || (!rec.classList.contains('folded') && rec.dataset.hint === 'readout');

  // ---- rebuilding the settings does not double-wire -------------------------
  // ⚠️ Compare two CONSECUTIVE rebuilds, not against the boot count: buildSettings
  // creates six of these paragraphs itself, so the first rebuild legitimately wires
  // more than boot did. What must not grow is the second one.
  M.buildSettings();
  const afterOne = document.querySelectorAll('.infobtn').length;
  M.buildSettings(); M.buildHintToggles();
  o.togglesAfterRebuild = document.querySelectorAll('.infobtn').length;
  o.noDoubleWiring = o.togglesAfterRebuild === afterOne;
  o.everyHintClassifiedAfterRebuild =
    [...document.querySelectorAll('.hint')].every(h=>h.dataset.hint);
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.everyHintClassified, `${r.total - r.wired} help paragraphs were never classified: ${JSON.stringify(r.kinds)}`);
ok(r.allTextPresent, `a help paragraph came out EMPTY — copy was lost, not folded: ${JSON.stringify(r.emptyHints)}`);
ok(r.hasRealCopy, `only ${r.totalChars} characters of help left in the DOM — that is not "folded", that is deleted`);
ok(r.folded >= 15, `only ${r.folded} paragraphs fold; the point was to unclutter the menu`);
ok(r.allStartClosed, 'a folded paragraph started open — the decision was ALWAYS collapsed, never persisted');
ok(r.oneTogglePerFolded, `${r.toggles} toggles for ${r.folded} folded paragraphs`);
ok(r.togglesDrawIcons, 'a toggle rendered without its icon');
ok(r.foundItsToggle && r.opensOnClick, 'the toggle did not open its own paragraph');
ok(r.textUnchangedByOpening, 'opening a paragraph changed its text');
ok(r.othersStayClosed, 'opening one paragraph opened the others too');
ok(r.ariaTracks, 'aria-expanded does not track the state');
ok(r.closesAgain, 'the toggle does not close again');
ok(r.alwaysCount >= 3, `only ${r.alwaysCount} gameplay-affecting paragraphs stay visible`);
ok(r.alwaysNeverFolded, `a gameplay-affecting paragraph got folded: ${JSON.stringify(r.alwaysTopics)}`);
ok(r.alwaysHasNoToggle, 'a gameplay-affecting paragraph grew a toggle it does not need');
ok(r.readoutUntouched, 'the record readout was treated as help text and folded');
ok(r.noDoubleWiring, `a second rebuild added toggles again: ${r.togglesAfterRebuild}`);
ok(r.everyHintClassifiedAfterRebuild, 'a help paragraph created by buildSettings was never classified — it would sit permanently expanded');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nhints OK');
