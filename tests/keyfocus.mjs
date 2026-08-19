// Keyboard: Space AND X kick, neither steals a keystroke while you're typing, and
// clicking the pitch hands the arrow keys back to the game instead of leaving a
// focused slider eating them.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const start = () => p.evaluate(()=>{ const M=window.__magnet;
  const d=document.getElementById('dmCollect'); if(d) d.click();
  M.sel.display='auto'; M.sel.mode='1v1'; M.sel.controllers='off'; M.applyDisplayMode();
  M.buildSettings();
  document.querySelectorAll('.card.collapsible').forEach(c=>c.classList.remove('collapsed'));
  window.__magnet.showSubTab('match','players');   // seat names live behind the Players sub-tab
  M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
  M.pads.p1.dx=0; M.pads.p1.dy=0; M.pads.p1.kick=false; });

const o = {};
await start();

// --- Both keys kick
const kicksWith = async (key) => {
  await p.keyboard.down(key);
  const on = await p.evaluate(()=>{ window.__magnet.drawControls(); return window.__magnet.pads.p1.kick===true; });
  await p.keyboard.up(key);
  const off = await p.evaluate(()=>window.__magnet.pads.p1.kick===false);
  return on && off;
};
o.spaceKicks = await kicksWith('Space');
o.xKicks     = await kicksWith('x');
o.capitalXKicks = await kicksWith('X');

// --- Neither steals a keystroke while typing
o.typingKeepsSpace = await (async ()=>{
  await p.evaluate(()=>{ const t=document.getElementById('seatNames'); t.value=''; t.focus(); });
  await p.keyboard.type('a x b');
  const v = await p.evaluate(()=>document.getElementById('seatNames').value);
  const kicked = await p.evaluate(()=>window.__magnet.pads.p1.kick===true);
  await p.evaluate(()=>{ const t=document.getElementById('seatNames'); t.value=''; t.oninput&&t.oninput(); t.blur(); });
  return v === 'a x b' && !kicked;
})();
// ...and arrow keys typed into a field don't drive the player either
o.typingDoesNotSteer = await (async ()=>{
  await p.evaluate(()=>{ const t=document.getElementById('seatNames'); t.focus();
    const M=window.__magnet; M.pads.p1.dx=0; M.pads.p1.dy=0; });
  await p.keyboard.down('ArrowUp');
  const drove = await p.evaluate(()=>{ window.__magnet.drawControls();
    return window.__magnet.pads.p1.dy !== 0; });
  await p.keyboard.up('ArrowUp');
  await p.evaluate(()=>document.getElementById('seatNames').blur());
  return !drove;
})();

// --- A focused slider must not keep the arrow keys once you click the pitch
await start();
o.sliderFocusReleased = await (async ()=>{
  // Focus a Game Feel slider and check it IS focused (or the rest is vacuous)
  await p.evaluate(()=>{
    const inp=document.querySelector(window.__magnet.feelSliderGroups().map(g=>'#'+window.__magnet.feelSliderWrapId(g)+' input').join(', '));
    inp.focus(); });
  const focusedBefore = await p.evaluate(()=>document.activeElement.tagName === 'INPUT');
  const valBefore = await p.evaluate(()=>+document.querySelector(window.__magnet.feelSliderGroups().map(g=>'#'+window.__magnet.feelSliderWrapId(g)+' input').join(', ')).value);
  // Click the pitch, then press arrows
  await p.evaluate(()=>{ const cv=document.getElementById('game');
    cv.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true})); });
  const focusedAfter = await p.evaluate(()=>document.activeElement.tagName === 'INPUT');
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowRight');
  const valAfter = await p.evaluate(()=>+document.querySelector(window.__magnet.feelSliderGroups().map(g=>'#'+window.__magnet.feelSliderWrapId(g)+' input').join(', ')).value);
  return focusedBefore && !focusedAfter && valAfter === valBefore;
})();
// ...and the arrows drive the player again after that click
o.arrowsDrivePlayer = await (async ()=>{
  await p.keyboard.down('ArrowUp');
  // ⚠️ Poll, don't assume. The keydown is delivered asynchronously, so stepping
  // straight after pressing can read a pad that has not seen it yet — this failed
  // about one run in nine under load, and an extra round trip inserted while
  // debugging made it pass every time, which is the signature of a timing flake
  // rather than a broken feature. pollKeys() runs from drawControls(), so wait for
  // the pad itself to show the key before measuring anything.
  const armed = await p.waitForFunction(()=>{
    window.__magnet.drawControls();
    return window.__magnet.pads.p1.dy < -0.5;
  }, null, { timeout: 3000 }).then(()=>true).catch(()=>false);
  o.arrowsReachedPad = armed;
  const moved = await p.evaluate(()=>{
    const M=window.__magnet, w=M.world, me=w.players.find(q=>q.ctrl==='human1');
    // ⚠️ Pin the state instead of inheriting whatever the sections above left behind.
    // This measured ~1 run in 8 as "the arrows don't drive the player" because the
    // world could be mid-kickoff, where the half-line gate holds the player still —
    // a true statement about the kickoff rule, and nothing at all about the arrows.
    M.sel.kickoffRule = 'off';
    w.state = 'play'; w.stateT = 2;
    w.ball.x = 400; w.ball.y = 400; w.ball.vx = 0; w.ball.vy = 0;   // out of the way
    me.x = 0; me.y = 60; me.vx = 0; me.vy = 0;
    for(let i=0;i<25;i++){ M.drawControls(); M.step(w); }
    return Math.hypot(me.vx,me.vy) > 0.3; });
  await p.keyboard.up('ArrowUp');
  return armed && moved;
})();

