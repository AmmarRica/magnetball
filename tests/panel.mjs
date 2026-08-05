// /settings route: same settings UI, no game, live two-way sync with the game tab.
// Served over http — BroadcastChannel between two file:// pages never delivers,
// because each file:// document is its own opaque origin.
import { chromium, LAUNCH } from './_browser.mjs';
import { serve } from './_serve.mjs';

const srv = await serve(process.cwd());
const b = await chromium.launch(LAUNCH);
const ctx = await b.newContext({ viewport:{width:1100,height:900} });
const errors=[];
ctx.on('page', pg=>{
  pg.on('pageerror', e=>errors.push('PAGEERROR: '+e.message));
  pg.on('console', m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push('CONSOLE: '+m.text()); });
});
await ctx.addInitScript(()=>{ window.__MAGNETDEBUG = true; });

const game = await ctx.newPage();
await game.goto(srv.url + '/index.html');
await game.waitForTimeout(700);
await game.evaluate(()=>{ const d=document.getElementById('dmCollect'); if(d) d.click(); });

const o = {};
const wait = ms => new Promise(r=>setTimeout(r,ms));
// Poll rather than sleep: the receiving tab is backgrounded, so anything it defers
// to a frame lands on Chrome's throttled schedule and a fixed sleep is a coin flip.
async function until(pg, fn, ms=4000){
  const t0=Date.now();
  for(;;){ if (await pg.evaluate(fn)) return true;
    if (Date.now()-t0 > ms) return false; await wait(50); }
}

// The game tab holds a value that was never written to localStorage. If the panel
// shows it, the snapshot can only have come over the channel.
await game.evaluate(()=>{
  const M=window.__magnet;
  M.applyBundle('neon'); M.sel.grass='stripes'; M.sel.settingsPanel='inline'; M.saveSel();
  M.sel.look.palette='gba';                // in memory ONLY — no saveSel
});

const panel = await ctx.newPage();
await panel.goto(srv.url + '/settings/');
await panel.waitForTimeout(900);

// --- The route really is the panel, and really is the same document
o.panelFlag       = await panel.evaluate(()=>window.__magnet.PANEL === true);
o.panelHasBodyCls = await panel.evaluate(()=>document.body.classList.contains('panel'));
o.gameNotPanel    = await game.evaluate(()=>window.__magnet.PANEL === false);
o.panelHidesCanvas = await panel.evaluate(()=>{
  const c=document.getElementById('game'); return !c || getComputedStyle(c).display === 'none'; });
o.panelRunsNoGame = await panel.evaluate(()=>window.__magnet.world === null);
o.panelHidesPlay  = await panel.evaluate(()=>getComputedStyle(document.getElementById('playBtn')).display === 'none');

// --- Nothing covers the panel. The daily-reward modal (z-index 40) used to open
// here and eat every click: the game clears it when a match starts, and the panel
// never starts one. Hit-test the middle of the page rather than trusting a class.
o.dailyModalClosed = await panel.evaluate(()=>{
  const dm=document.getElementById('dailyModal');
  return !dm || dm.classList.contains('hidden'); });
o.panelIsClickable = await panel.evaluate(()=>{
  const el=document.elementFromPoint(innerWidth/2, innerHeight/2);
  return !!el && !!el.closest('#setup'); });

// --- Snapshot on open: the panel adopted the game's in-memory theme
o.snapshotAdopted = await panel.evaluate(()=>window.__magnet.sel.look.palette === 'gba');
o.snapshotNotFromStorage = await panel.evaluate(()=>
  (JSON.parse(localStorage.getItem('magnetball.sel')||'{}').look||{}).palette !== 'gba' ||
  window.__magnet.syncPeerLive() === true);

