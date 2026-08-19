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
- **Result screen:** the SCORELINE (`.ovscore`), then one panel per team
  (`renderMatchStats` → `.tpanel`), each reading name → players → that team's awards.
  `computeAwards` stays the one source of who won what; `awardRow` is the one place a
  ribbon is built. `renderAwards` now only holds the replay/clip footer.
  ⚠️ **THE SCORE IS ONE ROW AT THE TOP, not a big number inside each panel.** The panels
  **stack below 720px**, so on a phone the two halves of the scoreline ended up a whole
  panel apart — HOME's number above a table and a stack of ribbons, AWAY's below the
  fold. A score is a **comparison**, and a comparison you have to scroll between is not
  one. `.ovscore` is therefore `flex-wrap: nowrap` at every width, and the winner's box
  carries `.win`. ⚠️ Still in **TEAM order**, red then blue, exactly as the scorebug has
  read all match — the title carries whether that is a win for *you*.
  ⚠️ **And it is not in the subtitle any more.** `finishMatch` used to put `3 – 1` in
  `#ovSub` as well, which is the same two numbers said twice within an inch of each
  other — and the small grey copy was the one that got read, because it came first. What
  is left up there is what the scoreline cannot say: RP, and which mechanism decided a
  Killer Lobsters match. `showOverlay` **hides an empty `#ovSub`**, or the `<p>` still
  costs `#overlay`'s flex gap above the score. `tests/resultfit.mjs` measures "side by
  side" against **the panels being stacked in the same render** — without that the check
  passes on a desktop-shaped page, which is the layout that never had the problem.
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
  **ball** but not players — that's every boundary INCLUDING the net, so the classic
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
- **THE KEYBOARD AND THE FIRST CONTROLLER DRIVE ONE PLAYER** (`firstHumanSeat`,
  `mergePads`). ⚠️ A pad taking seat one sets `ctrl = 'gamepad'`, which silently took the
  keyboard away — and it was worse than that: `pollKeys()` was called from inside
  `drawControls` behind `players.some(p => p.ctrl === 'human1')`, so with a pad in seat one
  there was no `human1` on the pitch and **the keyboard was not read at all**. It is polled
  once per frame in `loop()` now, which is where per-frame work belongs (reading input in a
  draw is the trails smell).
  ⚠️ **MERGED, not one-or-the-other**: the louder wins each axis and KICK is an OR, the same
  idiom `padStick` uses for a stick and its D-pad. Adding them would make holding both
  travel at double speed; preferring one makes the other feel broken.
  ⚠️ **The FIRST human seat only.** The keyboard joining every pad seat would drive four
  players with one keypress. And it is `firstHumanSeat(w)`, not `w.players[0]` — the lobby
  can put you on either half.
  ⚠️ This is why **the keyboard no longer stands down on a Steam Deck**: the old hazard was
  Steam Input's arrow keys driving a DIFFERENT body from the stick, and there is only one
  body now. Cocktail still stands it down — a table people sit around has no
  in-front-of-the-keyboard seat.
- **SELECT TURNS YOUR CONTROLS A QUARTER TURN** (`seatRotOf`, `bumpSeatRot`,
  `pollSeatRotate`, `sel.seatRot`). Four people round one screen do not face the same way,
  and the only previous answer was cocktail's calibration wizard — a mode you had to be in,
  set once. ⚠️ **Per PAD, not per seat**: a pad is a person standing somewhere, and seats
  are handed out in an order that changes with the mode and with who joined when.
  ⚠️ **ADDED to the layout's own quarter-turn**, never replacing it — a deck in landscape
  has already turned the pitch, and somebody at the side of it wants a turn on top of that.
  ⚠️ **Kept in `sel`, so it survives the match**: standing yourself the right way round is
  something you told the game about the ROOM.
  ⚠️ **The bottom-right controller icon turns with it** (`drawPadFlairs`) — that row is the
  only readout the feature has, so without it you press SELECT and have to walk to the
  pitch to find out what it did.
  ⚠️ Select is therefore **no longer an alternative START**. Start (9) still starts, and
  `#lobbyStartBtn` is on screen throughout warm-up.
- **EVERY BUTTON KICKS** (`padKickHeld`, `KICK_NEVER`) — nothing to learn, nothing to bind,
  and it cannot be wrong on a pad that numbers its buttons oddly, which is what the old
  fixed list (`KICK_FALLBACK`) risked. ⚠️ **Three exclusions, and the D-PAD is the one that
  is easy to miss**: it is a button as far as the Gamepad API is concerned, so an
  unqualified "any button kicks" fires a shot on every step you take. Start begins the
  match and Select turns your controls. A hand binding still wins outright.
- **The warm-up prompts are OFF THE PITCH**, in one row under the touchline (`drawLobby`,
  `L._promptY`). They floated over each player's head, which in deck/side view meant a line
  of text running down the middle of the field — `uprightAt` keeps words upright while the
  pitch is turned. ⚠️ Measured to the back of the NET, not the goal line, or the row sits on
  the pocket; and **clamped downward, never flipped to the top**, because the top is where
  the "PRESS START" headline lives. ⚠️ `beginPath()` before each plate: `roundRectPath` only
  appends, so without it every `fill()` repaints the earlier plates over their own text —
  four boxes came out with only the last one's words in them.
- **The default is a GREEN PITCH AND NUMBERED PLAYERS** (`defaultSel().look.palette` =
  `grass`, `defaultProfile().flag` = `num1`). ⚠️ The first-run continent lineup is **not
  applied any more** — it dressed a brand-new install in country flags, which is the
  opposite of "players are numbered". `CONTINENTS` and `placedFlags` stay, because they are
  what prove every `FLAGS` entry is reachable from the pickers.
  ⚠️ **THREE suites were inheriting the old `neon` default rather than pinning a palette**,
  and all three sample PIXELS: `goalbox` and `tells` (grass's mown stripes put ink where
  they were looking) and `replayfile`, whose caption probe counts anything brighter than
  150 summed across RGB — which a light green pitch satisfies on its own, so both readings
  saturated at exactly **49,341** and the caption vanished into them. That one was caught
  by the suite's OWN guard ("if the caption is off in both, the check below passes for the
  wrong reason"), which is the argument for writing guards like it. **A suite that samples
  pixels has to say which palette it is sampling.**
- **A CONNECTED CONTROLLER TAKES A SEAT, out of the box** (`sel.controllers`, default
  **`on`**). ⚠️ It shipped as `off`, and the failure was reported as *"4 controllers are not
  showing and can't join"*: four pads connected drew four controller icons, listed
  themselves in the Input hint as "4 controllers detected", brought up the warm-up lobby —
  and handed out **zero seats**, because `padsTakeSeats()` is the only thing that reads this
  and every other surface reads something else. The player is then hunting for a setting
  whose existence nothing on screen implies. **Same shape as the Steam Deck bug one layer
  up: the game could SEE the controller and still gave it nothing to drive.**
  ⚠️ There is deliberately **no third "auto" state**, even though `on` now means exactly
  that: a seat is only ever handed out when a pad actually exists (`startMatch` breaks out
  of the seat loop the moment it runs out of pads), so `on` and an `auto` would behave
  identically and the extra tile would be a distinction without a difference. `off`
  ("Touch") stays a real answer — a phone player with a stray Bluetooth pad, or somebody who
  prefers the keyboard with a controller plugged in.
  ⚠️ `tests/fourpads.mjs` asserts what "it works" actually means: not that a seat exists,
  but that **each pad moves its own body and nobody else's** — a seat driven by the wrong
  pad, or four pads sharing one, looks identical from `w.players`. Two measurement traps
  are recorded there: bots parked at 9e4 are dragged back onto the touchline by
  `integrate`'s clamp and can land on a seat, and seats spaced 100 units apart simply
  COLLIDE (a tidy 65.1/14.7 on all four pads looks like consistent cross-talk and is
  physics).
- **A STEAM DECK IS A CONTROLLER, so it takes a pad seat untold** (`padsTakeSeats`,
  `keyboardDrivesGame`). ⚠️ This is what was actually wrong when "the joystick does nothing on
  Steam Deck" was reported — not the axis numbering below it. `padsTakeSeats()` listed
  cocktail and arcade but not deck, and `sel.controllers` defaults to `'off'`, so **no pad
  seat was ever handed out**: `gamepadPad` was never consulted for the player and none of the
  stick-finding was even reached. The D-pad only *looked* like it worked because Steam Input
  commonly sends it as **ARROW KEYS** to the keyboard seat.
  ⚠️ The keyboard therefore **stands down on a deck**, exactly as it does for cocktail, and
  for the same two-part reason: only once a pad is actually connected (or a deck-layout
  window on a desktop has nothing driving the player), and because leaving it live alongside
  the pad seat drives one player from the stick and another from the D-pad-as-arrows.
  `tests/padstick.mjs` leaves `sel.controllers` at its default on purpose — the whole point
  is that a Deck needs no toggle.
- **A pad's direction is read from BOTH the stick and the buttons, every frame** — never
  one behind the other. ⚠️ The D-pad used to be a fallback behind `hypot(stick) < 0.18`, and
  that is how the D-pad lost its DIAGONALS on a Steam Deck: if the axis pair being read as
  "the stick" is really the D-pad reported as a **HAT** — which is a thing a non-standard pad
  does — then pressing a direction makes the stick look live, the button branch never runs,
  and a hat gives ONE direction at a time. Combined per axis (the louder of the two wins that
  axis), whichever source is actually saying something is heard, so up-and-right on the
  buttons is up AND right however the pad reports the rest. `tests/padstick.mjs` presses the
  two buttons **with an axis deflected at the same time** — without that the check passes on
  the broken build too, because the stick reads idle in an ordinary probe.
- **AXIS PAIRS ARE READ IN TWOS, never overlapping** (`padStickAxes`, `padStick`). ⚠️ Both
  loops used to walk `i++`, which makes every axis the X of one pair and the Y of the next.
  On a pad laid out `[trigL, trigR, hatX, hatY, stickX, stickY]` — a plausible Steam Deck
  layout — a push on the stick made pair **(3,4)**, hatY as X and stickX as Y, the loudest
  thing on the pad; it was chosen as "the stick", and **right and down then produced the
  same heading**. The eight directions measured as SIX. This is the concrete, reproducible
  form of "the thumbstick does nothing / has no diagonals on Steam Deck" that three earlier
  diagnoses missed. Sticks and hats are reported as consecutive pairs on even indices, so
  stepping in twos is also what the hardware does; and the combine additionally skips any
  pair sharing an axis with the chosen stick, which is the same guarantee stated twice.
  `tests/deckstick.mjs` runs the four shapes a Deck actually reports itself as.
