import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await p.addInitScript(()=>{
  window.__MAGNETDEBUG=true;
  window.__pad = { axes:[0,0,0,0], buttons:new Array(17).fill(false) };
  navigator.getGamepads = () => [{ index:0, connected:true, id:'fake', mapping:'standard',
    axes: window.__pad.axes, buttons: window.__pad.buttons.map(v=>({pressed:!!v,value:v?1:0})) }];
});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);
const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const B={A:0,B:1,SELECT:8};
  const press=async i=>{ window.__pad.buttons[i]=true; M.pollDeckUI(); await wait(20);
                         window.__pad.buttons[i]=false; M.pollDeckUI(); await wait(20); };
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.display='deck'; M.applyDisplayMode(); await wait(200);
  M.sel.mode='1v1'; M.sel.controllers='on';

  // ---- match start: menu closed, game owns pad
  M.startMatch(); await wait(200);
  o.startCollapsed = M.dockCollapsedNow()===true;
  o.startGameOwnsPad = M.deckMenuOwnsPad()===false;

  // ---- REGRESSION: the gear / explicit navigation must actually SHOW the menu
  M.openStats(); await wait(150);
  o.gearNavExpands = M.dockCollapsedNow()===false && M.deckMenuOwnsPad()===true;
  o.gearNavPauses = M.paused===true;

  // ---- Select closes it again and hands the pad back
  await press(B.SELECT); await wait(150);
  o.selectCloses = M.dockCollapsedNow()===true && M.deckMenuOwnsPad()===false;
  o.resumedOnClose = M.paused===false;

  // ---- Select opens it again
  await press(B.SELECT); await wait(150);
  o.selectOpens = M.dockCollapsedNow()===false && M.deckMenuOwnsPad()===true;
  await press(B.SELECT); await wait(150);   // back to playing

  // ---- REGRESSION: after a match ends, toMenu must show a visible menu
  M.world.state='over';
  M.toMenu(); await wait(200);
  o.menuVisibleAfterMatch = M.dockCollapsedNow()===false && !!document.querySelector('.screen.docked:not(.hidden)');

  // ---- Select works when NOTHING is docked (drill) — always opens/closes
  M.startDrill('straight_up'); await wait(200);
  o.drillStartsCollapsed = M.dockCollapsedNow()===true;      // drill owns the pad, like a match
  o.drillGameOwnsPad = M.deckMenuOwnsPad()===false;
  await press(B.SELECT); await wait(250);
  o.selectOpensFromDrill = M.dockCollapsedNow()===false && M.deckMenuOwnsPad()===true;
  await press(B.SELECT); await wait(200);
  o.selectClosesFromDrill = M.dockCollapsedNow()===true && M.deckMenuOwnsPad()===false;

  // ---- while the menu is OPEN the pad must not drive the player
  M.sel.mode='1v1'; M.startMatch(); await wait(200);
  const w=M.world; w.state='play'; w.stateT=1;
  const me=w.players.find(x=>x.ctrl!=='bot');
  const drive=n=>{ const x0=me.x,y0=me.y; window.__pad.axes[1]=-1;
                   for(let i=0;i<n;i++) M.step(w); window.__pad.axes[1]=0;
                   return Math.hypot(me.x-x0,me.y-y0); };
  me.x=0; me.y=60; me.vx=0; me.vy=0; w.ball.x=-300; w.ball.y=-300;
  o.movesWhenClosed = drive(40) > 15;
  await press(B.SELECT); await wait(150);          // open menu
  me.x=0; me.y=60; me.vx=0; me.vy=0;
  o.frozenWhenOpen = drive(60) < 1;
  await press(B.SELECT); await wait(150);          // close
  me.x=0; me.y=60; me.vx=0; me.vy=0;
  o.movesAgain = drive(40) > 15;

  // ---- A never reopens the menu while playing (A is KICK)
  await press(B.A); await wait(60);
  o.aStillDoesNotReopen = M.dockCollapsedNow()===true;

  // ---- REGRESSION: pause screen → Main Menu → close the dock → the PAUSE SCREEN comes back.
  // Main Menu and Settings on the pause screen go through `dockOrFull`, which hides the
  // overlay and keeps the match paused behind the dock; closing the dock then showed a
  // frozen pitch with no overlay and nothing saying why — measured before the fix as
  // `paused` true, `#overlay` hidden, 0 sim steps in a second. The match was paused by the
  // PLAYER, so closing the menu must not resume it either (the deck's own rule above); it
  // puts the pause screen back, and Resume works from there.
  const ovShown = () => document.getElementById('overlay').classList.contains('show');
  M.togglePause(true); await wait(60);
  o.pauseShowsOverlay = M.paused===true && ovShown();
  M.toMenu(); await wait(250);
  o.menuFromPauseKeepsMatch = M.dockCollapsedNow()===false && !!M.world && M.world.state!=='over' && !ovShown();
  await press(B.SELECT); await wait(250);          // close the dock
  o.closingBringsPauseBack = M.dockCollapsedNow()===true && M.paused===true && ovShown();
  const tickA = M.world.aiTick; await wait(300);
  o.andStillPaused = M.world.aiTick===tickA;
  M.togglePause(false); await wait(60);
  o.resumeFromThere = M.paused===false && !ovShown();

  // ...and the same on a DESKTOP dock (the › tab instead of SELECT), because both layouts
  // share `setDockCollapsed` and the report came from a desktop.
  M.sel.display='auto'; M.applyDisplayMode(); await wait(200);
  M.startMatch(); await wait(150);
  M.world.state='play'; M.world.stateT=1;
  o.deskDockCapable = M.dockCapable()===true && M.isDeck()===false;
  M.togglePause(true); await wait(60);
  M.toMenu(); await wait(250);
  o.deskMenuFromPauseKeepsMatch = M.dockCollapsedNow()===false && M.world.state==='play' && !ovShown();
  M.setDockCollapsed(true); await wait(250);       // the › tab
  o.deskClosingBringsPauseBack = M.dockCollapsedNow()===true && M.paused===true && ovShown();
  // control: a dock opened by the tab over a RUNNING match closes back to a running match
  M.togglePause(false); await wait(60);
  M.setDockCollapsed(false); await wait(150); M.setDockCollapsed(true); await wait(150);
  o.deskTabRoundTripKeepsPlaying = M.paused===false && !ovShown();
  return o;
});
console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const bad = Object.entries(r).filter(([k,v])=>v!==true).map(([k])=>k);
if(bad.length) console.log('FAILED:', bad);
console.log('RESULT:', (!bad.length && !errors.length)?'ALL PASS':'FAIL');
await b.close(); process.exit((!bad.length && !errors.length)?0:1);