// --- The page can actually be SCROLLED to the bottom.
// ⚠️ It could not. html/body lock scrolling down so the game canvas can never be
// scrolled off screen (overflow:hidden, height:100%, touch-action:none), and in panel
// mode #setup is position:static — so it grew to its full content height and NOTHING
// scrolled. Everything past the first viewport was unreachable, on a page that is
// nothing but a long stack of settings cards. Checked on a phone viewport too,
// because touch-action:none blocks a swipe even where overflow would allow it.
const scrollCheck = async (pg) => pg.evaluate(async ()=>{
  const d = document.documentElement;
  window.scrollTo(0, 0); await new Promise(r=>setTimeout(r,60));
  const tall = d.scrollHeight > d.clientHeight + 40;      // there IS something below
  window.scrollTo(0, 99999); await new Promise(r=>setTimeout(r,220));
  const moved = window.scrollY;
  const cards = [...document.querySelectorAll('#setup .card.collapsible')];
  const last = cards[cards.length-1];
  const rect = last.getBoundingClientRect();
  return { tall, moved, reachedBottom: rect.top < innerHeight && rect.bottom > -2,
           lastSec: last.dataset.sec, docH: d.scrollHeight,
           touchAction: getComputedStyle(d).touchAction,
           overflow: getComputedStyle(d).overflow };
});
o.scrollDesktop = await scrollCheck(panel);
const phone = await ctx.newPage();
await phone.setViewportSize({ width: 390, height: 844 });
await phone.goto(srv.url + '/settings/');
await phone.waitForTimeout(900);
o.scrollPhone = await scrollCheck(phone);
await phone.close();
o.panelScrolls = o.scrollDesktop.tall && o.scrollDesktop.moved > 100 && o.scrollDesktop.reachedBottom;
o.panelScrollsOnPhone = o.scrollPhone.tall && o.scrollPhone.moved > 100 && o.scrollPhone.reachedBottom;
o.touchNotBlocked = o.scrollPhone.touchAction !== 'none';
// ...and the GAME page must still be locked down, or its canvas scrolls away.
o.gameStillLocked = await game.evaluate(()=>{
  const d=document.documentElement, cs=getComputedStyle(d);
  return cs.overflow === 'hidden' && cs.touchAction === 'none' &&
         !d.classList.contains('panelroute'); });
await panel.evaluate(()=>window.scrollTo(0,0));

// --- Identical settings UI: same cards, same structure, in the same order
const cardSig = pg => pg.evaluate(()=>[...document.querySelectorAll('#setup .card.collapsible')]
  .map(c=>c.dataset.sec + ':' + c.querySelector('h2').textContent.trim() +
         ':' + c.querySelectorAll('label.field').length +
         ':' + c.querySelectorAll('.opts').length +
         ':' + c.querySelectorAll('input.slider').length));
const gs = await cardSig(game), ps = await cardSig(panel);
o.gameCards = gs.length; o.panelCards = ps.length;
o.cardsIdentical = gs.length > 5 && JSON.stringify(gs) === JSON.stringify(ps);
// ...and they render the same, not just the same markup. Put both on one theme
// first: they're mid-sync here, and two different palettes SHOULD look different.
await game.evaluate(()=>{ const M=window.__magnet; M.applyBundle('neon'); M.saveSel(); });
await until(panel, ()=>window.__magnet.sel.look.palette === 'neon');
const feelStyle = pg => pg.evaluate(()=>{
  const c=document.querySelector('#setup .card.collapsible[data-sec="feel"]');
  c.classList.remove('collapsed');
  const s=getComputedStyle(c), o2=getComputedStyle(c.querySelector('h2'));
  return [s.borderRadius, s.backgroundColor, o2.fontFamily, o2.fontSize].join('|'); });
o.stylesIdentical = (await feelStyle(game)) === (await feelStyle(panel));

// --- Panel → game, instantly
// The theme NAMED "Paper" has the key 'light' — assert the key the code really uses.
await panel.evaluate(()=>{
  const tiles=[...document.querySelectorAll('#themePick .opt')];
  tiles.find(t=>/paper/i.test(t.textContent)).click();
});
o.panelPickedLight = await panel.evaluate(()=>window.__magnet.sel.look.palette === 'light');
o.panelToGame = await until(game, ()=>window.__magnet.sel.look.palette === 'light');
o.panelToGameApplied = await until(game, ()=>
  [...document.querySelectorAll('#themePick .opt')].some(t=>t.classList.contains('sel') && /paper/i.test(t.textContent)));