- **The MOVE STICK is found, not assumed** (`padStick`, `padStickAxes`, `padRest`, `PADAX`).
  ⚠️ `axes[0]`/`axes[1]` is the left stick **only under the STANDARD mapping** — a pad
  reporting a non-standard one numbers its axes however it likes. That is the same trap
  `padKickHeld` documents for BUTTONS, one layer down, and it was reported from a Steam Deck
  in a browser: the D-pad worked (12-15 happened to line up) and the stick did nothing at all.
  Standard pads take the fast path and are untouched.
  ⚠️ **A TRIGGER RESTS AT -1** and never centres, so an untouched one reads as a stick held
  hard over — auto-detect that naively and the player drives into a wall for ever. Sticks
  centre, triggers do not, so `padRest` keeps the smallest magnitude each axis has ever shown
  and only a pair that both centre can be the stick. It settles within a frame of the pad
  sitting still, which is what a pad does at boot.
  ⚠️ The pair is taken **together** (i, i+1), never one axis from each stick.
  ⚠️ The deck MENU reads it through the same helper — otherwise the menu is D-pad only on
  exactly the pads the player is D-pad only on.
  A hand binding (`sel.pad.axX/axY`, Controls → Move stick, push right then down) wins
  outright, and the Controls screen shows the pad's **live axis values** because "the stick
  does nothing" and "the stick is on axes 2 and 3" look identical from outside.
  `tests/padstick.mjs`, whose fake pad puts two resting triggers *before* the real stick —
  the layout that makes a wrong answer easy — and measures all eight directions as eight
  DISTINCT headings, because "they all move" is true of a build that reports one direction
  for everything.
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
  at its own rate, not the sim's. ⚠️ **That was a claim the code did not honour**: the
  neutral's drift is a decay and it was being applied once per SENSOR EVENT, so a
  handset reporting at 100Hz pulled its neutral back nearly twice as hard as one at
  60Hz — reported as the picture *swimming* under your hands. The recentre and the
  clamp both live in `advanceTilt` now, once per fixed step. `tests/tilt.mjs` feeds one
  reading a step against five and requires the same neutral; nothing else in that file
  could see it. ⚠️ **`span` is 34°, not 20** — twenty is roughly how much a handset moves
  while you are merely playing, so the effect sat near full deflection permanently — and
  there is a **`dead` zone** of 2.5° with the range above it re-normalised, because a
  degree of hand tremor was a permanent sub-pixel wobble under the HUD text. ⚠️ **The neutral position DRIFTS** toward however you are
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
- **The screen shake's OFFSET is rolled in `decayJuice()`, never in `render()`**
  (`shakeX`/`shakeY`). ⚠️ Reported as *"when hitting kick, it looks like it blinks"*, and
  it is the trails rule wearing its loudest hat: the AMPLITUDE decayed once per step —
  which `tests/smooth.mjs` already checked — while the OFFSET was re-rolled once per
  DRAW. So on a 144Hz screen the whole pitch was thrown to a new random place 2.4× more
  often than the shake was tuned for, which is a strobe rather than a shake, and two
  draws of one frame produced two different pictures.
  ⚠️ **The amplitude check could not see this**: `shake` decays identically either way.
  What has to be measured is the offset — that it holds still across two draws and moves
  once per step. `tests/smooth.mjs` does both, plus that a new offset really does change
  the picture (or the two-draw check is vacuous) and that it settles at exactly zero
  rather than leaving the pitch parked off-centre.
  ⚠️ `Math.random` is safe here and only here: `decayJuice` is called from `loop()`
  beside `step(world)`, never from inside it, so the determinism rule is untouched — and
  drawing from `fxRnd` would shift the particle stream for nothing.
  ⚠️ During hit stop `loop()` returns before `decayJuice()`, so the offset holds still
  through the freeze, which is what a freeze frame should do.
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
  ⚠️ **ONE OF EACH LABEL PER PLAYER PER `FLOAT.cool` (2s)**, and it was reported as
  the same word printed over somebody two and three times. Every label hangs off the
  line that counts the stat, and those lines fire as often as the game really happens:
  a ball rebounding straight back off a wall or a body is a second legitimate strike a
  few frames later, so a bot pinned against the boards genuinely takes four shots in
  under a second. The play was right and the caption was noise.
  ⚠️ Per **(player, label)**, never per player — a blanket cooldown would swallow the
  GOAL! half a second after the SHOT that scored it, and SHOT plus CLEARANCE on one
  strike is two different things being said rather than a repeat.
  ⚠️ **The STAT is untouched**: only the caption is held back, so the result screen
  still counts every shot. That keeps this system's invariant pointing the way it
  always did — a label can never claim something the result screen will not also show;
  it may now stay quiet about something the result screen does show.
  ⚠️ Counted on `advanceFloaters`' own clock, incremented **before** its early return
  (through the quiet stretch a label shown once would otherwise hold its cooldown for
  ever), and reset in `clearFloaters` **together with the map** — a clock rewound to
  zero under timestamps from the last match reads as cooling down permanently.
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
- **A STREAK MAY NEVER BE WIDER THAN IT IS LONG** (`drawBallTrail`). The width was a flat
  1.7 ball radii while the LENGTH is `BALL_LEN_MAX * drive` — so at a gentle pace `drive`
  is near zero, the path is a couple of pixels long, and a 12px round-capped stroke over it
  renders as a **BLOB the size of the ball stuck to the back of it**. Reported as *"ball
  shape is odd in drills after kicked"*, and it shows up in a drill first because a drill
  is nudge-and-follow on an empty pitch: the streak is a tell about where the ball just
  came from, and a lump attached to the ball tells you nothing.
  ⚠️ **Two parts, and both are needed.** The width RISES WITH SPEED the way the length
  already does, so a slow ball gets a thin tell rather than a fat stub; and it is then
  **clamped to the length actually drawn**, which is what makes "wider than it is long"
  impossible at any speed, on any court and at any zoom.
  ⚠️ **The check's threshold is DERIVED, and the obvious one is VACUOUS.** A round-capped
  stroke covers `pathLength + width` along travel and `width` across, so `along >= across`
  is true of ANY build that draws anything — the first version asserted exactly that and
  **passed on the flat-width build it exists to catch**. Substituting, `width <= pathLength`
  is `along >= 2·across`, which is the rule written in what the pixels can be measured as,
  with no constant tuned to a speed or a zoom. Measured as a DIFFERENCE against the same
  frame with no trail, or the ball's own round body reports a 1:1 box on every build.
  ⚠️ Paired with "at full pelt there is still a REAL streak", because *never wider than
  long* is also satisfied by drawing nothing.
  ⚠️ **The RANGE is a taste dial and it was set too low first time** (0.55..1.70 ball
  radii). Measured against a 17px ball at three speeds, that drew **6 / 8 / 12** against
  the old flat width's 16 / 16 / 16 — thinner everywhere, *including at full pelt*, where
  the clamp to path length was biting as well. Reported as "did you make the trail
  thinner". At 0.85..1.45 it reads **8 / 10 / 16**: full speed back where it was, the slow
  end lifted, and no blob. The clamp is what holds the invariant, so this number is free.
  ⚠️ **AND THE BALL GOES BACK TO BEING A BALL** — asked for in those words. Belt it and
  the silhouette is a long streak; let it stop and what is left is the round shape it
  started as, measured against the same never-kicked frame. **TWO independent guards hold
  that**, so a sabotage of either alone proves nothing: `drawBallTrail` returns below
  `BALL_MIN_SPD`, and `advanceTrails` keeps pushing the parked ball's own position, so
  the ring fills with duplicates and the old distant points shift out. With both removed
  a settled ball measures **17×147** instead of 17×17.
  ⚠️ **"No wider than the ball" is NOT the way to check the width rule, and it was tried.**
  A box round the ball AND its streak cannot separate the two, and the stub the flat-width
  build drew is *narrower* than the ball it was stuck to — so the check passed on exactly
  the build it existed to catch. The width rule stays in the `crawlBox`/`beltBox` pair,
  which measures the streak alone as a difference. `tests/tells.mjs`.
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
- **Sound sets (`SFX_SETS`):** ⚠️ a set is a whole ROOM picked at once, which is why it
  exists rather than six separate dials — a solenoid flipper thunk under a referee's pea
  whistle is two places at the same time. **Pinball** is the fourth: plunger, flipper, pop
  bumper, saucer, jackpot, and the knocker plus the score reels at full time. ⚠️ A new
  variant inserted in the MIDDLE of an `SFX` array shifts every index above it, so the
  other sets' `pick` values move with it — the pinball whistle went in before Chirp and
  Space's `whistle` had to go 4 → 5. `SFX_LABELS` must stay the same length as its array.
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
  puts its corners at 1.41`r`, which is the VideoSoccer arrowhead mistake with a different shape.
  ⚠️ The court dots are a **muted maroon** and twice a body across: a field of bright red
  circles under a team drawn as a bright red circle is a field of decoys. `tests/dyntheme.mjs`
  measures both — coverage at 0.9`r` all the way round for the dot, only on the diagonals for
  the bar, and the print's luminance against the team's.
  `board` (shown as **Apologies!**) = a butter-yellow board, a white track of rounded squares
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
  `pnp` (shown as **Pontions and Prixels**) = the wordmark's black, GOLD and GREY over the
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
  `bambam` (shown as **Bambamzone**) = a platform fighter's stage: a bright cream slab
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
  `ammari` = a game bar: charcoal walls, hot pink neon, and the three marks the sign is
  built from — triangle, square, circle — drifting in the room BEYOND the pitch.
  ⚠️ The sides are the house mark and its mirror — a white triangle UP against a pink
  triangle DOWN — and that skin deliberately does **not** go through `discFace`:
  up-against-down IS the difference, so a mark that turns destroys it the moment anybody
  moves (same argument as Spaceships' level-flying saucer). The silhouette check measures
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
  `vector` (shown as **Spaceships**) = a vector monitor: a nebula wash, a faint grid, a star
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
  `tactics` (shown as **Tactics Board**) = the diagram a coach draws on: flat green, white
  markings at full strength, and bodies that are magnet COUNTERS sitting on the board
  rather than circles painted into it — a cast shadow, the base disc, a spherical shade
  lit at the top left, a dark rim and a specular highlight, every layer a fraction of `r`
  so it is the same object at 9px on a phone and 40px on a desktop.
  ⚠️ **THE SIDES ARE A RED COUNTER AGAINST A STRIPED ONE, AND THE STRIPES ARE THE
  SILHOUETTE.** Both are discs, so hue alone is exactly what this file refuses: three navy
  bars clipped inside the pale counter make a scan across it alternate, which the plain red
  one cannot do at all. `tests/dyntheme.mjs` counts light/dark **STEPS** between adjacent
  samples rather than crossings of an absolute threshold — the first version used a fixed
  cut at luminance 110 and the RED counter reported three edges, because its base sits at
  107 and the shading wanders across the line. A stripe boundary is a step and shading is a
  ramp; that is the difference, and it needs no constant tuned to a particular red.
  ⚠️ ...and the shading is checked as the CONTROL: a lit counter has a real light-to-dark
  spread, so "one side is darker" is true of both and the alternation is the claim.
  ⚠️ `DYN_FIELDS.tacticsboard` adds only what the game's pitch is MISSING — penalty areas,
  six-yard boxes, penalty spots and the D. It does **not** fill: `drawPitch` owns the
  surface, and a fill here would cover the goal boxes already drawn under it.
  ⚠️ **Every number is a fraction of the field**, never a pixel from the reference drawing:
  the courts run from Futsal to Leviathan and differ threefold in width. The proportions
  are a real pitch's (penalty area 40% of the width by 16.5/105 of the length).
  ⚠️ The **D is computed, not eyeballed** — the arc between the two angles where a circle
  of the penalty radius crosses the box edge, so it stays a D on a court of any size, and
  is skipped entirely when the radius cannot reach the edge.
  ⚠️ **The ball is `BALL_LOOKS.classic`, which already IS the panelled football** the board
  wants — one black pentagon in the middle and five round the rim. Adding a second copy is
  the mistake the withdrawn `seam` look made against `BALL_LOOKS.tennis`: check the
  registry before adding to it.
  ⚠️ **A PRINTED COUNTER, NOT A BILLIARD BALL.** The first build ran the shade at white
  0.35 / black 0.28 through a tight radial with a 0.30 specular ellipse in the middle, and
  it came out as wet plastic — a bright glossy sphere reads as something LIT, and the
  board is a thing lying flat. The light stop is a third of what it was, the sheen is 0.11
  and pushed nearly to the top edge, and the rim is thicker and nearly black: a counter is
  a printed disc with a hard edge, and that edge is what carries the look.
  ⚠️ The skin's cast shadow is held to 0.26 because `drawOneDisc` has **already** laid a
  soft one straight down in `TH.shadow` before any skin paints — this is the directional
  one on top of it, and two at full strength is a body sitting in a hole.
  ⚠️ **The spec this was drawn from labelled its counters with a real club's current
  squad.** Those are real people's names and are not shipped: the look is generic, the
  names are not ours to use. Same standing rule as the trademark one below.
  `tennis` = the five supplied colours on an ORDINARY football pitch — a blue court, a
  green surround, white markings, a clay team against a white one and an acid-yellow
  ball. ⚠️ **A palette and nothing else, and that is the whole point of the entry.** It
  shipped for one build as a tennis SET — `DYN_FIELDS.tenniscourt` painting tram lines
  and service boxes over the pitch, racquets against nets for players, a seamed ball —
  and what was asked for was the colours and the name. A theme that redraws the pitch as
  another sport's court is a different game to *read*, and the markings everybody already
  knows are worth more than the reference. So there is deliberately **no `THEME_BUNDLES`
  row**: field, discs and ball fall to the defaults, which is what `bundleSlots` exists
  for. The withdrawn pieces were deleted rather than left unlisted — a stray registry
  entry is a tile in the pickers offering exactly the thing that was rejected.
  ⚠️ **One job each is what decides the TEAM inks.** The court, the surround and the ball
  are already spoken for, so a team drawn in any of the three is a body the same colour as
  something you are already tracking (the Bootleg dots and the Apologies! lane squares are
  both written up for this). That leaves **clay against white**, a lightness pair rather
  than a hue one.
  ⚠️ The court is **FLAT** (`stripeA === stripeB`) — mown stripes are a grass thing.
  ⚠️ `dynMark`/`dynAlt` are kept even with no field of its own, because **slots mix**: any
  `DYN_FIELDS` painter can be asked for over this palette and they all fall back through
  `TH.dynMark || TH.line`.
  ⚠️ **`BALL_LOOKS.tennis` already existed**, and the withdrawn `seam` look was a
  duplicate of it that nobody noticed for a build. Check the registry before adding to it.
  `tests/tennis.mjs` measures the court is one solid colour with the bodies taken off the
  list first — a player standing on a sample point reads as a stripe.
  `vsoccer` (shown as **VideoSoccer**) = a cream-banded court with arrowhead players that point where they FACE, so a
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
  can draw the two sides differently — Pontions and Prixels pours one and pixelates the other —
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
- **DRILL GHOSTS — your three best runs, on the pitch at once** (`GHOST`, `drillRuns`,
  `drillTop`, `drillBetter`, `ghostRecord`, `ghostSpline`, `ghostAt`, `drillAddRun`,
  `drawGhosts`). Gold, silver and bronze, coloured by rank.
  ⚠️ **THREE, not one.** One ghost says whether you are ahead of your best; three say what
  the SHAPE of your improvement was — where the gold run took a line the bronze one did
  not. The colour is the only label they need.
  ⚠️ **SAMPLED AT 10Hz AND INTERPOLATED THROUGH A CURVE, and that is the whole of why
  they look right.** Stepping a recording frame by frame is what a REPLAY does, and at any
  rate you can afford to store three runs of 25 drills it reads as a stutter — which is
  why a ghost recorded that way never looks like the ones in Braid or a kart game. Those
  interpolate between sparse keyframes. **Catmull-Rom, never a straight line**: at 10Hz a
  linear blend puts a visible corner at every sample, which is the stutter back again
  wearing a different hat. ⚠️ The suite measures it as a **comparison against a linear
  baseline computed from the same recording**, never an absolute — how jerky a polyline
  looks depends entirely on how fast the run was and how hard it turned.
  ⚠️ **10Hz IS WHAT LETS A GHOST TRAVEL.** Three runs of every drill at 60Hz is ~3MB,
  more than the whole `localStorage` budget and far more than a game save anybody could
  send. The top three ride in `SAVEFILE`, paths included.
  ⚠️ **`drillBetter` points BOTH ways.** Every drill is lower-is-better except Break the
  Targets (`def.high`), so one comparator is what stops somebody's worst run becoming
  their record on exactly that one — the same trap `targetSpot` records one entry up.
  ⚠️ `drillRuns` folds the legacy `magnetball.drills` shape (a bare number per drill) on
  read, so an older save keeps its times.
  ⚠️ Drawn back to front, bronze first, and read through `d.elapsed + renderAlpha*STEP` —
  a ghost anchored to a moving clock must interpolate like anything else on the pitch.
  A ghost that finished ahead of you STOPS being drawn rather than standing at the line.
  ⚠️ **A GHOST'S BALL IS A RING, AND SMALLER THAN THE REAL ONE** (`GHOST.ballR`,
  `GHOST.ballA`). It shipped as a FILLED disc at exactly `w.ball.r` in the medal colour,
  which put **four** round objects the size of the ball on a drill pitch — the real one and
  three ghosts' — with the gold one a body's length from yours at a similar lightness.
  Reported as the ball being wrong in drills, and it was: the ball is the one thing you are
  tracking, so nothing else may be a filled circle of that size. The ring keeps what a
  ghost ball is FOR — in a shot drill the ball leaves the body and where it went is the line
  you are beating — and gives up only the part that made it a decoy. Same argument
  Spaceships makes about nothing being filled. ⚠️ `tests/drillghost.mjs` measures it as a
  **PAIR** on rendered pixels: the centre is untouched court AND the rim is inked. Either
  alone passes on a build with no ghost ball at all, which is a different design.
  ⚠️ `GHOST.alpha` was raised to 0.82/0.66/0.54. The **ORDER** is the thing — the better the
  run, the more it asserts itself, and that is what the suite pins rather than three magic
  numbers — but bronze at 0.34, filled at a third of that again, was a slightly-darker
  patch of grass.
- **THE DRILL BOARD — all three of your best times on the screen that just set one**
  (`buildDrillBoard`, `drillScoreText`, `DRILL_MEDALS`/`DRILL_PLACES`, `#drillBoard`).
  Gold, silver, bronze, the record marked, and the slot this run took highlighted with
  **your** time on it.
  ⚠️ **THE MEDAL COLOURS ARE `GHOST.cols`**, handed to the CSS as a `--m` custom property
  and never written in the stylesheet — so the row that lights up and the ghost it stands
  for are the same colour by construction rather than by two lists agreeing.
  ⚠️ **AN EMPTY SLOT IS STATED, not omitted**: three rows is the shape of the thing you are
  filling in, and two rows plus a gap reads as a bug — which is exactly the first-ever-run
  case, where all three are empty but the one you just set.
  ⚠️ **A RUN THAT DID NOT PLACE IS STILL SHOWN**, as a fourth dashed row. How far off the
  board you were is the information, and a board that only appears when you beat something
  is missing on the run you most want it on. Same reason it is on the **failure** screen.
  ⚠️ **The value comes from the TABLE, not from the run that was just played** — the row at
  `rank` is where `drillAddRun` put it, so the board cannot show a time the record does
  not. `tests/drillghost.mjs` therefore plays a real drill **twice** for that claim: every
  check that hands `showDrillResult` a rank and a matching table proves only that they were
  handed in agreeing.
  ⚠️ **The subtitle stopped repeating it.** `#ovSub` carried the medal and "best <time>" as
  words, which is the same numbers said twice within an inch of each other — the call the
  result screen already made about its own scoreline. What is left up there is what the
  board cannot say: what you just did, and whether it was a best.
  ⚠️ **`showDrillResult` CLEARS `#ovStats`/`#ovAwards`/`#ovVote`**, and its not doing so was
  a real leak: this screen does not go through `showOverlay`, the one place that empties
  them, so a drill played straight after a match came up with that match's team panels,
  ribbons and map vote sitting under the drill's own title.
  ⚠️ Break the Targets counts **goals**, so `drillScoreText` is the one place that knows
  which units a drill scores in — the same reason `drillBetter` exists one entry up.
- **ONE TWO-MINUTE BACKSTOP, NOT ELEVEN CLOCKS** (`DRILLTIME`, `drillLimit`,
  `drillReadout`). Every timed drill carried its own fail limit — 22s here, 45s there —
  and they were guesswork twice over: set by eye, then loosened by eye when they turned
  out tighter than the route could be played. A limit that is a guess fails a good attempt
  on the whistle, and what a time drill is actually scored on is **your own time against
  your own three best runs**. So there is one generous cap and nothing else.
  ⚠️ **120 is the same number as `GHOST.maxSecs`** — a recording stops at that mark, so a
  shorter cap leaves headroom nobody can use and a longer one lets a run outlive the ghost
  of it. One number, asserted as one.
  ⚠️ **Break the Targets keeps its own 60**, and that is not an exception being carved out:
  there the clock is the **scoring rule** (how many in a minute) rather than a limit on how
  long you may take, which is why running out completes that drill instead of failing it.
  `drillLimit` is the one place that knows the difference.
  ⚠️ **The readout is YOUR TIME, not a countdown** (`drillReadout`). A clock ticking to zero
  says the drill is a test you can fail, which with a two-minute backstop it essentially is
  not. The countdown returns in the last `DRILLTIME.warn` seconds — the one moment the cap
  means anything — and on Break the Targets throughout. ⚠️ It is a **function** rather than
  three lines inside `renderDrill`, so a check on it is a check on the real rule: the first
  version of that check re-derived "elapsed or countdown?" in the suite and a sabotage that
  made the HUD count down on every drill sailed straight past it.
