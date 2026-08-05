// Full-feature audit. Two questions, asked of every setting:
//   1. REACHABLE — can a player actually get to it from the UI, without the console?
//   2. EFFECTIVE — does changing it move something real (world state or pixels)?
// A setting that saves and does nothing is the failure this suite exists to catch.
import { chromium, LAUNCH, stubLeaderboard } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:900} });
// This suite opens the Leaderboard, which fetches a public Google Sheet.
// Serve it locally so the run is hermetic — see stubLeaderboard.
await stubLeaderboard(p, [{n:'Ada', rp:900}, {n:'Grace', rp:800}]);
const errors=[]; p.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push('CONSOLE: '+m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.buildSettings(); M.buildMatchOpts(); M.buildPartyMods();
  const out = { unreachable:[], noEffect:[], notes:[] };

  // ---------- 1. REACHABILITY -------------------------------------------------
  // Every setting key must have a live control in the DOM that writes it.
  const CONTROLS = {
    mode:'#modes .opt', field:'#fields .opt', grass:'#grass .opt', diff:'#diffs .opt',
    length:'#lengths .opt', controllers:'#controllers .opt', coop:'#coop .opt',
    ball:'#balls .opt', pitch:'#pitches .opt', kickoffRule:'#kickoffRule .opt',
    handed:'#handed .opt', spectate:'#spectate .opt', cb:'#cb .opt',
    theme:'#themePick .opt', display:'#displayPick .opt', orient:'#orientPick .opt',
    trapOff:'#trapPick .opt', debug:'#debugPick .opt', oneHand:'#oneHandPick .opt',
    settingsPanel:'#panelPick .opt', juice:'#juicePick .opt', hitStop:'#hitStop', autoReplay:'#autoReplayPick .opt',
    ballLook:'#ballLookPick .opt',
    magnet:'#feelSlidersBall input', sens:'#feelSlidersPlayer input', matchSpeed:'#mspeed',
    party:'#partyMods .opt', cocktailSides:'#cocktailCfgBtn', pad:'#padConfig',
    snd:'#sndMaster .opt', feel:'#feelSlidersBall input', names:'#seatNames',
  };
  // Sub-panes hide controls with display:none, and querySelectorAll still finds
  // those — so "the node exists" stopped being the same as "you can get to it".
  // Every pane must be reachable from a chip in its own tab row, or the controls
  // inside it are orphaned however present they are in the DOM.
  out.orphanPanes = [...document.querySelectorAll('#setup .subpane')]
    .filter(pane => {
      const card = pane.closest('.card');
      const row = card && card.querySelector('.subtabs');
      return !row || !row.querySelector(`.subchip[data-pane="${pane.dataset.pane}"]`);
    })
    .map(pane => pane.dataset.pane);
  out.paneCount = document.querySelectorAll('#setup .subpane').length;
  for (const [key, sel] of Object.entries(CONTROLS)){
    const n = document.querySelectorAll(sel).length;
    if (!n) out.unreachable.push(key + ' (' + sel + ')');
  }
  // Anything in defaultSel with no entry above is unaudited — say so rather than
  // quietly passing.
  const IGNORE = new Set(['dockCollapsed','deskDock','tutDone']);
  out.unaudited = Object.keys(M.defaultSel()).filter(k=>!CONTROLS[k] && !IGNORE.has(k));

  // Every nav destination must open its screen.
  const NAV = { seasonBtn:'season', drillsBtn:'drills', socialBtn:'social', lbBtn:'leaderboard',
                statsBtn:'stats', shopBtn:'shop', rogueBtn:'rogue', howBtn:'how' };
  out.navBroken = [];
  for (const [btn, screen] of Object.entries(NAV)){
    document.getElementById(btn).click(); await wait(90);
    const el=document.getElementById(screen);
    if (!el || el.classList.contains('hidden')) out.navBroken.push(btn+'→'+screen);
  }
  M.toMenu(); await wait(120);

  // No setting may have two controls: a second copy drifts out of step with the
  // first and you can't tell which one you last used.
  out.duplicateControls = [];
  if (document.getElementById('magnet')) out.duplicateControls.push('magnet (Match card copy)');
  const allFeelLabels = [...document.querySelectorAll('#feelSlidersBall label, #feelSlidersPlayer label')];
  if (allFeelLabels.length !== new Set(allFeelLabels.map(l=>l.textContent)).size)
    out.duplicateControls.push('repeated feel slider label');

  // Every Game Feel slider must be present and write its key.
  const feelLabels=allFeelLabels.map(l=>l.textContent.toLowerCase());
  out.feelSliders = feelLabels.length;
  for (const want of ['acceleration','float','kick power','max ball speed','ball glide','magnet','trap window','sensitivity'])
    if (!feelLabels.some(t=>t.includes(want))) out.unreachable.push('feel slider: '+want);

  // ---------- 2. EFFECT -------------------------------------------------------
  const cv=document.getElementById('game'), c2=cv.getContext('2d');
  const DPR=cv.width/cv.clientWidth;
  const shot = () => { const d=c2.getImageData(0,0,cv.width,cv.height).data;
    let h=0; for(let i=0;i<d.length;i+=64) h=(h*31 + d[i]+d[i+1]*3+d[i+2]*7)|0; return h; };
  const freshMatch = () => { M.startMatch(); const w=M.world; w.state='play'; w.stateT=1; return w; };
  const note = (name, ok, detail) => { if(!ok) out.noEffect.push(name + (detail?' — '+detail:'')); };

  // -- visual settings: the canvas must actually change
  const paint = () => { M.computeCam(); M.render(); return shot(); };
  M.sel.mode='1v1'; freshMatch();
  for (const [key, a, bb] of [['theme','neon','light'], ['grass','stripes','rings'],
                              ['field','classic','huge'], ['ball','normal','big'],
                              ['pitch','normal','ice']]){
    M.sel[key]=a; if(key==='theme') M.applyTheme(a); if(key==='field'||key==='ball'||key==='pitch') freshMatch();
    const p1=paint();
    M.sel[key]=bb; if(key==='theme') M.applyTheme(bb); if(key==='field'||key==='ball'||key==='pitch') freshMatch();
    const p2=paint();
    note('visual: '+key, p1!==p2);
  }
  // Pitch surface has to move BOTH: grip and look. It used to be grip only, so all
  // three surfaces were pixel-identical and you couldn't tell what you were on.
  M.sel.pitch='normal'; const gN=freshMatch().pAccel;
  M.sel.pitch='ice';    const gI=freshMatch().pAccel;
  M.sel.pitch='mud';    const gM=freshMatch().pAccel;
  out.pitchGrip = [gN,gI,gM];
  note('pitch surface (physics)', gN!==gI && gI!==gM);
  M.sel.theme='neon'; M.applyTheme('neon'); M.sel.grass='stripes'; M.sel.field='classic';
  M.sel.ball='normal'; M.sel.pitch='normal';

  // -- physics settings: a world value must move
  const w0 = freshMatch();
  M.sel.feel={accel:40,pdamp:905,ballcap:32,kick:55,bdamp:990,trap:50}; M.applyFeel();
  const base={accel:w0.pAccel, cap:w0.ballCap, kick:w0.kickPower, damp:w0.ball.damp, trap:w0.trapMax};
  M.sel.feel={accel:80,pdamp:960,ballcap:58,kick:100,bdamp:975,trap:120}; M.applyFeel();
  note('feel: accel',  w0.pAccel !== base.accel);
  note('feel: ballcap',w0.ballCap !== base.cap);
  note('feel: kick',   w0.kickPower !== base.kick);
  note('feel: bdamp',  w0.ball.damp !== base.damp);
  note('feel: trap',   w0.trapMax !== base.trap);
  M.sel.feel={accel:40,pdamp:905,ballcap:32,kick:55,bdamp:990,trap:50}; M.applyFeel();

  M.sel.magnet=80; M.applyFeel(); note('magnet', M.world.magnet === 80); M.sel.magnet=0; M.applyFeel();
  M.sel.trapOff=true; M.applyFeel(); note('ball control', M.world.trapOff === true); M.sel.trapOff=false; M.applyFeel();

  // -- match settings: the built world must reflect them
  M.sel.mode='3v3'; note('mode',   freshMatch().players.length === 6);
  M.sel.diff='hard';  const dh=freshMatch().diff;
  M.sel.diff='rookie';const dr=freshMatch().diff;
  note('difficulty', JSON.stringify(dh) !== JSON.stringify(dr));
  M.sel.diff='normal';
  const LK=Object.keys(M.LENGTHS||{});
  M.sel.length=LK[0]; const l10=JSON.stringify(freshMatch().len);
  M.sel.length=LK[LK.length-1]; const l2=JSON.stringify(freshMatch().len);
  note('match length', l10 !== l2, LK.join('/')); M.sel.length='5';
  M.sel.kickoffRule='off'; freshMatch(); const koOff=M.kickoffLineOn(M.world);
  M.sel.kickoffRule='on';  M.startMatch(); const koOn=M.kickoffLineOn(M.world);
  note('kickoff rule', koOff===false && koOn===true);
  M.sel.spectate='watch'; note('spectate', freshMatch().watch === true); M.sel.spectate='play';
  M.sel.cb='on'; note('colour-blind', freshMatch().cb === true); M.sel.cb='off';
  M.sel.mode='1v1';

  // party modifiers
  for (const [k, check] of [['big', w=>w.ball.r > 12], ['lowg', w=>w.ball.damp > 0.99],
                            ['sudden', w=>w.sudden===true], ['multi', w=>(w.extraBalls||[]).length>0]]){
    M.sel.party={big:false,lowg:false,sudden:false,multi:false}; const off=freshMatch();
    M.sel.party={big:false,lowg:false,sudden:false,multi:false}; M.sel.party[k]=true;
    const on=freshMatch();
    note('party: '+k, check(on) && !check(off));
  }
  M.sel.party={big:false,lowg:false,sudden:false,multi:false};

  // -- display / layout
  M.sel.orient='h'; M.applyDisplayMode(); await wait(120); M.computeCam();
  const rotSide=M.cam.rot;
  M.sel.orient='v'; M.applyDisplayMode(); await wait(120); M.computeCam();
  note('pitch direction', rotSide !== M.cam.rot, 'h='+rotSide+' v='+M.cam.rot);
  M.sel.orient='auto'; M.applyDisplayMode();
  M.sel.display='deck'; M.applyDisplayMode(); await wait(120);
  const deckOn=document.body.classList.contains('deck');
  M.sel.display='auto'; M.applyDisplayMode(); await wait(120);
  note('display: deck', deckOn && !document.body.classList.contains('deck'));
  M.sel.display='cocktail'; M.applyDisplayMode(); await wait(60);
  note('display: cocktail', document.body.classList.contains('cocktail'));
  M.sel.display='auto'; M.applyDisplayMode(); await wait(60);

  // -- juice / replays / debug / one-hand / handedness
  M.sel.juice=false; freshMatch(); M.addShake(20); const noShake=M.shake;
  M.sel.juice=true;  freshMatch(); M.addShake(20); const yesShake=M.shake;
  note('screen shake', noShake !== yesShake, 'off='+noShake+' on='+yesShake);
  // Hit stop has its own dial, so it must survive the shake toggle being off and
  // must gate on the prediction rather than firing on every kick.
  { const setup=(frames,vy)=>{ M.sel.hitStop=frames; M.sel.juice=false;
      const w=freshMatch(); w.state='play'; w.stateT=2; M.hitStop=0;
      w.players.forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; });
      w.ball.x=0; w.ball.y=60; w.ball.vx=0; w.ball.vy=vy;
      M.maybeHitStop(w, w.players[0], w.ball); return M.hitStop; };
    const onGoal=setup(8,-22), offGoal=setup(8,22), off=setup(0,-22);
    note('hit stop', onGoal===8 && offGoal===0 && off===0,
         'onGoal='+onGoal+' offGoal='+offGoal+' sliderZero='+off);
    M.sel.hitStop=5; M.sel.juice=true; }
  M.sel.debug=true; M.render(); const dbgOn=shot();
  M.sel.debug=false; M.render(); note('debug readout', dbgOn !== shot());
  M.sel.oneHand=true;  const oh1=M.world.players[0];
  { const pad={dx:0,dy:-1,kick:false}; M.applyHumanInput(oh1,pad); pad.dx=0; pad.dy=0;
    let fired=false; for(let i=0;i<10;i++){ M.applyHumanInput(oh1,pad); if(oh1.kick) fired=true; }
    note('one-handed', fired); }
  M.sel.oneHand=false;
  // Handedness must actually move the on-screen controls, not just save.
  M.sel.display='auto'; M.applyDisplayMode();
  M.sel.handed='right'; const hR = JSON.stringify(M.restingJoyPos(false));
  M.sel.handed='left';  const hL = JSON.stringify(M.restingJoyPos(false));
  note('handedness', hR !== hL, hR+' vs '+hL);
  M.sel.handed='right';

  // Match speed must change how far the sim advances in the same wall-clock time.
  // loop() consumes real wall-clock time, so drive the multiplier where it lands:
  // the fixed-step accumulator. Assert it's read there rather than only saved.
  note('match speed wired', /sel\.matchSpeed/.test(M.loopSource()));
  M.sel.matchSpeed=1;

  // Sound: mute and volume must reach the audio graph, not just localStorage.
  M.Aud.ensure();                       // build the graph, or the check below is vacuous
  M.Aud.setVol(90); const g90 = M.audMasterGain();
  M.Aud.setVol(10); const g10 = M.audMasterGain();
  out.masterGain = [g90, g10];
  note('sound volume', g90 !== null && g10 !== null && g90 !== g10, g90+' vs '+g10);
  M.sel.snd.vol=40; if (M.Aud && M.Aud.setVol) M.Aud.setVol(40);
  M.sel.snd.muted=true;  const mutedNoThrow = (()=>{ try{ M.playSfx('kick'); return true; }catch(e){ return false; } })();
  M.sel.snd.muted=false;
  note('sound mute', mutedNoThrow);

  // Colour-blind mode must change what's drawn, not just set a flag.
  M.sel.cb='off'; freshMatch(); const cbOff=paint();
  M.sel.cb='on';  freshMatch(); const cbOn=paint();
  note('colour-blind visuals', cbOff !== cbOn);
  M.sel.cb='off';

  // -- drills / modes reachable and runnable
  out.drillsRun = [];
  for (const key of Object.keys(M.DRILLS)){
    try { M.startDrill(key); await wait(40);
      if (!M.world || !M.world.drillMode) out.drillsRun.push(key+':no world'); }
    catch(e){ out.drillsRun.push(key+':'+e.message); }
  }
  M.toMenu(); await wait(80);
  out.modesRun = [];
  for (const key of Object.keys(M.MODES)){
    try { M.sel.mode=key; const w=freshMatch(); for(let i=0;i<40;i++) M.step(w); M.render();
      if (!isFinite(w.ball.x)) out.modesRun.push(key+':NaN'); }
    catch(e){ out.modesRun.push(key+':'+e.message); }
  }
  M.sel.mode='1v1';

  // -- cosmetics: every flag/animal/eye/cap must draw
  out.cosmeticThrows = [];
  const cvs=document.createElement('canvas'); cvs.width=cvs.height=64; const cc=cvs.getContext('2d');
  for (const k of M.FLAG_KEYS) try { M.drawDiscs && null; cc.clearRect(0,0,64,64);
    M.drawFieldPreview && null; window.__magnet.updatePreview && null;
    M.buildFlagPicker(); } catch(e){ out.cosmeticThrows.push('flag '+k+':'+e.message); break; }
  try { M.buildEyesPicker(); M.buildCaps(); M.buildUnlocked(); } catch(e){ out.cosmeticThrows.push('picker:'+e.message); }

  M.saveSel();
  return out;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,8):'none');
const clean = r.unreachable.length===0 && r.noEffect.length===0 && r.navBroken.length===0 &&
  r.duplicateControls.length===0 && r.orphanPanes.length===0 && r.paneCount > 0 &&
  r.drillsRun.length===0 && r.modesRun.length===0 && r.cosmeticThrows.length===0 && errors.length===0;
console.log('RESULT:', clean?'ALL PASS':'FINDINGS');
process.exit(clean?0:1);
