// A COCKTAIL TABLE IS A ROOM, NOT A DEVICE. It is a flat screen people stand around in a
// bar: nobody owns it, nobody configured it, and whoever walks up has not read a menu. So
// it lays out 2 a side rather than the shipped 1v1, somebody joining a match in progress
// restarts it at 0-0 rather than inheriting somebody else's scoreline, and the result
// screen goes back to the attract demo in five seconds rather than dealing the same match
// again to people who may have walked off.
//
// ⚠️ EVERY CLAIM HERE IS PAIRED WITH THE SAME MEASUREMENT ON A NON-COCKTAIL LAYOUT, taken
// in the same run. All three of these read `sel.display`, so a build that applied them
// everywhere would satisfy every cocktail-side check on its own — and would be a far worse
// bug than the one being fixed, since it would restart a desktop match under whoever
// walked in and cut everyone's result screen to five seconds.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1200,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const o = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={}; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const pad=(ax)=>({ connected:true, mapping:'standard', id:'Fake Controller (STANDARD GAMEPAD)',
    axes: ax||[0,0,0,0], buttons: Array.from({length:17},()=>({pressed:false,value:0})) });
  let PADS=[];
  navigator.getGamepads = () => PADS;
  const setDisplay = async (d)=>{ M.sel.display=d; M.applyDisplayMode(); await wait(120); };

  M.sel.dropIn='on'; M.sel.autoReplay=false; M.sel.kickoffRule='off'; M.sel.lobby='off';
  M.sel.coop='off'; M.sel.length='5'; M.sel.mode='1v1';

  // ---- 1) TWO A SIDE BY DEFAULT ------------------------------------------------
  // ⚠️ Measured on the shipped build: with 0, 1 or 2 controllers a cocktail table played
  // 1v1, because the shipped default is 1v1 and only the pad raise moves it — so it took
  // FOUR pads to reach a 2v2, and two people at a table got one body a side.
  const sizeWith = (n)=>{
    PADS = Array.from({length:n}, ()=>pad());
    M.padForgetAll(); M.setMatchSeed(4); M.startMatch({lobby:false});
    const w=M.world;
    return [w.players.filter(q=>q.team===0).length, w.players.filter(q=>q.team===1).length];
  };
  await setDisplay('cocktail');
  o.cock0 = sizeWith(0); o.cock1 = sizeWith(1); o.cock2 = sizeWith(2); o.cock4 = sizeWith(4);
  o.twoASideNoPads = o.cock0[0]===2 && o.cock0[1]===2;
  o.twoASideOnePad = o.cock1[0]===2 && o.cock1[1]===2;
  o.twoASideTwoPads= o.cock2[0]===2 && o.cock2[1]===2;
  // ⚠️ The pad raise still composes: four pads is still a 2v2 and not a 1v1 with a floor
  // bolted on. `Math.max` is what makes eight pads a 4v4 rather than pinning everything.
  o.padRaiseSurvives = o.cock4[0]===2 && o.cock4[1]===2;
  // CONTROL: the same call on a plain layout must still be the mode the player picked.
  await setDisplay('auto');
  o.plain0 = sizeWith(0);
  o.plainStill1v1 = o.plain0[0]===1 && o.plain0[1]===1;
  // ⚠️ ...and a bigger mode is NOT pinned down to 2. This is a default, not a cap.
  await setDisplay('cocktail');
  M.sel.mode='4v4'; o.cock4v4 = sizeWith(0); M.sel.mode='1v1';
  o.biggerModeKept = o.cock4v4[0]===4 && o.cock4v4[1]===4;
  // ⚠️ AND IT IS NOT A FLOOR EITHER: `lobbySizeBump` floors at 1, so the warm-up stepper
  // still takes a table down to 1v1 for two people on opposite edges. "Default" is the
  // claim; a hard floor would be a different, worse feature that passes the checks above.
  PADS=[pad()]; M.padForgetAll(); M.setMatchSeed(4); M.startMatch();
  {
    const w=M.world;
    if (w.state!=='warmup') M.enterWarmup(w, false);
    M.lobbySizeBump(w,-1);
    o.stepperCanGoBelow = M.lobbyPlan(w).per === 1;
  }

  // ---- 2) A JOIN RESTARTS THE MATCH AT 0-0 -------------------------------------
  // ⚠️ COCKTAIL ROTATES EACH SEAT'S STICK to the side that person stands on, so the raw
  // axes producing a given WORLD heading are the INVERSE rotation of it. Pushing
  // world-inward straight onto the axes drives the joiner the opposite way and the hold
  // never completes — the first run of this measured "no join" on a build that joins
  // perfectly well. The seat that joins here reads quarter 2, a full 180 degrees.
  const joinInto = (display, score)=>{
    PADS=[pad()]; M.padForgetAll();
    M.setMatchSeed(7); M.startMatch({lobby:false});
    const w=M.world; w.state='play'; w.stateT=2; w.score=score.slice(); w.matchT=44;
    const drive=(n)=>{ for(let i=0;i<n;i++){ M.step(w); M.pollDropIn(w); } };
    PADS=[pad(),pad()]; drive(5);
    const g=M.benchHumans(w)[0];
    if(!g) return { waited:false };
    g.y=-160; g._py=g.y;
    const inw=M.subInward(w,g);
    const inv=M.rotVec(inw.x, inw.y, (4-(g.rotQuarter||0))%4);
    PADS=[pad(), pad([inv[0],inv[1],0,0])];
    drive(220);
    const nw=M.world;
    return { waited:true, quarter:g.rotQuarter||0, cameOn:nw.players.includes(g),
             score:nw.score.slice(), matchT:+nw.matchT.toFixed(1), state:nw.state };
  };
  await setDisplay('cocktail');
  o.joinCock = joinInto('cocktail',[2,1]);
  o.joinCameOn = !!o.joinCock.cameOn;
  o.joinResets = !!o.joinCock.cameOn && o.joinCock.score[0]===0 && o.joinCock.score[1]===0;
  // ⚠️ The CLOCK resets too, not only the scoreline. "Restart at 0-0" that leaves 47.7
  // seconds gone is a match somebody joined four fifths of the way through.
  o.joinResetsClock = !!o.joinCock.cameOn && o.joinCock.matchT < 5;
  // CONTROL: everywhere else, walking on mid-play is the whole point of the hold — you
  // take a bot's shirt and the game carries on with the score standing.
  await setDisplay('auto');
  o.joinPlain = joinInto('auto',[2,1]);
  o.plainKeepsScore = !!o.joinPlain.cameOn &&
                      o.joinPlain.score[0]===2 && o.joinPlain.score[1]===1;

  // ---- 3) THE RESULT SCREEN GOES TO THE DEMO IN FIVE SECONDS -------------------
  // ⚠️ THE HINT IS READ ON A SCREEN ARMED BY `finishMatch`, NEVER ONE ARMED BY A CALL TO
  // `stepResultClock`, and that is what makes this check able to see the real defect.
  // `showOverlay` is a SECOND writer of this clock, and the first build taught only
  // `stepResultClock` about cocktail: the words changed to "DEMO IN" and the number stayed
  // at 30, because the screen had already been armed with `AUTO.result` a moment earlier.
  // A probe that arms the clock itself never sees that.
  const overlayRun = async (display, secs)=>{
    PADS=[pad()];                      // ⚠️ no deflected axis: `anyoneTouchingSomething`
    M.padForgetAll();                  //   counts anything past 0.45 and holds the clock
    M.setMatchSeed(9); M.startMatch({lobby:false});
    const w=M.world; w.state='play'; w.stateT=2; w.score=[3,0];
    M.endMatch(w); M.finishMatch(w);
    await wait(80);
    const armed = (document.getElementById('ovHint')||{}).textContent||'';
    M.stepResultClock(secs);
    await wait(150);
    return { armed, over: !!(M.world && M.world.state==='over'),
             shown: document.getElementById('overlay').classList.contains('show'),
             demo: !!(M.world && M.world.demo) };
  };
  await setDisplay('cocktail');
  o.secsCock = M.resultSecs();
  o.goesToDemo = M.resultGoesToDemo();
  o.ovCock = await overlayRun('cocktail', 6);
  o.cockClockIsFive = o.secsCock === 5 && / 5S$/.test(o.ovCock.armed);
  // ⚠️ The words say where it is actually GOING. "NEXT MATCH IN 5S" over a screen that
  // goes to the demo is a promise the clock does not keep.
  o.cockSaysDemo = /DEMO IN/.test(o.ovCock.armed) && !/NEXT MATCH/.test(o.ovCock.armed);
  o.cockReachesDemo = o.ovCock.demo === true && o.ovCock.shown === false;
  // CONTROL: a plain layout still waits thirty seconds and still deals the next match.
  await setDisplay('auto');
  o.secsPlain = M.resultSecs();
  o.ovPlain = await overlayRun('auto', 6);
  o.plainClockIsThirty = o.secsPlain === 30 && / 30S$/.test(o.ovPlain.armed);
  o.plainSaysNextMatch = /NEXT MATCH IN/.test(o.ovPlain.armed);
  // ⚠️ Six seconds in, a plain result screen has NOT moved — which is what says the five
  // is cocktail's and not everybody's.
  o.plainStillWaitingAt6s = o.ovPlain.shown === true && o.ovPlain.demo === false;
  return o;
});

console.log(JSON.stringify(o,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = o.twoASideNoPads && o.twoASideOnePad && o.twoASideTwoPads &&
           o.padRaiseSurvives && o.biggerModeKept && o.stepperCanGoBelow &&
           o.plainStill1v1 &&
           o.joinCameOn && o.joinResets && o.joinResetsClock && o.plainKeepsScore &&
           o.cockClockIsFive && o.cockSaysDemo && o.cockReachesDemo &&
           o.plainClockIsThirty && o.plainSaysNextMatch && o.plainStillWaitingAt6s &&
           errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(o).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
