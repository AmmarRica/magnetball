// THE REAL-PATH SWEEP — run by hand, not by the pool (the leading underscore keeps
// `run.mjs` away from it):
//
//   PLAYWRIGHT_MODULE=... node tests/_sweep.mjs [desktop|phone|both] [step,filter]
//
// It drives the page the way a player does — a click is `elementFromPoint` at the button's
// centre, the loop is the real rAF loop, time is the wall clock — and watches for the things
// the hook-driven suites cannot see: a state that never arrives, a promise that never
// settles, a sim that stops ticking while it should be running, an uncaught error, a modal
// parked over the controls, a control drawn off the screen. Every wait has a deadline and a
// stall watchdog; every finding is a sentence with a number. It takes about four minutes a
// viewport, most of it real replays and real exports, which is why it is not a suite.
// ⚠️ It found the "Watch goal freezes the game" hang that 147 suites had passed over, because
// every one of them reached the transport with `.click()` — see CLAUDE.md.
// ⚠️ Two of its findings are by design and are printed as notes, not findings: on a desktop
// the HUD corners peek on hover (it hovers first), and Main Menu from the pause screen keeps
// the match paused beside the open dock (the pause screen returns when the dock closes).
import { chromium, LAUNCH, stubLeaderboard } from './_browser.mjs';

const ROOT = process.cwd();
const URL_ = 'file://' + ROOT + '/index.html';
const findings = [];
const notes = [];
const F = (scenario, detail) => { findings.push({ scenario, detail }); console.log('  FINDING  [' + scenario + '] ' + detail); };
const N = (s) => { notes.push(s); console.log('  ok  ' + s); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function newPage(browser, phone){
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + (e && e.message || e) + ' @ ' + String(e && e.stack || '').split('\n').slice(1,3).join(' | ').replace(/file:\/\/\S*index\.html/g,'index.html')));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  await page.addInitScript(() => {
    window.__MAGNETDEBUG = true;
    window.__unh = []; window.__dl = []; window.__gaps = { max: 0, n: 0, over: 0 };
    window.addEventListener('unhandledrejection', e => window.__unh.push(String(e.reason && e.reason.stack || e.reason)));
    const oc = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){
      if (this.download){ window.__dl.push({ name: this.download, href: this.href, t: performance.now() }); return; }
      return oc.call(this);
    };
    // rAF gap sampler: a synchronous hang shows as one long gap, a stall as many.
    let last = 0;
    const f = (t) => { if (last){ const g = t - last; if (g > window.__gaps.max) window.__gaps.max = g; if (g > 250) window.__gaps.over++; window.__gaps.n++; } last = t; requestAnimationFrame(f); };
    requestAnimationFrame(f);
    try { localStorage.clear(); } catch {}
  });
  await stubLeaderboard(page);
  await page.route(/online\.json$/, r => r.fulfill({ status: 404, body: '' }));
  return { ctx, page, errs };
}

const SNAP = `(() => {
  const M = window.__magnet; const w = M.world; const r = M.replay;
  const vis = id => { const el = document.getElementById(id); if (!el) return null; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.classList.contains('hidden'); };
  return {
    running: M.running, paused: M.paused, state: w ? w.state : null, demo: w ? !!w.demo : null,
    aiTick: w ? (w.aiTick|0) : -1, timeLeft: w && typeof w.timeLeft === 'number' ? +w.timeLeft.toFixed(2) : null, score: w && Array.isArray(w.score) ? w.score.slice() : null,
    drillEl: w && w.drill && typeof w.drill.elapsed === 'number' ? +w.drill.elapsed.toFixed(2) : null,
    replayActive: !!r.active, replayControls: !!r.controls, replayFilming: !!r.filming, replayEnded: !!r.ended,
    setup: vis('setup'), overlay: vis('overlay'), ovTitle: (document.getElementById('ovTitle')||{}).textContent,
    repCtl: vis('repCtl'), repRec: vis('repRec'), hud: vis('hud'),
    modals: ['updModal','updBlock','resumeModal','newsModal','dailyModal'].filter(vis),
    unh: window.__unh.length, dl: window.__dl.length, gaps: window.__gaps,
  };
})()`;
const snap = (page) => page.evaluate(SNAP);

