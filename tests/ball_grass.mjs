import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport: { width: 440, height: 900 } });
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(300);

const res = await p.evaluate(() => {
  const M = window.__magnet;
  const out = {};
  // Grass picker built with 6 tiles?
  out.grassTiles = document.querySelectorAll('#grass .opt').length;

  // Render every grass style across a match; ensure ball rolls and stays finite.
  const styles = ['stripes','vertical','check','diagonal','rings','solid'];
  M.startMatch();
  const w = M.world; w.state='play'; w.stateT=1;
  const rotStart = w.ball.rot || 0;
  // give the ball speed so it rolls
  w.ball.vx = 20; w.ball.vy = 8;
  for (let i=0;i<20;i++) M.step(w);
  out.ballRolled = Math.abs((w.ball.rot||0) - rotStart) > 0.1;

  out.perStyle = {};
  for (const g of styles){
    M.sel.grass = g;
    for (let i=0;i<8;i++) M.step(w);
    // force a render tick
    out.perStyle[g] = { ok: isFinite(w.ball.x) };
  }
  // multiball extras also roll?
  M.sel.party = { big:false,lowg:false,sudden:false,multi:true };
  M.startMatch();
  const w2 = M.world; w2.state='play'; w2.stateT=1;
  if (w2.extraBalls && w2.extraBalls[0]){ w2.extraBalls[0].vx=18; }
  const er0 = (w2.extraBalls[0]&&w2.extraBalls[0].rot)||0;
  for (let i=0;i<15;i++) M.step(w2);
  out.extraRolled = w2.extraBalls[0] ? Math.abs((w2.extraBalls[0].rot||0)-er0) > 0.05 : true;
  return out;
});

console.log(JSON.stringify(res, null, 2));
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
const ok = res.grassTiles===6 && res.ballRolled && res.extraRolled &&
  Object.values(res.perStyle).every(s=>s.ok) && errors.length===0;
console.log('\nRESULT ballRolls&&grassStylesRender:', ok);
await b.close();
process.exit(ok ? 0 : 1);
