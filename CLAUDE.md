# CLAUDE.md — working on Magnetball

Guidance for Claude Code (or any contributor) working in this repo.

## What this is
A **single-file** HTML5 canvas game. **Everything lives in `index.html`** — HTML, CSS, and all game
JS (wrapped in one `(function(){ "use strict"; … })()` IIFE). There is **no build step, no bundler,
no package manager, and no runtime dependencies**. `sw.js`, `manifest.json`, `icon.svg`,
`assets/` and `settings/index.html` are the only other runtime files.

**Hard rules**
- Keep it dependency-free and self-contained. No npm packages shipped to the page, no CDN scripts,
  no external fonts/images required to play (assets in `assets/` are optional enhancements with
  graceful fallback).
- Everything is served over relative paths (`./`, `sw.js`, `assets/…`) so it works at any root.
- Prefer editing `index.html` in place; match the surrounding terse, comment-light-but-present style.

## Architecture (all in `index.html`)
- **Loop:** `loop(t)` → fixed-timestep accumulator calling `step(w)` at `STEP = 1/60`, then
  `render()` with `renderAlpha = acc/STEP` so `ix(e)`/`iy(e)` interpolate between steps.
  Juice: `shake`, `hitStop`, goal `slow`-mo.
  ⚠️ **Anything that advances over time belongs in the step loop, not in a draw.** Trails
  (`advanceTrails`) and shake/flash (`decayJuice`) are called next to `step(world)` for this
  reason: when they ticked inside `render()` a 144Hz screen ran them 2.4× fast and the same
  match showed a 69-unit ball streak instead of 190. Draw functions only draw. Equally,
  anything anchored to a moving body must use `ix`/`iy`, not the raw position — mid-step
  they differ by up to a full step of travel. `tests/smooth.mjs` holds both lines.
