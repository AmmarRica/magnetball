// tools/goalseeds.mjs — which seeds score, and when, on a court. Feeds `GOALS` and the
// title seed in tools/commercial.mjs, which fast-forward a seeded match to just before a
// goal the camera then watches happen.
//
//   node tools/goalseeds.mjs                       # six courts, seeds 1..36
//   node tools/goalseeds.mjs classic,island 60     # your courts, seeds 1..60
//
// Prints one line per (court, seed) whose FIRST goal lands inside 25 seconds of play:
// `court seed step seconds team`. The step is what the commercial wants.
//
// ⚠️ The settings pinned here are the commercial's — bots-only 3v3 on Sunday League, lobby
// off, timed match, no ads — and a step is only valid for the match it was measured on: a
// seeded match reproduces bit-exactly in one browser build (the determinism bar CLAUDE.md
// records), so a different court, mode, feel or Chromium is a different set of matches.
// Re-run this rather than trusting a number from last month. Dev-only, like everything
// in tools/: not loaded by the page, not run by tests/run.mjs.
import { chromium, LAUNCH } from '../tests/_browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fields = (process.argv[2] || 'classic,futsal,stadium,island,octagon,leviathan').split(',');
const seeds = +(process.argv[3] || 36);

const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + path.join(ROOT, 'index.html'));
await p.waitForTimeout(800);
const rows = await p.evaluate(([fields, seeds]) => {
  const M = window.__magnet, out = [];
  M.replayAbort(); M.applyBundle('kickabout');
  M.sel.lobby = 'off'; M.sel.controllers = 'off'; M.sel.autoReplay = false; M.sel.length = '5';
  M.sel.adsOn = 'off'; M.sel.mode = '3v3';
  for (const f of fields){
    for (let seed = 1; seed <= seeds; seed++){
      M.sel.field = f; M.setMatchSeed(seed); M.startMatch();
      const w = M.world;
      for (const q of w.players) if (q.ctrl !== 'bot') q.ctrl = 'bot';   // the commercial's own seat rule
      for (let i = 0; i < 1500; i++){
        M.step(w);
        if (w.score[0] + w.score[1] > 0){ out.push([f, seed, i, (i / 60).toFixed(1), w.score[0] ? 0 : 1]); break; }
      }
    }
  }
  return out;
}, [fields, seeds]);
for (const [f, seed, step, secs, team] of rows) console.log(`${f} ${seed} ${step} ${secs}s team${team}`);
await b.close();