// Wait for a page-side predicate; while waiting, watch for a sim that should be ticking
// and is not. Returns elapsed ms or a string naming what went wrong.
async function until(page, name, pred, ms, opts = {}){
  const t0 = Date.now();
  let lastTick = -1, stillSince = null;
  while (Date.now() - t0 < ms){
    const s = await snap(page);
    const ok = await page.evaluate(pred);
    if (ok) return Date.now() - t0;
    if (opts.live){
      const live = s.running && !s.paused && !s.replayActive && !s.replayFilming && (s.state === 'play' || s.state === 'kickoff' || s.state === 'goal' || s.state === 'warmup');
      if (live && s.aiTick === lastTick){ if (stillSince == null) stillSince = Date.now(); else if (Date.now() - stillSince > 1500) return 'STALL: sim not ticking for 1.5s in state ' + s.state + ' (aiTick ' + s.aiTick + ')'; }
      else stillSince = null;
      lastTick = s.aiTick;
    }
    await sleep(80);
  }
  const s = await snap(page);
  return 'TIMEOUT ' + ms + 'ms waiting for ' + name + ' — ' + JSON.stringify(s);
}

// Hit-test a control and click its centre the way a finger does. Returns null on success
// or a sentence.
async function press(page, sel, label, retried){
  const r = await page.evaluate((sel) => {
    let el = null;
    if (sel.startsWith('text=')){
      const t = sel.slice(5);
      el = [...document.querySelectorAll('button, .navtile, a')].find(b => b.textContent.trim().includes(t) && b.offsetParent !== null);
    } else el = document.querySelector(sel);
    if (!el) return { err: 'no such element ' + sel };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return { err: sel + ' has no box (' + b.width + 'x' + b.height + ')' };
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || !(hit === el || el.contains(hit))) return { err: sel + ' centre (' + cx.toFixed(0) + ',' + cy.toFixed(0) + ') is covered by ' + (hit ? (hit.id ? '#' + hit.id : hit.tagName + '.' + hit.className) : 'nothing') };
    return { cx, cy };
  }, sel);
  if (!retried && r.err && /covered by/.test(r.err) && /pauseBtn|muteBtn|fsHudBtn/.test(sel)){
    // the HUD corners peek on hover (HUDPEEK) — a person moves the mouse there first
    const b = await page.evaluate((sel) => { const e = document.querySelector(sel).getBoundingClientRect(); return { x: e.left + e.width/2, y: e.top + e.height/2 }; }, sel);
    await page.mouse.move(b.x, b.y); await sleep(400);
    return press(page, sel, label, true);
  }
  if (r.err) return (label || sel) + ': ' + r.err;
  await page.mouse.click(r.cx, r.cy);
  return null;
}

async function errsSince(page, errs, mark){
  const unh = await page.evaluate(() => window.__unh.splice(0));
  const list = errs.splice(mark).concat(unh.map(u => 'unhandledrejection: ' + u.slice(0, 200)));
  return list.filter(l => !/favicon|online\.json|net::ERR_FILE_NOT_FOUND.*assets|Failed to load resource/.test(l));
}

async function scoreGoal(page){
  // Put the ball in front of the goal team 0 attacks, rolling in, and let the REAL loop see it cross.
  return page.evaluate(() => {
    const M = window.__magnet; const w = M.world; const b = w.ball;
    const dir = (w.players.find(p => p.team === 0) || {}).attackDir || w.attackDir || -1;
    const hl = w.bounds.halfL;
    // aim at the far goal: y = dir * halfL. Trust the sign the world gives; if unknown, try -halfL.
    const sgn = typeof dir === 'number' && dir !== 0 ? Math.sign(dir) : -1;
    b.x = 0; b.y = sgn * (hl - 40); b.vx = 0; b.vy = sgn * 25; b._px = b.x; b._py = b.y;
    return { sgn, hl };
  });
}

