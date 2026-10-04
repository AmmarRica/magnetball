// tools/commercial.mjs — films a short commercial for the game off the REAL page.
//
//   node tools/commercial.mjs            # writes tools/out/magnetball-commercial.webm (+ stills)
//   node tools/commercial.mjs /some/dir  # somewhere else
//
// Playwright records the page while the game's own rAF loop runs bots-only matches; the
// title cards are DOM overlays in the game's font, so the film is the shipped code and
// nothing is drawn by hand. Not part of the game, never loaded by the page, never run by
// `tests/run.mjs` (that runner reads `tests/*.mjs` only). See tools/README.md.
//
// What the recorder is and is not: `recordVideo` is VP8 in WebM at 25fps with NO audio,
// and nothing on a plain Playwright box encodes anything else — a soundtrack or an MP4 is a
// pass through a converter afterwards. The head of the recording (the page loading and
// the stage being set) is trimmed off with ffmpeg when one can be found: Playwright ships
// one beside its browsers (`PLAYWRIGHT_BROWSERS_PATH/ffmpeg-*/ffmpeg-linux`) and `FFMPEG`
// overrides it; with neither the untrimmed file is kept and the console says so.
//
// Four things it took a re-shoot each to learn, so they are rules here:
//  - THE MENU MUST NEVER BE ON FILM, and hiding it after `goto` is too late — the recorder
//    starts with the context, so the stage is set from `DOMContentLoaded` in an init script
//    and the lead-in is trimmed by the wall clock the script itself measured.
//  - THE PITCH FOLLOWS THE THEME. `applyBundle('faceoff')` selects the Faceoff court (its
//    bundle names a `pitch`) and nothing puts Classic back, so every scene after it played
//    on the gap court. `match()` sets `sel.field` explicitly.
//  - A KICKOFF LOOKS FROZEN IN A STILL. The first cut was read as "the loop is not stepping"
//    off two stills that had both caught a kickoff formation; the video was fine. Check the
//    VIDEO's frames (ffmpeg `-ss N -frames:v 1`), not screenshots taken at card time.
//  - A STILL TAKEN AT CARD TIME IS A FAINT CARD. The overlay fades in over .45s; the stills
//    wait 600ms. They are for checking framing and are not the deliverable.
import { chromium, LAUNCH } from '../tests/_browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.resolve(process.argv[2] || path.join(HERE, 'out'));
const W = 1280, H = 720;
const NAME = 'sumo-soccer-commercial.webm';

// The scenes, in order. Edit here; everything below is mechanism.
const TITLE_THEME = 'kickabout';       // Sunday League — the figures are the thing to open on
const TITLE_SEED = 21;                 // seed 21 scores at ~9.4s of play; we join at 1s
const THEMES = [['pool', 'Pool'], ['vector', 'Spaceships'], ['faceoff', 'Faceoff Orbit'],
                ['sketch', 'Sketchbook'], ['synth', 'Retrowave']];
const SEAT_NAME = 'pixel';             // the human seat is driven by a bot; not a BOT_NAMES entry
const LINES = {
  title:  '<h1>SUMO SOCCER</h1><p>Top-down football. One file. Any screen.</p>',
  theme:  (name) => `<h2>${name}</h2><p>Twenty-seven looks. Every one a whole room.</p>`,
  lobby:  '<h2>Four controllers, one couch</h2><p>Walk onto a side. Spell your name with your feet.</p>',
  modes:  '<h2>Tournaments · Gauntlet · Drills · Mini golf</h2><p>Killer Lobsters, when football is not enough.</p>',
  close:  '<h1>SUMO SOCCER</h1><p>Free. No install. Plays in the browser you already have.</p><p>github.com/AmmarRica/magnetball</p>',
};

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(LAUNCH);
const ctx = await b.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const tRec = Date.now();   // the recording starts with the page
// The stage, from the first frame: no menu, no HUD corners, no dock tab, no toasts.
await p.addInitScript(() => {
  window.__MAGNETDEBUG = true;
  document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = '#setup, #hud, #dockToggle, #cupTicker, .toast { display: none !important; } body { background: #0b1a12; }';
    document.head.appendChild(st);
  });
});
await p.goto('file://' + path.join(ROOT, 'index.html'));
await p.waitForTimeout(1200);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const shot = (name) => p.screenshot({ path: path.join(OUT, name + '.png') });

