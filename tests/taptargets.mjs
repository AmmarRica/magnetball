// TAP TARGETS, AND THE REST OF THE UX BATCH.
//
// ⚠️ THE MEASUREMENT TRAP FIRST, because it cost real time: **a modal over the page makes
// every tap target measure 1px.** `elementFromPoint` returns whatever is on top, so with
// the Daily Reward card up, probing the reach of a button underneath it reads the modal
// and reports a 1px hit area on a perfectly good 44px control. Every probe below dismisses
// anything covering the page first, and the daily-modal check is deliberately the first
// thing in the file so a failure there explains the rest.
//
// ⚠️ AND THE REACH IS PROBED, NOT READ OFF CSS. `getBoundingClientRect()` measures the
// element's own box, which for `.infobtn` is deliberately still 20px — the extra reach is
// an absolutely positioned `::after` pad, because padding the button itself would space
// every label out by 24px and relayout eleven cards. A suite that read the box would call
// the fix a failure; one that reads the CSS would pass on a build where the pad is covered
// by a sibling. So each control is hit-tested outward from its own centre.
//
// Also held: the Sound card's panes come from `SFX_CATS`; KICK OFF is above the fold in
// landscape; `motionOK()` is off by default under a reduced-motion preference and the
// toggle still turns it back on; and the menu ships no dead controls.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const mk = async (opts) => {
  const p = await b.newPage(opts);
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(900);
  return p;
};

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

// ============================================================ the daily modal ==
// ⚠️ FIRST, because it is both a fix in its own right and the thing that breaks every
// measurement below it. On fresh storage the very first thing anybody saw was a retention
// modal — "Day 1 · 1-day streak" — over a menu they had not looked at, for a game they had
// not played.
const p = await mk(phone);
const daily = await p.evaluate(() => {
  const M = window.__magnet;
  const el = document.getElementById('dailyModal');
  return {
    played: M.stats.played,
    upOnFreshStorage: !el.classList.contains('hidden'),
    wanted: M.dailyModalWanted(),
    // ⚠️ The reward is still GRANTED at the usual moment — only the modal waits — so
    // nobody loses a day by kicking off before it would have appeared.
    claimed: M.login.claimed,
    // ...and it is gated on HAVING PLAYED, not on being a repeat visitor: a second visit
    // by somebody who bounced off the first one is the same wasted modal.
    src: M.dailyModalWanted.toString(),
  };
});

// ================================================================ tap targets ==
const taps = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  // Nothing covering the page — see the header.
  const dm = document.getElementById('dailyModal'); if (dm) dm.classList.add('hidden');
  M.openLook('feel');

  // Probe outward from the centre until the hit test stops landing on the control. This
  // measures the REACH a thumb actually has, which for .infobtn is a pseudo-element pad
  // rather than the element's own box.
  const reach = el => {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hits = t => t === el || el.contains(t) || (t && t.parentElement === el);
    if (!hits(document.elementFromPoint(cx, cy))) return { v: 0, blockedBy: (document.elementFromPoint(cx, cy) || {}).className || '?' };
    let u = 0, d = 0, l = 0, rr = 0;
    for (let i = 1; i < 60; i++){ if (hits(document.elementFromPoint(cx, cy - i))) u = i; else break; }
    for (let i = 1; i < 60; i++){ if (hits(document.elementFromPoint(cx, cy + i))) d = i; else break; }
    for (let i = 1; i < 60; i++){ if (hits(document.elementFromPoint(cx - i, cy))) l = i; else break; }
    for (let i = 1; i < 60; i++){ if (hits(document.elementFromPoint(cx + i, cy))) rr = i; else break; }
    return { v: u + d + 1, h: l + rr + 1, box: Math.round(r.height) };
  };
  const vis = sel => [...document.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().height > 0);
  // ⚠️ **FIND a pane with a help toggle in it, never assume the card opens on one.** This
  // read `vis('.infobtn')[0]` straight after `openLook('feel')`, which works only while the
  // FIRST Game Feel pane happens to carry a `.hint` — and it stopped doing so when Ball
  // became three physics sliders and the trap/charge help moved to the Kick pane. The
  // suite then threw on `undefined.scrollIntoView`, which is a crash rather than a finding
  // about tap targets. The button's pad is a global rule, so any pane holding one will do.
  for (const [pane] of M.SUBTABS.feel){
    if (vis('.infobtn').length) break;
    M.showSubTab('feel', pane);
  }

  o.infobtn  = reach(vis('.infobtn')[0]);
  o.infoN    = document.querySelectorAll('.infobtn').length;
  o.subchip  = reach(vis('.subchip')[0]);
  o.jumpchip = reach(vis('.jumpchip')[0]);

  // ⚠️ The pad must not break the control it is padding.
  const before = document.querySelectorAll('.hint.folded').length;
  vis('.infobtn')[0].click();
  o.infoStillToggles = document.querySelectorAll('.hint.folded').length !== before;

  // The HUD pair sit next to a live ball, where a near-miss is a tap on the pitch.
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.startMatch();
  o.pause = reach(document.getElementById('pauseBtn'));
  o.fs    = reach(document.getElementById('fsHudBtn'));
  M.toMenu();

  // ⚠️ The range SLIDERS were checked and deliberately left alone: the element box
  // measures small but the browser gives the thumb its own hit area. Recorded so nobody
  // re-opens it as a bug — this is a measurement, not an assertion of a fix.
  M.openLook('feel');
  const sl = vis('.slider')[0];
  o.sliderBox = sl ? Math.round(sl.getBoundingClientRect().height) : null;
  o.sliderReach = sl ? reach(sl).v : null;
  return o;
});