// Applied for real, not just recorded: the palette moved on BOTH pages, and it is
// the light theme's accent — not whatever neon happened to be.
const accent = pg => pg.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
const lightAccent = await panel.evaluate(()=>window.__magnet.THEMES.light.ui.accent.toLowerCase());
const neonAccent  = await panel.evaluate(()=>window.__magnet.THEMES.neon.ui.accent.toLowerCase());
const gAcc = (await accent(game)).toLowerCase(), pAcc = (await accent(panel)).toLowerCase();
o.accents = gAcc + ' / ' + pAcc + ' (light ' + lightAccent + ', neon ' + neonAccent + ')';
o.panelToGameThemed = gAcc === lightAccent && pAcc === lightAccent && lightAccent !== neonAccent;

// --- Game → panel, instantly
await game.evaluate(()=>{
  const tiles=[...document.querySelectorAll('#grass .opt')];
  tiles.find(t=>/rings/i.test(t.textContent)).click();
});
o.gameToPanel = await until(panel, ()=>window.__magnet.sel.grass === 'rings');
o.gameToPanelApplied = await until(panel, ()=>
  [...document.querySelectorAll('#grass .opt')].some(t=>t.classList.contains('sel') && /rings/i.test(t.textContent)));

// --- A slider streams across too (the value that lands is the one that stuck)
await panel.evaluate(()=>{
  const labels=[...document.querySelectorAll('#feelSlidersBall label, #feelSlidersPlayer label')].map(l=>l.textContent);
  const i=labels.findIndex(t=>/kick power/i.test(t));
  const inp=[...document.querySelectorAll('#feelSlidersBall input, #feelSlidersPlayer input')][i];
  inp.value=95; inp.oninput();
});
o.sliderCrosses = await until(game, ()=>window.__magnet.sel.feel.kick === 95);
o.sliderApplied = await game.evaluate(()=>{ const M=window.__magnet;
  return !M.world || Math.abs(M.world.kickPower - 9.5) < 1e-6; });

// --- Telemetry: the panel's debug readout is fed by the running match
await game.evaluate(()=>{ const M=window.__magnet; M.sel.mode='1v1'; M.startMatch();
  const w=M.world; w.state='play'; w.stateT=1; w.ball.vx=9; w.ball.vy=-4; });
o.telemetryShows = await until(panel, ()=>{
  const t=document.getElementById('panelTel').textContent;
  return /ball\s+[\d.]+/.test(t) && /magnet/.test(t); });
o.telemetryState = await until(panel, ()=>document.getElementById('panelState').textContent === 'connected');

// --- Detached: the game page hides the cards, the panel keeps them, game still runs
await panel.evaluate(()=>{
  [...document.querySelectorAll('#panelPick .opt')].find(t=>/separate/i.test(t.textContent)).click(); });
o.gameHidesCards = await until(game, ()=>
  getComputedStyle(document.querySelector('#setup .card.collapsible[data-sec="feel"]')).display === 'none');
o.panelKeepsCards = await panel.evaluate(()=>{
  const c=document.querySelector('#setup .card.collapsible[data-sec="feel"]');
  return getComputedStyle(c).display !== 'none'; });
o.escapeHatchShown = await until(game, ()=>
  getComputedStyle(document.getElementById('detachedCard')).display !== 'none');
o.gameStillRuns = await game.evaluate(()=>{ const M=window.__magnet, w=M.world;
  const x0=w.ball.x, y0=w.ball.y; for(let i=0;i<30;i++) M.step(w);
  return isFinite(w.ball.x) && (w.ball.x!==x0 || w.ball.y!==y0); });

// --- ...and inline mode still works exactly as before
await game.evaluate(()=>document.getElementById('inlinePanelBtn').click());
o.inlineRestores = await until(game, ()=>
  getComputedStyle(document.querySelector('#setup .card.collapsible[data-sec="feel"]')).display !== 'none' &&
  getComputedStyle(document.getElementById('detachedCard')).display === 'none');
o.inlineReachedPanel = await until(panel, ()=>window.__magnet.sel.settingsPanel === 'inline');