// --- Game Feel is split into ball vs player groups, and nothing went missing
// ⚠️ The split is now expressed as TABS rather than as `.subhead` text. This used to assert
// that subheads reading "ball controls" and "player controls" existed; the card was broken
// into five panes and the chip row became the heading, so the subheads went. The claim being
// made has not changed — the sliders are still grouped ball vs player — so it is checked
// where the grouping now lives, which is a stronger reading of the same thing: a chip you can
// press against a pane that holds the right sliders.
// ⚠️ **EVERY GROUP, derived from `FEEL_SLIDERS` — not the two this used to name.** It read
// `#feelSlidersBall` and `#feelSlidersPlayer` and checked word lists against them, so when
// Game Feel split into Ball / Kick / Player / Sprint it was silently measuring half the
// card: "kick power" and "trap window" had moved to a wrapper it never queried. The claim
// it was reaching for is stronger and cannot go stale — every slider the game declares
// lands in the pane its own `g` names, that pane is reachable by a chip, and none is lost.
o.groups = await p.evaluate(()=>{
  const M=window.__magnet; M.buildSettings();
  const chips = [...document.querySelectorAll('.subtabs[data-tabs="feel"] .subchip')].map(c=>c.dataset.pane);
  const byGroup = {}, paneOfGroup = {};
  for (const g of M.feelSliderGroups()){
    const wrap = document.getElementById(M.feelSliderWrapId(g));
    byGroup[g] = wrap ? [...wrap.querySelectorAll('label')].map(l=>l.textContent.toLowerCase()) : null;
    const pn = wrap && wrap.closest('.subpane');
    paneOfGroup[g] = pn ? pn.dataset.pane : null;
  }
  return { byGroup, paneOfGroup, chips, declared: M.FEEL_SLIDERS.length,
           want: M.FEEL_SLIDERS.map(s => [s.g, s.label.toLowerCase()]) };
});
// Each declared slider is present in ITS OWN group's wrapper. ⚠️ This catches the BUILDER
// dropping a group — `buildFeelSliders` falls back to Ball for an unknown one, so a group
// with no pane silently piles into the wrong tab — but it is deliberately NOT a check on
// the grouping being *right*: it compares the table against itself, so re-tagging a slider
// moves both sides at once and it still passes. Verified: filing 'Sprint speed' under
// `g:'ball'` sails through this.
o.everySliderInItsOwnPane = o.groups.want.every(([g, lab]) =>
  (o.groups.byGroup[g] || []).some(t => t.includes(lab)));
// ⚠️ **SO THE INTENDED GROUPING IS WRITTEN DOWN, and it has to be.** Which pane a slider
// belongs in is a human judgement — "kick power is a kick setting, not a ball setting" —
// and no amount of deriving can check a judgement against itself. These are the words, and
// each must appear in its own pane and in NO other, which is what catches a slider quietly
// moving. Ball is what the ball does; Kick is what you do to it.
o.want = { ball:   ['max ball speed','ball glide','ball magnet'],
           kick:   ['kick power','trap window','kick ring'],
           player: ['acceleration','float','sensitivity'],
           sprint: ['sprint length','sprint recovery','sprint speed','tired speed'] };
o.groupedAsIntended = Object.entries(o.want).every(([g, words]) => words.every(w =>
  (o.groups.byGroup[g] || []).some(t => t.includes(w)) &&
  Object.entries(o.groups.byGroup).every(([g2, labs]) =>
    g2 === g || !(labs || []).some(t => t.includes(w)))));
// ⚠️ Counted from `FEEL_SLIDERS` itself, not hard-coded. It was `=== 8` and went red
// the moment a ninth slider arrived, which is a suite failing for the arrival of a
// setting rather than for anything being lost.
o.sliderCount = o.groups.declared;
o.noneLost = Object.values(o.groups.byGroup)
  .reduce((n, a) => n + (a ? a.length : 0), 0) === o.sliderCount;
// Each set of sliders is in its own pane, and each pane has a chip to reach it by — a pane
// with no chip hides its controls while querySelectorAll still finds them.
o.hasSubheads = Object.entries(o.groups.paneOfGroup)
  .every(([g, pane]) => pane === g && o.groups.chips.includes(g));

console.log(JSON.stringify(o,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = o.spaceKicks && o.xKicks && o.capitalXKicks && o.typingKeepsSpace &&
  o.typingDoesNotSteer && o.sliderFocusReleased && o.arrowsDrivePlayer &&
  o.everySliderInItsOwnPane && o.groupedAsIntended && o.noneLost && o.hasSubheads &&
  errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(o).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
