// YOUR OWN PITCH AND SURROUND COLOURS.
//
// A palette was all-or-nothing: you could pick Grass or Rockpool, but there was no way to
// say "make the court THIS green". The Theme card already had "Background — page and pitch
// colours" and "Field — what's painted on the pitch", so the missing thing was never a tab,
// it was the colour itself.
//
// ⚠️ **THE LANDMINE THIS FEATURE SITS ON.** `applyTheme` did `TH = t.pitch` — a direct
// REFERENCE into the shipped `THEMES` table — so writing an override into `TH` would edit
// the palette itself for the rest of the session: switch away and back and your colour
// would still be baked into Grass, with nothing to point at. `paintedPitch` returns a copy,
// and the check for it reads `THEMES.grass.pitch.court` AFTER an override is applied rather
// than trusting the code to have copied.
//
// ⚠️ **THE READABILITY FLOOR IS MEASURED, NOT PICKED.** A court close to the marking colour
// makes the markings vanish, so `line` is swapped for an ink the court can carry — but only
// below 2.5:1, because the lowest any SHIPPED palette scores is 2.62 (GameMan's white on
// sky blue). No shipped court can be repainted by that line; it only ever fires on a choice.
// That is the "a floor, not a repaint" rule `ballSpotInk` already follows, and the check
// below walks every palette rather than spot-checking one.
//
// ⚠️ **IT IS NOT A SLOT, and that is load-bearing.** `SLOT_KEYS` drives the Theme card's
// chips, `bundleSlots` AND `currentBundle` — so a seventh slot would make a bundle's
// identity depend on your colour, and picking one would silently rename your theme to
// "Custom". Pinned from both ends here.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport: { width: 900, height: 1100 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

// ============================================== it reaches the pixels ==
const px = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const cv = document.getElementById('game'), c = cv.getContext('2d');
  // ⚠️ Bodies parked off the pitch: they are drawn in the profile's own colours and would
  // be most of any difference measured near the middle of the court.
  const frame = () => {
    M.sel.mode = '1v1'; M.sel.controllers = 'off'; M.sel.lobby = 'off'; M.sel.field = 'classic';
    M.setMatchSeed(4); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    w.players.forEach(q => { q.x = 9e4; q.y = 9e4; });
    w.ball.x = 9e4; w.ball.y = 9e4;
    M.computeCam(); M.render();
    return c.getImageData(0, 0, cv.width, cv.height).data;
  };
  const at = (d, x, y) => { const k = (Math.round(y) * cv.width + Math.round(x)) * 4; return [d[k], d[k+1], d[k+2]]; };
  const diff = (a, b2, x, y) => { const p1 = at(a, x, y), p2 = at(b2, x, y);
    return Math.abs(p1[0]-p2[0]) + Math.abs(p1[1]-p2[1]) + Math.abs(p1[2]-p2[2]); };

  const set = (court, surround) => { M.sel.look.court = court; M.sel.look.surround = surround; M.applyTheme(M.sel.look.palette); };
  M.sel.look.palette = 'grass';
  set('', '');
  const plain = frame();
  const courtPt = [M.wx(60), M.wy(60)], outPt = [8, cv.height - 8];

  set('#7a2ea8', '');
  const withCourt = frame();
  o.courtMoved = diff(plain, withCourt, courtPt[0], courtPt[1]);
  o.surroundUntouchedByCourt = diff(plain, withCourt, outPt[0], outPt[1]);

  set('', '#221133');
  const withSur = frame();
  o.surroundMoved = diff(plain, withSur, outPt[0], outPt[1]);

  // ⚠️ THE PALETTE OBJECT ITSELF, read after an override has been applied.
  set('#7a2ea8', '#221133');
  o.paletteObj = M.THEMES.grass.pitch.court;
  o.thIsACopy = M.TH !== M.THEMES.grass.pitch;

  // Reset must CLEAR, not store the palette's current colour — stored, it would stop
  // following the palette and you could not tell why.
  set('', '');
  const back = frame();
  o.resetIsExact = diff(plain, back, courtPt[0], courtPt[1]) === 0
                && diff(plain, back, outPt[0], outPt[1]) === 0;
  o.stored = { c: M.sel.look.court, s: M.sel.look.surround };
  return o;
});

