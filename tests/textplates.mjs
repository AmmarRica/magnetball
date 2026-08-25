// Players wear shirt NUMBERS by default, and the text faceplates (the top-down-football
// avatar tradition) are a real, pickable category that actually paints.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
// ⚠️ NOT A FRESH DEVICE. A brand-new player's first match is dressed one continent
// against another (`tests/continents.mjs`), so a cleared `localStorage` gets bots
// wearing country flags and country names — which is correct, and is not what this
// suite is about. Marking the first run as already spent puts the page in the state
// every returning player is in, which is the state whose shirt numbers are being
// measured here.
await p.addInitScript(()=>{ window.__MAGNETDEBUG=true; localStorage.clear();
  localStorage.setItem('magnetball.firstrun','1'); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();

  // ---- Default is a number, not a country
  o.defaultIsANumber = /^num\d$/.test(M.defaultProfile().flag);
  o.freshProfileIsANumber = /^num\d$/.test(M.profile.flag);

  // ---- ...and JUST a number: no eyes, no hat ------------------------------
  // ⚠️ The default used to be `cap:'star'`, and a cap is drawn CENTRED on the faceplate,
  // so at a disc's size the star simply covered the `１` underneath — measured at 231
  // changed pixels on a 52px disc. Rendered at 6x, the default player was a star.
  // ⚠️ **MEASURED AS PIXELS, not as the flag.** "`profile.cap === 'none'`" is true of a
  // build that draws the cap anyway, and what was reported is what is on the disc.
  // ⚠️ **AND as the flag as well, which is not belt-and-braces.** The eyes half is
  // INVISIBLE on a numbered disc — `paintFace` returns in its `TEXTS` branch, so the eyes
  // fallback is unreachable and `eyes:'googly'` measures 0 changed pixels. A pixel-only
  // check therefore cannot see the eyes default at all; the value has to be read too, and
  // it matters because the Eyes picker highlights whatever it says.
  const dp = M.defaultProfile();
  o.defaultNoHat = dp.cap === 'none';
  o.defaultNoEyes = dp.eyes === 'none';
  const DR = 26, DN = 96, DC = DN/2;
  const shot = (over) => { const cv=document.createElement('canvas'); cv.width=cv.height=DN;
    const c=cv.getContext('2d');
    M.drawDisc(c, DC, DC, DR, Object.assign({}, M.profile, over||{}));
    return c.getImageData(0,0,DN,DN).data; };
  const same = (a,b2) => { for (let i=0;i<a.length;i++) if (a[i]!==b2[i]) return false; return true; };
  const diffInk = (a,b2) => { let n=0; for (let i=0;i<a.length;i+=4){
    if (Math.abs(a[i]-b2[i])+Math.abs(a[i+1]-b2[i+1])+Math.abs(a[i+2]-b2[i+2]) > 60) n++; } return n; };
  const asShipped = shot();
  o.defaultDiscIsBare = same(asShipped, shot({ cap:'none', eyes:'none' }));
  // ⚠️ Paired with the NUMBER still being there, or "no hat" is satisfied by a disc with
  // nothing drawn on it at all — which is a different bug wearing the same green.
  o.defaultDiscHasItsNumber = diffInk(asShipped, shot({ flag:'none' })) > 40;

  // ---- A pitch reads like a team sheet: 1..N per side, you are 1, no clashes
  M.sel.mode='4v4'; M.startMatch();
  const w=M.world;
  const t0=w.players.filter(q=>q.team===0), t1=w.players.filter(q=>q.team===1);
  o.plates = w.players.map(q=>q.flag);
  o.allNumbers = w.players.every(q=>/^num\d$/.test(q.flag));
  o.noCountryballsByDefault = !w.players.some(q=>M.FLAG_KEYS.includes(q.flag) && q.flag!=='none');
  const nums = t => t.map(q=>+q.flag.slice(3));
  o.youAreNumberOne = nums(t0)[0] === 1 && w.players[0].ctrl !== 'bot';
  o.eachTeamUnique = new Set(nums(t0)).size === t0.length && new Set(nums(t1)).size === t1.length;
  o.teamsNumberFromOne = Math.min(...nums(t0)) === 1 && Math.min(...nums(t1)) === 1;
  // ⚠️ DERIVED from the number table, never a literal 10. `shirtNo` wraps at
  // `TEXT_SETS.num.chars.length`, and that length is what makes eleven-a-side possible:
  // with ten glyphs a side had more bodies than shirts and `numberTheSides`' search for a
  // free one spun for ever. A hard-coded `shirtNo(10) === 'num0'` pins the OLD table.
  o.numPlates = M.TEXT_SETS.num.chars.length;
  o.shirtNoWraps = M.shirtNo(o.numPlates) === 'num0' && M.shirtNo(3) === 'num3'
                   && M.shirtNo(o.numPlates + 3) === 'num3';
  // ...and there have to be at least as many plates as a full side has bodies.
  o.enoughPlates = o.numPlates >= M.LOBBY.maxPerSide;

  // ---- TWO PEOPLE MAY NOT KICK OFF IN THE SAME SHIRT ----------------------
  // ⚠️ `numberTheSides` used to count human HEADS to reserve the low numbers and never
  // looked at WHICH numbers those humans were wearing. Every human keeps the number they
  // were minted with and the warm-up lobby exists so people can change halves, so three
  // people who all walk onto one side arrive holding whatever `startMatch` dealt them.
  // Measured on a 3v3: team 1 kicked off as num1, num2, num1.
  {
    const w2 = (()=>{ M.sel.mode='3v3'; M.sel.lobby='off'; M.setMatchSeed(11); M.startMatch(); return M.world; })();
    const side = w2.players.filter(q=>q.team===0);
    // Force the collision the lobby can really produce: two people on one side, both
    // holding the number they were dealt.
    side[0].ctrl='human1'; side[0].flag='num1';
    side[1].ctrl='gamepad'; side[1].flag='num1';
    M.numberTheSides(w2);
    const f = side.map(q=>q.flag);
    o.collisionFlags = f;
    o.noTwoInTheSameShirt = new Set(f).size === f.length && f.every(x=>/^num\d$/.test(x));
    // ⚠️ **A LONE HUMAN'S NUMBER MUST NOT MOVE** — your shirt has to be the same in warm-up
    // and at kickoff, which is the thing that was asked for. Nothing may fire unless a
    // second person is genuinely holding the same number.
    M.sel.mode='3v3'; M.setMatchSeed(5); M.startMatch();
    const w3 = M.world, you = w3.players.find(q=>q.ctrl==='human1');
    const was = you.flag; M.numberTheSides(w3);
    o.loneNumberKept = was === you.flag && /^num\d$/.test(was);
    // ⚠️ ...and a person wearing a FLAG, ANIMAL or PHOTO is never renumbered. That is the
    // standing rule — a person's faceplate is their own — and it is why this cannot be
    // "renumber everybody from 1". The bots must route around them.
    you.flag = 'poland'; M.numberTheSides(w3);
    o.flagFaceplateKept = you.flag === 'poland';
    you.flag = 'photo'; M.numberTheSides(w3);
    o.photoFaceplateKept = you.flag === 'photo';
    const others = w3.players.filter(q=>q.team===you.team && q!==you).map(q=>q.flag);
    o.botsRouteRound = new Set(others).size === others.length && others.every(x=>/^num\d$/.test(x));
  }

  // ---- Every glyph from the list is present and unlocked
  o.textCount = M.TEXT_KEYS.length;
  const glyphs = M.TEXT_KEYS.map(k=>M.TEXTS[k].g);
  const WANT = ['⠀','_௵','௸௸','₧','⁇⁇','∴∵','〄','ⓞ','№','ツ','░░','⠀*',
                '０','１','２','３','４','５','６','７','８','９',
                '⓪','①','②','③','④','⑤','⑥','⑦','⑧','⑨',
                '੦','।','੨','૩','੫','ડ','੪','੧',
                '⣿','⡇','⢸','⣝','⣫','⣯','⢹','⣻'];
  o.missing = WANT.filter(g=>!glyphs.includes(g));
  o.everyGlyphFromTheList = o.missing.length === 0;
  o.noDuplicateGlyphs = new Set(glyphs).size === glyphs.length;
  o.allTextUnlocked = M.TEXT_KEYS.every(k=>M.isUnlocked('text',k));
  o.textKeysDontClash = !M.TEXT_KEYS.some(k=>M.FLAG_KEYS.includes(k) || Object.keys(M.ANIMALS).includes(k));
  o.textIsACategory = M.UNL_CATS.some(c=>c.cat==='text');
  o.countsIncludeText = M.unlockCounts().total >= M.TEXT_KEYS.length;

  // ---- The picker exists, has one tile per glyph, and every tile PAINTS
  M.toMenu(); await wait(60);
  M.buildTextPicker(); await wait(60);
  const tiles=[...document.querySelectorAll('#textPick .opt')];
  o.tileCount = tiles.length;
  o.oneTilePerGlyph = tiles.length === M.TEXT_KEYS.length;
  const ink = cv => { const c=cv.getContext('2d');
    const d=c.getImageData(0,0,cv.width,cv.height).data; let n=0;
    for(let i=3;i<d.length;i+=4) if(d[i]>0) n++; return n; };
  o.everyTilePaints = tiles.every(t=>{ const cv=t.querySelector('canvas'); return cv && ink(cv)>0; });

  // ---- The glyph actually shows ON the disc: a plate must differ from a bare face,
  // and two different glyphs must differ from each other. Sampled, not assumed.
  const draw = (flag) => { const cv=document.createElement('canvas'); cv.width=cv.height=64;
    M.drawDisc(cv.getContext('2d'), 32, 32, 26, { color:'#46d17a', flag, eyes:'googly' });
    const d=cv.getContext('2d').getImageData(0,0,64,64).data;
    let h=0; for(let i=0;i<d.length;i+=4) h=(h*31 + d[i] + d[i+1]*3 + d[i+2]*7)|0; return h; };
  const bare = draw('none'), one = draw('num1'), seven = draw('num7'), circ = draw('circ1');
  o.plateChangesTheDisc = one !== bare;
  o.differentDigitsDiffer = one !== seven;
  o.differentStylesDiffer = one !== circ;
  // The blank avatar is meant to look blank — same as a bare plate, and that's fine,
  // but it must not throw and must still be selectable.
  o.blankDraws = Number.isFinite(draw('blank'));

  // ---- Picking one equips it and it survives a reload
  const tile = tiles[M.TEXT_KEYS.indexOf('tsu')];
  tile.click(); await wait(80);
  o.pickEquips = M.profile.flag === 'tsu';
  o.pickPersists = (JSON.parse(localStorage.getItem('magnetball.profile')||'{}')).flag === 'tsu';
  // ...and it reaches the pitch, live, without a restart
  M.sel.mode='1v1'; M.startMatch();
  o.wornInMatch = M.world.players[0].flag === 'tsu';
  M.profile.flag = 'num1'; M.saveProfile();

  // ---- Two-character plates are scaled to fit rather than spilling off the disc
  const spill = (flag) => { const cv=document.createElement('canvas'); cv.width=cv.height=64;
    const c=cv.getContext('2d'); M.drawDisc(c, 32, 32, 26, { color:'#46d17a', flag });
    const d=c.getImageData(0,0,64,64).data;
    // any ink outside the disc's own radius?
    let out=0;
    for(let y=0;y<64;y++) for(let x=0;x<64;x++){
      const i=(y*64+x)*4; if(d[i+3]===0) continue;
      if (Math.hypot(x-32,y-32) > 32) out++;
    }
    return out; };
  o.wideGlyphStaysInside = spill('quads') === 0 && spill('nine6') === 0;

  // ---- THE GLYPH IS CENTRED ON THE DISC ------------------------------------
  // ⚠️ Reported as the shirt number not being in the middle of it, and it was not: every
  // entry in the table sat 4.5-7px LOW on a 52px disc, worst case 8.0. Two causes, and the
  // big one looks correct — `textBaseline='middle'` centres the FONT's em box, and a digit
  // has no descender, so its ink is all above the baseline while the em box reserves
  // descender space below it. The rest was a hand-tuned `+ r*0.04` nudge on every glyph.
  //
  // ⚠️ **MEASURED AS A DIFFERENCE against the same disc with no faceplate.** An absolute
  // ink scan reads the disc's own rim and body — which are filled circles centred on the
  // very point being checked — and reports a centre of ~0 on every build, the broken one
  // included. That is this file's standing trap and it is at its sharpest here.
  // ⚠️ **Paired with "the glyph is drawn at all"**, or "it is centred" is satisfied by a
  // build that draws nothing. `blank` is the braille blank `⠀` and is excluded BY NAME: it
  // is a real, non-collapsing space and IS the blank avatar, so zero ink is correct there —
  // and it is also the one shipped key whose text metrics come back unusable, which is what
  // the painter's `isFinite` guard is for.
  const R = 26, N = 96, C = N/2;
  const plate = (flag) => { const cv=document.createElement('canvas'); cv.width=cv.height=N;
    const c=cv.getContext('2d');
    M.drawDisc(c, C, C, R, { color:'#f0a34b', flag, eyes:false, cap:'none' });
    return c.getImageData(0,0,N,N).data; };
  const bareDisc = plate('none');
  const glyphBox = (flag) => {
    const a = plate(flag); let top=1e9, bot=-1e9, n=0, mr=0;
    for (let y=0;y<N;y++) for (let x=0;x<N;x++){
      const i=(y*N+x)*4;
      const d = Math.abs(a[i]-bareDisc[i]) + Math.abs(a[i+1]-bareDisc[i+1]) + Math.abs(a[i+2]-bareDisc[i+2]);
      if (d > 60){ if(y<top)top=y; if(y>bot)bot=y; n++;
                   const rr=Math.hypot(x-C,y-C); if(rr>mr)mr=rr; }
    }
    return n ? { off:(top+bot)/2 - C, ink:n, mr } : { off:null, ink:0, mr:0 };
  };
  const boxes = Object.keys(M.TEXTS).map(k => ({ k, ...glyphBox(k) }));
  const drawn = boxes.filter(q => q.k !== 'blank');
  o.everyGlyphHasInk = drawn.every(q => q.ink > 0);
  o.blankHasNone = boxes.find(q => q.k === 'blank').ink === 0;
  o.worstOffset = +Math.max(...drawn.map(q => Math.abs(q.off))).toFixed(2);
  o.meanOffset = +(drawn.reduce((a,q) => a + q.off, 0) / drawn.length).toFixed(3);
  // ⚠️ **THE MEAN IS THE SHARP INSTRUMENT HERE, AND A MAX-ABSOLUTE CHECK IS NOT — a
  // sabotage proved it.** The defect is a SYSTEMATIC one: every glyph low by the same
  // amount. Per-glyph rounding is ±0.5 (a bounding box of even height has its midpoint on a
  // half-pixel), which is the same size as the smaller of the two causes — so putting the
  // `r*0.04` nudge back moved the worst absolute offset only 1.0 → 1.5 and sailed past a
  // max-only check. Averaged over all 47 drawn glyphs that rounding cancels and the bias
  // does not: this build measures **-0.36** and the nudge build **+0.68**.
  // ⚠️ Both are kept. The mean catches a bias the whole table shares; the max stops one
  // exotic glyph going wild without the average noticing. Neither alone is the claim.
  o.glyphIsCentred = Math.abs(o.meanOffset) <= 0.5 && o.worstOffset <= 1.5;
  o.offBy = drawn.filter(q => Math.abs(q.off) > 1.5).map(q => q.k + ' ' + q.off).slice(0, 6);
  // ⚠️ And nothing was pushed off the disc getting there. `wideGlyphStaysInside` above
  // covers two keys; this covers all 48, so the next person who reaches for a height-based
  // fit to the plate has a guard rather than a surprise.
  o.maxInkRadius = +Math.max(...drawn.map(q => q.mr)).toFixed(1);
  o.nothingSpills = o.maxInkRadius <= R;
  return o;
});

