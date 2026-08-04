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
  o.ballLookDefault = M.sel.ballLook === 'classic';

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

  // ---- Picking one sticks, persists, and reaches the pitch
  const pick = M.BALL_LOOK_KEYS.indexOf('eight');
  tiles[pick].click(); await wait(60);
  o.pickWrites = M.sel.ballLook === 'eight';
  o.pickPersists = (JSON.parse(localStorage.getItem('magnetball.sel')||'{}')).ballLook === 'eight';
  o.pickMarksTile = [...document.querySelectorAll('#ballLookPick .opt')][pick].classList.contains('sel');
  return o;
});

// ---- The pitch really shows it. Two looks, same frame, sampled off the canvas.
const pitch = await p.evaluate(async (looks)=>{
  const M=window.__magnet;
  const shot = (look) => {
    M.sel.ballLook = look;
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
  M.sel.ballLook='classic'; M.saveSel(); M.setMatchSeed(null);
  return out;
}, ['classic','plain','eight','beach']);
const vals = Object.values(pitch);
const r2 = { pitchShowsLook: new Set(vals).size === vals.length };

// ---- Nothing is fetched for a ball any more
const skinFetches = requested.filter(u=>/assets\/(ball|player)\//.test(u));

console.log(JSON.stringify({ ...r, ...r2, pitch, skinFetches }, null, 1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const must = ['skinsCardGone','noSkinSettings','ballCardExists','ballLookDefault','allPaint',
  'allDistinct','plainIsStillABall','patternedDiffersFromPlain','staysInsideTheBall',
  'rotationChangesIt','plainIgnoresRotation','oneTilePerLook','tilesArePainted','noEmojiTiles',
  'noDisabledTiles','pickWrites','pickPersists','pickMarksTile','pitchShowsLook'];
const all = { ...r, ...r2 };
const bad = must.filter(k => all[k] !== true);
const ok = bad.length === 0 && errors.length === 0 && skinFetches.length === 0;
if (bad.length) console.log('FAILED:', bad);
if (skinFetches.length) console.log('FAILED: still fetching sprite art', skinFetches);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
