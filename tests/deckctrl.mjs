import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);
const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.display='deck'; M.applyDisplayMode();
  await new Promise(r=>setTimeout(r,150));
  M.sel.mode='1v1'; M.sel.halfRule='off'; M.startMatch();
  await new Promise(r=>setTimeout(r,120));
  const w=M.world; w.state='play'; w.stateT=1;
  const me=w.players.find(x=>x.ctrl==='human1');
  o.rotQuarter = me.rotQuarter;

  // Helper: push the stick a direction, measure SCREEN movement via wx/wy
  const probe = (dx,dy)=>{
    me.x=0; me.y=0; me.vx=0; me.vy=0;
    w.ball.x=400; w.ball.y=400;               // keep ball away
    const sx0=M.wx(me.x), sy0=M.wy(me.y);
    M.pads.p1.dx=dx; M.pads.p1.dy=dy;
    for(let i=0;i<30;i++) M.step(w);
    M.pads.p1.dx=0; M.pads.p1.dy=0;
    // screen position accounting for the camera rotation
    const rot=M.cam.rot||0, ox=M.cam.ox, oy=M.cam.oy;
    const rx=M.wx(me.x)-ox, ry=M.wy(me.y)-oy;
    const c=Math.cos(rot), s=Math.sin(rot);
    return { sx:+(rx*c-ry*s).toFixed(1), sy:+(rx*s+ry*c).toFixed(1) };
  };
  const right = probe(1,0), left = probe(-1,0), up = probe(0,-1), down = probe(0,1);
  o.right=right; o.left=left; o.up=up; o.down=down;
  o.rightGoesRight = right.sx > 20 && Math.abs(right.sy) < 8;
  o.leftGoesLeft   = left.sx  < -20 && Math.abs(left.sy) < 8;
  o.upGoesUp       = up.sy    < -20 && Math.abs(up.sx) < 8;
  o.downGoesDown   = down.sy  > 20 && Math.abs(down.sx) < 8;
  return o;
});
console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,4):'none');
const ok = r.rotQuarter===1 && r.rightGoesRight && r.leftGoesLeft && r.upGoesUp && r.downGoesDown && errors.length===0;
console.log('RESULT screen-aligned controls:', ok?'PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
