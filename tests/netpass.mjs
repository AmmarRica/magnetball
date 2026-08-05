// Players pass through the net; the ball still doesn't.
//
// The net's side walls were the one surface that stopped a PLAYER, which made the
// step-out margin inconsistent: you could stroll a stride over the goal line either
// side of the posts, but chasing a ball into the mouth snagged on the side netting.
// They're `ballOnly` now, like every other boundary.
//
// Two things have to survive that, and both are checked on every field: the ball
// must still be caught by the net (it's the goal pocket), and players must still be
// contained — the clamp at halfL+20 is what stops them, not the netting.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:800,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const fresh = (field) => {
    M.sel.mode='1v1'; M.sel.kickoffRule='off'; M.sel.controllers='off';
    if (field) M.sel.field = field;
    M.setMatchSeed(3); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2;
    w.players.slice(1).forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; });
    w.ball.x=620; w.ball.y=620; w.ball.vx=0; w.ball.vy=0;
    return w;
  };

  // ---- structural: no net wall collides with a player ----------------------
  let w = fresh('classic');
  const nets = w.walls.filter(x => x.isNet);
  o.netWallCount = nets.length;
  o.everyNetIsBallOnly = nets.every(x => !!x.ballOnly);
  o.noPlayerWallsLeft = w.walls.filter(x => !x.ballOnly).length;
  // ...but the collider itself still works, so this isn't "the geometry vanished".
  {
    const me = w.players[0], bb = w.bounds;
    const wall = w.walls.find(x => x.isNet && x.a.x === bb.gh && x.a.y === bb.halfL);
    me.x = bb.gh - 8; me.y = bb.halfL + 20; me.vx = 3; me.vy = 0;
    const x0 = me.x; M.collideWall(me, wall);
    o.geometryStillReal = Math.abs(me.x - x0) > 0.5;
  }

  // ---- a player walks sideways THROUGH the mouth ---------------------------
  // Before, they pinned at gh - r against the side netting and never got past it.
  w = fresh('classic');
  {
    const bb = w.bounds, me = w.players[0];
    me.x = 0; me.y = bb.halfL + 12; me.vx = 0; me.vy = 0;
    M.pads.p1.dx = 1; M.pads.p1.dy = 0;               // drive the real pad: applyHumanInput
    for (let i=0;i<120;i++) M.step(w);                // rewrites inX/inY every step
    o.sideways = { x: +me.x.toFixed(1), y: +me.y.toFixed(1), post: bb.gh, wouldPinAt: bb.gh - me.r };
    o.passesThePost = me.x > bb.gh + me.r;
    M.pads.p1.dx = 0;
  }

  // ---- ...and is still contained ------------------------------------------
  w = fresh('classic');
  {
    const bb = w.bounds, me = w.players[0];
    me.x = 0; me.y = bb.halfL - 40; me.vx = 0; me.vy = 0;
    M.pads.p1.dx = 0; M.pads.p1.dy = 1;
    for (let i=0;i<300;i++) M.step(w);
    o.deepest = { y: +me.y.toFixed(1), line: bb.halfL, clamp: bb.halfL + 20, netBack: bb.halfL + bb.net };
    o.entersTheMouth = me.y > bb.halfL;               // it isn't a wall any more
    o.heldByTheClamp = me.y <= bb.halfL + 20.5;       // ...but they don't reach the netting
    o.neverReachesNetBack = me.y < bb.halfL + bb.net;
    M.pads.p1.dy = 0;
  }

  // ---- every field: ball still caught, player still contained -------------
  const badBall = [], badPlayer = [];
  for (const key of Object.keys(M.FIELDS)){
    const w2 = fresh(key);
    const bb = w2.bounds, me = w2.players[0];
    // Ball hammered straight at the net from inside the mouth.
    w2.ball.x = 0; w2.ball.y = bb.halfL + 2; w2.ball.vx = 0; w2.ball.vy = 40;
    let out = 0;
    for (let i=0;i<200;i++){
      M.moveBall(w2, w2.ball, []);
      if (Math.abs(w2.ball.y) > bb.halfL + bb.net + 1 || Math.abs(w2.ball.x) > bb.halfW + 1) out++;
    }
    if (out) badBall.push({ key, out, y:+w2.ball.y.toFixed(1), limit: bb.halfL+bb.net });
    // Player driven into the goal for a long time.
    w2.ball.x = 620; w2.ball.y = 620;
    me.x = 0; me.y = bb.halfL - 30; me.vx = 0; me.vy = 0;
    M.pads.p1.dx = 0.4; M.pads.p1.dy = 1;
    for (let i=0;i<300;i++) M.step(w2);
    if (Math.abs(me.y) > bb.halfL + 21 || Math.abs(me.x) > bb.halfW + 21)
      badPlayer.push({ key, x:+me.x.toFixed(1), y:+me.y.toFixed(1) });
    M.pads.p1.dx = 0; M.pads.p1.dy = 0;
  }
  o.fieldCount = Object.keys(M.FIELDS).length;
  o.ballEscapes = badBall.slice(0,4);
  o.playerEscapes = badPlayer.slice(0,4);
  M.sel.field = 'classic';
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.netWallCount === 6, `expected six net walls (three per goal), got ${r.netWallCount}`);
ok(r.everyNetIsBallOnly, 'a net wall still collides with players');
ok(r.noPlayerWallsLeft === 0, `${r.noPlayerWallsLeft} walls still block players — the step-out margin is uneven again`);
ok(r.geometryStillReal, 'the net geometry no longer collides at all, so the ball would fall out too');
ok(r.passesThePost, `a player inside the mouth still pins on the netting: reached x=${r.sideways.x}, would pin at ${r.sideways.wouldPinAt}`);
ok(r.entersTheMouth, `a player cannot enter the goal mouth at all: ${JSON.stringify(r.deepest)}`);
ok(r.heldByTheClamp, `a player went past the step-out margin: ${JSON.stringify(r.deepest)}`);
ok(r.neverReachesNetBack, `a player reached the back of the net: ${JSON.stringify(r.deepest)}`);
ok(r.fieldCount > 20, `only ${r.fieldCount} fields checked`);
ok(r.ballEscapes.length === 0, `the ball escaped the net on some field: ${JSON.stringify(r.ballEscapes)}`);
ok(r.playerEscapes.length === 0, `a player escaped the pitch on some field: ${JSON.stringify(r.playerEscapes)}`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nnetpass OK');
