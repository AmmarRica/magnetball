// Name plates fade to 5% while they sit over another disc or the ball, and come
// back once clear. Drives the real renderer and reads the per-player alpha the
// draw path uses, in both pitch orientations.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.autoReplay=false;

  // Settle the fade by rendering repeatedly, then read the player's label alpha.
  // ⚠️ ONE DRAW, then the STEP LOOP eases the fade. It used to be 90 draws, back when the
  // easing was written inside `drawDiscs` — which was the bug `tests/floaters.mjs` and
  // `tests/surfaces.mjs` caught: two draws of one frame produced two different pictures,
  // so a paused screen kept changing. The draw now only records the target and
  // `advanceLabels()` (next to decayJuice, in the step loop) does the easing, so driving
  // this by repeating the DRAW would settle nothing at all.
  const settle = (w, frames=90) => { M.drawDiscs(w); for(let i=0;i<frames;i++){ M.advanceLabels(); M.drawDiscs(w); } };
  const alphaOf = (w, q) => M.labelA[w.players.indexOf(q)];
  const far = (w, list) => list.forEach((q,i)=>{ q.x = 400 + i*40; q.y = 400; });

  const run = async (orient) => {
    M.sel.orient = orient; M.applyDisplayMode(); await wait(150);
    M.sel.mode='2v2'; M.startMatch(); await wait(150);
    const w=M.world; w.state='play'; w.stateT=1; M.computeCam();
    const [me, mate] = w.players.filter(x=>x.team===0);
    const foes = w.players.filter(x=>x.team===1);
    const res={};

    // 1) Everything clear -> label at full opacity.
    me.x=0; me.y=100; far(w,[mate,...foes]); w.ball.x=-350; w.ball.y=-350;
    settle(w); res.clear = +alphaOf(w,me).toFixed(3);

    // 2) A disc parked exactly where the plate sits -> fades to the floor.
    //    The plate hangs above the disc ON SCREEN, and a sideways pitch maps screen
    //    "up" to world +x — so derive the world offset from the camera rotation
    //    instead of assuming -y (that assumption silently passes only when upright).
    const upWorld = () => {
      const rot = M.cam.rot || 0, c = Math.cos(-rot), sn = Math.sin(-rot);
      const sdx = 0, sdy = -30;              // 30px up, comfortably inside the plate
      return [(sdx*c - sdy*sn)/M.cam.s, (sdx*sn + sdy*c)/M.cam.s];
    };
    const [ux, uy] = upWorld();
    mate.x = me.x + ux; mate.y = me.y + uy;
    settle(w); res.discOver = +alphaOf(w,me).toFixed(3);

    // 3) Move it away -> comes back.
    far(w,[mate,...foes]); settle(w); res.discAway = +alphaOf(w,me).toFixed(3);

    // 4) The BALL parked on the plate -> fades.
    w.ball.x = me.x + ux; w.ball.y = me.y + uy; w.ball.vx=0; w.ball.vy=0;
    settle(w); res.ballOver = +alphaOf(w,me).toFixed(3);

    // 5) Ball away -> back to full.
    w.ball.x=-350; w.ball.y=-350; settle(w); res.ballAway = +alphaOf(w,me).toFixed(3);

    // 6) Its own disc must never dim its own label (self is excluded).
    far(w,[mate,...foes]); w.ball.x=-350; w.ball.y=-350;
    settle(w); res.selfNeverDims = +alphaOf(w,me).toFixed(3);
    return res;
  };

  o.upright  = await run('v');
  o.sideways = await run('h');

  // Fade is gradual, not a blink: one frame must not jump straight to the floor.
  M.sel.orient='v'; M.applyDisplayMode(); await wait(150);
  M.sel.mode='2v2'; M.startMatch(); await wait(150);
  const w=M.world; w.state='play'; w.stateT=1; M.computeCam();
  const [me, mate] = w.players.filter(x=>x.team===0);
  const foes = w.players.filter(x=>x.team===1);
  me.x=0; me.y=100; foes.forEach((q,i)=>{q.x=400+i*40; q.y=400;});
  mate.x=400; mate.y=400; w.ball.x=-350; w.ball.y=-350;
  settle(w);
  mate.x=me.x; mate.y=me.y - 30/M.cam.s;   // upright run, so screen-up is world -y
  // ⚠️ ONE draw to record the new target, then ONE ease — that is a single frame, and
  // the point of this check is that a single frame does not jump straight to the floor.
  M.drawDiscs(w); M.advanceLabels();
  const aNow = M.labelA[w.players.indexOf(me)];
  o.oneFrameAlpha = +aNow.toFixed(3);
  o.gradual = aNow > M.LABEL_DIM + 0.3;   // still well above the floor after 1 frame
  o.floor = M.LABEL_DIM;
  // 7) The REPLAY must fade as well. It rebuilds its player objects every frame
  //    ({...pl}), which is precisely what stopped the old per-object alpha from
  //    ever converging — so simulate that and confirm the fade still lands.
  M.sel.mode='2v2'; M.startMatch(); await wait(150);
  const rw = M.world; rw.state='play'; rw.stateT=1; M.computeCam();
  const rMe = rw.players[0];
  rw.players.forEach((q,i)=>{ if(i) { q.x=400+i*40; q.y=400; } });
  rMe.x=0; rMe.y=100; rw.ball.x=-350; rw.ball.y=-350;
  M.drawDiscs(rw); for(let i=0;i<60;i++){ M.advanceLabels(); M.drawDiscs(rw); }
  o.replayClear = +M.labelA[0].toFixed(3);
  // Now park a disc on the plate and re-render through FRESH player objects each
  // frame, the way playReplay does.
  const blocker = { ...rw.players[1], x: rMe.x, y: rMe.y - 30/M.cam.s };
  for(let i=0;i<90;i++){
    const fake = { ...rw, players: rw.players.map((pl,ix)=> ix===1 ? {...blocker} : {...pl}) };
    M.drawDiscs(fake); M.advanceLabels();
  }
  o.replayBlocked = +M.labelA[0].toFixed(3);
  o.replayFades = o.replayClear > 0.9 && Math.abs(o.replayBlocked - M.LABEL_DIM) < 0.02;

  // --- Plates are tinted by TEAM. They were white on every disc, so nothing about
  // the plate told you which side a player was on.
  M.applyBundle('neon'); M.sel.mode='2v2'; M.startMatch();
  const tw2=M.world; tw2.state='play'; tw2.stateT=1;
  const a2=tw2.players.find(q=>q.team===0), b2=tw2.players.find(q=>q.team===1);
  a2.x=-120; a2.y=-150; b2.x=120; b2.y=-150;      // apart, so nothing dims either
  tw2.players.filter(q=>q!==a2&&q!==b2).forEach((q,i)=>{ q.x=-300+i*40; q.y=300; });
  tw2.ball.x=0; tw2.ball.y=300;
  M.computeCam(); for(let i=0;i<12;i++) M.render();
  const cv2=document.getElementById('game'), c3=cv2.getContext('2d');
  const DPR2=cv2.width/cv2.clientWidth;
  // Sample the middle of each plate (18px above the disc, in screen space).
  const plateAt = (q) => { const [sx,sy]=M.screenPt(M.wx(q.x), M.wy(q.y));
    const py=sy - q.r*M.cam.s - 15;
    const d=c3.getImageData(Math.round(sx*DPR2)-2, Math.round(py*DPR2)-2, 5, 5).data;
    let R=0,G=0,B=0,n=0; for(let i=0;i<d.length;i+=4){R+=d[i];G+=d[i+1];B+=d[i+2];n++;}
    return [Math.round(R/n), Math.round(G/n), Math.round(B/n)]; };
  // The NAME carries the colour; the BOX stays neutral. Sampling the whole plate
  // rect mixes box and glyphs, so the team signal is a tint of the mean rather than
  // a flat fill — assert the direction, not a specific colour.
  o.plateTeam0 = plateAt(a2); o.plateTeam1 = plateAt(b2);
  o.platesDifferByTeam = JSON.stringify(o.plateTeam0) !== JSON.stringify(o.plateTeam1);
  o.team0ReadsRed  = o.plateTeam0[0] > o.plateTeam0[2];          // red channel leads
  o.team1ReadsBlue = o.plateTeam1[2] > o.plateTeam1[0];          // blue channel leads
  // The box itself is NOT team-tinted: sample a corner of the plate, away from glyphs.
  const boxAt = (q) => { const [sx,sy]=M.screenPt(M.wx(q.x), M.wy(q.y));
    const px=sx - 0, py=sy - q.r*M.cam.s - 21;                   // top strip of the plate
    const d=c3.getImageData(Math.round(px*DPR2)-1, Math.round(py*DPR2)-1, 3, 3).data;
    return [d[0],d[1],d[2]]; };
  const box0=boxAt(a2), box1=boxAt(b2);
  o.box0=box0; o.box1=box1;
  o.boxesMatchEachOther = Math.abs(box0[0]-box1[0])<12 && Math.abs(box0[2]-box1[2])<12;

  // --- Text on the plate must clear WCAG AA on EVERY theme. Colouring the text and
  // leaving the plate dark measured as low as 3.06:1, which is why it isn't that.
  const lum = h => { const c=h.replace('#',''); const v=[0,2,4].map(i=>parseInt(c.substr(i,2),16)/255)
    .map(x=>x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4));
    return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]; };
  const ratio=(x,y)=>{const L1=lum(x),L2=lum(y);return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);};
  o.worstPlateContrast = 99; o.worstPlateTheme=''; o.rawWorst = 99;
  o.inksDifferEveryTheme = true;
  for (const [k,t] of Object.entries(M.THEMES)){
    const bg = t.pitch.nameBg;
    const inks = [t.pitch.teamRed, t.pitch.teamBlue].map(c => M.rgbToHex(M.readableInk(c, bg)));
    if (inks[0] === inks[1]) o.inksDifferEveryTheme = false;
    for (let i=0;i<2;i++){
      const c = ratio(inks[i], bg);
      const raw = ratio([t.pitch.teamRed, t.pitch.teamBlue][i], bg);
      if (raw < o.rawWorst) o.rawWorst = +raw.toFixed(2);
      if (c < o.worstPlateContrast){ o.worstPlateContrast = +c.toFixed(2); o.worstPlateTheme = k; }
    }
  }
  o.everyThemeClearsAA = o.worstPlateContrast >= 4.5;
  // The lightening is doing real work: at least one raw team colour was under AA.
  o.rawWouldHaveFailed = o.rawWorst < 4.5;
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const near = (v,t)=>Math.abs(v-t) < 0.02;
const okOrient = m => near(m.clear,1) && near(m.discOver,r.floor) && near(m.discAway,1)
                   && near(m.ballOver,r.floor) && near(m.ballAway,1) && near(m.selfNeverDims,1);
const ok = okOrient(r.upright) && okOrient(r.sideways) && r.gradual && r.replayFades &&
  r.platesDifferByTeam && r.team0ReadsRed && r.team1ReadsBlue && r.boxesMatchEachOther &&
  r.everyThemeClearsAA && r.inksDifferEveryTheme && r.rawWouldHaveFailed && errors.length===0;
if(!ok) console.log('upright:', okOrient(r.upright), '| sideways:', okOrient(r.sideways), '| gradual:', r.gradual, '| replay:', r.replayFades);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