- **THE COACHING DEMONSTRATION MOVES LIKE SOMEBODY PLAYING** (`COACH`, `buildCoach`,
  `coachTop`, `coachRamp`, `coachAtDist`, `coachDistAt`, `coachPose`, `coachPhase`,
  `drawCoach`).
  ⚠️ **The old one traced the line, it did not play the drill.** `pathAt` walked the
  authored polyline at CONSTANT speed on a fixed 6.5-second loop, wrapped instantly from
  the end back to the start, and pinned the body a fixed offset behind the ball along the
  current segment. Four things wrong, all visible: a 545-unit route and a 1,255-unit one
  were both demonstrated in 6.5s, so one was a sprint and the other a crawl; it took
  hairpins flat out; the body **slid sideways** across a corner instead of coming round the
  ball; and at the end it teleported mid-stride. Nobody moves like that, so it demonstrated
  nothing anybody could copy.
  ⚠️ **THE SPEED IS THE PLAYER'S OWN**, derived from the two Game Feel numbers the physics
  uses — `v = a·d/(1−d)` per step is where `integrate` settles a body at full stick — so the
  demonstration gets faster when you turn the Speed slider up, and route LENGTH means
  something again. `COACH.pace` (0.9) is **measured**: at 1.0 the model does Straight Line
  in 2.38s and a real run takes 2.6s, because pushing a ball is not free.
  ⚠️ **It brakes into corners and accelerates out** — a speed cap per sample from how sharp
  the turn is, then a forward pass for how fast it can have got going and a backward pass
  for braking in time. The backward pass is the half that reads as somebody who can *see*
  the corner. The ramp rate comes off the same damping (`coachRamp`), so it is one body.
  ⚠️ **The body runs the same ROUTE, a fixed distance behind** — never a fixed offset from
  the ball. That is what a dribbler does, and it is what makes the body swing round the
  outside of a turn on its own: the ball has taken the corner while the body is still on
  the leg before. Measured as the body's distance from the polyline (the old build was 29
  units off at a corner) **and** as the body-to-ball gap closing toward 1/√2 through a
  right angle, since a rigid offset holds that gap at exactly 1.00 all the way round.
  ⚠️ **It parks at both ends** for `COACH.hold` rather than wrapping. The jump back still
  happens, at a moment when nothing is moving.
  ⚠️ **`coachPose` is the ONE place that answers where it is**, and the draw asks it. The
  suite drives the same function and then ties it to the picture with a single ink probe at
  the point the pose names — without that, `drawCoach` could work the body out its own way
  for ever while every other check passed.
  ⚠️ **Built once, in `startDrill`**: a precompute, not a per-frame advance, so it is not
  the trails rule — but a few hundred square roots a frame for a table that cannot change
  is still waste. `d.coachT` is advanced in `stepDrill`. No randomness at all.
  ⚠️ Its ball is a **ring**, for the reason a ghost's is: on a drill pitch the real ball is
  the only thing that may be a filled circle of that size. And the body has an **outline as
  well as a fill** — at a bare 0.32 under a 0.5 global alpha it was a lighter patch of grass.
  ⚠️ **Fifteen of the 25 drills have no `path` and so get no demonstration**, which is unchanged and
  deliberate: a route derived from the objectives would cut straight through the wall the
  course is built around, and a demonstration that walks through a wall is worse than none.
- **THE DRILL CLOCKS ARE DESIGN JUDGEMENT, AND THE MACHINE IS A FLOOR** (`drillAutoPad`,
  `drillObjective`, `drillRoute`). ⚠️ **A withdrawn claim.** The machine shipped described
  as "the instrument the drill timings are tuned against" — a controller that could play
  every drill would answer "is this completable, and in how long?" across two dozen
  layouts, which is not a question anybody settles by eye. It cannot: it finishes the open
  courses and cannot do the ones built round a wall or needing a threaded shot, so it
  reaches **8 of 25**. A yardstick that measures a third of the range is not one, and
  quoting it as one would put a number on the other seventeen that nothing measured.
  ⚠️ **The GHOSTS are the measure instead** — three real runs per drill, kept and raced,
  by the people the clock is for. The per-drill limits were loosened once and then dropped
  entirely for a single backstop (see `DRILLTIME` above); a drill nobody can beat shows up
  as a drill with no ghosts on it.
  ⚠️ What the machine still buys, and why it ships rather than living in a test: on all 25
  it never THROWS and never leaves a drill in a broken state. That is a real guarantee
  about every layout. ⚠️ It writes a **PAD** through `applyHumanInput`, never the player,
  so it plays the drill the way a person does; and ⚠️ **a unit stick, not `botArrive`** —
  that helper writes in ACCELERATION space against `w.pAccel`, which is the player's own
  Game Feel setting, so on a low one it asks for almost no stick and the machine cannot
  finish a straight line. `tests/drillghost.mjs`.
- **Map maker (`MAPMAKER`, `maps`, `mapClean`, `loadMaps`/`saveMaps`/`applyMaps`,
  `openMapMaker`, `buildMapMaker`, `drawMapPreview`, `mapStore`; `#mapMaker`):** build a
  field — size, corners, goal mouth, net depth, post size, wall and net liveliness.
  ⚠️ **A CUSTOM FIELD IS JUST A `FIELDS` ENTRY**, folded into the same table at boot, and
  that one decision is what makes the whole feature small. Everything downstream already
  works from `FIELDS` and a field key — the picker, `buildGeometry`, `drawPitch`, all
  fourteen `DYN_FIELDS`, the goal boxes, drills, `mapVoteKey` and the self-contained
  replay files — so a separate "custom map" concept would have meant teaching every one
  of those about a second kind of field. **No code anywhere asks whether a field is
  user-made.**
  ⚠️ **The preview is drawn from `buildGeometry`**, the match's own function — never from
  the editor's own reading of the numbers. A hand-drawn preview is a second implementation
  of the pitch, and the first time the two disagreed the editor would be lying about the
  field it is making (same argument as Break the Targets calling `buildGeometry` for its
  goals). A player and a ball sit on it at **true scale**, because "goal: 150" is a
  shooting gallery on Futsal and a letterbox on Colossus and the picture is the only place
  that difference shows.
  ⚠️ **Wall/goal customisation reaches the physics through `buildGeometry` reading the
  values OFF THE FIELD** with the built-in as the fallback (`f.wallB`/`f.netB`/`f.postR`),
  so a custom court is the same numbers on the same code path as a shipped one; every
  `FIELDS` entry simply leaves them unset. `drawGoal` now takes the post radius from
  **`world.posts[0].r`**, not `POST.r` — a post drawn at a size the ball does not bounce
  off is the one thing on the pitch you aim at being in the wrong place.
  ⚠️ **Sanitised on the way IN** (`mapClean`), not on the way out: a saved file is read
  back every launch and handed straight to `buildGeometry`, so one bad number from an
  older build would be a broken pitch on every match from then on with nothing to point
  at. The clamps are the *editor's* rails, not the physics' — nothing here can build a
  field the engine cannot. `wallB` above 1.0 (a pinball table) is deliberately reachable;
  the ball is still contained, because `clampBallInside` is the backstop it always was.
  ⚠️ **A delete removes it from `FIELDS` too and drops `sel.field` to `classic`** —
  `startMatch` reads `FIELDS[sel.field]` and would hand `undefined` to `buildGeometry`,
  which is a blank screen rather than an error anybody can read. **Play saves first, and
  saves IN PLACE**: an existing map keeps its key, because `sel.field`, the map votes and
  every saved replay refer to a field *by key*, so re-keying an edit orphans every vote
  cast on it.
  ⚠️ **DESKTOP ONLY** (`mapsPossible` → `isDesktop`), asked for. The row is **hidden**,
  not disabled, and re-answered on `resize` as well as every rebuild — nine sliders beside
  a live plan view is a two-column layout, and on a phone it is nine full-width rows with
  the picture scrolled off the top, so you would be tuning a shape you cannot see.
  ⚠️ `loadMaps()` is called from the **bootstrap block**, under `loadArcade()`, not up
  with `loadSel()`: `applyMaps` reads `sel.field` (so the save must be in) and `mapClean`
  clamps against `POST`, declared below the map block. **Twelfth time this file's ordering
  has been the whole point.**
  ⚠️ A map name is typed by a person and lands in an option tile that `buildOpts` writes
  with `innerHTML`, so `mapClean` **strips** `<>&` rather than escaping, and `buildMapList`
  builds its rows as nodes.
- **Bot player types and team strategies (`BOT_TYPES`, `BOT_PLANS`, `botTypeM`,
  `botPlanOf`, `botDrawPlans`, `sel.botPlan`):** ⚠️ **A DIFFERENT AXIS FROM DIFFICULTY,
  and keeping them apart is the point.** `botSkill` is a **ladder** — one 0..1 scalar with
  every axis derived from it, so a tier can only ever be better than the one below. A type
  is a **shape**: a poacher is not a better anchor, it is a player who does something
  else. Feeding types into the same scalar would quietly make one difficulty stronger than
  the tier above it, which is the exact bug the ladder was rebuilt to make impossible.
  Nothing in `BOT_TYPES` reads or writes `skill`.
  ⚠️ **Every value is a MULTIPLIER on a `BOT` number**, never a replacement, so the tuning
  stays in one block. `botTypeM` is the one reader and returns 1 (or 0 for the additive aim
  biases) for anything missing — `allround` carries no numbers at all, and an `undefined`
  times a `BOT` value poisons a formation slot silently instead of failing where anyone
  would look.
  ⚠️ **Types bend BEHAVIOUR, never ABILITY.** There is deliberately no accuracy, reaction
  or speed multiplier in the table: that would be a second difficulty dial hidden inside a
  personality, and a "Poacher" that is simply a worse player is a bug wearing a name.
  ⚠️ **The aim lean is ADDED to a candidate's score, never used to remove one** — a
  playmaker that cannot shoot into an open goal is broken, not characterful — and it is
  small (±0.16) because it competes with lane, progress and openness. A big one makes a
  bot shoot from its own half because it is "a poacher".
  ⚠️ **A plan is keyed by ROLE, not by seat index**: roles are re-matched every
  `roleTicks` by who is nearest what, so a plan written against seat 2 describes a
  different player every few seconds. The type is therefore **re-read at the end of
  `botAssignRoles`** — a body dropping from support into defence has to start defending
  like one.
  ⚠️ `plan.line` and the type's own `depth` **multiply**, so "park the bus with a poacher
  up top" stays expressible, which is most of what a plan is for. `plan.press` applies
  **only while defending**, which is what makes it a press rather than a second
  line-height dial.
  ⚠️ **THERE IS NO `influence` AXIS**, and its absence is the most important line in the
  table. It drags a formation slot toward the ball, so bending it makes the TARGET move
  fast, and a fast-moving target is a bot that keeps changing direction — `tests/botai.mjs`
  counts exactly that (velocity reversals per bot per minute, ceiling 0.5) and the first
  tuning hit **0.58** at 4v4. Dropping it entirely and leaning HARDER on every other axis
  measures **0.36**: better margin than the shipped AI, with types further apart than the
  version that broke. Depth, space, chase, press and the aim biases are free; that one is not.
  ⚠️ **A PLAN IS NOT STRENGTH-NEUTRAL, and the claim that it was has been withdrawn.**
  Measured (`tests/botplans.mjs`, each plan against the stock AI over twelve matches with
  the sides swapped): Park the bus finishes about **+16** on goal difference and Counter
  about **-9**. The lever is `depth` — a body sitting deep defends its own goal, which
  simply wins more matches — and depth is also most of what makes a strategy a strategy, so
  the two cannot be separated by tuning. The menu says so now: strategies differ in
  effectiveness, the same as in the real game.
  ⚠️ **What IS guaranteed is that the DIFFICULTY LADDER HOLDS INSIDE EVERY PLAN**, and that
  is what the suite pins. It caught a real inversion: Counter's chaser was a poacher, and a
  high-skill bot chasing with a shot bias sees more long-range shots and takes them — worse
  the better it is at finding them — so Insane finished **-5** against Rookie under that
  shape while every other one ran +3 to +23. The chaser is a ball-winner now, which is also
  what "counter-attack" means.
  ⚠️ **`standard` is the DEFAULT**, carries no types at all, and reproduces the shipped AI
  bit for bit — a product call, so that picking **Difficulty** stays the thing that decides
  how hard a match is.
  ⚠️ **Mixed excludes `standard`** — it is the "leave the AI alone" entry, so dealing it as
  one of the shapes would make Mixed sometimes mean no shape at all.
  ⚠️ **Mixed draws BOTH sides from one call** (`botDrawPlans`), second from what is left —
  two independent draws off the same seed handed both teams the same plan often enough to
  look broken, and identical shapes is the one outcome Mixed exists to rule out. Drawn off
  the match seed through its own generator, so it takes nothing out of `w.rng`.
  The picker's tiles are **built from `BOT_PLANS`** (names and blurbs read, never copied).
  Full write-up: `docs/BOT-AI.md`.
- **Hold to kick harder (`sel.charge`, `sel.chargeMs`, `chargeOn`, `chargeSecs`,
  `chargeFrac`, `chargeMul`):** the wind-up has always been in the physics at a fixed 0.6s
  for +90% and was the one part of the kick the menu never admitted to.
  ⚠️ **TWO controls, not one.** "How long" and "whether" are different questions: somebody
  who wants the power wants to tune the wind-up, and somebody who does not want to charge
  every time they hold KICK to trap wants it gone. A slider with an off at one end cannot
  say the second thing — zero seconds means *instant* full power, the opposite.
  ⚠️ **`CHARGE.max` is the DEFAULT the slider is born at, not the value the game reads** —
  `chargeSecs()` is what the physics and the wind-up ring both go through, so the dial
  cannot move one and leave the other behind.
  ⚠️ **`chargeMul` is the ONE place** a wound-up kick becomes a number. Six call sites had
  their own copy of `1 + (chargeT / CHARGE.max) * CHARGE.bonus` — a trap release, a
  one-touch, a snail boot, a body check and two draws — so a switch that had to reach all
  six would have reached five, and the one left behind would keep charging invisibly. The
  wind-up ring is gated on `chargeOn()` too, or it promises power that is not coming.
- **The name plates' fade is eased in `advanceLabels()`, NEVER in the draw.** ⚠️ The trails
  rule wearing a name plate: `drawDiscs` used to write `labelA[idx] = prev + (target-prev)*
  LABEL_FADE` on every draw, so two draws of ONE frame produced two different pictures. It
  survived while the target was binary (`LABEL_DIM` or 1) because it converged and then sat
  still — the moment the near-ball ramp below made the target continuous it never settled,
  and `tests/floaters.mjs` and `tests/surfaces.mjs` both went red on "two identical renders
  differ". The draw records the target into `labelT` (a render-time question: it needs
  screen-space overlap) and the step loop eases `labelA` toward it. Two arrays, on purpose.
