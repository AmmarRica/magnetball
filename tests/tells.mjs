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
  // dirx/diry = which way "behind" is, given explicitly because a parked player has
  // no velocity to derive it from. Dots are spaced by distance travelled, so the
  // sample sweeps a short span and takes the strongest hit rather than trusting one
  // pixel to land on a dot.
  const tailInk = (q, n, back, dirx, diry) => {
    M.resetTrails();
    const sx=q.x, sy=q.y;
    q.x -= q.vx*n; q.y -= q.vy*n;
    M.drawPitch(w);
    let ref=[], probes=[];
    for (let j=-3;j<=3;j++){
      const d = q.r*back + j*2;
      probes.push([sx + dirx*d, sy + diry*d]);
    }
    ref = probes.map(([bx,by]) => px(M.wx(bx), M.wy(by)));
    for(let i=0;i<n;i++){ M.advanceTrails(w); q.x+=q.vx; q.y+=q.vy; }
    M.drawPitch(w); M.drawDiscTrails(w);
    let best=0;
    probes.forEach(([bx,by],j)=>{ best = Math.max(best, diff(ref[j], px(M.wx(bx), M.wy(by)))); });
    q.x=sx; q.y=sy;
    return best;
  };

  const [me, mate] = w.players.filter(x=>x.team===0);
  const foes = w.players.filter(x=>x.team===1);
  // Park everyone else far away so nothing else paints near the sample point.
  const park=list=>list.forEach((q,i)=>{ q.x=520+i*40; q.y=520; q.vx=0; q.vy=0; });
  park([mate,...foes]);
  w.ball.x=-520; w.ball.y=-520; w.ball.vx=0; w.ball.vy=0;

  // 1) A sprinting player leaves ink behind them.
  me.x=0; me.y=120; me.vx=0; me.vy=-3.6;
  o.movingTail = tailInk(me, 14, 2.2, 0, 1);        // behind = +y (it's heading -y)

  // 2) A parked player leaves none.
  me.x=0; me.y=120; me.vx=0; me.vy=0;
  o.parkedTail = tailInk(me, 14, 2.2, 0, 1);        // never moved -> nothing behind it

  // 3) A faster player leaves MORE ink than a crawler.
  me.x=0; me.y=120; me.vx=0; me.vy=-0.25;           // a crawl: barely covers a dot gap
  o.slowTail = tailInk(me, 14, 2.2, 0, 1);

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
    for(let i=0;i<n;i++){ M.advanceTrails(w); w.ball.x+=vx; w.ball.y+=vy; }
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
    return px(M.wx(me.x), M.wy(me.y) - rr); };      // top of the ring
  M.drawPitch(w); M.drawDiscs(w);
  const idle = ringAt();
  me.kick=true; me.chargeT=M.CHARGE.max; me.holdT=0;
  M.drawPitch(w); M.drawDiscs(w);
  const charged = ringAt();
  o.chargeVisible = diff(idle, charged);

  // 5b) It FLASHES rather than sweeping round. Two things to prove: the whole
  //     circle is drawn (left and right sides equally inked, not an arc filling
  //     clockwise from the top), and its brightness varies frame to frame.
  const ringInk = () => { const [sx,sy]=M.screenPt(M.wx(me.x), M.wy(me.y));
    const R=Math.round(me.r*1.42*M.cam.s)+3;
    const d2=c2.getImageData(Math.round(sx*DPR)-R, Math.round(sy*DPR)-R, R*2, R*2).data;
    let n=0; for(let i=0;i<d2.length;i+=4) if(d2[i]+d2[i+1]+d2[i+2]>330) n++;
    return n; };
  const halves = () => { const [sx,sy]=M.screenPt(M.wx(me.x), M.wy(me.y));
    const R=Math.round(me.r*1.42*M.cam.s)+3;
    const g=(x0)=>{ const d2=c2.getImageData(x0, Math.round(sy*DPR)-R, R, R*2).data;
      let n=0; for(let i=0;i<d2.length;i+=4) if(d2[i]+d2[i+1]+d2[i+2]>330) n++; return n; };
    return [ g(Math.round(sx*DPR)-R), g(Math.round(sx*DPR)) ]; };
  // ⚠️ Pinned, for the reason goalbox is: the wind-up ring is measured as BRIGHT ink over
  // the pitch, and `grass` — the default now — is a light surface with mown stripes, so the
  // probe's brightness threshold is met by the turf whether the ring is pulsing or not.
  M.applyBundle('neon'); M.drawPitch(w);
  const series=[];
  for (let i=0;i<24;i++){ me.holdT += 1/60; M.drawPitch(w); M.drawDiscs(w); series.push(ringInk()); }
  o.ringLow = Math.min(...series); o.ringHigh = Math.max(...series);
  // ⚠️ SOLID, and this check is INVERTED from what it used to be. It read
  // `ringHigh > ringLow * 1.25` — the ring was required to PULSE, as the alternative to
  // an earlier version that swept round like a loading bar. Holding kick at a full
  // charge strobed it at 11.5Hz, which was reported as the circle round the player
  // flashing, so brightness and width now carry the charge on their own. Twenty-four
  // frames at one charge have to put the SAME ink on the pitch every time.
  o.ringSolid = o.ringHigh <= Math.max(2, o.ringLow * 1.02);
  // ...and it is really being drawn, or "it does not flicker" is true of no ring at all.
  o.ringInked = o.ringLow > 8;
  // The dial moves it: the ring at the largest setting covers more than at the smallest.
  const inkAt = v => { M.sel.kickRing = v; M.drawPitch(w); M.drawDiscs(w); return ringInk(); };
  o.ringAtMin = inkAt(M.KICKRING.min);
  o.ringAtMax = inkAt(M.KICKRING.max);
  M.sel.kickRing = M.KICKRING.def;
  // Part-charged: a sweeping arc would ink one side far more than the other.
  me.chargeT = M.CHARGE.max*0.35; me.holdT = 0.35;
  M.drawPitch(w); M.drawDiscs(w);
  const [lh, rh] = halves();
  o.ringHalves = [lh, rh];
  o.ringIsFullCircle = Math.abs(lh-rh) < Math.max(lh,rh)*0.35;
  me.kick=false; me.chargeT=0; me.holdT=0;

  // 6) Trails reset with the match so nothing streaks in from before. The live
  //    render loop repopulates immediately, so assert the LONG history is gone
  //    rather than expecting an empty array we'd never catch.
  M.resetTrails();
  me.vx=0; me.vy=-3.6;
  for(let i=0;i<40;i++){ M.advanceTrails(w); me.x+=me.vx; me.y+=me.vy; }   // dots need travel
  o.longHistoryBefore = Math.max(...M.discTrails.map(h=>h.length));
  M.startMatch();                       // synchronous: check before a frame can regrow it
  o.historyAfterStart = M.discTrails.reduce((n,h)=>n+(h?h.length:0), 0);
  o.trailsClearedOnStart = o.longHistoryBefore >= 10 && o.historyAfterStart === 0;
  // 7) Both tells must read on EVERY theme, not just the one we eyeballed.
  //    (CLAUDE.md: verify across themes.) Probe travels THROUGH the sample point.
  const perTheme = {};
  for (const th of Object.keys(M.THEMES)){
    M.applyTheme(th); await wait(40);
    M.resetTrails();
    me.vx=0; me.vy=-3.6; me.x=0; me.y=160 - me.vy*14;
    w.ball.x=-520; w.ball.y=-520; w.ball.vx=0; w.ball.vy=0;
    M.drawPitch(w);
    const probes=[]; for(let j=-3;j<=3;j++) probes.push([0, 160+me.r*2.2+j*2]);
    const ref=probes.map(([x,y])=>px(M.wx(x),M.wy(y)));
    for(let i=0;i<14;i++){ M.advanceTrails(w); me.x+=me.vx; me.y+=me.vy; }
    M.drawPitch(w); M.drawDiscTrails(w);
    let dots=0; probes.forEach(([x,y],j)=>{ dots=Math.max(dots, diff(ref[j], px(M.wx(x),M.wy(y)))); });
    M.resetTrails();
    w.ball.vx=0; w.ball.vy=-20; w.ball.x=0; w.ball.y=100+20*12; w.ball.lastKickTeam=0;
    M.drawPitch(w);
    const bref=px(M.wx(0), M.wy(100+w.ball.r*3));
    for(let i=0;i<12;i++){ M.advanceTrails(w); w.ball.y+=w.ball.vy; }
    M.drawPitch(w); M.drawBallTrail(w);
    perTheme[th] = { dots, line: diff(bref, px(M.wx(0), M.wy(100+w.ball.r*3))) };
  }
  M.applyTheme(M.sel.look.palette);
  o.perTheme = perTheme;
  o.allThemesRead = Object.values(perTheme).every(v => v.dots > 25 && v.line > 40);
  return o;
});

