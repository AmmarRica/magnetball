// THE MAP MAKER — build your own field.
//
// ⚠️ The reason this suite matters more than its size suggests: **a custom field is just a
// `FIELDS` entry**, folded into the same table at boot. That one decision is what makes the
// feature small — the picker, `buildGeometry`, `drawPitch`, all fourteen animated themes,
// the goal boxes, drills, `mapVoteKey` and the self-contained replay files already work
// from `FIELDS` and a field key, so none of them needed teaching about a second kind of
// field. It also means a bug HERE reaches every one of them, which is what is being checked.
//
// What this holds:
//   1. a saved map really is a FIELDS entry, and nothing downstream asks whether it is
//      user-made;
//   2. ⚠️ THE PREVIEW COMES FROM `buildGeometry`, the match's own function, not from the
//      editor's own reading of the numbers. A hand-drawn preview is a second implementation
//      of the pitch, and the first time the two disagreed the editor would be lying about
//      the field it is making. Checked by MEASURING the drawn picture against the geometry
//      the engine builds — a corner style that changes the physics has to change the
//      picture, and by the same amount;
//   3. ⚠️ `mapClean` sanitises on the way IN, not on the way out: a saved file is read back
//      every launch and handed straight to `buildGeometry`, so one bad number from an older
//      build would be a broken pitch on every match from then on with nothing to point at;
//   4. ⚠️ a lively wall (`wallB` > 1, a pinball table — deliberately reachable) still
//      CONTAINS THE BALL, because `clampBallInside` is the backstop it always was;
//   5. ⚠️ a DELETE drops `sel.field` back to `classic`. `startMatch` reads
//      `FIELDS[sel.field]` and would hand `undefined` to `buildGeometry`, which is a blank
//      screen rather than an error anybody can read;
//   6. ⚠️ Play SAVES IN PLACE and keeps the key — `sel.field`, the map votes and every saved
//      replay refer to a field BY KEY, so re-keying an edit orphans every vote cast on it;
//   7. ⚠️ desktop only, and the row is HIDDEN rather than disabled — and re-answered on a
//      resize, because `isDesktop()` reads the window;
//   8. ⚠️ a name is typed by a person and lands in an option tile that `buildOpts` writes
//      with `innerHTML`.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const page = async (w, h, mobile) => {
  const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: !!mobile, hasTouch: !!mobile });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load/i.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(900);
  return p;
};

