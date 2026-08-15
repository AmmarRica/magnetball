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