- **The wind-up ring is SOLID, and the size is a dial** (`kickRingMul`, `KICKRING`,
  `sel.kickRing`, Game Feel → Player). ⚠️ It used to PULSE at `3.5 + f*8` Hz, so a full
  charge strobed it nearly twelve times a second — reported as *"holding kick would have
  the circle around the player flash instead of staying solid"*. Brightness and width
  carry the charge on their own. An even earlier version swept round like a loading bar
  and was dropped for reading as progress; solid is the third answer and the quiet one.
  ⚠️ **`tests/tells.mjs` was PINNING the pulse** (`ringHigh > ringLow * 1.25`, "it
  flashes, never sweeps") — the check is inverted now, and still requires the ring to be
  a full circle and to actually be inked, or "it does not flicker" is true of no ring.
  ⚠️ The ring is a **TELL, not the reach**: the real range is `p.r + ball.r +
  PLAYER.kickRange`, which is 2.6r on the defaults, and the ring has always been drawn
  well inside that. The dial moves the DRAWING only — `tests/gamesave.mjs` steps 900
  frames at the smallest and largest setting and requires the world bit-identical, so it
  can never become a hidden gameplay lever.
- **A GAME SAVE, as one JSON file** (`SAVEFILE`, `buildSaveDoc`, `parseSaveDoc`,
  `applySaveDoc`, `exportSaveFile`, `pickSaveDoc`; About card). Settings including Game
  Feel, your player, your record and unlocks, custom maps, drill times, and a season or
  Gauntlet or tournament run in progress.
  ⚠️ **A whole save rather than a settings export**, which is a deliberate widening of
  the ask: a settings file would move the game's *look* to the new device and none of the
  reasons you play it.
  ⚠️ **THE EXCLUSIONS MATTER MORE THAN THE INCLUSIONS.** `magnetball.upd` is the
  forced-update record — the date a newer build was first *seen*, which `updEnforce`
  counts thirty days from and which bites **offline**. Importing another device's copy
  could arrive already overdue and lock the game on a build with nothing wrong with it,
  so it is on `SAVEFILE.skip` and never written. `lastver` and `firstrun` describe the
  install rather than the player; `sync`/`login`/`html` are plumbing.
  ⚠️ **Saved replays and the photo library are NOT in it**, and the hint says so — they
  are IndexedDB and run to megabytes, and a save file you cannot email is not a save
  file. The photo you are *wearing* travels, because it is part of `profile`.
  ⚠️ **Only keys on the list are ever written**, so a save from an older build leaves
  today's newer records alone and a doctored file cannot reach a key that is not there.
  ⚠️ Import **arms then confirms** and then **reloads** — `sel`, `profile` and `stats`
  were read into live objects at boot and half the menu is built from them, so writing
  storage under a running page leaves the game showing the old save.
  ⚠️ Magic string + version, for the reason the replay files carry one: the picker will
  hand us any JSON on the disk. Every refusal is a sentence somebody can act on.
  `tests/gamesave.mjs`.
- **Names thin out near the ball (`LABEL_BALL`, `labelBallFade`):**- **Names thin out near the ball (`LABEL_BALL`, `labelBallFade`):** a *different rule*
  from `LABEL_DIM`, for a different reason. That one is about **overlap** — a plate
  literally on top of a disc — and can only fire once the damage is done. This one is
  about the part of the pitch you are reading: everything happens within a body's length
  or two of the ball, that is where four plates stack into a wall of text, and a name is
  worth least exactly where the play is worth most. ⚠️ Measured in **world units** off the
  nearest un-banked ball through `ix`/`iy`, so it means the same on Classic and Colossus
  and does not move with the zoom. ⚠️ A **ramp**, not a switch — the plates thin out as they approach rather than
  snapping off at a line. ⚠️ But `near` is **ZERO** now, and `LABEL_DIM` with it: the
  earlier call here was that plates should "recede, not vanish", and it was reversed on
  request. Right on top of the ball is where a name is worth least and the play is worth
  most, so it goes completely; `drawDiscs` skips a plate under `a > 0.004`, so a target of
  0 stops it being drawn at all. The two rules compose by taking the quieter answer.
  ⚠️ **READABLE OR GONE — there is no faint state any more** (`LABEL_MIN`, 0.55).
  Reported as *"the text player name in game is worthless and can't be read; if it is
  that blurry then just hide it"*, and the ramp is what produced it: `far` is 190 world
  units on a pitch 440 across and the fade is `t²`, so a body **90 units from the ball
  drew its name at 0.22 alpha**. Most of the pitch was therefore rendering names in a
  band too faint to read and too present to ignore — a smear that says a name is there
  without saying which. So the ramp **snaps**: `labelBallFade` returns 0 below the floor
  and `drawOneDisc` refuses to draw below the same number. What is left is a plate that
  dims a little as the ball comes near and then goes, which is the whole of what the
  near-ball rule was ever for.
  ⚠️ **ONE constant, read by the ramp and by the draw.** Two numbers would drift into
  exactly the state this removes — a plate the fade says to show and the draw declines to.
  ⚠️ **It made two existing checks VACUOUS, and that is the interesting part.**
  `tests/labels.mjs` probed the halo at 0.5 / 0.3 / 0.15 / 0.08, every one of which now
  renders as *nothing* — so "the halo never outlives its text" was passing because there
  was no text and no halo on the pitch at all. The probes are spaced across
  `[LABEL_MIN, 1]` now, which is the range that is actually drawn. `tests/gamesave.mjs`
  sampled the ramp at `far * 0.55` (value 0.30, under the floor) and read "part way down"
  as "gone"; its mid probe is **derived from the floor** — `t = sqrt((1+LABEL_MIN)/2)`,
  halfway between the floor and full — rather than picked, so retuning the floor cannot
  quietly make it vacuous again. Both suites now also pin the floor from the other side:
  just under it is **exactly zero**, not merely small.
- **Fireworks for the goal that WINS it (`FIREWORK`, `startFireworks`,
  `advanceFireworks`, `w.fwT`):** every goal got the same confetti and then the pitch went
  quiet, so the one that won the match looked like the one that made it 1-0.
  ⚠️ **Shells over time, not one bigger burst** — a single larger explosion is over in the
  same second the confetti was, and "keep the fireworks" is a question of duration.
  ⚠️ Spawned from the **step loop** off **`fxRnd`**: a draw would run the show 2.4× fast at
  144Hz (the trails rule), and drawing from `w.rng` would make how many sparks flew perturb
  every later bot decision. Runs during `goal` **and** `over`, because those are the two
  halves of one celebration — `step()` keeps integrating through the whistle while
  `endRamp` winds the rate down, so the show slows with everything else. Cleared in
  `resetKickoff`, so no match inherits an unfinished one.
- **Who kicks off (`kickoffToss`):** the side that CONCEDED after a goal, and a **coin
  toss** at the start. It was hard-coded to team 1 for the first whistle of every match
  ever played — and since the warm-up lobby lets you walk onto either half, which side
  that was had nothing to do with who was sitting there. ⚠️ Tossed off the **match seed**
  rather than `Math.random`, and through **its own generator** rather than a draw from
  `w.rng`: a pinned seed has to reproduce the whole match, and taking a number out of the
  shared stream would shift every bot decision after it just to decide a kickoff.
- **A TOUCH starts the match (`KICKOFF_TOUCH`):** the ball is frozen at kickoff
  (`integrate(w, true, false)`), so walking into it did nothing at all — the body went
  through the thing it was standing on and the match sat waiting for a button. Running
  onto the ball and driving away with it is the ordinary way to start. Small margin on
  purpose: contact, not proximity.
- **Drills use the ball you PICKED** — `startDrill` takes `BALLS[sel.ball]`, not `BALL`. A
  drill already borrows the sliders, the grip, the kick power and the magnet so it plays
  like a match, and then handed you a differently sized, differently weighted ball to
  practise with.
- **Difficulty tiles are RISING BARS** (`iconTier`), generated from `DIFF`'s own length so
  a new tier needs no new drawing. ⚠️ It shipped as equal **pips**, which say "four of
  seven" — a position in a list. What a difficulty tile has to say is "steeper", and height
  is the one property that means that without being read; seven identical dots also have to
  be *counted* to be told apart, so at tile size the middle four looked alike. Same
  argument the disc skins are built on.
- **SETTINGS COMES BACK WHERE YOU LEFT IT** (`uiState._open`, `lastSection()`,
  `uiState._tab`). ⚠️ The pause screen's Settings button was `openLook('theme')` — a
  hard-coded card — so pausing mid-match and pressing it always landed on Theme however
  deep in another card you had been, and because `openSection` collapses the rest it then
  **overwrote the record of where you were**, leaving no way back but to go looking again.
  Reported from a phone, where it costs most: the menu is a full-bleed screen, so you lose
  the card, the tab and the scroll all at once.
  ⚠️ **The open card cannot be derived from the collapsed flags** — `collapseAllSections`
  closes everything, and after that every card reads "closed" and the last one you used is
  gone. So it is recorded explicitly, and `lastSection()` **checks it against the DOM**
  before using it: a stored section outlives the card it names (the standalone Ball card was
  removed, and a save from before that still says `ball`, which would open nothing at all).
  ⚠️ The **sub-pane travels too** (`uiState._tab`, seeded into `subTab` at boot): "where I
  was modifying the settings" is the card AND the chip inside it, and `subTab` was memory-only
  so a reload dropped you on the first chip of every row. Stored under keys of its own
  (`_open`, `_tab`) so they cannot collide with a section name in the same object.
- **There is NO "Settings" tile under More**, and its absence is the point: the settings
  *are* the menu — eleven cards of them, on the screen the tile was sitting on — so it was
  a door onto the room you were already standing in. The detached panel is still reachable
  from Display, where a window-management choice belongs.
- ⚠️ **STANDING RULE: FLAG A TRADEMARK BEFORE IT SHIPS.** If a name proposed for a theme,
  a mode, a field, a ball, a skin or anything else on screen is a real product, company,
  band or event, SAY SO when it is proposed — do not just implement it. This is a standing
  instruction from the owner, given after six names had to be changed in one pass. The line
  is naming your CONTENT after somebody else's thing; naming a device the game supports
  (Steam Deck), a wiring standard (JAMMA, I-PAC), a key map (MAME) or a service the code
  calls (Google's sheets endpoint) is factual and stays. Not legal advice, and it is not a
  refusal — flag it, suggest an alternative, and let the owner decide.
- **NO OTHER PRODUCT'S NAME APPEARS ANYWHERE**, comments and test prose included —
  asked for directly, on the grounds that a game should not carry somebody else's title.
  The two that were there are gone from the source, not just from the screen: `THEMES`'
  arrowhead entry is `vsoccer` (**VideoSoccer**) with `DYN_FIELDS.vscourt`, and the snail
  mode is **Killer Lobsters**.
  ⚠️ **RE-KEYING NEEDS A FOLD.** Keys are what `sel.look`, `THEME_BUNDLES`, the map votes
  and every saved replay refer to, so renaming one strands a save on a theme that no
  longer exists — which surfaces as the DEFAULT palette and reads to a player as *"my
  theme was reset"*. `normalizeLook()` folds both old keys, as pure string swaps with no
  registry lookup (it runs during the bootstrap, and those registries are declared far
  below it — the same reason the seabed fold is written that way). `tests/themeslots.mjs`
  holds it, and caught the first attempt: a blanket search-and-replace over the file had
  rewritten the fold's own legacy literal, leaving `if (x === 'vsoccer') x = 'vsoccer'`.
  ⚠️ **What is deliberately KEPT**: the Steam Deck, MAME's default key map, JAMMA, I-PAC,
  Google's sheets endpoint and the Instagram-styled feed. Those name a device the game
  supports, a wiring standard a cabinet builder needs, and a service the code actually
  calls — factual and necessary, which is a different thing from naming your content after
  somebody's game.
- **MATCH HISTORY — one row per match played** (`MATCHLOG`, `matchLog`, `noteMatch`,
  `matchLogForm`, `buildMatchLog`, `matchLogWhen`; `magnetball.matchlog`, Career screen).
  ⚠️ **A THIRD KIND OF RECORD, and the three answer three different questions.** `stats`
  is one flat object of lifetime numbers ("how many have I won"). `NAMEBOOK` is one
  aggregate per name ("who plays on this machine"). Neither can say **what happened** —
  there was no list of matches anywhere in the game, so "who did I play last night", "am
  I in form" and "let me watch that one back" had no answer. This is the only one of the
  three that is a LOG rather than a running total.
  ⚠️ Written from **`recordResult`**, the one place that already knows who won, by how
  much, what it was worth and who was on the pitch — the same rule the floaters follow. A
  demo, a drill and a spectated match are refused: nobody played those.
  ⚠️ **`localStorage`, not IndexedDB** — the opposite call to `REPLIB`'s, for the same
  reason: a row is a handful of numbers and a hundred is ~20KB, so a database buys nothing
  and costs asynchrony on a screen that wants to draw now. Only the replay **id** points
  into IndexedDB.
  ⚠️ It records **the match, including everybody in it**, which looks like it contradicts
  "guests have no record" and does not: that rule is about `stats`, the device owner's
  lifetime tally. A log of what this machine played is where the other names belong.
  ⚠️ **NEWEST FIRST in storage**, so the screen never reverses a hundred rows and the cap
  drops the oldest with one `length =`. ⚠️ The score stays in **TEAM order**, the same
  rule the result screen follows; the W/L/D carries the perspective. ⚠️ Drawn as NODES —
  a row holds names typed by a person. Travels in the game save. `tests/history.mjs`.
- **KEEP THE LAST FEW WHOLE MATCHES** (`MATCHKEEP`, `matchKeepN`, `sel.keepMatches`,
  default **5**). Kickoff to whistle, with nothing to press.
  ⚠️ **THIS SPLIT `autoRec: 'all'` IN TWO, and the split is the point.** One dial was
  answering "save goals as they happen?" and "keep the whole match?" at once — which is
  why `all`'s own comment had to explain it was "gated separately because a match file is
  ~20x the size". Two sizes, two frequencies, two answers. `normalizeAutoRec()` folds a
  stored `all` to goals-on plus five kept matches, and falls an unknown value back to
  `off` (`autoRecOn()` tests `!== 'off'`, so an unrecognised value silently meant ON).
  ⚠️ **A COUNT, not a toggle**: the size varies more than tenfold with match length, so
  ten short 1v1s cost less than three long 6v6s and the right number is not the game's to
  pick. ⚠️ **`repLibTrim` caps PER KIND.** One pooled cap was wrong in both directions —
  a match is ~800KB against a goal's ~41KB, so five matches ate an eighth of the row
  budget, and a busy session of goals then evicted the matches somebody was keeping.
  ⚠️ The replay id is **pre-generated and stashed on the world** before `recordResult`
  runs, because the history row is written synchronously and `repLibAdd` is a promise.
  ⚠️ A history row **outlives its replay** — it keeps the id for ever and the library
  keeps the last few — so the Watch button is offered only after the library confirms it
  is still there. A button that fails is worse than no button.
- **CONTROLLER RUMBLE** (`RUMBLE`, `rumbleAmt`, `padRumble`, `rumbleAll`, `rumbleGoal`,
  `sel.rumble` 0-100, default 70; Game Feel → Effects, under Hit stop).
  ⚠️ **ITS OWN DIAL, and deliberately NOT under Screen shake & effects** — the argument
  hit stop already won. That toggle and `prefers-reduced-motion` are about motion **on the
  screen**: a wobbling picture is a vestibular problem and a buzz in your hands is not on
  the screen at all. So `motionOK()` is not consulted, and somebody who turned the shake
  off keeps the feel of their own shot.
  ⚠️ **EVERY HOOK IS A SITE THAT ALREADY PLAYS A SOUND, and that is what makes it safe.**
  `predictsGoal` re-runs the real `moveBall`/`collide*` on scratch copies, so a rumble
  inside `collideWall` would buzz the pad 25 times per shot. The four are `noteKick` (the
  one place a kick is counted), **`ballSounds`** (which is *why* `_hitWall` is a flag
  consumed outside the collision), `maybeHitStop`, and **`playSfx('crowd')`** — the same
  trick the goal audio duck uses so a fifth goal path cannot forget. `w.lastGoalTeam` is
  recorded in `goalBurst` so the scoring side feels more.
  ⚠️ **Fire-and-forget and never awaited**: `playEffect` returns a promise, and a rejected
  one on a pad that has gone away is an unhandled rejection on every kick.
  ⚠️ A **no-op without hardware** — `padIndex` is -1 for touch and keyboard seats, an
  arcade panel is a virtual pad, and Safari and Firefox have no actuator. ⚠️ Render-and-
  feel only: `tests/history.mjs` hashes the world over 900 steps at 0% and 100%.
- **UNDO ONE TOURNAMENT TIE** (`cupUndo`, the `\u21ba` on a finished match box).
  ⚠️ It clears that tie's **DESCENDANTS ONLY**, never "everything in a later round".
  Unlock already exists for starting the draw again; what this is for is the tie played by
  mistake or on the wrong settings, and wiping the rest of the round would throw away
  results other people earned. A match at (round r, seat s) feeds (r+1, floor(s/2)), so
  the chain is arithmetic and nothing is stored. ⚠️ Un-winning the tournament **gives the
  trophy back**, or replaying the final counts the same tournament twice. Arms then
  confirms, like every other delete here.
- **LANGUAGES — six, applied by WALKING THE DOM against a whitelist** (`LANGS`,
  `LANG_CODES`, `STRINGS`, `L`, `langKey`, `translateDom`, `noI18n`, `sel.lang`, default
  `auto`). Espanol, Francais, Deutsch, Portugues, Italiano, English.
  ⚠️ **A WHITELIST KEYED ON THE ENGLISH STRING, not an `L()` call round every string.**
  The markup holds hundreds of strings across eleven cards, and the repo already makes
  this argument for `buildHintToggles` — per-card markup means 27 places to keep in step.
  Because the table is a whitelist of exact strings, anything it has never heard of cannot
  be touched.
  ⚠️ **A LEADING EMOJI IS SPLIT OFF AND PUT BACK** (`EMOJI_LEAD`, and `translatable()`,
  which is the walk's cheap gate and has to agree with `L`). The option tiles read
  `✨ On`, `⊘ Off`, `🚫 Off`, `🔊 On` — the same handful of words behind a dozen pictures
  — so keying on the whole label would be a row per picture, all saying "On", and a
  thirteenth tile arriving untranslated. ⚠️ `⊘` and `▶` are named **explicitly**: they are
  Math and Geometric characters rather than emoji, so a `\p{Extended_Pictographic}`-only
  rule left `⊘ Off` in English beside a perfectly translated `✨ On`. Nothing else is
  added — `← Back` is a table entry in its own right and stripping its arrow would look
  up `Back`, find nothing, and lose a string that was already translated.
  ⚠️ **THE ORIGINAL ENGLISH IS STASHED ON THE NODE** (`_en`) and translation always runs
  from that. Without it, Spanish → French looks for "Ajustes" in a table keyed on
  "Settings" and the first language you picked is the last one you can pick.
  ⚠️ **ANYTHING A PERSON TYPED IS MARKED OUT** (`noI18n`), and this is a real hole a
  sabotage found rather than a precaution: a player called **Season**, a map called
  **Pitch** or a replay called **Off** has typed a string that IS in the table, and the
  walk rendered them as Temporada, Campo and Desactivado. The name book, the match
  history's names, the map list, replay titles and the cup's country names all opt out.
  ⚠️ `buildNameBook`'s `put()` had to start **RETURNING** its element — `noI18n(undefined)`
  is a silent no-op, which is exactly how the first build shipped translating names.
  ⚠️ **THE PASS RUNS LAST in `buildSettings`**, after everything else has written fresh
  English. It ran before `buildSubTabs()` for one build and the chip rows were the one
  part of the menu still in English.
  ⚠️ **AND ONCE PER SCREEN, in `dockOrFull`.** The `buildSettings` pass only ever reached
  the main menu, so the career screen, the drills list and the tournament stayed English —
  invisible from the menu, where everything looked translated. `showBanner` and
  `showOverlay` are the other two funnels: one for the words the pitch shouts, one for a
  result screen a dozen callers relabel.
  ⚠️ **LATIN SCRIPT ONLY, a FONT constraint rather than a preference.** The UI face is
  Kenney Mini Square, shipped in `assets/`; its cmap covers Latin-1 — every accent these
  six need — and nothing beyond. A CJK language would fall back per glyph to `system-ui`
  and come out as two typefaces inside one word. It has **no oe ligature**, so no French
  string uses one; `tests/lang.mjs` pins both.
  ⚠️ **IN ENGLISH THE WALK IS FREE** (`i18nLast`), and that matters because it runs on
  every option tap: a TreeWalker over ~2,500 text nodes measured **5.6ms** against
  `buildSettings`' own 24ms — a 23% tax on the default configuration for no work, since
  everything is *written* in English. It returns immediately when the language is English
  **and was English last time**; the one English pass that must happen is the one just
  after switching back, which is exactly what the flag catches. Only a whole-body pass may
  record the state — a scoped call has not seen the rest of the page.
  ⚠️ **SCOPE IS DELIBERATELY PARTIAL and the picker says so**: every control, button and
  heading, and the words the pitch shouts — but not the long help paragraphs. Those are
  thousands of words a language and a hint that lies about what a setting does is worse
  than one in English. ⚠️ The picker's tiles are labelled in the language they SELECT
  ("Deutsch", never "German"): somebody who cannot read the current language is exactly
  the person reaching for that control. `tests/lang.mjs`.
- **TOURNAMENT — a knockout bracket of countries** (`CUP_TEAMS`, `CUP`, `cup`,
  `cupMatches`, `cupLock`, `cupDress`, `startCupMatch`, `cupEnd`, `#cup`, `#cupFlash`,
  `#cupTicker`). Pick 4/8/16, drag the draw or randomise it, lock it, play down the tree.
  ⚠️ **THE BRACKET IS DERIVED, never stored.** `cup.won` — one 0 or 1 per match, which
  SIDE went through — is the only state a match writes; `cupMatches()` rebuilds the whole
  tree from it every time it is asked. Storing the tree as well is two places to keep in
  step and the second goes stale the moment a result is undone, which is exactly what
  **Unlock** does — and unlocking therefore **clears the results**, because the seeding is
  what the results are *about* and keeping them while the teams move leaves a bracket
  claiming a side beat somebody they were never drawn against.
  ⚠️ **THE COUNTRY IS THE TEAM**, so both sides' colour comes from the draw — through
  **`matchTeamCol`**, a one-match layer `teamColOf` reads *above* `sel.teamCol`. It is a
  layer and not a write, because `sel.teamCol` is what the PLAYER picked for themselves and
  has to survive the cup. ⚠️ **Cleared at the top of `startMatch`**, not by whoever set it:
  walking out to the menu mid-tie is the path with nobody left to remember, and left set
  every match afterwards is played in two countries' colours — which reads as the player's
  own choice silently changing. ⚠️ Declared beside `teamColOf` rather than with the cup
  code, because that function runs during the bootstrap. **Sixteenth TDZ bite.**
  ⚠️ **`cupDress` RUNS AGAIN FROM `lobbyStart`**, and without that the feature is broken in
  the ordinary case: the bodies dressed in `startCupMatch` are not the bodies that take the
  field — the lobby mints fresh bots to fill the sides and `numberTheSides` runs after them,
  so every filled-in body was wearing a shirt number instead of the country. A check that
  reads the flags straight after `startCupMatch` passes on that build, which is why
  `tests/cup.mjs` reads the roster only after the lobby.
  ⚠️ **THE LOBBY IS LITE** (`enterWarmup(w, lite)` → `w.lobbyLite` → `buildLobbyKeys`): no
  letters, no colour swatches. In a tournament you are playing AS a country, so a lobby
  offering to rename you and change your shirt is offering to undo the draw. The team-size
  stepper and the bot-skill row STAY — those are about the MATCH, not about how a body
  looks — and with no letters `drawLobbyKeys` returns before the caption rather than
  printing "spell your name" over an empty patch of grass.
  ⚠️ **THE TICKER WAITS FOR THE LOBBY.** Started in `startCupMatch` it would run its twelve
  seconds out before anybody kicked off; it fires from `lobbyStart` instead (or immediately
  when there is no lobby). It names what is **left**, skipping the tie you are standing in —
  that one is the thing on the screen behind it. Its scroll is CSS, so `motionOK()` reaches
  it through a `.still` class as well as the `prefers-reduced-motion` query.
  ⚠️ **The connectors are `::after` pseudo-elements that stick OUT of a match box**, so
  `.cupm` may **not** have `overflow:hidden` however much the rounded corners ask for it —
  clipping the box clips every line and leaves a grid of boxes and no tree. The bracket
  **scrolls sideways** rather than wrapping: 16 teams is four columns, which fits no phone,
  and wrapping destroys the one thing the picture is for.
  ⚠️ **A BRACKET OF PEOPLE, not only countries** (`CUPKIND`, `cup.kind`, `cup.people`,
  `cupRoster`, `cupEntrant`, `cupBadge`, `cupAddPerson`, `cupSize`). Countries make a
  bracket legible on a first run; the game is local multiplayer, and the entrant people
  want on the tree is each other. ⚠️ **AN ENTRANT IS AN ID and the KIND decides how to
  read it** — `cupEntrant` is the one place that resolves one, so `cupMatches`, `cupUndo`,
  `cupNext`, the renderer, the ticker and the flash card never learn there are two kinds.
  ⚠️ **TWO ROSTERS kept side by side** (`cup.teams`, `cup.people`) rather than one list
  that changes meaning, so switching kinds does not destroy the other draw.
  ⚠️ **ANY NUMBER FROM TWO UPWARDS, with BYES** — a party has however many people it has,
  and 4/8/16 only is a feature for the party that happens to number 4, 8 or 16. The size
  is the next power of two and the empty seats walk their occupant through round one.
  ⚠️ **A BYE IS ROUND ZERO ONLY**: there an empty seat is an entrant who never existed, in
  every later round it is a match not yet played. Applied everywhere, winning your semi
  walked you past the final and the screen crowned you with half the draw unplayed.
  ⚠️ The header counts **byes, not empty seats** — five in an eight-bracket leaves three
  seats empty and hands out exactly ONE bye, because two of them pair with each other.
  ⚠️ A person's colour comes from their **seed index**, not a hash of their name (a hash
  collides); where a 16-bracket wraps two seeds onto one colour, `cupDress` shifts the
  second side, because it only matters for a PAIR.
  ⚠️ A people bracket feeds `NAMEBOOK` **for free** — the bodies carry the entrants' names
  and `recordResult` already files every human by name.
  ⚠️ **A TIE IS ONE BODY A SIDE, AND THAT IS HOW THE BOTS GO AWAY.** A tie is two
  entrants, so a squad is the wrong shape: at the player's own 8v8 it fielded one human
  beside seven robots facing eight more. `startCupMatch` borrows `sel.mode` for 1v1 and
  `cupModeWas` puts it back at full time and from `startMatch` — same argument
  `matchTeamCol` makes, walking out to the menu being the path with nobody to remember.
  ⚠️ Which is also why **the lite lobby has no team-size stepper**: the only thing it could
  do is field the robots the tie exists to keep off. (It was unusable there anyway — with
  no letters above them `+` and `−` landed on top of each other and the size could be
  raised and never lowered. `blockBot` is floored at two pads so that cannot return.)
  ⚠️ **SWAPPING A TEAM IN KEEPS THE RESULTS** (`cupReplace`, `cupAvailable`,
  `buildCupSwap`), and it is nearly free because `cup.won` stores which SIDE went through
  and never which entrant — so re-reading the tree with a new id in the seeding turns
  England's semi-final win into France's. ⚠️ **Reachable while LOCKED**, unlike every other
  edit here: a substitution is a mid-tournament event, and reaching it through Unlock would
  clear the results it exists to preserve.
  ⚠️ Every entry in `CUP_TEAMS` needs a real `FLAGS` key — a missing one falls back to a
  grey square, which looks like a rendering bug and is really a team nobody can identify.
  `tests/cup.mjs`.
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
- **Killer Lobsters berries** (`MODES.kq`, still keyed `kq`): `BERRY` + `makeBerry`/`placeBerry`/`kqBerry`/`kqHiveFull`/`stepBerries`.
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
- **A BALL AT REST ON THE BOARDS USED TO FREEZE THE CHASER FOR EVER** (`BOT.stuckTicks`,
  `stuckMove`, `escapeTicks`, `botWallTangent`, `p.aiStuckT`/`aiEscapeT`).
  ⚠️ **A DEAD END, not a hiccup**, and that is the whole design of the fix. The strike
  waypoint is `ball - aim*standR`; for a ball on a touchline with the aim pointing at a
  goal, that spot is **off the pitch**, so `runBot`'s target clamp drags it back to a
  point the bot is already standing on. `botArrive` then reports "arrived" and writes a
  **zero stick**, while `align` (0.66 measured) never reaches `strikeEnter` (0.85), so it
  cannot commit either. Measured: **23 of 28** resting places round the boundary froze the
  chaser for 877 of 900 steps with the ball untouched.
  ⚠️ **RANDOMNESS IS THE WRONG FIX, and it was asked about directly.** The bot sits in a
  stable equilibrium — a nudge is walked straight back out of — so a jitter makes the
  freeze intermittent rather than gone, and intermittent is the version nobody can test.
  Everything here is counted, never rolled.
  ⚠️ **ONE MECHANISM: while stuck, the aim becomes the WALL'S TANGENT.** Everything
  downstream is already right once the aim is reachable — the waypoint slides along the
  boundary back inside the pitch, `align` reaches the threshold, the state machine commits
  and the ordinary kick fires with **every guard intact**. A first attempt drove *through*
  the ball with the own-goal guard switched off; it freed all 28 and put one in its own
  net.
  ⚠️ **`botWallTangent` is purely geometric and ignores which way the bot attacks.** Two
  earlier versions did not: "up-field along the touchline" drives the ball INTO the end
  wall when it is already resting on the attacking end, and "out along the goal line" only
  wedges it further into a corner. The wall it is stuck on decides the AXIS; the direction
  is away from the nearer end of that axis. ⚠️ On a goal line it runs **out**, never in:
  inside the mouth's width nothing holds the ball on the line any more, and pushing it
  sideways in there walks it into the net — seven own goals in the sweep when it pointed
  the other way.
  ⚠️ **LATCHED (`escapeTicks`), and without that the fix does not work at all.** The
  escape makes the bot walk round the ball, and walking is movement — an un-latched flag
  clears on the first step, the aim snaps back and the bot returns to the clamped point.
  Measured as a limit cycle: 16 of 28 never freed, *worse* than the build before it. Two
  thresholds, never one — the same rule `strikeEnter`/`strikeExit` follow.
  ⚠️ **The escape target is EXEMPT from the clamp**, which is the same clamp that built
  the dead end. It also aims the shot: lining up to shove a ball along its own goal line
  needs the bot LEVEL with it, and clamped 8 units up-field the kick (which fires along
  player→ball) picks up a backward component and scores. `integrate` still holds every
  body to bounds+20, so nothing leaves the view.
  ⚠️ **ARMED ON THE DEAD END ITSELF** — "the strike waypoint is outside the box the
  target gets clamped into" — never merely on "nothing is moving", so it cannot fire in
  open play at all.
  ⚠️ **AND NOT IN KILLER LOBSTERS**, which is a scope boundary rather than a bug dodged.
  That mode's balance is a measured proportion over eight seeded matches — how often a
  full hive rather than the ball decides it — and it turns on how much the ball is knocked
  about, because a loose ball bumps the floaty berries goalward. A chaser working balls
  off the boards changes exactly that: **5 of 8** matches ended on a hive against a ceiling
  of 4, and **7 of 8** with only the aim override and no kick at all — so it is the CHANGE
  the mode cannot take, not the kick. A frozen chaser costs far less there, where the
  berries and the snail give every bot other work.
  ⚠️ **A CORNER has no answer but the kick** — pushing along either wall needs the bot
  standing outside the other one, so no standoff point exists at all. It belts it and lets
  it come back off the boards (`wallB` 0.9), guarded on the **own goal mouth**, which is
  the one place that must never fire. `tests/botstuck.mjs`, whose metric is **time to free
  the ball** and never "the bot stood still" — after the fix a bot stands still plenty,
  because that is football.
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
- **A RECORD PER NAME** (`NAMEBOOK`, `nameBook`, `nameKey`, `noteNameResult`,
  `nameBookTable`, `buildNameBook`; `magnetball.names`). The cabinet's book: the NAME is
  the identity, so you type one and the machine remembers what that name did. Pairs with
  the lobby keyboard, where you spell it with your feet.
  ⚠️ **NOT `stats`, and the two answer different questions.** `stats` is one flat object of
  numbers for the device's owner; it cannot say who has played on the machine. Both are
  updated on every result and `tests/namebook.mjs` holds them apart.
  ⚠️ **Every HUMAN on the pitch gets one**, read off `matchRoster()` (a body substituted
  out still played the match), each judged by **their own side's** scoreline — so a 2v2
  gives two wins and two losses, not one of each. Bots never appear.
  ⚠️ **Keyed case-insensitively and trimmed**, because "kai", "Kai" and "KAI " are one
  person at a cabinet — but STORED as first typed, so the book shows it their way.
  ⚠️ **A made-up name is never recorded.** "You" is what the game calls somebody who has
  not said who they are, and filing every anonymous match under one entry makes the book a
  lie the moment two people share a device.
  ⚠️ **One Elo step, shared** (`mmrStep`): `updateMMR` and the book both go through it, so
  "how much is a win worth" is answered once. ⚠️ The cap drops the **least recently
  played**, never the worst — a book that forgets the people who lose is not a record of
  who played. ⚠️ Drawn as NODES, because a name is typed by a person (the reason
  `mapClean` exists). Travels in the game save.
- **DEFAULT SETTINGS FROM A GOOGLE SHEET** (`CLOUD`, `cloudRec`, `cloudApply`,
  `cloudSchemaAt`, `cloudParse`, `cloudFetch`, `cloudRefresh`; `magnetball.cloud`).
  ⚠️ **It is a READ, which is what makes it allowed at all**: sheet *writes* are closed by
  design (they need a hosted Apps Script), and the leaderboard already reads a public
  sheet through the gviz endpoint — so this is the same journey to a different `gid`.
  ⚠️ **THE PRECEDENCE IS THE FEATURE, and it is easy to get backwards**:
  `defaultSel()` → **the sheet** → the device's own saved `sel`. `loadSel` applies the
  sheet, *then* merges the stored settings over it, so a setting anybody deliberately
  changed on a device wins — which is what "default" means. The sheet's own **`managed`**
  row reverses the last arrow and is applied last; that is how a cabinet is locked from
  the same one place.
  ⚠️ **NEVER WRITTEN INTO `magnetball.sel`.** The *absence* of that key is how the game
  knows you have never changed a setting (`isFirstRun`), and the promise there is "your
  settings win forever after" — so the sheet stays a LAYER re-applied at each boot from a
  cache, never a save. Forging one would take the first-run lineup off every new install.
  ⚠️ **And kept OUT of `sel`**, the same argument the arcade takings and the VJ decks are:
  `saveSel()` serialises all of `sel` and `syncAdopt()` shallow-merges it between windows,
  and a merge is the wrong thing to do to a record of what a remote document said. Keeping
  it out also means no new `defaultSel()` key for `tests/audit.mjs` to call unaudited.
  ⚠️ **`defaultSel()` IS THE SCHEMA.** A dotted path is accepted only if it already
  resolves there, checked with `hasOwnProperty` at **every hop** (or `__proto__.x` walks
  off into the prototype chain), and the value is coerced to the type the default has. No
  second allowlist to keep in step.
  ⚠️ **EVERY REGISTRY LOOKUP OFF `sel` FALLS BACK, and that is now a rule.** `sel` can
  hold a value no registry has — a hand-edited localStorage, an imported save
  (`applySaveDoc` validates nothing), or one typo in a shared sheet. `FIELDS`, `BALLS` and
  `look.palette` already guarded; **`MODES`, `LENGTHS` and `DIFF` did not**, and an
  unknown `diff` handed the bots `undefined.react` and made every decision NaN. One bad
  cell must look wrong, never take the game down on every device at once.
  ⚠️ **Boot reads the CACHE, synchronously; the network only refreshes it** for the next
  launch (the About card's button applies one live through `syncApply`/`syncRefresh`, the
  recipe `/settings` already uses). So it works offline and in the downloaded copy, and a
  fetch cannot delay a launch. Deferred like `updCheck`, gated on `!PANEL` so two windows
  do not pull one sheet, and **the only fetch in the file with an `AbortController`
  timeout** — because it is the only one that runs off a launch rather than a button.
  ⚠️ `CLOUD.gid` ships **blank**, and with it blank there is no request at all: a build
  nobody has configured must not phone Google on every launch. `tests/clouddefaults.mjs`.
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
- **SLIDERS ARE DRAG-ONLY ON TOUCH** (`SLIDER_GRAB`, the capture-phase `pointerdown`).
  A native range input JUMPS to wherever you press it; on a phone the sliders are wide,
  they sit in a column you scroll with your thumb, and a graze anywhere along one
  silently rewrote a Game Feel value you had tuned. ⚠️ Implemented by **refusing the
  press**, never by re-implementing the control: `preventDefault` on `pointerdown` stops
  the browser both jumping and starting its own drag, so a press away from the handle
  does nothing and a press ON the handle is left entirely to the native drag — which
  already does capture, momentum and keyboard focus correctly. ⚠️ **A mouse is exempt**:
  a click on the track is precise, deliberate, the long-standing desktop behaviour, and
  there is no scrolling thumb to graze. `tests/sprint.mjs` checks the track is refused
  AND the handle still drags — "presses are refused" is also true of a slider nobody can
  move at all.
- **SWIPE DOWN FROM THE TOP EDGE TO PAUSE** (`SWIPEPAUSE`, `swipeStart`/`swipeMoved`).
  ⚠️ **A gesture, not a region, because there is no free region**: `zoneForTouch` splits
  the WHOLE screen into a move half and a kick half, so there is nowhere to put a "pause
  here" area that is not already a control. The top 56px is where nobody's thumb goes
  mid-match, and a pull-down from the top edge is an idiom every phone owner has.
  ⚠️ A touch starting in the strip drives **no pad at all**, which is what makes it safe
  — it cannot half-steer you on the way to being recognised. ⚠️ Timed (700ms) so a slow
  drag through the strip is not a pause, and rejected if it is mostly sideways, since
  that is somebody reaching for the fullscreen button.
- **SPRINT: a stamina ring you spend and have to earn back** (`SPRINT`, `sel.sprint`,
  `advanceStamina`, `p.stam`/`p.spent`; Game Feel → Player). Three dials: how long a
  sprint lasts, how long it takes back, and the tired speed.
  ⚠️ **YOU SPRINT BY HOLDING KICK.** It first fired off the stick at FULL TILT, and that
  was wrong for a reason worth keeping: a keyboard and a D-pad have no half-way, so they
  were sprinting the whole match and never chose anything. KICK is a thing you press on
  purpose, on every input the game has — and it **composes** with what KICK already does
  rather than fighting it, since holding traps and winds the shot up and releasing fires
  it. A sprint therefore ends in a kick, which is the run you actually want to make.
  ⚠️ **`KICK_SLOW` IS OFF while Sprint is on.** That multiplier exists so you cannot
  cruise with kick held — and with Sprint on, holding kick IS the sprint, so leaving it
  on makes holding KICK *slower* and the two features cancel out. `tests/sprint.mjs`
  measures it as behaviour (held vs loose top speed), not as a flag.
  ⚠️ **A sprint is a BOOST** (`sprintBoost`, 1.35× default, its own slider). The first
  build had none — full speed while the ring lasted, slow after — which is a tax on
  holding KICK rather than a run.
  ⚠️ **Recovery can never be set faster than the spend**: `sprintRefill()` floors at
  `sprintSecs()`, or the ring is one you never stop holding.
  ⚠️ **`spent` IS LATCHED, and without it the feature does not exist.** "Slow while the
  ring is not full", read literally, slows you on the second frame of the first run.
  You keep full speed until the ring EMPTIES and are slow until it is FULL again.
  ⚠️ **BOTS DO NOT SPRINT, and that REVERSES an earlier call.** They used to carry the
  same ring, on the argument that "a tired human playing a side that never gets tired is a
  handicap". Measured, that argument was pointing at something that was not happening: bots
  spent **0.0% of ticks** locked out and the ring never fell below **0.62**, because a bot
  holds KICK to **trap** rather than to run and lets go long before it empties. What they
  actually got was the 1.35× boost with **none of the cost**.
  ⚠️ **And it COMPRESSED THE DIFFICULTY LADDER**, the one guarantee the AI is built to
  keep. Over 36 duels a rung (3 modes × 6 seeds, both orientations), goal difference for
  the stronger side: rookie<normal **+39 → +14**, normal<hard **+19 → 0**, rookie<insane
  +57 → +64. Adjacent tiers are what a ladder *is*, and Normal against Hard came out dead
  level — a free 1.35× for holding a button every tier holds equally makes raw speed matter
  more and decision quality matter less, so the tiers converge. With bots out of it the
  sweep reads +39 / +19 / +57 with Sprint on **and** off, identically.
  ⚠️ **`sprintsFor(p)` is ONE predicate, and two places must agree on it.** `KICK_SLOW` is
  lifted for a sprinter — with Sprint on, holding KICK *is* the sprint — and it was lifted
  on `sprintOn()`, a **global** answer, so every bot got the exemption while having no
  ring: a straight buff, and rookie<normal still fell +39 → **+23** with the ring already
  taken off them. Whoever does not sprint keeps the deliberate walk exactly as it was.
  ⚠️ Read off **`ctrl`**, so a body somebody drops into mid-match gets the ring from the
  goal it walks on at and a bot taking a seat back loses it — the seat decides, not what
  the body was at kickoff.
  ⚠️ A human's deal is still fair against a bot at a flat 1.0: 3s at 1.35 then 5s at 0.75
  averages **0.975** if you just hold it down, and better than 1.0 if you spend it in
  bursts. It is a mechanic you can play well, not a bonus.
  ⚠️ The determinism block had to change with it: it compared two IDLE matches and asserted
  they differed, which was true while bots carried the ring and quietly false the moment
  they stopped. It now drives the human seat's KICK, and separately requires an untouched
  match to be **identical** either way.
  ⚠️ Ticked in `integrate`, never in a draw (the trails rule), with no randomness at all.
  ⚠️ **ON BY DEFAULT, and it shipped OFF.** Reported as *"holding kick does not deplete
  stamina, it just makes me move really slow"* — which is exactly what the off state does:
  `KICK_SLOW` takes 55% of your acceleration (measured, settled top speed **1.71 against
  3.80**) with nothing on screen to say why, while the stamina system KICK is wired to sat
  behind a switch whose existence nothing on the pitch implies. **Same shape as
  `sel.controllers` shipping `off`**: a whole mechanic built, wired to the button, and then
  defaulted to the half that only ever costs you something.
  ⚠️ **Off is still a real answer and is unchanged** — it keeps `KICK_SLOW` exactly as it
  was, which is the pre-Sprint game, and `tests/sprint.mjs` still hashes 900 steps to prove
  that path is bit identical. What moved is which of the two you get without asking.
  ⚠️ The suite's other blocks all set `sel.sprint` by hand, so **every one of them passed
  on the build with the wrong default** — the mechanic was never broken, nobody was getting
  it. There is a block now that clears storage, reloads and touches no setting at all.
  ⚠️ Two measurement traps recorded in it: the MAXIMUM speed over a run catches the shove
  from an opposing bot and read 3.44 for a build whose steady state is 1.71, and averaging
  the tail instead read **0**, because 90 steps at full pelt puts the body into
  `integrate`'s boundary clamp and it is pressed against a wall. The body is held at the
  centre and everyone else parked at the far end; only its velocity is being measured.
  ⚠️ **THE TWO RINGS ROUND A PLAYER MUST NOT TOUCH, AND THEY DID** (`RING`, `ringLayout`,
  `ringCasing`). The stamina clock sits at 1.30r and the wind-up ring at 1.42r — **0.12r
  apart, which on a phone is 1.2 PIXELS** between strokes 1.6px and up to 2.9px wide. They
  overlapped, the wind-up ring is drawn second, and it painted straight over the stamina
  arc: holding KICK showed one fat gold band and no stamina at all. Invisible while Sprint
  was off by default; the first thing anybody saw once it shipped on.
  ⚠️ `ringLayout(p, r)` **reserves the stamina ring's footprint and pushes the wind-up ring
  out to clear it**, rather than moving either to a new fixed multiple — the wind-up radius
  is a player DIAL and keeps whatever it is set to unless it would collide.
  ⚠️ **THE STAMINA RADIUS IS DERIVED, and `SPRINT.ring` (1.30) IS DELETED.** Reported as
  *"I don't see a circle around the player anymore"*, and the measurement is the report:
  on Classic (body 11.1px) the wind-up ring was sitting at **1.94r** against a dial of
  1.42, so the circle that used to hug the player was a wide faint ring at nearly twice the
  body radius and the thing beside the player was a partial arc. A fixed multiple is the
  wrong shape for the stamina ring anyway: what decides how close it can sit is the **disc
  guide ring**, which is structural and may never be covered — so the answer is "just
  outside the guide ring, wherever that is", which moves with the body size. Derived, it
  hugs the player at every radius and on every court, and there is no constant left for
  anybody to keep in step with `DISC_GUIDE.w`. `tests/sprint.mjs` was locating the arc with
  that very constant, which is the hard-coded-copy trap `tells.mjs` records for the wind-up
  ring one entry down; it reads `ringLayout` now.
  ⚠️ **THE RESERVATION USES THE WIDEST the wind-up ring ever gets**, never its width right
  now: the stroke grows with the charge, so a live reading walked the whole ring outward
  across one hold (21.3 → 21.8px). A ring that is a tell about the shot must not also be a
  tell about itself. Sampled at both ends of the charge, since one reading cannot see a drift.
  ⚠️ **AND THE ANSWER IN THE END WAS TO PUT THE ARC ON THE BODY.** Reported a second time
  as *"I still don't see the circle that indicates the kick"*, and the measurement said why:
  the tightening below was taken on a DESKTOP-sized body (11.1px) where it read 1.94r →
  1.81r, and on a **PHONE** — body 9.8px — it still measured **1.92r**, because the gap and
  the casings are fixed PIXEL amounts, so the smaller the body the bigger a fraction of `r`
  they eat. The phone is the worst case and the worst case is where the report came from.
  So `stamR` is now just INSIDE the guide ring, drawn over the player's own body, and
  `kickR` is `r*kickRingMul()` with **nothing pushing it** — the collision case is gone
  rather than negotiated, and the dial means what it says at every body size (measured 1.42r
  on a phone). It is also the most literal reading of "stamina closer to the player".
  ⚠️ **The window inside is narrow at BOTH ends and `RING.inset` was swept, not picked**:
  too shallow and the arc's casing paints on the guide ring (31 of change at 0.6, where a
  clean build reads 0), too deep and the faceplate swallows it (at 1.4 the arc's top was
  invisible and a nearly-empty ring showed nothing at all). 1.0 is where both readings are
  good.
  ⚠️ **THREE CONCENTRIC BANDS DO NOT FIT ROUND A SMALL BODY, and that is the real limit
  that forced it** — kept here because it is why the outside was abandoned.** Guide ring, stamina ring and wind-up ring are each a stroke plus a casing either
  side — about 3.2px — and between the disc rim and the dial's 1.42r there is 4.7px of
  room. So the dial cannot be honoured while a stamina ring exists, and the tightening only
  buys so much: **1.94r → 1.81r** measured, with the gap from the body edge falling from
  0.94r to 0.81r. Every number was found by sweeping against the pixels rather than picked
  — `clear` below 0.8 has the arc's casing painting on the guide ring, and `gap` below 1.8
  leaves 58 of ink in the daylight where a real gap reads 8, which is inside the range the
  sabotage builds produce (65 and 78) and so no longer separates them.
  ⚠️ **A BAND IS THE STROKE PLUS ITS CASING**, on both sides. Clearing the strokes alone
  still overlapped (2.6px of the daylight was already spoken for), and widening the gap
  instead made it **worse** — it pushed the wind-up ring's own casing further in, and the
  probe read 110 of ink in what was supposed to be clear pitch. The edges clear, not the
  centre lines.
  ⚠️ Reserved on `sprintsFor(p)`, **never on "is the stamina ring on screen right now"** —
  it appears the frame after KICK goes down, so a live test jumps the wind-up ring outward
  one frame in.
  ⚠️ **BOTH RINGS ARE CASED IN THE PITCH'S OPPOSITE INK, and RECOLOURING THEM WAS TRIED
  FIRST AND WAS WRONG.** The problem is real — on Grass, the default palette, `TH.good` is
  `#3ec06a` against mown stripes of `#2f9e52`, a green ring on green grass at **1.29:1**,
  and the gold wind-up ring is 2.09:1. But running them through `readableInk`, the way the
  ball's spot colour is, took the green to **#164325** and the spent red to **#65271b**:
  `pickTextColor` finds more headroom below mid-green than above it, so both were pushed
  DOWN. A dark green arc on grass reads as a shadow, the one distinction the ring exists to
  make — green for go, red for locked out — collapsed into two dark browns, and the gold
  ring came out near-black. So the colour is left alone and a thin casing is drawn under
  it: this file's standing idiom (the guide ring on every disc, the name plate's halo,
  `paintCap`'s outline), and it works on palettes nobody has made yet.
  ⚠️ `tests/sprint.mjs` asks `ringLayout` for the geometry and then **ties it to the
  picture** — ink at each radius, plain pitch at the midpoint. Its first version counted
  inked bands along a ray, found two, and **passed on a build with the rings back on top of
  each other**, because one of the two it had found was the disc's own rim. And the ink is
  the PEAK across a band, not the pixel at its centre: the centre of the stamina arc is
  green on green by definition and the casing is at the edges, so sampling the middle
  measures the thing that was invisible and reports it as still invisible.
  ⚠️ The ring is drawn only while there is something to say (a permanent ring round
  every body is furniture), sweeps from twelve o'clock, and turns to `RING.spent` when
  spent — "nearly empty" and "locked out" feel identical from an arc length alone. The
  suite measures it as a **difference against the same body drawn rested**: the disc
  already has a guide ring and a rim within a few pixels of that radius, so an absolute
  ink count reads 65 of 120 probe angles with no stamina ring drawn at all.
- **TEAM COLOUR IS ONE SHADE A SIDE, AND IT IS PICKED ON THE PITCH** (`TEAM_COLS`,
  `sel.teamCol`, `teamColOf`, `applyTeamColours`, `setTeamCol`). Every player used to
  carry their own `color` — yours from `profile`, each bot a `teamTint` variation — so a
  side was three or four shades of nearly-red. ⚠️ **What a shirt has to do is say which
  TEAM you are on**, from across a room, at thirty pixels; three shades of red is the one
  thing that stops it doing that. A player's own customisation is their cap, face, eyes
  and name. `teamTint(team, idx)` keeps its signature and ignores `idx`, so no call site
  has to care.
  ⚠️ **`applyTeamColours` is the one writer**, called wherever the roster or the sides
  can change — `startMatch` (after every seat, name and look, including the demo's), the
  warm-up step, `lobbyStart`, `evenUpSides` and the drop-in walk-on — so a body that
  switches halves is simply the other colour.
  ⚠️ **The GOAL matches** (`drawGoal` reads `teamColOf`, not `TH.teamRed`): a side that
  picked green and still defends a red frame is two answers to "whose end is this".
  ⚠️ **The two sides may never be the same colour** — `setTeamCol` hands the other side
  the one you just gave up, which is a swap rather than a refusal, and a refusal on a
  walk-on pad is indistinguishable from a broken pad.
- **THE WARM-UP LOBBY IS THE SETTINGS SCREEN, WALKED ON.** Beside each half, the colour
  swatches for that side; under the keyboard, seven numbered pads for bot difficulty;
  in the corner, the team-size stepper. All of it is `w.kb.keys` — one list of walk-on
  pads — so bounds, `kbKeyAt`, `lobbyReach`, `computeCam` and the painter all work off
  one thing and a new kind of pad costs nothing.
  ⚠️ **A COLOUR SWATCH IS A T-SHIRT** (`shirtPath`), drawn UPRIGHT inside its plate the
  way a key's letter is: the plate is a place you walk to so its corners follow the
  ground, and the shirt is a picture of what you are picking, which on its side reads
  worse. The one you are wearing is outlined, or eight shirts are eight guesses.
  ⚠️ **Drawn, not a sprite.** `assets/` has an animal pack, a flag pack, an input pack
  and a sports pack, and there is no shirt in any of them — and it would be the wrong
  tool anyway: `assets/` is an optional enhancement with graceful fallback, so a colour
  control that vanishes when the artwork is not beside the file is one nobody can find.
  `ICONS.shirt` is the same shape for the menu.
  ⚠️ **Which EDGE the colour strips go on depends on which way the halves divide.**
  Flat the halves are top and bottom, so the strips are two columns down one side;
  turned they are LEFT and RIGHT, so a column would put both teams' colours beside both
  halves and mean nothing — there they are two rows above the pitch.
  ⚠️ **Difficulty is a ROW under the keyboard, numbered 1..7**, with the picked tier
  named once below it. A column out to one side lands exactly where the head count
  behind that goal is drawn; and six letters shrunk to a body-wide pad is a smudge.
  ⚠️ **The head count is INSIDE THE NET**, one line — beyond it is where the keyboard
  starts when the pitch is flat.
- **A GOAL BELONGS TO THE HALF IN FRONT OF IT** (`lobbyInGoal`, `lobbyAllInGoal`).
  ⚠️ `lobbyOutside` used to call the pocket "sitting this one out", so **everybody into
  a goal** — the third way to start a match, alongside START and the countdown — handed
  every player a bench place on the way. Held for `LOBBY.goalStart` (0.9s), or jogging
  through the mouth on the way round the back of the net is a request to kick off.
- **EVERY CONNECTED CONTROLLER GETS A BODY, whatever the mode's size.** `startMatch`
  raises `per` to fit the pads (the whole count in co-op, half of it in versus), because
  the seat loop walks a roster of `per*2` and on a 1v1 it ran out after two — four people
  at a cabinet, two of them watching. A mode's size is the size you asked for; a room
  bigger than it is a room. Capped by `LOBBY.maxPerSide`, so a ninth player benches.
- **A BOT WEARS A ROBOT IN WARM-UP AND A NUMBER IN THE MATCH** (`BOT_FACE`,
  `numberTheSides`). In the lobby the numbers are a lie waiting to happen — people are
  still walking onto halves — so `lobbyStart` hands them out once the sides settle,
  **humans first**: four people in a six-a-side wear 1–4 and the bots are 5 and 6. Only
  bots are renumbered; a person's faceplate is their own. ⚠️ `BOT_FACE` is deliberately
  **not** a `TEXTS` entry (that table is the picker's list, and this is what a body IS,
  not a cosmetic), and it is declared **up with `TEAM_COLS`** because `paintFace` reads
  it during the bootstrap — the **fifteenth TDZ bite** in this file.
- **A BODY BEING WALKED ON OR OFF DOES NOT COLLIDE** (`staged` in `integrate`).
  `walkTo` sets position directly and holds velocity at zero, so `collideDiscs` — which
  pushes BOTH bodies — shoved it off its line and the next step walked it back, which is
  a bot vibrating against a team-mate instead of arriving. Reported as bots stuck trying
  to leave the field: the gate is one point and the whole outgoing row wants through it.
  ⚠️ Only while it is still WALKING (`_lobArr`), or a parked bot stays walk-through and
  you can stand inside one.
- **KICK OFF MEANS KICK OFF** (`tryKickOff` → `startMatch({lobby:false})`). It used to
  drop into warm-up whenever a pad was connected, so the one button that says "play" put
  you in a room to choose things in with every choice already made. Warm-up has its own
  button underneath. ⚠️ It also calls `replayAbort()` first — `loop()` returns while a
  replay is active, so pressing it during the attract demo's replay started the match
  underneath, froze it until the replay ran out, and then landed in the lobby anyway.
- **A HALO MAY NEVER OUTLIVE THE TEXT IT IS BEHIND** (`haloAlpha`). Every label that fades
  is a backing stroke plus a fill, and the two do **not** fade alike: the backing is the
  opposite tone by design, so over a mid-green pitch a dark halo at alpha 0.2 still reads
  clearly while a pale fill at 0.2 has all but gone. The name plate made it worse by
  striking its halo **TWICE** — two passes at the same alpha composite to 0.36 against the
  single-pass text's 0.2, so the backing got relatively **louder** the fainter the name
  became. Right beside the ball, where `LABEL_BALL` ramps the text to nothing, what was
  left on the pitch was a dark blocky plate with no name in it. Reported exactly that way.
  ⚠️ `haloAlpha(a, passes)` returns the per-pass alpha whose `passes` strokes composite to
  **a²**. At full strength it is exactly 1, so a solid label is untouched; below that the
  backing is always the quieter of the two and is gone well before the letters.
  ⚠️ **ONE helper, and `drawFloaters` goes through it too** — the floating stat labels have
  the same asymmetry with one stroke rather than two, so a second copy of the reasoning is
  a second place for it to rot.
  ⚠️ The invariant `tests/labels.mjs` pins needs **no magic number**: what is on the pitch
  at alpha `a` is at most `a` of what is there at full strength. A build whose backing
  outlives its text cannot satisfy it. ⚠️ And it is checked alongside "still solid at full
  strength", because *"the backing fades fast"* is also true of a build with no backing at
  all — which is the one thing this must not become.
  ⚠️ Measured as a **DIFFERENCE** against the same frame with no label on it. An absolute
  ink count in the band reads the halfway line, the centre circle and the mown stripes and
  flattens at a constant whatever the alpha is — the first run of that probe reported 0.76
  of full ink at every alpha **including zero**.
- **THE NAME PLATE HANGS BELOW THE BODY**, and one number decides it (`by` in
  `drawOneDisc`). It used to sit above, where it fought the floating stat labels — GOAL,
  ASSIST, SAVE — which RISE off a player: two lots of text in the same place over the same
  body, one of them moving. ⚠️ **The hit test and the draw both work off `by`**, so the
  rectangle the overlap fade tests can never end up somewhere the letters are not.
  ⚠️ Everything else about it is unchanged: `LABEL_DIM`, the near-ball ramp, the eased
  `labelA`, and the halo that goes first. ⚠️ `tests/labels.mjs` had **four** probes pinned
  to the old position and every one of them failed OPEN rather than closed — a body parked
  30px above the disc sits on bare pitch, so "a disc over the plate dims it" reported no
  dimming, and the team-tint probe sampled grass, which is the same colour for both sides.
- **NAME PLATES ARE OUTLINED, NOT BOXED.** A filled plate above each of eight bodies is
  a rectangle of solid colour parked over the play. What the box was for is legible text
  on an unknown background, and a halo in the palette's own `nameBg` does that without
  covering anything. The head count behind each goal uses the same treatment.
- **THE COURT IS CENTRED ACROSS THE SCREEN** (`computeCam`). It used to centre the
  SPAN — pitch plus furniture — and the warm-up furniture is not symmetric, so the court
  slid sideways and the pitch, the headline above it and the scorebug above that
  disagreed about the middle. ⚠️ **Across only**: doing the same down the screen reserves
  a band above the pitch the size of the keyboard below it, measured at half the frame
  left empty. Sideways the eye has references; vertically it has none.
- **THE LOBBY KEYBOARD: walk onto letters to spell your own name** (`LOBBYKB`,
  `buildLobbyKeys`, `stepLobbyKeys`, `kbPress`, `lobbyKbCommit`, `drawLobbyKeys`,
  `lobbyReach`, `w.kb`). Laid out below the back of the net, then you walk into a half.
  ⚠️ **OUTSIDE THE PITCH, and that placement is what makes it work** rather than being a
  decoration: `lobbySideOf` answers −1 for any body past the touchline, so standing on
  the keys is *undecided* and walking into a half is still the side pick the lobby
  already had. On the pitch it would be a second meaning for standing somewhere,
  fighting the one the lobby exists for.
  ⚠️ **A DWELL, never a footstep.** A key is a body and a half across, so walking over one
  crosses it in ~0.18s while standing presses at `LOBBYKB.dwell`; without that, crossing
  the keyboard on the way to the pitch spells a word. Latched until the body LEAVES that
  key, or standing still types sixty letters a second.
  ⚠️ **The first press CLEARS** — you are writing your name, not appending to "You".
  ⚠️ **LAID OUT IN SCREEN TERMS, THEN MAPPED TO THE WORLD.** A keyboard IS its layout —
  rows running across, under the pitch — so `buildLobbyKeys` builds the whole block in a
  local frame where `u` runs ACROSS the screen and `v` runs DOWN it, and one `place()`
  knows which world axes those are (`turned` = `pitchHorizontal()`, read from the same
  predicate the camera uses and never from `cam.rot`, which is not answered yet when
  warm-up is entered). Built straight into world x/y it was not a keyboard in deck view:
  the rows came out as COLUMNS ten letters tall stacked up the right-hand side, every
  letter the right way up and still unreadable. Because the turn is a quarter, a key
  stays an **axis-aligned world rect**, so `kbKeyAt`, `lobbyReach` and `computeCam` know
  nothing about any of it. ⚠️ Turned, the block clears a **TOUCHLINE** rather than the
  net, because that is what "below the pitch, on screen" comes to once the pitch is on
  its side — still outside the pitch, so `lobbySideOf` still answers −1 and the
  placement rule the feature rests on is intact. The recentre is along **`u`**, the axis
  the pitch is centred on.
  ⚠️ **KICK PRESSES THE KEY UNDER YOU, and it is the only way to type a DOUBLE LETTER.**
  The dwell has to latch until the body LEAVES the key (standing still would otherwise
  type sixty letters a second), which makes "QQ" reachable only by walking off Q and
  back on. A tap fires at once and re-arms on release. ⚠️ Latched on the **BUTTON**, not
  the key, so holding KICK and walking across the board does not type the row you
  crossed; and a tap sets `kbDone` and winds `kbT` to zero, or the dwell fires again on
  top of it a moment later.
  ⚠️ **THE PLATE TURNS WITH THE PITCH AND THE LETTER NEVER DOES**, and the letters are
  the whole point of the feature, so this is the thing to check after touching any of
  it. `drawLobbyKeys` runs AFTER `pitchXform` is restored, on points put through
  `screenPt` — so the correct wrapper is **`screenUpright`** (a documented no-op) and
  **not `uprightAt`**, which CANCELS the pitch's quarter-turn and therefore only works
  *inside* the transform. Out here it ADDS one, and in deck view the letters, the team
  counts (`drawLobby`) and the drop-in prompts (`drawSubPrompts`) all lay down on their
  sides. `drawFloaters` is the pattern to copy: screen point, draw, no wrapper.
  ⚠️ **Each label is SHRUNK to its own plate's screen box.** A key is wide in world x
  and deck view turns world x into screen y, so `SPACE` and `DEL` — the two labels that
  are words — ran off both ends of a plate that is now the narrow way round. The same
  fit covers the huge courts, where `cam.s` falls until a whole pitch fits.
  ⚠️ **The caption is placed off the block's SCREEN bounding box**, not off a world
  point above it: a caption is a horizontal line of words however the pitch is turned,
  and in deck view "above the keyboard" in world terms is *beside* it, so the line ran
  across the keys and the pitch.
  ⚠️ **AND IT WAS WHITE ON WHITE ON THE DEFAULT PALETTE**, which no geometry check
  could see: `rgba(col, a)` handed a **non-hex** colour straight back, and Grass sets
  `line: 'rgba(255,255,255,0.95)'` — so the plate's 8% wash and the letter's 55% were
  both painted at 0.95 and the board was a near-white slab with **zero** ink pixels on
  it. Seven palettes ship a non-hex `line`. `rgba` parses `rgb()`/`rgba()` now and
  **multiplies** the asked-for alpha by the colour's own, so a call site can never come
  back more opaque than the palette wanted. `tests/lobbykb.mjs` measures the letter
  against the plate in **rendered pixels**, never from the palette hex — a hex says
  nothing about what alpha did to it — and measures "upright" on a multi-letter label,
  because a rotated `SPACE` is taller than it is wide and an upright one is not.
  ⚠️ **`integrate`'s clamp has to open up to reach it**, and `lobbyReach(w)` is the one
  place that box is worked out — `computeCam` frames *the same numbers*, so "a player may
  never leave the VIEW" survives the keyboard being outside the pitch. A test that
  teleports a body onto a key passes on a build where the clamp was never widened at all.
  ⚠️ **The frame is a SPAN with a midpoint, not twice the far edge.** The keyboard is
  below the pitch and nothing is above it, so doubling reserved an empty band the size of
  the keyboard over the top goal and shrank the pitch by half as much again for nothing.
  Under the quarter-turn the vertical world axis is the HORIZONTAL screen one, so the
  recentring offset swaps axes with it. Both terms are zero without a keyboard.
  ⚠️ **Two screen-space reservations, for the reason `padTop` already existed**: the
  lobby's headline block at the top and the fixed `#lobbyStartBtn` at the bottom. The
  first build drew the bottom two rows of keys underneath the one button the lobby exists
  to get you past, and packing the pitch tighter then brought the top goal's net up into
  the headline.
  ⚠️ **Committed at the whistle, not per keystroke** — `saveProfile`/`saveSel` are
  synchronous localStorage writes and `kbPress` is reached from inside `step()`. Walking
  the alphabet would be a write a frame, and "step into the court" is what confirms it.
  ⚠️ The profile seat is **`firstHumanSeat(w)`, not `ctrl === 'human1'`**: a pad taking
  seat one sets `ctrl` to `'gamepad'`, so on any machine with a controller there is no
  `human1` at all and the typed name went into the Player names box instead of the
  profile. Same trap the keyboard/controller merge is built on.
  ⚠️ Bots never type, excluded by `ctrl` and never by where a body is — they walk on and
  off in the lobby and the bench is outside the touchline too. `syncProfileToWorld` also
  leaves a seat mid-edit alone (`p.kbTyped`), or a profile sync puts "You" back under the
  player's feet. ⚠️ Advanced in the step loop, never a draw (the trails rule), and drawn
  on the GROUND layer before the bodies or a player standing on a key is under it.
  ⚠️ **THE TEAM-SIZE STEPPER lives on the same board** — a `+` and a `−` square to the
  right of the letters, with the size it will actually field read out between them. It is
  how a 1v1 becomes a 3v3 without going back to the menu, which is the one thing the
  lobby could not do.
  ⚠️ **It REPEATS while you stand on it and the letters do not.** Opposite rules on
  purpose: a letter you meant once is a letter, so it latches until you step off, but
  going 1v1 to 6v6 through a latch is eleven trips on and off a square.
  ⚠️ `w.lobby.per` **overrides the mode** in `lobbyPlan`, and is still floored by the
  humans standing on a half — clamped at bump time, not just when read, or pressing `−`
  four times against the floor makes the next four `+` presses do nothing, which reads as
  a broken control. The readout is drawn from `lobbyPlan(w).per`, never from the stored
  value, so it cannot promise a size the plan will not field.
  ⚠️ **`stepLobbyBots` builds bots TO ORDER**, because a 1v1 world holds one bot and
  `lobbyStart` used to be the only thing that ever made more — so the dial changed the
  count under each half while the pitch stayed empty, and the lobby's one promise is that
  the preview cannot disagree with what Start does. Safe from inside `step()` only because
  `spawnLobbyBot` is fully deterministic (`pickNames` indexes arithmetically, `randEyes`
  is `(i*3+1) % n`); nothing there touches `Math.random` or `w.rng`.
  ⚠️ **The whole block is recentred, letters and stepper together.** The letters alone are
  centred on the pitch's axis and the stepper hangs off one side, so the block's middle is
  not x = 0 — and `computeCam` frames the SPAN, so an off-centre block slides the pitch
  sideways to balance it.
  ⚠️ Standing on the stepper puts you PAST THE TOUCHLINE, which the lobby already reads as
  sitting this one out — so the body pressing `−` is never one of the bodies the floor
  counts. That is consistent rather than a bug, and it is why the floor is tested through
  `lobbySizeBump` rather than by walking.
  `tests/lobbykb.mjs`.
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
- **A MOUSE HAS NO SIDEWAYS GESTURE, so on a desktop the chip rows WRAP**
  (`@media (hover: hover) and (pointer: fine)` on `#jumpBar, .subtabs`). Both rows are
  one line that scrolls sideways with the scrollbar hidden — right on a phone, where you
  swipe them with a thumb — and on a desktop that left everything past the right-hand
  edge reachable by **no input the machine has**: a wheel scrolls the page rather than a
  horizontal box, and there was no bar to drag. ⚠️ Measured at 1280×900 before the fix:
  **eight of the twelve jump chips** off the edge (Theme, Display, Sound, Game Feel,
  Replays, VJ Mode, About, Online), plus 4 of 7 theme slots, 4 of 7 player panes, 3 of 6
  sound categories and 2 of 5 Game Feel panes — and a sub-pane has **no other route in**,
  so those settings were unreachable outright.
  ⚠️ This does **not** reopen the "must be ONE row" rule below, which is a PHONE rule:
  there the row scrolls under a thumb and a second pinned row eats the screen the tabs
  exist to save. The wrap is gated to a fine pointer, and `syncSticky` already measures
  `#jumpBar`'s real height on every resize, so the headers below pin under two rows as
  readily as one.
  ⚠️ **Widening the bar out of the card column was tried and dropped.** On a desktop the
  menu is the **372px dock** (`.screen.docked`, `DOCK_W`), not the 460px column, so a
  wider cap buys nothing where it is needed and only fires on a sub-900px window, where
  it spans 824px over 460px cards.
  ⚠️ `tests/chipreach.mjs`, and the reason every existing suite was blind to this is
  worth keeping: `menunav` and `taptargets` both press a chip by calling
  `scrollIntoView()` first, **which scrolls the row for you** — so a chip no human could
  reach measured as perfectly pressable. Nothing in the new suite may scroll a row, and
  it asserts `scrollLeft === 0` to prove it didn't.
- **`.subtabs` DOES NOT FLOAT**, and that is a reversal. It used to pin under its own
  card's header, on the argument that a chip row scrolling away with the grid still
  makes you scroll back up to change tab. ⚠️ What that bought is worth less than what it
  cost: the card already pins the **KICK OFF bar** and the **section header**, so a
  third floating band sat on the card's own text — the hint paragraph under a pane came
  out with a row of chips through the middle of it, which is how it was reported. Two
  pinned rows plus one more is a lid, not navigation. `--sec-h` went with it: that
  variable had exactly one reader and measuring a section header on every rebuild is a
  layout read nothing uses. ⚠️ It is still ONE row (`flex-wrap: nowrap`, scrolling
  sideways like `#jumpBar`, wrapping only for a fine pointer) — two rows put half the
  chips behind the header and let the pane's tiles through the gap.
  ⚠️ `tests/menunav.mjs` checks it **scrolls away**, not merely that `position` is not
  sticky: without that, "not sticky" is satisfied by a row that never moved because
  nothing scrolled.
- **FPS readout:** `fps` / `trackFps(dt)`, the last row of `drawDebug`'s panel so it lands
  directly above the version tag. ⚠️ The one timer here that is deliberately **not step-locked**
  — it is counted in `loop()` off wall-clock, because the sim rate is pinned at 1/60 by design
  and a step-locked counter would read a flat 60 on every machine. Smoothed; a raw per-frame
  reciprocal jitters ±8. Inside the panel rather than beside it because `drawDebug` runs after
  `drawBuildTag` and its plate would paint over the line.
- **`padInk()`** picks the thumb-marker ink from `TH.fieldBg`'s lightness. ⚠️ They were
  hardcoded white, and Highlighter, Apologies!, Specimen and now Warp all letterbox in a light
  colour — a white ring at 0.16 alpha on a white surround is nothing at all, so the resting
  controls simply were not there on four palettes.
- **Tap targets clear 44px** — measured, not assumed. ⚠️ `.infobtn` was **20px** and there
  are **31** of them, which made the control that reveals the help text the hardest thing on
  the page to hit. It is fixed with an absolutely positioned **`::after` pad**, not by
  padding the button: padding it spaces every label out by 24px and relayouts eleven cards,
  and the glyph must not move. `.jumpchip` (27) and `.subchip` (31) grow by `min-height`
  with centred content, so the chip text stays put. HUD pause/fullscreen 40 → 44, because
  they sit next to a live ball and a near-miss there is a tap on the pitch. ⚠️ The range
  **sliders** were checked and left alone — the element box measures small but the browser
  gives the thumb its own hit area, so changing them would have been a fix for a problem
  that was not there. ⚠️ Measuring any of this is blocked by a modal over the page: the
  first probe read a 1px hit area because `elementFromPoint` was returning the Daily Reward
  card.
- **The Daily Reward modal waits for a first match** (`dailyModalWanted`). With fresh
  storage the very first thing anybody saw was a retention modal — "Day 1 · 1-day streak" —
  over a menu they had not looked at, for a game they had not played. ⚠️ The reward is still
  **granted** at the usual moment; only the modal waits, so nobody loses a day by kicking off
  first. ⚠️ Gated on "has played", not "has visited before": a second visit by somebody who
  bounced off the first one is the same wasted modal.
- **`motionOK()` is the ONE predicate for "may this move".** ⚠️ `sel.juice` was read
  directly in sixteen places and `prefers-reduced-motion` in exactly one — the tilt parallax
  — so a system asking for less motion still got screen shake, the goal flash, the goal
  camera, confetti, fireworks, the celebration slow-mo, an auto-replay cutting in and
  fourteen animated pitches. Everything that moves for effect goes through it now, which is
  what makes the Screen shake & effects toggle mean what it says.
  ⚠️ It is deliberately **not** `sel.juice && !prefersReducedMotion()`: that makes the
  toggle useless on exactly the devices whose owners might want it back. The OS preference
  decides the **default**, once, on a first run (no `magnetball.sel` yet) — and the line has
  to run **before** anything calls `saveSel()`, or the key exists and it never fires again.
  ⚠️ **Hit stop stays out**, the same reason it is out of the toggle: a freeze-frame is the
  absence of motion, not a burst of it, and it has its own dial. ⚠️ An animated field still
  **paints** when motion is off, it just holds still — `advanceDynField()` is what is gated,
  not `paint`.
- **NO DEAD CONTROLS.** The Online card shipped a disabled Room-code box and two tiles
  reading "Host · soon" / "Join · soon", and the Shop a "Coming soon" button — the only
  things in the menu that could not be pressed. A dead control is a promise the page cannot
  keep, it is what a new player is drawn to *because* it looks like the interesting feature,
  and it costs a row in `menuSearchIndex` for something nobody can reach. The Online card
  stays, because "is there online?" is a real question — it is a **sentence** now, pointing
  at saved replays as the nearest thing.
- **Landscape phone is fixed by ORDER, not by hiding anything.** At 844×390 KICK OFF sat at
  **y = 393** on a 390px-tall viewport — three pixels below the fold, on the screen whose
  whole job is starting a match. ⚠️ `#matchCard` is `display: contents`, so its header is a
  flex **item** of the scroll column: one `order: -1` in a short-viewport media query puts it
  above the logo with no DOM change and nothing removed. Measured at **26** afterwards. Your
  record moves below it (`order: 1`) because it is a summary rather than a control.
  ⚠️ The 44px chips are deliberately **not** shrunk back on short screens — that would undo
  the tap-target fix above, and the reorder is what buys the room instead.
- **The Sound card is TABBED**, one pane per SFX category — 46 controls and **1.85 → 0.76
  screenfuls**. ⚠️ `SUBTABS.sound` is **built from `SFX_CATS`**, never a second list of the
  categories: a seventh sound must arrive with its chip, or its pane is hidden while the menu
  search and `audit` both still find the controls in it. The chip carries the short name and
  the pane heading keeps the parenthetical ("Whistle (kickoff / reset)"), which is the half
  that says what the sound is *for*. ⚠️ Master, Volume and the Set row stay **outside** the
  tabs, for the reason the Game Feel presets do: a set fills in all six panes at once.
  ⚠️ Moving `SFX_CATS` up beside the other sound tables was mandatory rather than tidying —
  `SUBTABS` is a top-level `const` whose initialiser runs immediately, so reading it from its
  old home 3,000 lines below put it in the temporal dead zone and took the page out on boot.
  **THIRTEENTH TDZ bite in this file.**
- **There is NO "Ball" card**, for the reason there is no Settings tile: it held exactly
  one control — the ball-look picker — and its own help text admitted what it was ("This is
  the Ball slot of your Theme, so changing it here changes it there"). A second door onto
  one tile costs a card, a jump chip and a search row, and leaves a player two places to
  change one thing with no way to tell which is authoritative. `buildBallLookPick` is
  guarded, because `/settings` still calls it.
- **Menu navigation:** two cards held 78% of all 376 controls (Your Player 7.5 screens, Match
  3.5), so each now shows **one `.subpane` at a time** behind a `.subtabs` chip row — `SUBTABS`
  declares the groups, `showSubTab(group, pane)` switches. Four groups now: `player`, `match`,
  `theme` and `feel`.
  ⚠️ **Game Feel is tabbed too** — Ball / Kick / Player / Sprint / Effects / Camera /
  Advanced. Nineteen controls in one list is how the Tilt parallax toggle came to sit
  *sixteenth* in it and get reported as a missing feature; the chip row is the heading now,
  which is why the three `.subhead` groups it replaced are gone rather than repeated inside
  the panes.
  ⚠️ **THE SPLIT TO SEVEN WAS A REGROUPING, NOT A SPLIT FOR HEIGHT.** Measured first: not
  one Game Feel pane filled a phone screen (the tallest was Ball at **0.84**), so length was
  never the problem. What was wrong is what sat *together* — **PLAYER held ten controls and
  five of them were Sprint**, so a mechanic with a toggle and four dials was scattered
  through a list about movement, input and ring size. That is the same shape that buried the
  Tilt toggle, one layer up: a reader who wants to tune sprinting had to already know which
  five of the ten were the ones.
  ⚠️ **Ball is what the BALL does; Kick is what you DO to it.** Ball keeps the three physics
  sliders (max speed, glide, magnet); trapping, carrying, the wind-up, kick power and the
  ring that shows the wind-up are Kick. "Ball control" and "Trap window" *read* like ball
  settings and are really kick settings, which is why they moved.
  ⚠️ **`feelSliderWrapId`/`feelSliderGroups` are the ONE place that knows how a
  `FEEL_SLIDERS` group becomes an element id**, and that is not tidiness: the wrapper map
  used to be a literal in `buildFeelSliders` and **four test suites had copied it**
  (`audit`, `keyfocus`, `panel`, `trapwindow`). The day the card grew Kick and Sprint every
  one of them went on querying two of the four wrappers, so every slider that moved silently
  vanished from them — `audit` reported 6 sliders where the table declares 13. A group with
  no wrapper still falls back to Ball rather than throwing, so `audit` now names an
  unbacked group outright.
  ⚠️ **The intended grouping is WRITTEN DOWN in `tests/keyfocus.mjs`, and it has to be.**
  Deriving "every slider is in the pane its own `g` names" compares the table against itself
  — re-tag a slider and both sides move, so it passes — which was verified by filing Sprint
  speed under `ball` and watching it sail through. Which pane a slider *belongs* in is a
  human judgement and no derivation can check a judgement against itself, so the words are
  listed per pane and each must appear in its own and in no other.
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
- **THE VIDEO EXPORT: never a bare `video/mp4`** (`REPCODECS`, `repMime`, `repBadMux`,
  `repMakeRecorder`, `repBitrate`, `repClipExt`).
  ⚠️ **Ask Chrome for `video/mp4` and it answers `video/mp4;codecs=vp9`** — an MP4
  CONTAINER WITH VP9 INSIDE. Measured, not guessed. That combination is legal and almost
  nothing plays it: QuickTime, iOS Photos and most editors refuse the file outright, and
  the game handed it over named `.mp4` because `blob.type` said mp4. That was the whole of
  *"the video export doesn't produce good quality video"*.
  ⚠️ So the candidate list asks for H.264 by an **explicit codec string** and the bare type
  is **last**, where it means Safari — which advertises only `video/mp4` and does produce
  H.264. VP8 sits below VP9 for a measured reason: at the same 40Mbps request it produced
  **0.52Mbps** against VP9's **3.22Mbps** on the same moving picture.
  ⚠️ **What came BACK is checked**, because asking is not getting: `repMakeRecorder` reads
  `rec.mimeType` after construction and moves down the list if it is an mp4 carrying VP9.
  ⚠️ **The extension follows the CODEC, not just the container** (`repClipExt`) — the belt
  to that braces, so a file can never be named for something it is not.
  ⚠️ **The bitrate ask is a CEILING, not a floor**, which is the argument for asking high:
  on a deliberately busy picture, asking 8Mbps came back as 1.8 and asking 40 came back as
  3.2, because the encoder spends it only where the picture changes and a pitch is mostly
  still. Left to itself MediaRecorder picks ~2.5Mbps, and flat colour with hard edges is
  the worst case for that.
- **THE WHOLE MATCH AS A VIDEO** (`saveMatchClip`). Its own button beside Save clip, not a
  state of it: a goal clip is a few seconds and a match is however long the match was,
  played back in full to film it — so the label says so, because a button that appears to
  hang for four minutes is a broken button.
  ⚠️ **`recordAndShareClip` TAKES THE PLAYBACK AS AN ARGUMENT**, so a goal clip and a match
  clip are one function. A second copy of the recorder wiring is a second place for the
  codec trap to come back.
  ⚠️ It plays through `playReplayFile`, which swaps `world` for one rebuilt from the
  document and restores it in a `finally` — so the match behind the result screen is
  untouched and a throw mid-recording cannot strand the game holding a replay's world.
- **A REPLAY IS DRAWN BETWEEN ITS FRAMES** (`repTween`). A match replay is sampled at 30Hz
  by design and **halves itself** past `REPMATCH.max`, so a long one is held at 15 — and
  stepping a recording frame by frame at a rate you can afford to store is exactly what
  makes a replay read as a stutter. Same argument the drill ghosts are built on, same fix:
  the frames are keyframes and the picture is drawn between them. Slow motion gets it too,
  where even a 60Hz goal recording repeats frames at 0.55×.
  ⚠️ A straight **LERP**, not the ghosts' Catmull-Rom: a ball bouncing off a wall is a real
  corner in the path, and a curve through it would round the bounce off — the replay
  telling a lie about the physics.
  ⚠️ **A kick is an EVENT, not a quantity** — `k` is taken from whichever frame is nearer,
  because blending a boolean would flicker the wind-up ring through a whole tween.
  ⚠️ Measured as the number of **distinct drawn positions** over a real playback, never by
  reading the helper back: a pure function proves only that a helper exists. Two probe
  traps recorded — the ball must not be sampled on **y = 0**, which is the halfway line and
  is white right across the pitch (the first run reported 2 positions for that reason), and
  `lastReplay` needed a setter on the debug hook or the synthetic recording was silently
  ignored.
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
`tests/run.mjs` runs all 115 suites IN PARALLEL (320s, against ~1,000s serial; `MB_JOBS=1`
forces serial for reproducing a flake, and the two timing-sensitive suites run alone); `tests/README.md` lists what each covers and the measurement
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
