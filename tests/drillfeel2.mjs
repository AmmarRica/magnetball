import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport: { width: 420, height: 820 }, hasTouch:true, isMobile:true });
const errors = [];
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(300);
const res = await p.evaluate(() => {
  const M = window.__magnet;
  M.sel.feel = { accel:80, pdamp:960, ballcap:50, kick:90, bdamp:985 };
  M.sel.magnet = 30; M.sel.pitch = 'normal';
  const fv = M.feelVals();
  M.startDrill('straight_up');
  const w = M.world;
  return {
    match: {
      pAccel: w.pAccel===fv.accel, pDamp: w.pDamp===fv.pdamp, ballCap: w.ballCap===fv.ballcap,
      kickPower: w.kickPower===fv.kick, bdamp: w.ball.damp===fv.bdamp, magnet: w.magnet===30
    },
    fv, drill: { pAccel:w.pAccel, pDamp:w.pDamp, ballCap:w.ballCap, kickPower:w.kickPower, bdamp:w.ball.damp, magnet:w.magnet }
  };
});
console.log(JSON.stringify(res, null, 2));
const ok = Object.values(res.match).every(Boolean) && errors.length===0;
console.log('ERRORS:', errors.length?errors:'none');
console.log('RESULT drillMatchesFeelVals:', ok);
await b.close(); process.exit(ok?0:1);
