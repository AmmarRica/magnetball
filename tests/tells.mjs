// Motion tells must survive a still frame: a moving player leaves a tail, a parked
// one leaves nothing, a fast ball streaks further than a slow one, and a wind-up is
// visible on the disc. Asserted by sampling real canvas pixels, not by trusting the
// draw calls to have been made.
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
  M.sel.autoReplay=false; M.sel.orient='v'; M.applyDisplayMode(); await wait(150);
  M.sel.mode='2v2'; M.sel.kickoffRule='off'; M.startMatch(); await wait(150);
  const w=M.world; w.state='play'; w.stateT=2; M.computeCam();
  const cv=document.getElementById('game'), c2=cv.getContext('2d');
  const DPR = cv.width / cv.clientWidth;

  // Ink at a world point = how far this pixel is from the plain pitch there.
  // Sampled against a reference frame with the same pitch but nothing moving.
  const px = (wxv,wyv) => {
    const d=c2.getImageData(Math.round(wxv*DPR), Math.round(wyv*DPR), 1, 1).data;
    return [d[0],d[1],d[2]];
  };
  const diff=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]);

  // Build a trail for `q` by replaying `n` frames of motion, then measure the ink
  // left behind it, `back` player-radii along -velocity.
  const tailInk = (q, others, n, back) => {
    M.resetTrails();
    const sx=q.x, sy=q.y;
    q.x -= q.vx*n; q.y -= q.vy*n;
    // Reference: same pitch, nothing drawn on top.
    M.drawPitch(w);
    const sp=Math.hypot(q.vx,q.vy)||1;
    const bx=sx - (q.vx/sp)*q.r*back, by=sy - (q.vy/sp)*q.r*back;
    const ref = px(M.wx(bx), M.wy(by));
    for(let i=0;i<n;i++){ M.drawDiscTrails(w); q.x+=q.vx; q.y+=q.vy; }
    // Redraw pitch then the final trail so only the tail is on top of clean pitch.
    M.drawPitch(w); M.drawDiscTrails(w);
    const got = px(M.wx(bx), M.wy(by));
    q.x=sx; q.y=sy;
    return diff(ref,got);
  };

  const [me, mate] = w.players.filter(x=>x.team===0);
  const foes = w.players.filter(x=>x.team===1);
  // Park everyone else far away so nothing else paints near the sample point.
  const park=list=>list.forEach((q,i)=>{ q.x=520+i*40; q.y=520; q.vx=0; q.vy=0; });
  park([mate,...foes]);
  w.ball.x=-520; w.ball.y=-520; w.ball.vx=0; w.ball.vy=0;

  // 1) A sprinting player leaves ink behind them.
  me.x=0; me.y=120; me.vx=0; me.vy=-3.6;
  o.movingTail = tailInk(me, [], 12, 2.2);

  // 2) A parked player leaves none.
  me.x=0; me.y=120; me.vx=0; me.vy=0;
  o.parkedTail = tailInk(me, [], 12, 2.2);

  // 3) A faster player leaves MORE ink than a crawler.
  me.x=0; me.y=120; me.vx=0; me.vy=-1.0;
  o.slowTail = tailInk(me, [], 12, 2.2);

  // 4) Ball streak scales with speed the same way.
  const ballInk = (vx,vy,n,back) => {
    M.resetTrails();
    const sx=0, sy=100;
    w.ball.vx=vx; w.ball.vy=vy;
    w.ball.x=sx - vx*n; w.ball.y=sy - vy*n;
    M.drawPitch(w);
    const sp=Math.hypot(vx,vy)||1;
    const bx=sx-(vx/sp)*w.ball.r*back, by=sy-(vy/sp)*w.ball.r*back;
    const ref=px(M.wx(bx), M.wy(by));
    for(let i=0;i<n;i++){ M.drawBallTrail(w); w.ball.x+=vx; w.ball.y+=vy; }
    M.drawPitch(w); M.drawBallTrail(w);
    const got=px(M.wx(bx), M.wy(by));
    return diff(ref,got);
  };
  o.fastBall = ballInk(0,-16,12,3.0);
  o.slowBall = ballInk(0,-1.2,12,3.0);
  w.ball.x=-520; w.ball.y=-520; w.ball.vx=0; w.ball.vy=0;

  // 5) Wind-up is visible on the disc: a charged player differs from an idle one
  //    at the charge-ring radius.
  me.x=0; me.y=0; me.vx=0; me.vy=0; me.kick=false; me.chargeT=0;
  M.resetTrails();
  const ringAt = () => { const rr=me.r*M.cam.s*1.42;
    return px(M.wx(me.x), M.wy(me.y) - rr); };      // top of the ring = arc start
  M.drawPitch(w); M.drawDiscs(w);
  const idle = ringAt();
  me.kick=true; me.chargeT=M.CHARGE.max;
  M.drawPitch(w); M.drawDiscs(w);
  const charged = ringAt();
  o.chargeVisible = diff(idle, charged);
  me.kick=false; me.chargeT=0;

  // 6) Trails reset with the match so nothing streaks in from before. The live
  //    render loop repopulates immediately, so assert the LONG history is gone
  //    rather than expecting an empty array we'd never catch.
  M.resetTrails();
  for(let i=0;i<14;i++) M.drawDiscTrails(w);
  o.longHistoryBefore = Math.max(...M.discTrails.map(h=>h.length));
  M.startMatch();                       // synchronous: check before a frame can regrow it
  o.historyAfterStart = M.discTrails.reduce((n,h)=>n+(h?h.length:0), 0);
  o.trailsClearedOnStart = o.longHistoryBefore >= 10 && o.historyAfterStart === 0;
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.movingTail > 12 &&                 // a sprinter clearly marks the pitch
           r.parkedTail <= 2 &&                 // a parked player leaves it clean
           r.movingTail > r.slowTail &&         // and speed drives how much
           r.fastBall > 12 && r.slowBall < r.fastBall &&
           r.chargeVisible > 20 &&              // wind-up reads on the disc
           r.trailsClearedOnStart &&
           errors.length===0;
if(!ok) console.log('checks:', {
  movingTail:r.movingTail>12, parked:r.parkedTail<=2, speedScales:r.movingTail>r.slowTail,
  fastBall:r.fastBall>12, ballScales:r.slowBall<r.fastBall, charge:r.chargeVisible>20,
  reset:r.trailsClearedOnStart });
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