// ===================== A DEVICE STILL WEARING THE OLD DEFAULT ================
// ⚠️ Changing the factory default only ever reaches a FRESH install, so without a fold the
// person who reported the hat would still be wearing it and would have to go and find
// Reset. The fold moves a stored profile holding EXACTLY the old default pair
// (cap 'star' AND eyes 'googly') on to none/none.
// ⚠️ **BOTH must match, and the two negatives below are the whole point of that rule.**
// Somebody who picked the star on its own, or googly on its own, made a choice.
// ⚠️ **AND IT IS ONE-SHOT.** Star-plus-googly stays pickable by hand for ever, so a fold
// that ran every launch would silently un-pick it the next morning. The last case seeds
// the marker to prove the fold stands down once it has had its turn.
// ⚠️ Needs its own page per case: the fold reads `localStorage` during the bootstrap, so it
// cannot be driven from the suite's live page.
const seeded = async (prof, extra) => {
  const ctx = await b.newContext();
  const pg = await ctx.newPage();
  await pg.addInitScript(([pr, ex]) => {
    window.__MAGNETDEBUG = true; localStorage.clear();
    localStorage.setItem('magnetball.firstrun', '1');
    localStorage.setItem('magnetball.profile', JSON.stringify(pr));
    if (ex) for (const k in ex) localStorage.setItem(k, ex[k]);
  }, [prof, extra || null]);
  await pg.goto('file://' + process.cwd() + '/index.html');
  await pg.waitForTimeout(700);
  const got = await pg.evaluate(() => [window.__magnet.profile.cap, window.__magnet.profile.eyes]);
  await ctx.close();
  return got.join('/');
};
const BASE = { name:'You', color:'#46d17a', flag:'num1', photo:'', spin:true };
const fold = {
  pair:      await seeded({ ...BASE, cap:'star',  eyes:'googly' }),
  starOnly:  await seeded({ ...BASE, cap:'star',  eyes:'angry'  }),
  gogOnly:   await seeded({ ...BASE, cap:'crown', eyes:'googly' }),
  alreadyRan:await seeded({ ...BASE, cap:'star',  eyes:'googly' }, { 'magnetball.lookfold':'1' }),
};
r.foldMovesTheOldPair    = fold.pair === 'none/none';
r.foldLeavesAStarAlone   = fold.starOnly === 'star/angry';
r.foldLeavesGooglyAlone  = fold.gogOnly === 'crown/googly';
r.foldIsOneShot          = fold.alreadyRan === 'star/googly';
r.fold = fold;

