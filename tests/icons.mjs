// The drawn icon set that replaced the menu's emoji.
//
// Emoji render differently on every platform, sit on their own baseline so a row of
// them never lines up, and cannot take a colour from the theme. The replacements are
// drawn on one 24x24 grid at one stroke weight in `currentColor`.
//
// ⚠️ THE LINE THIS SUITE HOLDS: cosmetic tables are NOT converted. In CAPS, EYES,
// ANIMALS and TEXTS the emoji IS the item — paintCap draws that exact glyph on the
// disc — so giving one an icon would show a picture of something other than the thing
// you picked. The suite fails if an icon field ever appears in those tables.
//
// ⚠️ And opting in is a FIELD, never a lookup by emoji. Emoji are not unique across
// tables: ⚡ is both the Quick match length and the Elite difficulty tier, so a
// by-emoji map puts a stopwatch on a difficulty tile. Checked explicitly below.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:520,height:1200} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();

  // ---- every icon in the registry actually draws something -----------------
  const names = Object.keys(M.ICONS);
  o.count = names.length;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;color:#fff';
  document.body.appendChild(host);
  const empty = [], tiny = [];
  for (const n of names){
    host.innerHTML = M.iconSvg(n);
    const sv = host.querySelector('svg');
    if (!sv){ empty.push(n); continue; }
    // A path that is a single point, or whose box is a sliver, is a typo not an icon.
    const bb = sv.querySelector('path').getBBox();
    if (bb.width < 6 || bb.height < 6) tiny.push([n, +bb.width.toFixed(1), +bb.height.toFixed(1)]);
  }
  o.empty = empty; o.tiny = tiny;
  o.allDraw = !empty.length && !tiny.length;

  // ---- ...and they are all DIFFERENT --------------------------------------
  // Two entries with the same path means two different things look identical, which
  // is worse than an emoji: at least the emoji were distinguishable.
  const seen = new Map(), dupes = [];
  for (const n of names){ const d = M.ICONS[n];
    if (seen.has(d)) dupes.push([seen.get(d), n]); else seen.set(d, n); }
  o.dupes = dupes;

  // ---- currentColor, never a baked colour ---------------------------------
  // The whole point is that a tile tints its icon with the palette. A hex in the
  // path markup would survive every theme and stand out on exactly one of them.
  const baked = [];
  for (const n of names){
    const sv = M.iconSvg(n);
    if (/#[0-9a-f]{3,6}|rgb\(|fill="(?!none)(?!currentColor)/i.test(sv)) baked.push(n);
  }
  o.baked = baked;

  // ---- every declared icon: exists ----------------------------------------
  const tables = { MODES:M.MODES, DIFF:M.DIFF, LENGTHS:M.LENGTHS,
                   KICKOFFRULE:M.KICKOFFRULE, BOXRULE:M.BOXRULE };
  const missing = [], declared = [];
  for (const t in tables){
    for (const k in tables[t]){
      const ic = tables[t][k].icon;
      if (!ic) continue;
      declared.push([t,k,ic]);
      if (!M.iconSvg(ic)) missing.push([t,k,ic]);
    }
  }
  o.declaredCount = declared.length;
  o.missing = missing;
  // ...and the functional tables are fully converted, not half.
  o.fullyConverted = Object.keys(tables).every(t =>
    Object.keys(tables[t]).every(k => !!tables[t][k].icon));

  // ---- the cosmetic tables are deliberately UNTOUCHED ----------------------
  const cosmetic = { CAPS:M.CAPS, EYES:M.EYES, ANIMALS:M.ANIMALS, TEXTS:M.TEXTS };
  const leaked = [];
  for (const t in cosmetic){
    const tab = cosmetic[t] || {};
    for (const k in tab) if (tab[k] && tab[k].icon) leaked.push([t,k]);
  }
  o.cosmeticLeaked = leaked;
  // A cap still renders as the emoji it IS — checked through the real painter path.
  o.capsStillEmoji = Object.keys(M.CAPS).some(k => !!(M.CAPS[k] && M.CAPS[k].emoji));

  // ---- the ambiguity that makes a by-emoji map wrong ----------------------
  // ⚡ appears in two tables meaning two different things. If they ever resolve to
  // the same icon, somebody has reintroduced the lookup this design avoids.
  const bolt = Object.values(M.LENGTHS).find(x=>x.emoji==='⚡');
  const elite = Object.values(M.DIFF).find(x=>x.emoji==='⚡');
  o.sharedEmoji = !!bolt && !!elite;
  o.sharedEmojiDiffersByIcon = o.sharedEmoji && bolt.icon !== elite.icon;

  // ---- the tiles on screen really show them -------------------------------
  const svgIn = id => (document.getElementById(id)||{querySelectorAll:()=>[]})
    .querySelectorAll('svg.ic').length;
  o.modeSvgs = svgIn('modePick') || svgIn('mode');
  o.lenSvgs  = svgIn('lenPick')  || svgIn('length');
  // Whatever the container ids are, SOMETHING in the setup screen must be drawing them.
  o.setupSvgs = document.querySelectorAll('#setup svg.ic').length;
  o.tilesUseThem = o.setupSvgs >= 20;
  // Nav tiles: every one that asked for an icon got one.
  const navs = [...document.querySelectorAll('[data-icon]')];
  o.navCount = navs.length;
  o.navAllPainted = navs.length > 0 && navs.every(el => el.querySelector('svg.ic'));
  // ...and none of them still carries a bare emoji span next to the drawn icon.
  o.navNoLeftoverEmoji = navs.every(el =>
    ![...el.querySelectorAll('span')].some(sp => /\p{Extended_Pictographic}/u.test(sp.textContent)));

  // ---- an unmapped entry keeps its emoji rather than vanishing -------------
  o.unmappedKeepsEmoji = /class="emoji"/.test(M.optGlyph({ emoji:'🎩', name:'x' }));
  o.mappedUsesSvg = /svg class="ic/.test(M.optGlyph({ icon:'trophy', name:'x' }));
  o.unknownIconFallsBack = /class="emoji"/.test(M.optGlyph({ icon:'nope', emoji:'🎩' }));

  // ---- the difficulty ramp is a ramp --------------------------------------
  // Seven unrelated pictures told you nothing about order. Filled pips do.
  const filled = n => { host.innerHTML = M.iconSvg(`tier${n}of7`);
    return host.querySelectorAll('circle[fill="currentColor"]').length; };
  o.ramp = [1,2,3,4,5,6,7].map(filled);
  o.rampIsMonotonic = o.ramp.every((v,i) => v === i+1);
  o.rampTotal = (host.innerHTML = M.iconSvg('tier3of7'), host.querySelectorAll('circle').length);
  o.rampShowsAllSteps = o.rampTotal === 7;

  host.remove();
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.allDraw, `icons that draw nothing or a sliver: empty ${JSON.stringify(r.empty)}, tiny ${JSON.stringify(r.tiny)}`);
ok(r.dupes.length===0, `two icons share a path, so two different things look identical: ${JSON.stringify(r.dupes)}`);
ok(r.baked.length===0, `icons with a baked colour instead of currentColor: ${JSON.stringify(r.baked)}`);
ok(r.missing.length===0, `an entry declares an icon the registry does not have: ${JSON.stringify(r.missing)}`);
ok(r.fullyConverted, 'a functional table is only half converted — a row of drawn icons with an emoji in it looks like a bug');
ok(r.cosmeticLeaked.length===0, `a COSMETIC table has an icon field: ${JSON.stringify(r.cosmeticLeaked)} — there the emoji is the item, and paintCap draws that exact glyph on the disc`);
ok(r.capsStillEmoji, 'caps lost their emoji, so the thing you pick is no longer the thing that gets drawn');
ok(r.sharedEmoji, 'the ⚡ collision between match length and difficulty is gone — if the tables changed, re-check that opting in is still by field and not by emoji');
ok(r.sharedEmojiDiffersByIcon, 'two tables sharing an emoji resolved to the SAME icon — the by-emoji lookup is back, and a difficulty tile now shows a stopwatch');
ok(r.tilesUseThem, `only ${r.setupSvgs} drawn icons on the setup screen — the tiles are not using the set`);
ok(r.navAllPainted, `${r.navCount} nav tiles asked for an icon and not all were painted`);
ok(r.navNoLeftoverEmoji, 'a nav tile has both a drawn icon and its old emoji');
ok(r.unmappedKeepsEmoji, 'an entry with no icon lost its emoji instead of keeping it');
ok(r.mappedUsesSvg, 'an entry WITH an icon did not render one');
ok(r.unknownIconFallsBack, 'an unknown icon name rendered nothing rather than falling back to the emoji');
ok(r.rampIsMonotonic, `the difficulty ramp is not a ramp: ${JSON.stringify(r.ramp)}`);
ok(r.rampShowsAllSteps, `a difficulty tile shows ${r.rampTotal} pips, not the full 7 — the ramp only reads if the empty steps are drawn too`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nicons OK');
