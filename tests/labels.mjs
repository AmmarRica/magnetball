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
  const settle = (w, frames=90) => { for(let i=0;i<frames;i++) M.drawDiscs(w); };
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
  for(let i=0;i<90;i++) M.drawDiscs(w);
  mate.x=me.x; mate.y=me.y - 30/M.cam.s;   // upright run, so screen-up is world -y
  M.drawDiscs(w);
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
  for(let i=0;i<60;i++) M.drawDiscs(rw);
  o.replayClear = +M.labelA[0].toFixed(3);
  // Now park a disc on the plate and re-render through FRESH player objects each
  // frame, the way playReplay does.
  const blocker = { ...rw.players[1], x: rMe.x, y: rMe.y - 30/M.cam.s };
  for(let i=0;i<90;i++){
    const fake = { ...rw, players: rw.players.map((pl,ix)=> ix===1 ? {...blocker} : {...pl}) };
    M.drawDiscs(fake);
  }
  o.replayBlocked = +M.labelA[0].toFixed(3);
  o.replayFades = o.replayClear > 0.9 && Math.abs(o.replayBlocked - M.LABEL_DIM) < 0.02;
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const near = (v,t)=>Math.abs(v-t) < 0.02;
const okOrient = m => near(m.clear,1) && near(m.discOver,r.floor) && near(m.discAway,1)
                   && near(m.ballOver,r.floor) && near(m.ballAway,1) && near(m.selfNeverDims,1);
const ok = okOrient(r.upright) && okOrient(r.sideways) && r.gradual && r.replayFades && errors.length===0;
if(!ok) console.log('upright:', okOrient(r.upright), '| sideways:', okOrient(r.sideways), '| gradual:', r.gradual, '| replay:', r.replayFades);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