- **Hit stop:** its own dial (`sel.hitStop`, `hitStopFrames()`), deliberately *not* under the
  Screen shake toggle. Fires on a goal, and on a **first touch** whose shot `predictsGoal()` has
  walked forward and seen go in — never on `releaseTrap` (a carried shot isn't a first touch).
  ⚠️ `predictsGoal` re-uses the real `moveBall`/`collide*` so it can't disagree with the physics,
  and `collideDiscs` writes to **both** bodies — so it runs on reused scratch copies and must stay
  provably inert. `tests/hitstop.mjs` diffs the whole world across 25 predictions.
- **State machine:** `world.state` ∈ `kickoff | play | goal | warmup | over`; `step()` advances it.
- **Full time:** `endMatch(w)` blows the whistle and sets `w.endRamp = 0`; `loop()` eases the step
  rate 1→0 over `FINAL_SLOW` seconds, then `finishMatch(w)` shows the result. ⚠️ The ramp is
  counted in `loop()` off **wall-clock**, never in `step()` — the sim rate is the thing being wound
  down, so it can't also be what measures the wind-down. `step()` integrates during `over` **only**
  while `endRamp != null`, otherwise the pitch freezes solid and there's nothing to see.
  Tests wanting the screen immediately call `endMatch` then `finishMatch`.
- **Result screen:** one panel per team (`renderMatchStats` → `.tpanel`), each reading players →
  score → that team's awards. `computeAwards` stays the one source of who won what; `awardRow`
  is the one place a ribbon is built. `renderAwards` now only holds the replay/clip footer.
  ⚠️ **Three SPELLED columns, and the rest is prose.** `STAT_COLS` is Goals / Assists / Saves;
  `STAT_MORE` + `statLine()` put everything else under the name as words, **only when non-zero**.
  It shipped as eight acronym columns — `G A SH SV CL KP PST TCH` — with the key that decodes
  them at the *bottom* of the screen, which on a phone stacks the panels and leaves the legend
  two screens below the headings it explains. And most of the grid was noughts: a 4v4 is
  8 players × 8 columns and **52 of those 64 cells read `0`**, so twelve real numbers hid among
  fifty-two zeros. Nothing was lost — the five cut columns moved into the prose — so there is no
  acronym key any more, because there is no jargon left to decode. A player who did nothing gets
  **no line at all** (five spelled zeros is longer *and* says less than silence), and a `0` in a
  column is classed `.z` so it recedes. ⚠️ **Touches is in neither list**: "5 touches" answers
  nothing anybody asks after a match, and being the one stat every player always has, it put a
  prose line on every single row. It still feeds `mvpScore`. `tests/matchstats.mjs` holds all
  three sides of this — headings are words, nothing non-zero is lost, and the row fits a 360px
  phone without overflowing its panel.
  ⚠️ **`#overlay` MUST SCROLL, and `safe center` is what makes that true.** A 3v3 result on a
  390×844 phone is 1087px of content; with plain `justify-content: center` an overflowing flex
  column pushes its first child *out of the box* — the title sat at **y = −271**, unreachable —
  and `overflow: visible` meant Restart / Warm-up / Main Menu at y = 845…1046 could not be
  pressed either. A touch-only player who finished a match was **stuck** until the 30s
  auto-advance. `safe center` centres while it fits and falls back to flex-start the moment it
  doesn't, so nothing is ever parked off the top; it is listed *after* the plain `center` so an
  older browser drops the line instead of the rule. Also `overflow-y: auto`,
  `overscroll-behavior: contain`, and `#overlay > * { flex: 0 0 auto }` — flex children shrink
  before they overflow, which squashed the panels instead of letting the screen scroll.
  ⚠️ **A ribbon cap per PLAYER** (`AWARD_PER_PLAYER`, 2). Every award is a `topBy`, so one
  player who ran the match takes **all eight** — half a phone screen saying one thing eight
  times. The dropped ones are *not* handed down to the runner-up: "Most Saves" belongs to
  whoever made the most saves, and filling the row with second place would be a lie.
  ⚠️ **Hat Trick REPLACES Most Goals**, it is not a second ribbon — same stat, same `topBy`,
  same note, so a 3-goal scorer collected "Most Goals · 3 goals" *and* "Hat Trick · 3 goals".
  ⚠️ **The per-player table FOLDS on a phone** (`statsOpen`, `STATS_WIDE`, `#ovStats.lean`):
  the heading is the control and a 44px target, the score and the ribbons stay because they
  are the result rather than a breakdown of it, rows are hidden and never deleted, and the
  choice is sticky for the session. Wide screens start open — the fold is a phone answer to a
  phone problem. `tests/resultfit.mjs`, which measures "pressable" by scrolling to a button and
  hit-testing its centre, never by whether it happens to be on screen.
- **Physics:** `integrate(w, ballFrozen, playersFrozen)` moves players then balls. `moveBall(w,ball,discs)`
  sub-steps a ball and collides vs players/posts/walls/arcs; `clampBallInside(w,ball)` is the hard
  containment backstop (the ball must NEVER leave the pitch except through the goal mouth — verify on
  every field after physics changes). Collisions: `collideDiscs`, `collideWall`, `collideArc`.
  Multi-ball extras live in `world.extraBalls`. Walls/arcs flagged `ballOnly` contain the
  **ball** but not players — that's every boundary INCLUDING the net, so the HaxBall-style
  step-out margin is uniform all the way round. What actually holds a player in is
  `integrate`'s clamp to `halfL/halfW + 20`, never a wall. `tests/netpass.mjs`.
- **Input:** touch pads (`pads.p1/p2`, `onDown/onMove/onUp`), keyboard (`pollKeys`), gamepads
  (`gamepadPad`). `applyHumanInput(p, pad)` maps a pad to a player and applies cocktail rotation.
  **KICK is `padKickHeld(g)`, the one place that knows which button kicks.** ⚠️ `sel.pad.kick`
  defaults to **null**, meaning A plus the usual fire set (`KICK_FALLBACK`) — *not* the literal
  `0` it used to be. `0` is A only under the **standard** Gamepad mapping; a pad reporting a
  non-standard one numbers its buttons however it likes, so an exact index pointed at whatever
  happened to be numbered 0 and the kick silently never fired. A button bound in Controls is
  honoured exactly and sets `kickBound`, so `normalizePad()`'s legacy fold of `0 → null` can't
  undo a deliberate choice. `tests/padkick.mjs`.
  ⚠️ It reads the pad every step, so setting `p.kick`/`p.inX` directly in a test gets overwritten —
  drive `pads.p1` or call `handleBallControl` instead.
- **Goal posts are `POST.r` 4**, halved from 8. A post is a circle the ball bounces off,
  and at 8 it read as a bollard rather than a post — it also swallowed shots that were
  plainly inside the frame. Physics (`w.posts`) and the draw both take the radius from
  there, so they cannot disagree; `dCone`'s separate `r:9` is a drill cone, not a post.
- **The magnet slider is stored 0–100 in fives and SHOWN 0–10 in halves** (`magnetLabel`).
  Twenty-one stops either way, so the save, the presets and the physics are untouched —
  but "45" told a player nothing and "4.5" is a number you can aim at. Both debug
  readouts go through the same helper.
- **Goal box:** the net pocket mirrored onto the pitch in front of each goal line — same
  mouth width, same depth — drawn OPEN (three sides; the goal line closes it) at
  `GOAL_BOX_A` alpha so the goal line stays the loudest mark down there.
  `tests/goalbox.mjs` checks the mirror is exact on all 30 fields by pixel sampling.
- **Tilt parallax (`sel.tilt`, phones):** the on/off lives in **Game Feel → Presentation,
  directly under Screen shake & effects** — ⚠️ deliberately *above* the sliders. It shipped
  16th of 19 fields in that card, below two ranges, and was reported as a missing feature;
  `tests/tilt.mjs` pins the position and the search terms so it cannot drift back down.
  Tilt the handset and **FOUR depths** shift by
  different amounts — turf (`tiltGround() + tiltTurf()`), then the pitch MARKINGS
  (`tiltGround()`), then the bodies (`tiltLift()`), then the on-screen controls and HUD
  (`tiltUI()`), nearest your eye. `render()` draws the ground and the bodies as two passes;
  the turf gets its own translate inside `drawPitch` and the UI its own. Layers moving by
  different amounts is what a parallax is, and it is the only depth cue a top-down pitch has
  short of redrawing the game in perspective. ⚠️ The stack must stay **monotonic in depth** —
  `tests/tilt.mjs` checks the ORDER rather than four magic numbers, so retuning `TILT` cannot
  quietly break the thing the constants are for. ⚠️ `TILT.turf` is deliberately tiny (2.5px):
  the touchline is a *marking* and the grass is the turf *beneath* it, so a real gap between
  them stops reading as a bevel and reads as a misaligned pitch.
  ⚠️ The **HUD is DOM**, so it moves by a CSS transform (`syncTiltUI`) — which carries its
  buttons' hit areas with it, so a pause button is never drawn 9px from where it can be
  pressed. Written only when the rounded value changes, because that runs every frame.
  ⚠️ The **RESTING** thumbstick marker and the KICK pad ride the UI layer; a **LIVE**
  thumbstick does not — a control being touched is attached to your thumb and must not float
  away from it. Both are only indicators anyway: the real hit area is a whole screen zone
  (`zoneForTouch`), which is what makes moving them safe at all.
  ⚠️ **Render only**, same argument as the goal camera — `tests/tilt.mjs` hashes the world
  over 600 steps with the tilt swinging hard and flat. ⚠️ Advanced in `advanceTilt()` next to
  `decayJuice()`, **never in a draw**: both the smoothing and the recentring are per-step
  decays. ⚠️ The handler stores a RAW reading and does no time-based maths — the sensor fires
  at its own rate, not the sim's. ⚠️ **The neutral position DRIFTS** toward however you are
  actually holding the phone (`TILT.recentre`), and the first reading is adopted outright:
  without that, "level" means flat on a table, so playing lying down pins the effect at full
  deflection forever, which is a crooked picture rather than a parallax. ⚠️ The reading is
  rotated by `screen.orientation.angle` — beta/gamma are fixed to the device, not to what you
  are looking at, so in landscape an unrotated reading tilts the pitch sideways when you lean
  it forwards. ⚠️ The **shadow subtracts the lift** in `drawOneDisc`/`drawOneBall` so it stays
  on the ground: a shadow that travels with the body is a sticker, and the gap opening between
  the two is what reads as height. ⚠️ iOS 13+ only grants the sensor **from a user gesture**,
  so `tiltAsk` hangs off the first `pointerdown`, not off boot. Off on desktop, and off under
  `prefers-reduced-motion` — whose query object is built **once**, because `tiltLift()` is
  called for every body on every frame.
- **`pitchXform(dx, dy)` is the ONE pitch transform** — an offset then deck view's
  quarter-turn. `render()` uses it twice (ground, then bodies) and `drawReplayFrame` once;
  three hand-written copies is how the replay came to be drawn at ninety degrees to the match
  it was a replay of.
- **Particles age in `advanceFx()`, next to `decayJuice()`** — never in `drawFx`, where
  `p.life -= STEP` and `p.x += p.vx` used to live. ⚠️ That is the trails bug wearing a
  different hat: on a 144Hz screen every spark ran 2.4× fast and died in a third of the time
  it was given, so a kick looked punchier on a slow monitor. It also meant two draws of one
  frame produced two different pictures.
- **Floating stat text** (`FLOAT`, `floaters`, `addFloater`, `advanceFloaters`,
  `drawFloaters`, `sel.popups`): a short label over a player the instant they earn
  something the match record keeps — GOAL, ASSIST, SAVE, KEY PASS, CLEARANCE, SHOT, POST.
  ⚠️ **Spawned where the stat is COUNTED**, never from a second reading of the game —
  every `addFloater` hangs off the exact line that does `ms.<stat>++` (in `noteKick`,
  `creditScorer` and the post branch), so a label cannot claim something the result
  screen will not also show.
  ⚠️ **TOUCHES is excluded**, the same argument that keeps it off the result screen: it
  is the one stat every player always has, so a label per touch is a permanent smear of
  text that tells you nothing.
  ⚠️ Ages in `advanceFloaters()` next to `decayJuice()`, **never in a draw** — the trails
  rule. ⚠️ **No randomness at all**: these are spawned from inside `step()`, so
  `Math.random` would break the determinism rule outright and `w.rng` would make how many
  labels appeared perturb every later bot decision. The stagger is counted, not rolled.
  ⚠️ Drawn **outside the pitch rotation** through `screenPt`, like the REPLAY label — deck
  view turns the pitch a quarter-turn and text must stay upright — while carrying the
  body layer's tilt and shake by hand. The anchor is in world space but the rise and the
  font are **screen pixels**, because on the huge courts `cam.s` makes a world-sized
  label a smudge. ⚠️ **Clamped inside the canvas** (`drawSubPrompts`' reason): a body at
  or past the touchline otherwise loses its last letters off the edge.
  ⚠️ The cap drops the **oldest** — dropping the newest swallows the goal in a scramble.
  ⚠️ Its own toggle, not under Screen shake: a label naming what you did is information,
  and turning the wobble off is not asking to stop being told. `tests/floaters.mjs`.
- **Motion tells:** short dot tails behind the players and one streak behind the ball,
  both capped in world units (`DOT_GAP`/`DOT_MAX`, `BALL_LEN_MAX`). ⚠️ A three-second,
  time-measured version of these was built and **reverted**: at the speed cap it drew a
  streak most of a pitch long that hung off a stationary ball, and it read as a tail
  rather than a tell. Length is deliberately short — the tells say *where someone just
  came from*, not what the whole possession looked like. Advanced in `advanceTrails`
  next to `step(world)`, never in a draw: at 144Hz the same match showed a 69-unit ball
  streak instead of 190.
- **Surface vs feel:** `PITCH` entries are **multipliers** on the Game Feel sliders, not
  replacements — `surfaceFeel(v)` is the one place that bends one by the other, and a
  match, a drill and a live slider change all go through it. ⚠️ They used to be absolute
  numbers taken on Ice and Mud and ignored on Grass, so the Speed and Grip dials did
  nothing on two of the three surfaces and switching pitch threw away your tuning.
  ⚠️ `glide` scales the per-step **loss**, `1 - (1 - damp) / glide`, never the damping
  factor: damping is a multiplier per step, so 0.905 × 1.05 is above 1 and the players
  accelerate forever. At the default sliders the three surfaces reproduce the old numbers
  exactly. `tests/surfacefeel.mjs`.
- **A replay ticks the field itself.** `playReplay` calls `advanceDynField()` once per
  **replayed frame** (inside the frame-consumption loop, not per rAF tick), because a
  replay is not the step loop — without it every animated theme froze the moment a goal
  went in. Per frame rather than per tick also means it correctly runs in slow motion
  with the action.
- **Body size floor:** `cam.body` (`MIN_BODY_PX`). On the huge courts the whole pitch must fit
  on screen, so `cam.s` falls until a player disc is **2.25px** — every disc the same dot. Discs
  and the ball are drawn at `MIN_BODY_PX` or their true size, whichever is larger, through ONE
  shared multiplier so they stay in proportion. ⚠️ **Render only** — physics, kick range, hit
  tests and bots all read `p.r`, and `tests/bigcourt.mjs` steps the same seed with the floor on
  and forced to 1 and requires the world bit-identical. Exactly `1` on any ordinary court.
- **Audio:** ⚠️ **one pre-generated noise buffer**, windowed with `start(when, offset, duration)`.
  `noise()` used to fill a fresh `AudioBuffer` with `Math.random` on every call, and the loudest
  sounds call it most — the Ovation cheer is 27 calls, costing 2.2ms median on the main thread at
  exactly the moment a goal goes in (0.2ms now). It is filled from a seeded PRNG, not
  `Math.random`, because `noise` is reachable from inside `step()`.
- **Render:** `render()` → `drawPitch`, `drawBallTrail`, `drawDiscs`, `drawBall` (+ extras), controls.
  Camera in `cam` / `computeCam()` (reserves top headroom for the HUD).
- **Themes:** `THEMES` → `applyTheme(key)` sets CSS custom properties AND the live `TH` canvas palette.
- **Themes are a COLLECTION of slots**, not one key. `SLOTS` declares six — `palette`
  (page + pitch colours, a `THEMES` key), `field` (a `DYN_FIELDS` key or `none`), `discs`
  (a `DISC_SKINS` key or `none`), `ball` (a `BALL_LOOKS` key), `trail` (a `TRAIL_LOOKS` key)
  and `sfx` (an `SFX_SETS` key). The first five live in `sel.look`; **the sound slot has no stored value at all** —
  `sfxSetKey()` derives it from `sel.snd`, which the Sound card already owns one category
  at a time. A **bundle** sets all six: every palette is one (`bundleSlots(k)`), and
  `THEME_BUNDLES` only lists the two that own more than colour. Names/emoji are read from
  `THEMES`, never copied.
  ⚠️ **"Custom" is DERIVED, never stored** — `currentBundle()` matches the live slots
  against the table, so rebuilding Pool by hand gets Pool's name back instead of leaving a
  lie on screen, and a stored `custom` can't go stale. Same reason `sel.theme`/`sel.ballLook`
  were dropped rather than kept alongside: `normalizeLook()` folds a legacy save in **once**,
  at load, so nothing downstream knows two shapes.
  `buildSlotPicker(slot, host)` is the one tile builder — the Theme card stacks all six and
  the Ball/Sound cards each show one again, so a card can't drift from the theme.
  The bundle row also carries a **Custom** tile: selected whenever the live slots match no
  bundle, painted from the mix you actually built (`drawSlotsSwatch`), and pressing it
  restores `sel.customLook` so Custom is somewhere you can go *back* to.
  `tests/themeslots.mjs`.
- **EVERY skin gets a guide ring, and that is STRUCTURAL.** `drawOneDisc` strokes
  `strokeDiscGuide` after the skin paints, so a new skin cannot forget one — a player is a
  circle of radius `r` and that circle is what collides, however un-circular the art inside it
  is. ⚠️ **Two tones**, hugging `r` from either side: a single-colour ring is invisible whenever
  the skin under it happens to be that colour, and Mono's white team-1 disc ate a white ring on
  7 of 24 arcs. `tests/discskins.mjs` pixel-checks every entry in the registry, both teams.
- **Two-frame leg animation** on the creature skins, driven by DISTANCE travelled
  (`p.gait`, accumulated in `integrate`), never by a clock. ⚠️ A timer would have to be
  advanced somewhere, and anything advanced in a draw runs 2.4× fast at 144Hz (the trails
  rule); distance also stops dead when the player does and speeds the legs up when they
  speed up, with no separate "am I moving" state. `legFrame(p)` returns 0 below
  `GAIT.minSpd`, and frame 0 IS the rest pose so a standing player is never caught
  mid-stride. Legs alternate by index and by side — all six swinging together is a star
  jump, not a scuttle.
- **Rotation is the PLAYER's choice, not the theme's** — `profile.spin`, a two-tile pick in
  Your Player → Colour. Direction-drawn skins (arrow, shrimp) go through the one `discFace(p)`
  helper so they cannot honour it differently; round skins (mono, pool) are unaffected, which
  is what the hint under the control promises and what the suite checks. Off points the body up
  its OWN pitch, so the two sides don't both face one way.
- **What a theme can OWN:** `DYN_FIELDS` entries (`{name, reset?, step?, paint}`) paint over
  the pitch surface; `DISC_SKINS` entries replace `drawOneDisc`'s body. `warp` = black-and-white
  with a starfield tunnel; `pool` = a pool table with numbered solids vs stripes;
  `shrimp` (theme key; shown as **Rockpool**) = a sand seabed with ripples and shells.
  ⚠️ **Three creatures in one `SEA` registry — shrimp, crab, lobster — and `seaPair()` builds
  the pairings**, so a pairing is a two-line entry rather than a copy of a creature and nothing
  can drift between "the crab here" and "the crab there". The theme fields **crab vs lobster**;
  the Players slot also offers Shrimp vs Lobster and Shrimp vs Crab.
  The two sides must differ by SILHOUETTE, not only colour (colour is exactly what a
  colour-blind player cannot use, and at 12 pixels it is most of what anyone has): a crab is
  WIDE and stubby, a lobster is long with CLAWS HELD OUT, a shrimp is long and CURLED. Measured
  off covered pixels in `tests/discskins.mjs`, never trusted from the drawing code — and the
  discriminator has had to change with the pairing twice, which is why it is measured at all.
  ⚠️ Every vertex is checked against `r` **including its own stroke half-width** — the guide
  ring is the one thing a skin may not cross.
  ⚠️ `normalizeLook()` folds the old single-skin key `shrimp` → `crablobster` as a **pure string
  swap with no `DISC_SKINS` lookup**: it runs during the bootstrap and `DISC_SKINS` is declared
  with the renderer far below, so reading it there took the whole page down.
  `chalk` (shown as **Highlighter**) = an acid-yellow court, black lines, white everywhere
  else, dithered. ⚠️ Its two demands fight: "players are white" and "two teams" make one disc.
  Hue cannot settle it — the palette is yellow, black and white — so the sides carry a black
  BAR, horizontal against vertical, and the suite checks the SHAPE. Same argument as Pool.
  ⚠️ `DYN_FIELDS.dither` is an ordered Bayer ramp built ONCE into an offscreen canvas and
  stretched, never per frame: at a 4px cell a 400×700 pitch is 17,500 rects a frame. Cached on
  the INK, because slots mix and it can be asked for over another palette. And the threshold is
  `(B + 0.5)/16` — the lowest Bayer value is ZERO, so a raw `B/16` fills one cell in sixteen
  even where the ramp says clear, and the pitch stayed stippled at halfway. The grid is 192
  cells, so the dots land ~2px; written as **ImageData**, because 37,000 `fillRect`s is a
  visible hitch even once. The discs carry the same dither ramped the other way — clear in the
  middle where the bar lives, dense at the rim — off ONE cached mask per ink (`chalkMask`),
  one `drawImage` a disc.
  `sleeve` (shown as **Bootleg**) = a printed record sleeve: black card, a grid of big red
  dots, green bars punched through, acid-yellow markings. Players are the sleeve's own two
  marks — a red DOT against a green BAR. ⚠️ Red vs green is the one pair a colour-blind player
  cannot separate, so the difference is the SILHOUETTE and the colour rides on top; the square
  is **inscribed** in the guide ring (`SLEEVE.sq`), never circumscribed — a square drawn to `r`
  puts its corners at 1.41`r`, which is the Videoball arrowhead mistake with a different shape.
  ⚠️ The court dots are a **muted maroon** and twice a body across: a field of bright red
  circles under a team drawn as a bright red circle is a field of decoys. `tests/dyntheme.mjs`
  measures both — coverage at 0.9`r` all the way round for the dot, only on the diagonals for
  the bar, and the print's luminance against the team's.
  `board` (shown as **Sorry!**) = a butter-yellow board, a white track of rounded squares
  round the outside, and a tinted safety lane running into each end — which on a pitch is
  the lane into the goal. ⚠️ Both sides are PAWNS, because that is what the game is, so the
  piece cannot carry the difference: each pawn stands on its own plate, a start CIRCLE
  against a track SQUARE, and the plate carries the COLOUR while the pawn is white on top
  (a white plate with a coloured pawn put the team's only colour in a glyph a few pixels
  across and every disc read as white). ⚠️ The lane squares are **tinted**, not the team
  colour — a saturated blue rounded square is exactly what a team-1 player is drawn as, and
  a column of five is five decoys; Home is a wide slot rather than a circle for the same
  reason against the ball. The track is a grid computed off the pitch rect, so a wider field
  gets more squares rather than stretched ones, and there is no PRNG at all.
  `synth` (shown as **Retrowave**) = a black room, a magenta floor grid whose rungs
  crowd toward a horizon at EACH end (mirrored, not one-point — a pitch is seen from
  above and both halves are the same size), hot red against electric blue.
  ⚠️ Red vs blue is what protanopia flattens toward the same dark, so the sides also
  carry a mark: a slitted SUN against a stack of CHEVRONS. The check is the one thing a
  slit does and a chevron cannot — run **all the way across** — so it counts full-width
  gap rows rather than pixels. ⚠️ The markings are pale chrome, not a neon: both neons
  are already spoken for by the teams.
  `pnp` (shown as **Potions & Pixels**) = the wordmark's black, GOLD and GREY over the
  magenta-blue-teal pixel print the events go out on. ⚠️ Gold vs grey is a
  saturation-and-lightness pair rather than a hue one, and the sides carry a shape too —
  a potion FLASK against a PIXEL block, measured on **different axes** at 0.82`r`: the
  flask is the only one with ink straight up (it has a neck), the block the only one on
  the diagonals (it has corners). ⚠️ The print is held well back and the guard is the
  **rendered** peak against the gold team, not the alpha it was asked to draw at. The
  print's blocks are a **quarter** of the size they were (one cell is W/56) and held to
  the two corners by `reach`, so nothing decorative reaches the middle of the pitch;
  they **blink** — full strength on arrival, a fast fade, then dark — because the sine
  wave they started as rose as gently as it fell and read as a dimmer rather than a
  pixel switching on. ⚠️ Whether one fires in a given cycle is ROLLED from a hash of
  (block, cycle), never `Math.random`: a paint must give the same frame twice for one
  step, or a paused screen flickers at the refresh rate. The chance rises toward the
  **bottom-right**, so the print is quiet where the gradient starts and busy where it
  ends. The
  ball is the ampersand — the only coloured part of that wordmark, and the trail is the
  only **per-team** one in the file: the flask POURS (points joined as well as dotted, or
  a fast player leaves gaps) and the pixel BURSTS (position and size snapped to one grid,
  with a few shards scattering more as the block ages). Both scatters are derived from the
  point's own coordinates, never a clock or a PRNG — a draw must not differ between two
  draws of one step.
  `smash` (shown as **Blast Zone**) = a platform fighter's stage: a bright cream slab
  floating in a dark void, hard black edge, a nebula wash and a slow drift of stars
  outside it. ⚠️ Taken as a **design language, not characters** — no borrowed art, just
  the four things that genre got right: the stage FLOATS (the outside is where you get
  knocked into, not a margin), heavy black outlines so a bright screen still parses, a
  **player indicator** under every body because finding yourself in a scramble is the
  hardest read, and the KO streak — which is `comet`, **reused** rather than reinvented.
  ⚠️ The field `bleed`s and paints the void over a region **nine times the pitch box**;
  painted into `L,T,W,H` the stars land under the stage and the court fill covers them,
  which is how it first shipped — a flat dark surround with a sky nobody could see.
  ⚠️ The sides are a KO **star** against a **shield bubble**, measured on a ring at
  0.62r: a star is ink at five points and court between them, a bubble is ink all the
  way round. The radius matters — at 0.88r both read near zero, because the star's
  points end at 0.86. ⚠️ **The player indicator is a RIM ARC, never a filled plate.** A
  translucent backing disc covers every probe angle, and the first build measured both
  sides at 32/32: the silhouette rule defeated by the very idea being borrowed.
  The ball is a four-point **sparkle orb** — four and not five on purpose, because team 0
  already wears a five-point star and the ball must never read as a player.
  `abari` = a game bar: charcoal walls, hot pink neon, and the three marks the sign is
  built from — triangle, square, circle — drifting in the room BEYOND the pitch.
  ⚠️ The sides are the house mark and its mirror — a white triangle UP against a pink
  triangle DOWN — and that skin deliberately does **not** go through `discFace`:
  up-against-down IS the difference, so a mark that turns destroys it the moment anybody
  moves (same argument as Asteroids' level-flying saucer). The silhouette check measures
  the WIDTH of ink at a high row against a low one — a triangle and its mirror cover the
  same area, so a pixel count calls them identical. ⚠️ **Nothing is drawn inside the
  boundary.** It `bleed`s and punches the play area out of its own clip with the field's
  own path (the pool table's, borrowed not copied), so it follows a rounded or chamfered
  field for free. An arcade carpet used to run UNDER the play here and it was a floor of
  decoys — a floater is a triangle and so is a player. The suite paints over a
  court-filled canvas and requires every probe inside the line to come back untouched,
  with an outside scan that counts **pixels, not probe points** (sparse thin outlines in
  a room several times the pitch's size hit two point-samples in a hundred, which reads
  as "nothing drawn"). ⚠️ The markings are **white** and the goal's pocket is a
  translucent purple — pink lines fought the pink team for the same read, and the pocket
  is the one place a wash of colour helps, because no player stands there. The floaters
  carry that neon too but held back in alpha, and the guard is measured on the **rendered
  brightest pixel**, not the palette hex: a hex says nothing about what alpha did to it,
  and a player may step past the touchline into them. The drift advances in `step()`,
  never in a paint.
  The ball is a **token**, round on purpose: on a pitch of wedges the thing you chase
  should be the one thing that is not one.
  `specimen` = a type-specimen sheet running in the MARGINS: process yellow, rows of
  grotesk at every width and weight, scrolling right to left outside the pitch, each row
  at its own opacity and its own speed. ⚠️ It `bleed`s and punches the play area out of
  its own clip with the field's own path (the pool table's, borrowed not copied), so a
  word **cannot** land on the court — structural, not a margin someone keeps tuning.
  ⚠️ The type is an **olive tint**, never the line's black, even out there: the discs are
  black blocks and a player may step past the touchline, so black words in the margin are
  something a stepped-out body disappears into. Each row is a strip baked ONCE and
  scrolled by `drawImage`, cached on the ink — eleven rows of 60px type is glyph
  rasterisation every frame otherwise — and the strip **wraps** (every word is drawn again
  one tile-width left) so the repeat has no seam. No web font; `system-ui` is a texture
  here. The scroll advances in `step()`, never in the paint. ⚠️ Both discs are the same black block
  with the glyph knocked out in paper, so hue cannot tell the sides apart any more than it
  could on Highlighter — it is an **O against an X**, which differ twice over (closed
  counter vs crossing; ink on the axes vs only on the diagonals), and `tests/dyntheme.mjs`
  measures both. The ball is a **full stop**, deliberately not a ring: a second counter is
  a ball you lose in a challenge.
  `vector` (shown as **Asteroids**) = a vector monitor: a nebula wash, a faint grid, a star
  field and a drift of stroked rocks, with a cyan dart against a lime saucer. ⚠️ **Nothing
  is filled**, and that is measured, not asserted in a comment — the middle of a ship and
  the middle of the ball both have to still be the court. The ball is hollow because the
  palette sets `ball` to the court colour and `ballRim` to the bright one, so the rim ring
  `paintBall` already draws IS the rock's outline. ⚠️ The silhouette check is an **extent**,
  not a pixel count: these are outlines, so a scan line crosses two strokes whether the
  shape is a hand's width or a pitch across — and it stops short of 0.8`r`, because the
  hull ring is at `r` and crosses every column, which makes both sides measure 1.73`r`.
  ⚠️ The saucer does **not** turn (the arcade's flew level, and rotated ninety degrees it
  is a lens nobody can name); the dart goes through `discFace` like every other
  direction-drawn skin. The nebula is four radial gradients baked ONCE into a 128px canvas
  and stretched, cached on the ink.
  `ufo` (shown as **Abduction**) = a fenced night pasture with crop circles, craft for players
  and a sheep for a ball. ⚠️ The craft are seen from **directly above**, like everything else
  on the pitch — the first build drew them three-quarter, belly forward, which is a sighting
  photograph rather than a top-down game. The 3D is what MOVING does to them: the craft
  pitches nose-down as it drives, so its hull foreshortens ALONG the direction of travel and
  the saucer's dome slides toward the trailing edge; standing still it is a plain circle. The
  bank is read off **velocity**, not facing — it is how hard the thing is driving, so a player
  with rotation switched off still banks. A ground **shadow**, offset behind, is the only cue
  from above that says flying rather than sliding. The silhouette check on that pairing measures the **nose**, not
  the tail: from above both are wide at the back. ⚠️ The fence uses `bleed` and borrows **`DYN_FIELDS.pooltable.path`**
  rather than copying it: a fence has to stand ON the boundary the ball bounces off, follow a
  rounded or chamfered field for free, and leave both GOAL MOUTHS open — the same job the
  cushion does, so it is the same code. ⚠️ Both sides are **saucers**, an ORANGE against a near-achromatic
  silver — the one deliberate exception to the silhouette rule in the whole file, asked
  for. Silhouette being off the table, the two inks have to be separable without hue, so
  the suite measures the **lightness gap and the saturation gap** rather than an overall
  RGB distance (which a red/green pair would also pass). `DISC_SKINS.ufotri` keeps the
  saucer-vs-triangle pairing in the Players slot and its silhouette is still measured, so
  that code cannot quietly rot. ⚠️ The rim lights and the dome are drawn in an ink PICKED
  against the hull (`relLum(col) > 0.45`), not a hard-coded white — a silver hull ate both.
  ⚠️ One drawing per craft in a `CRAFT` registry with `craftPair()` building the pairings,
  so nothing can drift between "the saucer here" and "the saucer there" (same shape as
  `SEA`/`seaPair`). The 3D is a TILT of the hull about the facing axis — leading edge down,
  dome pushed back — never a bigger shape; the hull is 0.90`r` so the bank cannot push a wing
  past the guide ring.   The sheep is a `BALL_LOOKS` entry, and a look gets ONE ink clipped to the ball — the fleece
  is the ball itself and the ink draws only what is not fleece. Anything drawn on the rim is
  lost, because `ballRim` is dark too.
  `videoball` = a cream-banded court with arrowhead players that point where they FACE, so a
  still frame shows intent as well as position. ⚠️ **The ring is the player** — a disc is a
  circle of radius `r` and that circle is what collides. The first build drew the arrowhead
  alone, overhanging it (nose 1.55r, wings 1.05r), so the shape on screen was a third bigger
  than the shape in the physics. The ring is drawn at exactly `r` and the triangle is inscribed
  (`ARROW`). ⚠️ `p.faceY || fallback` is a bug: a player facing exactly along x has
  `faceY === 0`, which is falsy, so the fallback fired and the arrow pointed diagonally at
  nothing. The default applies only when there is no facing at all.
  ⚠️ Field state advances in `advanceDynField()` next to `step()`, **never in a paint**
  (same rule as the trails), and off its own seeded PRNG so it can't touch `w.rng`.
  A monochrome palette *must* be paired with a disc skin — player colour comes from `profile`,
  which no palette can reach. Because slots mix freely, a field painter must fall back through
  the palette it's given (`TH.dynMark || TH.line`) or a starfield over Grass paints black on
  black. `tests/dyntheme.mjs` holds all of it by pixel sampling.
- **Trail look:** `TRAIL_LOOKS` + the `trail` slot, declared **above `SLOTS`** so
  `normalizeLook()` can ask the registry rather than repeat its key list (a hard-coded copy
  was the first fix and it was a second place to keep in step; the reason a copy was
  reached for at all is the `DISC_SKINS` TDZ). A look is handed the **team**, so a pairing
  can draw the two sides differently — Potions & Pixels pours one and pixelates the other —
  and a look that branches must set `perTeam`, which is what makes the picker tile show both
  runs instead of implying they look alike. ⚠️ A look only DRAWS — where a dot is
  dropped and how fast it fades stay in `advanceTrails` (step loop), because the LENGTH of
  a tell is how far someone just came, which is a read and not a decoration. ⚠️ The BALL
  keeps its streak whatever the slot says: it is the one thing everybody is tracking, so no
  cosmetic choice may switch it off. Looks are handed **screen** points from one reused
  scratch buffer (a fresh array per player per frame is the allocation `advanceTrails`
  already avoided), which is also what lets the picker tile call the real painter.
  `tests/traillook.mjs`.
- **Ball look:** `BALL_LOOKS` + `paintBall`. ⚠️ The pattern colour is **measured against the
  ball**, not taken raw: `ballSpotInk()` runs the palette's `ballSpot` through `readableInk`
  at `BALL_SPOT_CONTRAST`. Pool pairs a `#f7f4ec` cue ball with a `#e8e2d2` spot — **1.18:1** —
  because the cue ball look is *plain* and never exercised the spot, so every other look
  rendered as a plain white ball. Every other palette is 10.6:1+, which is why it hid.
  A readable spot is left untouched; this is a floor, not a repaint. `tests/balllook.mjs`.
- **The ball as a ROLLING SPHERE** (`sel.ball3d`, default **off**; `BALL3D`,
  `paintBallSphere`, `ballSphereTex`): the pattern is mapped onto a cylinder-projected
  sphere and scrolled by the roll, so the markings compress toward the limb and go over
  the horizon. The ball already had sphere *shading* — a ground shadow and a fixed
  highlight — and what read flat was the pattern being **rotated in 2D**, which is a
  spinning disc.
  ⚠️ **A setting, not a theme**, and default off: it changes the most-watched object on
  the pitch, so it is something you turn on rather than something that arrives.
  ⚠️ The texture is **baked once per (look, ink)** and scrolled with `drawImage` — keyed
  on the ink because slots mix and the pattern is drawn in the ball's spot colour, and
  dropped in `clearSwatchCache` so cycling palettes leaves nothing behind.
  ⚠️ **Slices scale with radius** (`max(8, min(26, r*0.9))`). A fixed 26 costs the same
  at 9px as at 70px, and the warm-up lobby fields fourteen balls; worst case measured at
  **1.4ms** of a 16.6ms frame.
  ⚠️ **`minPx` is 5, matching the flat pattern's own `r >= 5`.** It shipped at 7 — above
  the **6.56px** the ball is actually drawn at on a 390×844 phone — so the feature did
  nothing at all for the people most likely to switch it on. `tests/ball3d.mjs` asserts
  engagement against the real drawn radius.
  ⚠️ **The roll is a SIGNED distance about a LATCHED axis** (`ball.roll`, `ball.rollAx`),
  advanced by `advanceBallSpin` in the step loop and only *read* by the painter. It
  first took its axis from the live velocity inside the draw, which was wrong twice
  over: a bounce flipping the heading by 180° jumped half a turn of texture across the
  ball in one frame, and a ball rebounding off a wall should *unroll* the way it came.
  The axis is re-latched only when travel goes more than 60° off it — a real change of
  direction rather than a rebound along the same line.
  ⚠️ **`rollAx` is a direction on the PITCH**, and `drawOneBall` paints inside `uprightAt`,
  which has already cancelled the pitch's quarter-turn — so the call site adds `cam.rot`
  back. Without it, deck view and the side camera had the ball rolling ninety degrees
  across its own direction of travel, which is the replay-at-ninety-degrees bug again.
  ⚠️ **It rolls FORWARDS**, and it shipped backwards. Seen from above, the face of a
  rolling ball travels the way the ball is going (the contact point is what stands
  still), so the phase is SUBTRACTED from the longitude. A backwards scroll changes
  exactly as many pixels as a forwards one, so every assertion in the suite passed with
  it wrong until one measured the *sign* of a known mark's movement.
  ⚠️ **The texture's vertical axis is sin(LATITUDE), not latitude.** An orthographic
  sphere puts latitude φ at screen y = r·sin(φ), and the painter stretches the strip's
  full height linearly onto the ball's full height in one `drawImage` per slice — so a
  strip baked in φ piles the polar rows up at the top and bottom of the circle and pulls
  the equator apart. That was the "terrible texture": every pattern came out as a
  vertical smear. Baking in sin(φ) makes the linear stretch exactly right and costs
  nothing per frame.
  ⚠️ **TWO PRINTS, one per hemisphere** (`BALL3D.prints`, `patch: 90`), and it shipped as
  sixteen small identical ones on a regular 90° grid. That single decision caused **both**
  halves of the second bug report. Sixteen identical marks 90° apart is a periodic lattice,
  so between frames the eye locks onto whichever copy is nearest and reads the motion
  backwards about as often as forwards — a filmstrip of the ball rolling right was near
  indistinguishable from one of it rolling left. And a look's `draw` is a complete disc
  design, so sixteen little copies is not the design you picked: the football came out as a
  mass of small pentagons. At 90° a print spans exactly half the wrap and the whole of
  sin(latitude), so two tile the sphere with no gap and no overlap.
  ⚠️ **The two prints are DIFFERENT** — the second turned a quarter and mirrored — so the
  pattern's period is a full turn rather than half of one. That moves the point where the
  roll can start reading backwards from π/2 radians a frame out to π, which at the physical
  rate is a ball travelling 31 units a step: the top of the range. `tests/ball3d.mjs`
  measures it as "half a turn differs, a full turn matches".
  ⚠️ **The design is laid in by COLUMNS at asin(x) of longitude** (`BALL3D.cols`). The strip
  is indexed by longitude and the painter puts longitude at screen x = `r·sin(lon)`, so a
  design laid in linearly is stretched by **π/2** across the middle of the ball — a round
  dot rendered as a 1.46:1 oval. The asin pre-warp cancels the painter's sin at the print's
  home orientation, leaving the design looking like itself; roll it away and the sin then
  compresses it toward the limb, which is the real sphere behaviour. The suite measures the
  sphere at rest against the **flat painter**, which is the thing it has to agree with.
  ⚠️ The **rate is ω = v/R**, off the ball's own radius, not a constant. It was 0.055
  against a radius of 10 — half the physical rate — so the ball under-turned for the ground
  it covered and read as sliding. Nothing asserted it until a sabotage of that constant
  passed.
  ⚠️ `BALL3D.wrap` (π×tex) makes the *stored* strip isotropic so a print is not resampled
  unevenly. It is **not** what makes a print come out round on the ball — the wrap width
  cancels between the bake and the painter, both of which derive from it. Believed
  otherwise for one commit; the suite's sabotage of that value *passing* is what showed it.
  Render only — the suite proves the world bit-identical with it on and off.
- **Side view (`sel.sideView`, `SIDE`, `sideNow`, `drawBodiesSide`):** a showcase camera —
  the pitch turned goal-to-goal, the ground plane squashed as though seen from beside the
  touchline, and every body standing up off it as a cylinder with the ball a real sphere
  above its shadow.
  ⚠️ **An OBLIQUE SQUASH, and that is load-bearing rather than a shortcut.** Every pitch
  painter in the file works from a RECTANGLE — `drawPitch` computes `L,T,R,B` and hands it
  to `drawGrass`, to `vjPaintVideo` and to all fourteen `DYN_FIELDS` painters as
  `L,T,W,H` — and an oblique y-squash maps a rectangle to a rectangle, so the grass clip,
  the goal boxes, the markings, the pool table's cushion path and every animated field
  keep working with **no change at all**. A true perspective does not preserve rectangles
  and would mean rewriting all fourteen field painters, both goal pockets and every
  marking, for a camera nobody plays with. `tests/sideview.mjs` measures the rectangle on
  the pitch corners.
  ⚠️ **REPLAYS AND THE ATTRACT DEMO ONLY, with no "always" option**, and the reason is the
  input rather than taste: `pitchHorizontal()` is what `applySeatRotation` reads to decide
  which way a stick points, and it is answered on a **layout change**, not per frame — so a
  camera turning the pitch a quarter-turn behind its back would hand a player a stick 90°
  wrong. The side view therefore sets `cam.rot` **itself inside `computeCam`** and never
  touches that predicate. A replay has no input but "skip" and the demo has no humans at
  all, so the question never arises. The suite drives the real `applySeatRotation` with the
  camera live and requires every seat unmoved.
  ⚠️ **Answered ONCE PER FRAME into `sideNow`** (top of `render()`, and again in
  `drawReplayFrame` — that path never goes through `render()`, because `loop()` returns
  early while a replay is active). Half a frame squashed and half flat is a mess, and
  `replay.active` genuinely flips between one frame and the next.
  ⚠️ The squash is the **FIRST call in `pitchXform`**, which makes it the LAST thing applied
  on the way to the screen: it is a foreshortening of the SCREEN, so it lands after the
  quarter-turn. Squashed before the turn it would flatten the pitch's length instead of its
  width. `screenPt` composes them the same way round, and the suite asserts the two agree
  by finding real ink at the point `screenPt` names — a drift between them puts every label
  somewhere its body is not.
  ⚠️ **The BALL must not ride the squash** — a sphere is a circle from every angle, so
  `drawBodiesSide` undoes it about the ball's own centre. Squashed it reads as a discus,
  and it is the object everybody is tracking. The suite's assertion is the **contrast**
  between a round ball and a squashed disc, because "the ball is round" is also true of a
  build with no squash at all.
  ⚠️ Bodies paint **FAR TO NEAR and the ball sorts into the same list**, which is why this
  replaces `drawDiscs` *and* `drawBall` rather than sitting between them: every disc and
  then the ball puts the ball in front of a player standing between it and the camera.
  Sorted on the real on-screen y through `screenPt`, never on a world axis — which world
  axis runs into the screen depends on the turn.
  ⚠️ **The ground shadow is WIDER than the body** (`SIDE.shadowR`). The wall is drawn from
  the top face down and round the bottom of the base ellipse, so it covers the whole
  footprint: a shadow at the body's own radius is painted over completely, and the first
  build had one nobody could see. The spill is the part that reads.
  ⚠️ The dot tails stay on the ground; the ball's **streak and the kick sparks are lifted
  with the ball**, or the streak does not meet the thing it is a streak of.
  ⚠️ `applyGoalCam` now **stands down during a replay**. It was enough to say that in
  `advanceGoalCam`'s `want` while nothing on the replay path called `computeCam`; the side
  view has to (it refits for the squash), and `goalCam.t` is frozen at 1 there because the
  step loop that eases it out is not running.
  ⚠️ **Render only** — the suite hashes the world over 600 steps with it on and off, with
  `demo` true in **both** runs (it is read from inside `step()`, so switching it is not a
  control). `tests/sideview.mjs`.
- **A PLAYER MAY NEVER LEAVE THE VIEW, in any mode.** `integrate`'s clamp to
  `bounds.halfW/halfL + 20` used to sit behind `if (!w.drillMode)`, which was safe only
  while every drill called `drillBoundary()` and got four solid walls that held a body in
  by collision. **Break the Targets does not** — it calls the match's own `buildGeometry`
  so its goals cannot drift from a real one's, and every boundary that produces is
  `ballOnly`, which contains the ball and deliberately lets a player step out. So there
  was nothing holding the player on the pitch and you could walk off the screen and never
  come back. ⚠️ The clamp reads **`w.bounds`**, not `w.field`: that is the rectangle the
  drill actually laid out and the one `renderDrill` and `clampBallInside` already work
  from, so the line you are held at is the line on the grass. `tests/targetsdrill.mjs`
  holds the stick down for 900 steps rather than placing a body outside and calling the
  clamp — which would pass on a build where the clamp is never reached.
- **`advanceBallSpin(w)` is called from `step()` AND `stepDrill()`.** It lived inline in
  `step()`, which a drill never runs, so in every drill the ball's pattern was frozen
  solid however hard it was hit — a ball that has stopped being a ball. Step loop only,
  never a draw (the trails rule).
  ⚠️ **ONE signed quantity drives BOTH looks**: `along`, the travel projected onto
  `rollAx`. It feeds `roll` for the sphere and `rot` for the flat pattern, so the two can
  never disagree about which way the ball is turning.
  ⚠️ **`rollAx` is CANONICALISED** into the right half of the pitch's frame (`canonRollAx`
  — along +x, or +y when travel is exactly sideways to that). That is what makes the sign
  of `along` mean anything: forward along the axis is always the same direction, so a ball
  going one way rolls positively and a ball coming back rolls negatively. Latched, and
  re-latched only past 60° off — a real turn rather than a rebound along the same line.
  ⚠️ **`rot` is driven by `along`, never by SPEED**, and it shipped as `sp*0.03`. `sp` is a
  magnitude, so the flat pattern turned the same way in every direction — a wheel rolling
  right reads clockwise and it stayed clockwise when the ball came back left. That was the
  whole of "the ball rotates the opposite way to where it is rolling", and it is the look
  **nearly everybody sees**, because `sel.ball3d` is off by default. The first fix went
  only to the sphere and the report came straight back.
  ⚠️ `tests/ball3d.mjs` holds it from **both ends** — the sign of `rot` per direction, and
  that a positive `rot` really is clockwise on screen. Either alone is half the claim and
  neither alone is the complaint.
- **The Sheep ball is a SILHOUETTE, not a set of marks**, and that took three goes. Drawn
  as its dark parts on a white ball — first a ring of seven fleece nubs plus a head, an ear
  and two legs, then a bigger head with four legs and a tail — it came out as a field of
  same-sized dark spots, which is a cow. Nothing at the nine pixels a ball is actually
  drawn at can be read as a head, an ear and a leg; a whole animal **outline** can. So the
  ink covers the ball and the fleece is put back in the **paper** colour — which is why
  `look.draw` is handed that colour at all (`paintBallLook`'s fourth argument), and the one
  look that needs it. ⚠️ The surround is held back to `SHEEP.surround` (0.62) rather than
  solid, and that is playability rather than looks: solid, the ball's own dark rim merges
  with a dark surround, the disc's edge disappears, and the ball reads as much smaller than
  the circle that actually collides. It also has to stay the brightest thing on the pitch.
  `tests/balllook.mjs` measures all three, and counts fleece **regions** for the `solo`
  check — the obvious "how much of the disc is pale" does not discriminate at all (sixteen
  small sheep score 0.669 against one big one's 0.622, so the tiled build scored higher).
- **Caps:** one painter, `paintCap()`, centred on the disc and outlined in the opposite ink
  so it reads over a flag or a shirt number. ⚠️ There used to be **two** cap draws — the pitch
  at `-0.48r`/`0.78r` type, the menu preview at `-0.5r`/`0.72r` — so the mark you picked was
  never quite the mark you played with. **Bots wear `BOT_CAP` ('none')**: cycling the whole
  CAPS table put a different hat on every disc and made a cap read as decoration rather than
  as yours. Bots still vary by colour, shirt number and eyes.
- **Kickoff possession:** `kickoffFreePass` gates the centre circle on `w.kickTeam` — the
  side that CONCEDED. ⚠️ `kickTeam` was written on every goal and **read by nothing**, so
  the gate stood open to both teams and a restart was a race for a loose ball, which in
  practice the same side won every time. `tests/kickoff.mjs`.
- **Slow-mo is for the LAST goal only** (`w.finalGoal`, set where a goal ends the match,
  cleared in `resetKickoff`). ⚠️ A 0.45× celebration on every goal is most of a minute of
  slow motion in a five-goal match, and it stopped the winner reading as special. The
  full-time ramp and the replay have their own clocks and are untouched.
- **The grass is clipped to the FIELD'S SHAPE**, not its bounding box — `drawGrass`
  borrows `DYN_FIELDS.pooltable.path`. ⚠️ A rect clip left pitch colour stranded in the
  cut corners of every rounded and chamfered court: outside the line, unreachable by any
  ball, and reading as playable.
- **Download it and play offline** (`offlinePossible`, `downloadOffline`, `#offlineBtn`,
  About card). The whole game is ONE FILE, so this is a copy of that file and nothing else —
  no installer, no runtime, no packaging step. ⚠️ It matters most on **Linux**, where Firefox
  has no install-as-app at all and Chrome's is inconsistent; a saved `.html` opens in every
  browser on every desktop with nothing to set up.
  ⚠️ **FETCHED, never `document.documentElement.outerHTML`.** That is the obvious way to save
  a page and it is wrong: it is the page as it is RIGHT NOW — every class the menu has
  toggled, every node the settings screen built, a match mid-run — so what lands on disk is a
  snapshot of a running game rather than the game. Same reason `updCheck` fetches: it is the
  file, not the page. ⚠️ And an `outerHTML` copy still *boots and plays*, so "the saved file
  works" does not catch it — `tests/offline.mjs` dirties the DOM first and requires the
  download to stay **byte-identical** to what the server sent.
  ⚠️ `cache: 'reload'`, for the reason it is in `updCheck` too: it goes to the network and
  refreshes the worker's cached copy, so what is saved is the current build rather than
  whatever was cached when the tab opened.
  ⚠️ The reply is **sanity-checked** before it is offered — a captive portal answers 200 with
  a login page, and a file called `magnetball-<version>.html` that opens to a wifi sign-in is
  worse than a refusal.
  ⚠️ On a `file://` page the button is **relabelled, not hidden** ("You are playing the
  offline copy"): a page there cannot fetch itself, and hiding the control leaves somebody
  hunting for it. ⚠️ The hint says plainly that the **career and settings do not come with
  it** — a file on disk is a different origin, so the browser keeps the saves apart — and
  that the optional `assets/` artwork falls back if it is not beside the file.
- **Add to home screen:** `#installBtn` appears only while `beforeinstallprompt` is
  live and hides on `appinstalled` or in standalone. ⚠️ The prompt cannot be asked for —
  it arrives once, as an event — so an always-on button is dead on iOS and after install,
  and a dead button in a menu is worse than no button.
- **Icons:** `ICONS` (one 24×24 grid, one stroke weight, `currentColor`) → `iconSvg(name)` →
  `optGlyph(entry)`, which every option tile and nav tile goes through. ⚠️ **Opting in is an
  `icon:` FIELD, never a lookup by emoji** — emoji are not unique across tables (⚡ is both the
  Quick match length and the Elite difficulty tier), so a by-emoji map puts a stopwatch on a
  difficulty tile. ⚠️ **Cosmetic tables are deliberately NOT converted**: in `CAPS`, `EYES`,
  `ANIMALS` and `TEXTS` the emoji IS the item — `paintCap` draws that exact glyph on the disc —
  so an icon there would show a picture of something other than what you picked. Anything with
  no `icon:` keeps its emoji. The result screen goes through the same path — award
  ribbons, the map vote's thumbs, Warm-up, Settings and the save toast are all drawn
  now, with the emoji as the fallback. Difficulty is drawn as a **ramp** (`tierNofM`, filled pips) rather
  than seven unrelated pictures, generated from `DIFF`'s own length. `tests/icons.mjs`.
- **Cosmetics/unlocks:** `FLAGS` (draw fns + `_fh/_fv/_bg/_cd/_nordic/_oval` helpers), `ANIMALS`,
  `TEXTS`, `EYES`, `CAPS`, with `FLAG_REQ` / `EYE_REQ` / cap `.req`.
  `isUnlocked(cat,key)` = `grantedHas || reqMet(itemReq)`. **Flags, animals and text share one
  faceplate slot** (`profile.flag`) — `paintFace()` decides which table the key belongs to.
  `itemName(cat,key)` is the single place that knows what an item is called; use it, don't
  re-derive it. To add content: add the item + its unlock req and a `UNL_CATS` entry; the pickers
  and counters iterate the key lists. Players default to a **shirt number** (`shirtNo`).
- **Photo faceplate:** `profile.photo` is a data URL and `profile.flag === 'photo'` wears it;
  `paintFace` clips it to the plate. Imported through `photoFrom()`, which centre-crops and
  rescales to `PHOTO.size` (128²) — ⚠️ storing a camera-sized image would blow the ~5MB
  `localStorage` budget on its own. It never leaves the device: `lbSubmit` posts
  `profile.flag`, which is the literal string `photo`. `tests/photo.mjs` checks both.
- **Ball look:** `BALL_LOOKS` + `paintBall(c,x,y,r,rot,key)` — nine drawn patterns, no sprites.
  The pitch and the picker tiles call the same painter, so a tile can't show something the ball
  won't. Ball *physics* is `BALLS`, which is a different thing entirely.
- **Break the Targets** (`DRILLS.targets`, `TARGET_SPOTS`, `targetSpot/targetNext/targetScored`,
  `drillGoals`): 60 seconds, score as many balls as you can into **either** goal, one
  at a time, respawning at five FIXED spots — fixed because the drill is a route you
  learn, which is the whole point of a break-the-targets. Spots are stored as
  fractions of the field, so the layout is the same shape on any pitch.
  ⚠️ **The only drill with real goals**, so it calls `buildGeometry` — the match's own
  function — rather than hand-building a frame that could drift from it.
  ⚠️ **`clampBallInside` SEALS the goal mouth in drill mode** (`gh = -1` makes
  `inGoalX` false everywhere), which is right for the twenty-odd gate/zone drills and
  fatal here — shots bounced off a closed goal line and nothing ever scored. Opened by
  `w.drillGoalsOpen`, a property of the drill, never a check on its key.
  ⚠️ **The targets branch runs FIRST in `updateDrill` and returns.** Two reasons: it
  has no gates or zones so `d.total` is 0 and `doneCount >= d.total` finishes the drill
  on frame one, and `updateDrill` resets the crossing trail part-way down — checked
  after that line the segment is zero-length and no shot crosses anything.
  ⚠️ **The only drill where HIGHER is better** (`def.high`). Every other one scores on
  time, and an unguarded `t < prev` records your worst run as your record.
  ⚠️ **`renderDrill` had to learn to draw a GOAL.** It paints `w.bounds` as one
  `strokeRect` plus gates, zones, cones and `wl.draw` walls — and `buildGeometry`
  produces none of those, so the goals were in the physics and nowhere on the screen:
  a solid line ran across both mouths and the drill was a box with a ball in it.
  `drawDrillGoals` (mouth left open, net pocket, posts, mouth marked in `TH.good`) and
  `drawTargetSpots` (all five, current one solid) are gated on `w.drillGoalsOpen`, so
  every other drill is untouched. The readout branches on `def.high` too — a points
  drill has no `total`, so the shared `0/0` claimed it was complete and empty at once.
  ⚠️ The player is never moved to the next ball — walking to it is the drill.
  `tests/targetsdrill.mjs`.
- **Modes:** Season (`SEASON_ROUNDS`, `seasonEnd`), **Gauntlet roguelike** (`rogue`, `rogueNextRound`,
  `applyRoguePerks`, `rogueEnd`), drills (`DRILLS`, `stepDrill`), tutorial, party modifiers
  (`sel.party`). `endMatch(w)` routes `w.rogue`/`w.season` to their handlers.
- **The snail is KICKABLE and heavy.** `handleSnailKick` — deliberately *not*
  `handleBallControl`, which traps and carries: dribbling the objective onto the goal line
  would be the whole match in one run. ⚠️ The impulse is scaled by `SNAIL.kick`, not by
  `invMass` — a kick sets velocity directly, so an unscaled one sends the snail off at ball
  speed and "kickable" quietly means "weightless". `p.snailKicked` latches until KICK is
  released. Measured on Colossus: one kick moves it 22 units, **twice** a full-speed body
  check, while the same kick sends the ball 453.
- **Killer Queen berries:** `BERRY` + `makeBerry`/`placeBerry`/`kqBerry`/`kqHiveFull`/`stepBerries`.
  Six floaty purple bodies you shepherd into the end you ATTACK — the same end as the ball and
  the snail, so "your hive" is never the opposite way round from everything else in the mode.
  A berry crossing the line **banks** (`checkGoal` dispatches it *before* the snail and `kqGoal`)
  and fills a cell of that team's hive, drawn as `BERRY.cells` slots in the net pocket by
  `drawGoal`. Fill them all and `kqHiveFull` wins outright — it sets `w.forceWinBy='hive'`
  so the result screen doesn't claim the snail did it.
  ⚠️ **Being banked is a FLAG, not a parking spot.** The first build parked a banked berry at
  (99999, 99999) the way the code parks anything it wants ignored; `clampBallInside` is a hard
  containment backstop and dragged it back onto the pitch to bank again. `banked` is honoured by
  `integrate`, the ball-vs-ball pass, `checkGoal` and the draw.
  ⚠️ **Spawn after `botInit`** — that is where `w.rng` is seeded, and `placeBerry` has no
  `Math.random` fallback on purpose: a fallback would go non-deterministic silently.
  The float bob advances in `stepBerries`, never in a draw (the trails rule).
  ⚠️ **The balance guard is a PROPORTION, measured on both builds.** `tests/kqberry.mjs`
  runs eight seeded bot matches and requires a full hive to decide at most half of them:
  shipping scores 2/8 (earliest 176s), a build that lets bots courier scores 8/8 (earliest
  109s). ⚠️ Timing is the wrong axis and cost four red merges — the broken build's collapse
  is slower than the original 90-second one, so a "hive inside 120s" rule caught only 2 of
  its 8 runs, while CI's own noise on a good build produced one at 118s and failed. Same-
  engine determinism means a seeded run reproduces on one browser build and not across two.
  ⚠️ **Bots finish berry runs, they do not courier them.** `botAssignBerry` gives at most
  `BOT.berryRunners` (1) bot a side a berry, never the chaser or the goalie, never while
  defending, and only one already inside `BOT.berryLastLeg` of the hive. Ungated they drove
  berries the length of the pitch and **7 of 8 bot matches ended on a full hive inside 90
  seconds** with the ball barely involved; raising the cell count only made the same foregone
  race longer. A runner targets the far side of the berry once lined up — targeting the spot
  *behind* it makes `botArrive` decelerate and the bot stands there admiring it.
  `tests/kqberry.mjs`.
- **Goal box occupancy (`sel.boxRule`):** ⚠️ **HALF A SECOND OF GRACE** (`GOALBOX.grace`)
  before anything touches you — no shove, no clamp, and no visual tell either, since a tell in
  the free window says you are being stopped when you are not. Long enough to run *through* the
  box, nowhere near long enough to camp. `p.boxT` counts only while a body is being pushed and
  is wound back to zero in `applyGoalBox` for everyone who is not, because `easeOutOfBox` only
  ever hears about the players it pushes and so can never be where a timer resets.
  ⚠️ The hard backstop clamps to **how deep you already were** (`p.boxCap`, ratcheting inward),
  never to a fixed line: half a second at pace puts a player ~98 units in on Classic against a
  backstop of 16, so clamping to `GOALBOX.hard` teleported them 80 units back the frame the
  clock expired. `tests/boxrule.mjs` measures the free window as a **differential against the
  rule switched off** — `integrate` damps every player every step, so a velocity threshold
  reads ordinary damping as a shove.
  ⚠️ **during `play` only** — ungated it also fired in
  the warm-up lobby and after the full-time whistle. One defender and one attacker inside a goal box at a
  time, so nobody parks a wall in front of their keeper. The box is the region the pitch already
  draws — net pocket plus its mirror — read from `w.bounds`, never re-derived, so the line you
  are pushed off is the line on the grass. ⚠️ The slot is **sticky**: the holder keeps it until
  they leave. Recomputing "who is deepest" every step made two defenders trade it and shove each
  other out on alternate frames. Eased out like `applyKickoffLine`, with the same hard backstop.
  `tests/boxrule.mjs`.
- **Trapping SWINGS the ball round you, and an opponent can knock it off.**
  `TRAP.spin` (9 rad/s) is an angular rate, not a snap: the trap keeps a bearing
  (`p.trapAng`) that turns toward your facing, taking the SHORT way round the ±π wrap.
  A ball at six o'clock takes a beat to come round to twelve, which is what makes
  turning to pass something you commit to. ⚠️ **`releaseTrap` fires along `trapAng`,
  not along the facing** — those were the same thing while the trap snapped, and firing
  along the facing now would send the ball somewhere it visibly is not.
  ⚠️ **A trapped ball is stealable by any OPPONENT at any time, including mid-swing**
  (`ball._trappedBy`, `TRAP.steal`). The carrier re-plants the ball every step, so a
  kick that does not BREAK the trap is overwritten next frame — the trap was absolute
  before this. `trapUsed` latches on the carrier so they cannot re-trap while still
  holding KICK; a steal that lasts one frame is not a steal.
  ⚠️ **Opponents only, and that qualification was measured.** Unrestricted, team-mates
  stripped each other — every carry a scrum between players who are supposed to be
  helping — and it showed up as the bots' difficulty ladder inverting.
  ⚠️ **`BOT.carryAlign` is checked on the BALL as well as the face** (`runBot`'s carry
  branch). Aligned on the face alone a bot let go while the ball was still coming round
  and shot somewhere it had not aimed, which cost the stronger tiers most because they
  trap most: rookie beat insane 83% of the time. Reading `trapAng` is a read — a bot
  still writes only `kick`. `tests/trapspin.mjs`.
- **Bots (AI-only layer):** `runBot(w,p)` in four layers — `botPhase` (attack/defend/transition)
  → `botAssignRoles` (chaser/support/defender/goalie, every `BOT.roleTicks` with a switch margin)
  → the per-bot decision → Layer-0 steering (`botArrive`, `botSeparate`, `botArcPoint`,
  `botWallAvoid`). Aim is `botPickAim` scoring shot / pass / bank / clear candidates through one
  function. **Every tuning value is in the `BOT` block** — nothing below it reads a magic number.
  ⚠️ Bots may write **only** `inX/inY/faceX/faceY/kick` and their own `ai*` scratch fields; the
  kick impulse runs along player→ball, so a bot aims by *where it stands*, not by facing.
  `tests/botai.mjs` enforces both by diffing the whole player object.
- **Determinism:** the bar is **same-engine reproducibility** and the audit is CLOSED at it
  (`docs/DETERMINISM-AUDIT.md`) — a pinned seed reproduces a match bit-exactly in one browser;
  cross-engine equality is explicitly not a goal, so the fixed-point work is parked. What still
  binds: **never call `Math.random` from inside `step()`**. ⚠️ That rule is literal, and three
  streams exist so it can stay literal — `w.rng` for the sim, `fxRnd` for particles (spawned
  from `step()` but render-only; drawing from `w.rng` would make how many sparks flew perturb
  every later bot decision), `audRnd` for sound jitter (a wall bounce plays a sound from inside
  `step()`), plus `w.lobby.rng` and the pitch-wear LCG. `tests/determinism.mjs` traps a
  violation with a **throwing** stub and hashes the whole world at frame 3,600 across two runs.
  AI randomness goes through `w.rng` (`mulberry32`, seeded from `w.seed`, set
  outside the sim at `startMatch`). `setMatchSeed(n)` pins a match for tests.
- **Map votes:** a thumbs up/down after each match, keyed on **(field, players per side)** —
  `mapVoteKey(w)` — because a map plays nothing alike 1v1 and 6v6. The size comes from the
  bodies actually FIELDED, not `mode.per`, since the lobby can put six a side on a 4v4.
  Stored in `localStorage` under `magnetball.mapvotes`; `mapVoteTable()` ranks the pairs and
  `buildMapVotes()` draws them on the career screen. `tests/mapvote.mjs` holds the split.
- **`youTeam(w)` / `yourScore(w)` — WHICH SIDE ARE *YOU* ON.** ⚠️ Everything that
  reported or recorded a result read `w.score[0]` as "mine", and team 0 is not always
  yours: the warm-up lobby assigns sides by which half you walked into. Measured — a
  5–0 win from the top half recorded as a **LOSS**, with RP, Elo, the streak, the
  goals for/against and the clean sheet all inverted, and the result screen saying YOU
  LOSE over a match you won. It reached Season (a cleared round counted as failed) and
  Gauntlet (a won round costing a life) through the same door. The bench is searched
  too — a substituted player's match was still theirs, the same reason `matchRoster()`
  exists. ⚠️ The result screen's **scoreline stays in TEAM order**: the scorebug is
  colour-coded red-then-blue and has read that way all match, so putting your goals
  first would print a number the player never saw. The title carries the perspective.
  ⚠️ **Guests have no record at all** — only the main player is tracked, `stats` is a
  flat object of numbers, and a name in the Player names box never reaches the save.
  `tests/yourside.mjs`.
- **First match ever: one continent vs another** (`CONTINENTS`, `CONTINENT_KEYS`,
  `isFirstRun`, `firstRunLineup`). Every bot on a side wears a country from one
  continent, the two continents differ, and no country is fielded twice.
  ⚠️ **A ONE SHOT**, persisted at `magnetball.firstrun` — not "every match until you
  change a setting", which would hand a player happy with the defaults a different
  team every time and break the separate guarantee that a bot's look is stable across
  a restart. It also stops the moment `magnetball.sel` exists, which is exactly "has
  changed a setting"; the boot path does not call `saveSel()`, verified, or this would
  be dead code on the first frame.
  ⚠️ **HUMAN SEATS ARE LEFT ALONE.** You have a profile — name, colour, flag, photo —
  and none of it is the game's to overwrite. On a fresh device your seat carries no
  flag, so you are the one body on the pitch that is not a country.
  ⚠️ The continent table is a **key list per continent**, not a `continent:` field on
  each `FLAGS` entry — `FLAGS` is a cosmetics table the pickers iterate, and a
  per-entry field is 84 separate edits to keep in step. `placedFlags()` + the suite
  assert the union covers `FLAGS` **exactly once**, which is what stops a new flag
  silently dropping out of the draw — it caught five on the first run.
  ⚠️ Turkey and Russia sit in Europe and **Australia in Asia**: the tie-break is the
  confederation they play football in, and Australia is also the only Oceania country
  here — a continent of one cannot field a side. `tests/continents.mjs`.
- **Progression:** `stats` (RP `points`, ranks, and Elo `mmr` via `updateMMR`). Saves in
  `localStorage` under `magnetball.*` keys.
- **Leaderboard:** `LB` config; reads via the public Google **gviz** JSON endpoint (`lbLoad`,
  `lbParseGviz`), writes scores/replays via an Apps Script (`lbSubmit`, `lbSubmitReplay`) if
  `LB.endpoint` is set. Falls back to a local sample when the sheet's unreachable.
- **Social/Watch:** local Instagram-style feed (`feed`, `buildFeed`, `drawClip`); Save-clip goals
  are pushed in for real.
- **Replays:** rolling `repBuf`; `repOnGoal` freezes it; `playReplay` re-renders (skippable);
  `saveClip` records via `MediaRecorder`.
  ⚠️ `drawReplayFrame` applies **the same `cam.rot` transform `render()` does**. Deck view turns
  the pitch a quarter-turn and the replay drew it un-rotated, so on a Steam Deck the replay came
  back at ninety degrees to the match it was a replay OF. The transform lives at the two call
  sites rather than inside `drawPitch`, which both paths share. The REPLAY label is drawn
  **outside** the rotation and placed through `screenPt` — it is UI, so it stays the right way
  up while the pitch behind it turns.
- **The auto-replay waits LONGER than the plain goal hold** (`GOALHOLD`,
  `autoReplayReady`). ⚠️ **Two waits, not one.** A replay that cuts in the moment the ball
  crosses takes the goal away from you in order to show it back, and the thing anybody wants
  to see first is the net. It also has to clear `REP_TAIL` by a real margin — the tail is
  captured on a delay, so a replay starting too early is a replay of the approach with the
  goal cut off the end. With no replay coming there is nothing to wait for and the plain hold
  is exactly what it always was, so kickoff timing on a normal goal is untouched.
  ⚠️ **`autoReplayReady` is ONE predicate**, because the answer is needed twice — to pick how
  long to hold, and to decide what to do when the hold runs out — and two copies drift into a
  hold that waits for a replay that never comes.
  ⚠️ A **synchronous test harness must switch auto-replay off**: `playReplay()` returns a
  promise, and a `for` loop of `step(w)` with no `await` in it can never resolve one, so the
  goal state just keeps ticking. `tests/botai.mjs` was losing **910 of 3,600 steps** a duel
  to this, which is where its ladder's run-to-run swing was coming from.
- **Goal replays keep a TAIL** (`REP_TAIL` 1.6s, `repPend`, `lastReplay.goalAt`). ⚠️ The
  goal state still integrates ("ball flies into the net; players can keep moving"), so those
  frames were already in the rolling buffer and `repOnGoal` threw them away by freezing at
  the crossing. The freeze is delayed instead: `repOnGoal` snapshots immediately (so Save
  replay is never looking at nothing) and again once the tail is captured — the auto-replay
  fires at 1.8s, comfortably after. `REP_MAX` covers `REP_SECONDS + REP_TAIL`, so keeping
  the tail does not cost you the approach play, and `repGoalIdx` **decrements with the ring
  shift** or the marker drifts a frame per capture. `goalAt` rides in the replay file too.
- **Replay transport** (`#repCtl`, `REP_SPEEDS`, `replay.paused/speed/controls`) — pause,
  four speeds, exit, and a progress line marking where the ball crossed. ⚠️ **Only for a
  replay you CHOSE to watch.** The instant replay after a goal stays a one-gesture skip: any
  tap, key or pad button, no bar, because four things to read between a goal and the kickoff
  is worse than no replay. With controls up a tap on the pitch does nothing (a mis-tap must
  not end what you sat down to watch), space pauses and Escape leaves.
  ⚠️ `dur` is recomputed **every tick** — captured once, the speed buttons set a variable
  nothing reads. ⚠️ Paused, `last = t` tracks the clock; leaving it behind banks the paused
  seconds and fast-forwards on resume (measured: a 1s pause jumped 16.6% of the replay in
  60ms). ⚠️ `#repCtl` lives **outside `#hud`** — playback hides the HUD, and in there the bar
  was `hidden`-free and **zero pixels tall**. `tests/replaywatch.mjs` measures rendered
  boxes, never the class.
- **A replay you CHOSE to watch is not an interruption** (`replay.controls`, `replay.ended`,
  `replay.restart`). Two things follow, and both were wrong.
  ⚠️ **It HOLDS on the last frame** instead of closing itself. Reaching the end is not a
  request to leave — you went looking for that one — and closing took away watching it
  again, scrubbing back to the goal, or slowing it down, all of which the transport already
  offers. The bar's ✕ is what leaves, and the pause button becomes **Watch again**
  (`repTogglePause` sets `replay.restart`, the tick honours it). The goal replay is
  untouched: it interrupted the match, so getting out of the way is right.
  ⚠️ Which means **`playReplayFile` with controls no longer resolves on its own** — it
  settles when something exits. `watchReplayFile` awaits it and restores the menu in a
  `finally`, which is exactly the wanted behaviour; a synchronous `await` on it in a test is
  a hang (it cost this suite twenty minutes once).
  ⚠️ **`replayAbort()` therefore SETTLES the promise** (`replay.finish`, idempotent). It
  cancels the pending frame, so the tick that would have called `finish()` never runs, and
  the awaiter — and the `finally` that puts the menu back — was orphaned. Lowering the flag
  was enough only while the tick was left alive to notice.
  ⚠️ **No "▶ REPLAY" caption over it.** The label exists to explain a replay that cut in by
  itself; on one you opened it is a word sitting on top of what you came to watch.
  ⚠️ `tests/replayfile.mjs` measures the caption as a **DIFFERENCE** between the same frame
  drawn both ways, never an absolute pixel count — the halfway line and the centre circle
  are drawn in a colour close to the accent and sit exactly where the caption would, so
  "few accent pixels in the middle" read 103 with the label already gone.
- **Auto-record** (`sel.autoRec`, `AUTORECOPT`, `autoRecSave`, `autoRecName`): keep every
  goal without pressing anything — for demoing, where stopping to save each one is the thing
  you cannot do. ⚠️ Fires from **`repFreeze`**, not `repOnGoal`: the first freeze happens the
  instant the ball crosses so the replay bar is never looking at nothing, and it stops AT the
  crossing, so auto-saving that one files away every goal with the net cut off the end. This
  is the freeze that has `REP_TAIL` on it. ⚠️ **Library only, never a download** — a file per
  goal puts an unasked-for save dialog on screen mid-match on some browsers and buries a
  downloads folder in a long session. ⚠️ Three states, not a toggle: goals are ~40KB each and
  a whole match ~800KB, so `all` is a separate choice rather than something that arrives with
  the first one. Default **off**, since it writes to storage on every goal.
- **Replays are NAMEABLE and the card is TABBED** (`repLibRename`, `SUBTABS.replay`,
  `fillRepPane`). A name **replaces** the generated title rather than appending to it — the
  point of naming one is to find it, and "Kai 2-1 · Goal · Classic · 3v3" buries the half you
  chose behind the half the game chose — and it reaches the exported **filename**, because a
  downloads folder is where you go looking. Auto-recorded ones are named at the moment of the
  goal (scorer + scoreline), since a row read weeks later is otherwise the same row over and
  over. ⚠️ The rename is an inline input, not a `prompt()`: prompt is blocked outright in an
  installed PWA on some platforms and cannot be reached by a controller. ⚠️ `repLibRename`
  does its read-modify-write **inside one transaction**, or two overlapping renames lose one.
  Goals and matches get a pane each — forty rows of both interleaved by time means scrolling
  past matches to find goals.
- **Replay files on disk** (`REPFILE`, `repFileBuild`/`repFileParse`/`repFileWorld`,
  `saveReplayFile`, `playReplayFile`, `openReplayFile`). Save clip writes a **video** —
  right for sending someone, wrong for keeping: large, baked at whatever size the window
  was, and never usable again. A replay file is the replay **itself**, so it re-renders at
  your screen's size, in your theme, at any speed, in ~25KB. Saved from the replay bar and
  the result footer; opened from the menu's own **Replays** card (`data-sec="replay"`,
  `watchReplayFromMenu`) and still from **Watch → Load replay**.
  ⚠️ **The menu has to get out of the way.** On a phone `#setup` is a full-bleed fixed
  screen at z-index 20 over the canvas, so a replay plays perfectly and is completely
  invisible — `watchReplayFile` calls `hideScreens()` first and puts the screen back in a
  `finally`, so a throw mid-playback still lands you somewhere. Ending and stopping early
  come back DIFFERENTLY now: an exit returns you, and running to the end HOLDS on the last
  frame instead — see the replay-you-chose entry above.
  ⚠️ `watchReplayFile(back, pick)` takes a picker override purely so a suite can drive it —
  a real file dialog can't be opened headlessly, and what's worth testing is what happens
  *around* the playback.
  ⚠️ `pickReplayDoc` resolves on **`cancel`** as well as `change`: dismissing the dialog
  fires no `change`, and the caller's `finally` is what restores the menu, so a promise
  listening only for `change` is a menu that never comes back.
  ⚠️ The card **says where files land**, and that is a `downloadPathHint()` per platform,
  never a real path — a page is never told the download directory, so an absolute path
  would be a fabrication, and the card says so in as many words. The example filename is
  generated from the real `repFilename()` with the timestamp swapped out, so it cannot
  drift from what actually gets written.
  ⚠️ **Plain `.json`, not an invented extension.** It shipped for one commit as `.mbr`
  ("MagnetBall Replay") — which already means Master Boot Record, and bought nothing when
  the payload is ordinary JSON. A saved replay now opens in any editor, viewer or diff.
  ⚠️ Which makes `format: 'magnetball-replay'` **load-bearing rather than decorative**: the
  picker will hand us any JSON on the disk, so the magic string is the only thing between a
  `package.json` and a stack trace on a menu. The filename carries `-replay-` for the same
  reason — with a generic extension the name is all that distinguishes it in a downloads
  folder.
  ⚠️ **SELF-CONTAINED, and that is the whole design constraint.** `drawReplayFrame` reads
  the field geometry and every player's colour/flag/eyes off the **live world**, so a file
  of positions alone can only be watched in the match it came from — i.e. never, since the
  replay is already in memory by then. It carries the field key and a full look per player,
  and `repFileWorld` rebuilds a world through **`buildGeometry`**, never a hand-copied
  bounds object (the walls and posts are what `drawPitch` paints the court from). `look` is
  stored but deliberately **not applied** — you watch in the theme you are sitting in.
  ⚠️ `playReplayFile` swaps the **global `world`** rather than threading a source through
  `drawReplayFrame` → `drawPitch` → `wx`/`wy`/`cam`, which all take the live world
  implicitly. Safe only because `loop()` returns immediately while `replay.active` is set,
  and restored in a `finally` so a throw can't strand the game holding a replay's world.
  ⚠️ **One frame encoder** (`repEncodeFrames`/`repDecodeFrames`) shared with the sheet
  payload — the sheet caps at 120 frames to fit a cell, the file passes `Infinity`; two
  copies drifted the moment the file wanted more frames than the sheet could hold.
  ⚠️ Versioned, and **every row is length-checked before playback**: a short row indexes
  past the end and fails as a **blank screen**, not as an error anybody can read.
  `tests/replayfile.mjs` loads a file into a page that has never played that match —
  different field, different mode — which is the only place a missing field shows.
  ⚠️ Its render check measures **coverage over a known fill**, and varies the players and
  the ball **independently**: "two frames look different" passed with the players pinned at
  the origin, because the ball alone moved.
- **The on-screen thumbstick is DIGITAL** (`sel.touchDigital`, default on; `TOUCHDIG`,
  `digitalVec`, `touchIsDigital`). Eight directions and nothing between them: you are
  holding a direction or you are not, and a half-push is full speed.
  ⚠️ It produces the **keyboard's own shape** — `-1`, `0` or `+1` per axis — because
  `pollKeys` has always written exactly that into the same `pads.p1` fields, and
  `applyHumanInput` already normalises a diagonal so two arrow keys at once is not 41%
  faster than one. Copying that shape puts the touch stick down the same path rather than
  giving it a second, parallel one; normalising here as well would scale a diagonal twice.
  ⚠️ **EIGHT-way, not four.** Four makes a diagonal unreachable, and the keyboard has been
  eight-way since it existed, so four here would mean the two input methods no longer agree
  about what the game can be told.
  ⚠️ Snapped in **`onMove`**, never in `applyHumanInput` — every input method goes through
  that, so the snapping would reach controllers too, and a real stick has an in-between that
  ought to mean something. `tests/digitalpad.mjs` stubs `navigator.getGamepads` and drives a
  pad seat for exactly that reason.
  ⚠️ **TWO readings on the pad, and they are different things.** `rawX/rawY` is where the
  THUMB is and exists only so `drawPad` can keep the marker under the finger holding it (the
  same rule that keeps a live thumbstick off the tilt UI layer); `dx/dy` is what the game is
  told. A pip on the rim shows which of the eight is being applied, because either side of a
  sector boundary the thumb looks identical and there are only eight answers.
- **Standup arcade (`sel.display === 'arcade'`, `ARCADE`, `arcadePad`):** a fourth layout
  beside Auto, Steam Deck and Cocktail — an upright cabinet with four sets of controls,
  everybody stood shoulder to shoulder facing one screen. Four people against the AI, or
  two a side.
  ⚠️ **THE KEYBOARD IS THE WIRING**, and that is how cabinets are actually built rather
  than a shortcut: a JAMMA harness runs into a keyboard encoder (an I-PAC, a Zero Delay)
  and every stick and button on the panel arrives as a keystroke. The map is **MAME's own
  defaults**, so a cab wired by anybody who has ever wired one works with no setup —
  P1 on the arrows with LCtrl/LAlt/Space, P2 on RDFG, P3 on IJKL, P4 on the numpad, 1-4
  to start, 5-8 to insert a coin, F2 for service.
  ⚠️ **The four panels are VIRTUAL GAMEPADS, not a new seat type.**
  `connectedGamepadIndices` and `gamepadPad` are the two functions the whole seat machinery
  already goes through — assignment, drop-in, names, the warm-up lobby, `evenUpSides` — so a
  cabinet inherits every one of them instead of growing a parallel path to keep in step.
  ⚠️ **Bound to `e.code`, never `e.key`**, and a numpad key's `e.key` is never its own name:
  NumLock ON, `Numpad6` reports `"6"` — which is **P2's coin slot** — and NumLock OFF it
  reports `"ArrowRight"`, which is **P1's stick**. So an `e.key` build cross-wires two panels
  whichever way the encoder leaves the lock. `code` is also the physical switch regardless of
  layout, so a cab built in France works.
  ⚠️ **`keyboardDrivesGame()` returns false here.** The keyboard IS the panel and every seat
  already reads it through `arcadePad`; leaving the ordinary keyboard seat live as well hands
  P1's stick to two players at once — the seat it was given and whoever holds `human1`.
  ⚠️ **Not a touch layout**, however narrow the cab's monitor: `isTouchLayout` is what draws
  the on-screen thumbsticks, and on a cabinet those are two controls nobody can press sitting
  on top of the pitch. `viewMode()` answers `'arcade'`.
  ⚠️ **`pollLobbyStart` and `pollSubReady` are the one place the virtual-pad trick does NOT
  carry a cabinet for free** — they reach into the Gamepad API directly, because START is not
  part of the shape a pad reports here. `arcadeStartHeld`/`arcadeFireHeld` answer for them.
  Without that the warm-up lobby had **no way out at all**: four people stood at a live START
  switch waiting on the 30-second auto-start.
  ⚠️ Calibration is untouched — `needsCalibration` is cocktail-only, and on a cabinet
  everybody faces the same screen, so there is nothing to discover.
  **Credits** (`ARCADEBK`, `arcade`, `arcadeCoin`, `arcadeSpend`, `sel.arcadePlay`): coin-op
  needs a credit, free play does not.
  ⚠️ **Free play still COUNTS THE PLAY** — an operator wants to know how much the machine is
  used whether or not it is charging for it.
  ⚠️ **The takings are kept OUT of `sel`.** `saveSel()` serialises all of `sel` to
  localStorage and `syncAdopt()` shallow-merges it between the game and the settings window;
  a merge is exactly the wrong thing to do to a counter. Same argument as the VJ decks.
  ⚠️ A coin is **edge-triggered on keydown** with an `e.repeat` guard, never polled — a coin
  slot leant on is otherwise free credits for as long as somebody leans on it.
  ⚠️ **START only starts a game when `arcadeIdle()`** — nothing running, the attract demo, or
  a finished match. Mid-match it is the lobby's ready button, and hijacking it takes the game
  off four people because one of them leant on the panel. Deliberately **not** `updCanShow`,
  which asks a similar question and counts a PAUSED match as fine: an update prompt over a
  pause is, a fresh game over one is not.
  ⚠️ `loadArcade()` is called **directly under its own declaration**, not up with `loadSel()`
  in the bootstrap — `arcade` is a `let` further down, and a call from up there reads it in
  the temporal dead zone and takes the page out. **Tenth TDZ bite in this file.**
  The operator screen (`#arcadeCfg`, `openArcadeCfg`, `buildArcadeRows`, `syncArcade`) is
  reachable from the Display card **and from the service key**, because a cabinet has no
  menu — the person opening it is stood in front of the machine with the coin door open and
  the panel is their only input. It names the **switches** (`arcadeKeyName`: "Num 8",
  "L-Ctrl") rather than the codes, since it is read by somebody wiring a harness. The reset
  **arms then confirms**, like the replay and photo deletes. ⚠️ `syncArcade` is its own
  function rather than a `buildArcadeRows()` call: it runs on every coin and every game, and
  rebuilding the panel map for a number that changed relayouts the screen under the
  operator's finger. `tests/arcade.mjs`.
- **Cocktail calibration is for CONTROLLER seats** — `needsCalibration(p)`, the one
  predicate the on-screen button, the pad poll and the button's label all read.
  Cocktail is a tabletop layout where people sit on different edges, and what has to be
  discovered is which way "up" is for a **stick held at some angle to the screen**.
  ⚠️ A touch seat has nothing to discover: the thumb zone is drawn on the screen the
  player is looking at, and **cocktail multiplayer is controllers**, so there is only
  ever one touch player here. The one two-touch-player mode, `local`, is a **phone**
  split — `zoneForTouch` rotates player two by a fixed 180° and never reads
  `sel.cocktailSides` at all.
  ⚠️ This **reverses** an earlier call made on a wrong premise: touch calibration was
  kept because "players on different edges need different rotations", which is true and
  is true *of the controller seats* it was being used to justify a touch path for. A
  lone touch player was made to hold a stick in two directions for a second each to
  establish a rotation that was never in question. Their side comes from `seatSide()`,
  which **Display → Configure player sides** sets by hand, so nothing is unreachable —
  `tests/touchstart.mjs` measures that fallback as well as both halves of the gate.
  Keyboard is not a case: `pollKeys` returns immediately in cocktail ("pads only").
- **Warm-up lobby Start is reachable by TOUCH** (`#lobbyStartBtn`, `onLobbyStartPress`).
  ⚠️ **`pointer-events: auto`, and its absence was a whole bug on its own.** `#hud` is
  `pointer-events: none` so the pitch underneath stays steerable, and every control in
  there — pause, the scorebug, the replay bar — opts back in with `auto`. This one did
  not, so on a phone the lobby's START was drawn, lit up and completely dead: every tap
  fell through to the canvas and `elementFromPoint` at the button's own centre returned
  `game`. `tests/touchstart.mjs` had pressed it with `.click()`, which dispatches at the
  node and does no hit testing, so nineteen assertions passed over an untappable button;
  it now asks the document what is at that point.
  ⚠️ Start used to be bound to a gamepad button or the Enter key and nothing else, so in
  cocktail — which forces the lobby whatever is connected — a touch-only player could not
  leave it: the idle auto-start resets on movement, and an engaged player sat there for 90
  simulated seconds. The button is **opt-in** (`sel.lobby === 'touch'`); the default
  `'on'` is the old controllers-only behaviour exactly. It routes through `lobbyStart()`,
  the same path the pad and the auto-start use, and asks a cocktail seat to calibrate first.
  `tests/touchstart.mjs`.
- **Show mode (`sel.showMode`)** — the menu cut down for a guest. Handing somebody the
  game means handing them 376 controls across eleven cards when all they want is to
  start a match, so show mode hides everything that is a **setting** and leaves what is
  a **choice**: KICK OFF, Warm-up, the Match card's Game + Pitch tabs (`SHOW_PANES`),
  and How to play (`SHOW_TILES` — the one survivor that isn't a setting, because a
  stranger needs to know what the buttons do). Eleven cards become two, and the search
  index drops from 559 rows to 72.
  ⚠️ **ONE predicate, `shownInShowMode(sec, pane)`, and everything that can surface a
  control goes through it** — the sub-tab chips, the jump bar **and `menuSearchIndex`**.
  CSS is only half a fix: `display:none` hides a card from the eye and from nothing
  else, so without the index filter the search still lists every hidden setting and
  jumps a guest into the pane you just hid. Same hole `audit` watches for with orphan
  panes; `tests/showmode.mjs` sabotage-checks exactly that case.
  ⚠️ Also hidden: the **search box** (a door that says "search settings"), the **update
  check** (it reloads the page mid-demo) and **Reset all settings** — the single worst
  button to leave in front of a stranger.
  ⚠️ **A tidiness control, not a security one.** The toggle sits in plain sight on the
  **pause screen** (`#ovShowLock`, pause only — over a result screen it would land
  between Restart and Main Menu). Anyone who thinks to pause can turn it off; that is
  the deal, because a hidden gesture nobody can find is one *you* cannot find in six
  months. The pause screen is also the only place it can live: in the menu it would
  hide along with everything else the moment it was switched on.
  ⚠️ **Guest matches still count** — asked for explicitly, so nothing here touches
  `recordResult`. ⚠️ Persisted through `saveSel()` and re-applied at boot, or a reload
  unlocks it. ⚠️ **Default off**, which is what makes `audit`'s "every setting is
  reachable" true — `tests/showmode.mjs` asserts the default where the reason is written
  down, since `audit` failing would otherwise point nowhere near here.
- **Warm-up is only OFFERED where it has something to do** — `warmupUseful()`, and both
  ways in follow it (`syncWarmupOffer` hides `#warmupBtn` and the result screen's
  `#ovRematch`). The lobby exists to test a stick, walk onto a side and calibrate a
  cocktail seat. ⚠️ On a **phone with no controller** there is none of that — one or two
  thumbs on one screen, fixed sides, no stick — so both entry points were a trip to an
  empty room; on a phone the result screen is now Restart / Main Menu, which is the whole
  of the choice there. It comes straight back for cocktail, for `sel.lobby === 'touch'`
  ("Everyone", an explicit ask), and for a connected pad — gated through **`padsTakeSeats()`**
  rather than a second copy of `sel.controllers === 'on'`, since `controllers` defaults to
  `'off'` and a pad driving nobody has no stick to test.
  ⚠️ Deliberately **not** gated on `sel.lobby === 'off'`: Skip means "don't drop me in
  automatically" and the button is the manual way in, so hiding it there leaves no way at
  all. That is the difference from `lobbyWanted(w)`, which asks whether *this match* should
  start in the lobby rather than whether to offer it.
  ⚠️ Re-synced live — on `gamepadconnected`/`disconnected`, at the end of `buildSettings`
  and on `resize` (`viewMode()` reads the window, so a rotation changes the answer) — never
  decided once at boot. The result screen's copy is found by `dataset.role === 'warmup'`,
  cleared in `showOverlay` (the one place that restores the standard buttons) rather than at
  each of the eight sites that repurpose that button for Menu / Cup / Retry / Drills.
  `tests/warmupoffer.mjs`, which pins the rule from **both** ends — a predicate that only
  ever returns false passes every hiding check and would have deleted the feature.
- **Drop-in / substitutions (`sel.dropIn`, default on):** plug a controller in mid-match and
  a body walks out to the **touchline**; walk to the half you want, press START, and you come
  on **at the next goal**. ⚠️ Seats used to be handed out exactly once in `startMatch`, so a
  pad woken after the whistle did nothing for the rest of the match — and the first fix
  over-corrected, taking a bot over the instant any button went down, mid-play, with no side
  pick and no say in when.
  - **On CONNECTION, not a press.** The waiting body is outside the pitch and not in
    `w.players`, so it cannot touch the ball or anybody else — which is exactly what makes
    connection enough. The press that matters is the START asking to come on (`pollSubReady`,
    edge-triggered, and pressing it again cancels).
  - **ONE gate** (`subGate`), on the touchline beside the halfway line — where substitutions
    happen in the real game, and the only place a body can cross without walking through the
    play. Everything crossing uses it: the joiner, the bot added to even up, and anyone
    leaving. Derived from the field, never stored — courts differ in width threefold.
  - **The side is where you stand.** `subSideOf` reads the half a *waiting* body is beside —
    deliberately **not** `lobbySideOf`, which answers −1 for anything outside the touchline and
    so answers −1 for every body out here. Undecided is a real third answer and falls to
    `subDefaultTeam`, which reads the **Extra controllers** setting that already means this
    question (Versus → against you, Co-op → alongside).
  - **The match GROWS to fit.** A 3v3 that gains a player is a 4v4 — arriving never costs a
    body its place. ⚠️ `evenUpSides` is the **one owner** of "both sides field the same number,
    never fewer than the size it kicked off at"; a join, an unplug and a swap all go through it,
    so a 4v3 can't survive long enough to look like a bug in the bots. Only ever a **bot** is
    taken off. `subPer` moves only when a *person* arrives or leaves — never off a bot count, or
    one dropped bot ratchets the match smaller for good — and ⚠️ `subFloorOf` is captured **at
    the whistle**, because the lobby can field six a side on a 4v4 and a floor of `mode.per`
    would quietly strip two bots off each side.
  - **Substitutions fire from ONE hook** in `step`'s goal branch, latched on `w._subDone`, not
    from the five places that set `w.state='goal'` — one of those five is always the one
    somebody forgets.
  - **Walking on:** `stepSubWalk` + `_subTo` for bodies coming on, `_subPath` (gate, then bench
    slot) for bodies going off, both through the lobby's own `walkTo`. ⚠️ `_subTo` also
    suppresses the AI at the `runBot` call site — `walkTo` sets position directly, so a thinking
    bot fights it and jitters on the touchline.
  - **Unplugging** hands the body back through the gate keeping its name and stats, and a pad
    that hiccups and returns **reclaims its own body** (`_padWas`) rather than minting a P3 and
    stranding a half-match on the bench. ⚠️ `matchRoster()` is what the result screen reads, so
    a player who left still appears — `w.players` alone drops the half they played.
  - `drawSubPrompts` says which pad it is, which side it would get and what to press, clamped
    inside the canvas (the body is outside the touchline, so a centred label loses its last
    words — which are the side). `tests/dropin.mjs`.
- **The warm-up ball is LIVE, and there is one per half plus one per person.**
  `integrate(w, false, false)` in the warmup branch — it passed `true` and froze the
  ball, which made the one control you most need to test the one control you could
  not. Safe because `checkGoal` is gated on `w.state === 'play'`. `LOBBY.ballBase/
  ballMax/ballSpread/ballRow`, `syncLobbyBalls` (called every step, so a pad waking up
  mid-lobby brings a ball on), `lobbyBallSpot` (pure arithmetic — no PRNG at all). ⚠️ `LOBBY.ballCols` is an
  explicit centre-out list because the arithmetic version put balls 0 and 1 on **exactly
  the same point** — invisible in a screenshot, and it made a trapped ball fire the one
  you were not looking at.
  ⚠️ Balls are ADDED and REMOVED, never repositioned: a ball somebody is dribbling
  must not teleport home because a fourth player plugged in.
  ⚠️ **A `ballOnly` wall on halfway** (`addLobbyWall`) keeps each half's balls on that
  half while players still walk across freely — walking into a half is the entire
  mechanism for picking a side, so a wall that held players would break the lobby.
  ⚠️ **`clearLobbyProps` is called from `resetKickoff`, NOT `lobbyStart`** — that is
  the one function that lays the pitch out for play and it is on every path into it,
  so a wall across the middle of a live match cannot happen however warm-up ended.
  `enterWarmup` runs *after* `resetKickoff` at `startMatch`, so they don't fight.
  ⚠️ **KICK no longer starts the match** (`pollLobbyStart` is START/Select only). A was
  bound to both jobs and did the wrong one — a player warming up pressed A to kick and
  the lobby ended instead. Nobody is stranded: Select is still bound and
  `#lobbyStartBtn` is on screen throughout. `tests/lobbyballs.mjs`.
- **`nearestControlBall(w, p, ball)` — a player controls the NEAREST ball**, not
  always `w.ball`. ⚠️ `handleBallControl` was only ever handed the primary ball, so
  every extra was a thing you could bump and never kick; multiball hid it (an obstacle
  reads like a ball you keep missing) and the warm-up balls made it obvious. ONE ball
  per player per step, never a loop — `p.trap`/`p.kickUsed`/`p.chargeT` are
  single-ball state, so kicking everything in range is a shotgun. The snail and
  berries are excluded: they have their own handlers for reasons written above.
- **Warm-up lobby:** `lobbyPlan(w)` is the **single source of truth** for who plays, on which
  side, and how many bots fill the gaps — `drawLobby` renders it and `lobbyStart` executes it,
  so the on-pitch preview can't disagree with what Start does. Standing on a half picks that
  team *including when everyone picks the same one* (six pads on one half = 6v6 vs bots);
  `spawnLobbyBot` builds bots to order when the mode's roster runs short.
  ⚠️ Standing **on** the halfway line is not a side pick — it is where everyone spawns
  (`LOBBY.neutral`). Walking into a half is one. Without that distinction a lone player was
  auto-assigned team 0 however far they walked, and the on-screen preview — computed separately
  from `lobbySideOf` — happily showed them on the other half. The preview reads `lobbyPlan` now,
  so it cannot disagree with what Start does. Bots the plan
  needs **walk on** to a random spot in the middle of their half and surplus ones walk off
  (`stepLobbyBots`, leaving faster than arriving), so the lobby shows the match you'd get
  rather than a row on the touchline — off `w.lobby.rng`, never `w.rng`, or how long someone
  spent choosing would change every bot decision in the match. The mode's seat
  count (`per*2`) is what actually caps controllers, not `LOBBY.maxPerSide`.
- **Auto-advance:** `AUTO` — the lobby kicks off by itself after 30s (`stepLobbyClock`, reset
  to full on movement, stick/KICK, or a pad connecting, and frozen during calibration) and the
  result screen starts the next match on the same config after 30s (`stepResultClock`, any input
  resets it). ⚠️ The result clock is counted on **wall-clock in `loop()`'s paused branch** —
  the result screen is a paused state, so `step()` isn't running. `tests/autoadvance.mjs`.
- **Help text is PROGRESSIVE:** `buildHintToggles()` walks every `.hint` and folds it behind
  an info toggle on its label — one component, applied by walking the DOM, because per-card
  markup means 27 places to keep in step and a new setting arrives without a toggle. The
  paragraph is folded VERBATIM, never rewritten or dropped. ⚠️ Also called at the END of
  `buildSettings()`, which creates six of the paragraphs itself — a one-shot pass at boot left
  those permanently expanded. ⚠️ `class="hint always"` keeps gameplay-affecting help open;
  whether a match is comparable is not a detail to hide. Never persisted: every visit starts
  collapsed. `tests/hints.mjs`.
- **Theme card is TABBED — the bundle grid included.** `SUBTABS.theme` is `['bundle']` plus
  `SLOT_KEYS`, so the chips and the `.subpane`s come from one list and a new slot can't arrive
  with a pane and no chip (which would hide its controls while `audit` and the menu search still
  found them). Seven tile grids stacked is most of a phone screen each, and the bundle row is the
  tallest at 19 tiles — leaving it outside the tabs meant scrolling past it to reach anything.
  ⚠️ `buildSubTabs()` is called at the END of `buildSettings()` as well as at boot:
  `buildSettings` rebuilds those panes from scratch on every slot change, so the fresh panes have
  no `.on` class and the card showed nothing at all.
- **`.subtabs` is STICKY**, pinned under its own card's header at
  `--sticky-top + --sec-h` (measured by `syncSticky`). ⚠️ A chip row that scrolls away with the
  grid is only half a fix — you still have to scroll back up to change tab, which is the vertical
  scrolling it exists to remove. ⚠️ And it must be ONE row (`flex-wrap: nowrap`, scrolling
  sideways like `#jumpBar`): two pinned rows put half the chips behind the section header and let
  the pane's tiles through the gap.
- **FPS readout:** `fps` / `trackFps(dt)`, the last row of `drawDebug`'s panel so it lands
  directly above the version tag. ⚠️ The one timer here that is deliberately **not step-locked**
  — it is counted in `loop()` off wall-clock, because the sim rate is pinned at 1/60 by design
  and a step-locked counter would read a flat 60 on every machine. Smoothed; a raw per-frame
  reciprocal jitters ±8. Inside the panel rather than beside it because `drawDebug` runs after
  `drawBuildTag` and its plate would paint over the line.
- **`padInk()`** picks the thumb-marker ink from `TH.fieldBg`'s lightness. ⚠️ They were
  hardcoded white, and Highlighter, Sorry!, Specimen and now Warp all letterbox in a light
  colour — a white ring at 0.16 alpha on a white surround is nothing at all, so the resting
  controls simply were not there on four palettes.
- **Menu navigation:** two cards held 78% of all 376 controls (Your Player 7.5 screens, Match
  3.5), so each now shows **one `.subpane` at a time** behind a `.subtabs` chip row — `SUBTABS`
  declares the groups, `showSubTab(group, pane)` switches. Four groups now: `player`, `match`,
  `theme` and `feel`.
  ⚠️ **Game Feel is tabbed too** — Ball / Player / Effects / Camera / Advanced. Nineteen
  controls in one list is how the Tilt parallax toggle came to sit *sixteenth* in it and get
  reported as a missing feature; the chip row is the heading now, which is why the three
  `.subhead` groups it replaced are gone rather than repeated inside the panes.
  ⚠️ The **preset row and the reset button stay OUTSIDE the panes**: both act on the whole
  card, and filing a set-everything control under one fifth of the things it sets is worse
  than leaving it above the chips. `#matchCard` keeps KICK OFF and Warm-up outside its own
  tabs for the same reason.
  ⚠️ Order inside the **Effects** pane is load-bearing: Screen shake, then Tilt, then the
  rest, then the Hit stop slider — `tests/tilt.mjs` pins tilt as directly after Screen shake
  and above every slider in the card, and the Camera pane (which holds Goal zoom) therefore
  has to come after Effects in the DOM. Nav tiles are grouped Play / Progress
  / Help; `#jumpBar` chips jump to a section and are built from the cards themselves.
  ⚠️ A pane with no chip **hides** its controls while `querySelectorAll` still finds them —
  `audit` checks for orphan panes for exactly that reason. Sticky order is chips → KICK OFF →
  section headers, so `syncSticky()` folds the jump bar's height into `--sticky-top`.
  `tests/menunav.mjs`.
- **VJ Mode (render/audio layer ONLY):** two video decks + two DJ decks, operated from
  `/settings` while the game runs fullscreen. **Default off**; `sel.vj.on` is the only part
  in `sel` — decks, library and files live in `vj`, deliberately outside it, because
  `saveSel()` serialises all of `sel` to localStorage and `syncAdopt()` shallow-merges it.
  Every tunable is in the `VJ` block.
  ⚠️ **ONE `AudioContext`, in the GAME tab.** Two contexts across two tabs cannot be mixed
  and drift within seconds. `/settings` sends `{t:'vjc'}` commands and files (`{t:'vjf'}` —
  the **Blob**, never an object URL, which is per-document) and receives `{t:'vjs'}`
  snapshots at `VJ.meterHz`. It never holds a node.
  ⚠️ **Two guarantees are STRUCTURAL, not policy.** `vjPaintVideo` composites at one seam in
  `drawPitch` — over the surface, under the markings — and discs/ball/trails draw later in
  `render()`, so no deck value can dim a player. `vjMarkA()` floors markings at
  `VJ.lineFloor` and returns *exactly* 1 with VJ off. `tests/vjmode.mjs` sabotage-checks both.
  ⚠️ **`ctx.filter` at full resolution cost 2.2× the entire frame budget** (45.9ms vs 20.4ms
  for the same two draws). Deck looks render through a `VJ.videoFxRes` intermediate; tint is
  a composite op, which is free. A deck at zero opacity is not decoded at all.
  The limiter is inserted on arm and **removed** when VJ Mode is off, so "additive" is literal.
  `Aud` gained buses (`sfxBus → mainMix → master`); with VJ off that is three unity gains and
  nothing else. Goal ducking dips the MUSIC bus only, hooked in `playSfx('crowd')` so a fifth
  goal path can't forget it. Auto-replay is suppressed while VJ Mode is on — it would hijack
  the projector for six seconds.
- **About card (`data-sec="about"`, `buildAbout`, `buildNews`)** — the version (`#ver`),
  **Check for updates** (`#updCheckBtn`) and the **changelog** (`#newsList`), in that order.
  Not under the title and above the fold: the version and the check are things you go
  looking for once, and neither is worth the two permanent lines they cost at the top of
  every visit.
  ⚠️ **What's new is NOT its own card.** It was, with a button in About whose entire job was
  to `openSection('news')` — so one question ("what am I running, and what changed in it")
  was two rows in the accordion, two chips in the jump bar and a hop between them. The
  changelog goes **last** because it is by far the longest thing in the card and the two
  lines above it are what somebody opening "About" came for.
  ⚠️ **The version block is a ONE-TAP COPY** (`#aboutInfo`, `aboutReport`, `copyAbout`).
  The version is the first thing anybody is asked for in a report, and reading a timestamp
  off a phone and retyping it is exactly where it gets transcribed wrong — which has already
  cost a round of "which build are you on". The whole block is the target so there is
  nothing small to aim at, and it carries the screen size and the layout, because those are
  the next two questions; **nothing personal** goes on the clipboard — no name, no photo, no
  stats. ⚠️ It **reports failure**: `navigator.clipboard` needs a secure context and is
  simply absent on a `file://` or plain-http page, so there is an `execCommand` fallback and
  the hint says "could not copy" rather than nothing — the Save clip lesson.
  ⚠️ The suite **presses the element** rather than calling `copyAbout()`, which was verified
  by deleting the onclick and watching a direct call stay green; reachability is a separate
  `elementFromPoint` check, because `.click()` does no hit testing.
  ⚠️ `buildAbout()` writes **text only** — `#ver` is a child of `#aboutInfo` and the boot
  block fills it, so rebuilding that subtree would blank it. ⚠️ With no server to ask (a
  `file://` page) the status says so rather than claiming "up to date", which would be a
  guess presented as a fact.
- **Forced updates (`UPD.graceDays` = 30, `#updBlock`, `updEnforce`):** a check on every
  launch and every return to the app, and after **30 days** with a newer build available the
  game **stops** until it is installed. ⚠️ The deadline is **persisted** (`magnetball.upd`
  = `{v, first}`) because the clock starts when a newer build is first *seen*, not when the
  player is next online — so `updEnforce()` reads the record and bites **offline too**, which
  is the whole reason it is stored.
  ⚠️ **Versions are COMPARED, never diffed** (`verNum`, `updNewer`). `r.v !== VERSION` reads
  as "there is an update" and is not: it is also true when the running build is *newer* than
  the one on record, which bricked the game — a player who updated past a recorded build was
  blocked for ever, and offline no check could clear it. The same bug had a rollback deploy
  starting a 30-day countdown to install an *older* build. `verNum` folds `YYYYMMDD.HHMMAM/PM`
  into a minute count and returns **null** for anything it cannot read; `updNewer` is false
  whenever either side is unparseable, because every consequence of a wrong `true` (a prompt,
  a countdown, a locked game) is worse than missing one update. The 12-hour clock is the trap:
  12:01**AM** is the first minute of a day and 12:01**PM** is just past noon. `updNote(null)` (could not reach the server) must NOT
  clear it, or going offline would reset the deadline every launch; seeing the **same**
  version again must not restart it either, or a daily player never reaches the deadline; a
  **different** version does restart it, because each release gets its own thirty days. It
  releases the moment `r.v === VERSION`, with no network needed to confirm.
  ⚠️ The gate sets `running = false`: a modal you can play behind is a suggestion. No
  "Later", one button, and it **reports failure** rather than pretending — offline there is
  genuinely no way through, and a button that silently does nothing reads as a broken game.
  ⚠️ `updSeen` is deliberately **not persisted**, so declining lasts one session and every
  launch asks once more; inside `UPD.warnDays` (7) it re-asks regardless and the prompt says
  how many days are left. A countdown from thirty days is noise; from a week it is what stops
  the hard gate arriving as a surprise.
  ⚠️ **`updEnforce()` and `newsMaybeShow()` are wired ABOVE the `updPossible()` guard** in the
  boot block. Neither needs a server, and below it they never fired on a `file://` page —
  which is where every suite runs, so it was invisible until one was written.
- **Changelog (`CHANGELOG`, `buildNews`, `newsShow`):** ⚠️ declared **near the top of the
  file**, and `const VERSION` had to move up with it — `buildNews()` runs during the
  bootstrap, and VERSION two-thirds of the way down took the whole page out with
  "Cannot access 'VERSION' before initialization". That is the **seventh** TDZ bite here.
  ⚠️ **What goes in is the rule**: only what a player would want to know. Every bug fix
  collapses into ONE generic line — a player does not care which flex column was centring
  its overflow, and a changelog that itemises internals is one nobody reads twice.
  `tests/forceupdate.mjs` checks the entries for developer jargon.
  One renderer (`releaseBlock`) for both the modal and the menu card, so they cannot drift.
  The modal fires **once per update per device** off `magnetball.lastver` and shows only the
  release you landed on; a **first-ever visit records the version and shows nothing**, since
  "what's new" as the first thing you ever see is a changelog for a game you have not played.
- **Photo library (`PHOTOLIB`, IndexedDB, `photoLibAdd/All/Del/Trim`, `buildPhotoGrid`):**
  up to 100 saved faceplate photos, tap one to wear it, capped with the oldest going.
  ⚠️ **Photos are stored INLINE**, which looks like the mistake `REPLIB` documents and
  is the opposite case: the replay LIST is text, so reading the payload to draw it was
  pure waste, while the photo list **is** the photos. At ~6KB each a full hundred is
  ~600KB. ⚠️ IndexedDB not `localStorage` — the ~5MB budget is already shared with the
  save, the settings and the worn photo. `profile.photo` stays the WORN one in
  `localStorage`: a disc must never wait on a database to draw.
  ⚠️ **Deleting ARMS first** — press Delete, tick, confirm — because the tiles are
  small and close together and it cannot be undone; the confirm says how many. Picking
  passes `keep:false` so wearing one does not re-add it (a hundred slots filled with one
  face). Deleting the one you WEAR clears your face too.
  ⚠️ **It shares `REPLIB`'s database**, so the store arrived as a version bump — and
  `repLibOpen`'s upgrade handler dropped both replay stores **unconditionally**, written
  for a v1→v2 migration where the old schema was hours old. Reached from v2 it would
  have deleted every replay a player had saved. Gated on `ev.oldVersion < 2`, with the
  stores created only if missing.
  ⚠️ `const PHOTOLIB` is declared with `PHOTO`, near the top — `buildPhotoPane()` runs
  during the bootstrap and draws the grid, and declared beside `REPLIB` it was in the
  temporal dead zone there. **Eighth TDZ bite in this file.** `tests/photolib.mjs`.
- **One-handed play: a RELEASE is the FINGER LIFTING**, not the stick reading low
  (`ONEHAND`, `oneHandKick`, `padTouchDown`). It armed and fired off magnitude alone, so
  sweeping a thumb from one direction to the opposite one — across the middle of the stick,
  never lifting — crossed the deadzone and fired a shot. Crossing the centre is *how you
  turn round*, so this went off constantly. The digital thumbstick made it certain rather
  than likely (it snaps hard to `(0,0)` below `TOUCHDIG.dead`) but the analogue one had the
  same flaw. ⚠️ `padTouchDown(pad)` answers **`null`** for anything that is not an on-screen
  stick — a gamepad and the keyboard write into the same `pads` fields and have no finger to
  report — and `null` keeps the magnitude rule, because a stick springing back to centre IS
  the release there. `tests/onehand.mjs`, which drives the **real** `onDown`/`onMove`/`onUp`
  on a **phone-sized second page**: writing to `pads.p1` cannot test this at all (the fix
  reads `pad.move.id`, which only the touch handlers set), and the suite's main page is
  1280×800 where `zoneForTouch` never returns `move`.
- **A replay must never outlive its world** (`replayAbort`, and the `if (!world)` guard in
  `playReplay`'s tick). `toMenu()` sets `world = null`, and leaving a match mid-celebration
  is an ordinary thing to do — so the pending tick of a live auto-replay read `world.field`
  off null and threw. ⚠️ **A throw inside a rAF callback is SILENT**: `finish()` never ran,
  so `replay.active` stayed **true for the rest of the page**. After that `playReplayFile`
  returned at its first line, so opening a saved `.json` from the menu played nothing and
  dropped you straight back on the menu, with no error and nothing on screen to say why —
  and `loop()` checks the same flag, so the game was frozen behind it too.
  ⚠️ **Two independent guards on purpose**, and the suite is verified with **both** removed:
  either alone fixes it, so a sabotage of one passes and that is not a weak test.
  `tests/replayfile.mjs`, measured on a **phone** viewport — that is the branch of `toMenu`
  that nulls the world, since a desktop-sized window keeps the match running in a dock.
- **The replay lead-in is a DIAL** (`REP_LEAD`, `repSecs()`, `repMaxFrames()`, Game Feel →
  Camera). Six seconds was a constant, and a replay that starts mid-move shows the shot
  without the build-up that made it. ⚠️ **The ring buffer is sized FROM the dial** — a build
  that only fed it to the playback would replay the same six seconds however the slider was
  set, and every "the setting exists" check would still pass, so the suite measures frames
  actually held at 2s / 6s / 15s. ⚠️ `repMaxFrames()` is a **function**, and the ring sheds
  with `while` not `if`: turning the dial down mid-match leaves the buffer far over its new
  cap, and one frame a capture would take seconds to catch up.
  ⚠️ `const REP_LEAD` is declared with the **feel constants near the top**, beside `GOALCAM`,
  not with the replay code it belongs to — the slider wiring calls `syncRepSecs()` during
  the bootstrap, and from there a `const` two-thirds of the way down is in the temporal dead
  zone and takes the page out. **Eleventh TDZ bite in this file.**
- **Save clip REPORTS what it did.** Every exit in `recordAndShareClip` was a bare `return`
  or a swallowed `catch`, and `saveClip` wrote its status to `$('clipBtn')` — the in-match
  bar's button, **deleted** when Save clip moved to the result screen. So on a browser with
  no recorder it played the goal back, saved nothing and said nothing, which is a dead button
  as far as anyone can tell. It now returns a reason, the button is **passed in** (the result
  screen hands its own), and a recording failure beats the leaderboard sheet's status,
  because the recording is what the player pressed for. ⚠️ The container is named off
  `blob.type`, never off what `repMime()` asked for, or a webm gets handed over called
  `.mp4`; mp4 is first in the candidate list so any browser that can encode one does.
  ⚠️ Clips are named per goal — one fixed filename means each overwrites the last.
- **TWO replays, and a clip — three different things** (`repBuf` vs `repMatchBuf` vs
  `saveClip`). The rolling ring holds the last few seconds, which is a **goal**. A second
  un-ringed buffer holds the **match**, kickoff to whistle. The clip is a **video**.
  ⚠️ **Save clip is END OF MATCH ONLY.** Recording one plays the replay back through
  `MediaRecorder` for its full length, which mid-match is several seconds of the game being
  unavailable while you are still playing it — and a video is the thing you send someone,
  which is an end-of-match errand. The in-match bar keeps Replay and Save goal.
  ⚠️ The match buffer is **SAMPLED** (`REPMATCH.every`, 30Hz): plenty to watch a top-down
  match back, and a third of the memory and the file of the same match at 60. A full 5-minute
  4v4 measures **9,000 frames / 807KB**, against 41KB for a goal.
  ⚠️ Past `REPMATCH.max` it **HALVES ITS OWN RATE in place** rather than stopping. "First to
  5" has no time limit, so a buffer that stopped would save the first six minutes of a
  fifteen-minute match and call it the match — and every check would still pass, because a
  truncated recording is a perfectly valid file of a shorter match. The goal marks are
  rescaled with it.
  ⚠️ **STABLE SLOTS**, which is why this is not just a longer ring. `w.players` GROWS —
  drop-in adds a body at a goal and `evenUpSides` matches it — so a row captured after that
  is longer than one captured before. A body that arrives takes the next slot and every
  earlier frame is **back-filled** with where it was standing (on the touchline, which is
  where it was); a body that leaves keeps its slot and is recorded on the bench. Every row is
  then the same length and the replay tells the truth about both.
  ⚠️ The goal buffer snapshots its **roster** at freeze time for the same reason: the world
  can hold one more player than the frames do by the time anybody presses Save.
  ⚠️ `drawReplayFrame` is driven by the **frame's** bodies, not the live world's — the world
  is only consulted for what each one looks like, with a fallback. It used to map over
  `world.players` and index past the end of `f.p`, which took the page down.
  ⚠️ **Playback honours the recorded `fps`**, and for a long time it did not. That field has
  been written into every payload since the sheet ones were capped at 120 frames and nothing
  ever read it, so a decimated replay played back at however many times too fast its
  decimation was. Invisible until a 30Hz match file ran at double speed.
  ⚠️ The progress line marks **every** goal, not one: a line through five goals that marks
  only the first reads as "this is where the goal is". `tests/replayfile.mjs`.
- **Replay library (`REPLIB`, IndexedDB):** ⚠️ it exists because **a page cannot delete your
  downloads**. Once a Blob is in the Downloads folder it belongs to the OS — no web API can
  list, move or remove it — so "delete a replay" is only meaningful for a copy the page owns.
  Saving writes **both**: the file to send or keep, and a library entry to watch and delete.
  IndexedDB rather than `localStorage` because a replay is ~25KB against a ~5MB budget already
  shared with the save, the profile and a photo.
  ⚠️ **TWO stores** (`REPLIB.store` metadata, `REPLIB.blobs` payload), and the split is a
  performance guarantee rather than tidiness: with the frames inline, `getAll()`
  structured-cloned every replay in full and twenty of them cost **68ms to draw twenty lines
  of text** — on every rebuild of the settings screen. Metadata is a few numbers per row; the
  frames are a JSON **string** fetched by `repLibGet(id)` only when something is watched or
  exported. Now 1ms to list. A delete touches **both stores in one transaction** — half a
  delete leaves a listed replay whose frames are gone. And `buildReplayList()` is called from
  **`openSection('replay')`**, never `buildSettings()`, which runs on every option tap. Capped at `REPLIB.max` (40, oldest goes) since
  nothing else would ever remove one. ⚠️ **Delete takes two presses** — the rows are small and
  close together and it cannot be undone; the button arms to "Sure?" and disarms after 3s.
  A row's Watch goes through **`watchReplayFromMenu(pick)`**, never its own copy of
  "hide the menu, play, come back". `repLibId()` carries a counter as well as the clock,
  because two saves in one second would otherwise share a keyPath and silently replace.
- **Update screen (`#updModal`, `updCheck`):** ⚠️ it compares **`VERSION`, not the service
  worker**. A deploy here is a new `index.html` and `sw.js` barely ever changes, so
  `registration.update()` fires `updatefound` for almost none of them — an SW-based check
  reports "up to date" through every real release. It fetches the page and reads its VERSION,
  which is exactly the thing that changes. ⚠️ The regex must not match **its own source**: this
  file fetches itself, so the pattern's text is in the reply *before* the real declaration —
  requiring a digit after the quote is what stops `\s*` being read as a version number.
  ⚠️ `cache:'reload'` rather than a `?v=` cache-buster: the worker caches whatever URL it
  fetched, so a query string adds a junk entry per check, and fetching the clean URL also
  **refreshes the cached page**, which is what makes the reload reliable. ⚠️ **Never shown over
  a live match** (`updCanShow`) — held until the menu, the pause screen or the result; the
  attract demo counts as the menu. Declining silences the **automatic** checks only, because a
  player pressing "Check for updates" is asking. ⚠️ Gated on `updPossible()`: `http(s)` only
  and not in `/settings` — on a `file://` page the fetch throws into the console rather than
  failing quietly, and two windows prompting for one update is one too many. ⚠️ **Offline it
  answers from the worker's CACHE**, which is correct rather than a hole: a reload falls back
  to that same copy, so a version found offline really is installable. `tests/updatecheck.mjs`
  serves the real page and edits the version under it.
- **Service worker:** network-first for HTML, cache-first for everything else — and
  ⚠️ **HTML is decided by the URL, not just `request.mode`.** `/settings` pulls the real page
  in with `fetch('../index.html')`, which is not a navigation and sends `Accept: */*`; classified
  by mode/accept alone it took the cache-first branch and **pinned /settings to whatever
  `index.html` was precached, making every deploy invisible there**. `{cache:'no-cache'}` on that
  fetch is an HTTP directive and does not bypass a worker. `tests/swupdate.mjs` registers the real
  worker against a temp site, changes the file, and checks the settings route sees the new build.
- **Goal camera:** on a goal the view pushes in to `goalZoom()` (a player dial; `GOALCAM.zoom` is only the default) on whoever last touched
  the ball and eases back when the celebration ends. ⚠️ **THIRD tuning.** 5.0× over 1.15s was
  two mistakes at once (5× is most of the pitch gone; 1.15s of a 1.8s goal state is spent
  travelling, so what read was the MOVE rather than the moment); the correction to a 5% push
  over-corrected into a setting nobody could see. The default is now **1.8× in 0.10s** — six
  frames, so it lands as the ball crosses. ⚠️ **In and out are different numbers on purpose**:
  `outSecs` 1.10s against `inSecs` 0.10s, and `inSecs` is a dial while `outSecs` is not, so
  "fast in, slow out" holds however the dial is set. A camera that leaves as fast as it arrives
  is a twitch. ⚠️ **The release LETS GO of its subject** — `resetKickoff` teleports every body
  to its formation, so a camera still following the scorer drags the whole view across the pitch
  mid-drift-out (measured at **704px**); it freezes on the last real position instead. Invisible
  at 5%, a lurch at 1.8×. `goalZoomLabel()` says `+5%` below 1.5× (a "1.1×" label for
  a 5% push is a rounding error presented as a setting), and `normalizeGoalCam()` folds
  **both** superseded default pairs (`GOALCAM_WAS`: 500/115 and 105/10) to the new ones —
  matched on the PAIR, because 105 beside a speed the player moved themselves is a deliberate
  choice and folding it would overwrite it. Render only — it moves `cam`, which no
  physics, hit test or bot reads, and `tests/goalcam.mjs` proves the world is bit-identical
  with it running. ⚠️ Advanced in `advanceGoalCam()` next to `decayJuice()`, **never in a
  draw** (the trails rule); being step-locked also means the goal slow-mo stretches it.
  The followed player is read through `ix`/`iy`, and the origin shift is rotated by `cam.rot`
  or deck view puts them off to one side. Stands down while a replay owns the framing, and
  rides the Screen shake & effects dial.
  ⚠️ **The SHAKE and the FLASH are released with it** (`juiceReset()`, called beside
  `goalCamReset()` in `playReplay`) — same mechanism, since `decayJuice()` is step-locked
  and `loop()` returns early during playback. ⚠️ **Defensive rather than a twin of the
  camera bug**, and recorded that way on purpose: on an ordinary goal shake is at zero
  within ~430ms while a replay does not start until `GOALHOLD.replayAt` (3.0s), so nothing
  is carried in. The real case is narrow — play continues through the celebration, so a
  kick landing in its last moments tops the shake back up and *that* would be frozen for
  the length of the replay and discharged over the kickoff. `tests/goalcam.mjs` has to
  inject that late kick to test it at all; sampling the natural path reads zero on a build
  with the release and on one without.
  ⚠️ **A REPLAY RELEASES IT, it does not merely suspend it.** `applyGoalCam` standing down
  while `replay.active` is only half the job: `loop()` returns immediately during playback,
  so `advanceGoalCam` never ticks either and `goalCam.t` sits frozen at whatever it reached.
  The instant the replay ended, the loop resumed and the whole 1.8× push came back for a
  second and a tenth of kickoff — measured at 1.000 for one frame and **1.799** on the next.
  `playReplay` calls `goalCamReset()` on the way in: by the time you come back the ball is on
  the centre spot and there is nothing left to push in on. `tests/goalcam.mjs` drives the real
  auto-replay for this, not a hand-set `replay.active`, because the fix lives on the path that
  STARTS a replay — and it fills the rolling buffer first, or the auto-replay never fires and
  the whole trace is a goal with no replay in it.
  ⚠️ **`render()` calls `computeCam()` EVERY FRAME, and that is load-bearing.**
  `applyGoalCam` lives inside `computeCam`, and `computeCam` used to be called only from
  `resize()` — so the push never animated in the running game at all (measured: `cam.s`
  held its fitted value through a whole celebration while `goalCam.t` reached 1), and any
  resize landing DURING a celebration multiplied the zoom into `cam.s` and left it there,
  because nothing recomputed it after. On a phone the URL bar sliding fires `resize`
  constantly, so matches stuck zoomed at random until the player hit fullscreen. At the
  old 5% default this was a 5% error nobody could see; 1.8× made it unplayable.
  ⚠️ `tests/goalcam.mjs` passed the broken build because every assertion in it called
  `computeCam()` by hand before sampling — it measured the maths and never the wiring.
  It now has a block that drives the REAL rAF loop and touches `computeCam` nowhere.
  Amount and speed are **sliders** —
  `goalZoom()`/`goalZoomSecs()` clamp and default in one place, and **1.0× means off**
  (the camera never even latches). ⚠️ `const GOALCAM` lives with the feel constants, not
  with the camera code: the slider wiring reads it during the bootstrap, and declared
  further down it was in the temporal dead zone there.
- **HUD:** a 3-column grid — pause left, scorebug in the **middle column** (so it is centred
  on the screen, not among whatever buttons happen to show), fullscreen right. Settings is a
  **pause-menu** option (`ovSettings`), not a HUD gear one mis-tap from the live ball.
- **KICK OFF really floats:** `#matchCard` is `display: contents`, so the sticky hero
  header's containing block is the SCROLL COLUMN and not the card. ⚠️ A sticky element
  only sticks while its own parent is on screen, and with the Match section collapsed that
  parent is about a hundred pixels tall — so the hero button scrolled away almost at once
  and there was no way to start a match from the bottom of the menu. The card already had
  no background, border or padding, so losing its box costs nothing and every selector
  still reads `#matchCard > h2`. With the box gone the header is a flex ITEM of `#setup`,
  which centres its children, so it needs `align-self` and the cards' own `460px` — left
  to itself it shrank to the width of the words, then spanned 20px wider than every card.
- **One size on the pause overlay:** `#overlay > button` fixes width and min-height for
  all of them. ⚠️ Resume carried an inline `max-width` and the ghosts sized to their own
  text, so Settings and Main Menu were 109×43 and 102×43 under a 260×55 Resume — and the
  two you reach for mid-match were the small ones.
- **Picker swatches are cached** (`cachedSwatch`), in **two** maps: `swatchCache` for
  tiles painted against the live inks, dropped by `applyTheme`, and `swatchFixed` for
  bundle and palette tiles, which paint against their own palette and can never go
  stale. ⚠️ A field tile bakes its real texture at full resolution for a 64px preview
  and `buildSlotPicker` runs on every slot change — measured at **15.6ms** for the field
  row and **17.3ms** for the bundle row, so opening the Theme card dropped two frames and
  every tap inside it dropped another (now 0.5ms / 0.9ms). ⚠️ `slotSwatch` returns a
  **copy**: the Theme card stacks all six slots while the Ball and Sound cards show one
  again, so two tiles ask for the same swatch and one shared node would be MOVED out of
  the first row on append. ⚠️ The cache is declared **above `applyTheme`** — the
  bootstrap calls it long before the picker code, and a `const` further down is in the
  temporal dead zone there (the fourth time this file has been bitten by that).
  `tests/swatchcache.mjs`.
- **Menu shell:** the setup screen is an **accordion** — `openSection`/`collapseAllSections`,
  at most one card open. The **KICK OFF button is the Match card's `<h2>`**: pressing it starts a
  match, only the chevron beside it toggles the section, and `syncSticky()` measures that header
  for `--sticky-top`. There are **two** open/close chevrons: `.secchev` is a real `<button>` on the
  Match card (the header itself is KICK OFF, so it can't double as the toggle), and every other
  section uses the `.card.collapsible > h2::after` pseudo-element with the whole header as the
  target. Both are sized together — change one, change the other. `/settings` is the *same
  document* with the game switched off, kept in sync over `BroadcastChannel`.

## Testing (Playwright, headless)
Set `window.__MAGNETDEBUG = true` **before load** to expose `window.__magnet` — a live object with
getters for `world`, `stats`, `sel`, etc. and most functions (`startMatch`, `step`, `recordResult`,
`openRogue`, `computeAwards`, …). The hook MUST stay a **direct object literal with live getters**
(don't wrap it in `Object.assign`, which snapshots getter values).

Example (Node, Playwright installed at a known path):
```js
import pkg from 'playwright'; const { chromium } = pkg;
const b = await chromium.launch();
const p = await b.newPage();
await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
const ok = await p.evaluate(() => {
  const M = window.__magnet; M.startMatch(); const w = M.world;
  w.state='play'; w.stateT=1; for (let i=0;i<120;i++) M.step(w);
  return isFinite(w.ball.x);
});
console.log(ok); await b.close();
```
`tests/run.mjs` runs all 95 suites; `tests/README.md` lists what each covers and the measurement
traps that have produced false results here before — read it before writing a new one.

Always: (1) render every new flag/eye/text/ball-look once to catch throwing draw fns, (2) re-verify
ball containment on all fields after physics changes, (3) check the console for errors, (4) assert
the thing you mean — several suites here have passed for the wrong reason.

## Finding things in `index.html`
There is a **SECTION INDEX** at the top of the script (search `SECTION INDEX`). ⚠️ It lists
MARKER STRINGS, never line numbers — a line number is wrong the moment anybody edits above
it, and wrong *silently*. `tests/sectionindex.mjs` checks every marker still resolves to
exactly one place, and fails if the index ever starts quoting line numbers.

## Gotchas
- `step(w)` takes the world (fixed internal STEP), not a dt.
- Duplicate element IDs break `$()` (getElementById) — watch when copying UI blocks.
- Service worker is **network-first for HTML**, so deploys show up on reload when online; bump
  `CACHE` in `sw.js` only if you need to force-evict other cached assets.
- Don't put model identifiers or internal session URLs in committed files.
- `p.kickUsed` is only cleared on the **one-touch** (`trapOff`) path. Gating anything on it in
  casual mode silently stops firing after the first kick.
- Duplicated knowledge rots. The category→name chain lived in three places and broke a test when a
  category was added; the contrast maths and the ball painter are each in one place now. Keep it
  that way.

## Deploy
Static hosting. GitHub Pages: files at repo root → Settings → Pages → `main` / root.
Leaderboard write path needs the Apps Script deployed (see `LEADERBOARD_SETUP.md`).