// The overlay layer for the cards, and the settings a film wants: no lobby (every scene is
// bots-only), no controllers (a pad on the build box must not take a seat), no auto-replay
// (`playReplay` parks `loop()` for seconds), a timed match (a goals-based one could END
// mid-scene), no hoardings (they frame the pitch for a player, not a camera).
await p.evaluate(() => {
  const M = window.__magnet;
  const st = document.createElement('style');
  st.textContent = `
    #adv { position: fixed; inset: 0; z-index: 50; pointer-events: none; display: flex; flex-direction: column;
           align-items: center; justify-content: center; text-align: center; color: #fff;
           transition: opacity .45s ease; opacity: 0; font-family: inherit; }
    #adv.on { opacity: 1; }
    #adv .wash { position: absolute; inset: 0; background: rgba(8,12,18,.55); }
    #adv .box { position: relative; padding: 28px 40px; }
    #adv h1 { font-size: 96px; margin: 0; letter-spacing: .06em; text-shadow: 0 4px 0 #000, 0 0 24px rgba(0,0,0,.6); }
    #adv h2 { font-size: 44px; margin: 0; letter-spacing: .04em; text-shadow: 0 3px 0 #000; }
    #adv p  { font-size: 26px; margin: 14px 0 0; opacity: .92; text-shadow: 0 2px 0 #000; }
    #adv.lower { justify-content: flex-end; padding-bottom: 54px; }
    #adv.lower .wash { background: linear-gradient(to top, rgba(8,12,18,.78), rgba(8,12,18,0) 45%); }
  `;
  document.head.appendChild(st);
  const adv = document.createElement('div'); adv.id = 'adv'; adv.innerHTML = '<div class="wash"></div><div class="box"></div>';
  document.body.appendChild(adv);
  M.sel.lobby = 'off'; M.sel.controllers = 'off'; M.sel.autoReplay = false; M.sel.length = '5';
  M.sel.adsOn = 'off'; M.sel.popups = true;
});
const card = (html, cls = '') => p.evaluate(([html, cls]) => {
  const a = document.getElementById('adv'); a.className = cls; a.querySelector('.box').innerHTML = html;
  requestAnimationFrame(() => a.classList.add('on'));
}, [html, cls]);
const cardOff = () => p.evaluate(() => document.getElementById('adv').classList.remove('on'));
// A bots-only match on a theme, fast-forwarded `skip` steps so the camera lands mid-play.
// The human seat is handed to a bot and renamed — "You" on a body nobody is driving is a lie.
const match = (theme, seed, skip, mode = '3v3') => p.evaluate(([theme, seed, skip, mode, seatName]) => {
  const M = window.__magnet; M.replayAbort(); M.applyBundle(theme);
  M.sel.field = theme === 'faceoff' ? 'faceoff' : 'classic';
  M.sel.mode = mode; M.setMatchSeed(seed); M.startMatch();
  const w = M.world; for (const q of w.players){ if (q.ctrl !== 'bot'){ q.ctrl = 'bot'; q.name = seatName; } }
  for (let i = 0; i < skip; i++) M.step(w);
  M.juiceReset();
  ['setup', 'how', 'drills'].forEach(id => { const el = document.getElementById(id); if (el){ el.classList.add('hidden'); el.classList.remove('docked'); } });
  window.dispatchEvent(new Event('resize'));
}, [theme, seed, skip, mode, SEAT_NAME]);

// Scene 1 — title over live Sunday League play, then the goal.
await match(TITLE_THEME, TITLE_SEED, 60);
const tFirst = Date.now() + 150;   // trim to here: the first scene is on screen
await sleep(400);
await card(LINES.title);
await sleep(600); await shot('01-title'); await sleep(2600);
await cardOff(); await sleep(500);
await shot('02-play'); await sleep(7600);
await shot('03-goal'); await sleep(2400);
// Scene 2 — theme montage, caption low on the screen.
let k = 0;
for (const [key, name] of THEMES){
  await match(key, 7 + k, 420);
  await card(LINES.theme(name), 'lower');
  await sleep(600); await shot(`04-theme-${k}`); await sleep(1850);
  await cardOff(); await sleep(350); k++;
}
// Scene 3 — the warm-up room.
await p.evaluate(() => { const M = window.__magnet; M.applyBundle('kickabout'); M.sel.field = 'classic'; M.sel.mode = '3v3'; M.setMatchSeed(5); M.openWarmup(); window.dispatchEvent(new Event('resize')); });
await sleep(300);
await card(LINES.lobby, 'lower');
await sleep(600); await shot('05-lobby'); await sleep(3150);
await cardOff(); await sleep(400);
// Scene 4 — modes, over a Killer Lobsters match.
await match('grass', 11, 300, 'kq');
await card(LINES.modes, 'lower');
await sleep(600); await shot('06-modes'); await sleep(3350);
await cardOff(); await sleep(400);
// Scene 5 — close.
await match(TITLE_THEME, 3, 200);
await sleep(1500);
await card(LINES.close);
await sleep(600); await shot('07-close'); await sleep(3550);
await ctx.close();
await b.close();

const raw = path.join(OUT, fs.readdirSync(OUT).find(f => f.endsWith('.webm')));
const trimSecs = ((tFirst - tRec) / 1000).toFixed(2);
const ff = findFfmpeg();
if (ff){
  const out = path.join(OUT, NAME);
  execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', trimSecs, '-i', raw,
                    '-c:v', 'libvpx', '-b:v', '2500k', '-deadline', 'good', '-cpu-used', '2', out], { stdio: 'inherit' });
  fs.unlinkSync(raw);
  console.log(`written ${out} (head trimmed ${trimSecs}s)`);
} else {
  const out = path.join(OUT, NAME.replace('.webm', '-untrimmed.webm'));
  fs.renameSync(raw, out);
  console.log(`written ${out} — no ffmpeg found, so the first ${trimSecs}s (page load) are still in it; set FFMPEG=/path/to/ffmpeg to trim`);
}

function findFfmpeg(){
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return null;
  for (const d of fs.readdirSync(root).filter(d => /^ffmpeg(-\d+)?$/.test(d)).sort().reverse()){
    for (const rel of ['ffmpeg-linux', 'ffmpeg-mac', 'ffmpeg-win64.exe']){
      const f = path.join(root, d, rel);
      if (fs.existsSync(f)) return f;
    }
  }
  return null;
}
