// Shared browser launcher for the suites.
//
// Playwright is a dev-only dependency and is never loaded by the game itself.
// Resolution order:
//   PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.js   (an install outside the repo)
//   plain `playwright`                                    (normal devDependency)
// and CHROME_PATH pins an existing browser instead of downloading one.
const mod = process.env.PLAYWRIGHT_MODULE || 'playwright';
const pkg = await import(mod);
export const chromium = (pkg.default ?? pkg).chromium;

// ⚠️ FALL BACK TO WHATEVER CHROMIUM IS ACTUALLY INSTALLED. Playwright pins a browser
// REVISION per release, so a Playwright upgrade — or a prebuilt image whose browsers were
// fetched by a different version — leaves it looking for a build that is not on disk. The
// failure it prints is "Looks like Playwright was just installed or updated… run npx
// playwright install", which is misleading twice over: nothing was installed, and behind a
// network policy that blocks the CDN the suggested command cannot work either. The suites
// then look broken when the only problem is a version number.
// CHROME_PATH still wins, because pinning a specific binary is a deliberate act.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
function installedChromium(){
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return null;
  // Newest revision first, so a box with several keeps up to date rather than pinning old.
  const dirs = readdirSync(root)
    .filter(d => /^chromium(-\d+)?$/.test(d))
    .sort((a, b) => (+(b.split('-')[1] || 0)) - (+(a.split('-')[1] || 0)));
  for (const d of dirs){
    for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
                       'chrome-win/chrome.exe']){
      const p = join(root, d, rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}
const FALLBACK = process.env.CHROME_PATH || installedChromium();
// --allow-file-access-from-files: suites load the page over file:// and several
// sample canvas pixels. Country-flag SVGs drawn from assets/ would otherwise taint
// the canvas and make getImageData throw a SecurityError.
export const LAUNCH = {
  args: ['--allow-file-access-from-files'],
  ...(FALLBACK ? { executablePath: FALLBACK } : {}),
};

// ⚠️ **A SUITE ABOUT WHICH CODEC AN EXPORT PICKS HAS TO SAY WHICH CODECS IT RUNS UNDER.**
// `recordAndShareClip` builds a MediaRecorder first and runs the offline `VideoEncoder`
// path only where that recorder cannot produce an MP4 — so every claim about the fast
// path, the HQ export and the "no MP4 on offer" arm is a claim about a browser WITHOUT
// H.264. The suites were written on Playwright's chromium-1194 (Chrome 141), which has
// none, and assumed it. Chrome for Testing 151 (Playwright 1.62.1) HAS an H.264
// MediaRecorder, so on it the fast path stands down BY DESIGN and `clipfile`,
// `fastexport` and `replayfile` all went red in CI while measuring nothing wrong —
// the container outranking the speed is the shipped behaviour they exist to pin.
// Measured on Chrome 151: `MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')`
// is true, and `saveMatchClip` wrote a 3-second match in real time as `.mp4`.
//
// So the no-MP4 arms take MP4 away EXPLICITLY, through this init script: `__withoutMp4(fn)`
// runs `fn` with `MediaRecorder.isTypeSupported` refusing every mp4 type, which is the gate
// `repMakeRecorder` consults BEFORE construction, and puts it back in a `finally`.
// ⚠️ On Chrome 141 it is inert by construction — the only mp4 answer that browser gives is
// the bare `video/mp4` carrying VP9, which `repBadMux` already refuses — so a sabotage
// (dropping the wrap) can only be seen on a browser WITH H.264; verified on Chrome 151.
// The FakeRec stand-in in `clipfile` replaces the whole class and is not touched by this.
export const withoutMp4Init = () => {
  window.__withoutMp4 = async (fn) => {
    const MR = window.MediaRecorder;
    const ITS = MR && MR.isTypeSupported;
    window.__withoutMp4.applied = !!ITS;
    if (ITS) MR.isTypeSupported = m => !/mp4/i.test(String(m)) && ITS.call(MR, m);
    try { return await fn(); } finally { if (ITS) MR.isTypeSupported = ITS; }
  };
};

// Opening the Leaderboard makes a real cross-origin fetch to a public Google
// Sheet. The game handles an unreachable sheet correctly — it falls back to the
// offline sample — but the BROWSER still logs the CORS refusal to the console,
// and every suite here fails on console errors. On a machine with no route to
// Google that never fires; on a CI runner with real network it does, which is
// exactly the sort of red build that teaches people to ignore CI.
//
// Suites should not depend on a Google Sheet being up. Serve the request locally
// with the CORS header the browser wants, so nothing leaves the machine, nothing
// is logged, and the leaderboard renders a known board every time.
//
// Call this on any page that opens the Leaderboard screen (audit, contrast).
export async function stubLeaderboard(page, rows = []){
  const body = ')]}\'\n' + JSON.stringify({
    table: {
      cols: [{label:'Name'}, {label:'RP'}, {label:'Country'}, {label:'Eyes'}, {label:'Colour'}],
      rows: rows.map(r => ({ c: [{v:r.n}, {v:r.rp}, {v:r.f||'none'}, {v:r.eyes||'googly'}, {v:r.color||'#e05a5a'}] })),
    },
  });
  await page.route(/docs\.google\.com|script\.google(usercontent)?\.com/, route =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8',
                    headers: { 'access-control-allow-origin': '*' }, body }));
}

