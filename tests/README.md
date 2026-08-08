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
| `killerqueen` | Killer Queen: **the snail is kickable and still heavy** — one kick moves it twice as far as a full-speed body check while the same kick sends the ball twenty times further, it is slower off the boot than the ball, it can never be trapped, and holding KICK is one shove rather than a shove per frame (⚠️ measured ACROSS the pitch on a big court: kicking toward a goal ends the match or re-serves the ball, and the first version read that reset as travel and made the snail look lighter than the ball). Plus the heavy non-resetting snail, goals that don't reset play, snail = instant win, and exactly one *scoring* ball among the bodies — the body count is derived from `BERRY.count` rather than pinned at two, because the mode gained berries and a pinned count only measures how recently someone edited it (see `kqberry`) |
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
| `botlook` | Bots wear their own face/cap/eyes — never yours — vary from each other, and stay stable across restarts | Bots wear **no cap** (they used to cycle the whole CAPS table); they stay individuals through colour, shirt number and eyes.
| `cocktailkeys` | Cocktail takes the keyboard off the pitch and seats player 1 on a controller; picking it keeps you on the menu able to kick off; pitch direction is locked and says why |
| `tells` | Motion tells by **canvas pixel sampling** (incl. the charge ring flashing as a full circle rather than sweeping): moving players leave ink, parked ones don't, ball streak scales with speed, wind-up shows on the disc, and both read on **all six themes** |
| `themetiles` | The two grids in the Theme card are different pictures: the **Background** slot shows each palette as a painted canvas (no emoji) — one tile per palette, all distinct, every band sampled back to that palette's own colours — while the **Bundle** row shows the whole collection (its field, its players, its ball) and is asserted to differ pixel-wise from the palette tile it sits above; picking a palette alone switches the colours *and* makes the theme Custom |
| `contrast` | No label sits on a colour too close to it: every visible text element on every screen under every theme is held to WCAG AA against its **composited** background, plus the goal banner's outline; includes a known-bad probe so a clean run can't be vacuous |
| `awards` | End-of-match awards state the figure that won them ("Most Saves · 5 saves"), the number matches the tally that picked the winner, singulars stay singular, and it reaches the DOM |
| `kickpush` | Optional "kick off walls & players": off by default and provably inert when off; on, a wall/arc/post launches you *away* from it on all four boundaries, charge scales it, a body takes the shove while you take the smaller recoil along the same line, empty space and out-of-range targets do nothing, one press is one launch with a cooldown, it never fires at kickoff or after the whistle, the ball is untouched, and the picker writes and persists |
| `lobby` | Warm-up lobby + the game-over chooser: pads in play drop into `warmup` first (keyboard-only doesn't), bots the plan needs **walk on** to the middle of their own half and settle there (surplus ones walk back off), re-balancing live when everyone crowds one side, and they never run the AI; the ball can't be disturbed, sticks and KICK are testable; standing on a half picks your team and standing **outside** sits the match out, sides always come out equal (2v1 → 2v2, solo auto-assigns), **everyone on one side stays together** — six controllers on one half is a 6v6 against bots, not 3v3 against each other — with bots built to order when the mode's roster runs short and the roster settling rather than growing a body per trip to the lobby; the mode's seat count is the real ceiling (a 9th pad in a 4v4 is never seated); a benched player still moves but can never re-enter mid-match and can't wander off screen; cocktail calibration takes one arrow at a time, ignores short holds and face buttons, accepts stick or dpad, persists the seat's side and is proved by the player then moving *up* the screen; the result screen offers Restart (default, same teams) and Warm-up, and only **Player 1's** pad can move the selection |
| `matchstats` | The result screen carries the full scoresheet: a row per player, every number equal to the tally it came from, your row marked, both teams tagged, discs actually drawn, cleared between matches and absent in drills. ⚠️ Plus the three things the **acronym cull** has to satisfy at once, which pull against each other on purpose. It shipped as EIGHT acronym columns (`G A SH SV CL KP PST TCH`) with the key that decodes them at the BOTTOM of the screen — on a phone the panels stack, so the legend sat two screens below the headings it explained — and 52 of a 4v4's 64 cells read `0`, so twelve real numbers hid among fifty-two zeros. So: (1) every heading is a WORD (checked on LENGTH — a heading you look up is not a heading) and no key is left behind; (2) NOTHING was lost — every non-zero stat without a column still appears in the prose line as a number AND a word, which is what stops "less info" quietly becoming "lost info"; (3) it FITS, measured as row `scrollWidth` against panel `clientWidth` in a full 4v4 at **360px**, which is the complaint that started it and the half of it nothing else here measured. Also: a player with nothing to report gets NO line (five spelled zeros is longer *and* says less than silence), zeros are classed so they recede, and `touches` is in neither list — it is the one stat every player always has, so it put a prose line on every single row |
| `balllook` | The Skins card is gone (no `ballSkin`/`playerSkin`, nothing "needs art"), and the ball has nine **drawn** looks: all paint, all differ, none spills outside the ball, the pattern turns with spin while Plain doesn't, picking one persists and shows on the pitch — and no request is made for sprite art | Also that the **pattern is visible on the ball under every palette**: `ballSpotInk` is checked to clear `BALL_SPOT_CONTRAST` for all nine, to leave a readable spot untouched (Neon), to have actually changed the unreadable one (Pool), and — in real pixels — that a patterned ball under Pool is measurably darker than a plain one. Verified to fail when the painter takes the raw palette value.
| `textplates` | Players wear shirt **numbers** by default (you are 1, your bots 2+, the opposition starts again at 1, no clashes within a side); every glyph from the HaxBall avatar list is present, unlocked, unique and paints; two-character plates scale to fit inside the disc rather than spilling; picking one equips, persists and reaches the pitch live |
| `kickoffhead` | The KICK OFF button **is** the Match section's header: collapsed it's just the green bar with a chevron on its right, expanding shows the mode/field/difficulty pickers, pressing the button starts a match without toggling the section, the accordion still holds, and the sticky offset is measured from the header rather than the button nested inside it |
| `hitstop` | Hit stop is its own slider (0 = off, survives Screen shake being turned off, writes and persists) and the freeze only pays out on a **first touch** whose shot the game has walked forward and seen score: wide, backwards, too soft, dying short, wrong attacker and blocked-by-a-body all get nothing (the block is cross-checked against the real sim), a trapped-and-carried shot gets nothing even though it would score, nothing fires at kickoff or after the whistle, and the prediction is deterministic and provably inert — a whole-world diff across 25 predictions, since `collideDiscs` writes to both bodies |
| `netpass` | Players pass through the net, the ball still doesn't: every net wall is `ballOnly` and no wall blocks a player at all, while the collider itself still works (so the geometry didn't just vanish); a player walking sideways inside the goal mouth gets past the post instead of pinning at `gh - r`, enters the mouth but is stopped by the step-out clamp rather than the netting, and never reaches the net's back; checked on all 30 fields for both ball escapes and player escapes |
| `vjmode` | VJ Mode's four load-bearing claims: **off means untouched** (markings alpha is *exactly* 1 and the seam is a byte-identical no-op on a whole frame); **players are untouchable** — a video deck driven to full opacity over a probe pixel proven to be on a disc leaves it unchanged, which is a claim about draw order, and the suite first passed vacuously reading a black pixel that wasn't a player; **the line floor holds** at `VJ.lineFloor` for any deck value including absurd ones; and **zero sim impact** — 600 steps on one seed, VJ off vs both decks blazing, bit-identical. Plus the master clock (tap → 120 BPM, 240 folded into range, no-tempo fires now not never), both crossfader laws (equal-power with no hole; the cut law *holds full to centre then cuts*), a real −40dB kill EQ, a structured-cloneable snapshot with no audio nodes, an unknown command that must not throw, PANIC by call and by hotkey, a preset round trip carrying no media, and a 4-beat auto-loop reading the master clock |
| `swupdate` | A deploy has to reach **/settings**, not just the game page. Serves a throwaway site from a temp dir, registers the **real** `sw.js`, changes `index.html` on disk, then asks for it the way the settings stub does (`fetch`, not a navigation). Verified to fail on the old predicate: it served the stale build to both the bare fetch and the real `/settings` route. Also checks a navigation still updates and that offline still falls back to cache |
| `goalcam` | The goal push-in: latches onto the scorer, is **step-locked** (two draws must not advance it), ramps smoothly to `GOALCAM.zoom`, genuinely zooms rather than panning, lands the scorer dead-centre, always lets go of both the zoom *and* the pan, stands down while a replay owns the framing, does nothing with effects off, and leaves the world bit-identical over 300 steps. ⚠️ Two traps recorded in it: sampling the peak after the 1.8s goal state has ended measures the ease-*back*, and the camera centres on the **pitch viewport** (`padL + availW/2`), not the canvas — comparing against the canvas centre read exactly the dock width and looked like broken maths. ⚠️ A third: “it zoomed rather than panned” was written `cam.s > base * 2`, which was only ever true because the shipped default happened to be 5× — the moment the default became a **5% push in 0.10s** it failed a camera working perfectly. It is measured against the DIAL now (most of what the dial asked for), and that a bigger dial gives a bigger push is a separate check | Plus the two **dials**: the sliders reach the camera, a 2.5× setting peaks at 2.5×, a 0.40s setting reaches full in 24 steps rather than 69 (the 0.10s default takes 6), **1.0× means off** (no latch at all), and out-of-range values are clamped rather than obeyed.
| `traillook` | The **trail slot** — what the tell behind a player looks like. Every look draws (and `none` draws nothing), no two render the same picture, every one has a picker swatch through the real painter, and the slot survives a reload. ⚠️ Two lines it holds. A look only DRAWS: where a dot is dropped and how fast it fades stay in `advanceTrails`, which runs in the step loop, because the LENGTH of a tell is how far someone just came — the same history is driven by hand under every look and must come out identical, and the dot count is asserted first so "identical" isn't a comparison of two empty lists. And the BALL keeps its streak whatever the slot says: it is the one thing everybody is tracking. ⚠️ That second check first fired the ball across the pitch WIDTH at full speed for 26 steps, which put it through the side wall and into a goal, so the two runs were comparing different matches |
| `surfacefeel` | The playing surface, and the replay's field clock. ⚠️ `PITCH` held ABSOLUTE accel/damp and the world took them on Ice and Mud but took the Game Feel sliders on Grass — so Speed and Grip silently did nothing on two of the three surfaces and switching pitch threw away whatever you had tuned. The surface is a multiplier now, through one `surfaceFeel()` that a match, a drill and a live slider change all go through. Checks the DEFAULT sliders still give the old 0.40/0.905, 0.26/0.955, 0.34/0.86 (else it is a rebalance wearing a refactor's clothes), that the sliders reach every surface, that ice > grass > mud for glide at every feel setting, that no setting pushes damping to 1 (a player who never slows down), and that a drill builds movement identically to a match. ⚠️ `glide` scales the per-step LOSS, not the damping factor — scaling 0.905 by 1.05 is above 1. Plus: an animated field must keep moving through a REPLAY, driven through the real `playReplay` — a replay is not the step loop, so `advanceDynField` was never called and every animated theme froze the moment a goal went in |
| `swatchcache` | Picker swatches are cached, in the right two buckets, and handed out as copies. ⚠️ Every option tile is a canvas and the FIELD tiles bake their real texture at full resolution for a 64px preview — a 384-square dither written as ImageData, eleven strips of 60px type, a nebula — while `buildSlotPicker` runs on every slot change and used a throwaway state per tile. Measured at 15.6ms for the field row and 17.3ms for the bundle row: opening the Theme card dropped two frames and every tap inside it dropped another. ⚠️ TWO buckets, because a bundle tile paints with TH swapped to its OWN palette and a palette tile reads THEMES directly — neither can go stale, and putting them in the map dropped on a theme change re-paid the whole bundle row at the one moment you are looking at it. ⚠️ And the caller gets a COPY: the Theme card stacks all six slots while the Ball and Sound cards show one AGAIN, so two tiles ask for the same swatch and handing both the same node MOVES it out of the first row. Also holds the other direction — a field tile must render differently over two palettes, or dropping the live bucket is pure waste and the key is wrong |
| `sectionindex` | The SECTION INDEX at the top of `index.html`, kept honest. ⚠️ It lists MARKER STRINGS and never line numbers, because a line number is wrong the moment anybody edits above it and wrong *silently* — a stale map is worse than none. Every quoted marker must resolve to exactly one place in the rest of the file, there must be at least 40 of them, and the index must not have quietly started quoting line numbers (the failure a reviewer waves through). No browser: a text check, milliseconds |
| `dropin` | Joining a match already under way: the touchline, the START, and evening the sides up. ⚠️ Seats were handed out exactly ONCE, in `startMatch`, so a pad woken after the whistle did nothing for the rest of the match — and the first fix over-corrected, taking a bot over the instant any button went down, mid-play, with no side pick and no say in when. Five things, which pull against each other on purpose: (1) a new pad gets a body OUTSIDE the pitch and the roster is byte-for-byte untouched — that is what makes appearing on CONNECTION safe, and it stops being safe the moment it touches the match; (2) it comes on only AT A GOAL and only if it asked — checked by arming it and then driving 60 steps of PLAY, because "they join between goals" is the whole timing rule; (3) the side is the half it stood beside, with undecided falling to what Extra controllers already means; (4) the match GROWS (3v3 → 4v4, 1v1 → 2v2) and shrinks back, with the CAP held against 14 arriving pads and the FLOOR read off the kickoff roster rather than `mode.per` (the lobby fields six a side on a 4v4, so a floor of 4 would strip two bots off each side); (5) whole world hashed over 600 steps with the machinery firing and without. Also: the walk-on goes through the gate and the AI is suppressed for it, unplugging keeps name and stats and leaves the player on the scoresheet via `matchRoster`, a returning pad reclaims its own body, `evenUpSides` is idempotent, and the touchline prompt is drawn and honest. ⚠️ Traps recorded in it: `PADS = []` before `startMatch` or the pad takes a seat at the whistle and there is no drop-in to test; the state gates are polled WITHOUT stepping (`w.state='warmup'` on a match not built as a lobby has no `w.lobby` for `stepWarmup`); and `localStorage.clear()` must stay OUT of `addInitScript`, which runs again on the reload the persistence check depends on |
| `tilt` | The phone-tilt parallax: FOUR depths, and none of it touching the game. The stack is checked as an ORDER (turf behind markings behind bodies behind UI) rather than four magic numbers, so retuning `TILT` cannot quietly break the thing the constants are for, and the turf/markings gap is held SMALL — the touchline is a marking and the grass is the turf beneath it, so a real gap stops reading as a bevel and reads as a misaligned pitch. The HUD's shift is checked on a real BUTTON's `getBoundingClientRect`, not just the wrapper's style string: it moves by a CSS transform precisely so the tap target goes with the picture, and a pause button drawn 9px from where it can be pressed is worse than one that does not move. The RESTING thumbstick marker rides the UI layer and a LIVE one must NOT — a control being touched is attached to your thumb, while one at rest is decoration. Five more things: (1) RENDER ONLY — whole world hashed over 600 steps with the tilt swinging hard and with it flat; (2) the two layers move in OPPOSITE directions and the SHADOW stays on the ground, because a shadow that travels with the body is a sticker and the gap opening between them is the entire height cue; (3) STEP-LOCKED — a draw must not advance it, and one step must move it toward the target without arriving; (4) the neutral position DRIFTS to however you are actually holding the phone, and the first reading is adopted outright (else "level" means flat on a table and playing lying down pins it at full deflection); (5) off on desktop, off under `prefers-reduced-motion` (emulated for real), off when the setting says so. ⚠️ **FOUR measurement traps, all of which produced confident wrong answers here.** (a) `render()` is only idempotent once the SCREEN SHAKE has decayed — shake jitters the whole pitch by `Math.random()` on every draw, so with any left over two shots of the same state differ everywhere and a difference probe reports the entire window as the body: 58px of "growth" for a 7px lift. `decayJuice` is step-locked, so a block that never steps must wind it down by hand, and leftover sparks and a latched goal camera do the same thing for the same reason. (b) Colour-matching the team ink finds nothing — a Classic disc is mostly the player's OWN colour with a face over it and a thin team ring. (c) "The darkest pixel in a row" locks onto the disc's own rim. (d) A window wide enough to include the NAME PLATE measures the plate's adaptive alpha wobbling instead of the parallax. What works is differencing the same frame with and without the body, in a window tight around the disc and its shadow. ⚠️ And: three different values named `lift` across four spread result objects silently clobbered each other, so a passing check printed a wrong number and a failing one blamed the code |
| `padkick` | A is the kick button on every pad, not just the ones reporting a standard layout. ⚠️ The shipped default was the literal index `0`, read as an exact button — `0` is A under the STANDARD mapping, but a pad reporting non-standard numbers its buttons however it likes, so the kick pointed at whatever was numbered 0 and silently never fired. Default is `null` now = A plus the usual fire set; a button bound in Controls is still exact. Driven with fake pads through `padKickHeld` and `gamepadPad`, never by setting `p.kick` (which the next step overwrites). Also: the legacy `0` is folded to `null`, but a DELIBERATE bind of kick to A is kept — without `kickBound` the fold would undo a choice just made — and the Controls readout says what an unbound kick actually does rather than showing a dash |
| `themeslots` | A theme is a collection of six slots and "Custom" is derived: every slot is a real registry whose every option names itself; Pool sets all five (including `sel.snd`, checked against the arrays `playSfx` reads) and reaches the live render; changing one slot names it Custom, unmarks every bundle tile and leaves the other four alone; putting it back brings the name back, and assembling Pool slot-by-slot from Neon gets Pool's name too; a hand-picked sound reads Custom rather than throwing; every set's every variant exists and plays; the ball slot moves in both the Theme and Ball cards and the sound set in both the Theme and Sound cards; every option in every slot renders, plus a starfield over the Grass palette; and a legacy `theme`/`ballLook` save migrates to its bundle once, keeping a hand-picked ball look and a hand-picked whistle |
| `kqberry` | Killer Queen berries and the hive: six floaty purple bodies spawn mirrored top and bottom inside the spawn ring, a berry reaching a goal **banks** into that end's hive rather than scoring, filling `BERRY.cells` wins the match outright and the result screen says HIVE rather than SNAIL. ⚠️ Two traps recorded in it. The first build parked a banked berry at (99999, 99999) — the way the code parks anything it wants ignored — and `clampBallInside` dragged it straight back onto the pitch to bank again; being out of play is a FLAG, honoured by `integrate`, the ball-vs-ball pass, `checkGoal` and the draw, and the suite sabotage-checks both by moving a banked berry and by batting it with a player. The second: berries spawn off `w.rng`, which `botInit` seeds — spawned before that call they fell back to `Math.random` and the opening layout differed every match, so two matches on one seed are compared position by position and a 40s run is replayed whole. Plus pixel sampling that a filled cell is drawn purple inside the net pocket and its neighbour isn't, that each goal's hive belongs to the team attacking it, that the float bob is step-locked (three draws must not advance it), and that none of it leaks into a normal 1v1 |
| `determinism` | Checkpoint 1 from the audit, standing as a permanent guard now the audit is CLOSED at same-engine reproducibility: the WHOLE world hashed at frames 600 / 1800 / 3600 across two runs on one seed must be identical, in 4v4 and in Killer Queen, while a different seed must give a different match and the world must actually have moved (a suite that compares `score` passes on two completely different matches that finished level). Plus the one rule everything rests on — `Math.random` never reached from inside `step()`, trapped with a **throwing** stub rather than a counter, which is how it caught `spawnKickFx` and the audio noise fill |
| `bigcourt` | Leviathan (2640×4640, 4× Colossus) and the render-only body size floor. The ball never leaves over 90 seconds, goals still happen, it takes 20.3s to run its length, and the goal stays a third of the width like every other court. The floor takes a 2.25px disc to 7px on Leviathan and is **exactly 1** on Classic — not about 1, since a floor that quietly scales every disc on an ordinary court is a redesign. ⚠️ And it is render-only in the only sense that means anything: the same seed stepped 900 frames with the floor honoured and with it forced to 1 must leave the world bit-identical |
| `boxrule` | Goal box occupancy — one keeper, one attacker. Four defenders packed on their own line become one; an attacker may join and does **not** evict the keeper; the slot is sticky over 240 steps (recomputing "who is deepest" every step made two defenders trade it and shove each other out on alternate frames) and is released when its holder walks out; both ends are policed; the enforced edge is the **drawn** edge, probed a hair either side of it; off means off; training and drills are exempt. Plus a bot sanity pass — goals still go in and nobody vibrates on the box edge. ⚠️ Two traps recorded: leaving the AI running measures bots wandering off rather than the rule, and stacking the edge probes on x=0 makes the player being pushed out collide with the one outside, which reads as the rule moving someone it never touched |
| `icons` | The drawn icon set that replaced the menu's emoji: every registry entry draws a real shape (not a sliver or a typo'd path), no two share a path (two things looking identical is worse than the emoji were), none carries a baked colour instead of `currentColor`, every declared `icon:` exists, and the functional tables are **fully** converted rather than half. ⚠️ The line it holds: `CAPS`/`EYES`/`ANIMALS`/`TEXTS` must have **no** icon field — there the emoji is the item and `paintCap` draws that exact glyph on the disc. ⚠️ And it checks the ⚡ collision explicitly: match-length Quick and difficulty Elite share an emoji and must resolve to different icons, which fails the moment somebody reintroduces a by-emoji lookup. Plus: nav tiles all painted with no leftover emoji, an unmapped entry keeps its emoji, an unknown icon name falls back rather than rendering nothing, and the difficulty ramp is monotonic with all seven steps drawn |
| `discskins` | The guide ring every theme must have, and the rotation choice. Pixel-checks **every** skin in the registry (not a list somebody remembered to update), both teams, all the way round — which caught the ring being invisible on Mono's white disc and drove it to two tones. Plus: rotation on turns the body, off points it up its OWN pitch, a player facing exactly along x doesn't get the fallback (`faceY === 0` is falsy), direction-drawn skins change with the setting while round ones do not, the two-frame leg animation is driven by distance and not a clock (a draw must not advance it, it stops when the player stops, frame 0 is the rest pose, and faster travel means more flips over the same steps), the two sides differ by SILHOUETTE (crab stubby vs lobster long, measured off covered pixels — the discriminator has had to change with the pairing twice, which is the argument for measuring rather than asserting it), all three creatures are still in the registry with more than one pairing offered, the shrimp is still the curled one, a legacy save on the old single-skin key migrates, and neither body breaks out of its ring in either walk frame, and the Shrimp bundle sets field+discs, plays a minute with no escapes, and has a seabed that is scattered once rather than re-rolled per paint. ⚠️ Two traps: the court isn't one flat colour under every theme, so compare the same angle before and after rather than against a background sample; and call the real `strokeDiscGuide` rather than reconstructing it, or the test passes while the shipped painter is broken |
| `hints` | Progressive disclosure of the help text. ⚠️ The line it holds is that **no copy is lost**: every paragraph is still in the DOM in full (3,963 characters across 22 folded + 3 always-open), captured and compared rather than trusting that folding is not deleting. Plus: everything starts collapsed and nothing persists, one toggle per folded paragraph and it opens **its own** without opening the others, aria tracks the state, gameplay-affecting help has no toggle and is never folded, a data readout borrowing `.hint` styling is marked rather than silently skipped (so "unclassified" means a real bug), and two consecutive rebuilds do not add toggles — which caught six paragraphs that `buildSettings` creates itself sitting permanently expanded |
| `touchstart` | A touch-only player could not start a match. ⚠️ Measured before the fix: Start was bound to a gamepad button or Enter and nothing to touch, and in cocktail — which forces the lobby regardless of what is connected — an engaged touch player sat in it for **90 simulated seconds** without leaving, because the idle auto-start resets on movement. The suite checks the new on-screen Start shows, picks a side by walking, fills the rest with bots, starts through the same `lobbyStart()` path with balanced sides, hides during a match and during calibration, and makes cocktail calibrate before it will start. ⚠️ It checks the DEFAULT as carefully as the new path: `lobby:'on'` must still skip the lobby entirely for a touch player, because a defect fix that changes what everyone else sees is a second defect |
| `photo` | Your own photo as a faceplate: a 1600×900 source is stored **centre-cropped at 128²** and under 40KB (a camera-sized image would blow the localStorage budget), it's worn automatically, actually drawn on the disc and reaches a live match, it **never leaves the device** — the real leaderboard payload is intercepted and checked for `data:`/`base64`, and confirmed to carry only the word `photo` — it persists, Remove falls back rather than leaving a blank plate, Reset look clears it, and a refused camera leaves Upload working with a message that says so |
| `menunav` | Menu navigation: each big card shows one pane at a time with chips and panes matching **one-for-one** (a spare chip shows nothing, a spare pane can never be shown), only one pane visible at a time and every pane genuinely visible when its chip is pressed; both cards measurably shrank (599px and 749px, from 6777 and 3121 flat) and the tallest single pane still beats the old flat card; the 11 nav tiles are grouped under three labels with none lost, duplicated or unwired; and the jump bar is sticky, has a chip per section and no more, labels them, opens one section alone and marks which |
| `autoadvance` | Neither screen needs a button press to move on: the lobby counts down 30s and kicks off itself, going back to full on movement, on a stick pushed with **no** displacement (leaning into a wall still counts), and on a controller connecting — and never running at all during calibration; the result screen counts down 30s and starts the next match on the same field with the same teams and a reset score, holds the clock open while any input is held, says so in the hint, and stays out of drills |
| `goalbox` | The goal box mirrors the net exactly onto the pitch: it inks in front of BOTH goal lines with two sides, nothing one net-depth further out or one mouth-width further across (so the mirror is exact, not approximate), it's an outline not a fill, it never draws behind the line into the net, it is measurably fainter than the goal line (130 vs 415 ink) so the two can't be confused, and it holds on all 30 fields |
| `mapvote` | The end-of-match map rating is keyed on **(map, players per side)**, never the map alone: the same map at two sizes keeps two tallies, votes never leak between them, and the size follows the bodies actually fielded rather than the mode (a lobby 6v6 on a 4v4 records `6v6`). One vote per match, the tally reads back, it persists, it's absent in drills, and the career list ranks pairs best-first with an honest empty state |
| `dyntheme` | (incl. **Highlighter**: the court is yellow, both discs are white and are separated by a black BAR run different ways — checked as a shape, since two white discs with no mark are the same disc — and the dither is cached, ramps from the ends to nothing at halfway, never goes solid, and rebuilds when the ink changes. ⚠️ It caught the Bayer threshold bug: the lowest matrix value is zero, so `dens > B/16` filled one cell in sixteen even where the ramp said clear. And **Videoball arrowheads**: a team-coloured ring inked right round the body at radius r, nothing drawn where the old 1.55r nose and 1.05r wings used to reach, an arrowhead that points along the facing with a notched tail. ⚠️ Three measurement traps recorded: the court is BANDED so "differs from one background sample" is true of half the empty court; the ring stroke is centred on r so a 0.97r sample sits on its antialiased inner edge and reads as a gap; and the arrowhead is a few pixels across near the tip where its own outline covers it, so a tip sample reports it missing. It found a real bug — `p.faceY || fallback` made a player facing exactly along x point diagonally.)  Dynamic visual themes: the registry is real, the field advances only on a **sim step** (rendering twice without stepping is byte-identical, so a 144Hz screen can't run it fast), and the starfield does move when stepped; `warp` is genuinely black and white by pixel sampling — 81 points across the pitch all satisfy R=G=B, including the discs, which no palette could guarantee since player colour comes from the profile — with a light field and black lines; `pool` paints baize, a dark pocket, and numbered solids vs stripes distinguished by the stripe's white shoulder | The pool table's **cushions** are checked by pixel too: the goal mouth is a gap in the wood (rails used to run straight through it), the play area is baize right up to the boundary and the timber is outside it (wood inside meant the ball rolled over the cushion instead of bouncing off its face), and on a chamfered field no court colour is stranded in the cut corners.
| `matchend` | Full time eases play to a standstill before the result screen: the whistle goes and the state turns `over` at once (so nothing more can score) but the screen waits, per-250ms travel decays to under 15% of its peak and the sim is genuinely stopped once the screen is up; the result is two team panels reading players → score → awards, every player and ribbon under its own team, the winner marked, numbers equal to the tally; plus Warm-up reachable with the Match section collapsed and with no controller connected, and Reset look restoring the default profile live | Full time also has its **own** whistle — a progressive triple (BEE-BEE-BEEEEP) asserted by intercepting `Aud.tone`/`Aud.noise` on the exported `Aud` object rather than parsing source: exactly three separated blasts, short-short-long with the last 3× the first, gliding in pitch, fitting inside the wind-down, different from the kickoff peep, every variant audible, and every themed sound set naming one.
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

Two flakes worth naming, from the same check in `keyfocus`:

- **A keydown is delivered asynchronously.** It pressed ArrowUp and stepped
  immediately, reading a pad that had not seen the key yet. An extra round trip added
  while debugging made it pass every time, which is the signature of a timing flake
  rather than a broken feature. It now waits for `pads.p1` to show the key.
- **Don't inherit state from the sections above you.** Even once the key provably
  reached the pad it still failed about one run in eight, because the world could be
  mid-kickoff — where the half-line gate holds the player still. The check was
  reporting a true fact about the kickoff rule and nothing at all about the arrows.
  It pins `state`, `kickoffRule` and the ball position before measuring.

Two traps from the pool table's cushions, both of which made a wrong picture look right:

- **A path helper that calls `beginPath()` cannot be composed.** The cushion is the
  field outline stroked at double width and clipped to the outside of itself via an
  even-odd clip of `[enclosing rect, field path, goal mouths]`. The helper began its
  own path, which silently wiped the enclosing rect — inverting the clip so the wood
  landed INSIDE the play area, exactly the bug being fixed. It looked plausible on
  screen. Scanning pixels across the boundary is what found it.
- **Sample away from features.** The first probes for "is the boundary baize" and "is
  there wood outside it" read `(halfW, 0)` — which is the halfway line and a side
  pocket — and got white and black. Both probes now sit at 0.4 of the way down,
  clear of the line, the pocket and the goal.

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