ok('a chosen pitch colour reaches the pixels', px.courtMoved > 60, `${px.courtMoved} channel difference at a point on the court`);
ok('...and does not repaint the surround', px.surroundUntouchedByCourt === 0, `${px.surroundUntouchedByCourt}`);
ok('a chosen surround colour reaches the pixels', px.surroundMoved > 20, `${px.surroundMoved}`);
ok('the shipped palette object is NOT mutated', px.paletteObj === '#1c3a26',
   `THEMES.grass.pitch.court is ${px.paletteObj} — applyTheme used to hand out a reference, so an override written into TH would edit Grass itself for the session`);
ok('...because TH is a copy', px.thIsACopy);
ok('reset goes back to the palette exactly', px.resetIsExact && !px.stored.c && !px.stored.s,
   JSON.stringify(px.stored) + ' — empty means "the palette\'s", so Reset clears rather than storing a colour that would stop following it');

// ================================================ the mow, and the floor ==
const rules = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  const set = (court) => { M.sel.look.court = court; M.applyTheme(M.sel.look.palette); };

  // ⚠️ Six shipped palettes set stripeA === stripeB on purpose — a metal deck and a
  // tactics board have no mown stripes. The derivation asks whether THIS palette is
  // striped, so both kinds survive; always adding (or always removing) a stripe is the
  // bug this pins.
  o.mow = {};
  for (const k of Object.keys(M.THEMES)){
    const flatBefore = M.THEMES[k].pitch.stripeA === M.THEMES[k].pitch.stripeB;
    M.sel.look.palette = k; set('#7a2ea8');
    o.mow[k] = { flatBefore, flatAfter: M.TH.stripeA === M.TH.stripeB };
  }
  o.mowKept = Object.values(o.mow).every(x => x.flatBefore === x.flatAfter);
  o.someFlat = Object.values(o.mow).some(x => x.flatBefore);
  o.someStriped = Object.values(o.mow).some(x => !x.flatBefore);

  // ⚠️ A FLOOR, NOT A REPAINT — and the obvious way to check this is VACUOUS, which a
  // sabotage proved. Setting no colour makes `paintedPitch` early-return before the floor
  // line is ever reached, so "no palette is repainted with nothing chosen" passes on a
  // build whose threshold repaints EVERYTHING. The court is set to the palette's OWN
  // colour instead — a no-op choice that still runs the whole path — so any palette whose
  // markings change under its own court is a floor that has become a repaint.
  o.repainted = [];
  for (const k of Object.keys(M.THEMES)){
    M.sel.look.palette = k; set(M.THEMES[k].pitch.court);
    if (M.TH.line !== M.THEMES[k].pitch.line) o.repainted.push(k);
  }
  // ...and the worst shipped court-vs-line ratio, which is what the 2.5 floor sits under.
  o.worstShipped = Math.min(...Object.keys(M.THEMES).map(k => {
    const P = M.THEMES[k].pitch;
    return M.contrastRatio(M.flatten(P.line, P.court), P.court);
  }));

  // ...but a court that swallows the markings DOES get a readable ink.
  M.sel.look.palette = 'grass'; set('#ffffff');
  o.whiteCourtLine = M.TH.line;
  o.whiteCourtReadable = M.contrastRatio(M.flatten(M.TH.line, '#ffffff'), '#ffffff') > 4;
  set('');
  return o;
});

ok('the mow survives a chosen colour', rules.mowKept,
   JSON.stringify(Object.entries(rules.mow).filter(([, v]) => v.flatBefore !== v.flatAfter)));
ok('...on both kinds of palette', rules.someFlat && rules.someStriped,
   'if every palette were striped this check could not tell "preserved" from "always striped"');
ok('no shipped palette is repainted', rules.repainted.length === 0,
   JSON.stringify(rules.repainted) + ' — the floor must only ever fire on a colour you chose');
ok('...and the floor sits under the worst shipped court', rules.worstShipped > 2.5,
   `worst shipped is ${rules.worstShipped.toFixed(2)}:1 against a 2.5 floor — measured, not picked`);
ok('a court that swallows the markings gets a readable ink', rules.whiteCourtReadable,
   `line became ${rules.whiteCourtLine} on a white court`);

// ============================== it is a colour, not a seventh slot ==
const slots = await p.evaluate(() => {
  const M = window.__magnet, o = {};
  M.sel.look.palette = 'grass';
  M.applyBundle('grass');
  o.before = M.currentBundle();
  M.sel.look.court = '#8a2be2'; M.applyTheme('grass');
  o.afterColour = M.currentBundle();
  o.slotKeys = M.SLOT_KEYS ? M.SLOT_KEYS.slice() : Object.keys(M.SLOTS);
  o.hasColourSlot = o.slotKeys.includes('court') || o.slotKeys.includes('surround');
  // ...and a junk stored value is ignored rather than painted.
  M.sel.look.court = 'not-a-colour'; M.applyTheme('grass');
  o.junkIgnored = M.TH.court === M.THEMES.grass.pitch.court;
  M.sel.look.court = ''; M.applyTheme('grass');
  return o;
});