// ============================================================ desktop ==
const p = await page(1280, 900);
const o = await p.evaluate(() => {
  const M = window.__magnet, o = {};

  // ---------------------------------------------------------- 7 (offered) --
  o.possible = M.mapsPossible();
  M.openLook('match');
  // ⚠️ The Match card is TABBED, and the map maker lives on the Pitch pane — a hit test
  // run without switching to it measures a control inside a hidden pane, which is 0x0 and
  // reads as "unpressable" when it is simply not the tab you are on.
  M.showSubTab('match', 'pitch');
  const row = document.getElementById('mapMakerRow');
  o.rowShown = !!row && !row.classList.contains('hidden');
  // ...and it is a real button somebody can press, not just a node in the DOM.
  const btn = document.getElementById('mapMakerBtn');
  btn.scrollIntoView({ block: 'center' });
  const r = btn.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  o.btnPressable = hit === btn || btn.contains(hit);
  o.btnTall = Math.round(r.height);

  M.openMapMaker();
  o.screenUp = !document.getElementById('mapMaker').classList.contains('hidden');

  // ---------------------------------------------------------------- 3 --
  // ⚠️ Sanitised on the way IN. Every one of these is a value that would produce a field
  // the editor should not be able to make; none of them may survive.
  const dirty = M.mapClean({ name: 'Ba<b>d&', W: 99999, L: -5, goal: 99999, corner: 99999,
                             net: 99999, postR: 99999, wallB: 99, netB: -3, cut: true });
  o.clean = dirty;
  o.wClamped    = dirty.W === M.MAPMAKER.W.max;
  o.lClamped    = dirty.L === M.MAPMAKER.L.min;
  // The mouth is held inside the pitch with room for a post at each end — a mouth as wide
  // as the field leaves the two end walls at zero length, which is a court with no back.
  o.goalInside  = dirty.goal <= dirty.W - M.MAPMAKER.goalPad * 2 && dirty.goal > 0;
  // Corners under HALF the shorter side: at exactly half they meet and the straight
  // section between them vanishes.
  o.cornerUnderHalf = dirty.corner < Math.min(dirty.W, dirty.L) / 2;
  o.netClamped  = dirty.net === M.MAPMAKER.net.max;
  o.postClamped = dirty.postR === M.MAPMAKER.post.max;
  o.wallClamped = dirty.wallB === M.MAPMAKER.wallB.max;
  o.netBClamped = dirty.netB === M.MAPMAKER.netB.min;
  // ---------------------------------------------------------------- 8 --
  o.nameStripped = !/[<>&]/.test(dirty.name);
  // A field of rubbish still has to leave a NAME, not an empty tile.
  o.nameKept = M.mapClean({ name: '<<<>>>' }).name.length > 0;
  // ...and nothing it produces may break the engine.
  const stub = { field: dirty };
  M.buildGeometry(stub);
  o.dirtyBuilds = stub.walls.length > 0 && stub.posts.length === 4;

  // ---------------------------------------------------------------- 2 --
  // ⚠️ THE PREVIEW IS THE ENGINE'S GEOMETRY. Measured, not asserted: a rounded court and a
  // chamfered one differ in the PHYSICS (arcs vs walls), so they must differ in the picture
  // — and a square one must differ from both. A preview drawn from its own idea of the
  // numbers would very happily draw the same rectangle for all three.
  // ⚠️ Compared IN THE CORNER, pixel against pixel, not by overall coverage. A rounded
  // corner and a chamfered one remove almost exactly the same AREA — the first metric
  // tried here scored them 1 sample apart out of hundreds — so a coverage count says they
  // are the same picture when the physics says arcs against walls. The arc bows outside
  // the chamfer's straight line, so the difference is entirely local to that corner.
  const c = document.getElementById('mapPreview');
  const ctx = c.getContext('2d');
  const shot = m => { M.mapEdit = M.mapClean(m); M.drawMapPreview();
                      return ctx.getImageData(0, 0, c.width, c.height).data; };
  const corner = (a, b2) => {                    // differing pixels in the top-left quadrant
    let n = 0;
    for (let y = 0; y < c.height / 2; y++)
      for (let x = 0; x < c.width / 2; x++){
        const i = (y * c.width + x) * 4;
        if (Math.abs(a[i] - b2[i]) + Math.abs(a[i+1] - b2[i+1]) + Math.abs(a[i+2] - b2[i+2]) > 40) n++;
      }
    return n;
  };
  const base = { name: 'P', W: 440, L: 760, goal: 150, net: 64 };
  const sq  = shot({ ...base, corner: 0 });
  const rnd = shot({ ...base, corner: 180, cut: false });
  const cut = shot({ ...base, corner: 180, cut: true });
  let lit = 0;
  for (let i = 0; i < sq.length; i += 4 * 37) if (sq[i] + sq[i+1] + sq[i+2] > 90) lit++;
  o.previewDrew = lit > 20;
  o.squareVsRound  = corner(sq, rnd);
  o.roundVsChamfer = corner(rnd, cut);
  // ⚠️ And a control: the SAME field drawn twice must be identical, or the two numbers
  // above are measuring noise in the painter rather than the shape.
  o.sameTwice = corner(shot({ ...base, corner: 180, cut: false }),
                       shot({ ...base, corner: 180, cut: false }));
  // ...and the geometry the engine builds really does differ the same way, which is what
  // makes the pixel difference above mean "the preview followed it".
  const geo = m => { const s = { field: M.mapClean(m) }; M.buildGeometry(s);
                     return { arcs: s.arcs.length, walls: s.walls.length }; };
  o.geoSquare  = geo({ ...base, corner: 0 });
  o.geoRound   = geo({ ...base, corner: 180, cut: false });
  o.geoChamfer = geo({ ...base, corner: 180, cut: true });
  o.roundMakesArcs   = o.geoRound.arcs === 4 && o.geoSquare.arcs === 0;
  o.chamferMakesWalls = o.geoChamfer.arcs === 0 && o.geoChamfer.walls > o.geoSquare.walls;

  // ---- THE PITCH PICKER IS GROUPED BY SHAPE -------------------------------
  // ⚠️ **`fieldShape` IS CHECKED AGAINST THE GEOMETRY, never against `corner`/`cut`.**
  // Comparing the classifier to the table it reads is comparing the table with itself and
  // would pass on a build with the branch inverted. `buildGeometry` is the independent
  // witness, and it is the reason a shape TAB is honest: square is a plain rectangle, round
  // emits four ARCS (`collideArc`), chamfered emits four extra WALLS (`collideWall`).
  o.shapeMatchesGeometry = ['square','round','other'].every(sh => {
    const f = sh === 'square' ? { ...base, corner:0 }
            : sh === 'round'  ? { ...base, corner:180, cut:false }
                              : { ...base, corner:180, cut:true };
    if (M.fieldShape(M.mapClean(f)) !== sh) return false;
    const g = geo(f);
    return sh === 'square' ? g.arcs === 0
         : sh === 'round'  ? g.arcs === 4
                           : (g.arcs === 0 && g.walls > o.geoSquare.walls);
  });
  // ⚠️ Every field lands in exactly ONE group and the groups union to FIELDS — what stops a
  // new field silently falling out of the picker, the argument `placedFlags()` makes for the
  // continents table. `!!f.cut` matters: a shipped field OMITS `cut`, `mapClean` emits it.
  const shapeKeys = M.FIELD_SHAPES.map(([k]) => k);
  const bucket = {}; for (const k of shapeKeys) bucket[k] = 0;
  let unclassified = 0;
  for (const k in M.FIELDS){
    const sh = M.fieldShape(M.FIELDS[k]);
    if (bucket[sh] === undefined) unclassified++; else bucket[sh]++;
  }
  o.shapeBuckets = bucket;
  o.everyFieldHasAGroup = unclassified === 0 &&
    Object.values(bucket).reduce((a,b)=>a+b,0) === Object.keys(M.FIELDS).length;
  o.everyGroupHasSomeone = shapeKeys.every(k => bucket[k] > 0);

  // ---------------------------------------------------------------- 1, 6 --
  // Save a real one and check it lands in FIELDS and in the picker.
  M.mapEditKey = null;
  M.mapEdit = M.mapClean({ name: 'Testpitch', W: 500, L: 700, goal: 160, corner: 60,
                           net: 70, postR: 9, wallB: 1.15, netB: 0.0 });
  const key = M.mapStore(true);
  o.key = key;
  o.inFields = !!M.FIELDS[key];
  o.markedCustom = M.FIELDS[key] && M.FIELDS[key].custom === true;
  M.buildMatchOpts();
  o.inPicker = [...document.querySelectorAll('#fields .opt')].some(e => /Testpitch/.test(e.textContent));
  // ⚠️ ...and a saved map is filed under its own SHAPE. The test map is corner 60, uncut, so
  // it belongs with the rounded ones — which is the point of "no code anywhere asks whether
  // a field is user-made": it lands in a group for free.
  o.savedMapShape = M.fieldShape(M.FIELDS[key]);
  { const tile = [...document.querySelectorAll('#fields .opt')].find(e => /Testpitch/.test(e.textContent));
    o.savedMapTagged = !!tile && tile.dataset.shape === o.savedMapShape; }

  // ---- the tabs SHOW one group and HIDE the rest, without deleting anything ----
  // ⚠️ Measured as rendered HEIGHT, never as a class — and paired with the hidden tiles
  // still being IN `#fields`, because a build that deletes them passes any visibility check
  // while breaking `#fields .opt`, which is what `audit`, `grasstiles` and `inPicker` above
  // all mean by "the Field picker".
  // ⚠️ **`openLook`, not `openSection`.** The map maker was opened further up and
  // `openMapMaker` calls `hideScreens()`, so `#setup` is still hidden here — every tile AND
  // every chip measured 0 height and the whole block failed for a reason that had nothing to
  // do with the tabs. `openLook` puts the menu back and opens the card; the Pitch pane then
  // has to be selected too, because a `.subpane` is `display:none` until its chip is picked.
  M.openLook('match'); M.showSubTab('match', 'pitch');
  const shapeOf = el => el.dataset.shape;
  const shown = () => [...document.querySelectorAll('#fields .opt')].filter(e => e.getBoundingClientRect().height > 0);
  o.tabCounts = {}; o.tabShowsOnlyItsOwn = true; o.tabKeepsTheRest = true;
  for (const [k] of M.FIELD_SHAPES){
    M.setFieldShapeTab(k);
    const vis = shown();
    o.tabCounts[k] = vis.length;
    if (!vis.length || !vis.every(e => shapeOf(e) === k)) o.tabShowsOnlyItsOwn = false;
    if (document.querySelectorAll('#fields .opt').length !== Object.keys(M.FIELDS).length) o.tabKeepsTheRest = false;
  }
  o.tabsCoverEverything =
    Object.values(o.tabCounts).reduce((a,b)=>a+b,0) === Object.keys(M.FIELDS).length;
  // ⚠️ The chips are 44px targets like every other chip row in the menu.
  o.chipHeights = [...document.querySelectorAll('#fieldShapes .shapechip')].map(c => Math.round(c.getBoundingClientRect().height));
  o.chipsAreTargets = o.chipHeights.length === M.FIELD_SHAPES.length && o.chipHeights.every(h => h >= 44);
  // ⚠️ **THE SEARCH MUST LAND ON A VISIBLE TILE**, whichever group the field is in. Without
  // the hook in `menuSearchGo` this scrolls to a tile with zero height.
  { const row = M.menuSearchIndex().find(r => r.node && r.node.dataset && r.node.dataset.shape === 'other');
    o.searchTarget = row ? row.label : null;
    if (row){ M.setFieldShapeTab('square'); M.menuSearchGo(row);
              o.searchRevealsIt = row.node.getBoundingClientRect().height > 0; }
    else o.searchRevealsIt = false; }
  M.setFieldShapeTab(M.fieldShape(M.FIELDS[M.sel.field] || M.FIELDS.classic));
  // ⚠️ SAVES IN PLACE. An edit keeps its key, or every map vote cast on it is orphaned and
  // any saved replay naming that field can no longer find it.
  M.mapEdit.name = 'Renamed';
  const key2 = M.mapStore(false);
  o.keyStable = key2 === key;
  o.renamed = M.FIELDS[key].name === 'Renamed';
  o.onlyOne = Object.keys(M.maps).length === 1;

  // ---------------------------------------------------------------- 1 (downstream) --
  // The whole claim: nothing downstream knows this field is user-made.
  M.sel.field = key; M.sel.mode = '2v2'; M.sel.lobby = 'off';
  M.setMatchSeed(5); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  o.geomFromField = w.bounds.halfW === 250 && w.bounds.halfL === 350;
  // ⚠️ The custom wall/goal numbers reached the PHYSICS, on the same code path a shipped
  // court uses — `buildGeometry` reads them off the field with the built-in as fallback.
  o.wallLively = w.walls.find(x => !x.isNet).bCoef === 1.15;
  o.netDead    = w.walls.find(x =>  x.isNet).bCoef === 0;
  o.postR      = w.posts[0].r === 9;
  // ...and a built-in court is untouched by any of it.
  const s2 = { field: M.FIELDS.classic }; M.buildGeometry(s2);
  o.builtinDefaults = s2.walls.find(x => !x.isNet).bCoef === 0.9 && s2.posts[0].r === M.POST.r;

  // ---------------------------------------------------------------- 4 --
  // ⚠️ A PINBALL TABLE STILL CONTAINS THE BALL. `wallB` above 1 adds energy on every
  // bounce; `clampBallInside` is what stops that becoming a ball that leaves the pitch.
  let out = 0, fastest = 0;
  for (let i = 0; i < 3000; i++){
    M.step(w);
    fastest = Math.max(fastest, Math.hypot(w.ball.vx, w.ball.vy));
    if (Math.abs(w.ball.x) > w.bounds.halfW + 8 ||
        Math.abs(w.ball.y) > w.bounds.halfL + w.bounds.net + 8) out++;
  }
  o.contained = out === 0;
  o.finite = isFinite(w.ball.x) && isFinite(w.ball.y);
  o.fastest = Math.round(fastest * 10) / 10;
  // The drill path builds its goals from the same function, so a custom field must not
  // break it either.
  M.startDrill('targets');
  o.drillRan = !!M.world && M.world.drillMode === true;
  M.toMenu();

  // ---------------------------------------------------------------- 5 --
  // ⚠️ A DELETE has to leave FIELDS too, and `sel.field` cannot stay pointing at it.
  M.sel.field = key;
  delete M.maps[key];
  M.saveMaps();
  o.goneFromFields = !M.FIELDS[key];
  o.selFellBack = M.sel.field === 'classic';
  // ...and starting a match after a delete is a match, not a blank screen.
  M.sel.mode = '1v1'; M.startMatch();
  const w2 = M.world; w2.state = 'play'; w2.stateT = 2;
  for (let i = 0; i < 120; i++) M.step(w2);
  o.playsAfterDelete = isFinite(w2.ball.x) && w2.players.length === 2;
  M.toMenu();
  return o;
});

