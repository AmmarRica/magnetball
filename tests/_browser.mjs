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
// --allow-file-access-from-files: suites load the page over file:// and several
// sample canvas pixels. Country-flag SVGs drawn from assets/ would otherwise taint
// the canvas and make getImageData throw a SecurityError.
export const LAUNCH = {
  args: ['--allow-file-access-from-files'],
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
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