// ================================================================ sound tabs ==
const sound = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.openLook('sound');
  const card = document.querySelector('.card[data-sec="sound"]');
  o.chips = [...card.querySelectorAll('.subchip')].length;
  o.panes = [...card.querySelectorAll('.subpane')].map(e => e.dataset.pane);
  // ⚠️ Built FROM `SFX_CATS`, never a second list: a seventh category must arrive with its
  // chip, or its pane is hidden while the menu search and `audit` still find the controls.
  o.cats = M.SFX_CATS.map(c => c[0]);
  o.panesMatchCats = JSON.stringify(o.panes) === JSON.stringify(o.cats);
  o.chipPerPane = o.chips === o.cats.length;
  o.screenfuls = +(card.getBoundingClientRect().height / window.innerHeight).toFixed(2);
  // Master / Volume / Set stay OUTSIDE the tabs: all three act on the whole card, and a
  // set fills in every pane at once.
  o.masterOutside = !document.getElementById('sndMaster').closest('.subpane');
  o.setOutside    = !document.getElementById('sfxSetPick').closest('.subpane');
  // Switching works, and only one pane shows.
  M.showSubTab('sound', 'net');
  const on = [...card.querySelectorAll('.subpane')].filter(e => e.classList.contains('on'));
  o.onePaneShown = on.length === 1 && on[0].dataset.pane === 'net';
  o.netHasTiles = card.querySelectorAll('.subpane[data-pane="net"] .opt').length > 0;
  return o;
});

// ============================================================= dead controls ==
const dead = await p.evaluate(() => {
  const M = window.__magnet;
  const idx = M.menuSearchIndex ? M.menuSearchIndex() : [];
  return {
    roomCode: !!document.getElementById('roomCode'),
    shopSupport: !!document.getElementById('shopSupport'),
    settingsTile: !!document.getElementById('settingsBtn'),
    // ⚠️ Out of the SEARCH INDEX too, not just off the screen. CSS is only half a fix:
    // a control that is hidden but indexed still shows up in search and jumps you to it.
    indexedDead: idx.filter(r => /coming soon|room code/i.test((r.label || '') + ' ' + (r.hint || ''))).length,
    // ...and the Online card still ANSWERS the question rather than vanishing.
    onlineCard: !!document.querySelector('.card[data-sec="online"]'),
    onlineSaysSomething: (document.querySelector('.card[data-sec="online"]') || {}).textContent || '',
  };
});
await p.close();