console.log(JSON.stringify(r,null,1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const must = ['defaultIsANumber','freshProfileIsANumber','allNumbers','noCountryballsByDefault',
  'youAreNumberOne','eachTeamUnique','teamsNumberFromOne','shirtNoWraps','enoughPlates',
  'everyGlyphFromTheList','noDuplicateGlyphs','allTextUnlocked','textKeysDontClash',
  'textIsACategory','countsIncludeText','oneTilePerGlyph','everyTilePaints',
  'plateChangesTheDisc','differentDigitsDiffer','differentStylesDiffer','blankDraws',
  'pickEquips','pickPersists','wornInMatch','wideGlyphStaysInside',
  'everyGlyphHasInk','blankHasNone','glyphIsCentred','nothingSpills',
  'defaultNoHat','defaultNoEyes','defaultDiscIsBare','defaultDiscHasItsNumber',
  'noTwoInTheSameShirt','loneNumberKept','flagFaceplateKept','photoFaceplateKept','botsRouteRound',
  'foldMovesTheOldPair','foldLeavesAStarAlone','foldLeavesGooglyAlone','foldIsOneShot'];
const bad = must.filter(k => r[k] !== true);
const ok = bad.length === 0 && errors.length === 0;
if (bad.length) console.log('FAILED:', bad);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
