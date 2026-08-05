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

Every suite exits non-zero on failure, so `run.mjs` fails loudly — and
`.github/workflows/tests.yml` runs it on every push and pull request.

CI installs Playwright with `npm install --no-save --no-package-lock playwright@<pinned>`,
which writes nothing but `node_modules`: the repo deliberately carries no
`package.json` and no lockfile, so the version is pinned in the workflow instead.
Bump it there when you want a newer Playwright (the browser cache key uses the same
version, so it refreshes with it).

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
| `demo2` | Demo picks a random court and never replays; the demo is a **showcase** — top-tier bots on both benches (derived from the last `DIFF` key, not spelled), a real 3-minute clock, ignoring the player's own difficulty and length, and a **level demo ends rather than going to overtime** (it would hang on the menu until someone scored) while a real match at the same point still gets sudden death; controller wording; crowd cheers — the three Stadium-family ones longer than the three originals, all distinct, and **every** SFX category's variant count matching its label count (an unlabelled sound is unpickable). Counts are derived, not pinned: themed sets add variants, and a suite that says "exactly six" only measures how recently someone edited it |
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
| `themetiles` | The two grids in the Theme card are different pictures: the **Background** slot shows each palette as a painted canvas (no emoji) — one tile per palette, all distinct, every band sampled back to that palette's own colours — while the **Bundle** row shows the whole collection (its field, its players, its ball) and is asserted to differ pixel-wise from the palette tile it sits above; picking a palette alone switches the colours *and* makes the theme Custom |
| `contrast` | No label sits on a colour too close to it: every visible text element on every screen under every theme is held to WCAG AA against its **composited** background, plus the goal banner's outline; includes a known-bad probe so a clean run can't be vacuous |
| `awards` | End-of-match awards state the figure that won them ("Most Saves · 5 saves"), the number matches the tally that picked the winner, singulars stay singular, and it reaches the DOM |
| `kickpush` | Optional "kick off walls & players": off by default and provably inert when off; on, a wall/arc/post launches you *away* from it on all four boundaries, charge scales it, a body takes the shove while you take the smaller recoil along the same line, empty space and out-of-range targets do nothing, one press is one launch with a cooldown, it never fires at kickoff or after the whistle, the ball is untouched, and the picker writes and persists |
| `lobby` | Warm-up lobby + the game-over chooser: pads in play drop into `warmup` first (keyboard-only doesn't), bots the plan needs **walk on** to the middle of their own half and settle there (surplus ones walk back off), re-balancing live when everyone crowds one side, and they never run the AI; the ball can't be disturbed, sticks and KICK are testable; standing on a half picks your team and standing **outside** sits the match out, sides always come out equal (2v1 → 2v2, solo auto-assigns), **everyone on one side stays together** — six controllers on one half is a 6v6 against bots, not 3v3 against each other — with bots built to order when the mode's roster runs short and the roster settling rather than growing a body per trip to the lobby; the mode's seat count is the real ceiling (a 9th pad in a 4v4 is never seated); a benched player still moves but can never re-enter mid-match and can't wander off screen; cocktail calibration takes one arrow at a time, ignores short holds and face buttons, accepts stick or dpad, persists the seat's side and is proved by the player then moving *up* the screen; the result screen offers Restart (default, same teams) and Warm-up, and only **Player 1's** pad can move the selection |
| `matchstats` | The result screen carries the full scoresheet: a row per player, every number equal to the tally it came from, your row marked, both teams tagged, discs actually drawn, cleared between matches and absent in drills |
| `balllook` | The Skins card is gone (no `ballSkin`/`playerSkin`, nothing "needs art"), and the ball has nine **drawn** looks: all paint, all differ, none spills outside the ball, the pattern turns with spin while Plain doesn't, picking one persists and shows on the pitch — and no request is made for sprite art |
| `textplates` | Players wear shirt **numbers** by default (you are 1, your bots 2+, the opposition starts again at 1, no clashes within a side); every glyph from the HaxBall avatar list is present, unlocked, unique and paints; two-character plates scale to fit inside the disc rather than spilling; picking one equips, persists and reaches the pitch live |
| `kickoffhead` | The KICK OFF button **is** the Match section's header: collapsed it's just the green bar with a chevron on its right, expanding shows the mode/field/difficulty pickers, pressing the button starts a match without toggling the section, the accordion still holds, and the sticky offset is measured from the header rather than the button nested inside it |
| `hitstop` | Hit stop is its own slider (0 = off, survives Screen shake being turned off, writes and persists) and the freeze only pays out on a **first touch** whose shot the game has walked forward and seen score: wide, backwards, too soft, dying short, wrong attacker and blocked-by-a-body all get nothing (the block is cross-checked against the real sim), a trapped-and-carried shot gets nothing even though it would score, nothing fires at kickoff or after the whistle, and the prediction is deterministic and provably inert — a whole-world diff across 25 predictions, since `collideDiscs` writes to both bodies |
| `netpass` | Players pass through the net, the ball still doesn't: every net wall is `ballOnly` and no wall blocks a player at all, while the collider itself still works (so the geometry didn't just vanish); a player walking sideways inside the goal mouth gets past the post instead of pinning at `gh - r`, enters the mouth but is stopped by the step-out clamp rather than the netting, and never reaches the net's back; checked on all 30 fields for both ball escapes and player escapes |
| `vjmode` | VJ Mode's four load-bearing claims: **off means untouched** (markings alpha is *exactly* 1 and the seam is a byte-identical no-op on a whole frame); **players are untouchable** — a video deck driven to full opacity over a probe pixel proven to be on a disc leaves it unchanged, which is a claim about draw order, and the suite first passed vacuously reading a black pixel that wasn't a player; **the line floor holds** at `VJ.lineFloor` for any deck value including absurd ones; and **zero sim impact** — 600 steps on one seed, VJ off vs both decks blazing, bit-identical. Plus the master clock (tap → 120 BPM, 240 folded into range, no-tempo fires now not never), both crossfader laws (equal-power with no hole; the cut law *holds full to centre then cuts*), a real −40dB kill EQ, a structured-cloneable snapshot with no audio nodes, an unknown command that must not throw, PANIC by call and by hotkey, a preset round trip carrying no media, and a 4-beat auto-loop reading the master clock |
| `themeslots` | A theme is a collection of five slots and "Custom" is derived: every slot is a real registry whose every option names itself; Pool sets all five (including `sel.snd`, checked against the arrays `playSfx` reads) and reaches the live render; changing one slot names it Custom, unmarks every bundle tile and leaves the other four alone; putting it back brings the name back, and assembling Pool slot-by-slot from Neon gets Pool's name too; a hand-picked sound reads Custom rather than throwing; every set's every variant exists and plays; the ball slot moves in both the Theme and Ball cards and the sound set in both the Theme and Sound cards; every option in every slot renders, plus a starfield over the Grass palette; and a legacy `theme`/`ballLook` save migrates to its bundle once, keeping a hand-picked ball look and a hand-picked whistle |
| `photo` | Your own photo as a faceplate: a 1600×900 source is stored **centre-cropped at 128²** and under 40KB (a camera-sized image would blow the localStorage budget), it's worn automatically, actually drawn on the disc and reaches a live match, it **never leaves the device** — the real leaderboard payload is intercepted and checked for `data:`/`base64`, and confirmed to carry only the word `photo` — it persists, Remove falls back rather than leaving a blank plate, Reset look clears it, and a refused camera leaves Upload working with a message that says so |
| `menunav` | Menu navigation: each big card shows one pane at a time with chips and panes matching **one-for-one** (a spare chip shows nothing, a spare pane can never be shown), only one pane visible at a time and every pane genuinely visible when its chip is pressed; both cards measurably shrank (599px and 749px, from 6777 and 3121 flat) and the tallest single pane still beats the old flat card; the 11 nav tiles are grouped under three labels with none lost, duplicated or unwired; and the jump bar is sticky, has a chip per section and no more, labels them, opens one section alone and marks which |
| `autoadvance` | Neither screen needs a button press to move on: the lobby counts down 30s and kicks off itself, going back to full on movement, on a stick pushed with **no** displacement (leaning into a wall still counts), and on a controller connecting — and never running at all during calibration; the result screen counts down 30s and starts the next match on the same field with the same teams and a reset score, holds the clock open while any input is held, says so in the hint, and stays out of drills |
| `goalbox` | The goal box mirrors the net exactly onto the pitch: it inks in front of BOTH goal lines with two sides, nothing one net-depth further out or one mouth-width further across (so the mirror is exact, not approximate), it's an outline not a fill, it never draws behind the line into the net, it is measurably fainter than the goal line (130 vs 415 ink) so the two can't be confused, and it holds on all 30 fields |
| `mapvote` | The end-of-match map rating is keyed on **(map, players per side)**, never the map alone: the same map at two sizes keeps two tallies, votes never leak between them, and the size follows the bodies actually fielded rather than the mode (a lobby 6v6 on a 4v4 records `6v6`). One vote per match, the tally reads back, it persists, it's absent in drills, and the career list ranks pairs best-first with an honest empty state |
| `dyntheme` | Dynamic visual themes: the registry is real, the field advances only on a **sim step** (rendering twice without stepping is byte-identical, so a 144Hz screen can't run it fast), and the starfield does move when stepped; `warp` is genuinely black and white by pixel sampling — 81 points across the pitch all satisfy R=G=B, including the discs, which no palette could guarantee since player colour comes from the profile — with a light field and black lines; `pool` paints baize, a dark pocket, and numbered solids vs stripes distinguished by the stripe's white shoulder |
| `matchend` | Full time eases play to a standstill before the result screen: the whistle goes and the state turns `over` at once (so nothing more can score) but the screen waits, per-250ms travel decays to under 15% of its peak and the sim is genuinely stopped once the screen is up; the result is two team panels reading players → score → awards, every player and ribbon under its own team, the winner marked, numbers equal to the tally; plus Warm-up reachable with the Match section collapsed and with no controller connected, and Reset look restoring the default profile live |
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

Two traps specific to a setting that is DERIVED rather than stored, both of which
would have let a bug through:

- **Prove both directions of the round trip.** The theme's name is computed by
  matching the live slots against the bundle table, so "changing a slot says Custom"
  is only half of it — a `currentBundle()` that ignored one slot passed that check and
  still lied. `themeslots` also assembles Pool slot-by-slot from a *different* bundle
  and asserts the name comes back.
- **A derived value can hold something with no name.** The sound slot is derived from
  `sel.snd`, which the Sound card edits one category at a time, so it can legitimately
  be a combination no set describes. `SLOTS.sfx.name('custom')` would throw — the label
  has to check `keys().includes()` first, and the suite drives that path deliberately.

A third VJ trap, which produced a silently STALE settings page rather than a failure:

- **`hello` is the whole handshake — do not add a second one.** The game's only full
  state push is gated on `!wasLive`, and every inbound message marks the peer live.
  A `vjhello` posted from the panel's build raced ahead of `hello`, swallowed the
  push, and the panel came up showing localStorage instead of the game's live state.
  Nothing threw and no console error appeared; `panel`'s `snapshotAdopted` is what
  caught it. Anything the panel needs at open must ride the existing `hello`.

Also, a flake worth naming: **a keydown is delivered asynchronously.** `keyfocus`
pressed ArrowUp and stepped immediately, reading a pad that had not seen the key yet
— about one run in nine under load. An extra round trip added while debugging made
it pass every time, which is the signature of a timing flake rather than a broken
feature. It now waits for `pads.p1` to actually show the key first.

Two traps specific to VJ Mode, both of which produced a false pass here:

- **Sabotage your own sabotage.** Moving the video composite to "after the players"
  by inserting it before `drawDiscs` is still *under* the players — the check
  correctly passed and it looked like the test was weak. Verify the sabotage landed
  and does what you meant before concluding anything about the test.
- **Prove the probe is on the thing.** The draw-order check sampled world (0,0) and
  read `[0,0,0]` — the disc's own rim colour, indistinguishable from missing the
  player entirely. It now searches for a pixel that differs from the bare pitch and
  asserts it found one, so the check cannot pass by sampling nothing.

Also: **`getBoundingClientRect` on a ROTATED element gives axis-aligned bounds.** The
collapsed chevron is `rotate(-90deg)`, so its rect "height" is really its width —
widening the button read as a height change and failed a check about height.
`offsetWidth`/`offsetHeight` give the untransformed layout box; the rect is only right
for position.

Also: `drawBundleSwatch` swaps the module-level `TH` for the duration of the paint,
because the disc skins and the ball painter read the live palette — previewing another
bundle without the swap silently wears the current one. If you add a painter that reads
`TH`, it inherits that, and a mixed slot combination (a starfield over the Grass palette)
is a legitimate setting someone can pick, so fall back through the palette
(`TH.dynMark || TH.line`) rather than a hard-coded colour.

Also: with a gamepad connected a seat's `ctrl` becomes `'gamepad'`, so `pads.p1` no longer
drives it — feed the fake pad instead. And in a sideways pitch `rotQuarter=1`, so stick-up
moves the player along world **+x**; measure displacement, not a single axis.