// ---------------------------------------------------- 7 (a phone, and a resize) --
const q = await page(390, 844, true);
const phone = await q.evaluate(() => {
  const M = window.__magnet;
  M.openLook('match');
  const row = document.getElementById('mapMakerRow');
  return { possible: M.mapsPossible(), hidden: row.classList.contains('hidden'),
           height: Math.round(row.getBoundingClientRect().height) };
});
// ⚠️ Re-answered on RESIZE, never decided once at boot: `isDesktop()` reads the window, so
// a rotation or a dragged window changes the answer, and a row that was right at boot is
// the wrong row for the rest of the session.
await q.setViewportSize({ width: 1280, height: 900 });
await q.waitForTimeout(400);
const grown = await q.evaluate(() => {
  const row = document.getElementById('mapMakerRow');
  return { possible: window.__magnet.mapsPossible(), hidden: row.classList.contains('hidden') };
});

await p.close(); await q.close();

// ------------------------------------------------------------------ report --
ok('the map maker is offered on a desktop', o.possible && o.rowShown, JSON.stringify({ possible: o.possible, row: o.rowShown }));
ok('...as a pressable control', o.btnPressable && o.btnTall >= 30, `${o.btnTall}px, hit-tested ${o.btnPressable}`);
ok('...and the screen opens', o.screenUp);