ok('picking a colour does NOT rename your theme to Custom', slots.before === 'grass' && slots.afterColour === 'grass',
   `${slots.before} -> ${slots.afterColour} — SLOT_KEYS drives currentBundle, so a colour slot would make the bundle's identity depend on it`);
ok('...and there is no colour slot in the Theme tabs', !slots.hasColourSlot, JSON.stringify(slots.slotKeys));
ok('a junk stored colour is ignored', slots.junkIgnored,
   'an imported save validates nothing and a shared settings sheet is one typo from anything');

// ============================================= render only, and reachable ==
const rest = await p.evaluate(async () => {
  const M = window.__magnet, o = {};
  // ⚠️ Hash the WORLD with and without a colour: this must not be able to touch physics.
  const run = (court) => {
    M.sel.look.court = court; M.applyTheme(M.sel.look.palette);
    M.sel.mode = '2v2'; M.sel.controllers = 'off'; M.sel.lobby = 'off'; M.sel.field = 'classic';
    M.setMatchSeed(1234); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 1;
    let h = 0;
    for (let i = 0; i < 900; i++){
      M.step(w);
      h = (h * 31 + Math.round(w.ball.x * 1e3)) | 0;
      h = (h * 31 + Math.round(w.ball.y * 1e3)) | 0;
      for (const q of w.players) h = (h * 31 + Math.round(q.x * 1e3)) | 0;
    }
    return h;
  };
  o.plain = run('');
  o.coloured = run('#8a2be2');
  o.identical = o.plain === o.coloured;
  M.sel.look.court = ''; M.applyTheme(M.sel.look.palette);

  // The control itself: present, 44px, and actually hit-testable.
  // WARNING: a match started earlier in this suite, and a match now collapses the side
  // dock (matchCollapse) — the panel slides off the left of the window, so a rect read
  // before it has slid back reports the control 300px off screen and elementFromPoint
  // answers nothing. openLook drops the match's own collapse; the wait is for the slide.
  M.openLook('theme'); M.showSubTab('theme', 'palette');
  await new Promise(z => setTimeout(z, 400));
  const ins = [...document.querySelectorAll('.colcell input[type=color]')];
  o.count = ins.length;
  o.sizes = ins.map(i => { const r = i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  // ⚠️ Scrolled into view FIRST, and that is legitimate here in a way it is not in
  // `chipreach`. That suite forbids scrolling because the thing it measures is a chip row
  // that scrolls SIDEWAYS under a mouse that has no sideways gesture — scrolling for it
  // hides a control nobody can reach. This is ordinary vertical page scroll: the colour
  // rows sit under twenty-three palette tiles, so at a 1100px viewport they are simply
  // below the fold (measured at y = 1793), and `elementFromPoint` returns null off-screen
  // whether the control is covered or not. Without the scroll this reported "unpressable"
  // for a control that is perfectly fine.
  o.hits = ins.map(i => {
    i.scrollIntoView({ block: 'center' });
    const r = i.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el && (el === i || i.contains(el) || el.contains(i));
  });
  const rb = document.getElementById('colReset');
  o.resetDisabledWhenClean = !!(rb && rb.disabled);
  return o;
});

ok('a chosen colour cannot touch the world', rest.identical,
   `${rest.plain} vs ${rest.coloured} over 900 steps — this is render only`);
ok('there are two colour controls', rest.count === 2, `${rest.count}`);
ok('...both clearing 44px', rest.sizes.every(s => s[0] >= 44 && s[1] >= 44), JSON.stringify(rest.sizes));
ok('...and both pressable', rest.hits.every(Boolean), JSON.stringify(rest.hits));
ok('Reset is dead until there is something to reset', rest.resetDisabledWhenClean,
   'buildCourtColours runs before the pane is in the document, so a getElementById here silently does nothing');

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ px, rules: { mowKept: rules.mowKept, repainted: rules.repainted, worstShipped: +rules.worstShipped.toFixed(2), whiteCourtLine: rules.whiteCourtLine }, slots, rest }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL courtcolour\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS courtcolour');