// ⚠️ **THE FEEL A SUITE WAS WRITTEN AGAINST, pinned on purpose.**
// `defaultSel()` ships the **Pro** preset — one-touch, floatier players, a faster ball —
// which is a deliberate product choice and a real change to how the game plays. Any suite
// that measures a PHYSICS MECHANISM (a trap window, a kick reach, a shove, a gait) had its
// thresholds tuned against the older Casual feel, so inheriting the default silently
// re-points every one of those numbers at a different game.
//
// This is the same trap the repo already records for the match-length default: "~94 suites
// start matches without pinning a length, and every long bot measurement was taken under
// timed play". A suite that measures anything the Game Feel sliders can move must say which
// feel it is measuring at.
//
// ⚠️ **THE THREE BOT SUITES USE IT, AND THAT NEEDED AN ARGUMENT RATHER THAN A HABIT.** The
// first draft of this comment said the opposite — "it is NOT for the bot suites, because
// the difficulty ladder is a property of the shipped game" — and that reasoning is right on
// its own terms: pinning a feel to make a ladder check pass is the "a threshold raised to
// make a check pass is a defect report, not a fix" rule, verbatim.
//
// What makes it legitimate here is that the defect is **measured and kept red somewhere
// else**. `botai`, `botplans` and `botstuck` guard the AI — that the ladder, the steering
// and the plans hold at the movement they were tuned against, so a future retune has
// something to keep. `tests/proladder.mjs` guards the shipped game, runs at whatever
// `defaultSel()` ships, carries a live control arm, and fails today. Take that file away
// and these three pins become exactly the papering-over the paragraph above describes.
//
// ⚠️ So: **never add this pin to a suite without checking what happens without it.** Two of
// the three genuinely fail at the shipped default and the failures are real behaviour, not
// a re-pointed threshold — `botstuck` scores 5 own goals on the escape kick and its sanity
// minute finishes 0–0, and `botplans` inverts 5 of its 7 strategies.
// ⚠️ **THE KICK REACH IS PART OF IT, and it is the half that actually bit.** `sel.kickRing`
// is the dial the ring is drawn at AND the reach the physics uses (`kickRangeUnits`), and
// the default moved 195 → 125 — a 27% shorter leg. Four suites place a ball at a distance
// chosen for the old reach and then expect a kick to connect, so they measured "no kick"
// rather than the thing they are about. The feel numbers alone did not fix them.
export async function pinCasualFeel(page){
  await page.evaluate(() => {
    const M = window.__magnet;
    M.sel.magnet = 0; M.sel.trapOff = false; M.sel.sens = 1.0; M.sel.kickRing = 195;
    // ⚠️ **THE BALL IS PART OF THE MOVEMENT THE AI WAS TUNED AGAINST, and leaving it out
    // was the same hole `kickRing` was.** `BALLS[sel.ball]` sets the radius, the mass and
    // the restitution — Normal is r 10 / bCoef 0.55 and the shipped default is now **Bouncy,
    // r 9 / bCoef 0.92**, a ball that comes off the boards at nearly twice the speed. That
    // is a different game to read, and `botplans` measured it: `press` fell to a goal
    // difference of **0** (Insane failing to BEAT Rookie) with every other plan still
    // positive. It is a pin of the tuning baseline, exactly like the six feel numbers above
    // — not a threshold moved to make a check pass, which is what the paragraph above is
    // about. What the ladder does at the SHIPPED ball is `proladder`'s job.
    M.sel.ball = 'normal';
    Object.assign(M.sel.feel, { accel:40, pdamp:905, ballcap:32, kick:55, bdamp:990, trap:50 });
    M.applyFeel();
  });
}