ok('a silly width is clamped', o.wClamped, JSON.stringify(o.clean));
ok('a negative length is clamped', o.lClamped, JSON.stringify(o.clean));
ok('the goal mouth is held inside the pitch', o.goalInside,
   `goal ${o.clean.goal} on a ${o.clean.W}-wide field — a mouth as wide as the court leaves the end walls at zero length`);
ok('the corners cannot eat the pitch', o.cornerUnderHalf,
   `corner ${o.clean.corner} against ${Math.min(o.clean.W, o.clean.L) / 2}`);
ok('net depth, post size and both bounce values are clamped',
   o.netClamped && o.postClamped && o.wallClamped && o.netBClamped, JSON.stringify(o.clean));
ok('...and a cleaned field still BUILDS', o.dirtyBuilds,
   'the clamps are the editor\'s rails, not the physics\' — nothing here may produce a field the engine cannot make');
ok('a typed name cannot carry markup', o.nameStripped && o.nameKept,
   `${JSON.stringify(o.clean.name)} — buildOpts writes option tiles with innerHTML`);

ok('the preview draws', o.previewDrew);
ok('the corner STYLE changes the geometry', o.roundMakesArcs && o.chamferMakesWalls,
   JSON.stringify({ sq: o.geoSquare, round: o.geoRound, cut: o.geoChamfer }));
