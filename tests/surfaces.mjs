// Pitch surfaces have to be visibly different, not just differently slippery.
// Grass is mown, ice is a rink, mud is churned where the traffic is.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:1000} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const cv=document.getElementById('game'), c2=cv.getContext('2d');

  // Sample only INSIDE the pitch, so discs, HUD and surround can't sway the result.
  const inner = () => { const M2=window.__magnet, w=M2.world, b=w.bounds;
    const x0=M2.wx(-b.halfW*0.8), x1=M2.wx(b.halfW*0.8);
    const y0=M2.wy(-b.halfL*0.8), y1=M2.wy(b.halfL*0.8);
    const L=Math.round(Math.min(x0,x1)), T=Math.round(Math.min(y0,y1));
    const W=Math.round(Math.abs(x1-x0)), H=Math.round(Math.abs(y1-y0));
    const DPR=cv.width/cv.clientWidth;
    return c2.getImageData(L*DPR, T*DPR, Math.max(1,W*DPR), Math.max(1,H*DPR)).data; };
  const sig = () => { const d=inner(); let h=0;
    for(let i=0;i<d.length;i+=32) h=(h*31 + d[i]+d[i+1]*3+d[i+2]*7)|0; return h; };
  const mean = () => { const d=inner(); let R=0,G=0,B=0,n=0;
    for(let i=0;i<d.length;i+=64){ R+=d[i]; G+=d[i+1]; B+=d[i+2]; n++; }
    return [R/n, G/n, B/n]; };
  const show = (surf, mow) => { M.sel.pitch=surf; M.sel.field='classic'; M.sel.grass=mow||'stripes';
    M.sel.mode='1v1'; M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
    M.computeCam(); M.render(); return { sig:sig(), mean:mean() }; };

  const g=show('normal'), i=show('ice'), m=show('mud');
  o.grassMean=g.mean.map(Math.round); o.iceMean=i.mean.map(Math.round); o.mudMean=m.mean.map(Math.round);
  o.allThreeDiffer = new Set([g.sig,i.sig,m.sig]).size === 3;
  // Ice is cool: more blue than red. Mud is warm: more red than blue. The mud
  // margin is smaller because the surviving turf is in the average too — that's
  // the point of the surface, so measure it honestly rather than cropping to bare
  // ground until the number looks impressive.
  o.iceIsCool = i.mean[2] > i.mean[0] + 20;
  o.mudRedOverBlue = Math.round(m.mean[0] - m.mean[2]);
  o.mudIsWarm = o.mudRedOverBlue > 10;
  o.iceIsBluerThanGrass = i.mean[2] > g.mean[2];
  o.mudIsRedderThanGrass = m.mean[0] > g.mean[0];

  // Texture, not a flat tint: the surface must vary across the pitch.
  const variance = () => { const d=inner(); let n=0,s1=0,s2=0;
    for(let i2=0;i2<d.length;i2+=32){ const v=d[i2]; s1+=v; s2+=v*v; n++; }
    return s2/n - (s1/n)**2; };
  show('normal'); const vG=variance();
  show('ice');    o.iceVariance=Math.round(variance());
  show('mud');    o.mudVariance=Math.round(variance());
  o.iceHasTexture = o.iceVariance > 40;
  o.mudHasTexture = o.mudVariance > 120;
  o.mudMoreVariedThanGrass = o.mudVariance > vG;

  // Mud wears where people run: the goal mouth must be more churned than a corner.
  M.sel.pitch='mud'; M.startMatch(); M.world.state='play'; M.computeCam(); M.render();
  const at = (wx, wy, rad) => { const DPR=cv.width/cv.clientWidth;
    const sx=M.wx(wx), sy=M.wy(wy);
    const d=c2.getImageData(Math.round((sx-rad)*DPR), Math.round((sy-rad)*DPR),
                            Math.round(rad*2*DPR), Math.round(rad*2*DPR)).data;
    let R=0,G=0,n=0; for(let k=0;k<d.length;k+=16){ R+=d[k]; G+=d[k+1]; n++; }
    return R/n - G/n; };   // brown => red well above green; grass => green wins
  const f=M.world.field;
  o.goalMouthBrown = Math.round(at(0, f.L/2*0.82, 26));
  o.cornerBrown    = Math.round(at(f.W/2*0.86, f.L/2*0.86, 26));
  o.wearFollowsTraffic = o.goalMouthBrown > o.cornerBrown + 12;

  // Deterministic: the same pitch every render and every restart. A Math.random
  // texture would re-scuff itself sixty times a second.
  const a1=show('ice'); const a2=(M.render(), sig());
  o.stableSameFrame = a1.sig === a2;
  o.stableAcrossRestarts = show('ice').sig === a1.sig;
  o.mudStable = show('mud').sig === show('mud').sig;

  // The cache must invalidate on the things that change the picture.
  const iceNeon = show('ice').sig;
  M.sel.theme='light'; M.applyTheme('light'); const iceLight=show('ice').sig;
  o.rebakesOnTheme = iceNeon !== iceLight;
  M.sel.theme='neon'; M.applyTheme('neon');
  const mudClassic = show('mud').sig;
  M.sel.field='huge'; M.sel.pitch='mud'; M.startMatch(); M.world.state='play'; M.computeCam(); M.render();
  o.rebakesOnField = mudClassic !== sig();
  M.sel.field='classic';
  const mudRings=show('mud','rings'), mudStripes=show('mud','stripes');
  o.mudKeepsTheMow = mudRings.sig !== mudStripes.sig;   // surviving turf shows your cut

  // Picker tiles show the surface too — the emoji told you nothing.
  M.buildSettings(); M.buildMatchOpts();
  const tiles=[...document.querySelectorAll('#pitches .opt canvas')];
  o.tileCount = tiles.length;
  const tsig = c => { const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let h=0; for(let k=0;k<d.length;k+=8) h=(h*31 + d[k]+d[k+1]*3)|0; return h; };
  o.tilesDiffer = tiles.length===3 && new Set(tiles.map(tsig)).size === 3;

  // Physics is unchanged by all of this.
  M.sel.pitch='normal'; const pN=(M.startMatch(), M.world.pAccel);
  M.sel.pitch='ice';    const pI=(M.startMatch(), M.world.pAccel);
  M.sel.pitch='mud';    const pM=(M.startMatch(), M.world.pAccel);
  o.gripStillDiffers = pN!==pI && pI!==pM;

  // Every field renders every surface without escaping or throwing.
  o.fieldFails=[];
  for (const key of Object.keys(M.FIELDS)){
    for (const surf of ['ice','mud']){
      try { M.sel.field=key; M.sel.pitch=surf; M.startMatch();
        const w=M.world; w.state='play'; w.stateT=1;
        w.ball.vx=70; w.ball.vy=45; for(let s2=0;s2<60;s2++) M.step(w);
        M.computeCam(); M.render();
        const b2=w.bounds;
        if (!isFinite(w.ball.x) || Math.abs(w.ball.x) > b2.halfW + w.ball.r + 2)
          o.fieldFails.push(key+'/'+surf+':escape');
      } catch(e){ o.fieldFails.push(key+'/'+surf+':'+e.message); }
    }
  }
  M.sel.field='classic'; M.sel.pitch='normal'; M.saveSel();
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.allThreeDiffer && r.iceIsCool && r.mudIsWarm && r.iceIsBluerThanGrass &&
  r.mudIsRedderThanGrass && r.iceHasTexture && r.mudHasTexture && r.mudMoreVariedThanGrass &&
  r.wearFollowsTraffic && r.stableSameFrame && r.stableAcrossRestarts && r.mudStable &&
  r.rebakesOnTheme && r.rebakesOnField && r.mudKeepsTheMow && r.tilesDiffer &&
  r.gripStillDiffers && r.fieldFails.length===0 && errors.length===0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
