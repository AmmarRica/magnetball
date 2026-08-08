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
- **Goal box:** the net pocket mirrored onto the pitch in front of each goal line — same
  mouth width, same depth — drawn OPEN (three sides; the goal line closes it) at
  `GOAL_BOX_A` alpha so the goal line stays the loudest mark down there.
  `tests/goalbox.mjs` checks the mirror is exact on all 30 fields by pixel sampling.
- **Tilt parallax (`sel.tilt`, phones):** tilt the handset and the GROUND plane shifts one
  way while everything standing on it shifts the other — `tiltGround()` / `tiltLift()`, read
  by `render()`'s **two passes**. That difference is the whole effect; two layers moving by
  different amounts is what a parallax is, and it is the only depth cue a top-down pitch has
  short of redrawing the game in perspective. About 11px combined at full tilt.
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
  ⚠️ **Bots finish berry runs, they do not courier them.** `botAssignBerry` gives at most
  `BOT.berryRunners` (1) bot a side a berry, never the chaser or the goalie, never while
  defending, and only one already inside `BOT.berryLastLeg` of the hive. Ungated they drove
  berries the length of the pitch and **7 of 8 bot matches ended on a full hive inside 90
  seconds** with the ball barely involved; raising the cell count only made the same foregone
  race longer. A runner targets the far side of the berry once lined up — targeting the spot
  *behind* it makes `botArrive` decelerate and the bot stands there admiring it.
  `tests/kqberry.mjs`.
- **Goal box occupancy (`sel.boxRule`):** ⚠️ **during `play` only** — ungated it also fired in
  the warm-up lobby and after the full-time whistle. One defender and one attacker inside a goal box at a
  time, so nobody parks a wall in front of their keeper. The box is the region the pitch already
  draws — net pocket plus its mirror — read from `w.bounds`, never re-derived, so the line you
  are pushed off is the line on the grass. ⚠️ The slot is **sticky**: the holder keeps it until
  they leave. Recomputing "who is deepest" every step made two defenders trade it and shove each
  other out on alternate frames. Eased out like `applyKickoffLine`, with the same hard backstop.
  `tests/boxrule.mjs`.
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
- **Warm-up lobby Start is reachable by TOUCH** (`#lobbyStartBtn`, `onLobbyStartPress`).
  ⚠️ Start used to be bound to a gamepad button or the Enter key and nothing else, so in
  cocktail — which forces the lobby whatever is connected — a touch-only player could not
  leave it: the idle auto-start resets on movement, and an engaged player sat there for 90
  simulated seconds. The button is **opt-in** (`sel.lobby === 'touch'`); the default
  `'on'` is the old controllers-only behaviour exactly. It routes through `lobbyStart()`,
  the same path the pad and the auto-start use, and asks a cocktail seat to calibrate first.
  `tests/touchstart.mjs`.
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
- **Menu navigation:** two cards held 78% of all 376 controls (Your Player 7.5 screens, Match
  3.5), so each now shows **one `.subpane` at a time** behind a `.subtabs` chip row — `SUBTABS`
  declares the groups, `showSubTab(group, pane)` switches. Nav tiles are grouped Play / Progress
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
- **Service worker:** network-first for HTML, cache-first for everything else — and
  ⚠️ **HTML is decided by the URL, not just `request.mode`.** `/settings` pulls the real page
  in with `fetch('../index.html')`, which is not a navigation and sends `Accept: */*`; classified
  by mode/accept alone it took the cache-first branch and **pinned /settings to whatever
  `index.html` was precached, making every deploy invisible there**. `{cache:'no-cache'}` on that
  fetch is an HTTP directive and does not bypass a worker. `tests/swupdate.mjs` registers the real
  worker against a temp site, changes the file, and checks the settings route sees the new build.
- **Goal camera:** on a goal the view pushes in to `goalZoom()` (a player dial; `GOALCAM.zoom` is only the default) on whoever last touched
  the ball and eases back when the celebration ends. ⚠️ The default is a **5% push arriving in
  0.10s** — six frames, so it lands as the ball crosses. It was 5.0× over 1.15s, which is two
  mistakes at once: 5× is most of the pitch gone, and 1.15s of a 1.8s goal state is spent
  travelling, so what read was the MOVE rather than the moment. The slider still goes to 8× for
  anyone who wants the old behaviour, `goalZoomLabel()` says `+5%` below 1.5× (a "1.1×" label for
  a 5% push is a rounding error presented as a setting), and `normalizeGoalCam()` folds a save
  still holding exactly the old 500/115 to the new defaults. Render only — it moves `cam`, which no
  physics, hit test or bot reads, and `tests/goalcam.mjs` proves the world is bit-identical
  with it running. ⚠️ Advanced in `advanceGoalCam()` next to `decayJuice()`, **never in a
  draw** (the trails rule); being step-locked also means the goal slow-mo stretches it.
  The followed player is read through `ix`/`iy`, and the origin shift is rotated by `cam.rot`
  or deck view puts them off to one side. Stands down while a replay owns the framing, and
  rides the Screen shake & effects dial. Amount and speed are **sliders** —
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
`tests/run.mjs` runs all 75 suites; `tests/README.md` lists what each covers and the measurement
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
