import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:800} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await p.addInitScript(()=>{
  window.__MAGNETDEBUG=true;
  // Controllable fake pad: window.__pad.buttons[i]=true / axes
  window.__pad = { axes:[0,0,0,0], buttons:new Array(17).fill(false) };
  navigator.getGamepads = () => [{
    index:0, connected:true, id:'fake', mapping:'standard',
    axes: window.__pad.axes,
    buttons: window.__pad.buttons.map(v=>({pressed:!!v, value:v?1:0}))
  }];
});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);
const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  // WARNING: THIS SUITE IS NOT ABOUT ORIENTATION, SO IT PINS ONE. sel.orient defaults to
  // auto, which now means "whichever way fills the screen" — on a wide page that turns
  // the pitch a quarter, which moves every world point on screen and rotates every seat's
  // stick. A suite that samples PIXELS or drives a STICK and does not say which way the
  // pitch faces is measuring whichever the window happened to pick.
  // (No backticks in here: this file builds pages with new Function() + a template
  // literal, and a backtick in a comment closes it early.)
  M.sel.orient = 'v';
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const B={A:0,B:1,LB:4,RB:5,SELECT:8,START:9};
  const press=async(i)=>{ window.__pad.buttons[i]=true; M.pollDeckUI(); await new Promise(r=>setTimeout(r,20));
                          window.__pad.buttons[i]=false; M.pollDeckUI(); await new Promise(r=>setTimeout(r,20)); };
  M.sel.display='deck'; M.applyDisplayMode();
  await new Promise(r=>setTimeout(r,200));
  M.sel.mode='1v1'; M.sel.controllers='on';

  // --- start a real match: menu should collapse, pad goes to the game
  M.startMatch();
  await new Promise(r=>setTimeout(r,150));
  o.collapsedOnStart = M.dockCollapsedNow()===true;
  o.menuNotOwningPad = M.deckMenuOwnsPad()===false;
  o.notPausedOnStart = M.paused===false;

  const w=M.world; w.state='play'; w.stateT=1;
  const me=w.players.find(x=>x.ctrl!=='bot');

  // --- collapsed: stick drives the PLAYER
  // seat is ctrl='gamepad' (pad connected), so drive the REAL fake pad; deck's
  // rotQuarter=1 turns stick-up into world +x, so measure displacement not y
  const drive = (steps)=>{ const x0=me.x, y0=me.y; window.__pad.axes[1]=-1;
    for(let i=0;i<steps;i++) M.step(w); window.__pad.axes[1]=0;
    return Math.hypot(me.x-x0, me.y-y0); };
  me.x=0; me.y=60; me.vx=0; me.vy=0; w.ball.x=-300; w.ball.y=-300;
  o.playerMovesWhenCollapsed = drive(40) > 15;

  // --- A while collapsed must NOT reopen the menu (A is KICK)
  const before = M.dockCollapsedNow();
  await press(B.A);
  o.aDoesNotReopen = M.dockCollapsedNow()===before && before===true;
  // START also must not reopen
  await press(B.START);
  o.startDoesNotReopen = M.dockCollapsedNow()===true;

  // --- SELECT opens the menu, pauses the match, and takes the pad
  await press(B.SELECT);
  await new Promise(r=>setTimeout(r,120));
  o.selectOpens = M.dockCollapsedNow()===false;
  o.menuOwnsPadWhenOpen = M.deckMenuOwnsPad()===true;
  o.pausedWhileMenuOpen = M.paused===true;

  // --- with menu open, the pad must NOT move the player
  me.x=0; me.y=60; me.vx=0; me.vy=0;
  o.playerFrozenWhenMenuOpen = drive(60) < 1;

  // --- SELECT again closes, resumes, returns pad to game
  await press(B.SELECT);
  await new Promise(r=>setTimeout(r,120));
  o.selectCloses = M.dockCollapsedNow()===true;
  o.resumedAfterClose = M.paused===false;
  o.menuReleasesPad = M.deckMenuOwnsPad()===false;
  me.x=0; me.y=60; me.vx=0; me.vy=0;
  o.playerMovesAgain = drive(40) > 15;

  // --- a match the USER paused stays paused when the menu closes
  M.pollDeckUI();
  await press(B.SELECT);                       // open (we pause)
  await new Promise(r=>setTimeout(r,80));
  await press(B.SELECT);                       // close (we un-pause)
  await new Promise(r=>setTimeout(r,80));
  o.notStuckPaused = M.paused===false;
  return o;
});
console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = Object.entries(r).every(([k,v])=>v===true) && errors.length===0;
if(!ok) console.log('FAILED KEYS:', Object.entries(r).filter(([k,v])=>v!==true).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