// --- No echo storm: one change must not ping-pong forever
const settle = async () => {
  await game.evaluate(()=>{ window.__c=0; const bc=window.__magnet.bc;
    const prev=bc.onmessage; bc.onmessage=(e)=>{ window.__c++; prev(e); }; });
  await panel.evaluate(()=>{ const t=[...document.querySelectorAll('#themePick .opt')]
    .find(x=>/mono/i.test(x.textContent)) || [...document.querySelectorAll('#themePick .opt')][0]; t.click(); });
  await wait(700);
  return game.evaluate(()=>window.__c);
};
o.messagesForOneChange = await settle();
o.noEchoStorm = o.messagesForOneChange > 0 && o.messagesForOneChange < 12;

// --- Both of today's changes, exercised across the two tabs together:
//     a match running in the game tab while the panel drives it.
await game.evaluate(()=>{ const M=window.__magnet;
  M.profile.cap='crown'; M.profile.flag='none'; M.profile.color='#46d17a'; M.saveProfile();
  M.sel.spectate='play'; M.sel.controllers='off'; M.sel.display='auto'; M.applyDisplayMode();
  M.sel.mode='2v2'; M.startMatch(); const w=M.world; w.state='play'; w.stateT=1; });
o.tabSeesMatch = await until(panel, ()=>/2 ?v ?2/i.test(document.getElementById('panelTel').textContent));
// Bots are NOT wearing your face, and the panel can prove it from the telemetry-fed side
o.crossTabBotLooks = await game.evaluate(()=>{ const ps=window.__magnet.world.players;
  const you=ps.find(q=>q.ctrl==='human1');
  const key=q=>[q.flag,q.cap,q.eyes,q.color].join('|');
  return ps.filter(q=>q!==you).every(q=>key(q)!==key(you)); });
// A feel change made in the panel reaches the LIVE match, not just the next one
await panel.evaluate(()=>{
  const labels=[...document.querySelectorAll('#feelSlidersBall label, #feelSlidersPlayer label')].map(l=>l.textContent);
  const i=labels.findIndex(t=>/max ball speed/i.test(t));
  const inp=[...document.querySelectorAll('#feelSlidersBall input, #feelSlidersPlayer input')][i];
  inp.value=58; inp.oninput(); });
o.panelDrivesLiveMatch = await until(game, ()=>window.__magnet.world.ballCap === 58);
// Switching the game to cocktail FROM THE PANEL takes the keyboard off the pitch
await panel.evaluate(()=>{
  [...document.querySelectorAll('#displayPick .opt')].find(t=>/cocktail/i.test(t.textContent)).click(); });
o.panelSetsCocktail = await until(game, ()=>window.__magnet.sel.display === 'cocktail');
o.cocktailKeysDeadCrossTab = await game.evaluate(()=>{ const M=window.__magnet;
  M.pads.p1.dx=0; M.pads.p1.dy=0; M.pollKeys(); return M.pads.p1.dx===0 && M.pads.p1.dy===0; });
await panel.evaluate(()=>{
  [...document.querySelectorAll('#displayPick .opt')].find(t=>/auto/i.test(t.textContent)).click(); });
o.backToAuto = await until(game, ()=>window.__magnet.sel.display === 'auto');
o.matchSurvivedItAll = await game.evaluate(()=>{ const M=window.__magnet, w=M.world;
  for(let i=0;i<60;i++) M.step(w);
  return isFinite(w.ball.x) && isFinite(w.ball.y) && w.players.every(q=>isFinite(q.x)); });

// --- Liveness: nothing travels while you aren't changing things, so without a
// heartbeat the panel goes quiet and claims the game tab is gone. Idle past the
// 4s liveness window and check it's still honest.
const telAt = () => panel.evaluate(()=>document.getElementById('panelTel').textContent);
const before = await telAt();
await wait(7000);
o.stillConnectedIdle = await panel.evaluate(()=>
  document.getElementById('panelState').textContent === 'connected');
