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
  o.shirtNoWraps = M.shirtNo(10) === 'num0' && M.shirtNo(3) === 'num3';

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
  return o;
});

console.log(JSON.stringify(r,null,1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const must = ['defaultIsANumber','freshProfileIsANumber','allNumbers','noCountryballsByDefault',
  'youAreNumberOne','eachTeamUnique','teamsNumberFromOne','shirtNoWraps',
  'everyGlyphFromTheList','noDuplicateGlyphs','allTextUnlocked','textKeysDontClash',
  'textIsACategory','countsIncludeText','oneTilePerGlyph','everyTilePaints',
  'plateChangesTheDisc','differentDigitsDiffer','differentStylesDiffer','blankDraws',
  'pickEquips','pickPersists','wornInMatch','wideGlyphStaysInside'];
const bad = must.filter(k => r[k] !== true);
const ok = bad.length === 0 && errors.length === 0;
if (bad.length) console.log('FAILED:', bad);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