ok('...and `fieldShape` agrees with that geometry', o.shapeMatchesGeometry,
   'the classifier is checked against buildGeometry, not against the corner/cut it reads — comparing the table with itself would pass on an inverted branch');
ok('every field lands in exactly one shape group', o.everyFieldHasAGroup && o.everyGroupHasSomeone,
   `${JSON.stringify(o.shapeBuckets)} of ${Object.keys(o.shapeBuckets).length} groups — a field with no group falls out of the Pitch picker entirely`);
ok('...and the PREVIEW follows it, in the corner', o.squareVsRound > 200 && o.roundVsChamfer > 200,
   `square↔round ${o.squareVsRound}, round↔chamfer ${o.roundVsChamfer} pixels differ in the corner quadrant — the preview is drawn from buildGeometry, so a change the physics makes has to show; a hand-drawn one would happily draw the same rectangle for all three`);
ok('...and the same field twice is the same picture', o.sameTwice === 0,
   `${o.sameTwice} pixels differ between two draws of one field — without this the two numbers above could be painter noise`);

ok('a saved map IS a FIELDS entry', o.inFields && o.markedCustom, `key ${o.key}`);
ok('...and appears in the Field picker', o.inPicker);
ok('...filed under its own shape', o.savedMapTagged, `${o.savedMapShape} — a custom field is just a FIELDS entry, so it groups for free`);
ok('a shape tab shows its own fields and no others', o.tabShowsOnlyItsOwn && o.tabsCoverEverything,
   `${JSON.stringify(o.tabCounts)} — measured as rendered height, not as a class`);
