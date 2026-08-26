# CLAUDE.md — working on Magnetball

Guidance for Claude Code (or any contributor) working in this repo.

## What this is
A **single-file** HTML5 canvas game. **Everything lives in `index.html`** — HTML, CSS, and all game
JS (wrapped in one `(function(){ "use strict"; … })()` IIFE). There is **no build step, no bundler,
no package manager, and no runtime dependencies**. `sw.js`, `manifest.json`, `icon.svg`,
`assets/`, `menu/index.html` and `vj/index.html` are the only other runtime files —
plus `settings/index.html`, which is a three-line redirect to `../menu/`.

**The routes are `/`, `/menu/` and `/vj/`, and there are only three.** `/` is the game
AND the menu (the accordion behind KICK OFF), which is why there is no separate menu
route to add. `/menu/` and `/vj/` are stubs that fetch this one `index.html`, inject
`<base href="../">` plus `window.__MAGNETPANEL`, and `document.write` it — so all three
run identical code and cannot drift. `?panel=menu` and `?panel=vj` are query aliases for
the same thing, which is what a `file://` copy has instead of folders.

**Hard rules**
- Keep it dependency-free and self-contained. No npm packages shipped to the page, no CDN scripts,
  no external fonts/images required to play (assets in `assets/` are optional enhancements with
  graceful fallback).
- Everything is served over relative paths (`./`, `sw.js`, `assets/…`) so it works at any root.
- Prefer editing `index.html` in place; match the surrounding terse, comment-light-but-present style.

## How to work here — the rules that keep being re-learned
These are general and they are earned: every one of them has cost a red merge, a wrong
answer confidently given, or a check that passed on a broken build. The per-feature
entries below carry the evidence; this is the short list.

**1. MEASURE THE BROKEN THING BEFORE YOU FIX IT, AND QUOTE THE NUMBER.** Every entry in
this file that has held up has a measurement in it. The ones that had to be withdrawn
were written from reasoning: `proladder`'s first version scored 17 goals across 72
matches and its sign flipped on every re-run, and the AI-as-a-drill-yardstick claim was
shipped before anybody checked it could finish more than 8 of 25 drills. Write the probe
first, run it on the CURRENT build, and put both numbers in the comment. "It looks wrong"
is a report; "it draws 3.11× its true reach on Leviathan" is a finding.

**2. SABOTAGE EVERY NEW CHECK — AND VERIFY THE SABOTAGE ACTUALLY APPLIED.** Break the
fix, run the check, watch it go red, put the fix back. A check that has never failed is
decoration; it is ten seconds per assertion and it is the only thing separating a test
from a comment. ⚠️ **A sabotage that silently no-ops looks exactly like a check that is
too weak**, and it has already caused a wrong conclusion here: a search-and-replace whose
target string had drifted left the code untouched, the suite went green, and the honest
reading of that is "my check cannot see this defect". Assert the edit landed (`count == 1`
before replacing) — the same check that turned out to be fine caught the real sabotage
immediately. Sabotage-verified claims say so in the write-up.

**3. THE CONTROL IS MEASURED IN THE SAME RUN, NEVER AS A CONSTANT.** A bare pitch does
not mirror perfectly (29 of 765); a body already has a rim within a few pixels of its
kick ring; a strip of surround is not one flat colour on every theme. So measure the
thing as a DIFFERENCE against the same frame with the feature stood down, taken at the
same camera, in the same run. An absolute threshold is either vacuous or impossible, and
you cannot tell which without the control.

**4. WATCH FOR THE CHECK THAT READS BACKWARDS — it is worse than a vacuous one.** A
vacuous check passes on everything; an inverted one *rewards the defect*. Counting clear
columns across a name plate scored the build with the merged letters **11** and the
fixed one **5**, because the two render at different sizes and the probe's band sliced
them differently. It would have been committed as proof of the opposite. If a metric
moves in the direction you did not expect, do not adjust the threshold — work out what
it is really measuring.

**5. A THRESHOLD RAISED TO MAKE A CHECK PASS IS A DEFECT REPORT, NOT A FIX.** Recorded
here because it happened: `tests/sprint.mjs` moved its diff threshold 30 → 90 with a
comment calling the thing it was seeing an artefact, which made a check whose own message
reads *"a progress bar that is always a full ring shows no progress"* stop seeing exactly
that. The number is the evidence. Change the code or write the finding down.

**6. DRIVE THE REAL PATH, NOT THE MODEL.** Setting `ep().name` directly passed where the
`#pname` input failed, because the bug was in the wiring around the field. `.click()`
does no hit testing, so nineteen assertions once passed over a button no finger could
press. `pads.p1` is overwritten every step, so writing `p.kick` tests nothing. If the
claim is "a person can do X", the probe has to do X the way a person does.

**7. WHEN THE ASK COLLIDES WITH A STANDING INSTRUCTION, ASK.** "The player names look AI
generated" had three readings — the bot list (which this file records as the owner's,
supplied verbatim), the `P2`/`P3` placeholders, or the typography. Guessing the first
would have rewritten the owner's own list against a rule they set. One question cost a
minute; the wrong guess would have cost the batch.

**8. FIX WHAT WAS ASKED. If a fix touches behaviour outside the ask, revert it and
report it.** Making `syncProfileToWorld` stop writing `p.color` was defensible and was
not requested — it broke a documented, tested behaviour, `tests/livelook.mjs` caught it,
and it went back with the incoherence written down for the owner to settle. A drive-by
improvement that nobody asked for is a regression with good intentions.

**9. A RENAME ONLY EVER *ADDS* A SPELLING.** Routes, storage keys, registry keys, cache
lists: something out there is already using the old one. `/settings` is a redirect and
`detectPanel` still answers to it; `normalizeLook()` folds the old theme keys; a device
on the old default pair is moved on ONCE with a guard key. Deleting the old name strands
somebody, and it surfaces to them as "my settings were reset", not as an error.

**10. DELETE A FEATURE'S CHECK WITH THE FEATURE.** The lobby caption's clearance probe
derived a position from a constant belonging to a thing that no longer existed — it would
have gone on passing for ever while measuring nothing. Same for a constant nothing reads:
`SPRINT.show` was deleted rather than left behind, because three probes were derived from
it.

**11. WRITE DOWN WHAT WAS TRIED AND REVERTED, WITH THE NUMBER.** This is the single
highest-value habit in the repo and it is what stops the next session rebuilding a dead
end. The waypoint version of the bots' gap avoidance was measured **worse than nothing**
(51s pinned against 19s with no handling at all); the 1-2-1 kickoff diamond INVERTED the
difficulty ladder; the tennis theme shipped as a whole tennis court and was cut back to a
palette. Every one of those is a plausible idea somebody will have again.

**12. WITHDRAW A CLAIM OUT LOUD WHEN IT TURNS OUT FALSE.** Several entries here begin
"this REVERSES the rule that used to be written above" or "a withdrawn claim". A file
that only ever accretes confident statements becomes untrustworthy in a way nobody can
audit. Say what changed and why the old reasoning was wrong.

**13. BEWARE THE ATOMIC BATCH.** `cache.addAll` rejects the WHOLE install if any single
request 404s, so one optional file took the game's entire offline support with it. The
same shape turns up in `Promise.all`, in a multi-store IndexedDB transaction, and in any
"do all of these or none" API: ask what happens when the least important item fails.

**14. ORDERING IS THE FIRST THING TO SUSPECT IN THIS FILE.** Twenty temporal-dead-zone
bites are recorded below, one of them swallowed by a `try/catch` so nothing said a word.
A `const` or `let` read by a hoisted function that the bootstrap calls is a landmine;
`var` is the documented safe form. When a page goes blank, look at declaration order
before anything else.

**15. DUPLICATED KNOWLEDGE ROTS — the second copy is the one that gets missed.** The
seven-call look-refresh list was written out four times; the wrapper map for the Game
Feel sliders was copied into four test suites and every one of them silently stopped
covering half the card. One owner, many readers. If you find yourself writing the same
three lines a second time, name it.

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
- **THE GAP — a hole in the middle of the pitch** (`f.gap`, `gapRects`, `gapPush`,
  `gapBlocks`, `segRectHit`, `drawGap`, `botGapAvoid`, `BOT.wGap`). Asked for with a
  drawing: a box in the middle you cannot walk into, and two curved arrows showing that
  to reach the other end you go ROUND it. On **Faceoff Orbit** and **Island**.
  ⚠️ **THE THREE FRACTIONS CANNOT BE SHARED BETWEEN COURTS.** The slot has to clear
  `CENTER_R`, which is an ABSOLUTE 58 world units, so the fraction it needs RISES as
  the court gets shorter: Faceoff's `slot: 0.15` is 76.5 units on a 1020 length and
  only **57** on Island's 760 — inside the circle. Every gap field carries its own
  three numbers and `tests/gapfield.mjs` checks the invariants on **all** of them,
  which is the check a suite written against `faceoff` by name could never make.
  ⚠️ **Island is Classic's exact 440 × 760**, on purpose: everybody knows what that
  court plays like, so it is the most legible possible second example, and its 110
  channels are the opposite of Faceoff's corridor.
  ⚠️ **THE ONLY INTERIOR GEOMETRY ANY FIELD HAS, and the first `FIELDS` entry that changes
  the PHYSICS rather than the rectangle.** It is on the FIELD, not in the painter:
  `DYN_FIELDS.faceoff` is a cosmetic slot somebody may swap for Grass, and where a body
  can go must not depend on the theme you are wearing.
  ⚠️ **ONE spec, ONE reader.** `f.gap` is three fractions and `gapRects` is the only place
  that turns them into rectangles — `buildGeometry`, `drawPitch`, `drawFieldPreview`,
  `layTeam`, the bots and the theme's own seam all ask it. The boundary shape is already
  hand-written in four places (`buildGeometry`/`drawPitch`/`drawFieldPreview`/
  `pooltable.path`) and is this file's standing complaint; the gap does not get to repeat it.
  ⚠️ **FRACTIONS of the field, never pixels** — the `TARGET_SPOTS`/`tacticsboard` rule.
  The three numbers are taste; the invariants under them are not, and `tests/gapfield.mjs`
  pins those rather than the numbers: the channels take two bodies abreast (85 units on a
  340-wide court), the slot clears `CENTER_R`, and the blocks stay inside the pitch.
  ⚠️ **SPLIT AT THE HALFWAY LINE.** `resetKickoff` puts the ball at (0,0) and
  `KICKOFF_CIRCLE_R === CENTER_R` — the half-line rule's gate IS the drawn circle — so one
  unbroken block over the middle is a ball, a centre circle and a gate nobody can reach.
  The slot runs SIDEWAYS, connecting the two channels to each other, so it costs the
  feature nothing: it is not a way to reach the other END.
  ⚠️ **The eight walls are NOT `ballOnly`**, which is the whole feature — every boundary
  wall is, so a player may step a stride over the line, and this is the exact opposite.
  `integrate` already runs `if (!wall.ballOnly) collideWall(p, wall)`, which is the same
  mechanism `dWall` gives a drill, and `collideWall` derives its normal per contact from
  the closest point on the segment, so four segments enclose a rectangle that ejects from
  whichever side a body is on. `draw:true` gets `renderDrill` to paint it for free.
  `isGap` is for the reader and the suites; nothing in the physics branches on it.
  ⚠️ **The ball bounces off it too**, so you can pass and bank off its faces. A void the
  ball could cross has a dead-ball case — a ball at rest in the middle is reachable by
  nobody — and bots would aim through a region they cannot follow into. `predictsGoal`
  and `botPickAim`'s bank candidates both walk `w.walls`, so both are right for free.
  ⚠️ **THE BOTS' PART IS A STEERING TERM, NOT A WAYPOINT, and the waypoint version was
  built first and measured WORSE THAN NOTHING.** Bots have no obstacle awareness at all:
  `botWallAvoid` reads only the field rectangle, and the formation slot, the support-grid
  cell and the strike waypoint are each clamped to that same rectangle, so all three will
  happily name a point inside the gap. Replacing `aiTarget` with a corner to walk round
  (a) **parks a bot ON the corner** — a corner is a place you ARRIVE at, and the block is
  still between it and the real target, so the worst continuous pin against a face went
  from 19s with no gap handling at all to **51s** with it — and (b) **yanks the chaser off
  the ball** whenever its run clips a block, which cost **7 goals down to 1** over three
  90-second bot matches while every containment check stayed green. A stick vector can do
  neither: the bot keeps seeking what it wants and is pushed sideways while the block is
  in the way. That is also what Layer 0 IS.
  ⚠️ So there are exactly two hooks: `gapPush` on `runBot`'s **single** final target clamp
  (downstream of all three target sources, so one call covers them) and on `layTeam`'s
  formation marks; and `botGapAvoid` in the Layer-0 blend at `BOT.wGap`. Measured:
  pinned **0.34%** of bot-time against **4.25%** with it off, worst pin **1.7s** against
  **6.5s**, and 6 goals against 7.
  ⚠️ **The crossing test uses the BARE block; the push uses a PAD.** Backwards, a body
  standing against a face counts as *inside* the padded region, the term never switches
  off and the bot is shoved sideways along a wall it has already cleared — the same shape
  as the corner dead end.
  ⚠️ **`botGapAvoid` picks its side from where the BODY is**, not from the shorter total
  path: moving toward the nearer end makes it nearer still, so the choice reinforces
  itself, where a path-length test flips whenever the two are close and the bot judders.
  ⚠️ **It applies to the CHASER too**, unlike `botWallAvoid` — that one stands down for a
  chaser because pinning a ball against the boards is doing its job, and there is no such
  thing as pinning a ball against the middle of the pitch.
  ⚠️ **`fieldShape` answers `other` for a gap field before it looks at `(corner, cut)`** —
  which is what files it under the Other tab, and `other` was already written as a genuine
  catch-all for "a shape that does not exist yet".
  ⚠️ **`mapClean` is a whitelist rebuild and DROPS `gap`**, so a custom map cannot carry
  one and cloning Faceoff into the map maker gives a gapless copy. That is the scope line,
  not a bug: the editor has nine sliders and no way to express an interior region, and a
  control it cannot draw a preview of would be lying about the field it makes.
  ⚠️ **A BLOCK IS A BARRIER, NOT A CONTAINER — nothing may ever be PLACED inside one.**
  `collideWall` bails at `dist >= d.r`, so four segments only act within one radius of a
  face: a body put down in the MIDDLE of a block is touched by none of them and sits there
  for the rest of the match, with no backstop anywhere. Spawning is the only way in, so
  every site that puts a body on the pitch pushes out through `gapPush` — `layTeam`
  (formation marks, and `homeX/homeY` is written from the pushed spot or `applyKickoffLine`
  walks them back in), **`placeBerry`** and **`lobbySpotFor`**. Both of the latter two were
  real: **three of the six Killer Lobsters berries spawned inside**, half that mode's
  objective permanently unreachable, and the warm-up lobby's row sits at exactly
  `±L/2 * 0.30`, which is inside a block on this court — and `walkTo` sets position
  directly on a body `integrate` is ghosting, so a bot walks straight in. `subOnSpot` is
  already clear at `±(W/2 - 2r)` and was checked rather than assumed.
  ⚠️ `clampBallInside` gives no interior backstop and does not claim to — it never modelled
  rounded corners either. It cannot: at the default `ballCap` the sub-stepping gives 4.6
  units of travel against a ball radius of 10, so a segment cannot be stepped over.
  `tests/gapfield.mjs`.
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
  ⚠️ **AND WITH NOTHING RUNNING IT OPENS WARM-UP INSTEAD** — the menu, the attract demo or
  a finished match. A controller had no way at all into the room built for controllers:
  you had to reach for a mouse, find `#warmupBtn` and press it. A quarter-turn means
  nothing on a menu, so the button is free there, and `pollSeatRotate` is the one place
  that decides which of the two SELECT means. ⚠️ **The first pad only** for that half —
  four people leaning on SELECT must not open four lobbies — while the quarter-turn stays
  per pad, because that one is a statement about where a person is standing.
  ⚠️ The idle branch sits **above** the arcade stand-down: a cabinet with a real pad
  plugged into it is an ordinary setup, and an arcade panel reports no button 8 at all.
- **EVERY BUTTON KICKS** (`padKickHeld`, `KICK_NEVER`) — nothing to learn, nothing to bind,
  and it cannot be wrong on a pad that numbers its buttons oddly, which is what the old
  fixed list (`KICK_FALLBACK`) risked. ⚠️ **Three exclusions, and the D-PAD is the one that
  is easy to miss**: it is a button as far as the Gamepad API is concerned, so an
  unqualified "any button kicks" fires a shot on every step you take. Start begins the
  match and Select turns your controls. A hand binding still wins outright.
