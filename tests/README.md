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
| `surfaces` | Ice and mud are visibly distinct and textured (not a flat tint), mud starts green and both **wear in from actual play** (subtle, distance-gated, reset per match), deterministic, cache invalidates, tiles differ, grip unchanged, every field safe |
| `seatnames` | Player names typed in settings land on seats in order, blanks keep defaults, overflow/long names safe, demo stays generic |
| `mobilefit` | Phone framing: pitch clears the thumbsticks and leaves no dead slab under the HUD; desktop untouched |
| `cocktailnopad` | Cocktail with **no** controller connected stays playable — the keyboard falls back rather than leaving nothing driving the player |
| `livelook` | Customising your player shows on the pitch immediately (no restart); the idle demo has no clock, never announces OVERTIME, never throws a result overlay, and never wears your look |
| `keyfocus` | Space **and** X kick, neither steals a keystroke while typing, clicking the pitch releases a focused slider so arrows drive the player again, Game Feel splits into ball/player groups |
| `padflairs` | A controller icon per connected pad, bottom-right; goes black on a lit chip while any button is held; nothing drawn with no pads; 4 pads draw more than 1 |
| `accordion` | Settings sections open one at a time: clicking one closes the rest, clicking the open one closes it, deep links obey it, a stale multi-open state is repaired on load |
| `panel` | `/settings` route: same cards as inline, no game, snapshot on open, two-way live sync, telemetry, detached/inline, cross-tab match control |
| `botlook` | Bots wear their own face/cap/eyes — never yours — vary from each other, and stay stable across restarts |
| `cocktailkeys` | Cocktail takes the keyboard off the pitch and seats player 1 on a controller; picking it keeps you on the menu able to kick off; pitch direction is locked and says why |
| `tells` | Motion tells by **canvas pixel sampling** (incl. the charge ring flashing as a full circle rather than sweeping): moving players leave ink, parked ones don't, ball streak scales with speed, wind-up shows on the disc, and both read on **all six themes** |
| `themetiles` | Theme picker shows each theme's palette as a painted canvas (no emoji): one tile per theme, all distinct, every band sampled back to that theme's own colours, picking one still switches the theme |
| `contrast` | No label sits on a colour too close to it: every visible text element on every screen under every theme is held to WCAG AA against its **composited** background, plus the goal banner's outline; includes a known-bad probe so a clean run can't be vacuous |
| `awards` | End-of-match awards state the figure that won them ("Most Saves · 5 saves"), the number matches the tally that picked the winner, singulars stay singular, and it reaches the DOM |
| `kickpush` | Optional "kick off walls & players": off by default and provably inert when off; on, a wall/arc/post launches you *away* from it on all four boundaries, charge scales it, a body takes the shove while you take the smaller recoil along the same line, empty space and out-of-range targets do nothing, one press is one launch with a cooldown, it never fires at kickoff or after the whistle, the ball is untouched, and the picker writes and persists |
| `lobby` | Warm-up lobby + the game-over chooser: pads in play drop into `warmup` first (keyboard-only doesn't), waiting bots stand off the touchline and neither move nor run the AI, the ball can't be disturbed, sticks and KICK are testable; standing on a half picks your team and standing **outside** sits the match out, sides always come out equal (2v1 → 2v2, solo auto-assigns), **everyone on one side stays together** — six controllers on one half is a 6v6 against bots, not 3v3 against each other — with bots built to order when the mode's roster runs short and the roster settling rather than growing a body per trip to the lobby; the mode's seat count is the real ceiling (a 9th pad in a 4v4 is never seated); a benched player still moves but can never re-enter mid-match and can't wander off screen; cocktail calibration takes one arrow at a time, ignores short holds and face buttons, accepts stick or dpad, persists the seat's side and is proved by the player then moving *up* the screen; the result screen offers Restart (default, same teams) and Warm-up, and only **Player 1's** pad can move the selection |
| `matchstats` | The result screen carries the full scoresheet: a row per player, every number equal to the tally it came from, your row marked, both teams tagged, discs actually drawn, cleared between matches and absent in drills |
| `balllook` | The Skins card is gone (no `ballSkin`/`playerSkin`, nothing "needs art"), and the ball has nine **drawn** looks: all paint, all differ, none spills outside the ball, the pattern turns with spin while Plain doesn't, picking one persists and shows on the pitch — and no request is made for sprite art |
| `textplates` | Players wear shirt **numbers** by default (you are 1, your bots 2+, the opposition starts again at 1, no clashes within a side); every glyph from the HaxBall avatar list is present, unlocked, unique and paints; two-character plates scale to fit inside the disc rather than spilling; picking one equips, persists and reaches the pitch live |
| `kickoffhead` | The KICK OFF button **is** the Match section's header: collapsed it's just the green bar with a chevron on its right, expanding shows the mode/field/difficulty pickers, pressing the button starts a match without toggling the section, the accordion still holds, and the sticky offset is measured from the header rather than the button nested inside it |
| `hitstop` | Hit stop is its own slider (0 = off, survives Screen shake being turned off, writes and persists) and the freeze only pays out on a **first touch** whose shot the game has walked forward and seen score: wide, backwards, too soft, dying short, wrong attacker and blocked-by-a-body all get nothing (the block is cross-checked against the real sim), a trapped-and-carried shot gets nothing even though it would score, nothing fires at kickoff or after the whistle, and the prediction is deterministic and provably inert — a whole-world diff across 25 predictions, since `collideDiscs` writes to both bodies |
| `smooth` | Movement reads the same on every screen: with the sim held to the same 120 steps, four different refresh rates give an identical ball streak, disc-dot count and shake/flash decay (with a per-frame-decay probe proving the suite can still see the old bug); mid-step the streak starts at the **drawn** ball rather than overshooting it to the sim position; and interpolation measurably smooths on-screen motion (judder 0.01 vs 2.0 raw, 1 frozen frame vs 168 at 144Hz) |
| `botai` | Bot AI, all steps: seeded determinism and no `Math.random`; bots write **only** the fields a human's input writes; the oscillation limit cycle is gone; intercept converges and stays on the pitch; goalie/roles/formation slots are distinct and stable; lane checks, apertures and aim candidates behave; bank kicks land within 4 units mean using the **real** wall restitution and ball radius (21.5 for a naive mirror); bots follow the player's trap setting; the difficulty ladder is monotone across measurable gaps, checked both ways round |

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

Two traps specific to measuring an AI against itself, both of which gave wrong answers:

- **Play every matchup both ways round.** Driving one side manually (the `aiFrozen`
  seam) hands it about a 17-point edge, so Normal-vs-Normal read 0.33 and made every
  other ladder number look meaningful when it wasn't.
- **Don't assert what the sample can't resolve.** Six duels put rookie-vs-normal
  anywhere from 0.17 to 0.66 run to run. `botai` asserts only the wide gaps and
  reports the rest.

Two traps specific to measuring colour, both of which produced wrong verdicts here:

- **Composite the background.** The page paints with a gradient and every panel and
  pill is `rgba()`, so `getComputedStyle(el).backgroundColor` is `transparent` almost
  everywhere. Walking up to a white default reported ~90 phantom failures per theme
  while missing the real ones — flatten the stack onto `--bg` instead.
- **Wait out the transition.** `body` eases `color` over .2s, so a sample 60ms after a
  theme switch reads the *previous* theme's ink. That looked exactly like a stale
  inline colour and sent me hunting a bug that wasn't there.

Two traps specific to measuring smoothness, both of which wasted a measurement here:

- **Don't sample `ix()` after `loop()` returns.** `loop()` resets `renderAlpha` to 1 on its
  last line, so `ix()` outside the loop gives the raw sim position by design. Reading it there
  measures the un-interpolated ball and makes a working renderer look broken.
- **Measure the jitter you actually have.** Real rAF deltas on this engine are 16.60–16.80ms
  p05–p99. A synthetic ±3ms jitter makes frame pacing look like the problem when it isn't —
  the deficiency was render state advancing per frame, which no amount of pacing work fixes.

Also: with a gamepad connected a seat's `ctrl` becomes `'gamepad'`, so `pads.p1` no longer
drives it — feed the fake pad instead. And in a sideways pitch `rotQuarter=1`, so stick-up
moves the player along world **+x**; measure displacement, not a single axis.