o.readoutStillLive = (await telAt()) !== before || /ball/.test(await telAt());
// and the game is still hearing from it
o.heartbeatReaches = await game.evaluate(()=>window.__magnet.syncPeerLive() === true);

// --- Window-local state must NOT cross: whether THIS window's dock is collapsed
// says nothing about the other one.
await game.evaluate(()=>{ const M=window.__magnet; M.sel.dockCollapsed=false; M.saveSel(); });
await panel.evaluate(()=>{ const M=window.__magnet; M.sel.dockCollapsed=true; M.saveSel(); });
await wait(500);
o.dockStateStaysLocal = await game.evaluate(()=>window.__magnet.sel.dockCollapsed === false);

// --- Back out of any sub-page the cocktail step opened (picking Cocktail for the
// first time jumps to the sides config — the same as it does inline).
o.subPageHasWayBack = await panel.evaluate(async ()=>{
  const cfg=document.getElementById('cocktailCfg');
  if (!cfg || cfg.classList.contains('hidden')) return true;      // never left settings
  document.getElementById('cocktailBack').click();
  await new Promise(r=>setTimeout(r,200));
  return !document.getElementById('setup').classList.contains('hidden'); });

// --- Deck layout docks the menu beside the pitch; the panel has no pitch, so it
// must stay full width instead of shrinking to a 372px strip.
await panel.evaluate(()=>{
  [...document.querySelectorAll('#displayPick .opt')].find(t=>/deck/i.test(t.textContent)).click(); });
await wait(600);
// Assert the rendered result, not the class: some route paths legitimately add
// `docked`, and panel mode's job is to neutralise it, not to prevent it.
o.panelDeckWidth = await panel.evaluate(()=>document.getElementById('setup').getBoundingClientRect().width);
o.panelNotDockedOnDeck = o.panelDeckWidth > 700;
await panel.evaluate(()=>{
  [...document.querySelectorAll('#displayPick .opt')].find(t=>/auto/i.test(t.textContent)).click(); });
await wait(400);

// --- With no game tab at all the panel still opens on the saved settings, and
// says so rather than pretending it's connected.
await game.close();
await wait(300);
const lone = await ctx.newPage();
await lone.goto(srv.url + '/settings/');
await lone.waitForTimeout(800);
o.loneOpens = await lone.evaluate(()=>[...document.querySelectorAll('#setup .card.collapsible')].length > 5);
o.loneNotBlank = await lone.evaluate(()=>window.__magnet.sel.grass === 'rings');   // from localStorage
o.loneSaysWaiting = await lone.evaluate(()=>/waiting/i.test(document.getElementById('panelState').textContent));

console.log(JSON.stringify(o,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = o.panelFlag && o.panelHasBodyCls && o.gameNotPanel && o.panelHidesCanvas &&
  o.panelRunsNoGame && o.panelHidesPlay && o.snapshotAdopted && o.snapshotNotFromStorage &&
  o.cardsIdentical && o.stylesIdentical &&
  o.panelToGame && o.panelToGameApplied && o.gameToPanel && o.gameToPanelApplied &&
  o.sliderCrosses && o.sliderApplied && o.telemetryShows && o.telemetryState &&
  o.gameHidesCards && o.panelKeepsCards && o.escapeHatchShown && o.gameStillRuns &&
  o.inlineRestores && o.inlineReachedPanel && o.noEchoStorm &&
  o.panelToGameThemed && o.loneOpens && o.loneNotBlank && o.loneSaysWaiting &&
  o.tabSeesMatch && o.crossTabBotLooks && o.panelDrivesLiveMatch && o.panelSetsCocktail &&
  o.cocktailKeysDeadCrossTab && o.backToAuto && o.matchSurvivedItAll &&
  o.stillConnectedIdle && o.readoutStillLive && o.heartbeatReaches &&
  o.dailyModalClosed && o.panelIsClickable && o.subPageHasWayBack &&
  o.dockStateStaysLocal && o.panelNotDockedOnDeck &&
  o.panelScrolls && o.panelScrollsOnPhone && o.touchNotBlocked && o.gameStillLocked &&
  errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(o).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); await srv.close(); process.exit(ok?0:1);