- **NO SCOREBUG OVER THE WARM-UP ROOM** (`syncScorebug`). Nothing used to decide this:
  `startMatch` showed it unconditionally and nothing ever took it down, so the lobby carried
  a score that **cannot change** (`checkGoal` is gated on `state === 'play'`) beside a clock
  that is not running — it prints the match LENGTH. At 30px it was also the loudest text on
  that screen while the lines explaining the room are 9px, so the biggest thing on the page
  was the one thing with nothing to say.
  ⚠️ **ONE FUNCTION, THREE CALL SITES, because of an ORDERING TRAP.** `startMatch` calls
  `enterWarmup` and only THEN shows the bug, so a hide inside `enterWarmup` is clobbered a
  few lines later — while the three other ways in (`restartToWarmup`, the cup's lite lobby,
  the menu's warm-up button) reach `enterWarmup` LAST, where a hide would stick. A function
  reading `world.state` is right on every path whatever order they run in.
  ⚠️ In `lobbyStart` it is called **LAST**: it reads `w.state`, and `resetKickoff` is what
  moves that off `warmup`, so at the top it would ask the question before the answer changed.
  `lobbyStart` is the one way out of warm-up, so it is the only place that restores it.
  ⚠️ The countdown the lobby DOES want is its own live "STARTING IN 29S". Two clocks side by
  side, one ticking and one frozen, is worse than one. `tests/lobbydress.mjs` drives both
  orderings and pins that an ordinary match still HAS a scorebug — "hidden in warm-up" is
  also true of a build that hid it for good.
- **THE ROOM IS LAID OUT ON THE AXIS THE SCREEN HAS** (`buildLobbyKeys`' `splitU` branch,
  `LOBBYBTN`, `colDeep`). Reported as the lobby being far too small with the sides of the
  screen empty, and measured as exactly that: with the shirts, the flags and the difficulty
  row all STACKED ABOVE the court, the content box came out **1048 × 980 world units —
  square — on a 1.87 screen**, so `computeCam` was bound by the vertical every time. At
  1678 × 895 the whole room occupied **x 637..1116 of 1678: 71% of the width was empty**,
  and the pitch was **a third** of the size the same court is in a match on the same window.
  ⚠️ **THE FIX IS A SHAPE, NOT A SIZE — nothing was made smaller.** Turned, the halves are
  LEFT and RIGHT, so the dressing blocks go in the MARGINS beside the half they dress, which
  is where "the things beside your half dress your half" lands more literally than it ever
  did above the court. The difficulty row follows into the bottom corner, pairing with the
  size stepper: the two match-wide controls in the two bottom corners.
  ⚠️ **`colDeep` IS ZERO NOW**, in both orientations — it existed only because the colours
  were a row over the court and the numbers were drawn through them.
  ⚠️ **A MOUSE-DRIVEN MACHINE WAS PAYING A THUMBSTICK ALLOWANCE.** `#lobbyStartBtn` sits at
  `calc(70px + 78px)` to clear the on-screen joystick, and `computeCam` reserves the band
  under the pitch so the keyboard's bottom rows do not render beneath it — so on a desktop
  148px of nothing was charged to the court every frame. With a fine pointer the button
  drops to `LOBBYBTN.deskBottom` and the reservation goes **210 → 96**.
  ⚠️ **FLAT, THE COLOURS GO DOWN ONE EDGE AND THE FLAGS DOWN THE OTHER** — which the note
  in that branch had always CLAIMED and the code did not do. All four sub-blocks were on
  the left, so a phone showed two stacks down one edge and an empty right margin — and that
  margin was *reserved anyway*, because the across span is symmetric about the court
  (`2*max(...)`). Split, it costs less rather than more: 768 → 708 world units.
  ⚠️ **THE STEPPER CLEARS WHICHEVER IS WIDER, THE PITCH OR THE KEYBOARD.** `pu` was
  `across + K.side` — a clearance from the TOUCHLINE, which is the outer edge of the layout
  only while the letters are narrower than the court. Widening the keys broke that: flat,
  `across` is 220 against a top row spanning 257, and the `+` square landed **on top of P**.
  Only `tests/lobbydress.mjs`' pad-vs-pad overlap check can see that — no count, bounds or
  camera reading changes when two pads occupy one square.
  ⚠️ **Measured, on a 1678 × 895 window**: pitch **404 → 607px** and a key **20 → 37px**,
  with the warm-up court going from **0.33 to 0.50** of the same court in a match. Every
  size of court gained (Leviathan 999 → 1020, Futsal 434 → 472), and the phone is within
  2% of where it was — the flat layout was never the problem.
  ⚠️ **The check is a RATIO against a control measured in the same run**, never an absolute
  pixel count: what the furniture costs is a proportion, and a live match on the same window
  is what it is a proportion of. Paired with "the box uses BOTH axes", which is not implied
  by it — a build could grow the pitch by pushing the furniture off the screen.
  `tests/warmuproom.mjs`.
- **THE WARM-UP CONTROLS ACT ON THE MATCH YOU ARE STANDING IN, AND THE BOT SKILL ROW DID
  NOT** (`kbHit`'s `diff` branch). `w.diff` is written **once**, in `startMatch`, and
  nothing else in the file ever touched it — so walking onto INSANE in warm-up set
  `sel.diff`, saved it, relabelled the caption to *"BOT SKILL · INSANE"*, and left the bots
  you then played on whatever tier the match was built with. Measured: caption **Insane**,
  storage **insane**, and the bots reacting at **0.85** (normal) rather than 1.1. The tier
  only arrived on the **NEXT** match, which is the one place nobody looks.
  ⚠️ **It is the NO DEAD CONTROLS rule with an extra turn of the screw**: the row did not
  merely do nothing, it printed a claim about the match that was false — in the one room
  whose whole promise is that *the preview cannot disagree with what Start does*.
  ⚠️ **The KEY moves with the object.** `w.diffKey` is what the match history, the map vote
  and a saved replay record, so leaving it behind files the match under a tier it was not
  played at — the same disagreement, written down permanently.
  ⚠️ Applied in **`kbHit`, not `lobbyStart`**, so the world and the readout agree at every
  instant rather than only at the whistle — and every way out of the room (the pad button,
  the START pad, everybody into a goal, the idle clock) then needs no copy of it.
  ⚠️ `w.diff` is read live by `botSkill` and the aim scoring and is never cached at init,
  so swapping the object is the whole change.
  ⚠️ **The other three walk-on controls were already right and are now pinned**: a colour
  swatch and a flag both call `applyTeamColours` on the spot, and the stepper writes
  `w.lobby.per`, which `lobbyPlan` reads live. Difficulty was the only one that wrote a
  setting and nothing else. `tests/warmuproom.mjs`.
- **NO CAPTION OVER THE WARM-UP KEYBOARD** (`drawLobbyKeys`). It read "STAND ON A LETTER
  TO SPELL YOUR NAME · KICK = PRESS IT" — a line of help text over a QWERTY keyboard laid
  out on the grass with a person stood on it. Asked to go in those words, and the
  **standing preference is now to MINIMISE help text** rather than add a line wherever
  something could be explained. What it carried that is not obvious (that KICK is the
  press, so a double letter is reachable) is said by the room: a key lights up under you
  and pressing the button types it.
  ⚠️ `LOBBYKB.clear` (70) is unchanged — it was tuned so the CAPTION cleared a turned
  pitch's touchline, so with the caption gone the board has more room than it needs, which
  is the safe direction.
  ⚠️ **THE OLD CHECK WENT WITH IT RATHER THAN BEING LEFT TO PASS.** `tests/lobbykb.mjs`
  read `topKey - 13 - pitchBot` — a clearance derived from a constant belonging to a thing
  that no longer exists, so it would have gone on passing while measuring nothing.
  ⚠️ **AND ITS REPLACEMENT IS NOT A PIXEL BAND, because a pixel band CANNOT SEE IT.** That
  was tried: sample the strip the caption occupied and require it flat. Upright it works
  (one colour). Turned it is meaningless — the keyboard clears a TOUCHLINE there, so the
  same strip is over the GRASS and reads 36-39 colours of mown stripe on a build with no
  caption at all. A threshold loose enough for the turned layout is loose enough for a
  line of type in the upright one. What is measured instead is WHAT THE LOBBY DRAWS:
  `fillText` is recorded for one frame and the caption must not be among the strings.
  ⚠️ **The control is the `BOT SKILL` readout, not the key letters** — `lobbyBoard` caches
  its bake on a camera signature, so a settled lobby redraws no pads at all on a second
  render and a letter count reads 0 on a good build. `BOT SKILL · NORMAL` comes out of
  `drawLobbyKeys` itself, the same function the caption was removed from.
- **The warm-up prompts are OFF THE PITCH**, in one row under the touchline (`drawLobby`,
  `L._promptY`). They floated over each player's head, which in deck/side view meant a line
  of text running down the middle of the field — `uprightAt` keeps words upright while the
  pitch is turned.
  ⚠️ **`LOBBYKB.clear` is 70, and 34 was tuned against the wrong orientation.** Turned, the
  block clears a TOUCHLINE rather than the back of the net, so that is the tight case:
  pitch-edge to first key row measured **31.8px upright but only 24.8px turned**, and the
  caption sits 13px above the keys, so turned it landed **11.8px** below the line and
  straddled the pitch border. At 70 it reads 44.8 / 40.6px with the caption 27.6px clear,
  costing 2.7% of pitch scale on a phone and 3.6% turned — the trade everything beside the
  court pays. `tests/lobbykb.mjs` measures it in rendered CSS px off the pitch's REAL screen
  box (all four corners) and in BOTH orientations: turned, the world axes swap, so a probe
  assuming world +y is screen-down measures the wrong edge and reported a comfortable 139px
  on the build whose caption was touching the line.
  ⚠️ Measured to the back of the NET, not the goal line, or the row sits on
  the pocket; and **clamped downward, never flipped to the top**, because the top is where
  the "PRESS START" headline lives. ⚠️ `beginPath()` before each plate: `roundRectPath` only
  appends, so without it every `fill()` repaints the earlier plates over their own text —
  four boxes came out with only the last one's words in them.
- **The default is a GREEN PITCH AND NUMBERED PLAYERS** (`defaultSel().look.palette` =
  `grass`, `defaultProfile().flag` = `num1`), **and the default match is FIRST TO 3**
  (`defaultSel().length = 'g3'`), asked for. ⚠️ A goals-based default ENDS matches at
  three goals, which is invisible to a person and load-bearing for the suites: ~94 of
  them start matches without pinning a length, and every long bot measurement (botai,
  botplans, kqberry, botstuck, sprint) was taken under timed play — those five pin
  `sel.length='5'` explicitly now. A new suite that measures anything across a whole
  match must pin its length too. ⚠️ The first-run continent lineup is **not
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
- **THE GAME SHIPS ON THE PRO FEEL** (`defaultSel().feel` = the `pro` preset, plus
  `trapOff:true`, `hitStop:2`, `rumble:15`, `kickRing:125` and match speed 1.00). Asked
  for: it is the setup that was being picked by hand every time, so a fresh install gets
  it. Every one is still a slider and `resetSettings` gives this set back, not the old one.
  ⚠️ **IT COLLAPSES THE BOT DIFFICULTY LADDER, and that is a known, measured, SHIPPED
  defect rather than something nobody noticed.** Measured on `botplans`' own harness
  (2v2, 60s, both orientations), Insane against Rookie per strategy:

      plan       standard  balanced  attack  bus  counter  press  passing   pooled
      Casual        +18       +17     +22    +16    +11     +11     +12      +107
      Pro (shipped)  -4        +6     -11     +1     -9      -4      -4       -25

  Every plan falls by 20 to 33 and the two arms do not overlap anywhere — seven independent
  measurements agreeing, which is what makes it a finding. `botstuck` fails at the shipped
  default too, and concretely: **5 own goals** off the escape kick and a sanity minute that
  finishes **0–0**.
  ⚠️ **The cause is written down one layer along**: `botArrive` writes in ACCELERATION
  space against `w.pAccel`, the player's own Game Feel number — the same reason the drill
  machine "asks for almost no stick" on a low one. Pro's `accel` is 12 against Casual's 40,
  so every tier is slowed and the higher tiers, which reposition more, lose more; `pdamp`
  960's float compounds it, because a bot that overshoots has to come back. Isolated:
  one-touch and `ballcap` are innocent, **both movement numbers hurt**, so there is no
  single value to back off. **The fix is to retune the steering against the shipped
  movement, not to change the default.**
  ⚠️ **So `botai`/`botplans`/`botstuck` are PINNED to the AI's own tuning
  (`pinCasualFeel`), and `tests/proladder.mjs` is RED ON PURPOSE.** The three guard the AI
  — that the ladder holds at the movement it was tuned against, so a retune has something
  to keep. `proladder` runs at whatever `defaultSel()` ships and describes the real game.
  Delete it and those three pins become exactly the papering-over that this repo's "a
  threshold raised to make a check pass is a defect report, not a fix" rule forbids.
  ⚠️ **A GOAL DIFFERENCE IS ONLY AS GOOD AS THE GOALS UNDER IT**, and getting this wrong
  produced a confidently wrong answer here. The first version of `proladder` ran its own
  duels at 45 sim-seconds and scored **17 goals across 72 matches** — 0.24 a match, so
  nearly every match finished 0–0 and the sign came from the handful that did not. Re-run
  longer it flipped, and re-run on other seeds it flipped again, on **both** feels. Below
  about **two goals a match** a ladder reading is a coin toss: check the goal count in the
  same object before believing any of these numbers.
  ⚠️ **`pinCasualFeel` also pins `sel.kickRing = 195`, and that is the half that actually
  bit.** The dial is the drawn ring AND the physical reach (`kickRangeUnits`), so 195 → 125
  is a **27% shorter leg** — four suites place a ball at a distance chosen for the old
  reach and measured "no kick" rather than the thing they are about. The feel numbers alone
  did not fix them.
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
- **AUTO MEANS "WHICHEVER WAY FILLS THE SCREEN"** (`pitchHorizontal`, `fitsBetterTurned`,
  `ORIENT_GAIN`, `syncPitchTurn`). `sel.orient` has always offered Auto / Upright /
  Sideways, and `auto` meant `isDeck()` — so on every other machine the pitch stayed
  upright however wide the screen was. `computeCam` fits the whole span, so an upright
  440 × 760 Classic on a 1920 × 1080 panel settles at `cam.s` **1.03** and the pitch is
  455 of 1920 pixels across with surround either side of it. Reported as *"lot of dead
  space in the court"*, and measured as exactly that: turned goal-to-goal the same court
  fits at **1.97**, and on a 1280 × 800 window the gain is **1.82×**. Upright and Sideways
  are still hard overrides and cocktail is still locked upright.
  ⚠️ **THE PITCH BOX, never the warm-up span.** `buildLobbyKeys` asks this question to
  decide which way to lay the keyboard out, and the keyboard is *part of* that span — so
  answering off the span makes the answer depend on its own consequence.
  ⚠️ **A REAL GAIN, not any gain** (`ORIENT_GAIN`, 1.04). On a near-square window the two
  fits are within a percent of each other and a bare `>` flips the pitch — and with it
  every player's stick — on a one-pixel resize.
  ⚠️ **THE ANSWER IS VIEWPORT-DEPENDENT NOW, so `resize()` has to re-ask it**
  (`syncPitchTurn`), and two of its readers are answered on a LAYOUT CHANGE rather than
  per frame: `applySeatRotation` decides which way a stick points, and `buildLobbyKeys`'
  `turned` decides whether the rows run across the screen or up the side of it. `resize()`
  called neither, so without this a window crossing the threshold hands every player a
  stick 90° wrong and leaves the lobby laid out for the orientation it is no longer in.
  It is the hazard `SIDE` records one layer along, arriving from the other direction.
  ⚠️ `_turnWas` is a **`var`**: `resize()` runs during the bootstrap and this sits two
  thirds of the way up the file. It is also reset in `startMatch`, because
  `fitsBetterTurned` reads the FIELD and a Futsal match and a Leviathan one can answer
  differently on the same window.
  ⚠️ **A portrait window is left alone**, which is the other half of the rule — a tall
  court on a tall screen loses by turning, and a build that simply always turned would
  pass every "it turned" check. `tests/orient.mjs` measures the gain and the phone case.
- **A MATCH STARTING COLLAPSES THE SIDE MENU** (`matchCollapse`, `dockCollapsedNow`).
  `resize()` auto-docks `#setup` on the left during a live match and `uiPadLeft = DOCK_W`
  takes that width off the court — a fifth of a 1920 screen given to a menu nobody is
  reading. It was already done for the Steam Deck, and only there.
  ⚠️ **It must NOT write `sel.dockCollapsed`.** That key is the player's own answer to the
  ‹ / › tab and is persisted, so setting it at every kickoff would silently destroy a
  preference somebody set once and never get it back. `matchCollapse` reads ON TOP of it
  and is dropped by `setDockCollapsed` (a hand on the tab), by any explicit `dockOrFull`
  (asking for a page is asking to see it — otherwise Settings from the pause menu docks a
  panel collapsed to nothing) and by `toMenu`, which goes through `dockOrFull`.
  ⚠️ `dockOrFull` reads `dockCollapsedNow()` **before** clearing it, or the deck's
  "opening a page pauses the match" branch never fires: the collapse is what it reacts to.
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
  ⚠️ **And it was asked up again, to 1.05..2.75** (`1.05 + 1.70 * drive`)**.** "Make the trail a bit thicker" — so the
  whole range moved rather than only the top, because lifting the fast end alone would put
  the slow end further below where it started. The clamp to path length is untouched and
  is what still makes *wider than it is long* impossible, which is why this pair stays a
  taste dial: the invariant does not live in these two numbers.
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
- **A BODY IS DRAWN AT THE SIZE IT COLLIDES AT, ON EVERY COURT, AND THE SIZE FLOOR IS
  GONE** (`MIN_BODY_PX`, `cam.body`, both deleted). There was a floor: on the huge courts
  the whole pitch has to fit on screen, so `cam.s` falls until a player is a couple of
  pixels, and every disc and the ball were scaled up to a minimum by ONE shared multiplier
  "so they stay in proportion".
  ⚠️ **They stayed in proportion to each other and not to the PITCH, which is the half that
  matters.** SIZES were multiplied and SEPARATIONS were not, and every distance on a pitch
  is a separation — so at the moment two bodies touched, the drawn radii summed to
  `cam.body ×` the drawn gap between their centres and the picture showed them
  interpenetrating by exactly that much. Reported as *"collision size does not match the
  visuals, causing ball to go inside player"*, and measured on Leviathan: at contact the
  ball's centre was **3.75px** from the player's centre while the player was drawn at a
  radius of **7px** — the ball was drawn wholly inside the body it was resting against.
  ⚠️ **It reached the KICK RING too, which is worse, because that ring is a promise about
  the physics rather than a decoration** — *"a ball touching this ring is within kicking
  distance, by construction"*. `ringLayout` is handed the drawn body radius, so the ring
  came out **3.11×** its true reach on Leviathan and **1.57×** on Colossus: the ball sat
  well inside the ring and would not kick.
  ⚠️ **NO CAP COULD FIX IT, and that was worked through rather than assumed.** The overlap
  is `(cam.body − 1) × gap`, so ANY multiplier above 1 draws interpenetration and capping
  only chooses how big a lie to tell. This is the **VideoSoccer arrowhead decided again** —
  there the drawn shape was a third bigger than the collider and the DRAWING was made to
  match the physics, never the other way round.
  ⚠️ **What it costs is real, was measured before choosing, and is pinned so nobody
  "fixes" it back**: a player on Leviathan is **4.5px** across on a 1280×900 desktop and
  3.5px on a 390×844 phone, and on Colossus 8.9px and 6.9px. That is what a court sixteen
  times Giant's area looks like when all of it has to fit on the screen at once.
  ⚠️ **AND THE SCREEN THIS IS PLAYED ON IS A TV, which is the owner's answer to that cost
  and is why the small end is acceptable.** Measured full-screen, a Leviathan player is
  **5.5px** across at 1080p, **7.5px** at 1440p and **11.6px** on a 4K TV at native CSS
  pixels — against the **14px** the floor was faking. So on the screen these courts are
  actually played on, the floor was buying almost nothing and charging the collision
  mismatch for it; physical size helps again on top of that, since the same mark on a 65"
  panel is a far bigger thing to the eye than on a 13" laptop. **Do not re-inflate bodies
  on the strength of a laptop screenshot.**
  ⚠️ **The check is the EXCESS over the collider, never the RATIO, and the obvious
  arithmetic version is VACUOUS** — comparing `p.r*s + b.r*s` against `(p.r + b.r)*s` is
  the same expression on both sides and passes on every build, which is what got written
  first. A body must be drawn with a PEN (an outline, a rim, a soft shadow), so the painted
  silhouette is always a few pixels wider than the collider: on a 6px body that is a ratio
  of 1.78 and on a 35px body 1.17, so ratio says nothing. What a pen does and a scale
  cannot is **stay the same number of pixels as the body shrinks** — measured across a 5.6×
  range of `cam.s` the excess is a flat 2.9-4.8px, where the floor added 2.11× the body on
  Leviathan alone. `tests/bigcourt.mjs` measures all three (ball, disc, ring) in rendered
  pixels as a difference against the same frame with the body taken away.
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
- **EVERY RASTER IS AUTHORED AT THE PIXELS IT WILL OCCUPY** (`resize`, `uiScale`,
  `uiCanvas`, `uiFit`, `TILE_CSS`/`PREVIEW_CSS`/`BUNDLE_CSS`, `lobbyBoard`). Reported as
  the font looking blurry — *"a bit of blur to it that is common with AI generated
  content"*, which is a fair description of what a non-integer rescale of text looks like.
  It was **three separate instances of one mistake**, and the DOM text beside all three was
  always perfectly crisp, which is what made it read as the *font* being soft rather than
  the page.
  ⚠️ **THE GAME CANVAS WAS CLAMPED AT 2.5×.** `DPR = Math.min(devicePixelRatio, 2.5)` with
  a `Math.floor` on the product, so on a **3× phone** — every current iPhone and most
  Android flagships — a 390px-wide canvas was rasterised **975** device pixels across and
  stretched by the compositor over **1170**. A 1.200× rescale of everything the game draws,
  and `#game` carried `image-rendering: pixelated`, so it was NEAREST-NEIGHBOUR: some
  columns of a letter duplicated and some not, which is uneven stems rather than even
  softness. Measured on a 24px string at DPR 3, soft (neither ink nor ground) pixels:
  **2,812 against 680** at 1:1, and after the fix **0**.
  ⚠️ **THE CLAMP WAS PROTECTING AGAINST NOTHING, which is the argument for deleting it
  rather than raising it.** `cw × devicePixelRatio` IS the number of physical pixels the
  canvas occupies, by construction — a higher ratio always comes with a proportionally
  smaller CSS viewport (a 4K panel at 3× reports a 1280-wide window) and browser zoom moves
  both together — so the backing store can never exceed the physical display however high
  the ratio goes. There is no runaway for a cap to catch; all it ever did was render below
  native and hand the difference to the compositor. Cost of 2.5 → 3.0 measured on a phone
  at 2v2 and 4v4: render 0.2 → 0.3ms and 0.3 → 0.3ms, rasterised +11% / −8% — inside the
  noise, because the frame is per-object work rather than fill rate.
  ⚠️ **The CSS box is derived FROM the backing, not the other way round.**
  `devicePixelRatio` is often fractional (1.5 and 1.75 are ordinary Windows scalings), so
  `cw * DPR` is not an integer and something has to give; rounding the backing and leaving
  the box at `cw` is the same defect a thousandth of the size. It costs at most half a CSS
  pixel of sliver at the right and bottom edges.
  ⚠️ **`image-rendering` is GONE from `#game`, and it is not the same setting as
  `ctx.imageSmoothingEnabled`.** The in-context one governs how `drawImage` scales the
  textures the game bakes and is what gives the chunky look; the CSS one only ever governed
  backing-store → CSS-box scaling, which is now 1:1 by construction. Left in place it would
  be a trap that turns any future mismatch into the *worse* of the two failure modes.
  ⚠️ **THE WARM-UP BOARD WAS BAKED AT CSS PIXELS**, and that one arrived with the bake
  itself. `lobbyBoard` sizes its offscreen canvas from `screenPt` coordinates — which are
  CSS pixels, because the context they were measured in already carries the DPR transform —
  so the whole keyboard, every shirt and every flag was rasterised at 1× and stretched by
  DPR on the way back in. Same defect from the other direction: there the compositor
  stretched it, here the game does it to itself. `DPR` is in the signature, or dragging a
  window to a monitor with a different ratio keeps a stale low-resolution board for the
  session; and the blit passes an explicit CSS **destination size**, or a three-argument
  `drawImage` paints the bake `DPR` times too large over the pitch.
  ⚠️ **AND EVERY CANVAS IN THE MENU** was minted at a fixed backing size and displayed at
  whatever the stylesheet said, with no reference to `devicePixelRatio` anywhere. Measured
  at DPR 3: the player preview **×1.45**, its header disc **×1.50**, a cosmetic tile
  **×1.875**, a pitch preview **×1.55**, a bundle tile **×1.97**. The cosmetic tiles are
  where the shirt NUMBERS live. `const N=128; // drawn at 2× the display size` was the
  closest anything came to getting it right and it was still 4px short at DPR 2.
  ⚠️ **`uiScale` IS CLAMPED AT 1, so this can only ever ADD resolution.** Most of these are
  authored LARGER than they are shown — a 64px tile in a 40px box — and that over-provision
  is what keeps a desktop sharp; scaling to the display size unconditionally throws it away,
  which is making one machine worse to fix another. At DPR 1 every call is a no-op and the
  bytes are exactly what they were (11.9MB of canvas, against 22.7 at DPR 2 and 43.7 at 3 —
  the honest cost of drawing at the screen's resolution).
  ⚠️ **NOTHING WRITES A STYLE**: the display size stays the stylesheet's business, so the
  backing store is the only thing that moves and no layout can shift — which is what makes
  this safe across a menu whose rendered boxes four suites measure. The `*_CSS` constants
  must match the stylesheet, and if they ever drift the canvas is merely over- or
  under-provisioned, never mislaid.
  ⚠️ **`uiFit` MEASURES, and a hidden element measures ZERO** — the ordinary case, not a
  rare one, because these previews live inside `.subpane`s. `#pvCanvas` stayed at its
  authored 120 for exactly that reason while `#pvMini`, in the always-visible card header,
  was fixed; hence the `cssFallback` argument. It is idempotent because it runs on a redraw
  path, and callers must draw relative to `cv.width` rather than a literal.
  ⚠️ **THE MEASUREMENT MUST BE A SCREENSHOT, NEVER `getImageData`** — the backing store is
  always crisp, and the blur happens in the COMPOSITOR. A probe that reads the canvas back
  sees a perfect image on the broken build. ⚠️ **And the menu has to be hidden first**: on a
  phone-shaped viewport `#setup` is a full-bleed fixed screen OVER the canvas, so the first
  run of that probe measured the MENU and reported every pixel as a soft edge.
  ⚠️ **A NEAREST-NEIGHBOUR UPSCALE IS BLOCKY, NOT SOFT, so a softness metric cannot see it
  — and the first warm-up check was vacuous for exactly that reason.** The board is blitted
  with smoothing off, so a CSS-pixel bake is not blurred, it is quantised: every feature
  becomes a multiple of `DPR` device pixels. Sabotaged, it scored **0.9301** against the
  fixed build's 0.9578 — *better*, because coarser features leave more pixels in the flat
  bands, so it passed the check it existed to fail. What a 3× nearest upscale cannot fake is
  a run of one or two pixels, so the discriminator is the fraction of pixel runs whose
  length is not divisible by the ratio: **0.905 fixed against 0.477 broken**, with the DPR-1
  board (1:1 on every build) as the control at 0.908. `tests/crisp.mjs`.
- **Render:** `render()` → `drawPitch`, `drawBallTrail`, `drawDiscs`, `drawBall` (+ extras), controls.
  Camera in `cam` / `computeCam()` (reserves top headroom for the HUD).
- **Themes:** `THEMES` → `applyTheme(key)` sets CSS custom properties AND the live `TH` canvas palette.
- **YOUR OWN PITCH AND SURROUND COLOURS** (`sel.look.court`, `sel.look.surround`,
  `lookHex`, `courtCol`, `surroundCol`, `paintedPitch`, `buildCourtColours`,
  `syncCourtColours`). Two colour inputs under the palette tiles in Theme → Background.
  ⚠️ **NOT a seventh SLOT, and that is load-bearing.** `SLOT_KEYS` drives the Theme card's
  chips, `bundleSlots` AND `currentBundle` — so a colour slot would give it a tab of its
  own *and* make a bundle's identity depend on it, which means picking a colour would
  silently rename your theme to **Custom**. It lives in `sel.look` beside the slots and is
  not one. `tests/courtcolour.mjs` pins that from both ends.
  ⚠️ **NOT A NEW TAB EITHER.** The card already had *Background — page and pitch colours*
  and *Field — what's painted on the pitch*, so a third "Pitch background" tab would be a
  new door onto a room you are already standing in — the argument that deleted the
  standalone Ball card. What could not be done at all was saying "make the court THIS
  green", so that is what was added, in the tab that already claims the colours.
  ⚠️ **`paintedPitch` RETURNS A COPY, and the reason is a landmine.** `applyTheme` did
  `TH = t.pitch` — a direct reference into the shipped `THEMES` table — so writing an
  override into `TH` would edit the palette ITSELF for the rest of the session: switch away
  and back and your colour is still baked into Grass, with nothing to point at.
  ⚠️ **THE MOW SURVIVES.** Six palettes ship `stripeA === stripeB` on purpose (a metal deck
  and a tactics board have no mown stripes), so the two are re-derived by asking whether
  THIS palette is striped — never by always adding a stripe or always removing one.
  ⚠️ **The marking ink is a FLOOR, not a repaint** — the rule `ballSpotInk` already follows.
  A line that still reads is left exactly as the palette drew it; one that has vanished into
  the chosen colour is swapped for the ink that colour can carry. **2.5 is MEASURED**: the
  worst any shipped palette scores is **2.62** (GameMan's white on sky blue), so no shipped
  court can be repainted by that line — it only ever fires on a choice.
  ⚠️ **Checking that is VACUOUS the obvious way, and a sabotage proved it.** With no colour
  set `paintedPitch` early-returns before the floor is reached, so "no palette is repainted
  with nothing chosen" passes on a build whose threshold repaints everything. The suite sets
  each palette's court to **its own colour** — a no-op choice that still runs the whole path.
  ⚠️ **`--overlay-*` reads `TH.court`, not `t.pitch.court`**: the scorebug and HUD buttons
  float over the court, so their inks must be picked against the colour actually painted.
  ⚠️ **Empty means "the palette's", which is why Reset CLEARS rather than storing the
  palette's current colour** — stored, it would stop following the palette and you could not
  tell why. ⚠️ `lookHex` validates, because the value can arrive from an imported save
  (`applySaveDoc` validates nothing) or a shared settings sheet.
  ⚠️ `buildCourtColours` is reached through an **`extra` hook on the slot**, so the pane loop
  stays one generic builder — and it is wrapped in an arrow (`extra:(pane)=>…`) because
  `SLOTS` is a top-level `const` whose initialiser runs at boot. ⚠️ `syncCourtColours` takes
  the button as an ARGUMENT: the pane is still detached from the document when it runs, so a
  `getElementById` there silently does nothing and shipped a Reset that was live with no
  colours to reset. Render only — `tests/courtcolour.mjs` hashes the world over 900 steps.
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
- **ELEVEN A SIDE IS THE CAP** (`LOBBY.maxPerSide`, 11), asked for. It went 4 → 8 → 11;
  the cap is about what fits on the PITCH, not what fits in the frame budget.
  ⚠️ **IT SETS A FLOOR UNDER TWO TABLES, AND ONE OF THEM HUNG THE GAME.** `shirtNo` was
  `'num' + (n % 10)` and `TEXT_SETS.num` held ten glyphs, so ten distinct shirts existed —
  fine at 8 a side and impossible at 11. `numberTheSides`' `free()` walks upward until it
  finds an unused plate, so once all ten were taken it cycled the same ten **for ever**:
  warm-up was fine and `lobbyStart` never returned. Fixed at both ends — the table runs to
  `１１` (two-digit entries, which is what a shirt actually says, and `fitGlyph` shrinks
  them to the plate), `shirtNo` takes its modulus from the table's own LENGTH, and `free()`
  stops after one full lap so the worst case is two bodies in one shirt rather than a
  lock-up. ⚠️ Written as an explicit ARRAY, not `.split('')` — splitting cuts '１０' into
  two plates.
  ⚠️ **The other floor is `BOT_NAMES`, and the margin is now ONE.** Eleven a side is 22
  bots if nobody human turns up, against a list of **23** (`CLAUDE.md` claimed 33; it was
  wrong). Past that, `pickNames`' `(i*7+3) % 0` is NaN and every overflow bot comes out
  called `Bot1`, because `spawnLobbyBot`'s own fallback never fires on a truthy string. So
  **a name removed from that list breaks a full-size match**; `tests/lobbykb.mjs` fields a
  whole 11v11 and checks 22 distinct names.
  ⚠️ **Three suites pinned the old cap as a literal** (`textplates`' `shirtNo(10)==='num0'`,
  `lobby`'s eight-character `'PPPPPPPP'`, `dropin`'s `<= 8`) and all three are derived from
  `LOBBY.maxPerSide` / `TEXT_SETS.num.chars.length` now — a check that must be edited every
  time the thing it watches changes is one nobody trusts.
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
  ⚠️ **THERE IS NO `DYN_FIELDS.tacticsboard` ANY MORE.** It drew the markings a real pitch
  has and this one never did — penalty areas, six-yard boxes, penalty spots and the D,
  every number a fraction of the field so it held from Futsal to Leviathan. Deleted on
  request: *"remove the goal lines that I have as decoration, they are not needed"*.
  ⚠️ **THEY WERE DECORATION IN THE LITERAL SENSE — nothing in the game reads them.** There
  is no offside, no penalty and no six-yard restart; the one rule that does use a region
  near the goal (`applyGoalBox`) reads the NET POCKET's mirror off `w.bounds`, never these.
  So what they added was four more white rectangles at the two ends of a pitch that already
  draws a goal box there, in the part of the court where the play is busiest.
  ⚠️ **DELETED, NOT LEFT UNLISTED** — the `tennis` call again — and the bundle drops its
  `field` and falls to `none` through `bundleSlots`. ⚠️ **A save that names it is FOLDED**
  (`normalizeLook`): `dynField()` returns null for a key it does not have, so nothing
  breaks, but the Field slot would come up with NO tile selected, which reads to a player
  as their theme being reset. A key that disappears gets a fold, every time.
  ⚠️ What the theme still IS: the palette and `DISC_SKINS.counter`. That is the same shape
  `tennis` has — a palette and a look, with `drawPitch` owning the surface. The suite's
  three markings probes are INVERTED rather than deleted (the same ground must now read as
  plain court) and paired with the touchline still being inked, or "nothing is painted
  there" is equally true of a build that draws no pitch at all.
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
  `faceoff` (shown as **Faceoff Orbit**) = two identical bases at opposite ends of a long
  thin causeway, hung in space. ⚠️ **The name is ours; the map it takes after is not.** It
  was proposed under a real arena shooter's map name, which is somebody else's trademark,
  so the idea was taken and the name was not — the standing rule below, applied at the
  moment it was proposed rather than after it shipped.
  ⚠️ **THE TWO HALVES ARE MIRRORS, and that is the design rather than a nicety** — the map
  this takes after is symmetrical end to end so neither side has anything the other does
  not. Every element is drawn from a `half()` helper called twice with the sign flipped, so
  the two ends cannot drift apart.
  ⚠️ **AND IT IS SPLIT DOWN THE MIDDLE**, asked for directly — and the split is REAL now,
  not painted. See **THE GAP** below: `FIELDS.faceoff` carries a `gap`, the split is two
  solid blocks either side of the halfway line, and the way to the other end is one of the
  two channels down the touchlines. The painter's old seam-and-causeway is kept for the
  no-gap case only (slots mix — this theme can be worn on Classic) and is otherwise gone,
  because it drew the exact opposite of the truth: a lit causeway 30% of the width through
  the MIDDLE, which is now the one place a body cannot go.
  ⚠️ **The rule the seam obeyed still stands and has simply moved house**: a PAINTER may
  never change where a body can go. What changed is that the FIELD now says so, which is a
  different layer — `DYN_FIELDS.faceoff` is a cosmetic slot somebody may swap for Grass,
  and the hole in the middle has to be there either way. Containment was measured over
  4,000 steps with hard kicks (zero escapes, the ball reaching 566 against a 510 half
  length plus a 66 net, which is the goal and not an escape).
  ⚠️ `FIELDS.faceoff` is **long and narrow on purpose** — 340 across a 1020 length. The
  shape is the whole idea: two bases with nowhere to go but at each other. Corners are
  SQUARE, because a rounded end would round off the base platforms drawn into it.
  ⚠️ **THE BUNDLE NAMES ITS PITCH, and that REVERSES the rule that used to be written
  here.** It said a theme may not reach into the Match card and pick the pitch you play on;
  it lost to somebody trying to play the map. `THEME_BUNDLES.faceoff.field` is a
  **`DYN_FIELDS` painter** and `FIELDS.faceoff` is the **court** — two tables, two cards,
  one name — so picking the theme painted the sky and left you on Classic, and it was
  reported as *"I selected the theme and I can't see the correct pitch"*. Same shape as
  `sel.controllers` shipping `off` and Sprint shipping off: a feature nobody can reach is a
  feature that does not exist.
  ⚠️ So a bundle may carry **`pitch`** (a `FIELDS` key, deliberately NOT called `field`,
  because those two meanings sharing one word is the whole of what went wrong), and
  `applyBundle` applies it through `selectField` and **says so with a toast** rather than
  moving it under you. Only this bundle has one — every other look is a treatment that
  works on any rectangle. Silent when you are already on it.
  ⚠️ **`bundleSlots` and `currentBundle` stay SLOTS-ONLY.** The pitch is what a bundle
  DOES, never part of what it IS: folded into the identity, changing your court afterwards
  would silently rename your theme to **Custom**, which is the class of lie `currentBundle`
  is derived rather than stored to avoid. `tests/gapfield.mjs` pins it from both ends.
  ⚠️ **`selectField` is the one place the game chooses a court for you, and clearing the
  sticky shape tab is its whole reason for existing.** `fieldShapeNow()` returns
  `fieldShapeTab` once the player has tapped a shape chip and `buildFieldShapeTabs()`
  honours it — so moving `sel.field` into a different group leaves the row on the old tab
  with the tile just selected hidden by the CSS. Measured: 0px tall before, 94px after.
  The painter is written in FRACTIONS of whatever rectangle it is handed, so on a square
  court it still lays out two bases and a seam — just a chunkier one.
  ⚠️ The planet is placed off the **PITCH** box, never off the oversized region the void is
  painted into: positioned in that region's own fractions it landed at y = 1280 on a 1000px
  canvas — off screen entirely, because the region is three times the pitch each way and
  its lower half is below anything anybody sees.
  ⚠️ **FACEOFF ORBIT'S SKY WAS FROZEN, and it was ONE WORD.** `step` was written
  `step(st, dt)` and the registry's contract is `step(st)` — `advanceDynField()` passes no
  second argument, so `dt` was `undefined`, `st.t` went **NaN** on the very first step, and
  the paint's `const t = st.t || 0` silently rescued NaN back to zero. Forever. The drift and
  the twinkle were already written; the clock simply never left zero. Measured at **0.000%**
  of background pixels changing over 900 steps against 0.06–0.5% for every other animated
  field. ⚠️ **`bambamzone` carried the identical line** and was equally dead. Every other
  field uses an integer step counter, which is the form that cannot be fed the wrong thing.
  ⚠️ **The rates had to be retuned in the same breath.** `ORBIT.drift` was 0.9 "units a
  step" ≈ 54px/second — three and a half orders of magnitude above `voidgrid`'s 0.00022 —
  so unfreezing the clock without retuning swaps a dead sky for a streaking one. Rates are
  fractions per step now, the resolution-independent form the other fields use.
  ⚠️ **THE PITCH CANNOT MOVE**, so the tumble is carried entirely by the void: stars sweep in
  ARCS about the pitch centre, near stars are carried FURTHER and FASTER than far ones, and
  the arcs are SQUASHED vertically (`ORBIT.tilt`) so it reads as going round a sphere rather
  than spinning on a turntable. Stars on the far side dim — without that the paths read as
  ellipses and the whole thing is a flat ring seen at an angle. ONE number, `s.d`, drives the
  radius, the rate and the brightness, which is what makes it read as depth rather than as
  three unrelated effects.
  ⚠️ The planet rides the SAME rotation, further out and lagging, and is drawn **before** the
  deck fill — which is what makes "behind" true rather than merely claimed. Its orbit is in
  PITCH-BOX units, never the oversized void region's fractions (the y = 1280 trap below).
  ⚠️ It is a **lit limb and a terminator**, not the flat radial haze it was: peak luminance
  101 against a void floor of 6. "The moon behind" means you can see it.
  ⚠️ `tests/dyntheme.mjs` **could not catch any of this** because it stepped these two fields
  as `f.step(stB, 1.0)` — **passing a `dt` the real caller never passes**. It tested the
  painter's arithmetic against a call the game does not make.
  `clash` (shown as **Attribute Clash**) = a black screen, a blue BORDER, and the rainbow
  hugging the touchline. Asked for as a specific 8-bit British home computer.
  ⚠️ **THE NAME IS OURS; THE MACHINE IS NOT.** That is a real company's trademark and is
  not named here or anywhere in the file. `gameman` is the precedent — a machine's LOOK
  taken as an idea with a name of our own. What is taken is public technical fact: a
  fifteen-colour palette, an 8×8 attribute grid, and a border you set separately from the
  screen. ⚠️ **The key is `clash`, deliberately generic**, and the shown name describes a
  graphics ARTEFACT rather than a product — so it can be renamed for free, where a key
  cannot (`sel.look`, `THEME_BUNDLES`, the map votes and every saved replay point at it).
  **Do not re-key this to match the name.**
  ⚠️ **THE FIFTEEN COLOURS ARE THE REAL ONES.** Eight hues at two brightnesses with black
  shared: `#d7` is the normal level and `#ff` is BRIGHT. Nothing is a colour somebody
  picked — the machine had these and no others, which is the whole reason it is worth
  building a theme from. ONE JOB EACH (the `tennis` rule): border normal blue, screen black
  PAPER, markings BRIGHT WHITE, teams BRIGHT RED and BRIGHT CYAN — a lightness pair as well
  as a hue one, so protanopia does not flatten them — and the ball BRIGHT YELLOW because
  nothing else claims it. Magenta is the goal pocket; the NORMAL levels are the grid.
  ⚠️ **CELLS ARE SQUARE AND THE COUNT IS NOT.** The machine's screen was 32×24 cells;
  these courts run from Futsal to Leviathan and are nothing like 4:3, so what is held is
  the CELL (`W / 32`) and the rows fall out of the court's height. A fixed 32×24 would
  stretch every cell into a letterbox, which is the one thing an 8×8 grid must not be.
  ⚠️ **WHICH CELLS ARE LIT IS HASHED FROM (slot, generation), never rolled** — a paint must
  give the same picture twice for one step or a paused screen flickers at the refresh rate,
  and `Math.random` is out anyway. The generations are **STAGGERED** so exactly one cell
  turns over every `flip` steps: the whole set changing at once is a disco floor, not
  clash. ⚠️ Held right back (`cellA` 0.20, NORMAL brightness only) — a cell is two thirds
  of a body across, so a bright one is a decoy, which is the Bootleg dot field and the
  Apologies! lane squares written up again. Measured: peak 159 of 765 against the ball's
  510 and a bright team ink's 255+.
  ⚠️ **THE RAINBOW IS FOUR CONCENTRIC STROKES OF THE FIELD'S OWN PATH, WIDEST FIRST.**
  Each is centred on the boundary so only its outer half survives the clip, and the next
  covers the inside of the last — which is what makes the bands come out red-yellow-green-
  cyan reading OUTWARD, and reversing the loop reverses the order. It borrows
  `pooltable.path` rather than copying it, so it follows a rounded or chamfered court for
  free, and it lives entirely outside the play area where it can never be a decoy.
  ⚠️ **IT WAS GOING TO BE THE DIAGONAL FLASH IN A CORNER, AND THAT IS THE `faceoff` PLANET
  TRAP.** Bars placed off the pitch box at one corner are off SCREEN whenever the court
  fills the window, which on a desktop it very nearly does — the same way that planet
  landed at y = 1280 on a 1000px canvas. A rail hugging the boundary is always exactly
  where the boundary is. ⚠️ **Both goal mouths are punched out**, the fence's trick: a band
  across the mouth reads as a barrier in the one place the ball has to go through.
  ⚠️ **The picker tile shows no rainbow, and that is `ammari`'s call, not a bug.** A tile
  paints with `w` null and is clipped to its own box, so the outer half of every stroke —
  the half that survives — falls outside it. Insetting the rail for tiles only would mean
  drawing something the game does not.
  ⚠️ `discs: 'none'`, `ball: 'plain'` and `sfx: 'space'` are all REUSED. A body on this
  machine was a flat two-colour sprite, which is what the standard disc already is once the
  palette has made it bright red or bright cyan on black; and `space` is the closest set in
  the file to one square wave and no mixer. `tests/dyntheme.mjs`.
  `ledge` (shown as **Mirror Ledge**) = a TEAL rooftop hung over a BLUE drop, with the way
  on painted in red: panel seams, red pipe runs down the touchlines, a red chevron aimed
  into each goal, and a night city with its lights a long way down.
  ⚠️ **THE NAME IS OURS TO CHANGE; THE LOOK IT TAKES AFTER IS NOT OURS AT ALL.** The
  palette arrived as a swatch and it is the signature of a real first-person parkour game
  — white city, blue sky, one hot red meaning *this is the way*. The IDEA was taken and
  nothing else: no art, no wordmark, and that game is not named in this file. The standing
  trademark rule, applied when the theme was PROPOSED rather than after it shipped, which
  is the call `faceoff` records.
  ⚠️ **THE KEY IS `ledge`, DELIBERATELY GENERIC, AND THAT IS THE WHOLE MITIGATION.** A key
  is what `sel.look`, `THEME_BUNDLES`, the map votes and every saved replay refer to, so
  re-keying one strands a save and reads to a player as *"my theme was reset"* —
  `normalizeLook()` exists to fold exactly that. A DISPLAY NAME is one string in one table.
  Filing the trademark-adjacent half under the cheap one means the shown name can change
  for free, for ever, with no fold and no migration. **Do not re-key this to match the
  name.**
  ⚠️ **GREEN WAS ASKED TO BE IGNORED**, so the swatch's two greens are gone and the UI's
  `green` slot borrows the cyan — a palette still has to answer for every ink it is asked
  for, which is what Warp does with white.
  ⚠️ **TWO FLOOR TONES — A TEAL COURT IN A BLUE SURROUND — AND IT SHIPPED WHITE FIRST.**
  White concrete is the reference's own colour and is exactly why it had to go: it leaves
  the markings nowhere to be (they were INDIGO, the only ink dark enough to read on it)
  and it made the surround do all the work. Teal takes the ink and gives the WHITE
  markings back, which is what was asked for. ⚠️ The teal is the swatch's `#1ddcf6` taken
  down to about half: at full strength it is luminance 0.62, which puts white markings on
  it at **1.6:1** — under half the 4.5 this file holds every label to. At `#0e7a8c` they
  read 4.9:1. ⚠️ The surround is the swatch's blue `#1a1f7b`, and the BALL is the yellow
  `#ffd800` because it is the one colour nothing else claims — the `tennis` argument, and
  it survives the recolour unchanged.
  ⚠️ **THE PLAYERS ARE THE STANDARD BODIES**, asked for. A block-vs-pipe disc skin shipped
  here for one build and is DELETED rather than left in the registry — the `tennis` call,
  since a withdrawn entry is still a tile in the Players picker offering exactly the thing
  that was rejected. Nothing is lost that a plain body does not already do: it carries the
  team colour AND the shirt number, which is how every unskinned palette (Grass, Neon,
  Flat, Paper, Tennis) tells the sides apart. **The silhouette rule binds a skin that
  EXISTS; it does not require one.**
  ⚠️ **THE RED ON THE ROOF IS ALL LINEWORK, AND THE FILLED VERSION WAS BUILT FIRST AND
  CUT.** A solid wedge into each end came out as a pale pink triangle a third of the half
  deep — too weak to read and too BLOB-like to be safe. Thin strokes cannot be mistaken
  for a body at any strength: a chevron is 2px of ink and a player is thirty across.
  ⚠️ **AND THE GUARD ON IT WAS REPLACED WHEN ITS PREMISE WENT, NOT TUNED TO KEEP PASSING.**
  On the white build the marks had to be the DARK red `#940306` at 0.30, checked as a
  rendered peak far below the team's — because the court was white and team 0 was a filled
  `#ff1701` block. Both halves of that are now false (teal court, standard bodies), and a
  dark red over teal composites to a dull maroon that reads as dirt. So the ink is the hot
  `#ff1701` at 0.60 and `tests/dyntheme.mjs` measures the property that actually makes a
  mark safe: **THICKNESS**. The widest red run must stay far under the chevron's own span
  — 6px against 32 — which a stroke satisfies and a fill cannot (the filled build measures
  32 against 32). Derived from `LEDGE.markW`, so no constant is tuned to a colour or a
  canvas size. ⚠️ A BODY's diameter was tried as the yardstick first and is the wrong one
  at probe scale: `rw` has a `max(1.5, …)` floor and antialiasing adds a pixel either
  side, so in a small test box the line is proportionally far fatter than it renders in a
  match — 0.55 of a body against a real ratio of about 0.25.
  ⚠️ **THE CHEVRON'S TIP IS THE END NEARER THE GOAL, and the first build had it
  backwards** — both pointed into the middle of the pitch, which is the one direction a
  way-on mark is not about. Nothing but a screenshot catches that: the shape, the size,
  the colour and the mirror all measure identically either way round.
  ⚠️ **THE TWO ENDS ARE MIRRORS**, one `half()` called twice with the sign flipped, the
  same construction Faceoff Orbit uses. ⚠️ Nothing decorative reaches the middle — the
  chevrons sit where the goal boxes already are and the pipe runs hug the touchlines (the
  Pontions and Prixels rule).
  ⚠️ **The drop `bleed`s and the roof is punched out of its clip** with the field's own
  path (`pooltable.path`, borrowed not copied), so it follows a rounded or chamfered court
  for free. Both halves run before `drawPitch` lays the markings down, so nothing here can
  cover a line. The suite measures it as a RATIO rather than two pixel counts — the drop
  covers 0.99 of its area and the roof 0.05 of its own, which is "one is a fill and the
  other is linework" in a form that survives any canvas size or line weight.
  ⚠️ `ball: 'plain'` and `trail: 'comet'` are both REUSED. Check the registry before
  adding to it — the withdrawn `seam` ball look was a duplicate of `tennis` nobody noticed
  for a whole build. ⚠️ **No `pitch`**: a rooftop is a treatment that works on any
  rectangle.
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
- **A GLYPH IS CENTRED ON ITS INK, NOT ON THE FONT'S EM BOX** (`fitGlyph`). Reported as the
  shirt number not being in the middle of the disc, and measured as exactly that: taking the
  ink's bounding box as a **difference against the same disc with no faceplate**, every
  entry in `TEXTS` sat **4.5 to 7 pixels LOW** on a 52px disc — 9-13% of the diameter —
  worst case 8.0.
  ⚠️ **`textBaseline: 'middle'` is ~80% of it, and it looks correct.** It centres the FONT's
  em box, and a digit has no descender: its ink is all above the baseline while the em box
  reserves descender space below it, so the em middle lands under the digit. Every glyph in
  the table has this, in its own amount. `measureText().actualBoundingBoxAscent/Descent` is
  the answer and this is the **file's first use of vertical text metrics** — all eleven
  other `measureText` calls read `.width` only.
  ⚠️ The rest was a hardcoded `+ r*0.04` nudge, tuned by eye for one glyph and applied to
  all 48. Centring on the ink box needs no such number: worst offset across the table falls
  from **8.0px to 1.0px**.
  ⚠️ **The `isFinite` guard is not padding.** `TEXTS.blank` is the braille blank `⠀` — a
  real, non-collapsing space that IS the blank avatar — and it produces zero ink, so it is
  the one shipped key whose metrics can come back unusable.
  ⚠️ **ONE painter, and there were two.** The text block was copy-pasted for the bot face,
  `+ r*0.04` and all — the same trap `paintCap`'s own header records. Both branches go
  through `fitGlyph` now, which is also why the fix reaches the picker tiles, the Your
  Player preview, the recents row, the bench and the pitch at once: they are all
  `paintFace` downstream.
  ⚠️ The fit stays **width-only**. A height cap is free now the ink box is measured, but it
  would resize every glyph in the game and the spill was measured — no key's ink reaches
  further after this than before (max 22.8 inside a body of 26).
  ⚠️ **THE MEAN IS THE SHARP INSTRUMENT AND A MAX-ABSOLUTE CHECK IS NOT, which a sabotage
  proved.** The defect is systematic — every glyph low by the same amount — and per-glyph
  rounding is ±0.5, the same size as the smaller of the two causes: putting the nudge back
  moved the worst absolute offset only 1.0 → 1.5 and **passed** a max-only check. Averaged
  over all 47 drawn glyphs the rounding cancels and the bias does not (-0.36 against +0.68).
  `tests/textplates.mjs` keeps both, plus "the glyph is drawn at all" — or "it is centred"
  is satisfied by a build that draws nothing.
- **THE DEFAULT PLAYER IS JUST A NUMBER — no eyes, no hat** (`defaultProfile()`). Asked for
  in those words, and the file had already said so twice without carrying it through to the
  cap: `defaultSel`'s *"a green pitch and numbered players … is what a reset should give you
  back"*, and the note where the first-run continent lineup was deleted for contradicting the
  same thing.
  ⚠️ **THE CAP WAS THE VISIBLE HALF, AND IT HID THE NUMBER.** `paintCap` is centred on the
  faceplate on purpose (a crown over a shirt number), and at a disc's size the ★ simply
  covered the `１` — measured at **231 changed pixels** on a 52px disc against the same disc
  with no cap. Rendered at 6× the default player was a star, not a number.
  ⚠️ **The eyes were never drawn at all**, and that is why the eyes half is honesty rather
  than a visual change: `paintFace` returns in its `TEXTS` branch, so the eyes fallback is
  **unreachable behind any numbered faceplate** — measured at **0** changed pixels. Eyes only
  ever draw when the faceplate is `none`. `eyes:'none'` makes the Eyes picker say None instead
  of highlighting a Googly nobody can see.
  ⚠️ **The old default cap was itself LOCKED.** `CAPS.star` carries `req:{wins:1}`, so a
  brand-new player wore a cap they had not unlocked and `buildCaps` drew that tile as selected
  *and* `🔒 Win 1 match` at once. Both `none` values are free, are the first tile in each
  picker, are skipped by Recents and the Unlocked strip (*"'none' is a reset, not a choice"*),
  and are already what every bot wears.
  ⚠️ **Edit the VALUES, never the shape.** `tests/matchend.mjs` compares a reset profile to
  `defaultProfile()` with a whole-object `JSON.stringify`, so the key set and order are
  load-bearing. All three reset paths read it — `resetSettings`, the `↺ Reset look` button and
  `loadProfile`'s per-field fallbacks — so one edit covers them.
  ⚠️ **A DEVICE STILL WEARING THE OLD PAIR IS MOVED ON, ONCE** (`loadProfile`,
  `magnetball.lookfold`). Changing a factory default only ever reaches a fresh install, so
  without this the person who reported the hat still has it. **Both** `cap === 'star'` and
  `eyes === 'googly'` must match — the pair is the fingerprint of an install nobody has
  touched, and somebody who picked either one alone keeps it.
  ⚠️ **ONE-SHOT, and this is the one place `normalizeLook`'s precedent does NOT transfer.**
  That fold is a pure key rename, so the old key is unreachable afterwards and re-running is
  free. Star-plus-googly stays pickable by hand for ever, so an unguarded fold would silently
  un-pick it the next morning.
  ⚠️ **The old pair is INLINED, and it was a `const` for one build.** `loadProfile()` is called
  from `let profile = loadProfile()` near the top of the file, so a `const` declared beside it
  is in the temporal dead zone at that moment — and the `try/catch` there, which exists for a
  browser that refuses `localStorage`, **swallowed the ReferenceError whole**. The fold simply
  never ran and nothing said so. **Eighteenth TDZ bite in this file, and the first one a catch
  block hid.**
  ⚠️ Bots keep **🤖 in warm-up** (`BOT_FACE`), asked for: numbering runs per team and the
  teams are still forming, so a number shown early is a lie waiting to happen.
- **TWO PEOPLE MAY NOT KICK OFF IN THE SAME SHIRT** (`numberTheSides`). It counted human
  **heads** to reserve the low numbers and never looked at *which* numbers those humans were
  wearing. Every human keeps the number they were minted with and the warm-up lobby exists so
  people can change halves — so three people who all walk onto one side arrive holding
  whatever `startMatch` dealt them. Measured on a 3v3: team 1 kicked off as **num1, num2,
  num1**.
  ⚠️ It reserves the numbers people are **really** wearing, and moves a human only when they
  collide with another human on the same side; the bots then take what is actually left.
  ⚠️ **Only a human wearing a NUMBER is ever moved.** A flag, an animal, a photo or a symbol
  is the thing that player chose — the standing rule is *"a person's faceplate is their own"* —
  and two of those can sit side by side without clashing, because neither claims a number.
  ⚠️ **A lone human's number is untouched, and that is the point.** Your shirt has to read the
  same in warm-up and at kickoff, which is what was asked for, so nothing fires unless a second
  person is genuinely holding the same number. `tests/textplates.mjs` pins both directions.
- **Caps:** one painter, `paintCap()`, centred on the disc and outlined in the opposite ink
  so it reads over a flag or a shirt number. ⚠️ There used to be **two** cap draws — the pitch
  at `-0.48r`/`0.78r` type, the menu preview at `-0.5r`/`0.72r` — so the mark you picked was
  never quite the mark you played with. **Bots wear `BOT_CAP` ('none')**: cycling the whole
  CAPS table put a different hat on every disc and made a cap read as decoration rather than
  as yours. Bots still vary by colour, shirt number and eyes.
- **THE KICKOFF LINE IS STAGGERED, AND THE STAGGER IS DELIBERATELY TINY** (`layTeam`).
  The rule was `depth = i===0 ? 0.30 : 0.55`, which put every body past the first on the
  SAME y: measured on a 4v4 as three of the four standing shoulder to shoulder with the
  fourth alone out on a wing. It alternates between two depths now, so no row holds more
  than two.
  ⚠️ **A FULL 1-2-1 DIAMOND WAS BUILT FIRST AND REVERTED, because it broke the one
  guarantee the AI has.** Spreading the rows over 0.28..0.78 of the half and widening to
  ±136 INVERTED THE DIFFICULTY LADDER inside two bot plans — `tests/botplans.mjs` measured
  Insane finishing **-3** against Rookie under `balanced` and -1 under `press`, over twelve
  matches with the sides swapped, against a baseline minimum of +6. Difficulty is the
  control a player reaches for, so a formation that makes picking Pro matter less than
  picking a shape is not a formation worth having.
  ⚠️ So the x offsets are left EXACTLY as they were and **only the depth moves**, by
  0.03..0.07 of the half — 11-27 world units on Classic — with nothing deeper than the old
  0.55. `layTeam`'s marks are load-bearing for bot balance, not decoration: keep any change
  to them small and re-measure `botplans`.
  ⚠️ **AND IT TURNED `tests/sprint.mjs` RED THROUGH A LEFTOVER GOAL FLASH.** `shake` and
  `flash` are module-level juice decayed in `decayJuice()`, which `loop()` calls and a
  headless probe never does — and `startMatch` does not clear them. So the bot matches in
  that suite's earlier blocks left a full-screen wash in the last scorer's team colour
  still on the canvas, and the sprint gauge was sampled THROUGH it: every one of 900,000
  pixels differed between two builds, the court reading 103,127,75 under a red flash and
  45,143,125 under a blue one. Change anything that alters a bot match — a kickoff mark, a
  bot name — and the last scorer changes with it. **Any suite that samples pixels after a
  bot match must call `juiceReset()`**, which is the one owner of that state.
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
- **A QR CODE OF THE PAGE'S OWN ADDRESS** (`QR`, `qrMatrix`, `qrCanvas`, `shareUrl`,
  `buildShareQr`; About card). Point a phone at it and the game opens.
  ⚠️ **THE ENCODER IS WRITTEN OUT, because the alternative is a dependency.** Every QR
  library is an npm package or a CDN script and a server-rendered image is a network round
  trip on a page that has to work from a file on a disk. Byte mode, EC level M, versions
  1-10 — 213 bytes, which is any URL with a room code on the end of it.
  ⚠️ **IT TAKES A STRING, NOT A LOCATION**, which is the whole point of its shape: About
  passes the page address and the join-a-room screen this is really for will pass a room
  URL, with nothing to change here.
  ⚠️ **`shareUrl()` is origin + pathname, NEVER `location.href`** — that carries whatever
  query and hash this session happens to have, and on a `file://` page it is an absolute
  path on somebody's disk. Off that protocol the card says there is no address to share,
  the `downloadOffline` rule: relabel rather than hide, and never claim what you cannot do.
  ⚠️ **DARK ON WHITE, and it deliberately does not follow the theme** — a QR is not a
  decoration, scanners want a light ground, and a low-contrast palette makes a code that
  will not read. The QUIET ZONE is four modules of white, added at draw time so the matrix
  stays exactly the symbol; without it a scanner cannot find the finder patterns at all.
  ⚠️ **THE FORMAT INFORMATION RUNS DOWN COLUMN 8 AND ALONG ROW 8, and it shipped
  TRANSPOSED — a bug no round trip could ever catch.** `tests/qrcode.mjs` writes its own
  decoder, and the decoder read the format back the same transposed way the encoder wrote
  it, so the two agreed with each other, round-tripped perfectly and disagreed with every
  scanner in the world. Four self-contained checks all passed on that build.
  ⚠️ **What caught it was diffing whole matrices against an INDEPENDENT encoder** (`segno`
  and OpenCV's decoder, from pip — a dev-time cross-check, never a suite dependency), and
  what is kept from that is one complete symbol pinned in the suite. Established and worth
  not repeating: v3, v7, v9 and v10 at exact capacity are byte-identical to `segno`;
  `segno` appends a spurious zero codeword when the stream is already byte-aligned
  (`8 - (length % 8)` yields 8 rather than 0), which the specification does not ask for
  and this encoder does not do, so below capacity the two legitimately differ; the mask is
  chosen by the specification's own penalty rules and agrees with an independent scoring of
  them where `segno` sometimes does not; and over 150 random URLs read back by a real
  decoder this encoder failed 4 against `segno`'s 5 — the detector's limit, not either
  encoder's.
  ⚠️ The fixture is pinned at a string of v3's **exact byte capacity**, because that is
  where the padding disagreement cannot arise. `tests/qrcode.mjs`.
- **`<b>` IN THE CHANGELOG IS RENDERED, and for a long time it was PRINTED**
  (`releaseBlock`). Every `CHANGELOG` entry leads with a bold sentence and the list item
  was built with `textContent`, so what a player read was `<b>On the biggest pitches…</b>`
  with the tags in it, on every release since the card existed. Fixed by parsing the ONE
  tag rather than reaching for `innerHTML`: the text is a literal in this file today, the
  same renderer draws the update modal, and a splitter that knows about `<b>` and nothing
  else cannot grow a hole.
- **Add to home screen:** `#installBtn` appears only while `beforeinstallprompt` is
  live and hides on `appinstalled` or in standalone. ⚠️ The prompt cannot be asked for —
  it arrives once, as an event — so an always-on button is dead on iOS and after install,
  and a dead button in a menu is worse than no button.
- **THE APP ICON IS JUST A COURT** (`icon.svg` — the favicon, the apple-touch-icon and the
  manifest icon, and the only logo IMAGE the project has; the `.logo` on screen is a text
  wordmark). It carried two player discs and a ball as well, which at the size an icon is
  actually seen — 48px in a tab, 64px on a home screen — was three coloured dots sitting on
  the markings rather than three things anybody could make out.
  ⚠️ **AND IT NOW FITS THE MASKABLE SAFE ZONE, which it did not.** `manifest.json` declares
  the icon `"purpose": "any maskable"`, which lets a launcher crop it to a CIRCLE of 80%
  diameter — radius 204.8 of 512 about the centre. The old drawing put the court's corners
  **252** out and the ends of the goals **213**, so on a round mask the pitch lost its
  corners and both goals lost their ends. Nothing would ever have said so: you only see it
  on a launcher that crops, which is not the one anybody is looking at while drawing it.
  The furthest marking is 196 now.
  ⚠️ **Only the CONTENT is held to the safe zone — the background is meant to fill the whole
  square**, because that is what gives a crop something to show. Measuring "every pixel the
  icon drew" instead reports 122,557 outside on a perfectly good icon, which is what the
  first run of `tests/icon.mjs` did.
  ⚠️ **A player is a filled DISC and a goal is a thin STROKE, so a pixel count cannot tell
  them apart** — the two goals' strokes come to about the same area as the two discs did.
  What separates them is the longest unbroken RUN of team colour down a column: 30 for a
  goal, 68 for a disc. ⚠️ Bumping `CACHE` in `sw.js` is REQUIRED for an icon change and not
  tidying: the worker is network-first for HTML and **cache-first for everything else**, so
  an existing install keeps the old icon until the cache is evicted.
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
  ⚠️ **THE RING IS THE REACH, and "a TELL, not the reach" is WITHDRAWN.** It was a tell
  drawn well inside the real range (`p.r + ball.r + PLAYER.kickRange`, 2.6r), with the
  dial moving the DRAWING only and `tests/gamesave.mjs` proving the world bit-identical at
  either end of it — a guarantee that existed because the ring was decoration.
  ⚠️ Reported as the ring not showing where you can actually kick, and the measurement is
  the report: the ring sat at **30** world units while the kick condition was
  `dist < p.r + b.r + 14` = **39**, so a ball resting against the OUTSIDE of the ring was
  40 away and did not connect. Out by one unit — the kind of near-miss that makes an
  indicator feel broken rather than tight. A decoration that disagrees with the physics is
  the thing being complained about, so the decoration stopped being one.
  ⚠️ `kickRangeUnits()` is the one place that turns the dial into a world-unit reach, and
  the ring is drawn at exactly `p.r * kickRingMul()` — so a ball touching the ring is a
  ball within reach, by construction rather than by two numbers agreeing.
  ⚠️ **`KICKRING.def` is 195**, so a fresh install's reach is what it has always been to
  within a quarter of a unit: `15 × 1.95 = 29.25` plus the ball's radius is 39.25 against
  the 39 the physics used before. ⚠️ It is on the slider's own **step of 5**: 193 gives the
  old reach exactly and is not a value the control can select, so the dial would have
  jumped the moment anybody touched it. `max`
  is **200**, the size the ring was drawn at, asked for as "never bigger than it is now" —
  and now that the ring is the reach, that cap is also what stops the dial being a way to
  give yourself a longer leg.
  ⚠️ **NO CASING on this ring** — asked for as "just keep it a white ring". The dark stroke
  either side was there to make it read on an unknown pitch, and `kickRingInk` already
  answers that better by picking the ring's own colour against the court. Two answers to
  one problem, and the casing was the one that made a white ring look outlined.
  ⚠️ `tests/gamesave.mjs` now asserts the OPPOSITE of what it used to: that the dial moves
  the world, and that a ball touching the ring is within reach at **every** dial value.
  ⚠️ **Its probe holds KICK for twenty steps, not one.** A trap needs `TAP_HOLD` seconds of
  holding, so a single step measures the hold timer rather than the reach and reports no
  kick at any distance; and positions are re-pinned every step, because `integrate` moves
  both bodies out of the band being tested. ⚠️ It detects the TRAP flags and never "the
  ball moved": at the smallest dial the reach is zero, so the ball rests against the
  player's body and the ordinary disc collision shoves it, which a velocity test scores as
  a kick and reported the reach 2.25 units LONGER than the ring.
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
- **THE BOT NAMES ARE THE OWNER'S LIST, SUPPLIED VERBATIM** (`BOT_NAMES`, `pickNames`) —
  `Mike vape air fire light like crum skele dusa salt bolt jake showy viola moon sun sky
  rave bear cat dog trash boots`. It replaced a set of park-football nicknames wholesale.
  ⚠️ **`Nipper` IS BANNED OUTRIGHT**, asked for in those words, so it must not come back in
  any future edit to this table.
  ⚠️ **The casing is theirs**: lower case reads as a nickname, the pitch nameplate
  upper-cases everything anyway, and the only place it shows as typed is the result table.
  ⚠️ **`showmar` came in seven characters and ships as `showy`**, on the owner's call —
  the six-character rule below, measured: `showmar` is **51px** against a 43px column.
  `show` was the obvious trim and is REFUSED, because it is a key in `STRINGS` and a bot
  called that would be TRANSLATED out from under itself. Every other entry fits untouched.
  ⚠️ **The old list's reasoning still binds anything that replaces this one**, and is kept
  because it is what the constraints below are FOR. The set before the nicknames was
  `Nico Vega Blaze Kai Rush Zed Milo Ivy Rex Juno Ace Fox Neo Sol Wren Dex Pip Rio Sy Bolt
  Onyx Ash Koda Lex`, and measured: **22 of 24 were 3-4 letters**, **29% contained x or z**
  against about 2% in real names, five ended -ex/-ox/-yx, and twelve were the same "short
  cool codename" idea. Nothing in it was ORDINARY, which is the giveaway. The lengths must
  stay **RAGGED** — eight identical stubs down the pitch is half of what reads as
  generated. ⚠️ `tests/lang.mjs` measures the raggedness as a **SPREAD plus a count of
  distinct lengths** rather than "at least four different lengths": a supplied list is
  whatever the owner typed, and a suite that dictates its shape is a suite refusing the
  owner's answer.
  ⚠️ **AT LEAST 16 ENTRIES, a hard floor rather than taste.** `LOBBY.maxPerSide` is 8, so
  sixteen bots can be on the pitch; `pickNames` filters the pool by a `used` Set and when it
  EMPTIES, `(i*7+3) % 0` is NaN, the splice yields undefined, and every overflow bot comes
  out called **`Bot1`** — `spawnLobbyBot`'s own `|| 'Bot'+(seat+1)` never fires, because
  `'Bot1'` is already truthy. 33 gives headroom.
  ⚠️ **NOTHING HERE MAY BE A KEY IN `STRINGS`**, and this caught TWO on the way in:
  **`Rookie`** (a difficulty tier) and **`Skip`** (the replay button). `renderMatchStats`
  writes the result-screen name with `textContent` but is not `noI18n`-marked, so either
  would have been *translated* on every non-English device. `tests/lang.mjs` names the trap.
  ⚠️ **SIX CHARACTERS, and the RESULT SCREEN sets that, not the pitch.** The nameplate is
  comfortable at seven — the crowded case draws no plate at all, since `labelBallFade` and
  `LABEL_MIN` hide any name within ~141 world units of the ball — but the per-team table's
  name column is **43px** on a 360px phone and `Stopper` needed 47, so it ellipsised and
  `tests/matchstats.mjs` caught it. `Stopper`/`Skipper`/`Stretch` became
  `Hoofer`/`Chief`/`Lanky`.
  ⚠️ **Never `You` or `Player`** — the name book refuses both as "a made-up name is never
  recorded", and `isHero` would crown a same-named team-0 bot as "You" on the result screen.
  ⚠️ **No rhyme clusters.** Rex/Dex/Lex is what gave the codename list away.
  ⚠️ **Generic nicknames only, never a real footballer's** — `Nobby` was drafted
  and dropped for exactly that, the standing trademark rule applied to people.
  ⚠️ `pickNames` is unchanged and **must stay RNG-free**: it is reachable from inside
  `step()` via `stepLobbyBots` and `evenUpSides`, and is safe only because it indexes
  arithmetically. `tests/lobbykb.mjs` pins that by running one lobby twice on a seed.
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
  ⚠️ **AND NEVER INTO AN EXPORTED VIDEO** (`replay.filming`). `captureStream` films the
  canvas, so anything drawn there is baked into the file for ever — "▶ REPLAY / TAP TO
  SKIP" across a clip you are about to send someone, telling them to press a screen that
  is not there. ⚠️ **It is deliberately NOT folded into `controls`**, which answers a
  different question ("did you choose to watch this"): a goal clip filmed from the result
  screen is a replay nobody chose to watch and must still come out clean, so one flag
  cannot carry both. ⚠️ Set in **`recordAndShareClip` only**, which is the one place all
  three exports go through — Save clip, Save match clip and the transport's Video button —
  because three call sites is three copies of one thought and the one that got missed
  would ship a video with the caption written across it. ⚠️ In a **`finally`**: `play()`
  can throw or be aborted, and a flag left set silently strips the caption from every live
  goal replay for the rest of the session, which is a quieter bug than the one being
  fixed. ⚠️ It wraps only the RECORDED playback — the no-recorder path plays on screen and
  keeps its caption. `tests/replayfile.mjs` holds all three: the painter obeys the flag,
  something actually raises it, and it comes down on a throw. Sabotage any one and only
  that one's check goes red.
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
  - **A RECONNECTING PLAYER SWAPS STRAIGHT BACK IN, MID-PLAY** (`_subBack`, `subSwapNow`,
    `subBackTeam`, `subSwapOut`). Unplugging benches the body with its name, its shirt and
    its stats and `evenUpSides` puts a filler bot in the empty place — and coming back, the
    player was handed their own body as if they were a stranger (*"START = JOIN HOME"*) and
    then made to wait for a goal. That is a long time out of a match you were already
    playing, for a cable somebody kicked. ⚠️ **Still a PRESS**: a pad waking up in a bag
    must not walk a stranger into the play, and the person coming back may not be ready the
    instant the plug goes in. The prompt says **`START = TAKE OVER`** and names the bot
    wearing their shirt. ⚠️ **The arithmetic is `evenUpSides`', not `subSwapNow`'s** — all
    it does is put the person back on their side and restore `_subPerWas`, the size the
    match was at *before* they left; the one owner of "both sides field the same number"
    then works out whether that means dropping a filler bot from this side (the match was
    at its kickoff floor) or adding one to the other side (the match had shrunk). Two
    branches here would be a second implementation of the thing that exists to stop a 4v3.
    ⚠️ `_subPerWas` has to be read in `dropOut` **before** the decrement, because which of
    those two happened is exactly what the number that moved records. ⚠️ **`subSwapOut` is
    one owner for "which bot comes off this side"** — `evenUpSides` acts on it and
    `drawSubPrompts` names it, so the shirt somebody is told they are taking is the shirt
    they get. ⚠️ It walks in through the gate and is `bodyStaged` the whole way, so it can
    neither collide nor touch the ball until it has arrived — which is what makes a
    mid-play substitution fair.
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
  ⚠️ **THE GAUGE IS THE WIND-UP RING'S COLOUR, and it used to be a second circle.**
  Asked for as "how do I make this visible while keeping the design minimalistic", and the
  measurement is the answer: the old arc sat just outside the guide ring under a
  full-circle background track at 0.16 alpha, and on a phone it lit **118 of 120** probe
  angles at HALF stamina and **119** when spent. Half and empty were the same shape,
  because the track is always complete and swamped a 1.7px arc whose LENGTH was the only
  information. On a desktop body the two read 72 and 66 — indistinguishable at every size.
  ⚠️ **AND THIS FILE'S OWN SUITE HID IT.** `tests/sprint.mjs` raised its diff threshold
  from 30 to 90 with a comment calling the track a measurement artefact, which made
  `isAnArcNotACircle` — a check whose message reads *"a progress bar that is always a full
  ring shows no progress"* — go green again. The check was tuned until it stopped seeing
  precisely the thing it names. **A threshold raised to make a check pass is a defect
  report, not a fix.**
  ⚠️ So there is ONE ring: white for the stamina you still have, `RING.spent` for what you
  have used, growing clockwise from twelve. Measured on a phone it now reads 0 red at full,
  **61 of 120** at half drained and **118** when spent — 57 angles between half and empty
  where there used to be six.
  ⚠️ **IT STAYS A COMPLETE CIRCLE, which is not a stylistic call.** The radius is the kick
  REACH, so a ring with a piece missing is a lie about where you can kick — which is why
  the gauge is carried by COLOUR and not by arc length. That also keeps `tests/tells.mjs`'
  "full circle, never a sweep" intact, the check that records the rejected loading-bar
  version.
  ⚠️ **Nothing at all above `SPRINT.show` (0.6)**, so ordinary play is the plain white ring
  exactly as before: the red grows from zero at the threshold rather than appearing at 40%
  of the circle. "Minimal" here is absence, not smallness.
  ⚠️ **Two rules, meeting continuously at empty.** Draining, the red is
  `(show − stam) / show`; LOCKED OUT it is `1 − stam`, so it shrinks back as the ring
  refills and you can watch yourself become able to sprint again. `spent` does not clear
  until stamina is full, which is why the second rule cannot be the first read backwards.
  ⚠️ **The ring shows while spent even with KICK RELEASED.** Folding the gauge into a
  hold-only ring would mean never seeing it refill, and being locked out is exactly when
  you need to know. `tests/sprint.mjs` pins that from both ends.
  ⚠️ White-against-red also beats the old green-against-red for a colour-blind player, and
  it sidesteps the contrast problem that recolouring was reverted for: `TH.good` is
  **1.29:1** on grass, and nothing here is drawn in it any more.
  ⚠️ **`ringLayout` collapsed and `ringCasing()` is gone**, with `RING.stamW`, `stamMin`,
  `inset`, `gap`, `gapR`, `case` and `caseA`. Every one of them existed to fit a SECOND
  cased band beside the first around a body that is 9.8px on a phone. The whole
  two-rings-must-not-touch class of bug stops existing rather than being negotiated.
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
- **EACH HALF IS FRAMED IN THE COLOUR THAT HALF PICKED**, and it read
  `team === 0 ? T.teamRed : T.teamBlue` — the THEME's inks. A side that chose GREEN off the
  swatches was outlined in red with its head count printed in red while its shirts were
  green: two answers to "whose half is this". `drawGoal` already reads `teamColOf` for
  exactly this reason; the lobby's own outline was the one place left that did not. ONE
  `col` drives both the outline and the "1 PLAYER" count, so they cannot disagree either.
  ⚠️ **CHECKING IT IS VACUOUS TWO DIFFERENT WAYS, and both sabotages PASSED before the
  probe was right.** (a) Scanning the edge band for "the pixel furthest from grass" finds
  the pitch's own WHITE TOUCHLINE, which is further from grass than any tinted stroke, so
  it returns the same white pixel whatever colour the outline is — measure it as a
  DIFFERENCE against the same frame with the block stood down (one human), where the
  pixels that change ARE the outline by construction. (b) **Team 0 is the BOTTOM half**
  (`sign = +1` owns world +y, which upright is screen-down), so probing the top edge
  measures team 1 — whose colour is blue in both builds, since the theme's `teamBlue` and
  the palette's blue are both blue, and the comparison never engages.
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
  ⚠️ **FOUR ACROSS AND TWO DEEP PER SIDE, with a real gap between the sides**
  (`LOBBYKB.swCols`, `LOBBYKB.swSplit`). Eight in a line, laid end to end with the other
  team's eight, reads as **one strip of sixteen** — reported from a cabinet, where nothing
  on screen said which half of that strip was whose. Two blocks is a shape you see before
  you count anything, and it halves the across-span (275 units a side down to 135), which
  the camera gets back. ⚠️ The second row stacks **away** from the pitch: the row nearest
  the touchline is the one you reach first, and overflowing inward would put swatches
  between a player and the line they walk over to pick a side.
  ⚠️ **Difficulty is a ROW under the keyboard, numbered 1..7** and standing off it by
  `LOBBYKB.diffGap` — which was `gap*2` = 10 world units, rendering as a **5-7px** gap, so
  the row read as the keyboard's fourth row rather than as a separate control. Measured
  cost of the separation: **≈0.9% of pitch scale per 10 units** in portrait and **1.3%** in
  deck view, because `computeCam` frames the whole block. 30 buys a 23px gap for −2.6% of
  the pitch. The `−` stepper plate hangs off `blockBot` and moves with the row.
  The picked tier is named once below it. A column out to one side lands exactly where the head count
  behind that goal is drawn; and six letters shrunk to a body-wide pad is a smudge.
  ⚠️ **The head count is INSIDE THE NET**, one line — beyond it is where the keyboard
  starts when the pitch is flat.
- **HALF THE PITCH WAS FILLED WITH THE SURROUND COLOUR AT 0.86, EVERY WARM-UP FRAME, AND
  IT WAS ONE MISSING `beginPath()`.** Reported as *"one side of the field is dimmed and
  makes it hard to look at"*. `roundRectPath` only **appends** — the rule already written
  against `drawLobby`'s prompt plates, three entries up — so the headline plate's `fill()`
  was filling the plate AND whatever path was left over earlier in the function, which is
  the last half-rectangle the team-sides block draws.
  ⚠️ **It survived a rewrite of that block from a fill to an outline**, because the leak is
  the leftover PATH and not what the block did with it. That is why the fix is at the
  headline and not at the thing that looked guilty.
  ⚠️ **Measured as MIRRORED SAMPLES against the bare pitch, and the control is what makes
  it a measurement.** A bare pitch does not mirror perfectly — the goal boxes and the mown
  stripes put it at 29 of 765 — so a fixed threshold is either vacuous or impossible. The
  same probe with the team-sides block standing down is the control, taken in the same run
  at the same camera: **147 against 29** with the bug, 29 against 29 without it.
- **EACH HALF IS OUTLINED IN ITS COLOUR, NOT WASHED OVER WITH IT** — and this is a separate
  change from the leak above, made in the same pass. The block filled each half with
  `rgba(col, 0.10 + 0.06*n)`, a translucent sheet over the part of the screen everybody is
  looking at, and the two halves got **different amounts** because the alpha rose with how
  many people were on that side. An outline says the same two things — which colour a half
  is, and how firmly it has been claimed (the line thickens and firms up with `n`) — and
  covers nothing. It also doubles as the frame round the court that was asked for in the
  same breath.
  ⚠️ Drawn INSET, by clipping to the half and stroking at double width, so the line lands
  inside the half rather than straddling the touchline where it would fight the keyboard
  and the strips.
  ⚠️ **The two borders are deliberately NOT equally loud**, so a check that looks for a
  fixed red-vs-blue hue finds the claimed half and misses the quiet one — 126 against 13.
  What has to be true of both is that the edge differs from the grass it is drawn over.
- **A FLAG BLOCK BESIDE EACH HALF, and walking onto a side wears that side's country**
  ⚠️ **A COUNTRY CARRIES A COLOUR** (`NATION_COLS`, `nationCol`), so picking one dresses
  the side in it. A flag used to change only the FACES, which left a side wearing Brazil's
  flag in purple shirts inside a purple frame — the country and the kit disagreeing about
  who you are. Stored as **palette KEYS**, never hexes: `TEAM_COLS` owns the eight colours,
  and a second copy here is a second place for them to drift.
  ⚠️ **THE PRIMARY IS WHAT THE NATION IS KNOWN BY, not the nearest colour numerically.**
  Snapping each kit to its nearest `TEAM_COLS` entry in CIELAB puts **Mexico on TEAL** —
  its #006847 measures closer to teal than to green — which is plainly wrong for a side
  everyone knows plays in green. The numbers are the tie-break, not the answer.
  ⚠️ **THE SECOND ENTRY IS A FALLBACK CHOSEN FOR COLOUR-BLIND SEPARATION**, not for looking
  national. The numerically-nearest spare hands out exactly the pairs that collapse: red →
  orange is **ΔE 6.2 under tritanopia** and blue → purple **6.5 under deuteranopia**. Every
  fallback clears ΔE 23 in the worst of the three types and most clear 73, the margin the
  shipped red-vs-blue pair has; several are honest too (Brazil's other colour is green, the
  Netherlands' change kit is blue).
  ⚠️ **IT GIVES WAY TO A COUNTRY, NEVER TO A DEFAULT, and getting that wrong made FRANCE
  PLAY IN RED.** The first version avoided whatever the other side wore — but side 1 starts
  on the default blue it never chose, so France, the USA and Argentina all found blue
  "taken" and fell back to red on the very first pick. A colour nobody selected has no
  claim, so the fallback is consulted only when the other side has a country of its own;
  otherwise `setTeamCol`'s existing swap moves the default side, which lands the pair on
  red-and-blue either way round and costs nothing. ⚠️ `none` is absent from the table:
  taking a flag off is not a request to be recoloured.
  ⚠️ **TWELVE COUNTRIES, and the four that were added are the highest-ranked ones that
  were MISSING.** Asked for as "another column, from the FIFA top 20": flat the block is
  four along and wraps outward, so twelve is exactly one column more than eight. The seven
  already there are all top-20 sides; **Spain, Portugal, the Netherlands and Belgium** are
  the next four down that were not, and all four have sat in the top ten for years — which
  matters, because a ranking moves and a hard-coded list does not.
  ⚠️ **MEASURED: free on a phone, −3.5% of pitch scale turned** (cam.s 0.4637 → 0.4476).
  Flat the column grows AWAY from the court on an edge that was not the worst side, so
  `computeCam` charges nothing for it; turned the block sits above the pitch and depth
  there is the expensive direction. Re-measure before adding a fourth column.
  ⚠️ **EACH SUB-BLOCK IS NOW AS DEEP AS ITS OWN LIST, and it used to be `TEAM_COLS.length`
  for BOTH.** That held only while the two lists were the same length: the moment the flags
  grew past the shirts they wrapped onto a row the arithmetic did not know about, and
  turned, the second flag row landed at `outV + 36` while the shirts sat at `outV + 42` —
  a 30-unit tile spanning 36..66, so the countries were drawn straight through the shirts.
  Sabotage-verified: putting the shared depth back reports **8 overlapping pads** in the
  turned and deck layouts. Same collision class the difficulty row records below, and no
  count or bounds check can see it — only a pad-vs-pad overlap check in four layouts.
  ⚠️ `tests/lobbydress.mjs`' pad counts are **derived from the list lengths**, never
  literals: they read `count === 16` and went red the moment the list grew, which is a
  check that has to be edited every time the thing it watches changes.
  (`LOBBY_FLAGS`, `sel.teamFlag`, `teamFlagOf`, `setTeamFlag`, `p._ownFlag`). Eight pads in
  the same 4×2 shape the colours use, drawn from the top of `CUP_TEAMS` — a curated list
  whose keys are all verified to exist in `FLAGS`, because a missing one draws a grey
  square that looks like a rendering bug and is really a country nobody can identify.
  ⚠️ **`none` LEADS THE BLOCK and is not a country** — a reset is not a choice, the rule the
  Cap and Eyes pickers already follow, and without it a flag picked by mistake could not be
  taken off.
  ⚠️ **THIS IS THE ONE PLACE "a person's faceplate is their own" BENDS**, and it bends
  because somebody deliberately chose a flag for that half. It is a lobby choice about a
  SIDE, not the game overriding you. `numberTheSides` still never touches a human's plate.
  ⚠️ **A STAMPED BODY REMEMBERS THE FACE IT CAME WITH (`p._ownFlag`), and without that the
  feature is one-way.** "A side with no flag leaves every plate alone" was the first rule
  here and it is not enough: a player who walks out of Brazil's half into the flagless one
  keeps wearing Brazil for ever. Measured exactly that way — team 1 read `brazil` with
  `teamFlagOf(1)` null. It is also what makes `none` work, so there is no second mechanism
  for taking a flag off; a first attempt had a separate `restoreOwnFaces` walking the
  roster, which is a second place to keep in step with the rule right beside it.
  ⚠️ **BOTH SIDES MAY WEAR THE SAME COUNTRY, unlike the colours.** Two teams in one shade is
  unreadable and `setTeamCol` swaps to prevent it; two teams under one flag are still told
  apart by the shirt, which is what colour is for. Refusing would be a control that
  silently does nothing.
- **THE FLAGS SIT DIRECTLY UNDER THAT SIDE'S SHIRTS, and the opposite-edge version was
  REVERTED.** They shipped for one build on the far edge from the colours — cheaper to
  frame, and wrong: the two are one question ("what does this side wear"), and putting them
  at opposite ends of the screen made the second one hard to find at all. Reported as *"I
  don't see the countries"*.
  ⚠️ **WHAT MADE THAT AFFORDABLE IS THE BLOCK CHANGING SHAPE WITH THE EDGE IT IS ON.**
  Stacking a 4×2 flag block beyond a 4×2 colour block cost **21% of pitch scale** turned,
  because `computeCam` centres the COURT and then frames the worst side, so every unit
  piled onto one edge is charged twice — and above the pitch, DEPTH is the expensive
  direction. Turned, each team's block is therefore ONE ROW of eight with the flags as a
  second row under it: two rows deep instead of four, and the whole thing costs 0.537 →
  0.517. Flat, the block is a column beside the pitch, so it stays four down and two across
  with the flags continuing DOWN it, where there is room.
  ⚠️ **`v` IS THE SCREEN-DOWN AXIS IN BOTH ORIENTATIONS** (that is what the u/v frame is
  for), so "the flags are under the shirts" is one claim with two implementations: beside
  the pitch it means further ALONG, and above the pitch it means a SMALLER `out`, because
  `out` counts away from the court and the court is below.
  ⚠️ **TURNED, EACH BLOCK IS CENTRED OVER ITS OWN HALF**, not huddled either side of the
  middle: the halves are left and right there, so a team's dressing controls belong above
  the half they dress, which puts the two blocks out toward the corners where nothing else
  is and where "that lot is mine" needs no explaining.
  ⚠️ **THE DIFFICULTY ROW IS ABOVE THE PITCH NOW, not under the keyboard.** It stood off the
  keys by 30 units and was still read as the keyboard's fourth row, because anything under
  QWERTY is part of the board to somebody walking the board. The far end, beyond the net you
  are not walking through, is the one large empty area in the layout.
  ⚠️ **Turned, it has to clear the colour rows** — both were placed off `down` and both
  landed at −284, so the numbers were drawn straight through the shirts. The colours stay
  nearest the pitch because they are per-half; the difficulty row is match-wide, so it is
  the one that moves out.
  ⚠️ **And its caption moved with it.** "BOT SKILL · NORMAL" was drawn BELOW its row, which
  above the pitch is the gap between the row and the net — exactly where the head count is
  printed. On a phone the caption came out through the middle of "1 PLAYER".
  ⚠️ **What all of this costs is real and was measured**: pitch scale 0.489 → 0.470 flat and
  0.717 → 0.708 turned for the edge split alone, and 0.435 / 0.597 once the keyboard is a
  quarter bigger (`keyW` 30 → 38) with a real gap to the pitch (`clear` **0.8 → 34** — it
  was within a pixel of the net) and to the shirts (`side` 20 → 34). Every unit of furniture
  beside the pitch is taken off the pitch; that is the trade this batch bought deliberately.
- **YOU CAN STAND ON START AND PRESS IT** (`k.start`). Every other control in this room is a
  pad you walk onto — the letters, the shirts, the flags, the difficulty, the team size —
  and the one button the lobby exists to get you past was the exception: a gamepad button,
  an Enter key, or a DOM button needing a finger or a mouse. On a cabinet with a stick and
  no keyboard that is a room you can decorate and not leave. Below DEL and SPACE with a
  row's gap, as wide as both together, and KICK is still the press — so brushing it on the
  way past does nothing, which is what makes putting it in the walking area safe.
  ⚠️ Straight to `lobbyStart`, the same path the pad button, the on-screen button and the
  idle clock all take — never a second copy of what starting a match means.
- **THE FIVE-SECOND HOLD TAKES ANY BUTTON, AND THE TAP CANNOT** (`padAnyHeld`,
  `ANY_NEVER`, `pollLobbyStart`). Reported as *"some of my controllers don't have start
  button"*, and measured on the shipped build: of **seventeen button indices, exactly ONE
  (9) did anything at all in this room.** A pad with no Start could not ready up, could
  not kick off as host, and could not force the kickoff either.
  ⚠️ **THE TAP IS THE COLLISION, and it is not fixable.** In warm-up the ball is LIVE and
  KICK is *every* button (`padKickHeld`) — that is the whole point of the room — so "any
  button starts the match" is the exact defect recorded two entries down, where A was
  bound to both jobs and did the wrong one. The tap stays START-only, and
  `tests/lobbyhold.mjs` pins that a tap of button 0 does **not** start.
  ⚠️ **THE HOLD HAS NO SUCH CONFLICT**: nothing else in the game is a five-second hold, and
  it is already SEEN — `startHoldFrac` fills a ring on the body and on that pad's corner
  icon — so somebody leaning on KICK to sprint watches it fill and lets go. That readout is
  what makes widening it safe, and it is why the answer is a hold rather than a second
  button nobody's pad has either.
  ⚠️ **`padAnyHeld` IS DELIBERATELY NOT `padKickHeld`**, on two counts. It ignores
  `sel.pad.kick` — binding a kick button is a statement about SHOOTING and must not take
  the kickoff away — and Start and Select ARE in its set, because `KICK_NEVER` holds those
  back for meanings that here are the point.
  ⚠️ **The D-pad is the one exclusion, and it is what "any button" honestly means on a pad
  you walk with**: a direction is a button as far as the Gamepad API is concerned, so
  counting it makes every step you take a request to kick off.
  ⚠️ **The keyboard seat is NOT widened**: every keyboard has an Enter, so there is no
  hardware to rescue, and WASD is held for seconds at a time while you walk a Leviathan
  lobby — the same accident the D-pad is excluded for.
  ⚠️ **THE CHECK READS `startHold`, NEVER `w.state`, and the state version scored a FALSE
  POSITIVE that was seen.** Holding D-pad RIGHT walks the body, and everybody walking into
  a goal is a *different, legitimate* way to start the match — so button 15 read
  "HOLD-STARTS" on the fixed build **and** on the sabotaged one with the hold back on START
  only. A probe watching the state cannot tell the two mechanisms apart.
  ⚠️ **`w.lobby.ready` IS WRITTEN AND READ BY NOTHING** — found while measuring this, not
  fixed here. So a non-host's tap toggles a Set nobody consults and nothing draws: the
  `kickTeam` shape, still open.
- **ANYBODY CAN FORCE THE KICKOFF BY HOLDING START FOR FIVE SECONDS** (`LOBBY.holdStart`,
  `p.startHold`/`p.startArm`, `startHoldFrac`, `padHoldFrac`). Only the host's press started
  a match, so a room where player one had wandered off, put their pad down or was still
  picking a shirt had no way out but the 30-second idle clock or somebody reaching for a
  mouse.
  ⚠️ **ONE BUTTON, TWO MEANINGS, and the tap is the one that must not change.** A TAP still
  toggles ready exactly as it did; a HOLD is "we are going". Five seconds is far longer than
  anybody presses a button by accident, which is the whole safeguard — and it is what makes
  the two meanings safe to put on one button.
  ⚠️ **COUNTED IN THE STEP LOOP.** `pollLobbyStart` is called from `step()`'s warm-up
  branch, so `STEP` is a real fixed sixtieth and five seconds is five seconds on a 144Hz
  screen. Anything time-based advanced in a draw runs 2.4× fast — the standing rule.
  ⚠️ **It ZEROES on release rather than decaying**, or somebody could tap their way to a
  kickoff, which is the opposite of what the five seconds is for.
  ⚠️ **`startArm` means the count only ever runs because of a press this poll SAW**, so a
  stale timer cannot resume after calibration takes the button. It does *not* mean a button
  already down on arrival is ignored: `enterWarmup` clears `_startPrev` deliberately, so
  START held on the way in reads as a fresh press — which is what makes the one button the
  lobby exists to get you past work at all.
  ⚠️ **TWO RINGS, ONE NUMBER** (`startHoldFrac`, and `padHoldFrac` for the corner row).
  The ring round the body says *who*; the ring round the controller icon says *you* to
  somebody looking down at their own hands. Two copies of `hold / holdStart` is two places
  for one of them to keep filling after the other stopped.
  ⚠️ **OUTSIDE THE KICK RING, at 2.9 body radii.** That circle at `p.r * kickRingMul()` IS
  the reach — a promise about the physics — and the stamina gauge is the same ring
  recoloured. A third arc at that radius would be a third meaning for one circle; the dial's
  own maximum is 2.0, so this can never be mistaken for either.
  ⚠️ **NO BACKGROUND TRACK, and that is the sprint gauge's lesson applied before it could
  bite twice.** A full-circle track is a complete ring at every value, so progress would have
  to be carried by the arc's colour against it — which at this size swamped the reading last
  time. Here the radius promises nothing, so arc LENGTH is free to be the signal, and it is
  the one a check can measure: the track sabotage reads **175 then 180** of 180 probe angles
  at 25% and 70%, against **47 then 137** without it.
  ⚠️ The corner arc deliberately does **not** turn with `seatRotOf` — the icon turns because
  it is a picture of which way the pad points; this is a clock, and one starting at three
  o'clock for the next player is not a progress arc.
  ⚠️ Three measurement traps are recorded in `tests/lobbyhold.mjs`: diff the SAME frame
  drawn twice (a frame seventy steps earlier measures the whole lobby moving and reports a
  ring on everybody), pull the bodies apart first (everyone spawns within a couple of
  body-lengths of halfway, so one player's annulus runs through another's ring), and set
  `_px`/`_py` when you teleport one or `ix()` interpolates it across the pitch.
- **THE LOBBY HOST IS PLAYER ONE, not whoever is first in the roster** (`lobbyHost`,
  `seatOrdinal`). The host's START kicks the match off and everybody else's only toggles
  their ready flag — so with the host read off roster order, the person standing at the
  panel marked 1 could press START and watch nothing happen, which is how it was reported.
  Seats are handed out in an order that changes with the mode, with the field and with who
  joined when; a pad index does not. The keyboard seat outranks every pad, because on a
  machine with a keyboard that is player one by definition.
  ⚠️ **`enterWarmup` clears `_startPrev`.** The START press is edge-detected per key, so a
  player who came in here by holding START on the menu is still holding it, no edge ever
  fires, and the one button the lobby exists to get you past does nothing until they let
  go and press again.
- **A PAD DOES NOT ALWAYS COME BACK ON THE INDEX IT LEFT** (`padReclaim`, `padIdOf`,
  `p._padId`). `_padWas` is what hands somebody their own body back after a cable is kicked
  out, and it matched on the INDEX alone — but unplug pad 0 while pad 1 is still connected,
  or replug over Bluetooth, and the browser hands out the next FREE slot rather than the old
  one. Measured: a guest with two goals who came back as index 1 was given a brand-new `P2`
  with none, and the half-match they had played sat on the bench, unreachable, for the rest
  of the game. Both `subWaitFor` and warm-up's `pollLobbyPads` had it.
  ⚠️ **The INDEX still wins and is tried first** — it is the only match that cannot be a
  guess, because that slot was theirs a moment ago and nothing else can be holding it.
  ⚠️ **The DEVICE is the fallback and is a best guess BY CONSTRUCTION**: `gamepad.id` is a
  model name, so two identical controllers report the same string. It can hand the wrong one
  of two orphaned bodies back. That is worth it — the alternative loses the name, the shirt
  and the goals with *certainty* rather than on a coincidence.
  ⚠️ **Only ORPHANS are eligible** (`_padWas != null`), so a body a live pad is driving can
  never be taken from it. Drop that guard and a second pad connecting steals the first one's
  body outright, which is what the sabotage measures.
  ⚠️ **Two identical controllers are what make the index branch load-bearing**, and without
  a test for them it is unproven: with a single pad the device matches too, so deleting the
  index branch leaves every other check green. `tests/dropin.mjs` plays two same-id pads,
  brings BOTH on, unplugs both and returns one on its own slot.
  ⚠️ **A body that never made it onto the pitch is DISCARDED, not remembered** — `dropOut`'s
  `!wasOn` branch clears the touchline — so any reconnect check has to bring the guest on
  first or it is measuring bodies that no longer exist. That mistake was made twice while
  writing these.
  ⚠️ **"It came back" and "it can play" are different claims**: the seat is only real once
  `padIndex` points at the pad that actually returned, and a body handed back with a stale
  index sits there looking exactly like a reclaim that worked. `tests/dropin.mjs` drives the
  stick and measures the travel, the `fourpads` lesson again.
- **A PAD ARRIVING OR LEAVING DURING WARM-UP** (`pollLobbyPads`, called first in
  `stepWarmup`). ⚠️ **The one room built for people joining was the one room that ignored
  them.** `pollDropIn` returns early on `w.state === 'warmup'` under the comment *"warm-up
  already hands seats to pads (that is what it is for)"* — and it does not: seats are dealt
  ONCE, in `startMatch`, and `subWaitFor` is the only other thing in the file that ever
  hands one out. So a controller woken up in the lobby got a BALL (`syncLobbyBalls` runs
  every step) and a reset idle clock (`stepLobbyClock` watches the pad count) and **no body
  to drive**. Same shape as `sel.controllers` shipping `off`: the game could see the pad and
  gave it nothing.
  ⚠️ **A JOINER WALKS STRAIGHT ON — no touchline, no START.** That is the whole difference
  from the mid-match path and it is the character of the room: a body arrives beside the
  halfway line undecided, exactly where `enterWarmup` puts everybody, and you pick a side by
  walking into a half. Asking for a START out here would be asking for the button that ENDS
  warm-up.
  ⚠️ **A LEAVER BECOMES A BOT IN PLACE**, which is `dropOut`'s rule mid-match and needs no
  new machinery: `lobbyPlan` is read fresh every frame, so the half that just lost a person
  is one short, the converted body is the spare bot standing right there, and
  `stepLobbyBots` puts it back in the same shirt on the same step. Left as a seat it is a
  body nobody can drive AND one `lobbyPlan` still counts as a person on that half — so the
  preview lies and `lobbyStart` fields a statue for the whole match. It keeps `_padWas`, so
  a pad that hiccups and comes back **reclaims its own body**, name and typed letters
  included — through `padReclaim`, the same rule the mid-match path uses (below).
  ⚠️ **Gated on `padsTakeSeats()` and deliberately NOT on `sel.dropIn`** — that setting is
  about interrupting a match in progress, and this room's entire purpose is people arriving
  and picking sides. ⚠️ **A cup tie takes no joiners**: a tie is two entrants and one body a
  side (which is why `startCupMatch` borrows 1v1), so a third pad would field a bot against
  somebody the draw never named. Leavers are still handled — an undriveable body is worse in
  a tournament, not better. `tests/warmupjoin.mjs`.
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
- **A BODY BEING WALKED ON OR OFF DOES NOT COLLIDE — AND MAY NOT TOUCH THE BALL**
  (`bodyStaged`, read by `integrate`'s collision pass, by its ball-control pass and by
  `runBot`'s call site). ⚠️ The ball half is new and it is load-bearing now: it was an
  ungated `handleBallControl` over every `w.players` entry, which never mattered while the
  only walk-on happened at a GOAL with the ball parked on the centre spot. A returning
  player swaps in **mid-play** (`subSwapNow`) and the bots walk on at kickoff, so a ghost
  that cannot be tackled and can still trap the ball is a real hole. ⚠️ **One predicate,
  three readers** — it was a local arrow inside `integrate` while it only had to answer
  for collisions, and a second copy would be a second opinion about who is a ghost.
  ⚠️ `const staged = bodyStaged` inside `integrate` is an alias for readability only, and
  the ball-control pass calls `bodyStaged` **directly**: that pass runs above the alias's
  declaration, so reading the alias there is a temporal dead zone and took the page out on
  the first step. **Nineteenth TDZ bite in this file.**
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
- **THE NAME PLATE'S TYPE: the halo was eating the letters** (`NAMEPLATE`,
  `HAS_TRACKING`, `snapTextPt`). Reported as the names looking *"a bit AI generated"*,
  which is a fair description of type whose letterforms have been thickened until they
  stop being letterforms. Magnified, a 13px name came out as a black bar with coloured
  holes in it: at `halo: 3.6`, struck twice with a round join, the stroke adds 1.8px
  either side of every stem, and Kenney Mini Square's stems and counters at 13px are about
  2px — so the P's counter closed, VAPE's A and P merged into one shape and BOOTS' two O's
  shared a wall. Three changes, all measured against magnified renders:
  **halo 3.6 → 2.4** (under the font's own internal gap, so counters stay open),
  **`track: 1`** (a pixel between the letters, the single biggest readability win), and
  **size 13 → 14** (wider counters for the halo to fit around).
  ⚠️ **AND THE BASELINE IS SNAPPED TO WHOLE DEVICE PIXELS** (`snapTextPt`). A pixel font
  drawn at a fractional device offset is resampled across two columns per stem, so the
  same letter comes out 2px wide in one place and 3px in another — the same "blur common
  with AI generated content" the owner named about the canvas DPR, one layer in.
  `screenPt` is fractional by construction (a body's position is continuous), so this can
  never be right by luck. ONE `getTransform()` per plate, not one per axis: it mints a
  DOMMatrix each call and this is on the render path once per body per frame.
  ⚠️ **`ctx.letterSpacing` IS A PROGRESSIVE ENHANCEMENT.** Chromium, Firefox 127+ and
  Safari 17.4+ have it; anything older ignores the assignment and still gets the smaller
  halo and the snap. Nothing is imported — the alternative is drawing glyph by glyph,
  which gives every letter its own double-struck halo and puts the merging back.
  ⚠️ Set **before** `measureText` (or the hit rectangle is narrower than the letters) and
  put back **outside** the `LABEL_MIN` branch (it is canvas STATE, and the quiet case —
  most of the pitch — returns without drawing, so a reset inside would leak a pixel of
  tracking into the floaters, the shirt numbers and the whole lobby board every frame).
  ⚠️ **CENTRED TEXT DRIFTS LEFT BY HALF THE TRACKING**: `letterSpacing` follows the CSS
  rule and adds its space after EVERY character, the last one included, so the measured
  width carries one trailing gap with no letter in it. `kern` is half of it back.
  ⚠️ **THE OBVIOUS CHECK READS BACKWARDS, and it was written first.** Counting
  fully-clear columns across the plate ON THE PITCH scored the reported build **11** and
  the fixed one **5** — better for the build with the merged letters — because the two
  render at different sizes and the band slices them differently. Whether letters merge is
  a property of the halo against the FONT at `NAMEPLATE.size`, so `tests/labels.mjs`
  measures it there, **at 8× and scaled back down**: at 1:1 the true 2.75px gap reports as
  2 whole columns and the 2.4 halo looks fatal. Old 1.63px gap vs 3.6 halo, new 2.75 vs
  2.4 — no tuned constant either side. Counters are a second, derived claim with
  `countersBare` as its own control: the word must not become a SLAB (0 of 4 survived
  before, 2 of 4 now); "all four" is a bar this design never meets and never needs to.
  ⚠️ **THE SNAP IS CHECKED ON THE WIRING, NOT THE HELPER.** Two body positions a THIRD of
  a device pixel apart must render the plate to identical pixels; three whole pixels must
  move it. Testing `snapTextPt` directly proves only that a helper exists.
  ⚠️ **The band must start BELOW the disc**, and the first probe did not — it began
  `gap - size` above the baseline, which at DPR 1 is two pixels above the body's own edge,
  so the snap check was measuring the disc's anti-aliased rim (which really does move on a
  third of a pixel) and reported a perfectly snapped plate as unsnapped.
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
  ⚠️ **NOTHING PRESSES ITSELF — KICK is the press, and `LOBBYKB.dwell` NO LONGER EXISTS.**
  There was a dwell (stand on a key for 0.4s and it typed) and it fired while you were
  only crossing the board on your way to the pitch, which is a keyboard typing at you.
  It also made a DOUBLE LETTER unreachable: a dwell has to latch until the body LEAVES
  the key or standing still types sixty letters a second, so "QQ" meant walking off Q and
  back on. A tap fires the key under you at once and re-arms on release.
  ⚠️ **`drawLobbyKeys` WENT ON DIVIDING BY THE DELETED CONSTANT for a build**, and the
  failure was silent in the worst way: `(p.kbT||0) / undefined` is `NaN`, `NaN > 0` is
  false, so the highlight map was never written and **no key ever lit up**. The board gave
  no feedback at all about which letter KICK was about to press. The highlight is BINARY
  now, which is what is left once there is no progress to show — and a ramp off `kbT`
  would strobe a held +/− square five times a second at `LOBBYKB.repeat`, which is the
  pulse the wind-up ring was reported for.
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
  ⚠️ **Latched on the BUTTON, not the key**, so holding KICK and walking across the board
  does not type the row you crossed. ⚠️ **A +/− square REPEATS while KICK is held and a
  letter never does** (`LOBBYKB.repeat`): a letter you meant once is a letter, but going
  1v1 to 8v8 a tap at a time is fourteen taps, which is a chore rather than a control.
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
  ⚠️ **BOTS WAIT OUTSIDE THE TOUCHLINE IN WARM-UP AND WALK ON AT THE WHISTLE**
  (`lobbySpotFor`, `stageEntry`, `ENTRY.wait`, `entryBusy`), asked for as *"only have bots
  walk in to balance once a match starts"*. On a 2v2 the lobby had four robots standing on
  the grass and two people, so the room you choose sides in was mostly bodies nobody was
  driving. **This reverses the rule written below** — *"the lobby shows the match you'd
  get, not a row on the touchline"* — and the promise it was protecting survives, because
  `drawLobby` prints "1 PLAYER +1 BOT" over each half and that is still exactly what Start
  fields. What changed is that the count is READ rather than counted off the pitch, and
  the waiting row is still on the side each bot will play for.
  ⚠️ **THE WAITING ROW HAS TO CLEAR THE LOBBY'S OWN CONTROLS, and the first build did
  not.** The keyboard and the colour swatches both sit outside a touchline — which one
  depends on whether the pitch is turned — and both are centred on the pitch's axis: the
  swatch blocks reach 152 units either side of the halfway line and the keyboard 175. A
  waiting row at `0.34` of the half is 129 on Classic, so the bots stood ON the keys and
  ON the shirts and looked like they were pressing them. The column starts beyond both
  (`0.56`) and grows outward toward the goal line, spaced at `LOBBY.benchStep` so two
  name plates do not run into each other.
  ⚠️ **The walk-on is staged from `lobbyStart`, AFTER `resetKickoff`** — the marks are
  already right, so it only picks each bot up, stashes its mark on `_subTo` (which
  `stepSubWalk` already knows how to walk to) and puts the body back outside. **A beat
  first** (`ENTRY.wait`, 1s): setting off in the frame the screen changes reads as bodies
  sliding into place, and a second of stillness is what makes it a team coming out.
  Counted down in `step()`'s kickoff branch — never in a draw — with no randomness at all.
  ⚠️ **`entryBusy` also holds the kickoff touch off**, or somebody can play the ball while
  half a side is still walking. ⚠️ **Only out of WARM-UP.** A plain KICK OFF never showed
  the bots early, so there is nothing there for a walk-on to resolve, and a second added
  to every match start is charged to people who did not ask for it.
  ⚠️ **A PERSON WEARS THE SHIRT OF THE SIDE THE PLAN GIVES THEM.** `applyTeamColours`
  reads `p.team`, and until the whistle a human's team was whatever `startMatch` dealt
  them — so two people who had both walked onto the same half were drawn in the same
  colour as each other AND as the half they had just left, with the head count above their
  heads saying something else. Reported as changing a shirt colour not reaching everybody
  on that side, and it is really the shirt naming the wrong side. `stepLobbyBots` writes
  `p.team` from `plan.a`/`plan.b` every step, so the shirt reads the one source of truth
  the head count already reads. Bodies in `plan.out` are left alone: they are sitting this
  one out and have no side to wear.
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
- **THE STEP CAP AND THE dt CLAMP ARE ONE DECISION** (`MAX_DT`, `MAX_STEPS`). `dt` is
  clamped so a backgrounded tab does not simulate the minutes it was away, and the step
  loop is capped so a slow frame cannot spiral. The clamp was 0.1s and the cap a
  hard-coded **5** — but 0.1s is **SIX** steps at 1/60, so even a frame the clamp had
  already trimmed could not be retired and every one of them banked the remainder.
  ⚠️ **Measured, and the debt is real**: under CPU throttling at 12× the accumulator
  reached **0.68s** (averaging 0.49s) — half a second of input latency that never comes
  back, and `renderAlpha` pinned at 1 so every body is drawn a whole step stale. Deriving
  the cap from the clamp bounds it at one step at every throttle.
  ⚠️ `acc % STEP` after the loop, not `acc = 0` — the modulo keeps the sub-step phase so
  interpolation keeps working through an overload.
  ⚠️ **It does NOT make a slow machine run at full speed and must not be sold as if it
  does.** The sim advances at `MAX_STEPS × fps` steps a second, so at 5fps it runs at 42%
  of real time whatever happens here. `matchT` was measured before and after and is
  unchanged (14.63 → 14.58). The cure for the speed is a cheaper frame; this fixes the
  debt piled on top of it.
- **AUTOMATIC QUALITY, AND IT MAY ONLY EVER TOUCH RENDER** (`QUAL`, `qualityStep`,
  `fullQuality`, `_qualPin`). Below 40fps sustained for two seconds the dot trails go,
  then the kick sparks; back above 52fps for a second and they return. Nothing to find in
  a menu — asked for that way.
  ⚠️ **THE RENDER-ONLY RULE IS THE DETERMINISM RULE, not a style preference.** A pinned
  seed must reproduce a match bit-exactly, so nothing the SIM reads may depend on how fast
  the machine is running — one branch the wrong side of that and no replay plays back, no
  seeded test reproduces, and two people on one couch get different physics from the same
  inputs. `advanceTrails` and `advanceFx` keep running exactly as they did; only the
  DRAWING is dropped. `tests/determinism.mjs` hashes the world at both tiers, driving
  `render()` as well as `step()` — a hash taken without rendering passes on a build that
  wires quality straight into `integrate`, which is the sabotage that proved it.
  ⚠️ **The BALL's streak is never dropped** — it is the one thing everybody is tracking,
  the same rule that stops a cosmetic trail slot switching it off.
  ⚠️ Long hysteresis on purpose: one slow frame is a garbage collection, not a slow
  machine, and flipping on it is a visible flicker of the whole picture.
- **THE SECOND PROFILE, AND WHAT IT WITHDREW.** Everything below was re-measured on the
  optimised build (1280×800, software raster, 8v8 reached by setting `MODES['4v4'].per`),
  and two of the previous round's headline numbers do not survive.
  ⚠️ **`repCapture` IS 92% OF ALL ALLOCATION AND IS NOT WORTH TOUCHING.** The share went
  *up* (67% → 92%), and the absolute figure is what matters: **548 bytes a frame, 32 KB/s**.
  Disabling the match buffer entirely measured **no GC improvement at all** (31.7 ms of GC
  per 10s with it, 39.0 ms without) and left the minor-GC count unchanged. Pooling those
  objects buys ~0.008 ms a frame. ⚠️ What the buffer *is* is **8.1 MB of retention by full
  time, 62% of the live heap** — a memory-footprint question, decided on that basis or not
  at all. **A large share of a small number is a small number.**
  ⚠️ **THE SUPPORT GRID'S 42% IS NOW 28–31% OF `step()`.** The pruning that shipped took
  most of it. Coarsening to 4×3 measures **−31% of step, ≈−0.13 ms, 6–12% of the frame**
  depending on which frame figure you use — and 1×1 only reaches −33%, so 4×3 already
  captures 84% of everything a coarser grid could ever buy. It is **not behaviour-neutral**
  and needs `tests/botplans.mjs` re-measured before it ships.
  ⚠️ **AT 1× NOTHING DROPS FRAMES, and a single run said otherwise.** One rAF-delta run
  reported p95 33 ms and 14.75% of frames over 20 ms; re-run five times it is **0.33%**,
  which is host contention rather than the game. The instrument that is immune to a busy
  host is the trace's own `FireAnimationFrame` duration, because it measures the game's
  work rather than the wall clock. **A single timing run in a container is not evidence.**
  ⚠️ **`render()` RETURNING IS NOT THE FRAME BEING DRAWN.** Forcing a rasterise
  (`getImageData` of one pixel) takes render from 0.65 ms to **4.66 ms** on a software
  rasteriser. Always report the rasteriser alongside, or the JS figures read as the whole
  story.
  ⚠️ Where the frame goes now at 8v8: **render 56%, step 35%, everything else 7%** — the
  eleven `advance*` calls, `pollKeys` and `vjTick` together are ~0.2 ms of 2.7. Inside
  step, the **bots are 85%** and physics is 17%. Inside render, **`drawOneDisc` is 51%**
  and `paintFace` 23% of it.
- **`fitGlyph` BUILT A STRING PER BODY PER FRAME, and `isDesktop` MINTED A MEDIA QUERY
  TWICE A FRAME.** Both are on the render path — `fitGlyph` for every faceplate, and
  `computeCam` → `isTouchLayout` → `isDesktop` for the camera — and both were allocating
  for an answer that never changes. The memo is a Map per glyph keyed on a **packed
  integer** rather than one `t+'|'+px0+'|'+…` per call, the fitted font string is cached in
  the entry, and the media query is built once. **Measured −6.9% of render** (three runs
  each side, cleanly separated) with the rendered frame **byte-identical** and the world
  hash unchanged, which is the only claim worth making about a change like this.
  ⚠️ **An MQL is LIVE** — caching the object caches nothing about the answer, which is why
  this is safe and is the same rule `_reduceMQ` already records.
  ⚠️ **`var _deskMQ`, and it was a `let` for one build — the TWENTIETH TDZ bite in this
  file, walked into in the same commit as a comment warning about it.** `isDesktop` is a
  function declaration, so the bootstrap can call it long before a `let` two thirds of the
  way down has initialised; the page took the whole debug hook with it.
- **THE FRAME BUDGET IS MEASURED, AND FOUR THINGS WERE PAYING FOR IT.** Profiled at
  1280×800 with a step/render split at 1v1, 4v4 and 8v8. What was actually expensive, in
  order, and all four fixes are behaviour-neutral:
  ⚠️ **The bot SUPPORT GRID was 47% of the whole step** (`botUpdateSupportGrid`) — 48
  cells, each running `botLaneClear` and `botAperture` over every opponent, twice a step.
  `safety` and `shot` are both `Math.min(1, …)`, so a cell can never score above
  `2 + band*0.8 − crowd*0.9`; when that ceiling is already at or below the best so far the
  cell cannot win and the two expensive calls are skipped. **Provably identical output**,
  and measured as such: a seeded 8v8 hashed over 3,000 steps gives the same world with the
  pruning and without. The cell already being run to is never pruned, because `hereS`
  needs its exact score.
  ⚠️ **Canvas text was 38% of render** — `fitGlyph` measured every glyph twice per body
  per frame, 48 `measureText` a frame at 8v8. Cached on the INTEGER font size, never on a
  width-per-pixel ratio: `tests/textplates.mjs` pins the ink centre to within a pixel and
  a scaled measurement can drift where an exact one cannot.
  ⚠️ **The colour maths ran every frame for values that change never** — `relLum` 110
  calls a frame, `rgba` 97, `readableInk` looping up to 21 times per body. All memoised.
  `rgba` caches the PARSE and never the (colour, alpha) pair — a fading trail dot varies
  alpha continuously, so the pair would grow without limit.
  ⚠️ **The dot trails re-parsed a colour string per dot** — 192 of them at 8v8. The colour
  is set once and the fade rides `globalAlpha`, multiplied by whatever the caller had.
  ⚠️ **Debunked, so nobody spends a day there**: `predictsGoal` is FREE (0 calls in 15s of
  8v8 — every kick went through `releaseTrap`, which skips `maybeHitStop`); `collideDiscs`
  is 0.012ms for all 120 pairs; `advanceTrails`/`advanceFloaters`/`advanceStamina` are
  below the measurement floor; nothing creates a gradient or a canvas per body per frame.
- **THE WARM-UP LOBBY RENDERED SLOWER THAN AN 8v8 MATCH** (`lobbyKeyGeo`). Measured: 0.95ms
  against 0.60ms, and that is the reported frame skipping. `drawLobbyKeys` rebuilt 53
  world-space plates from scratch every frame — ~406 `screenPt`, 38 `measureText`, 78
  `ctx.font` writes and ~700 array allocations — and every number of it is a pure function
  of `(kb, cam)`. Cached on a `cam` signature; **a rebuild mints a new `kb` object**, so
  `_sig` is `undefined` on it and the cache cannot go stale in either direction, which is
  worth more than an invalidation call somebody has to remember. Now 0.58ms.
- **THE WARM-UP BOARD IS BAKED ONCE AND BLITTED** (`lobbyBoard`, `drawLobbyPad`). Measured:
  the lobby rendered at **0.99ms a frame against a live 4v4 match's 0.18ms** — five and a
  half times a running game, on a screen where nothing is happening. Roughly seventy pads
  (28 letters, 16 shirts, 24 flags, two steppers, START) were fully repainted every frame,
  each with its own `save`/`clip`/`drawImage`/`restore`: `drawImage` was 17.9% of the
  profile, `save` 10.6% and `clip` 5.0%. Baked, it is **0.26ms**.
  ⚠️ **`lobbyKeyGeo` already cached the GEOMETRY; this caches the PAINTING**, which is the
  expensive half. Nothing on the board moves — the only per-frame variation is the
  highlight under a body, which is at most one pad per player and is drawn live on top.
  ⚠️ **The signature carries everything the RESTING picture depends on**, not just the
  camera: the worn shirt and flag per side, the difficulty and the ink all change what is
  drawn at rest, and a stale board shows the old selection until the camera moves.
  ⚠️ It swaps the module-level `ctx`, the idiom `playReplayFile` uses for `world`, and
  restores it in a `finally`. `screenUpright` is a documented no-op, so nothing inside
  reaches for a context of its own.
  ⚠️ **It is NOT bit-identical to painting each pad, and cannot be**: the pads are
  TRANSLUCENT, so compositing them onto a transparent layer and blitting that once differs
  from compositing each onto the pitch in turn. Measured over a whole frame, 99.9% of the
  pixels that differ do so by **≤2 levels of 255** and only **126 of 810,000** exceed 8.
  ⚠️ **`tests/lobbydress.mjs` measures EACH PAD FAMILY'S OWN BOX, and the obvious probe is
  VACUOUS — two sabotages PASSED before it was right.** A whole-frame diff is satisfied by
  the body moving or by the shirts on the pitch recolouring, with the board fully stale;
  and a box round ALL the pads encloses the PITCH, because the swatches sit beside the
  court and the keyboard below it.
- **PICKER PREVIEWS ARE CACHED, ALL OF THEM** (`cachedSwatch` in `buildOpts` and
  `buildTilePicker`). Measured: tapping a pitch tile cost **15.6ms and 79 fresh canvases**
  against 0.3ms and zero for every other picker, because each tile baked a full-resolution
  pitch texture and `refreshPitchTiles` then did the grass and surface rows too. And
  `finishMatch` allocated **186 canvases for 21–38ms** — 177 of them in `buildTilePicker`,
  because an unlock may have landed so the cosmetic pickers are rebuilt. Now **6.8ms / 11**
  and **7.1ms / 11**.
  ⚠️ **THE CONTAINER OR PICKER NAME MUST BE IN THE KEY, and leaving it out EMPTIES A TILE.**
  Two rows can describe the same picture — the selected GRASS tile and the selected SURFACE
  tile both draw (current field, current mow, current surface), and a cosmetic appears in
  the Recents row AND the picker below it. One shared node is MOVED by `appendChild` out of
  the first tile, which then has no canvas at all. That is the hazard `slotSwatch` returns a
  copy to avoid, arriving through a shared cache key instead of a shared call site; keyed
  per row it is unique again and the node can be appended rather than copied.
  ⚠️ **The canvas is minted INSIDE the maker**, so a hit allocates nothing. Creating it up
  front and then asking the cache still paid for one per tile — caught by the tap getting
  faster while the allocation count went UP.
- **A BODY NOBODY CAN SEE IS NOT PAINTED** (`bodyOffScreen`), and until now every one was.
  `drawOneDisc` is the most expensive thing in the renderer and there was no culling
  anywhere. ⚠️ **It does not fire in the lobby**, and that is worth knowing before anybody
  goes looking: `computeCam` grows the frame to hold the keyboard and `lobbyReach` clamps
  bodies into that same box, deliberately. It fires on the BENCH during a match and hard
  during the goal camera's push-in. ⚠️ The pad is generous — the kick ring reaches 2×, the
  name plate hangs below, and the point is missing the shake/tilt offset — so the
  arithmetic is biased toward painting a body that turns out not to be needed. Culling one
  that IS needed is a body popping out of existence at the screen edge.
  ⚠️ **A BOT WAITING FOR THE WHISTLE IS NOT DRAWN AT ALL**, which is a separate rule from
  the cull and is what the report actually wanted. Gated on `warmup` alone, so the walk-on
  in `kickoff` is fully visible. `drawLobby`'s head count still says how many are coming —
  it reads `lobbyPlan`, never the pitch.
- **THE SPRINT RING STARTS AT A TIME, NOT A FRACTION** (`SPRINT.showAfter`, `sprintShow`).
  It was `show: 0.6`, which at the default 3s drain put the first red pixel at step 73 —
  **1.217 seconds** of holding KICK with nothing on the ring. ⚠️ A fraction cannot express
  "half a second in", because the Sprint length slider runs 0.5s to 15s and the fraction
  that means it is different at every setting. ⚠️ **`SPRINT.show` was DELETED rather than
  left behind**: `tests/sprint.mjs` derives three probes from it, and a stale constant that
  nothing consumes is exactly how a suite goes quietly vacuous. ⚠️ Floors at 0 — below a
  0.5s sprint you are already spent by the half-second mark and the spent rule takes it,
  which is the right answer rather than an edge case.
- **THE RESULT SCREEN FOLDS UNTIL IT FITS** (`fitStatsToScreen`, `_statsFold`). Measured:
  a 1280×900 desktop overflowed at **3v3** (920px in 900) and by ~500px at 8v8, every time,
  starting open. ⚠️ **The default is now whether it FITS, not a width** — `innerWidth > 720`
  is a guess about a phone and says nothing about how many players are on the scoresheet.
  ⚠️ **The ribbons fold with the table**, reversing an earlier rule: at 8v8 they are 412px
  of an 1133px screen, the biggest block on it. The SCORE never folds — it is the result,
  not a breakdown of it. ⚠️ **It is measured LAST**, after `renderMapVote`, or the vote's
  117px on a phone is missing from the sum. ⚠️ **And re-asked on the next frame**, because
  the UI face is a web font and blocks grow when it lands — the desktop 3v3 case came back
  "fits" and settled at 920. The re-check may only ever fold FURTHER, never re-open, or
  every result screen flashes. `tests/resultfit.mjs` had three assertions reversed for this
  and they were rewritten rather than nudged.
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
- **A SECTION IS ANY `[data-sec]` NODE, AT ANY DEPTH — IT IS NOT "A CARD" ANY MORE**
  (`SEC_SEL`, `sectionNode`, `revealPath`, `revealNode`, `openSection`, `lastSection`,
  `buildJumpBar`, `menuSearchIndex`). Eleven top-level cards became **four**: Match, Your
  Player, **Options** and Replays.
  ⚠️ **THE IDENTITY SURVIVES THE MOVE, and that is the whole of why this was cheap.**
  `openSection('feel')`, the jump bar, `lastSection()`, `openLook('theme')` and the menu
  search all still name `feel` and `theme` and land exactly where they used to — because a
  pane that carries `data-sec` **is** a section that happens to live inside another one.
  Nothing downstream had to learn a second concept, and a save that says `_open: 'feel'`
  from before the move still works.
  ⚠️ **`showSubTab` SCOPES BY `data-group` ON THE PANE, never by "every `.subpane` in the
  card".** That was true while nesting was impossible and it is what made nesting
  impossible: Theme's chips inside Display's pane would have been blanked by Options' own
  row the moment either was pressed. **Every** `.subpane` carries `data-group` — the 21 in
  the markup and the two generated sets (`#slotRows`, `#sndCats`) — and a pane without one
  is invisible to its own tab row, which is the failure mode to look for first.
  ⚠️ **`revealPath` is OUTERMOST FIRST**, and that ordering is not cosmetic: showing
  Theme's pane before Display's writes a tab into a pane the Options row is about to hide,
  and the second call looks like it did nothing. `menuSearchGo` and `openSection` both go
  through `revealNode`, so a hit three levels down opens all three.
  ⚠️ **`menuSearchIndex` walks SECTIONS, not cards, and `secOf` is what keeps them apart.**
  Iterating cards would file every Game Feel slider under `options` — so the search would
  say "Options" for a control whose own chip says Game Feel, and show mode would be asking
  the wrong question about it. A control belongs to its **nearest** enclosing `[data-sec]`.
  Same reason the group comes off the pane rather than off "the first `.subtabs` in the
  card": that was true, and stopped being true the moment a tab row could nest.
  ⚠️ **`:not(.jumpchip)` is load-bearing in `SEC_SEL`** — the jump bar's own chips carry
  `data-sec`, so a bare attribute selector finds a CHIP before the thing it points at.
  That trap was already written up twice in this file against `.card[data-sec="vj"]`.
  ⚠️ **NO CHIP FOR A SECTION THAT IS ONLY A CONTAINER.** Options holds five sections and no
  control of its own, so a chip for it landed exactly where the Controls chip lands — two
  chips, one destination. Display keeps its chip even though it owns Theme, because it has
  settings of its own: the test is a `label.field` whose nearest section is this one, not
  "does it contain another section".
  ⚠️ **`SECTION_COLLAPSED_DEFAULT` NOW OMITS `match`**, which is what makes Match the one
  card open on a first run — `initCollapsibles` takes the FIRST card whose default is open.
  It used to be `more`, the discovery card; those tiles are Match's **Modes** tab now, so
  Match is both the thing you came for and the door to everything that was behind it.
- **OPTIONS — five cards became five tabs** (`SUBTABS.options`). Controls, Display, Sound,
  Game Feel and About are the same kind of thing — how the machine behaves, not what you
  are about to play — and as five top-level cards they were five of the eleven bars a
  player scrolled past to reach anything. What is behind KICK OFF is a **choice**; what is
  in here is a **setting**.
  ⚠️ **Reset lives at the bottom of the card, OUTSIDE the panes**: it resets everything,
  and filing a set-everything control under one fifth of the things it sets is the argument
  the Game Feel preset row already won.
  ⚠️ **THEME IS INSIDE DISPLAY**, in a `.subsec` with its own chip row — three levels of
  tabs, asked for. A theme is what the game LOOKS like and Display is where how it looks is
  decided, so a top-level card for it was a second door onto the same room: the argument
  that deleted the standalone Ball card, one floor up. It keeps its own tab row rather than
  being flattened into Display's controls, because seven tile grids stacked is most of a
  phone screen each. ⚠️ `.subsec` is deliberately **not another card** — a card inside a
  card is two borders and two lots of padding, and the accordion's "at most one open" rule
  counts cards.
- **MODES IS A MATCH TAB, AND BOTS IS ITS OWN** (`SUBTABS.match`). Season, Tournament,
  Gauntlet, Drills and the Tutorial are all *a match you are about to play*, so they belong
  behind KICK OFF with the mode, the pitch and the rules — not in a twelfth card called
  "Modes & more" that you had to know to open. Stats / Ranks / Daily / Shop / Watch and How
  to play come with them: they are the same kind of thing (a screen you go to), and
  splitting them across two doors was an accident of history.
  ⚠️ **Difficulty and Bot strategy moved OUT of Game.** They sat with Mode and Match length,
  which is four different questions in one list — and the two of them are one question asked
  twice. `BOT_PLANS` is explicitly a **different axis** from difficulty and the menu now says
  so by putting them side by side with nothing else.
  ⚠️ **Show mode keeps the `modes` pane rather than cutting it**, because How to play is the
  one survivor that is not a setting; the CSS empties the tab of everything else, exactly as
  it used to empty the card.
- **THE MENU IS THE LAST WORD ON A PLAYER, AND FOUR THINGS STOPPED IT BEING**
  (`syncPush`, `adoptProfiles`, `claimSeatName`, `seatBodyIndex`, `refreshLookUI`,
  `seatCount`'s `syncSeats`). Asked for as *"ensure I can overrule the customization of
  players using the setting screen"*, and every one of the four was measured on the
  shipped build.
  ⚠️ **1. `syncPush` SENT SEAT ONE AND NOTHING ELSE.** It posted `{sel, profile}`, so
  dressing player two, three or four in the /menu tab reached the game window **not at
  all**: seat two set to `cat`/`FROMMENU` in the panel still read `num1`/`P2` on the pitch
  a second later, while seat one's own change landed every time. `profiles` travels now,
  and `adoptProfiles` **mutates in place** — `seatProfile(i)` hands the object out and the
  debug hook exposes the array, so swapping an entry leaves anything holding a reference
  reading a record that has stopped being the one on screen.
  ⚠️ **2. A PANEL HAS NO WORLD, so `seatCount()` returned 1 there — on every visit.**
  `buildSeatPick` refuses to leave the card on a seat that is not there
  (`if (editSeat >= n) editSeat = 0`), so the picker was **never shown on /menu at all**
  and `setEditSeat(1)` silently edited seat one. The count rides the **telemetry
  heartbeat** (`{t:'tel', seats}`) rather than a new handshake — that message was being
  sent anyway — and only counts while `syncPeerLive()`, or a number from a game window
  that closed an hour ago leaves four seats on offer driving nobody.
  ⚠️ **3. `p.kbTyped` WAS A MID-EDIT GUARD THAT NEVER CAME DOWN.** It exists so a profile
  sync landing mid-keystroke cannot put 'You' back under somebody's feet — over the moment
  the name is committed. Left raised it made a warm-up name **unchangeable from the menu
  for the rest of the match**: a seat typed `ABC` still read `ABC` with the card set to
  `HOST`. `lobbyKbCommit` lowers it now.
  ⚠️ **4. A GUEST'S TYPED NAME WENT INTO THE PLAYER NAMES BOX**, which predates there
  being a profile per seat. `syncProfileToWorld` lets `sel.names` outrank a profile *on
  purpose* — that box is how you name a BOT — so a guest who spelled `XYZ` on the lobby
  keyboard had `XYZ` pinned there and the card could not shift it. It is filed under that
  SEAT now, which also puts it in the very field the owner would reach for.
  ⚠️ **`claimSeatName` is the one place "the menu is the last word" is written down**, and
  both the lobby and the `#pname` field go through it. ⚠️ **A seat is a person and
  `sel.names` is indexed by BODY**, so it can only run where there is a world to map one
  to the other — which is why the panel sends a `claim` seat number on the state message
  rather than clearing the box itself. Honoured **before** the save, or it takes effect
  one message late and the menu appears to need two edits.
  ⚠️ **AND PICKING A SEAT DID NOT REFRESH THE CARD.** `setEditSeat` called `buildSettings()`,
  which rebuilds the seat TILES and touches neither the Name field nor the cap/face/eyes
  pickers — so with seat two's profile reading `XYZ`, picking seat two left the box
  showing `You`, the value it was given at page load. The card said it was dressing player
  two and showed you player one. `refreshLookUI(force)` is now the ONE refresher and
  `syncRefresh`, `resetSettings`, the ↺ Reset look button and `setEditSeat` all call it —
  the same seven-call list had been written out four times.
  ⚠️ **A FACE SURVIVES THE SIDE PUTTING A COUNTRY ON.** With a team flag set, `p.flag` is
  the country and `p._ownFlag` is the player's own face — so `syncProfileToWorld` writing
  `p.flag` ripped the country off the pitch AND left the stash holding the face from
  *before* the edit. Measured: on Brazil, picking `cat` showed `cat` at once (country
  gone) and then handed back `num1` — the old face — when the country was switched off.
  It writes into the stash when stamped, so the country stays on top and the new avatar is
  what comes back.
  ⚠️ **`p.color` IS A KNOWN INCOHERENCE AND IS LEFT ALONE DELIBERATELY.** Writing it makes
  the Your Player swatch recolour exactly one body mid-match, a different shade from its
  side, and the next roster change quietly puts it back (measured: a seat at `#ff00ff` on
  a pitch whose team colour is `#e05a5a`). Removing it makes that swatch a DEAD CONTROL
  during a match instead, which this file forbids at least as loudly. Neither is right and
  the fix is a decision about what that swatch MEANS now that team colour is one shade a
  side — a bigger change than the one it sits inside. `tests/livelook.mjs` pins today's
  behaviour so whichever way it is settled is settled on purpose.
  `tests/seatprofiles.mjs`, `tests/panel.mjs`.
- **ONE PROFILE PER SEAT, AND SEAT ONE IS `profile` BY OBJECT IDENTITY** (`PROFILES`,
  `profiles`, `editSeat`, `ep()`, `seatProfile`, `seatCount`, `buildSeatPick`,
  `magnetball.profiles`). The Your Player card only ever edited one player, so on a cabinet
  with four pads three people could not pick a colour, a face or a name at all.
  ⚠️ **EVERYTHING THAT MEANS "THE DEVICE OWNER" DID NOT MOVE.** The leaderboard entry, the
  social feed, `isHero`, the clip filename and the save file's `magnetball.profile` all go
  on reading `profile`, and `ep()` returns that exact object for seat 0 — so seat one is
  not a copy of the owner, it *is* the owner.
  ⚠️ **A GUEST SEAT IS A LOOK AND NOTHING ELSE.** No stats, no unlocks, no leaderboard:
  *"guests have no record"* is a deliberate rule with `tests/yourside.mjs` behind it, and a
  per-seat **record** would quietly reverse it. What a second player wants is to not be
  wearing the first player's shirt.
  ⚠️ **ONE READER (`ep()`) AND ONE WRITER (`saveProfile`).** 34 picker call sites went from
  `profile.` to `ep().`, and none of them knows which seat it just edited — so the
  which-store branch lives in `saveProfile` rather than at 34 places.
  ⚠️ **Its own storage key**, not folded into `sel`: `saveSel()` serialises all of `sel` and
  `syncAdopt()` shallow-merges it between windows — the argument that keeps the arcade
  takings and the VJ decks out of there too. It travels in the game save.
  ⚠️ **Only seats somebody CHANGED are written.** `loadProfiles` mints all seven up front so
  `ep()` can never hand back `undefined`; storing those untouched copies would put six
  identical records on disk and in every exported save.
  ⚠️ **The picker is HIDDEN at one seat**, which is the ordinary case — a control offering a
  single choice is furniture, and it would be the first thing on the card for the people who
  least need it. The count comes from the live match if there is one, otherwise from the
  pads that are plugged in.
  ⚠️ **`seatCount` COUNTS SEATS, NOT BODIES, and counting bodies was wrong in BOTH
  directions.** A seat is a PERSON. Duo hands one player every body on their side
  (`mode.duo` sets `ctrl = 'human1'` on all of them), so a duo match offered **two** profiles
  for one human; and the pad branch added a keyboard seat on top of the pads, so two
  controllers offered **three** and four offered **five**. Both are dead controls — a look
  you can set for somebody who is not there. The keyboard MERGES into the first pad seat
  (`mergePads`), so it only adds a seat of its own when there are no pad seats at all, and
  whether pads take seats is `padsTakeSeats()`, never the raw connected count.
  ⚠️ **THE MODE HAS TO BE ASKED TOO.** Two thumbs on one phone is `mode.twoP` — two seats and
  not a controller in sight — and before the first kickoff there is no world to count.
  ⚠️ **AND THE PICKER IS RE-ASKED WHEREVER THE COUNT CAN MOVE, which for a long time it was
  not.** `buildSettings` builds it at boot and on an option tap, and `seatCount()` reads the
  LIVE match — so on a machine with no controller the count only became 2 the moment a
  two-player match started, which is *after* the card was last built. Reported as *"I did not
  see options to customise the rest of the players despite being able to play as them"*, and
  it stayed hidden for exactly the people it exists for. Rebuilt from `startMatch` (where the
  seats are dealt), from `toMenu` and from `updatePadInfo` now — a handful of DOM nodes,
  against `buildSettings`' 24ms. **With pads it happened to work**, because a connected pad
  is countable before anybody kicks off, which is why this survived so long.
  ⚠️ **THE PICKER EXISTING IS NOT THE SAME AS IT WORKING**, so `tests/seatprofiles.mjs` ends
  by dressing seat two and checking that body wears it AND that seat one does not — a build
  that writes every seat at once passes every visibility check. ⚠️ It checks the FACEPLATE
  and the NAME, never the colour: team colour is one shade a side and `applyTeamColours` wins
  over the profile wherever it applies, so a colour probe measures that rule instead of this
  feature and reads as seat one changing when nothing about seat one did.
  ⚠️ **`syncProfileToWorld` counts HUMANS in roster order**, and a bot sitting between two
  people must not consume a slot or plugging a third pad in re-dresses everybody.
  `seatNameList()` still indexes by PLAYER index — that is what the Player names box has
  always meant — so the two are read separately.
  ⚠️ **The team colour still wins where it applies**: `applyTeamColours` runs after this on
  every path that can change sides, and one shade a side is a rule this does not get to
  break.
  ⚠️ **`PROFILES` and `profiles` are declared immediately under `let profile = loadProfile()`**,
  because `loadProfiles()` is called from that line — a `const` further down is in the
  temporal dead zone at that moment. **Twentieth TDZ bite risk in this file**, and one of the
  previous nineteen was hidden by `loadProfile`'s own try/catch.
- **THE UNLOCKED STRIP IS GONE, and what it did is not lost.** It was a progress bar, five
  counters and a row of every cosmetic you own, sitting **above** the controls that change
  your player — so the first thing on the card was a summary of the pickers rather than a
  picker, and the *"Tap anything here to wear it"* line existed only to explain that it was
  a second door onto the same room. Every item in it is in its own tab a few pixels below,
  next to the locked ones, which is where you go to choose one. ⚠️ `UNL_CATS` and
  `unlockCounts` **stay** — they are what the per-picker unlock counters read, and what
  proves every `FLAGS` entry is reachable.
- **THE WHOLE MENU FROM A JOYSTICK, ON EVERY MACHINE** (`padDrivesMenu`, `menuRoot`,
  `padMenuWoke`, `syncPadHint`, `pollDeckUI`, `deckFocusables`, `.deckfocus`).
  ⚠️ **EVERY LINE OF THIS EXISTED AND WAS FENCED BEHIND `isDeck()`.** So on a cabinet, on a
  TV with a pad in your hand, or on any desktop, the one input the game is built around
  could start a match and then not change a single thing about it — you had to reach for a
  mouse. Same shape as `sel.controllers` shipping `off` and Sprint shipping off: built,
  wired, and defaulted to the half nobody could reach.
  ⚠️ **WHO OWNS THE PAD IS THE WHOLE DESIGN, and there are two owners.** A live match owns
  it — A is KICK, and a menu that stole that would pop a card on every shot. `padDrivesMenu()`
  is the ONE predicate, and `integrate`'s input gather reads the same one and parks the seat,
  so a stick press can never move a focus ring and a player at once. **The attract demo is
  not a live match** — it is what the menu looks like.
  ⚠️ **SELECT STAYS DECK-ONLY.** There it toggles the left dock, which is what "open the
  menu" means on a machine whose menu is a dock. Everywhere else SELECT already means *turn
  my controls a quarter turn*, and with nothing running it opens warm-up — two meanings
  bought and paid for, and a third would break both. Off a deck the menu is simply on screen
  or it is not, so there is nothing to toggle. **B** closes the dock on a deck and
  **collapses the open card** everywhere else, for the same reason.
  ⚠️ **NO RING UNTIL A PAD IS ACTUALLY USED, and it goes again on the first click.** A
  permanent 3px outline round the first tile on a mouse-driven screen is furniture — the
  argument that hides the seat picker at one seat. Waking is on a **held** direction rather
  than a press edge, so the first press moves as well: waking without moving loses the input
  the person just gave. A deck is exempt, because there the pad IS the pointer.
  ⚠️ `padDrivesMenu()` is **hoisted out of `integrate`'s player loop** — it walks the DOM and
  the answer cannot change between two players of one step. At 8v8 it was sixteen of those a
  step.
- **THE VJ CARD IS ONLY EVER ON THE `/vj` ROUTE.** Hidden on the game menu and on
  `/settings` alike — asked for, and consistent: one surface for the decks. ⚠️ **The
  signpost outlived the card**: `#vjOpenBtn` moved into **About**, because a feature you
  cannot find is a feature that does not exist. ⚠️ The card stays a **direct child of
  `#setup`**, because `body.vjview #setup > :not(.card[data-sec="vj"])` isolates it by that
  relationship.
- **Menu navigation:** two cards held 78% of all 376 controls (Your Player 7.5 screens, Match
  3.5), so each now shows **one `.subpane` at a time** behind a `.subtabs` chip row — `SUBTABS`
  declares the groups, `showSubTab(group, pane)` switches. Seven groups now: `match`,
  `player`, `options`, `theme`, `sound`, `feel` and `replay`.
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
  **the `/vj` route** while the game runs fullscreen. **Default off**; `sel.vj.on` is the only part
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
  ⚠️ **THE DECK SURFACE IS THE `/vj` ROUTE, FULL SCREEN, AND IT IS GONE FROM
  `/settings`** (`vj/index.html`, `VJVIEW`, `vjOpenView`, `body.vjview`). It built into
  the settings accordion and was reported looking exactly like what it was: a DJ rig
  squeezed into a 460px settings column. The route is the /settings stub mechanism — it
  fetches the one index.html and flags itself `vj` — so the decks are the same code
  everywhere; the page then strips itself to the VJ card at full width by CLASS, never by
  deleting nodes. /settings and the in-game card keep a signpost link (`#vjOpenBtn`,
  `a.ghost` — the ghost dress had to learn anchors, or it rendered as a blue hyperlink).
  ⚠️ **Two traps, both shipped for one build each**: a bare `[data-sec="vj"]` selector
  matches a JUMP-BAR CHIP before the card (chips carry `data-sec` too), so the class came
  off the chip and the route was a heading with nothing under it; and `initCollapsibles`
  runs after the view builder at boot and re-collapsed the page's one card — the
  accordion machinery stands down under `VJVIEW`. `tests/vjroute.mjs` measures rendered
  boxes, not classes, for exactly that reason.
  ⚠️ **A YOUTUBE VIDEO CAN BE THE BACKGROUND, AND IT CANNOT BE A DECK — that is a
  platform fact, not a choice** (`vj.yt`, `ytIdFrom`, `vjYtSync`, `vjYtA`, the `yt`
  command; panel row under Video decks). The embed iframe is the only way YouTube plays
  and an iframe cannot be drawn into a canvas, so it cannot be filtered, tinted,
  crossfaded or beat-synced, and its audio cannot join the mix. What it CAN be is the
  layer behind everything: the iframe sits UNDER the canvas (DOM order — it is the
  element before `#game`, both fixed, no z-index) and `vjPaintVideo` punches the painted
  ground translucent with `destination-out` at the exact seam the decks already own.
  Everything painted before the seam — surround, court, mow, a `DYN_FIELDS` painter —
  lets the video through by the layer's opacity; markings, trails, discs, ball and HUD
  paint after and stay opaque, so both structural guarantees survive untouched.
  ⚠️ **The punch runs at IDENTITY transform** (`setTransform`), because the seam sits
  inside `pitchXform` plus the turf tilt: punched in that frame, deck view's quarter-turn
  cuts a rotated rectangle and leaves the screen corners sealed — and at rotation zero
  the mistake is invisible, which a sabotage proved by passing every other check.
  ⚠️ **The ID is a security boundary**: it is interpolated into an iframe `src`, so
  `ytIdFrom` accepts exactly eleven `[A-Za-z0-9_-]` (from watch/youtu.be/shorts/embed/
  live URLs on YouTube's OWN hosts, or bare) and the command validates AGAIN game-side —
  the /settings panel is a peer, not a trust boundary. A `watch?v=` on any other host
  parses to nothing.
  ⚠️ **No script of YouTube's enters the page** — no IFrame API, no SDK. A plain embed on
  the privacy-enhanced domain (`youtube-nocookie.com`), muted (autoplay policy requires
  it, and the audio could not join the bus anyway — the media is cross-origin). Like the
  leaderboard's sheets endpoint: a service called when asked, and the game stays
  dependency-free and works offline with the layer simply dark.
  ⚠️ **In `vj`, never `sel`** — tonight's video is not a setting (the arcade-takings
  argument). VJ OFF parks the layer and keeps the id, so switching the rig off is not
  choosing a new video; PANIC clears the id outright. `tests/vjyt.mjs`, whose probes are
  the canvas's own ALPHA channel — the iframe never loads in a headless run, but the hole
  in the canvas either exists or it does not.
  The limiter is inserted on arm and **removed** when VJ Mode is off, so "additive" is literal.
  `Aud` gained buses (`sfxBus → mainMix → master`); with VJ off that is three unity gains and
  nothing else. Goal ducking dips the MUSIC bus only, hooked in `playSfx('crowd')` so a fifth
  goal path can't forget it. Auto-replay is suppressed while VJ Mode is on — it would hijack
  the projector for six seconds.
  ⚠️ **EVERY DARK OR SILENT STATE NAMES ITS OWN CAUSE** (`vjVStatText`, `vjAStatText`,
  `vjYtStatText`, the `.vjstat` lines). *"Both video decks don't do anything"* was a clip
  loaded perfectly and sitting behind an opacity of zero, with nothing on either screen
  saying which of four dials (arm, VJ on, opacity, crossfader) held it dark. A rig is a
  stack of gain stages, so "working" and "dark" look identical without a readout — the
  status line is the fix, and the states are ordered by which dial to reach for first.
  ⚠️ **A FRESH LOAD OPENS THE DECK** (`vjLoadVideo` lifts opacity 0 → 1 and clears the
  transport). What is LIVE is still the crossfader's call, so this surprises nobody — a
  deck faded out stays dark until TAKE — and pulling opacity back to zero still buys the
  not-decoded saving. Shipping the deck born dark was the same shape as `sel.controllers`
  shipping `off`: a feature nobody can reach is a feature that does not exist.
  ⚠️ **VIDEO TRANSPORT: PAUSE IS A FLAG, NEVER AN OPACITY** (`v.paused`, `vplay`, `vskip`,
  `vseek`, `vjVideoWants`). Pause used to be spelled "drag opacity to zero", which also
  blanks the picture — a pause that hides the frame is a stop. `vjVideoPlay` plays only
  when the deck has a reason to run AND is not paused, so raising opacity does not restart
  a paused deck. `vskip` is computed off the ELEMENT's clock, never the panel's copy of the
  position — that is a 20Hz snapshot, and a skip against a stale position lands twice.
  ⚠️ **EXPLICIT LOAD/EJECT PER DECK, and the library offers → A / → B on every row.** The
  single "→ offline deck" button loaded whichever deck the crossfader said was faded out —
  a sensible house rule and a terrible secret, reported as *"can't change the song"*. The
  rule survives as ADVICE (the library note, and each deck's status line says which is
  dark), never as the only door. `vjEject` empties the channel but keeps the board
  position (opacity, rot, EQ) — ejecting a clip is not resetting a channel strip.
  ⚠️ **THE YT DEFAULT OPACITY APPLIES ONLY TO A FRESH ID ARRIVING WITH NONE SET.** It
  fired on every `yt` command, so the SHOW-THROUGH slider dragged to zero snapped straight
  back to 0.55 — reported as *"the background video at 0 still shows a video"*, and it was
  exactly that. An explicit zero is the operator's zero. ⚠️ **At zero the layer is
  COMPLETELY gone**: `#ytbg.dark` (visibility:hidden) as well as the skipped punch, so
  nothing depends on the canvas happening to be opaque over every pixel of the iframe —
  and the iframe is HIDDEN, not removed, because removing reloads the embed and restarts
  the video mid-set. ⚠️ The layer's status line says **🔇 always silent** and why —
  *"audio from the YouTube video not working"* is a platform fact (the media is
  cross-origin, playable only inside its own frame), and a layer that states that in the
  UI stops looking broken. Its panel row also carries a thumbnail (`i.ytimg.com`, network
  like the embed itself, `onerror` hides it offline).
  ⚠️ **ROTATION IS THE CLIP'S OWN QUARTER-TURN** (`v.rot` 0..3, drawn in `vjDrawFit`),
  deliberately independent of `pitchXform`/`cam.rot`: the pitch's turn is a property of
  the ROOM and this one is a property of the CLIP. The fit is computed against the clip
  AS PRESENTED — dimensions swapped for an odd turn — so cover still covers and contain
  still fits after the turn; `tests/vjdecks.mjs` measures all four turns in pixels,
  because "rot is stored" passes on a build that never reads it. The rotation happens
  inside the fit pass, so the filtered path's half-scale intermediate needs no change.
  ⚠️ **THE PANEL PREVIEWS FROM ITS OWN COPY OF THE BLOB** (`vjSendFile` →
  `vjPreviewLoad`): the panel already holds the file it sent, so a muted `<video>` per
  deck monitors the clip with nothing streamed back from the game page. It follows the
  deck's transport loosely (re-seeks only past 0.75s of drift) — it is a monitor, not a
  frame-lock. The audio decks' meters were already in the snapshot.
  ⚠️ **THE TICKER MESSAGE RIDES THE CUP TICKER'S BAR** (`vj.ticker`, the `ticker`
  command, `vjTickerSync`, `tickerFill`). Type a line on the panel and it scrolls over
  the game, repeating until STOP. `#cupTicker`'s marquee, `pointer-events:none` and the
  reduced-motion `.still` rule are exactly what a message bar needs, so `tickerFill` is
  extracted as the one place the bar is filled and both callers go through it. The
  ownership rule: while a VJ message is up (`vjTickerOn`), `cupTickerStart` leaves the
  bar alone and `cupTickerStop` still clears the cup's timeout but does not hide it.
  Shown only while VJ Mode is on (off must stay the untouched game), spans built as
  NODES because the message is typed by a person, in `vj` never `sel` (tonight's words,
  the video-id argument), and PANIC clears it. `tests/vjdecks.mjs` holds all of this.
  ⚠️ **THE TIMELINES ARE SEEK BARS, NOT PICTURES** (`vjSeekBar`, `vjDrawVTime`; the
  audio WAVEFORM canvas and the video deck's TIMELINE canvas). Reported as *"allow me
  to skip songs by clicking on that timeline"* — the waveform drew a playhead and
  ignored every click. Click to jump, drag to scrub (moves throttled to ~45ms so a
  drag does not flood the channel). ⚠️ **Canvas pointer events, deliberately NOT a
  range input**, twice over: the waveform already IS the timeline, so a slider under
  it says the same thing twice; and `SLIDER_GRAB` refuses track taps on touch sliders —
  right for a settings column you scroll with a thumb, exactly wrong for a seek bar
  whose whole job is jump-to-here. ⚠️ The panel handler reads the DURATION off
  `vjView` and the command clamps against the deck's own — the panel is a peer.
  ⚠️ A test clicking a canvas in the COLLAPSED card reads a zero-width rect and every
  click lands at position 0 — open the card first or the check is vacuous.
  ⚠️ **A PANEL BUTTON MAY NEVER WRITE STATE IN ITS OWN WINDOW, and two did.** The
  panel's local `vj`/`VJ` are factory defaults forever — it draws from snapshots — so
  the TAKE-quantisation buttons set a `VJ.takeQuant` nothing reads (three dead buttons),
  and Save preset captured the panel's untouched defaults and called them the live
  board. Both are COMMANDS now (`takeQuant`, `presetSave`); the full snapshot carries
  the preset NAME list so the panel knows when to redraw its shelf (localStorage is
  shared, so it reads the bodies itself). ⚠️ `vjExec` follows every executed command
  with a throttled meter-sized push — a backgrounded game tab throttles rAF, which
  starves `vjTick`, and a knob that echoes back a second late reads as broken.
  ⚠️ **DROP A FILE ON A DECK AND IT LOADS THERE** (`vjDropZone`, on every strip; the
  library list takes drops too). The literal reading of "drop into Deck A or B", and
  the third door in beside the deck's LOAD and the library's → A / → B. **Strict about
  kind**: a video dropped on an audio deck flashes a refusal (`.badfile`) rather than
  landing somewhere a rule picked — a drop that guesses is the "→ offline deck" secret
  coming back through a window.
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
  ⚠️ **"Update now" RACES THE SERVICE-WORKER CHECK AGAINST A TIMEOUT** (`UPD.swWait`,
  2.5s). `updApply` disables the button, writes "Updating…", then `await`s
  `reg.update()` before `location.reload()` — and that is a NETWORK fetch, so a dead
  connection, a captive portal or a proxy that never answers left the page sitting on
  "Updating…" with the reload unreachable. The one button a hard update gate offers, doing
  nothing: the "a button that silently does nothing reads as a broken game" rule, on the
  screen where it costs most, because `updEnforce` sets `running = false` and there is no
  way past it. The reload is what the player asked for and the worker check is a nicety on
  top, so it may delay the reload and may never prevent it. ⚠️ It was **red on `main`** and
  read as an environment quirk for several sessions — `tests/updatecheck.mjs` clicks the
  real button and waits for a real navigation, so the hang shows up there as a bare
  `waitForNavigation` timeout with nothing naming the cause.
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
- **THE EXPORT ON THE TRANSPORT FILMS WHAT YOU ARE WATCHING** (`#repVidBtn`,
  `replay.doc`, `_repFilmDoc`). Every other export picks its scope from a menu; this one
  is the only one whose scope is *whatever is on the screen* — a goal replay saves the
  goal, a whole-match replay saves the match.
  ⚠️ **THE LABEL IS HALF THE FEATURE**, which is why `repCtlShow` reads the kind off the
  document rather than leaving one word for both: a button reading "Match video" over a
  goal replay is a promise the file will not keep, and the two files differ by minutes.
  ⚠️ **IT CANNOT RECORD WHILE IT IS PLAYING.** `playReplayFile` returns at its first line
  when `replay.active` is set, so a recorder started from the button's own click films an
  empty file. The button therefore only MARKS the document and calls `replayAbort()`; the
  recording happens in **`watchReplayFile`'s `finally`** — the one moment `replay.active`
  is false *and* `hideScreens()` is still in effect, so you watch it being filmed instead
  of staring at a menu for the length of a match.
  ⚠️ Which is also why `replay.doc` exists at all: the transport is UI and the thing being
  watched is a document one layer down, so it is stashed on the way in and cleared in the
  same `finally` that restores the world.
  ⚠️ **A match is filmed at 1×, a goal at the transport's own speed** — the split
  `saveMatchClip` and `saveClip` already make. A match is watched at the speed it happened;
  a goal is the thing worth slowing down, so a slowed-down goal exports slowed down.
  ⚠️ `tests/replayfile.mjs` drives the REAL button and awaits the real `watchReplayFile`
  promise: calling `recordAndShareClip` directly would prove nothing about the wiring,
  which is the entire feature.
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
- **THERE IS NO MID-MATCH REPLAY BAR** (`#replayBar`, deleted). A "⟲ Replay" button
  appeared under the scorebug at the first goal and then **sat there for the rest of the
  match** — `repOnGoal` showed it and only `repReset` (a new match) ever took it down. So a
  control meant for the seconds between a goal and the kickoff was parked over the pitch
  during open play, which is how it was reported.
  ⚠️ **DELETED, NOT HIDDEN.** Hiding it would have left dead markup, dead CSS and a dead
  handler, and this file's standing rule is that a control nobody can reach should not
  exist. The goal still plays itself back (`sel.autoReplay`), auto-record still keeps it,
  and watching or saving one lives where there is nothing to interrupt: the replay
  TRANSPORT, the result screen and the Replays card.
  ⚠️ What is lost is the manual "show me that again" DURING play with auto-replay switched
  off — which is the setting whose whole point is not being interrupted.
  `tests/gamesave.mjs` and `tests/replayfile.mjs` both used to assert what was ON the bar;
  they assert it does not exist now, which is the stronger claim.
- **THE PANEL ROUTE IS `/menu`, AND `/settings` IS A REDIRECT** (`detectPanel`,
  `settingsUrl`, `menu/index.html`, `settings/index.html`, `sw.js`' `ASSETS`). Renamed on
  request: the accordion behind KICK OFF **is** the menu — eleven cards of it, of which
  Options is one — so a route called "settings" named a fraction of what is on the page.
  ⚠️ **THE RENAME ONLY EVER ADDS A SPELLING.** `detectPanel` accepts `menu`, `settings`
  and `vj` in all three forms (the `__MAGNETPANEL` flag, `?panel=`, and the pathname),
  because a page cannot fix somebody's bookmark: `/settings` has been the panel route for
  the whole life of the feature and the service worker **precached it**, so an
  already-installed copy can reach this file under the old name for as long as that cache
  lives. `settings/index.html` is now a `<meta refresh>` **and** a `location.replace` —
  the meta for scripting-off and crawlers, the replace so the dead URL stays out of the
  back button — and it is still in `ASSETS`, so the redirect works offline too.
  ⚠️ **`settingsUrl()` KEPT ITS NAME.** It is on the debug hook and four suites plus two
  call sites ask for it; only what it returns had to move. `tests/panel.mjs` navigates the
  legacy route rather than reading the file — a redirect that does not fire is a file with
  the right words in it.
- **THE MENU TAB'S MATCH BUTTONS ACT ON THE GAME WINDOW** (`syncAct`, `SYNC_ACTS`,
  the `act` message). `/settings` is the same document with the game switched off, and its
  two "play" buttons were broken in opposite directions: **KICK OFF was hidden outright**
  (`body.panel #setup #playBtn { display:none }`), so the one screen you set a match up on
  had no way to start it; and **Warm-up was NOT hidden**, so pressing it started a match
  *inside the settings window* — measured as that tab sitting in state `kickoff` with
  `#game` at `display:none`, a frame loop running behind a settings screen that nobody can
  see and nobody is driving.
  ⚠️ **They are COMMANDS now**, on the channel the VJ decks already use, and one-way for
  the same reason: only the game runs a match. `SYNC_ACTS` is the one table of what a panel
  may ask for.
  ⚠️ **It says so when nothing is listening.** A settings tab on its own cannot start
  anything, and a button that silently does nothing reads as broken — `syncPeerLive()` is
  the same predicate the panel already uses to know a game page is there.
  ⚠️ **`startMatch` REFUSES OUTRIGHT in a panel**, which is the backstop for every other
  route in (a drill tile, a season round) rather than a second copy of the forwarding.
  ⚠️ `tests/panel.mjs` asserted `panelHidesPlay` — that check is REVERSED now, and both
  halves are checked every time: "the game started a match" passes on a build where the
  panel also started one invisibly, and "the panel started nothing" passes on a build where
  the button is dead, which is where this began.
- **WARM-UP FROM THE RESULT SCREEN KEEPS YOUR SIDE** (`enterWarmup`'s `keepSides`,
  `restartToWarmup`). `enterWarmup` spreads everybody along the halfway line so nobody is
  pre-committed — right when you open the room from the menu, and wrong coming out of a
  match: warm-up there means *"same again, but let me change something first"*, and
  pressing START immediately gave a **different** match. Measured on a 3v3: `You` came back
  on team 1 and `P2` on team 0 — **the sides swapped**. On a solo game it is worse than a
  shuffle, because `lobbyPlan`'s undecided rule puts a lone player on team 0 whichever half
  they had.
  ⚠️ **The SIZE comes back too** (`w.lobby.per`), counted off the BODIES rather than the
  mode: the lobby stepper and a mid-match drop-in can both have taken the match away from
  `mode.per`, and "the same match again" means the size it actually finished at.
  ⚠️ Placed past `LOBBY.neutral` so `lobbySideOf` reads it as a real pick, and well inside
  the touchline so `lobbyOutside` does not read it as sitting out. `_px`/`_py` are set with
  it, or `ix`/`iy` interpolate the body across the pitch for a frame.
  ⚠️ **The CONTROL is that a room opened from the MENU still starts everybody undecided** —
  without it, "sides are kept" is satisfied by a build that pins everybody to their team's
  half always, which would take away the one thing the lobby is for. `tests/warmuproom.mjs`.
- **START ON THE RESULT SCREEN GOES STRAIGHT TO WARM-UP** (`pollOverOptions`). It used to
  be folded in with A and KICK as a second CONFIRM button, so the only way into the room
  from a result screen was to walk the cursor onto the Warm-up option first.
  ⚠️ **START already means "get me playing" everywhere else** — it begins the match from the
  lobby, and `pollSeatRotate`'s idle branch opens warm-up with nothing running — so the
  result screen was the one place it meant something else.
  ⚠️ **KICK and A still confirm the cursor**, so nothing that was reachable stopped being
  reachable; this takes a meaning away from START and gives it the one the rest of the game
  uses. ⚠️ And it **falls back** to confirming the cursor where warm-up is not on offer (a
  phone with no controller, a cup tie or a Gauntlet run borrowing that button for Menu /
  Cup), or START would be dead on exactly those screens.
  ⚠️ Through the BUTTON's own click, never a second copy of what warm-up means —
  `restartToWarmup` is the action and `syncWarmupOffer` decides whether it is offered.
  ⚠️ The check has to start with the cursor **somewhere else**, or it passes on the old
  build too. `tests/warmupoffer.mjs`.
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
  ⚠️ **THE ZOOM SLIDER IS THE ONLY THING THAT DECIDES THE PUSH, and it used to ride the
  Screen shake & effects toggle as well** — which made Goal zoom a **DEAD CONTROL** whenever
  the shake was off: you could drag it 1.0× → 8.0×, watch the readout change, and nothing on
  the pitch would ever move. Reported as wanting the zoom without the shake, and it is the
  NO DEAD CONTROLS rule — a control that silently does nothing is a promise the page cannot
  keep. `goalCamStart` reads nothing but `goalZoom()` now, and **1.0× still means off**
  (`goalZoomLabel()` reads `off` at that end, so the one way to switch it off is labelled).
  ⚠️ **They are different KINDS of motion**, which is the argument hit stop and rumble
  already won: a shake is the whole picture thrown about at random — a vestibular problem —
  and a push-in is a slow, predictable move toward the thing you are already looking at.
  ⚠️ **The accessibility half is NOT lost, it MOVED**: `prefersReducedMotion()` turns the
  zoom dial off on a first run exactly as it does `sel.juice` — a DEFAULT, never an
  override, so the dial keeps working on the devices whose owners want it back.
  ⚠️ **AN EXISTING EFFECTS-OFF INSTALL IS MOVED ON, ONCE** (`magnetball.zoomfold`). Those
  players have never had a goal camera, so uncoupling would hand them a 1.8× push at every
  goal unasked — the opposite of what turning effects off meant. Only an **untouched** zoom
  dial is folded (`sel.goalZoom === defaultSel().goalZoom`): somebody who deliberately set a
  zoom was being *denied* it, which is the bug being fixed rather than a preference to keep.
  ⚠️ **One-shot**, the `magnetball.lookfold` rule: unlike a pure key rename this is
  reversible by hand, so an unguarded fold would switch the zoom back off every morning.
  The key is stamped whether or not anything moved, or somebody who turns the shake off
  LATER — in the new world where it no longer touches the zoom — would be folded then.
  ⚠️ **`saveSel()` inside the fold is safe and is ONLY in the branch that changed
  something.** The bootstrap must not write `magnetball.sel` in general — its absence is how
  `isFirstRun` works — but that branch requires `sel.juice === false` against a default of
  `true`, so reaching it proves a save already exists.
  ⚠️ **The reduced-motion check in `tests/taptargets.mjs` STAMPS THE FOLD KEY FIRST, and
  without that it is vacuous** — verified by a sabotage that passed. The fold fires on
  exactly the state a reduced-motion first run produces, so with it live both mechanisms
  drive the dial to 100 and the first-run default can be deleted with every check still
  green. `tests/goalcam.mjs` holds the uncoupling from both ends and all three fold cases.
  Amount and speed are **sliders** —
  `goalZoom()`/`goalZoomSecs()` clamp and default in one place, and **1.0× means off**
  (the camera never even latches). ⚠️ `const GOALCAM` lives with the feel constants, not
  with the camera code: the slider wiring reads it during the bootstrap, and declared
  further down it was in the temporal dead zone there.
- **THE HUD MARKS ARE DRAWN, NOT TYPED** (`ICONS` → `iconSvg` → `#pauseBtn`, `#muteBtn`,
  `#fsHudBtn`). Mute shipped as `🔊` and rendered as a **full-colour emoji megaphone** beside
  a monochrome `⏸` and `⛶` — the one illustrated thing in the row, and reported as exactly
  that. ⚠️ **The other two were monochrome only by luck**: `⏸` and `⛶` are TEXT glyphs whose
  presentation the platform decides, so on a phone — where this game is mostly played — they
  can come out as colour emoji too. An inline SVG at one stroke weight in `currentColor` is
  identical everywhere, which is the whole reason the icon set exists. All three now go
  through it and `ICONS` already had `pause`, `sound`, `mute` and `expand`, so no new artwork.
  ⚠️ **`#resetBtn` keeps its `↺`** — there is no undo mark in the set and inventing one is a
  different job. It shares the button rule, and flex centring holds a text glyph as happily
  as an SVG.
  ⚠️ **Full screen's MARK does not change with the state** — one `expand` icon, with the
  `aria-label` carrying which way it goes, exactly as it did with the glyph.
  ⚠️ `tests/taptargets.mjs` checks the drawn mark **alongside** the 44px reach, on purpose:
  an inline SVG is a child element, so this is precisely the change that can quietly become
  what `elementFromPoint` returns. `reach`'s `hits()` accepts `el.contains(t)`; the two
  assertions together are what say so.
- **THE PITCH PICKER IS GROUPED BY SHAPE** (`fieldShape`, `FIELD_SHAPES`,
  `buildFieldShapeTabs`, `setFieldShapeTab`, `#fieldShapes`). Square · Rounded · Other, each
  showing every size — the field list was one flat grid of 33.
  ⚠️ **A field's shape is `(corner, cut)`, and it is THREE PHYSICS CLASSES rather than a
  continuum**, which is what makes a tab honest: `buildGeometry` emits a plain rectangle for
  `corner === 0`, **four arcs** for a rounded one (`collideArc`) and **four extra straight
  walls** for a chamfered one (`collideWall`). `DYN_FIELDS.pooltable.path` and
  `drawFieldPreview` carry the same three-way branch.
  ⚠️ **ONE classifier**, and this was the fourth place the expression was about to be
  written — the map maker's corner-style picker had it inline and reads `fieldShape` now, so
  the tab you browse under and the control you build with cannot drift. Only the third NAME
  differs: the picker says *Chamfered* because you are choosing that corner, the browse tab
  says *Other* because it is a catch-all for anything that is neither square nor rounded.
  ⚠️ **Truthiness, never `in`.** A shipped field mostly OMITS `cut`; `mapClean` always emits
  it as a real boolean. `!!f.cut` covers both, and a custom map therefore files itself.
  ⚠️ **The tiles are HIDDEN by a `data-shape` attribute, not moved.** `#fields` stays exactly
  one `.opts.tilewrap` holding all 33, because `#fields .opt` is what `tests/audit.mjs`,
  `tests/grasstiles.mjs` and the map maker's own picker check all mean by "the Field picker".
  ⚠️ **NOT `.subtabs` / `.subpane` / `.subchip`, deliberately.** `showSubTab` scopes to the
  whole CARD and toggles every `.subpane` in it, so a nested pane would be blanked by the
  Match card's own chips — and `menuSearchIndex`'s `paneOf` uses `closest('.subpane')`, so
  every field tile would report its SHAPE as its pane and all 33 would silently drop out of
  the search index in show mode. Its own class names keep `paneOf` answering `pitch`.
  ⚠️ **The open tab is DERIVED from `sel.field`**, so the pitch you have selected is always
  the one you can see — and held in a `let` too, because `buildOpts` rebuilds the tiles on
  every pick and a tab you switched to without picking has to survive that.
  ⚠️ **`menuSearchGo` activates the tile's group.** Without it, searching a rounded pitch
  scrolls to a tile with no height; `tests/menufind.mjs` measures that, and it passed before
  only because Colossus happens to be square and Classic is the default.
  ⚠️ **The area sort is untouched**, within each group — `buildOpts` sorts fields by `W*L`,
  so every tab still reads small → large. Grouping by shape is explicitly not grouping by
  size. A group with no members hides its chip (the `buildSubTabs` precedent).
- **THE HUD CORNERS PEEK** (`HUDPEEK`, `hudPeekAt`, `hudPeekInit`, `#hud.peekL/.peekR`).
  The pitch is the picture, and three pills parked over it every second of every match are
  furniture. Pause lives in the top-left corner and mute + full screen in the top-right, so
  each side fades in when the pointer goes to the corner it is already in.
  ⚠️ **The SCOREBUG never fades** — it is the one thing on that row you are *reading*
  rather than reaching for.
  ⚠️ **NO HOVER-CATCHER ELEMENT.** A div over the corner would have to be
  `pointer-events: auto` to receive a hover, which makes it a lid over that part of the
  pitch — and `zoneForTouch` splits the WHOLE screen into a move half and a kick half, so
  there is no spare region to put one in (the same argument `SWIPEPAUSE` makes for being a
  gesture rather than a region). One throttled `pointermove` adds no hit area at all.
  ⚠️ **DESKTOP ONLY**, gated on `(hover: hover) and (pointer: fine)` in the CSS *and* in
  the listener. There is no hover on a phone, so a fade there is a control nobody can bring
  back; the touch build is byte-for-byte the behaviour it always had, which is what keeps
  the 56px `SWIPEPAUSE` strip and `zoneForTouch` untouched.
  ⚠️ **`pointer-events` goes with the opacity.** An invisible-but-clickable 44px target in
  the corner is worse than either state — it eats a click on the pitch, which is the
  `#lobbyStartBtn` bug from the other direction.
  ⚠️ **`:focus-within` is not optional**: without it the buttons are unreachable by keyboard
  outright, because you cannot hover in order to Tab.
  ⚠️ The class is written only when the answer CHANGES — this fires on every mouse move, the
  same argument `syncTiltUI` makes. And `syncTiltUI` writes an inline `transform` on `#hud`
  itself, so the fade lives on `opacity` on the CHILDREN and the two cannot fight.
  ⚠️ **A HIT TEST ALONE PROVES NOTHING HERE, and a sabotage got through on one.** The fade
  and the `pointer-events` are two separate rules, so a build that keeps the buttons fully
  VISIBLE and merely unclickable passed "the corners are out of the way" — which is the
  worst of the three states: three pills over the pitch that do nothing when pressed. Same
  trap on the keyboard check, where the `:not(:focus)` exemption keeps a focused button
  hittable at opacity 0. `tests/taptargets.mjs` reads **opacity and the hit test together**,
  on a desktop-shaped page — every other probe in that file runs on a `hasTouch` context
  where the query does not match and the whole feature is invisible to them.
- **MUTE IS A SHORTCUT, NOT A SECOND PIECE OF STATE** (`#muteBtn`, `#ovMute`, `toggleMute`,
  `syncMuteUI`, `buildSndMaster`). `sel.snd.muted` has existed since the Sound card was
  written and is read by exactly one predicate — `Aud.on()`, which guards `tone()` and
  `noise()`. The HUD button and the pause row write that same flag, so there is nothing to
  keep in step and **no audio-graph change at all**.
  ⚠️ **`playSfx` must never grow a mute early-return.** It is the single funnel for
  `vjDuckGoal()` and `rumbleGoal()` — the whole reason those hang off `playSfx('crowd')` is
  so a fifth goal path cannot forget them — and a check at the top would silently kill goal
  ducking and pad rumble along with the sound.
  ⚠️ **`saveSel()` is mandatory, not tidiness.** `syncAdopt` SHALLOW-merges `sel`, so `snd`
  is replaced wholesale by whatever the other window holds: toggle without pushing and
  `/settings` still says `muted:false`, and its next write of any unrelated setting shoves
  that stale `snd` back and un-mutes the game.
  ⚠️ **It does NOT call `buildSettings()`** — a ~24ms re-render of a menu that, pressed from
  the HUD, is not even on screen. `buildSndMaster()` was extracted so the Master tiles can
  be repainted alone, which is also what stops the tiles and the toggles disagreeing.
  ⚠️ **VJ music is deliberately NOT covered.** It rides its own bus and `Aud.on()` never
  sees it. Muting by gain instead would put a **second owner on `master.gain`**, which
  `Aud.setVol`, the VJ master fader and `vjPanic` all write already.
  ⚠️ **Measured as SILENCE, not as a flag.** `tests/audit.mjs` counts oscillators and buffer
  sources built on the live `AudioContext` across two `playSfx` calls: muted must produce
  **zero** and unmuted several. "The flag flipped" is true of a build where nothing reads it,
  and there are three writers now.
- **TWO QUICK TOGGLES ON THE PAUSE SCREEN** (`#ovMute`, `#ovFull`), above Show mode because
  those are the two you reach for and that one is a mode switch for guests.
  ⚠️ **FIVE places must be kept in step**, and a miss in one of them is invisible until
  somebody picks up a controller: the markup, the icon-flex CSS list, **`overButtons()`**
  (a button missing from that array is unreachable by gamepad entirely), the `navsel`-
  clearing array in `showOverlay`, and the `resumable ? '' : 'none'` gating beside it.
  ⚠️ **DOM order IS `overButtons()`' order** — a D-pad walking a different order from the
  one on screen reads as a broken cursor.
  ⚠️ **Neither marks itself `navsel`, and `syncShowLock` does.** `navsel` is the CONTROLLER
  CURSOR on this screen (`syncOverNav` writes it), so a toggle wearing it permanently is a
  second thing claiming to be the selection — and three of them would make the cursor
  unfindable. The LABEL carries the state, which is what "says which state it is IN" was for.
  ⚠️ **Pause only**, the argument `ovSettings` and `ovShowLock` already make. But unlike
  `#ovSettings` they are **not** hidden in show mode: sound and full screen are exactly the
  two things a guest legitimately reaches for and neither is a setting they can break.
- **THE SCORE IS THE READOUT AND THE CLOCK IS NOT**, and it shipped the other way round.
  Measured at 1× on a 390px phone at 0–0: the score rendered as **two tiny coloured blocks**
  — the Kenney zero at 16px is a filled rectangle whose counter disappears — beside a wide,
  bright yellow `5:00` that read instantly. 0–0 is what every kickoff shows and what the
  menu's attract demo shows, so the *least* important number was the legible one on the
  first frame anybody ever sees. Score 30px, clock 11px and quiet.
  ⚠️ **The team INKS stay**: they are what says which number is whose, and red-then-blue is
  the order the result screen and the match history read in too.
  ⚠️ The glows `.rd`/`.bl` carried were **already dead** — `body * { text-shadow: none }`
  kills them — so they are gone rather than left looking load-bearing.
  ⚠️ **`opacity` is 0.72 and it was 0.62 for one build**, which measured **3.99:1** against
  Apologies!'s butter-yellow surface, under the 4.5 floor `tests/contrast.mjs` holds every
  label to. Quieting a label by fading it is exactly how an accessibility floor gets broken
  by a taste change; the size does most of the work anyway.
- **SHOT, KEY PASS AND CLEARANCE ARE COUNTED BUT NOT CAPTIONED.** They had floaters and it
  was text spam: a rendered 4v4 frame carried KEY PASS over SHOT over SHOT in one scramble
  plus a stray SHOT over empty grass. `SHOT` fires on every strike including a rebound off
  the boards a few frames later — which is what the per-(player, label) cooldown was
  invented for, and that cooldown was treating a symptom. What is left on the pitch is the
  four that are **events**: GOAL, ASSIST, SAVE, POST.
  ⚠️ **Three `addFloater` calls deleted from beside three `ms.<stat>++` lines that still
  run** — never a filter in `drawFloaters`, which would move the decision away from where
  the stat is counted and break the system's one structural rule.
  ⚠️ Everything cut still appears on the result screen, so the invariant points the way it
  always did: a label can never claim something the result screen will not also show; it
  may stay quiet about something the result screen does show.
  ⚠️ `FLOAT.max` is **8**, down from 20 — with only event labels left there is no legitimate
  way to reach twenty, so a cap that high was a ceiling on the pile-up being removed.
- **THE BUILD STAMP IS DEBUG-ONLY** (`drawBuildTag`). It printed `v20260820…` over the
  bottom-left of the pitch in every match on every player's screen. What it was for survives
  and is better: the About card's version block is a one-tap copy that carries the screen
  size and the layout with it. ⚠️ `tests/debug.mjs` used to assert it "shows regardless" and
  now pins both states.
- **THE NET IS A DIAMOND MESH THAT FADES INTO THE POCKET**, and it shipped as graph paper —
  a uniform axis-aligned grid at full strength, which reads as a texture swatch pasted over
  the goal. Two things fix it and both are needed: the strands run **diagonally**, which is
  what a real net reads as from above and the one thing a square grid can never stop looking
  like; and the whole thing **fades with depth**, from the goal line into the back, which is
  the only cue a top-down view has that the pocket has any.
  ⚠️ The fade is a stroke **gradient**, so it is still ONE `stroke()` — a per-line alpha
  would be one path and one stroke per strand, on a thing drawn twice a frame.
  ⚠️ Clipped to the pocket, because diagonals leave the box by definition. The gradient is
  built in `wx`/`wy` space, *inside* `pitchXform`, so deck view rotates it for free.
- **THE MENU LEADS WITH THE BUTTON THAT STARTS A MATCH.** Measured on a 390×844 phone,
  KICK OFF sat at **y ≈ 525**, under a RECORD card of zeroes and a search box; it is at
  **y ≈ 160** now. Three changes, none of them structural:
  ⚠️ **`syncRecordCard()` hides `#recordCard` until a match has been played** — the same
  "has PLAYED" question `dailyModalWanted` asks, and for the same reason: a record is a
  record *of* something. `0W · 0L · 0D (0 played)` plus four lines of prose about a name
  book nobody has filled in is not a first impression. It is not a `.card.collapsible`, so
  it is in neither the jump bar nor the search index and hiding it costs nothing downstream.
  ⚠️ **`#searchWrap` moved below `#jumpBar`** — a door labelled "search settings" standing
  in front of the button that starts a match is the same mistake the jump bar itself was
  moved for. Searching is what you do when you already know a setting exists and cannot find
  it, which is never the first thing anybody wants from this screen.
  ⚠️ **The `online` card folded into About.** It held **zero controls** — the whole card was
  one paragraph — while costing a card, a jump chip and a search row, which is the exact
  price the file uses to justify deleting the old Ball card. The paragraph survives verbatim;
  only the box round it is gone. `tests/taptargets.mjs` looks for it by its words now.
  ⚠️ **`SECTION_COLLAPSED_DEFAULT` had gone stale twice over** (it still listed `ball` and
  `online`, and had never gained `replay`, `vj` or `about`) — and **`more` is deliberately
  absent**, which is what makes it the one card open on a first run: `initCollapsibles` takes
  the FIRST card whose default is open, and Modes & more is the discovery card. Adding it
  "for completeness" collapses every card and the menu opens as eleven closed bars.
- **THE HUD'S GRID COLUMNS ARE NAMED, and auto-placement put the FULL-SCREEN BUTTON IN THE
  MIDDLE OF THE SCREEN.** Reported as it "showing at center of screen randomly" — not
  random, **every warm-up**. `syncScorebug` sets `#scorebug` to `display:none` in there
  (there is no score to show in the lobby), which takes it out of grid flow; `#hud` is
  `grid-template-columns: 1fr auto 1fr` with nothing placed by hand, so `#hudRight` — mute
  and full screen — auto-placed into **column 2, which is the screen centre**. Measured:
  full screen at cx **1246** in a live match and **661** in warm-up on a 1280 window
  (centre 640), and **356 → 222** on a 390px phone (centre 195).
  ⚠️ **The grid was chosen over a flex row precisely for this guarantee** — its own comment
  says the middle column is the screen centre "whatever sits either side of it" — and then
  did not pin the sides, so a HIDDEN middle broke it from the inside. One line each:
  `#hudLeft{grid-column:1}`, `#scorebug{grid-column:2}`, `#hudRight{grid-column:3}`.
  ⚠️ `#lobbyStartBtn` is a fourth child of `#hud` and is `position:fixed`, so it is out of
  flow and never took a cell — which is why only the warm-up case ever showed this.
  ⚠️ **The check is a DIFFERENCE against the same buttons in a live match, in the same
  run**, never an absolute x: what "the right-hand corner" is depends on the viewport, the
  safe-area inset and whether a dock is open. Paired with "they are in a corner at all"
  (an outer QUARTER of the viewport, since that block runs on a 390px phone where a fixed
  200px margin is impossible), or "warm-up matches play" is equally true of a build that
  centres them in both. `tests/taptargets.mjs`.
- **THE RESULT SCREEN'S CURSOR WALKS UP AND DOWN, and it only ever read LEFT/RIGHT**
  (`pollOverOptions`). `#overlay` is `flex-direction: column`, so the options stack:
  measured on a 1280×900 desktop the three share one x (498) and sit at y 567 / 640 / 713.
  The poll read `pad.dx` alone, so a D-pad pushed the way the list actually runs did
  nothing — which is how the screen came to be reported as not controller-driven at all.
  ⚠️ **Left/right are KEPT rather than swapped out.** They are the axis that already
  worked; adding an axis must not cost one. `tests/warmupoffer.mjs` asserts both, because a
  build that simply renamed `dx` to `dy` passes a down-only check while taking the control
  away from whoever has it in their fingers.
  ⚠️ **`pad.dy` is positive DOWNWARD** (`pollKeys` writes +1 for ArrowDown), so down is
  `overNav++` — the list walks the way it reads, the same rule `overButtons()` follows by
  being in DOM order.
  ⚠️ **The LAYOUT is measured in the same run, never assumed**: "up and down" is the right
  claim only while the buttons really are stacked, so if they ever become a row the check
  fails rather than quietly testing the wrong axis.
  ⚠️ A probe must drive the real pad — `padFor(host)` returns `gamepadPad(...)` for a
  gamepad seat, so writing `pads.p1.dx` moves nothing and reads as the fix not working.
- **A JOIN PROMPT SAYS WHAT THE GATE TAKES** (`drawSubPrompts`, `subWaitFor`).
  `pollSubReady` has accepted START, SELECT **or any kick button** since it was written —
  measured, thirteen of seventeen indices — and the prompt said `START = JOIN HOME`. So a
  pad without one read as a pad that could not join: the label was the whole of the bug,
  and the label is the part the player actually reads. It says ANY BUTTON now.
  ⚠️ The D-pad stays out here too, and for a sharper reason than in warm-up: a benched body
  **walks** with it along the touchline to pick a side, so counting it would arm and
  disarm them on every step.
- **HUD:** a 3-column grid — pause left, scorebug in the **middle column** (so it is centred
  on the screen, not among whatever buttons happen to show), fullscreen right. Settings is a
  **pause-menu** option (`ovSettings`), not a HUD gear one mis-tap from the live ball.
- **`#matchBody` NEEDS THE CARD'S WIDTH, and without it the menu was unusable on a phone**
  (`align-self: center; width: 100%; max-width: 460px`). `#matchCard` is `display: contents`
  — see the entry below, which is why — so `#matchBody` is a flex ITEM of the scroll column
  rather than a block inside a card, and `.screen` centres its items. With no width of its
  own it shrink-to-fits to **max-content**: measured at **531px inside a 449px viewport**
  and **−72..462 inside a 390px one**, centred, so it hung off BOTH edges at once. Six or
  seven tiles per pane were off screen — the pitch picker, the modes, the bots — and
  unreachable, because the overflow lands on `#setup`, which nobody thinks to swipe
  sideways.
  ⚠️ **The hero bar directly above it already carries this exact rule for this exact
  reason**; the body simply never got it, and every other section is a plain `.card`, which
  has `width:100%; max-width:460px` built in and so never had the problem. That is why one
  card was broken and ten were fine.
  ⚠️ **It is the CARD's 460px, not the column's** — the same note the hero bar makes: a body
  wider than the cards either side of it reads as misaligned.
  ⚠️ `tests/chipreach.mjs` holds it, which is the right home rather than a new suite: that
  file is about *a control drawn on screen that no input can reach*, and this is the same
  class by a different mechanism. Its chip probes could not see it — they measure rows, and
  this is the container the rows sit in. ⚠️ Measured **two ways**, because neither is
  sufficient: `scrollWidth - clientWidth` on `#setup` misses a build that clips with
  `overflow:hidden`, and tiles-past-the-edge passes on a pane that renders nothing — so the
  tile COUNT is asserted too. ⚠️ The scan is `.opt` **and `.navtile`**: Modes is nav tiles,
  and a scan for `.opt` alone reported zero controls there, which the count guard caught.
  ⚠️ The `.subtabs` chips are **excluded** — that row scrolls sideways on a phone by design,
  and including them would make this check contradict the one above it in the same file.
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
`tests/run.mjs` runs all 129 suites IN PARALLEL (~350s, against ~1,000s serial; `MB_JOBS=1`
forces serial for reproducing a flake, and the two timing-sensitive suites run alone).
⚠️ **One suite is RED ON PURPOSE**: `tests/proladder.mjs` measures the bot difficulty ladder
at the SHIPPED default and the shipped default breaks it — see the Pro-feel entry above. A
green run is therefore **128 green + proladder red**, and `proladder` going green means the
steering was retuned, not that something regressed. `tests/README.md` lists what each covers and the measurement
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
