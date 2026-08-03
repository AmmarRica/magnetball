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
