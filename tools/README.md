# Tools

Dev-only scripts that are **not the game**. Nothing in here is loaded by `index.html`,
precached by `sw.js` or run by `tests/run.mjs`. Like the suites they need Playwright, which
the page itself never sees.

## `commercial.mjs` — film a commercial off the real page

```bash
node tools/commercial.mjs             # → tools/out/magnetball-commercial.webm, plus stills
node tools/commercial.mjs /some/dir   # output somewhere else
```

About 55 seconds at 1280×720. Playwright records the page while the game's own frame loop
plays bots-only matches; the title cards are DOM overlays in the game's font. Because it is
the shipped code being filmed, re-run it after any visual change and the film updates with
the game — nothing is drawn by hand and nothing can drift.

**Scenes** (edit the block at the top of the script): a title over live Sunday League play
that scores a real goal at about nine seconds; a theme montage (Pool, Spaceships, Faceoff
Orbit, Sketchbook, Retrowave); the warm-up room; a Killer Lobsters match under the modes
card; a closing card with the repo name. The seeds are chosen so the goal lands inside the
scene — change a seed and check the `03-goal` still before trusting it.

**What comes out**: a silent VP8 WebM at 25fps. That is all Playwright's recorder can do and
a plain Playwright box has no other encoder, so a soundtrack or an MP4 is a pass through a
converter on your machine afterwards. The stills (`01-title.png` … `07-close.png`) are for
checking framing and are not the deliverable.

**Trimming**: the recorder starts with the browser context, so the raw file opens on the
page loading. The script measures that lead-in on the wall clock and cuts it off with
ffmpeg — Playwright's own, found under `PLAYWRIGHT_BROWSERS_PATH`, or whatever `FFMPEG`
points at. With neither it keeps the untrimmed file under a name that says so.

**Environment**: the same as the suites — `PLAYWRIGHT_MODULE` for an install outside the
repo, `CHROME_PATH` to pin a browser (see `tests/_browser.mjs`). On the build box used so far:

```bash
PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js node tools/commercial.mjs
```

**Rules learned the hard way**, each of which cost a re-shoot and is written at the top of
the script: the menu must be hidden from the *first* frame (an init script, not a call after
load); the pitch has to follow the theme, because Faceoff Orbit's bundle selects its own
court and nothing selects Classic back; a kickoff formation looks frozen in a still, so
judge the VIDEO's frames (`ffmpeg -ss N -i file.webm -frames:v 1 -c:v png out.png`) and not
screenshots; and a still taken the instant a card is shown catches it at zero opacity.

The settings it pins and why: lobby off (every scene is bots-only), controllers off (a pad
on the build machine must not take a seat), auto-replay off (`playReplay` parks the frame
loop), a timed match (a goals-based one could end mid-scene), hoardings off (they frame the
pitch for a player, not a camera). The human seat is handed to a bot and renamed, since a
body labelled "You" that nobody is driving is a lie on film.