// ---- 5c) The on-screen KICK PAD wears the same tell. It kept sweeping round like a
// loading bar long after the disc stopped: the disc check above passed while the
// thing actually under your thumb still read as progress.
// The pad only exists in the mobile layout, and that is decided by WINDOW WIDTH —
// there is no `sel.display='mobile'` to force, so the page has to be resized.
await p.setViewportSize({ width: 420, height: 900 });
await p.waitForTimeout(250);
const pad = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  M.sel.display='auto'; M.sel.mode='1v1'; M.sel.controllers='off'; M.applyDisplayMode();
  o.layoutIsTouch = M.isTouchLayout();
  M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
  const me=w.players.find(q=>q.ctrl==='human1');
  const cv=document.getElementById('game'), c2=cv.getContext('2d');
  const DPR=cv.width/cv.clientWidth;
  const KR=Math.round(M.KICK_R*DPR), m=Math.round(70*DPR);
  const kx=m, ky=Math.round(cv.height-m);                 // p1, right-handed: bottom-left
  const bright=(x0,y0,w0,h0)=>{ const d=c2.getImageData(x0,y0,w0,h0).data;
    let n=0; for(let i=0;i<d.length;i+=4) if(d[i]+d[i+1]+d[i+2]>330) n++; return n; };
  const ink = () => bright(kx-KR, ky-KR, KR*2, KR*2);
  M.computeCam();
  me.kick=true; me.chargeT=M.CHARGE.max; me.holdT=0;
  const series=[];
  for (let i=0;i<24;i++){ me.holdT += 1/60; M.render(); series.push(ink()); }
  o.padLow=Math.min(...series); o.padHigh=Math.max(...series);
  o.padDrawsSomething = o.padHigh > 0;                    // or everything below is vacuous
  o.padRingPulses = o.padHigh > o.padLow * 1.25;
  // Part-charged: a clockwise sweep inks the right half and leaves the left empty.
  me.chargeT=M.CHARGE.max*0.35; me.holdT=0.35; M.render();
  const lh=bright(kx-KR, ky-KR, KR, KR*2), rh=bright(kx, ky-KR, KR, KR*2);
  o.padHalves=[lh,rh];
  o.padRingIsFullCircle = Math.max(lh,rh) > 0 && Math.abs(lh-rh) < Math.max(lh,rh)*0.40;
  me.kick=false; me.chargeT=0; me.holdT=0;
  return o;
});
Object.assign(r, pad);

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.movingTail > 12 &&                 // a sprinter clearly marks the pitch
           r.parkedTail <= 2 &&                 // a parked player leaves it clean
           r.movingTail > r.slowTail &&         // and speed drives how much
           r.fastBall > 12 && r.slowBall < r.fastBall &&
           r.chargeVisible > 20 &&              // wind-up reads on the disc
           r.ringSolid && r.ringInked && r.ringIsFullCircle &&  // solid, drawn, never a sweep
           r.layoutIsTouch && r.padDrawsSomething &&        // the pad is on screen at all
           r.padRingPulses && r.padRingIsFullCircle &&    // ...and it flashes too
           r.trailsClearedOnStart && r.allThemesRead &&
           errors.length===0;
if(!ok) console.log('checks:', {
  movingTail:r.movingTail>12, parked:r.parkedTail<=2, speedScales:r.movingTail>r.slowTail,
  fastBall:r.fastBall>12, ballScales:r.slowBall<r.fastBall, charge:r.chargeVisible>20,
  reset:r.trailsClearedOnStart, themes:r.allThemesRead,
  ringSolid:r.ringSolid, ringInked:r.ringInked, ringFull:r.ringIsFullCircle,
  ringDial:[r.ringAtMin, r.ringAtMax] });
if(!ok && !r.allThemesRead) console.log('per-theme:', JSON.stringify(r.perTheme));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