// ============================================================ landscape phone ==
const land = await mk({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const ls = await land.evaluate(() => {
  const dm = document.getElementById('dailyModal'); if (dm) dm.classList.add('hidden');
  const h2 = document.querySelector('#matchCard > h2');
  const r = h2.getBoundingClientRect();
  // Pressable where it is drawn, not merely on screen.
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight,
           aboveFold: r.top >= 0 && r.bottom <= window.innerHeight,
           pressable: !!hit && (hit === h2 || h2.contains(hit)) };
});
await land.close();

// ============================================================== reduced motion ==
// ⚠️ BOTH HALVES. `motionOK()` is deliberately NOT `sel.juice && !prefersReducedMotion()`
// — that would make the toggle useless on exactly the devices whose owners might want it
// back. The preference decides the DEFAULT, once, on a first run; the toggle still wins.
const rm = await mk({ ...phone, reducedMotion: 'reduce' });
const reduce = await rm.evaluate(() => {
  const M = window.__magnet, o = {};
  o.prefers = M.prefersReducedMotion();
  o.juiceDefaultedOff = M.sel.juice === false;
  o.motionOff = M.motionOK() === false;
  // Nothing that moves for effect runs.
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  M.addShake(9); o.shakeStaysZero = !(M.shake > 0);
  o.autoReplaySuppressed = M.autoReplayReady(w) === false;
  // ...and the toggle turns it all back on, which is the half that matters.
  M.sel.juice = true;
  o.toggleWins = M.motionOK() === true;
  M.addShake(9); o.shakeBack = M.shake > 0;
  return o;
});
await rm.close();

// A normal device is untouched by any of it.
const norm = await mk(phone);
const normal = await norm.evaluate(() => ({
  prefers: window.__magnet.prefersReducedMotion(),
  juice: window.__magnet.sel.juice,
  motionOK: window.__magnet.motionOK(),
}));
await norm.close();

// -------------------------------------------------------------------- report --
ok('the daily modal is NOT up on a first ever load', !daily.upOnFreshStorage && daily.played === 0,
   `${JSON.stringify({ up: daily.upOnFreshStorage, played: daily.played })} — a streak counter means nothing to somebody with nothing to keep, and it is the one screen between them and the ball`);
ok('...but the reward is still granted', daily.claimed > 0,
   `claimed ${daily.claimed} — only the modal waits, so nobody loses a day by kicking off first`);
ok('...and it is gated on HAVING PLAYED', /played/.test(daily.src),
   'gating on "has visited before" makes a second visit by somebody who bounced the same wasted modal');

ok('.infobtn clears 44px of REACH', taps.infobtn.v >= 44,
   `${taps.infobtn.v}px vertical (box is ${taps.infobtn.box}px, ${taps.infoN} of them)${taps.infobtn.blockedBy ? ' — blocked by ' + taps.infobtn.blockedBy : ''} — the box stays 20px on purpose, because padding the button spaces every label out by 24px and relayouts eleven cards; the reach comes from an ::after pad`);
ok('...and still toggles its help text', taps.infoStillToggles,
   'a pad that swallows the click is a fix that breaks the control');
ok('.subchip clears 44px', taps.subchip.v >= 44, `${taps.subchip.v}px`);
ok('.jumpchip clears 44px', taps.jumpchip.v >= 44, `${taps.jumpchip.v}px`);
ok('the HUD pause and fullscreen clear 44px', taps.pause.v >= 44 && taps.fs.v >= 44,
   `pause ${taps.pause.v}, fullscreen ${taps.fs.v} — they sit next to a live ball, where a near-miss is a tap on the pitch`);
ok('the range sliders have a real thumb hit area', (taps.sliderReach || 0) >= 20,
   `box ${taps.sliderBox}px, reach ${taps.sliderReach}px — recorded rather than "fixed": the element box measures small but the browser gives the thumb its own area, so changing it would be a fix for a problem that is not there`);

ok('the Sound card has one pane per SFX category', sound.panesMatchCats && sound.chipPerPane,
   `${JSON.stringify(sound.panes)} against ${JSON.stringify(sound.cats)} — built from SFX_CATS, so a seventh category cannot arrive with a pane and no chip`);
ok('...and it fits a phone screen', sound.screenfuls < 1,
   `${sound.screenfuls} screenfuls — it was 1.85, and comparing two net sounds meant scrolling past 38 other tiles`);
ok('...with Master, Volume and Set outside the tabs', sound.masterOutside && sound.setOutside,
   'all three act on the whole card, and a set fills in every pane at once');
ok('...and one pane at a time', sound.onePaneShown && sound.netHasTiles, JSON.stringify(sound));

ok('the menu ships no dead controls', !dead.roomCode && !dead.shopSupport && !dead.settingsTile,
   JSON.stringify(dead));
ok('...and none in the search index', dead.indexedDead === 0,
   `${dead.indexedDead} rows — CSS is only half a fix: a hidden-but-indexed control still turns up in search and jumps you to it`);
ok('...and Online still answers the question', dead.onlineCard && /no online play/i.test(dead.onlineSaysSomething),
   '"is there online?" is a real question and deserves a real answer, which is why the card stays as a sentence');

ok('KICK OFF is above the fold in landscape', ls.aboveFold && ls.pressable,
   `${JSON.stringify(ls)} — it sat at y=393 on a 390px-tall viewport, three pixels below the fold, on the screen whose whole job is starting a match`);

ok('a reduced-motion device starts quiet', reduce.prefers && reduce.juiceDefaultedOff && reduce.motionOff,
   JSON.stringify(reduce));
ok('...with the effects really off', reduce.shakeStaysZero && reduce.autoReplaySuppressed,
   JSON.stringify(reduce));
ok('...AND THE TOGGLE STILL WINS', reduce.toggleWins && reduce.shakeBack,
   'motionOK() is deliberately not `juice && !reduced` — that makes the toggle useless on exactly the devices whose owners might want it back, so the preference decides the default and your answer is honoured after that');
ok('an ordinary device is untouched', !normal.prefers && normal.juice && normal.motionOK,
   JSON.stringify(normal));

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ daily: { ...daily, src: undefined }, taps, sound, dead, ls, reduce, normal }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL taptargets\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS taptargets');
