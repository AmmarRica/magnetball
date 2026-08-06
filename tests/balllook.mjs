// The ball's look is customisable and every option is DRAWN — no image, nothing to
// 404, crisp at any size. Verified by sampling the canvas, not by trusting the call.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
const requested=[]; p.on('request',r=>requested.push(r.url()));
await p.addInitScript(()=>{ window.__MAGNETDEBUG=true; localStorage.clear(); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();

  // ---- Skins is gone; a real Ball section replaced it
  o.skinsCardGone = !document.querySelector('[data-sec="skins"]') &&
                    !document.getElementById('ballSkinPick') &&
                    !document.getElementById('playerSkinPick');
  o.noSkinSettings = M.sel.ballSkin === undefined && M.sel.playerSkin === undefined;
  o.ballCardExists = !!document.querySelector('[data-sec="ball"]');
  o.ballLookDefault = M.sel.look.ball === 'classic';

  // ---- Every look paints, and they all differ from one another
  o.lookCount = M.BALL_LOOK_KEYS.length;
  const sig = (key) => {
    const cv=document.createElement('canvas'); cv.width=cv.height=64;
    const c=cv.getContext('2d');
    M.paintBall(c, 32, 32, 25, -0.5, key);
    const d=c.getImageData(0,0,64,64).data;
    let h=0, ink=0;
    for(let i=0;i<d.length;i+=4){ h=(h*31 + d[i] + d[i+1]*3 + d[i+2]*7)|0; if(d[i+3]>0) ink++; }
    return { h, ink };
  };
  const sigs = M.BALL_LOOK_KEYS.map(sig);
  o.allPaint = sigs.every(s=>s.ink > 500);
  o.allDistinct = new Set(sigs.map(s=>s.h)).size === sigs.length;
  // Plain is the one with no pattern — it must still be a ball, just unmarked.
  o.plainIsStillABall = sig('plain').ink > 500;
  o.patternedDiffersFromPlain = sig('classic').h !== sig('plain').h;

  // ---- Nothing spills outside the ball: every pattern is clipped to the circle
  o.staysInsideTheBall = M.BALL_LOOK_KEYS.every(k=>{
    const cv=document.createElement('canvas'); cv.width=cv.height=80;
    const c=cv.getContext('2d'); M.paintBall(c, 40, 40, 25, 0.7, k);
    const d=c.getImageData(0,0,80,80).data;
    for(let y=0;y<80;y++) for(let x=0;x<80;x++){
      const i=(y*80+x)*4;
      if (d[i+3] > 8 && Math.hypot(x-40,y-40) > 25 + 25*0.16 + 1.5) return false;
    }
    return true;
  });

  // ---- It ROLLS: the pattern turns with the ball's spin
  const still = sig('classic');
  const cv=document.createElement('canvas'); cv.width=cv.height=64;
  M.paintBall(cv.getContext('2d'), 32, 32, 25, 1.2, 'classic');
  const d2=cv.getContext('2d').getImageData(0,0,64,64).data;
  let h2=0; for(let i=0;i<d2.length;i+=4) h2=(h2*31 + d2[i] + d2[i+1]*3 + d2[i+2]*7)|0;
  o.rotationChangesIt = h2 !== still.h;
  // ...and a plain ball is rotation-invariant, which is the point of it.
  const pa=sig('plain');
  const cv2=document.createElement('canvas'); cv2.width=cv2.height=64;
  M.paintBall(cv2.getContext('2d'), 32, 32, 25, 2.4, 'plain');
  const d3=cv2.getContext('2d').getImageData(0,0,64,64).data;
  let h3=0; for(let i=0;i<d3.length;i+=4) h3=(h3*31 + d3[i] + d3[i+1]*3 + d3[i+2]*7)|0;
  o.plainIgnoresRotation = h3 === pa.h;

  // ---- The picker builds one tile per look, each painting a real ball
  M.buildBallLookPick(); await wait(60);
  const tiles=[...document.querySelectorAll('#ballLookPick .opt')];
  o.tileCount = tiles.length;
  o.oneTilePerLook = tiles.length === M.BALL_LOOK_KEYS.length;
  o.tilesArePainted = tiles.every(t=>{ const cv=t.querySelector('canvas'); if(!cv) return false;
    const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
    let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>0) n++; return n>500; });
  o.noEmojiTiles = tiles.every(t=>!t.querySelector('.emoji'));
  o.noDisabledTiles = tiles.every(t=>!t.classList.contains('disabled'));   // nothing "needs art"

  // ---- The PATTERN has to be visible on the ball, under every palette ------
  // ⚠️ Pool pairs a #f7f4ec cue ball with a #e8e2d2 spot — 1.18:1 — because the cue
  // ball look is PLAIN and never exercised the spot. Pick any other look on that
  // palette and the pattern vanished: the ball, and every picker tile, rendered as
  // plain white with only the 3D shading showing. Every other palette is 10.6:1 or
  // better, which is exactly why it went unnoticed.
  const lum = h => { let c=(h||'').trim();
    if (c.length===4) c='#'+c[1]+c[1]+c[2]+c[2]+c[3]+c[3];
    const n=parseInt(c.slice(1),16);
    const f2=v=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f2((n>>16)&255) + 0.7152*f2((n>>8)&255) + 0.0722*f2(n&255); };
  const ratio = (a,b2) => { const l1=lum(a), l2=lum(b2);
    return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
  o.spotContrast = {};
  o.weakPalettes = [];
  for (const [k,t] of Object.entries(M.THEMES)){
    const used = M.ballSpotInk(t.pitch);
    const c2 = +ratio(t.pitch.ball, used).toFixed(2);
    o.spotContrast[k] = { declared:t.pitch.ballSpot, used, ratio:c2 };
    if (c2 < M.BALL_SPOT_CONTRAST - 0.05) o.weakPalettes.push(k + ':' + c2);
  }
  // A readable spot must be left ALONE — the guard is a floor, not a repaint.
  o.neonUntouched = M.ballSpotInk(M.THEMES.neon.pitch) === M.THEMES.neon.pitch.ballSpot;
  o.poolWasFixed  = M.ballSpotInk(M.THEMES.pool.pitch) !== M.THEMES.pool.pitch.ballSpot;
  // ...and it shows up in real pixels, not just in the arithmetic. Under Pool, a
  // patterned ball must differ from a plain one.
  M.applyBundle('pool');
  const shot = look => { const cv=document.createElement('canvas'); cv.width=cv.height=64;
    const c3=cv.getContext('2d'); M.paintBall(c3, 32, 32, 26, 0, look);
    const d=c3.getImageData(6,6,52,52).data;
    let dark=0; for(let i=0;i<d.length;i+=4) if (d[i+3]>128 && d[i]<200) dark++;
    return dark; };
  o.poolPlainDark = shot('plain');
  o.poolClassicDark = shot('classic');
  o.patternVisibleOnPool = o.poolClassicDark > o.poolPlainDark * 1.5;
  M.applyBundle('neon');

  // ---- Picking one sticks, persists, and reaches the pitch
  const pick = M.BALL_LOOK_KEYS.indexOf('eight');
  tiles[pick].click(); await wait(60);
  o.pickWrites = M.sel.look.ball === 'eight';
  o.pickPersists = (JSON.parse(localStorage.getItem('magnetball.sel')||'{}')).look.ball === 'eight';
  o.pickMarksTile = [...document.querySelectorAll('#ballLookPick .opt')][pick].classList.contains('sel');
  return o;
});