async function run(phone){
  const tag = phone ? 'phone' : 'desktop';
  console.log('\n=== ' + tag + ' ===');
  const browser = await chromium.launch(LAUNCH);
  const { page, errs } = await newPage(browser, phone);
  let mark = 0;
  const check = async (scenario) => { const e = await errsSince(page, errs, mark); mark = 0; for (const l of e) F(scenario, l); };
  const only = (process.argv[3] || '').split(',').filter(Boolean);
  const step = async (scenario, fn) => {
    if (only.length && !only.some(o => scenario.includes(o))) return;
    console.log('- ' + scenario);
    try { await fn(); } catch (e){ F(scenario, 'harness threw: ' + (e && e.message || e).toString().slice(0, 300)); }
    await check(scenario);
  };

  await page.goto(URL_);
  await step('boot', async () => {
    const r = await until(page, 'menu', () => !!window.__magnet && !document.getElementById('setup').classList.contains('hidden'), 8000);
    if (typeof r === 'string') return F('boot', r);
    const s = await snap(page);
    if (s.modals.length) F('boot', 'modal over the menu on a fresh boot: ' + s.modals.join(','));
    N('menu up in ' + r + 'ms; demo=' + s.demo + ' running=' + s.running);
    const e = await press(page, '#playBtn', 'KICK OFF'); if (e) F('boot', e);
  });

  await step('kickoff→play', async () => {
    let r = await until(page, 'kickoff', () => { const w = window.__magnet.world; return w && !w.demo && (w.state === 'kickoff' || w.state === 'play'); }, 6000, { live: true });
    if (typeof r === 'string') return F('kickoff', r);
    r = await until(page, 'play', () => { const w = window.__magnet.world; return w && !w.demo && w.state === 'play'; }, 12000, { live: true });
    if (typeof r === 'string') return F('play', r);
    const a = await snap(page); await sleep(2000); const b = await snap(page);
    const dt = b.aiTick - a.aiTick;
    if (dt < 60) F('play', 'sim advanced only ' + dt + ' steps in 2s of wall clock (expected ~120)');
    else N('play reached in ' + r + 'ms; ' + dt + ' steps in 2s; timeLeft ' + b.timeLeft);
  });

  await step('pause/resume', async () => {
    const e = await press(page, '#pauseBtn', 'HUD pause'); if (e) return F('pause', e);
    let r = await until(page, 'paused', () => window.__magnet.paused && getComputedStyle(document.getElementById('overlay')).display !== 'none', 3000);
    if (typeof r === 'string') return F('pause', r);
    const a = await snap(page); await sleep(600); const b = await snap(page);
    if (b.aiTick !== a.aiTick) F('pause', 'sim kept ticking while paused: +' + (b.aiTick - a.aiTick));
    const e2 = await press(page, '#ovResume', 'Resume'); if (e2) return F('resume', e2);
    r = await until(page, 'unpaused', () => !window.__magnet.paused, 3000, { live: true });
    if (typeof r === 'string') return F('resume', r);
    const c = await snap(page); await sleep(800); const d = await snap(page);
    if (d.aiTick - c.aiTick < 20) F('resume', 'sim did not resume: +' + (d.aiTick - c.aiTick) + ' steps in 0.8s');
    else N('pause froze the sim, resume restarted it (+' + (d.aiTick - c.aiTick) + ' in 0.8s)');
  });

  await step('goal → auto-replay → kickoff', async () => {
    const g = await scoreGoal(page);
    let r = await until(page, 'goal state', () => window.__magnet.world.state === 'goal', 6000, { live: true });
    if (typeof r === 'string'){ const s = await snap(page); return F('goal', r + ' (ball aimed sgn=' + g.sgn + ', score ' + JSON.stringify(s.score) + ')'); }
    N('goal in ' + r + 'ms');
    r = await until(page, 'auto-replay starts', () => window.__magnet.replay.active, 6000);
    if (typeof r === 'string'){ F('autoreplay', 'no auto-replay fired on the first goal (Best goals default): ' + r); }
    else {
      N('auto-replay started ' + r + 'ms after the goal');
      r = await until(page, 'auto-replay ends', () => !window.__magnet.replay.active, 20000);
      if (typeof r === 'string') return F('autoreplay', 'replay never ended: ' + r);
      N('auto-replay ended after ' + r + 'ms');
    }
    r = await until(page, 'back to kickoff/play', () => { const w = window.__magnet.world; return w.state === 'kickoff' || w.state === 'play'; }, 10000, { live: true });
    if (typeof r === 'string') return F('autoreplay', 'never returned to kickoff: ' + r);
    N('kickoff again ' + r + 'ms later');
  });

  await step('goal, then Main Menu mid-replay, then kick off again', async () => {
    let r = await until(page, 'play', () => window.__magnet.world.state === 'play', 12000, { live: true });
    if (typeof r === 'string') return F('midreplay', r);
    await scoreGoal(page);
    r = await until(page, 'goal', () => window.__magnet.world.state === 'goal', 6000, { live: true });
    if (typeof r === 'string') return F('midreplay', 'no second goal: ' + r);
    r = await until(page, 'replay', () => window.__magnet.replay.active, 6000);
    if (typeof r === 'string'){ N('second goal did not auto-replay (not notable): ' + r.slice(0, 40)); }
    // pause during whatever is on screen, then leave
    const e = await press(page, '#pauseBtn', 'pause during celebration');
    if (e) F('midreplay', e);
    else {
      r = await until(page, 'overlay', () => window.__magnet.paused, 3000);
      if (typeof r === 'string') F('midreplay', 'pause during replay did nothing: ' + r);
      else {
        const e2 = await press(page, '#ovMenu', 'Main Menu'); if (e2) F('midreplay', e2);
      }
    }
    r = await until(page, 'menu', () => !document.getElementById('setup').classList.contains('hidden') && !window.__magnet.replay.active, 8000);
    if (typeof r === 'string') return F('midreplay', 'menu did not come back: ' + r);
    const s = await snap(page);
    N('back on the menu ' + r + 'ms; replayActive=' + s.replayActive + ' demo=' + s.demo + ' running=' + s.running + ' paused=' + s.paused + ' state=' + s.state);
    if (s.paused && !s.overlay) N('Main Menu keeps the match paused beside the open dock (state ' + s.state + '); the pause screen returns when the dock closes — by design');
    await sleep(500);
    const e3 = await press(page, '#playBtn', 'KICK OFF'); if (e3) return F('midreplay', e3);
    r = await until(page, 'new match', () => { const w = window.__magnet.world; return w && !w.demo && (w.state === 'kickoff' || w.state === 'play'); }, 6000, { live: true });
    if (typeof r === 'string') return F('midreplay', 'kick off after leaving mid-replay: ' + r);
    N('second match started in ' + r + 'ms');
  });

  await step('full time → result screen', async () => {
    let r = await until(page, 'play', () => window.__magnet.world.state === 'play', 40000, { live: true });
    if (typeof r === 'string') return F('fulltime', r);
    await scoreGoal(page);
    r = await until(page, 'goal', () => window.__magnet.world.state === 'goal', 6000, { live: true });
    if (typeof r === 'string') F('fulltime', 'goal before the whistle did not land: ' + r);
    r = await until(page, 'play again', () => window.__magnet.world.state === 'play', 40000, { live: true });
    if (typeof r === 'string') return F('fulltime', r);
    await page.evaluate(() => { const w = window.__magnet.world; w.timeLeft = 1.0; if (w.score[0] === w.score[1]) w.score[0]++; });
    r = await until(page, 'over', () => window.__magnet.world.state === 'over', 6000, { live: true });
    if (typeof r === 'string') return F('fulltime', 'whistle never blew: ' + r);
    r = await until(page, 'result screen', () => window.__magnet.paused && getComputedStyle(document.getElementById('overlay')).display !== 'none', 8000);
    if (typeof r === 'string') return F('fulltime', 'result screen never showed: ' + r);
    const s = await snap(page);
    N('result screen "' + s.ovTitle + '" ' + r + 'ms after the whistle; modals=' + s.modals.join(',') );
    if (s.modals.length) F('fulltime', 'modal over the result screen: ' + s.modals.join(','));
    for (const sel of ['#ovResume', '#ovMenu', 'text=Watch goal', 'text=Watch match']){
      const e = await page.evaluate((sel) => {
        let el = sel.startsWith('text=') ? [...document.querySelectorAll('#overlay button')].find(b => b.textContent.includes(sel.slice(5))) : document.querySelector(sel);
        if (!el) return 'missing ' + sel;
        el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return (h === el || el.contains(h)) ? null : sel + ' covered by ' + (h ? (h.id || h.className || h.tagName) : 'nothing');
      }, sel);
      if (e) F('fulltime', e);
    }
  });

  const watchAndExit = async (which) => {
    const e = await press(page, 'text=' + which, which); if (e) return F(which, e);
    let r = await until(page, 'transport', () => window.__magnet.replay.active && window.__magnet.replay.controls && !document.getElementById('repCtl').classList.contains('hidden'), 6000);
    if (typeof r === 'string') return F(which, 'transport never came up: ' + r);
    await sleep(1200);
    const e2 = await press(page, '#repExit', '✕'); if (e2) return F(which, e2);
    r = await until(page, 'result back', () => !window.__magnet.replay.active && getComputedStyle(document.getElementById('overlay')).display !== 'none', 6000);
    if (typeof r === 'string') return F(which, 'result screen did not come back after ✕: ' + r);
    N(which + ': transport up, ✕ returned to the result screen in ' + r + 'ms');
  };
  await step('Watch goal ✕', () => watchAndExit('Watch goal'));
  await step('Watch match ✕', () => watchAndExit('Watch match'));

  const filmFrom = async (which, btn, budget) => {
    const dl0 = (await snap(page)).dl;
    const e = await press(page, 'text=' + which, which); if (e) return F(which + ' ' + btn, e);
    let r = await until(page, 'transport', () => window.__magnet.replay.controls && !document.getElementById('repCtl').classList.contains('hidden'), 6000);
    if (typeof r === 'string') return F(which + ' ' + btn, r);
    await sleep(500);
    const e2 = await press(page, btn, btn); if (e2) return F(which + ' ' + btn, e2);
    const t0 = Date.now();
    r = await until(page, 'file handed over', () => window.__dl.length > 0, budget);
    const s = await snap(page);
    if (typeof r === 'string') return F(which + ' ' + btn, 'no file after ' + budget + 'ms: ' + r);
    r = await until(page, 'result back', () => !window.__magnet.replay.active && !window.__magnet.replay.filming && getComputedStyle(document.getElementById('overlay')).display !== 'none', 8000);
    if (typeof r === 'string') return F(which + ' ' + btn, 'result screen did not come back after the export: ' + r);
    const dl = await page.evaluate(async () => { const d = window.__dl.pop(); const b = await fetch(d.href).then(r => r.blob()); return { name: d.name, size: b.size }; });
    N(which + ' ' + btn + ': ' + dl.name + ' (' + dl.size + ' bytes) in ' + (Date.now() - t0) + 'ms, result back');
  };
  await step('Watch goal → Video', () => filmFrom('Watch goal', '#repVidBtn', 40000));
  await step('Watch goal → HQ video', () => filmFrom('Watch goal', '#repVidHqBtn', 40000));
  await step('Watch match → Video', () => filmFrom('Watch match', '#repVidBtn', 90000));

  await step('Restart from the result screen', async () => {
    const e = await press(page, '#ovResume', 'Restart'); if (e) return F('restart', e);
    const r = await until(page, 'next match', () => { const w = window.__magnet.world; return w && !window.__magnet.paused && (w.state === 'kickoff' || w.state === 'play' || w.state === 'warmup'); }, 6000, { live: true });
    if (typeof r === 'string') return F('restart', r);
    const s = await snap(page); N('restart landed in state ' + s.state + ' in ' + r + 'ms');
  });

  await step('Main Menu from pause', async () => {
    let r = await until(page, 'play', () => window.__magnet.world && window.__magnet.world.state === 'play', 12000, { live: true });
    if (typeof r === 'string') F('menu', r);
    const e = await press(page, '#pauseBtn', 'pause'); if (e) return F('menu', e);
    r = await until(page, 'paused', () => window.__magnet.paused, 3000); if (typeof r === 'string') return F('menu', r);
    const e2 = await press(page, '#ovMenu', 'Main Menu'); if (e2) return F('menu', e2);
    r = await until(page, 'menu', () => !document.getElementById('setup').classList.contains('hidden') && getComputedStyle(document.getElementById('overlay')).display === 'none', 5000);
    if (typeof r === 'string') return F('menu', r);
    await sleep(400);
    const s = await snap(page); N('menu back in ' + r + 'ms; running=' + s.running + ' demo=' + s.demo + ' paused=' + s.paused + ' state=' + s.state);
    if (s.paused && !s.overlay) N('Main Menu keeps the match paused beside the open dock (state ' + s.state + ') — by design');
    // what a player does next: a fresh KICK OFF must work from here
    const e3 = await press(page, '#playBtn', 'KICK OFF'); if (e3) return F('menu', e3);
    r = await until(page, 'new match', () => { const w = window.__magnet.world; return w && !w.demo && !window.__magnet.paused && (w.state === 'kickoff' || w.state === 'play'); }, 6000, { live: true });
    if (typeof r === 'string') return F('menu', 'KICK OFF from the menu after Main Menu: ' + r);
    await page.evaluate(() => window.__magnet.toMenu());
    await sleep(400);
  });

  await step('Warm-up → START', async () => {
    const e = await press(page, '#warmupBtn', 'Warm-up');
    if (e){ if (/no box/.test(e)) return N('Warm-up is not offered here (' + tag + ', no pad) — warmupUseful, by design'); return F('warmup', e); }
    let r = await until(page, 'warmup', () => window.__magnet.world && window.__magnet.world.state === 'warmup', 6000, { live: true });
    if (typeof r === 'string') return F('warmup', r);
    await sleep(800);
    const b = await press(page, '#lobbyStartBtn', 'START');
    if (b){ notes.push('lobby START button not pressable (' + b + '), using Enter'); await page.keyboard.press('Enter'); }
    r = await until(page, 'kickoff', () => { const w = window.__magnet.world; return w && (w.state === 'kickoff' || w.state === 'play'); }, 6000, { live: true });
    if (typeof r === 'string') return F('warmup', 'START did not leave warm-up: ' + r);
    N('warm-up → kickoff in ' + r + 'ms');
    await page.evaluate(() => window.__magnet.toMenu());
  });

  await step('every drill on the real loop', async () => {
    const keys = await page.evaluate(() => window.__magnet.DRILL_KEYS.slice());
    for (const k of keys){
      const m = errs.length;
      await page.evaluate((k) => window.__magnet.startDrill(k), k);
      const r = await until(page, 'drill ' + k, () => { const w = window.__magnet.world; return w && w.drill && w.drill.elapsed > 0.5; }, 4000);
      if (typeof r === 'string') F('drill ' + k, r);
      const e = await errsSince(page, errs, m); for (const l of e) F('drill ' + k, l);
      await page.evaluate(() => window.__magnet.toMenu());
    }
    N(keys.length + ' drills ran on the real loop');
  });

  await step('every mode on the real loop', async () => {
    const keys = await page.evaluate(() => Object.keys(window.__magnet.MODES));
    for (const k of keys){
      const m = errs.length;
      await page.evaluate((k) => { window.__magnet.sel.mode = k; window.__magnet.tryKickOff(); }, k);
      const r = await until(page, 'mode ' + k, () => { const w = window.__magnet.world; return w && !w.demo && (w.state === 'play' || w.state === 'kickoff' || w.state === 'warmup'); }, 5000, { live: true });
      if (typeof r === 'string'){ F('mode ' + k, r); }
      else { const a = await snap(page); await sleep(700); const b = await snap(page); if (b.aiTick - a.aiTick < 20) F('mode ' + k, 'sim +' + (b.aiTick - a.aiTick) + ' steps in 0.7s (state ' + b.state + ')'); }
      const e = await errsSince(page, errs, m); for (const l of e) F('mode ' + k, l);
      await page.evaluate(() => window.__magnet.toMenu());
    }
    await page.evaluate(() => { window.__magnet.sel.mode = '3v3'; });
    N(keys.length + ' modes ran on the real loop');
  });

  await step('every field on the real loop', async () => {
    const keys = await page.evaluate(() => Object.keys(window.__magnet.FIELDS));
    for (const k of keys){
      const m = errs.length;
      await page.evaluate((k) => { window.__magnet.sel.field = k; window.__magnet.tryKickOff(); }, k);
      const r = await until(page, 'field ' + k, () => { const w = window.__magnet.world; return w && !w.demo && (w.state === 'play' || w.state === 'kickoff'); }, 5000, { live: true });
      if (typeof r === 'string') F('field ' + k, r);
      else { const a = await snap(page); await sleep(500); const b = await snap(page); if (b.aiTick - a.aiTick < 15) F('field ' + k, 'sim +' + (b.aiTick - a.aiTick) + ' in 0.5s'); }
      const e = await errsSince(page, errs, m); for (const l of e) F('field ' + k, l);
      await page.evaluate(() => window.__magnet.toMenu());
    }
    await page.evaluate(() => { window.__magnet.sel.field = 'classic'; });
    N(keys.length + ' fields ran on the real loop');
  });

  await step('every theme over a live match', async () => {
    await page.evaluate(() => window.__magnet.tryKickOff());
    let r = await until(page, 'match', () => { const w = window.__magnet.world; return w && !w.demo && (w.state === 'play' || w.state === 'kickoff'); }, 5000, { live: true });
    if (typeof r === 'string') return F('themes', r);
    const keys = await page.evaluate(() => Object.keys(window.__magnet.THEMES));
    for (const k of keys){
      const m = errs.length;
      await page.evaluate((k) => window.__magnet.applyBundle(k), k);
      const a = await snap(page); await sleep(500); const b = await snap(page);
      if (b.aiTick - a.aiTick < 15) F('theme ' + k, 'sim +' + (b.aiTick - a.aiTick) + ' in 0.5s');
      const e = await errsSince(page, errs, m); for (const l of e) F('theme ' + k, l);
    }
    await page.evaluate(() => { window.__magnet.applyBundle('grass'); window.__magnet.toMenu(); });
    N(keys.length + ' themes painted over a live match');
  });

  await step('rAF gaps over the whole run', async () => {
    const s = await snap(page);
    N('rAF frames ' + s.gaps.n + ', worst gap ' + s.gaps.max.toFixed(0) + 'ms, gaps over 250ms: ' + s.gaps.over);
    if (s.gaps.max > 2000) F('raf', 'a frame gap of ' + s.gaps.max.toFixed(0) + 'ms — the page froze');
  });

  await browser.close();
}

const which = process.argv[2] || 'both';
if (which !== 'phone') await run(false);
if (which !== 'desktop') await run(true);
console.log('\n=== ' + findings.length + ' findings ===');
for (const f of findings) console.log('[' + f.scenario + '] ' + f.detail);
process.exit(findings.length ? 1 : 0);
