// Warm-up lobby: bots wait off the touchline while humans test their controls,
// teams are picked by standing on a side, uneven sides are balanced with bots, and
// a cocktail player can calibrate which way "up" is from where they're sitting.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);

const page = async (nPads) => {
  const p = await b.newPage({ viewport:{width:700,height:1000} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript((n)=>{
    window.__MAGNETDEBUG=true; localStorage.clear();
    window.__pads = Array.from({length:n},()=>({axes:[0,0,0,0], buttons:new Array(17).fill(false)}));
    navigator.getGamepads = () => window.__pads.map((pd,i)=>({
      index:i, connected:true, id:'f'+i, mapping:'standard', axes:pd.axes,
      buttons: pd.buttons.map(v=>({pressed:!!v, value:v?1:0})) }));
  }, nPads);
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  return { p, errs };
};

const o = {}; const allErrs = [];

// ---------- Entering the lobby, benched bots, testable controls ----------
{
  const { p, errs } = await page(2);
  Object.assign(o, await p.evaluate(()=>{
    const M=window.__magnet; const r={};
    const d=document.getElementById('dmCollect'); if(d) d.click();
    M.sel.controllers='on'; M.sel.mode='2v2'; M.applyDisplayMode();
    M.setMatchSeed(3); M.startMatch();
    const w=M.world;
    r.entersWarmup = w.state === 'warmup';
    r.humans = M.lobbyHumans(w).length;
    r.benched = w.players.filter(q=>q.ctrl==='bot').length;
    // The whole point: with 2 pads in a 2v2 the OTHER two seats wait at the side.
    r.twoBotsWaiting = r.benched === 2;
    r.botsOffThePitch = w.players.filter(q=>q.ctrl==='bot')
      .every(q => Math.abs(q.x) > w.field.W/2 + q.r);
    // Waiting bots don't play: no AI, no drifting back on.
    const bx = w.players.filter(q=>q.ctrl==='bot').map(q=>q.x+','+q.y).join('|');
    for(let i=0;i<200;i++) M.step(w);
    r.botsStayPut = w.players.filter(q=>q.ctrl==='bot').map(q=>q.x+','+q.y).join('|') === bx;
    r.botsIdle = w.players.filter(q=>q.ctrl==='bot').every(q=>q.inX===0 && q.inY===0 && !q.kick);
    // ...and the ball stays parked, so nothing can be scored in the lobby.
    r.ballParked = w.ball.x===0 && w.ball.y===0 && w.ball.vx===0 && w.ball.vy===0;
    // Controls ARE testable: the stick moves your player.
    const me=M.lobbyHumans(w)[0]; me.x=0; me.y=40; me.vx=0; me.vy=0;
    window.__pads[0].axes[1] = -1;
    for(let i=0;i<45;i++) M.step(w);
    r.stickMovesYou = me.y < 30;
    window.__pads[0].axes[1] = 0;
    // KICK is testable too and cannot disturb the parked ball.
    me.x=0; me.y=26; me.vx=me.vy=0;
    window.__pads[0].buttons[0] = true;
    for(let i=0;i<60;i++) M.step(w);
    window.__pads[0].buttons[0] = false;
    r.kickCannotMoveBall = w.ball.vx===0 && w.ball.vy===0;
    // No lobby without pads — a keyboard-only match still kicks straight off.
    M.sel.controllers='off'; M.applyDisplayMode(); M.startMatch();
    r.noPadsNoLobby = M.world.state === 'kickoff';
    M.sel.controllers='on';
    return r;
  }));
  allErrs.push(...errs); await p.close();
}

// ---------- Team configuration: stand on a side, host starts, sides balance ----------
const sides = async (nPads, mode, place) => {
  const { p, errs } = await page(nPads);
  const r = await p.evaluate(({mode, place})=>{
    const M=window.__magnet; const out={};
    const d=document.getElementById('dmCollect'); if(d) d.click();
    M.sel.controllers='on'; M.sel.mode=mode; M.applyDisplayMode();
    M.setMatchSeed(3); M.startMatch();
    const w=M.world; const hs=M.lobbyHumans(w);
    hs.forEach((q,i)=>{ q.x=0; q.y = place[i]===0 ? 120 : -120; q.vx=0; q.vy=0; });
    for(let i=0;i<5;i++) M.step(w);
    out.preview = [...w.lobby.sides.values()].join('');
    // A non-host START must NOT begin the match — it only readies them.
    if (nPadsHasSecond()) {
      window.__pads[1].buttons[9]=true; M.step(w); window.__pads[1].buttons[9]=false;
      M.step(w);
      out.guestStartDoesNotBegin = w.state === 'warmup';
      out.guestStartReadies = w.lobby.ready.size === 1;
    } else { out.guestStartDoesNotBegin = true; out.guestStartReadies = true; }
    function nPadsHasSecond(){ return window.__pads.length > 1 && M.lobbyHumans(w).length > 1; }
    // Host START begins it.
    window.__pads[0].buttons[9]=true; M.step(w); window.__pads[0].buttons[9]=false;
    out.state = w.state;
    const t0=w.players.filter(q=>q.team===0), t1=w.players.filter(q=>q.team===1);
    out.t0 = t0.map(q=>q.ctrl==='bot'?'b':'P').join('');
    out.t1 = t1.map(q=>q.ctrl==='bot'?'b':'P').join('');
    out.balanced = t0.length === t1.length;
    out.humansKeptTheirSide = M.lobbyHumans(w)
      .every(q => (q.team===0) === (place[M.lobbyHumans(w).indexOf(q)] === 0) || place.every(x=>x===place[0]));
    out.lobbyCleared = !w.lobby;
    out.statsFresh = w.players.every(q => q.ms.goals===0 && q.ms.touches===0);
    return out;
  }, {mode, place});
  allErrs.push(...errs); await p.close();
  return r;
};
o.oneEachSide  = await sides(2,'2v2',[0,1]);
o.twoVsOne     = await sides(3,'4v4',[0,0,1]);
o.allOneSide   = await sides(3,'4v4',[0,0,0]);
o.soloAuto     = await sides(1,'2v2',[1]);
o.hostStarts        = o.oneEachSide.state==='kickoff' && o.twoVsOne.state==='kickoff';
o.guestCannotStart  = [o.oneEachSide,o.twoVsOne,o.allOneSide].every(x=>x.guestStartDoesNotBegin);
o.guestReadies      = o.oneEachSide.guestStartReadies;
o.alwaysBalanced    = [o.oneEachSide,o.twoVsOne,o.allOneSide,o.soloAuto].every(x=>x.balanced);
// 2 people in a 2v2 stay a 2v2 — picking a side chooses your TEAM, not the match size.
o.modeSetsTheFloor  = o.oneEachSide.t0==='Pb' && o.oneEachSide.t1==='Pb';
// 2v1 becomes 2v2 by giving the short side a bot (the "5v4 → add one" rule).
o.unevenGetsABot    = o.twoVsOne.t0.startsWith('PP') && o.twoVsOne.t1.startsWith('P') &&
                      o.twoVsOne.t1.includes('b');
// Everyone crowding one side is split rather than refused.
o.allOneSideSplits  = o.allOneSide.t0.includes('P') && o.allOneSide.t1.includes('P');
o.soloIsAutoAssigned= o.soloAuto.t0.startsWith('P') && !o.soloAuto.t1.includes('P');
o.lobbyCleared      = [o.oneEachSide,o.twoVsOne].every(x=>x.lobbyCleared && x.statsFresh);

// ---------- Cocktail direction calibration ----------
{
  const { p, errs } = await page(2);
  Object.assign(o, await p.evaluate(()=>{
    const M=window.__magnet; const r={};
    const d=document.getElementById('dmCollect'); if(d) d.click();
    M.sel.display='cocktail'; M.sel.mode='2v2'; M.sel.cocktailSides={}; M.applyDisplayMode();
    M.setMatchSeed(3); M.startMatch();
    const w=M.world;
    r.cocktailAlwaysLobbies = w.state === 'warmup';
    // An uncalibrated player's START calibrates instead of kicking off.
    window.__pads[0].buttons[9]=true; M.step(w); window.__pads[0].buttons[9]=false;
    r.startCalibratesFirst = !!w.lobby.calib && w.state==='warmup';
    r.oneArrowAtATime = M.CALIB_STEPS.length===2 && w.lobby.calib.step===0;
    r.firstIsUp = M.CALIB_STEPS[0].key==='up' && M.CALIB_STEPS[1].key==='right';
    const hold=(ax,ay,n)=>{ window.__pads[0].axes[0]=ax; window.__pads[0].axes[1]=ay;
      for(let i=0;i<n;i++) M.step(w); window.__pads[0].axes[0]=0; window.__pads[0].axes[1]=0; };
    // A hold shorter than the window must NOT register.
    hold(1,0,30);
    r.shortHoldIgnored = w.lobby.calib.step===0;
    // Releasing resets the clock rather than banking partial progress.
    M.step(w);
    r.releaseResetsHold = w.lobby.calib.held===0;
    // This player sits to the LEFT of the table: their "up" is screen +x.
    hold(1,0,70);
    r.upAccepted = w.lobby.calib && w.lobby.calib.step===1;
    hold(0,1,70);
    r.calibrationCompletes = !w.lobby.calib;
    r.seatSideStored = M.sel.cocktailSides[1];
    r.persisted = (JSON.parse(localStorage.getItem('magnetball.sel')||'{}').cocktailSides||{})[1]
                  === r.seatSideStored;
    // The proof: pushing the direction they called "up" now moves them UP the screen.
    const me=M.lobbyHumans(w)[0]; me.x=0; me.y=0; me.vx=0; me.vy=0;
    window.__pads[0].axes[0]=1;
    for(let i=0;i<30;i++) M.step(w);
    r.upIsNowUp = me.y < -3 && Math.abs(me.x) < Math.abs(me.y);
    window.__pads[0].axes[0]=0;
    // Only the stick/dpad drives it — a face button can't advance calibration.
    window.__pads[1].buttons[9]=true; M.step(w); window.__pads[1].buttons[9]=false;
    const before = w.lobby.calib.step;
    window.__pads[1].buttons[0]=true; for(let i=0;i<70;i++) M.step(w);
    window.__pads[1].buttons[0]=false;
    r.buttonsDoNotCalibrate = w.lobby.calib.step === before;
    // The dpad does, though (mapped buttons 12–15 feed the same stick vector).
    window.__pads[1].buttons[12]=true; for(let i=0;i<70;i++) M.step(w);
    window.__pads[1].buttons[12]=false;
    r.dpadCalibrates = w.lobby.calib.step > before;
    // Once calibrated, the host's START kicks off instead of re-calibrating.
    M.lobbyHumans(w).forEach(q=>q.calibrated=true); w.lobby.calib=null;
    window.__pads[0].buttons[9]=true; M.step(w); window.__pads[0].buttons[9]=false;
    r.calibratedHostStarts = w.state==='kickoff';
    return r;
  }));
  allErrs.push(...errs); await p.close();
}

// ---------- Stepping outside = sitting this one out ----------
{
  const { p, errs } = await page(3);
  Object.assign(o, await p.evaluate(()=>{
    const M=window.__magnet; const r={};
    const d=document.getElementById('dmCollect'); if(d) d.click();
    M.sel.controllers='on'; M.sel.mode='2v2'; M.applyDisplayMode();
    M.setMatchSeed(3); M.startMatch();
    const w=M.world; const hs=M.lobbyHumans(w);
    hs[0].x=0; hs[0].y=120; hs[1].x=0; hs[1].y=-120;
    hs[2].x=w.field.W/2+40; hs[2].y=0;              // P3 steps off the pitch
    for(let i=0;i<5;i++) M.step(w);
    r.outsideIsAThirdAnswer = M.lobbySideOf(hs[2], w) === -1 && M.lobbyOutside(w, hs[2]);
    r.previewShowsOut = [...w.lobby.sides.values()].includes(-1);
    // In warm-up you can walk out there in the first place — the in-play step-out
    // margin of 20 would have pinned you to the touchline.
    r.warmupLetsYouOut = Math.abs(hs[2].x) > w.field.W/2 + 20;
    window.__pads[0].buttons[9]=true; M.step(w); window.__pads[0].buttons[9]=false;
    r.benchedOnStart = w.bench.includes(hs[2]) && !w.players.includes(hs[2]);
    r.sidesStillEqual = w.players.filter(q=>q.team===0).length === w.players.filter(q=>q.team===1).length;
    // Spare bots go to the bench too — dropping them shrank the roster every restart.
    r.spareBotsKept = w.bench.some(q=>q.ctrl==='bot') || w.bench.length === 1;
    r.rosterIntact = w.players.length + w.bench.length === 4;
    // A benched player CANNOT walk back on mid-match, however hard they push.
    const bn = w.bench.find(q=>q.ctrl!=='bot');
    // Seat order is NOT pad order — a 2v2 interleaves the teams when handing out
    // pads, so `hs[2]` is not necessarily pad 2. Drive the pad they actually hold.
    const bpad = window.__pads[bn.padIndex];
    r.benchHasAPad = !!bpad;
    bpad.axes[0] = -1;
    let everOn = false;
    for(let i=0;i<300;i++){ M.step(w);
      if (Math.abs(bn.x) < w.field.W/2) everOn = true; }
    bpad.axes[0] = 0;
    r.cannotEnterMidMatch = !everOn;
    r.benchNeverTouchesTheBall = !w.players.includes(bn);
    // ...but they DO move, and they can't wander off the screen either.
    const y0 = bn.y;
    bpad.axes[1] = 1;
    for(let i=0;i<120;i++) M.step(w);
    r.benchStillMoves = Math.abs(bn.y - y0) > 10;
    bpad.axes[0]=1; bpad.axes[1]=1;
    for(let i=0;i<600;i++) M.step(w);
    bpad.axes[0]=0; bpad.axes[1]=0;
    r.benchStaysOnScreen = Math.abs(bn.x) <= w.field.W/2 + M.LOBBY.outMargin + 1 &&
                           Math.abs(bn.y) <= w.field.L/2 + M.LOBBY.outMargin + 1;
    return r;
  }));
  allErrs.push(...errs); await p.close();
}

// ---------- Game over: Restart (default) and Warm-up, Player 1 only ----------
{
  const { p, errs } = await page(3);
  Object.assign(o, await p.evaluate(()=>{
    const M=window.__magnet; const r={};
    const d=document.getElementById('dmCollect'); if(d) d.click();
    M.sel.controllers='on'; M.sel.mode='2v2'; M.applyDisplayMode();
    M.setMatchSeed(3); M.startMatch();
    const w=M.world; const hs=M.lobbyHumans(w);
    hs[0].x=0; hs[0].y=120; hs[1].x=0; hs[1].y=-120; hs[2].x=w.field.W/2+40; hs[2].y=0;
    for(let i=0;i<5;i++) M.step(w);
    window.__pads[0].buttons[9]=true; M.step(w); window.__pads[0].buttons[9]=false;
    const teams = w.players.map(q=>q.team+':'+q.ctrl).join('|');
    w.state='play'; w.score=[3,1]; w.players[0].ms.goals=3;
    M.endMatch(w);
    const labels = M.overButtons().map(x=>x.textContent);
    r.showsBothOptions = /restart/i.test(labels[0]) && /warm/i.test(labels[1]);
    r.restartIsDefault = M.overNav === 0 && M.overButtons()[0].classList.contains('navsel');
    r.statsShownToo = document.querySelectorAll('#ovStats .statsrow').length > 0;
    r.saysPlayerOneChooses = /player 1/i.test(document.getElementById('ovHint').textContent);
    // Player 1's stick moves the selection; NOBODY else's does.
    window.__pads[1].axes[0]=1; M.pollOverOptions(); window.__pads[1].axes[0]=0;
    window.__pads[2].axes[0]=1; M.pollOverOptions(); window.__pads[2].axes[0]=0;
    r.othersCannotPick = M.overNav === 0;
    window.__pads[0].axes[0]=1; M.pollOverOptions(); window.__pads[0].axes[0]=0; M.pollOverOptions();
    r.p1MovesSelection = M.overNav === 1;
    window.__pads[0].axes[0]=-1; M.pollOverOptions(); window.__pads[0].axes[0]=0; M.pollOverOptions();
    r.selectionGoesBack = M.overNav === 0;
    // Restart: same teams, fresh scoreline, bench preserved.
    M.overButtons()[0].click();
    r.restartKicksOff = M.world.state === 'kickoff';
    r.restartKeepsTeams = M.world.players.map(q=>q.team+':'+q.ctrl).join('|') === teams;
    r.restartResetsScore = M.world.score.join('-') === '0-0';
    r.restartResetsStats = M.world.players.every(q=>q.ms.goals===0);
    r.restartKeepsBench = M.world.bench.length > 0;
    r.restartNoOverlay = !document.getElementById('overlay').classList.contains('show');
    // Warm-up: back to the lobby with everyone available again.
    M.world.state='play'; M.world.score=[1,1]; M.endMatch(M.world);
    M.overButtons()[1].click();
    r.warmupOption = M.world.state === 'warmup';
    r.warmupFreesTheBench = M.world.bench.length === 0 && M.world.players.length === 4;
    return r;
  }));
  allErrs.push(...errs); await p.close();
}

// ---------- The lobby is drawn, and only in the lobby ----------
{
  const { p, errs } = await page(2);
  Object.assign(o, await p.evaluate(()=>{
    const M=window.__magnet; const r={};
    const d=document.getElementById('dmCollect'); if(d) d.click();
    M.sel.controllers='on'; M.sel.mode='2v2'; M.sel.display='auto'; M.applyDisplayMode();
    M.setMatchSeed(3); M.startMatch();
    const w=M.world;
    const cv=document.getElementById('game'), c=cv.getContext('2d');
    const snap=()=>{ const dd=c.getImageData(0,0,cv.width,cv.height).data;
      let h=0; for(let i=0;i<dd.length;i+=32) h=(h*31+dd[i]+dd[i+1]*3+dd[i+2]*7)|0; return h; };
    M.computeCam(); M.render(); const lobbyFrame = snap();
    // drawLobby must actually paint — otherwise every claim here is vacuous.
    M.render(); const before = snap(); M.drawLobby(w);
    r.lobbyPaints = snap() !== before;
    // ...and paints nothing once the match starts.
    M.lobbyStart(w);
    M.render(); const playing = snap();
    r.lobbyFrameDiffers = playing !== lobbyFrame;
    const b2 = snap(); M.drawLobby(w);
    r.noLobbyAfterKickoff = snap() === b2;
    return r;
  }));
  allErrs.push(...errs); await p.close();
}

await b.close();
console.log(JSON.stringify(o,null,1));
console.log('ERRORS:', allErrs.length?allErrs.slice(0,5):'none');
const must = ['entersWarmup','twoBotsWaiting','botsOffThePitch','botsStayPut','botsIdle',
  'ballParked','stickMovesYou','kickCannotMoveBall','noPadsNoLobby',
  'hostStarts','guestCannotStart','guestReadies','alwaysBalanced','modeSetsTheFloor',
  'unevenGetsABot','allOneSideSplits','soloIsAutoAssigned','lobbyCleared',
  'cocktailAlwaysLobbies','startCalibratesFirst','oneArrowAtATime','firstIsUp',
  'shortHoldIgnored','releaseResetsHold','upAccepted','calibrationCompletes','persisted',
  'upIsNowUp','buttonsDoNotCalibrate','dpadCalibrates','calibratedHostStarts',
  'lobbyPaints','lobbyFrameDiffers','noLobbyAfterKickoff',
  'outsideIsAThirdAnswer','previewShowsOut','warmupLetsYouOut','benchedOnStart',
  'sidesStillEqual','rosterIntact','cannotEnterMidMatch','benchNeverTouchesTheBall',
  'benchStillMoves','benchStaysOnScreen','benchHasAPad',
  'showsBothOptions','restartIsDefault','statsShownToo','saysPlayerOneChooses',
  'othersCannotPick','p1MovesSelection','selectionGoesBack','restartKicksOff',
  'restartKeepsTeams','restartResetsScore','restartResetsStats','restartKeepsBench',
  'restartNoOverlay','warmupOption','warmupFreesTheBench'];
const bad = must.filter(k => o[k] !== true);
const ok = bad.length === 0 && allErrs.length === 0;
if (bad.length) console.log('FAILED:', bad);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
process.exit(ok?0:1);