ok('...and the ones it hides are still in #fields', o.tabKeepsTheRest,
   'a build that DELETES them passes any visibility check while breaking `#fields .opt`, which audit, grasstiles and the picker check above all rely on');
ok('...the chips are 44px targets', o.chipsAreTargets, JSON.stringify(o.chipHeights));
ok('...and the menu search reveals a tile in a hidden group', o.searchRevealsIt,
   `${o.searchTarget} — without the hook in menuSearchGo the jump scrolls to a tile with zero height`);
ok('an edit SAVES IN PLACE', o.keyStable && o.renamed && o.onlyOne,
   'sel.field, the map votes and every saved replay refer to a field by key — re-keying an edit orphans every vote cast on it');
ok('a match on it gets that geometry', o.geomFromField);
ok('...with the custom boards, net and posts in the PHYSICS',
   o.wallLively && o.netDead && o.postR,
   JSON.stringify({ wall: o.wallLively, net: o.netDead, post: o.postR }));
ok('...and a built-in court is untouched', o.builtinDefaults,
   'buildGeometry reads these off the field with the shipped value as the fallback');

ok('a lively-walled court still CONTAINS the ball', o.contained && o.finite,
   `fastest ball ${o.fastest} — wallB above 1 adds energy every bounce, and clampBallInside is the backstop`);
ok('a drill runs on a custom field', o.drillRan);

ok('a delete removes it from FIELDS', o.goneFromFields);
ok('...and drops sel.field back to classic', o.selFellBack,
   'startMatch reads FIELDS[sel.field] and would hand undefined to buildGeometry — a blank screen, not an error anybody can read');
ok('...and the next match still plays', o.playsAfterDelete, JSON.stringify(o));

ok('a phone is not offered the map maker', phone.possible === false && phone.hidden,
   JSON.stringify(phone) + ' — nine sliders beside a live plan view is a two-column layout; on a phone it is nine full-width rows with the picture scrolled off the top');
ok('...and the row is HIDDEN, not a dead control', phone.height === 0, `${phone.height}px tall`);
ok('...and it comes back when the window grows', grown.possible && !grown.hidden,
   JSON.stringify(grown) + ' — isDesktop() reads the window, so this is re-answered on resize rather than decided at boot');

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(JSON.stringify({ o, phone, grown }, null, 1));
await b.close();
if (fails.length){ console.log('FAIL mapmaker\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS mapmaker');