// ---- The pitch really shows it. Two looks, same frame, sampled off the canvas.
const pitch = await p.evaluate(async (looks)=>{
  const M=window.__magnet;
  const shot = (look) => {
    M.sel.look.ball = look;
    M.setMatchSeed(5); M.sel.mode='1v1'; M.startMatch();
    const w=M.world; w.state='play'; w.stateT=1;
    w.players.forEach(q=>{ q.x=9999; q.y=9999; });         // clear the ball's neighbourhood
    w.ball.x=0; w.ball.y=0; w.ball.vx=0; w.ball.vy=0; w.ball.rot=0.4;
    M.computeCam(); M.render();
    const cv=document.getElementById('game'), c=cv.getContext('2d');
    const DPR=cv.width/cv.clientWidth;
    const px=Math.round(M.wx(0)*DPR), py=Math.round(M.wy(0)*DPR), R=Math.round(26*DPR);
    const d=c.getImageData(px-R, py-R, R*2, R*2).data;
    let h=0; for(let i=0;i<d.length;i+=4) h=(h*31 + d[i] + d[i+1]*3 + d[i+2]*7)|0;
    return h;
  };
  const out = {};
  for (const l of looks) out[l] = shot(l);
  M.sel.look.ball='classic'; M.saveSel(); M.setMatchSeed(null);
  return out;
}, ['classic','plain','eight','beach']);
for (const [k,c] of Object.entries(r.spotContrast||{}))
  if (c.ratio < 4.45) console.log('WEAK SPOT', k, JSON.stringify(c));
const vals = Object.values(pitch);
const r2 = { pitchShowsLook: new Set(vals).size === vals.length };

// ---- Nothing is fetched for a ball any more
const skinFetches = requested.filter(u=>/assets\/(ball|player)\//.test(u));

console.log(JSON.stringify({ ...r, ...r2, pitch, skinFetches }, null, 1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const must = ['skinsCardGone','noSkinSettings','ballCardExists','ballLookDefault','allPaint',
  'allDistinct','plainIsStillABall','patternedDiffersFromPlain','staysInsideTheBall',
  'rotationChangesIt','plainIgnoresRotation','oneTilePerLook','tilesArePainted','noEmojiTiles',
  'noDisabledTiles','pickWrites','pickPersists','pickMarksTile','pitchShowsLook',
  'neonUntouched','poolWasFixed','patternVisibleOnPool'];
const all = { ...r, ...r2 };
const bad = must.filter(k => all[k] !== true);
if (all.weakPalettes && all.weakPalettes.length)
  bad.push('weakPalettes:' + all.weakPalettes.join(','));
const ok = bad.length === 0 && errors.length === 0 && skinFetches.length === 0;
if (bad.length) console.log('FAILED:', bad);
if (skinFetches.length) console.log('FAILED: still fetching sprite art', skinFetches);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
