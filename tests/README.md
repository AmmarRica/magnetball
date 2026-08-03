# Tests

Headless Playwright suites for `index.html`. They drive the real page through the
`window.__magnet` debug hook (see `CLAUDE.md`), so they exercise the shipped code —
there is no build step and nothing is mocked.

The game itself stays dependency-free: Playwright is a **dev-only** tool and is never
loaded by the page.

## Running

```bash
npm i -D playwright          # once (or: npx playwright install chromium)
node tests/run.mjs           # every suite
node tests/run.mjs deck      # only suites matching "deck"
node tests/deck.mjs          # a single suite
```

If you have a browser already on disk, point at it instead of downloading one:

```bash
CHROME_PATH=/path/to/chrome node tests/run.mjs
```

Every suite exits non-zero on failure, so `run.mjs` (and any CI step) fails loudly.

## Suites

| Suite | Covers |
|---|---|
| `smoke` | Duplicate element IDs, every screen/picker/theme/drill/mode/party combo opens and runs without throwing |
| `ball_grass` | Ball rolls (incl. multi-ball extras), all six grass patterns render, picker builds |
| `kickoff` | Kickoff line holds both teams, releases on play, bots obey it, rule-off frees movement |
| `coop` | Controller routing: co-op fills your team first (N humans vs N AI), versus interleaves, overflow |
| `drillfeel2` | Drills use your Game Feel / pitch / magnet settings rather than fixed defaults |
| `deck` | Steam Deck layout: camera turn, pitch fits, focus ring, collapse frees the pitch, containment |
| `deck2` | Controller menu depth: card headers expand, section jumps, slider adjust |
| `deckctrl` | Stick maps to **screen** directions in all four axes with the pitch turned |
| `deckreg` | Deck renders every field/grass/flag with zero ball or player escapes; mobile unaffected |
| `deckpad` | Pad ownership: game owns the pad while collapsed, A never reopens the menu |
| `deckmenu` | Menu only takes the pad while actually open; Select always toggles; drills hand over too |
| `orient` | Pitch-direction setting drives camera **and** controls together; cocktail stays upright |
| `fs` | Full screen genuinely enters on click and exits on F, label tracks state |
| `labels` | Name plates fade to 5% over a disc or the ball and return when clear, both orientations |
| `unlocked` | Unlocked summary: counts match the unlock model, strip shows only earned items, tap equips |
| `demo` | Idle demo uses two random countries (not your look), and the Demo tag paints only in demo |
| `debug` | Debug readout gated by its toggle, numbers track the live sim and feel values, build stamp |
| `demo2` | Demo picks a random court and never replays; controller wording; six crowd cheers, new ones longer |
| `killerqueen` | Killer Queen: two balls, heavy non-resetting snail, goals that don't reset play, snail = instant win |
| `grasstiles` | Grass cut tiles draw the selected court with each mow pattern, and field/grass/theme picks redraw each other |
| `trapwindow` | Trap window slider changes how long the ball actually sticks, applies live, survives reset/presets/drills, and one-touch ignores it |
| `onehand` | One-handed mode: releasing the stick shoots (never traps), holding doesn't, jitter doesn't, cooldown caps the rate, KICK still works |
| `audit` | Every setting is **reachable** (a real control writes it) and **effective** (it moves world state or pixels); every nav tile, drill and mode runs |
| `surfaces` | Ice and mud are visibly distinct and textured (not a flat tint), mud wears where the traffic is, deterministic, cache invalidates, tiles differ, grip unchanged, every field safe |
| `panel` | `/settings` route: same cards as inline, no game, snapshot on open, two-way live sync, telemetry, detached/inline, cross-tab match control |
| `botlook` | Bots wear their own face/cap/eyes — never yours — vary from each other, and stay stable across restarts |
| `cocktailkeys` | Cocktail takes the keyboard off the pitch and seats player 1 on a controller; menu keys and other layouts unaffected |
| `tells` | Motion tells by **canvas pixel sampling**: moving players leave ink, parked ones don't, ball streak scales with speed, wind-up shows on the disc, and both read on **all six themes** |

## Writing a suite

Set the debug flag **before** load, then drive the hook:

```js
await page.addInitScript(() => { window.__MAGNETDEBUG = true; });
await page.goto('file://' + process.cwd() + '/index.html');
const M = window.__magnet;   // live getters for world, sel, stats, + most functions
```

Two traps that have produced false passes here before — both real, both cost a release:

- **Assert the thing you mean.** A "player blocked at the halfway line" check passed
  because the player was stopping on the *frozen kickoff ball* at y=25, not on the line
  at y=15. Position tests away from the centre spot.
- **Don't encode current behaviour.** A deck suite asserted the menu stays open during a
  match, which was the bug being reported. When a test fails after an intentional change,
  check which side is actually right.

`panel` needs a real origin, so it serves the repo over http via `_serve.mjs` — two
`file://` pages are separate opaque origins and a BroadcastChannel between them
silently never delivers.

Two more traps, both of which produced false results here:

- **Poll, don't sleep.** A backgrounded tab has its `requestAnimationFrame`
  throttled to about 1Hz, so a fixed `wait(400)` after a cross-tab change is a coin
  flip. `until(page, fn)` polls instead.
- **Drive the real call site.** `pollKeys()` runs from `drawControls()`, not
  `step()`, so a loop of bare `step()` calls never reads the keyboard — the first
  version of `cocktailkeys` passed only because the render loop happened to tick
  between two `evaluate` calls.

Also: with a gamepad connected a seat's `ctrl` becomes `'gamepad'`, so `pads.p1` no longer
drives it — feed the fake pad instead. And in a sideways pitch `rotQuarter=1`, so stick-up
moves the player along world **+x**; measure displacement, not a single axis.
