# Magnetball — TODO

Near-term, actionable task list. For the larger feature backlog (tiers, effort
estimates, community asks), see [`../ROADMAP.md`](../ROADMAP.md).

Status legend: `[ ]` open · `[~]` in progress / uncommitted · `[x]` done · `[-]` parked/won't-do

_Current build: **v20260805.0110AM** (shown under the title; bump `VERSION` in `index.html` on every change)._

---

## 🧍 Warm-up lobby, team sides, and cocktail calibration
A new `warmup` world state that runs before `kickoff` whenever pads are in play (or
cocktail is on). Keyboard-only matches skip it entirely.

- [x] **Waiting bots stand off the touchline.** In a 2v2 with two pads, the other two
  seats wait at the side — no AI, no drifting, and the ball is parked — so you can
  check your stick and your KICK before the whistle. They bench at `halfW + 20`
  because that's the step-out margin `integrate()` already enforces; parking them
  further out just had the physics drag them back every frame.
- [x] **Team configuration by standing.** With two or more players, whichever half
  you're standing in is the side you'll play. Live head counts under each half come
  from the same test the Start button uses, so the preview can't lie.
- [x] **Sides always come out equal.** 2v1 becomes 2v2 by giving the short side a bot
  (the "5v4 → add one" rule); everyone crowding one side gets split rather than
  refused; a lone player is auto-assigned as before. The **mode sets the floor**, so
  two people in a 2v2 get a bot team-mate each instead of silently dropping to 1v1 —
  picking a side chooses your team, not the match size.
- [x] **Host presses Start.** A guest's Start only toggles their READY tick; nobody is
  ever blocked by someone idling.
- [x] **Cocktail direction calibration.** Start (when you haven't calibrated) shows one
  arrow at a time — UP, then RIGHT — and you hold the stick that way for a second.
  Two samples, not one, so a pad plugged in upside-down is caught rather than
  mirrored. The result is stored as the seat's **side**, which is the value the
  cocktail settings card already writes, so there's no second source of truth.
  Joystick and dpad only; face buttons can't advance it.
- [x] `PRESS START TO CONTINUE` on screen throughout, with a per-player line saying
  what *their* Start will do.
- [x] Skippable from Match → Warm-up lobby.

## 📊 Match stats on the result screen
- [x] **A full scoresheet under the awards** — goals, assists, shots, saves,
  clearances, key passes, posts, touches, per player, both teams, sorted by the same
  MVP score the awards use so the two panels can't disagree. Awards say who was best
  at one thing; this says what everyone actually did.

## 🐞 Two reported bugs
- [x] **The KICK pad still swept like a loading bar.** The charge tell was changed to a flash on
  the player's disc, but `drawKickMarker` kept its own `arc(..., -π/2, -π/2 + frac·2π)` — so the
  control actually under your thumb still read as progress. It now flashes the same way, from the
  same `holdT` phase. `tests/tells.mjs` checked the disc and not the pad, which is why the change
  looked complete; it checks both now, at a phone-sized viewport (the pad only exists in the
  mobile layout, and that's decided by window width — there is no `sel.display='mobile'`).
- [x] **Mud was a mud bath at kickoff.** The baked churn went on at full alpha while a match's own
  wear goes on at `WEAR.mudA` (0.16), so the pitch looked finished before anyone touched the ball.
  The bake is now laid on at `MUD_BAKE_A` — the same weight, two passes' worth — so kickoff is a
  green pitch with a few worn patches and the rest genuinely arrives from where players ran.
- [x] `surfaces` thresholds re-derived from the new measurements (mud-vs-grass warmth 6 → 3, goal
  mouth vs corner 8 → 5) with the reason recorded. The directions still hold and the dynamic
  claims — playing on it makes it muddier — are untouched.
- [x] `MUD_BAKE_A` had to be declared with the pitch constants: the surface picker paints its tiles
  at module init, so a `const` below its first use is a TDZ crash. Same trap `CENTER_R` hit.

## 📚 Documentation rot pass
- [x] **README** — said "space kicks" (X kicks too), "6 full palettes" (7), "150+ cosmetics"
  (210), "12+ drills" (24), and advertised "optional sprite skins" that no longer exist. The
  project structure listed neither `tests/`, `docs/` nor `settings/`. Now also mentions the bot
  AI, determinism, surface wear and the contrast pass.
- [x] **CLAUDE.md** — had no mention of the AI layer, the seeded RNG rule, the shared faceplate
  slot, `itemName`, `BALL_LOOKS`, the accordion, or the KICK OFF header. Added, plus two gotchas
  that cost real time: `p.kickUsed` is only cleared on the one-touch path, and duplicated
  knowledge rots (the category→name chain broke a test).
- [x] **TERMINOLOGY** — card rows were stale (Game Feel is three groups now; Sound has five
  per-effect toggles; Your Player gained Text), Killer Queen was missing from the mode list, and
  the theme list omitted GBA.
- [x] **ROADMAP** — Tier 1 and 2 still "recommended" eleven things that shipped long ago; marked
  ✅ with a note. "Amiga visual theme" was never a theme name. Added a Shipped block for the AI
  rework, shirt numbers, ball looks, the Kick Off header and the contrast pass.
- [x] **Both audit docs** carried a "no code has been changed" framing that was no longer true;
  each now opens with a status block and a before/after table. `DETERMINISM-AUDIT` marks the
  `rand()` item done and is explicit that this is reproducible on one engine, **not** bit-exact
  across engines — §3b is untouched.
- [x] **Screenshots re-captured** rather than just labelled stale: `docs/img/` now shows the Kick
  Off header, shirt numbers and awards-with-counts.
- [x] `LEADERBOARD_SETUP.md` checked against the code — sheet ID, tab name and column headers all
  still match. No changes needed.

## ⚽ Skins out, drawn ball looks in
- [x] **The Skins card is gone.** It offered a soccer-ball sprite and sprite players
  from `assets/ball/soccer.png` and `assets/player/player.png` — two files that were
  never in the repo, so both switches silently did nothing and one of them wore a
  "needs art" badge. This was the long-standing "ship the art or drop the card" item.
- [x] **The ball is customisable for real**, in a new Ball section: nine looks —
  Classic, Plain, Stripe, Cross, Beach, Tennis, 8-Ball, Dots, Swirl. All **drawn**,
  none an image. A ball is 9–15 px across in play; a bitmap at that size is mush,
  while a path stays crisp at any zoom and rolls with the real spin.
- [x] `paintBall()` is shared by the pitch and the picker tiles, so a tile cannot show
  something the ball won't. Physics still comes from Match → Ball; this is look only.
- [x] Dead code removed with it: `BALL_SPRITE`, `PLAYER_SPRITE`, `SKIN_ART`,
  `probeSkinArt`, `buildSkinPick`, and the player-sprite branch in `drawDiscs`.
- [x] `assets/README.md` no longer advertises a sprite contract the game doesn't read.

## 🔢 Shirt numbers by default, and a Text faceplate category
- [x] **Players default to a number, not a country.** A pitch now reads like a team
  sheet: you are 1, your bots take 2 upward, and the opposition numbers from 1 again
  the way a real match does. Countryballs and animals are still there, opt-in.
- [x] **Text faceplates** — the HaxBall avatar tradition, 48 of them, sharing the
  faceplate slot with flags and animals: two complete 0–9 runs (plain and circled)
  usable as shirt numbers, plus every glyph from the posted list (`⠀ _௵ ௸௸ ₧ ⁇⁇ ∴∵ 〄
  ⓞ № ツ ░░ ⠀*` and the Indic and Braille rows). They're drawn as text, not blitted,
  so they stay crisp at any disc size, and a two-character plate is measured and
  scaled to fit rather than spilling off the edge.
- [x] The Indic and Braille rows stop short of 9, so they're offered as individual
  glyphs rather than pretending to be a full 0–9 set. Font stack puts Kenney first
  (digits match the game) with symbol fonts behind it for the rarer characters.
- [x] Text plates are free — they're typography, not a reward — but they still count
  toward the unlocked total so the tally stays honest.
- [x] **Cleanup the change forced:** the cat→name chain was written out three times,
  once inside `tests/unlocked.mjs`. Adding a category broke the copy nobody was
  looking at. There is now one `itemName(cat, key)` and everything calls it, tests
  included. `unlocked` also stopped hardcoding "4 categories".

## ▶ KICK OFF is the Match section's header
- [x] **The green bar doubles as a collapsible header.** Collapsed it is exactly the
  button it always was; the chevron on its right opens the match options — mode,
  field, difficulty, length, input, ball, surface, mow, kickoff rule, names, party
  mods — directly underneath it, above the nav tiles. Pressing the button starts a
  match and never toggles the section; only the chevron does.
- [x] The sticky offset now measures the **header**, not the button. `#playBtn` used
  to be the sticky element; nesting it inside a sticky header would have pinned it
  below itself and left every other section's title overlapping the bar.
- [x] `/settings` has no game to kick off, so the header falls back to a plain
  "Match" title there.

## 🤖 Bot AI rework — steps 2, 4–9 and the difficulty re-tune (checkpoint B)
Four layers now: team phase → roles → per-bot decision → steering. Still AI-only —
bots emit a stick vector and KICK, and the suite proves it by diffing the whole
player object across 400 `runBot` calls.

- [x] **Step 2 — intercept.** Closed-form damped-ball prediction, four fixed
  iterations, **clamped to the pitch**: unclamped, a fast ball predicts x=536 on a
  pitch 440 wide and the bot runs at a point outside the boards. Clamping is both the
  better guess and what makes the iteration settle instead of walking to the limit.
- [x] **Step 4 — ball-anchored formation** with per-role influence, a real goalie,
  and `diff.aggr` finally wired in as defensive-line height. Same-role players get
  distinct lanes, so 4v4 no longer hands two bots an identical spot.
- [x] **Step 5 — aim scoring.** Every candidate kick — shot, pass, bank, corner
  clear — is scored by the same function (lane clear, goal progress, openness,
  distance). Passing is not a mechanic: it is the same kick aimed at a mate.
- [x] **Step 6 — support-spot grid**, 8×6 over the attacking half, one player's grid
  every other tick on rotation, with hysteresis so the target doesn't hop between
  neighbouring cells.
- [x] **Step 7 — role assignment** every 20 ticks with a 10% switch margin. Chaser by
  time-to-intercept, goalie by distance to own goal, the rest split support/defender.
- [x] **Step 8 — bank kicks**, mirrored across the real `w.walls` and **corrected for
  the actual physics**: boards are `bCoef 0.90`, not a perfect mirror, and the ball
  turns when its *centre* is one radius off the wall. Measured over 8 geometries,
  mean miss **4.0 units vs 21.5** for a naive mirror (62.9 → 1.5 close to the boards).
  The two errors cancel at one particular distance, which is exactly where the first
  version of the test looked fine.
- [x] **Step 9 — feel.** Reaction delay in ticks, anticipation limit, one presser,
  continuous off-ball runs, seeded aim error as the primary knob.
- [x] **Bots use the human kick path** (decision 8b). The bot-only branch in
  `handleBallControl` is gone; trapping on/off now applies to bots too, and they
  trap, carry and release like a human. Two bugs found doing it: `p.kickUsed` is
  never cleared on the casual path, so gating on it left bots pressing KICK **8
  times in 30 seconds**; and the press has to start *before* contact or the 0.14 s
  trap window closes one tick short.
- [x] **`DIFF` re-tuned** (decision 8a). `power` is retired — it multiplied a
  bot-only kick that no longer exists. Every AI-side axis now derives from one skill
  scalar so a tier cannot be better at one thing and worse at another.

Two measurement traps worth recording, both of which produced wrong answers first:

- **The shot aimed at the middle of the GOAL, not the middle of the gap.** So precise
  bots fired straight at whoever stood in the centre and sloppy ones scattered into
  space — which inverted the entire ladder. Rookie beat Insane 0.58–0.42 until the
  aperture code was changed to return the widest clear sub-arc. After: 0.17–0.83.
- **A one-sided harness favours the side it drives by ~17 points.** Normal-vs-Normal
  read 0.33 until every pair was played both ways round.

Ladder, both orientations, 2 modes × 4 seeds: rookie<easy **0.72**, rookie<normal
**0.66**, normal<hard **0.84**, rookie<insane **0.75**, normal-vs-normal **0.50**.
Adjacent tiers land inside sampling noise, which is what one step up should feel like.

- [ ] The frozen-legacy reference opponent turned out to be contaminated: legacy
  steering on the *new* kick path traps and fires at full charge, scoring 7.5 goals a
  match at Elite — behaviour it never had. Balance is therefore measured tier-vs-tier
  on current mechanics instead, which isolates the AI change.

## 🤖 Bot AI rework — steps 0, 1 and 3 (checkpoint A)
Audit and phased plan: [`BOT-AI-AUDIT.md`](BOT-AI-AUDIT.md). All six decisions answered there.

- [x] **Step 0 — deterministic AI.** `rand()` was `Math.random()` under a comment claiming
  otherwise. Every AI draw now goes through `w.rng` (`mulberry32`, already in the file),
  seeded per match from outside the sim and stored on the world. Bots are staggered by
  index — previously all of them recomputed on the same tick, forever. Match seeds also
  mix in a counter: `Date.now()` alone gave two restarts inside one millisecond the same bots.
- [x] **Step 1 — the oscillation.** It was geometry, not tuning: the standoff waypoint sat
  27 units behind the ball and the branch that discarded it fired at 43, so the bot could
  never arrive. The waypoint is now never discarded; getting to the far side is a curved
  walk **around** the ball on a circle (ordinary movement to an ordinary waypoint — no new
  ability); entering STRIKE needs alignment > 0.85 and leaving needs < 0.60; every state
  change costs a 12-tick dwell; STRIKE freezes its aim until it kicks or times out.
  Arrive-with-deceleration replaced full-stick-then-stop. KICK is only held while
  committed, so bots no longer crawl at `KICK_SLOW` exactly when they need to turn.
- [x] **Step 3 — separation** promoted to a real steering primitive with its own weight;
  the chaser yields less than everyone else.
- [x] `diff.err` split into a real **aim** error (it rotates the approach angle, which is
  how a bot aims — the impulse runs along player→ball) and a smaller **positional** error,
  both held for 45 ticks rather than re-rolled every recompute. Fresh noise per recompute
  was itself flipping branches with nothing in the world moving.
- [x] All AI tuning is in one `BOT` config block.

Measured, human parked, 30–60 s of self-play (baselines in the audit):

| | before | after |
|---|---|---|
| Velocity reversals /bot/s | 0.21 – **4.97** | **0.00 – 0.18** |
| Wrong-side scenario | 16 flips in 4 s, ball never touched | ≤2 flips, ball struck in 31 ticks |
| Ball contact at Hard/Insane | **0 – 2 %** | 8 – 76 % |
| Bots within 70 of the ball (4v4) | up to 0.91 | ≤ 0.49 |

- [ ] **Known, deferred to step 4:** non-chasers are still placed by `mates.indexOf(p) % 2`,
  so in 4v4 two bots compute an *identical* defender spot and two an identical attacker
  spot. Separation keeps them apart but they still hover as pairs. The ball-anchored
  formation with distinct slots per role is what fixes it properly.
- [ ] Steps 2, 4–9 and the `DIFF` re-tune (measured against a frozen copy of the old
  `runBot` as reference opponent) are still to come.

## 🎨 Theme picker shows the palette
- [x] **Emoji swapped for painted swatches.** Each theme tile is a canvas showing the six
  colours that make it — court, mow, line, both team colours, accent — banded on that theme's
  own page colour, so the picker reads like the court tiles right above it. `🌃` said nothing
  about what Neon looks like. `themeSwatchColors()` / `drawThemeSwatch()`; `tests/themetiles.mjs`
  samples the bands back off the canvas rather than trusting the draw call.

## 🔤 No text on a colour too close to it
- [x] **Every themed ink is now measured, not eyeballed.** `applyTheme()` derives the text
  colours from the surface they actually land on and nudges each just far enough to clear
  WCAG AA — same hue, so a theme still looks like itself. The reference surface is the worst
  case a panel ink meets, not the bare panel: selected tiles wash it with 7% cyan and the
  primary button with 10% green, each enough on its own to drop a 4.5:1 ink below AA.
- [x] **The HUD pills were near-black with themed ink on top.** `.scorebug`, the round HUD
  buttons, the replay bar and the toasts all hardcoded `rgba(6,8,16,.7)`, so Paper printed its
  dark text on a dark pill at **1.89:1**. They now use `--overlay` (the theme's page colour over
  the court) with `--overlay-ink` / `--overlay-red` / `--overlay-blue` / `--overlay-yellow`.
- [x] **`.shopcard.owned .sprice` used `var(--good, …)`.** `--good` is a *pitch-palette* key and
  was never a CSS variable, so it always fell through to a literal green — invisible on Paper.
  Now `var(--go)`.
- [x] **Your own disc colour could vanish under your name** in the player preview (a mid green
  on Paper measured 1.95:1); it goes through `readableInk` against the live panel now, and a
  theme switch re-runs `updatePreview()` so it's re-measured.
- [x] **The GOAL! banner prints straight onto the court** — red on GBA's light blue was
  **1.72:1**, and ice/mud repaint the court mid-match so no colour picked from the theme alone
  would hold. It's outlined in the opposite ink (`paint-order: stroke fill`) instead.
- [x] **`tests/contrast.mjs`** walks every visible label on every screen under every theme,
  composites what's behind it, and holds the pair to AA — with a deliberately-unreadable probe
  so a clean run can't pass vacuously.

## 🏅 Awards say the number
- [x] **"Most Saves" now says how many.** Every end-of-match award carries the figure that won
  it — `5 saves`, `4 clearances`, `2 key passes`, `9.4 power`, `20.0 rating` — formatted from the
  same value that picked the winner, so the note can't drift from the tally. Singulars stay
  singular. `tests/awards.mjs`.

## 🐞 From the full review (2026-08-03) — bugs found

All five below were **found and fixed** in the same pass; they're recorded because
each was shipped at some point and each is a class of mistake worth watching for.

- [x] **Bots wore your face** — `startMatch` built every bot from `profile.color/cap/flag/eyes`,
  so all eight discs had the same face and cap and the only thing separating you from an
  opponent was the team ring. `randCap`/`randFlag`/`randEyes`/`teamTint` already existed and
  simply weren't called. Reported from a screenshot; now covered by `tests/botlook.mjs`.
- [x] **The daily-reward modal made `/settings` unusable** — `#dailyModal` (z-index 40) opens on
  load and is only ever cleared when a match starts. The panel never starts a match, so the modal
  sat over the settings page and swallowed **every click**. The reward belongs to the game window:
  `checkDailyLogin()` is now skipped in panel mode, and the panel closes the modal on boot.
  Caught by a hit test (`elementFromPoint`), not by a class check — a class check would have passed.
- [x] **Window-local UI state was syncing across windows** — `dockCollapsed`/`deskDock` travelled
  in the state snapshot, so whichever value the panel loaded with would collapse or expand the
  *game's* menu. Now excluded via `SYNC_SKIP`.
- [x] **The panel went stale and lied about it** — nothing travels while you aren't changing
  things, so after the 4s liveness window the panel said "waiting for the game…" and froze its
  readout with the game tab still open. Added a 2s heartbeat; the game answers with the readout
  and sends a full snapshot only on first contact.
- [x] **The panel docked itself into a 372px strip on the Deck layout** — that layout docks the
  menu beside the pitch, and there is no pitch on `/settings`. Panel mode no longer auto-docks,
  and any `docked` class is neutralised by CSS.
- [x] **Dead code** — `roundRectFill` and `initClockDisplay` were defined and never called; removed.
  (`teamTint`/`randCap`/`randFlag`/`randEyes` are no longer dead — the bot-look fix uses all four.)

## 🔍 From the full review — open

- [x] **Pitch surface is invisible** — fixed. Grass / Ice / Mud changed grip
  (`pAccel` 0.40 / 0.26 / 0.34) but the court was **pixel-identical** on all three. Each surface
  is now drawn properly, not tinted:
  **Ice** is a rink — resurfacer passes, a broad overhead sheen, faint blue lines at the thirds,
  a crease at each goal mouth, and skate cuts that bunch up in the traffic.
  **Mud** is a winter pitch at full time — bare churned earth down the middle and in both goal
  mouths, turf surviving out by the touchlines (still showing your mow), drag marks, stud marks
  and standing water with a lit rim.
  Both are deterministic (a seeded LCG, never `Math.random`) and baked once into an offscreen
  canvas keyed on surface/mow/theme/field, so the per-frame cost is one `drawImage` and the pitch
  doesn't re-scuff itself sixty times a second. The **Pitch surface picker now draws tiles** like
  Field and Grass cut. Covered by `tests/surfaces.mjs`.
- [x] **Pitches wear in as you play** — the baked texture is now the pitch *before* kickoff: mud
  starts as a green field with only the goal mouths and centre worn, ice starts freshly
  resurfaced. A second layer records what the match does to it — mud churns and ice picks up
  skate cuts along the lines players actually travel. Rate-limited by **distance covered**, not by
  frames, so a disc has to cover real ground to leave anything and the cost is nothing when
  nobody's moving. One crossing marks the pitch at alpha 10/255; six crossings reach 48. Cleared
  on a new match, kept across a kickoff, never applied to grass.
- [ ] **Three ids exist in markup that nothing reads** — `rankLine` (a layout wrapper, fine),
  `roomCode` (the disabled Online stub) and `shopPledge` (the "Coming soon" support card). The
  latter two are the known dead-UI stubs below; nothing else is orphaned.

## 🪗 Settings sections are an accordion
- [x] **Only one section open at a time.** Opening one closes the rest, clicking the open one
  closes it, and deep links (the ⚙ tile, `#/settings`, "bring settings inline") go through the same
  `openSection()` rather than expanding a card behind the scenes. A stored state with several open
  — which older builds could leave — is repaired to one on load instead of restored as-is.

## 🎮 Connected-controller flairs
- [x] **Nothing is drawn — or even fetched — without a controller.** Verified on a real phone
  context with no gamepad stub at all: `drawPadFlairs()` is a provable no-op, and the same check
  fails on a page that does have a pad, so it isn't vacuous. `connectedGamepadIndices()` also
  ignores entries that report `connected` but expose no buttons, which some mobile browsers do.
  Touch controls and the keyboard never count.
- [x] **A small pad icon per connected controller, bottom-right** (Kenney `Flairs/Vector/
  controller_generic.svg`, already in the repo — one of the previously-unreferenced packs). It goes
  **black** while any button on that pad is held, so you can see which controller a press came from
  with four people round a table. A black silhouette would vanish on the dark themes, so a press
  also lights a chip behind it — the icon really is black, the chip is what makes it readable.
  Sits above the touch-control floor so it never prints over the joystick.

## ⌨️ Controls + Game Feel layout
- [x] **The charge ring flashes instead of sweeping.** It filled clockwise like a loading bar,
  which read as progress rather than a player winding up. The whole ring now pulses, faster and
  brighter as the shot charges. Phase comes from a new `holdT` counter, not `chargeT` — chargeT
  clamps at the maximum, so using it would have frozen the pulse exactly when fully wound up.
- [x] **X kicks as well as Space** — and neither is swallowed while you're typing. Space had no
  text-field guard at all, so it ate spaces in the seat-names box.
- [x] **Clicking the pitch releases the keyboard.** A focused slider kept the arrow keys, so
  up/down/left/right were adjusting a setting instead of (or as well as) moving the player. A
  pointerdown on the canvas now blurs whatever had focus, and `pollKeys` ignores the keyboard
  entirely while a text field is focused.
- [x] **Game Feel is grouped** — ⚽ Ball controls (Ball control, kick power, max ball speed, ball
  glide, magnet, trap window), 🕹️ Player controls (acceleration, float, stick sensitivity,
  one-handed), 🎬 Presentation (shake, auto-replay, match speed, debug readout). It was one
  undifferentiated stack of eight sliders.

## 🎞 Render interpolation, Killer Queen, docs
- [x] **Match speed 0.5× was juddering.** The sim runs in fixed 1/60 chunks and the renderer drew
  the newest state with no interpolation, so at 0.5× the accumulator only crossed the threshold
  every *other* frame. Measured on painted pixels: **35 of 70 frames completely frozen** at 0.5×
  (and 8 at 1×). The renderer now draws between the last two sim states using `acc/STEP`
  (`ix()`/`iy()`, ~7 draw sites). After: **4 frozen frames at 0.5×, 0 at 1×**, and lower step
  variance. Physics is untouched — this is Phase 1 item 1 of the determinism audit, render-side only.
  Teleports (kickoff, re-serve, snail home) are excluded by a 120-unit guard, well above the
  fastest legal one-step motion (~61).
- [x] **Killer Queen re-serves at the centre spot.** It used to spit the ball back out of the goal
  mouth it had just entered, so every goal put the ball straight back on a goal line. Nothing else
  about the mode changed — still no kickoff, players still hold position. The serve nudges clear of
  the snail rather than spawning inside it.
- [x] **Snail is a little lighter** — `invMass` 0.11 → 0.16, damp 0.90 → 0.915. Still by far the
  heaviest thing on the pitch, but it shifts.
- [x] **How to Play refreshed.** It still described the magnet as living "in setup" (it's in Game
  Feel), quoted a fixed half-second trap (it's a slider), and said nothing about one-handed mode,
  the centre-circle kickoff gate, ball control, surfaces, Killer Queen, co-op or `/settings`. Also
  merged two paragraphs that both explained the magnet. The Kickoff rule hint said "nobody crosses
  halfway", which stopped being true when the circle became a gate.

## 🔴 Live look + the phantom OVERTIME
- [x] **Customising your player now shows up mid-match.** Your look was copied onto the disc at
  kickoff and never read again, so a colour/cap/flag/eyes/name change only landed on the *next*
  match. `saveProfile()` — the choke point every profile write already goes through — now pushes
  it onto your live seat(s). A typed seat name still wins over the profile name, opponents are
  untouched, and the idle demo is skipped.
- [x] **The idle demo announced OVERTIME across the menu.** It ran a real 5-minute clock, and
  bot-vs-bot wallpaper is usually level at full time — so it went to sudden death, popped the
  banner and switched the clock to "OT". If it *wasn't* level it was worse: a full result overlay
  over the main menu. The demo now has no clock at all, and `endMatch` restarts it rather than
  taking over the screen. A real timed match still goes to overtime exactly as before.
- [x] **The demo still wore your colour.** It overrode flag, cap and eyes but not `color`, so seat
  one kept `profile.color` — the same "menu looks like your own team" problem the random-country
  change was meant to fix. It now takes the team tint like every other demo disc.

## 🎽 Name plates read as teams
- [x] **Full-screen F shortcut removed** — F11 is the browser's own, and swallowing a bare letter
  key fought every text field on the page (the seat-names box especially). The ⛶ buttons remain.
- [x] **The NAME is team-coloured; the box stays neutral.** Plates had been white on every disc
  since the very first commit — nothing told you which side someone was on, which got worse once
  bots stopped copying your look. Raw team colours on the dark plate measured as low as **3.06:1**
  (mono, blue), so `readableInk()` keeps the hue and lightens it toward the plate's preferred ink
  only as far as AA needs: 4 of the 14 team tints are used untouched, the rest shift slightly
  (e.g. grass red `#e23c3c` → `#e65959`). Worst contrast across all seven themes is now 4.56.
- [x] **`pickTextColor()` was choosing the wrong ink.** It used a fixed `luma > 150` threshold, so
  on GBA's mid-green it picked white at **2.25:1** where black gives 9.35:1. It now compares
  actual WCAG contrast ratios and takes the better one, with pure black rather than the theme's
  near-black (`#10131c` measured 4.37 on grass — under AA — vs 4.95 for `#000000`). This also
  fixes the cap glyphs drawn on discs, which used the same function.

## 🐞 Cocktail mode — three bugs, fixed
- [x] **Picking Cocktail stranded you on the sides-config screen.** The tile jumped
  straight to `openCocktailCfg()`, which hides `#setup` — and the KICK OFF button with it, so
  there was no way to start a match. It fired *every* time, not just the first, because leaving
  without choosing a side left `cocktailSides` empty. The auto-jump is gone; the Display card
  already carries a "Configure player sides" button.
- [x] **Pitch direction was a dead control in Cocktail.** The tiles accepted the click, lit up,
  saved `sel.orient` — and changed nothing, because `pitchHorizontal()` returns false for
  cocktail by design. They're now disabled with "cocktail is always upright" on them, and the
  click is blocked at the source rather than just styled.
- [x] **Cocktail with no controller was unplayable.** Cocktail hands seats to pads and takes the
  keyboard off the pitch — with zero pads connected that left *nothing* driving the player.
  `keyboardDrivesGame()` now returns true when no gamepad is connected, so the rule still holds
  at a real table but the mode can't brick itself.

_(The audit suite missed all three: it tests the orient picker with `display:'auto'`, and it
never walks the Display tiles as a player would. `tests/cocktailkeys.mjs` now covers the first
two and `tests/cocktailnopad.mjs` the third.)_

## ✨ Latest batch
- [x] **Ball magnet moved to Game Feel** — it had a second copy of itself in the Match card.
  Two controls for one setting drift apart and you can't tell which you last used; the audit
  suite now fails on any duplicate.
- [x] **Bigger centre circle** (`CENTER_R = 58`, was 45) on every court — one constant drives the
  drawn circle, the picker previews and the kickoff gate, so they can't drift.
- [x] **The centre circle is the kickoff gate** — stand in it and you may cross the halfway line,
  with or without the ball (it used to require touching the ball too). Step over the line from
  outside the circle and you're **shoved back** toward your own half rather than pinned: a hard
  clamp read as an invisible wall, a push reads as a rule pushing back. The clamp survives as a
  backstop 30 units past the line so the shove can never be out-run, and a puff marks the spot.
- [x] **Ice and mud start subtle and wear in** — mud is a **green** pitch at kickoff with only the
  goal mouths and centre bare; ice starts already-skated with fine cuts all over. What each match
  adds is a wear layer: mud churns and ice picks up blade marks **where the players actually ran**,
  rate-limited by distance travelled (not by frames) and faint enough that one crossing barely
  marks it. Resets per match, survives a mid-match kickoff, never touches grass.
- [x] **Player names** (Match → **Player names**) — a free-text box, one name per line, applied to
  seats in order: your side first, then the opposition. Blank lines keep that seat's default, so
  you can rename just the one bot. The idle demo stays generic.
- [x] **Phone framing** — the pitch sat under the thumbsticks with a slab of dead space beneath the
  HUD. `computeCam` now reserves the thumb band at the bottom on touch layouts; since width is what
  binds on a tall screen this doesn't shrink the pitch, it lifts it out of the dead space and away
  from your hands. Desktop and Deck are untouched. Covered by `tests/mobilefit.mjs`.

## 🔜 Now — highest value next
- [ ] **Delete ~31 MB of unreferenced art** — `assets/` is 36 MB / 7,170 files, but
  `kenney_input-prompts_1.5` (21 MB), `mobile-controls-1` (7.1 MB) and `kenney_sports-pack`
  (2.7 MB) have **zero references** in `index.html`, `sw.js` or `manifest.json`. Only the fonts,
  10 animal PNGs and the flag vectors are used. Nothing ships them to the player, but they bloat
  every clone of a repo whose whole pitch is "dependency-free single file". *(Left in place —
  deleting 31 MB is the owner's call, not a drive-by.)*
- [ ] **Ship sprite-skin art, or drop the feature** — `assets/ball/soccer.png` and
  `assets/player/player.png` don't exist, so both Skins options were switches that did nothing.
  They now probe on demand and show **needs art** instead of lying, but the honest end state is
  either shipping two PNGs or removing the card.
- [ ] **CI** — `tests/` is committed and green; wire a GitHub Action to run `node tests/run.mjs`
  on push so regressions fail the build instead of the player.

## ✅ Recently done (committed)
- [x] **Kickoff hold bulges around the centre circle** — carrying the ball inside the circle lets
  you cross the line, so you can turn and pass **backwards** instead of being pinned with every
  option in front of you. `kickoffFreePass()` gates on touching the ball *and* being inside the
  circle; off the ball or outside it you're still held. The gate renders it: the dashed line breaks
  at the circle, arcs over it, and the tint is punched out so the open pocket is visible.
- [x] **KICK pad is neutral grey** like the movement stick opposite it. A coloured pad read as a
  live indicator rather than a control; both are now the same translucent white, brightening on
  press. Label switched to white — the old `kickText` was near-black, sized for a solid accent pad.
- [x] **Debug readout + build stamp** (Settings → Game Feel → **Debug readout**). Bottom-left while
  you play: ball speed vs cap, your speed, every Game Feel number in slider units, magnet/trap/sens,
  and mode·field·state. Version always shows below it. On touch it lifts above the KICK pad instead
  of printing over a control. Covered by `tests/debug.mjs` — the numbers are asserted to *track* the
  sim and the settings, not just to be present.
- [x] **Version is now time-stamped** — `20260803.0738PM` instead of a hand-bumped `.21` counter.
- [x] **GBA theme** (🎮) from the Denki Blocks palette: cyan checkerboard court, white lines, royal
  blue surround, saturated red-vs-green teams, yellow accents, hard dark outlines, no gradients.
  Pairs with the **Check** grass cut.
- [x] **Prose + comment cleanup** (roast items 5 and 7). Rewrote the UI hints — they were all one
  balanced sentence in the same register, which is the most obvious LLM tell in the shipped text.
  Cut 107 lines of comment (13% → 11% of the JS): pure restatements (`// court`, `// zones`,
  `// Goal detection`), over-long preambles compressed to the one line that carries the *why*, and
  **four stale duplicates** left stacked by earlier edits — including an "Auto-replay-goals toggle."
  header sitting above the ball-control picker.
- [x] **Ball control is a real setting now** (Settings → Game Feel → **Ball control**: 🧤 Trap /
  ⚡ One-touch). Hold-to-grab was only ever reachable as a *side effect* of the Casual/Pro presets —
  picking Pro silently removed it with no control to put it back short of re-applying Casual, which
  also rewrites five other physics values. Verified trapping itself was never broken: in Casual the
  ball sticks and is carried 77px, in Pro it isn't (by design).
- [x] **Demo polish + controller wording + longer cheers** — the idle demo now picks a **random
  court** each restart and **never plays goal replays** (your Auto-replay setting is untouched).
  Prompts follow the device: with every human seat on a pad (or in deck view) the replay hint reads
  **"press any button to skip"** instead of "tap" — pad-skip already worked, only the wording lied.
  Three **new crowd cheers** (Stadium · Chant · Ovation) at 2.2–2.6s against the originals'
  0.7–1.1s. Covered by `tests/demo2.mjs`.
- [x] **Demo reads as a demo** — the idle menu match is bot vs bot, but "bots mirror your
  customization" dressed both sides in *your* look, so it read as your own team playing itself.
  Each side now gets its own **random country**, and a white **"Demo"** tag sits bottom-right.
- [x] **Name plates fade during replays too** — the fade was stored on the player object, and the
  replay rebuilds its player objects every frame (`{...pl}`), so the value was re-seeded each frame
  and never converged. Alpha now lives in an index-keyed array (`labelA`), like the trails.
  Covered by `tests/demo.mjs` and a replay case in `tests/labels.mjs`.
- [x] **Killer Queen mode** (🐌, Match → Mode) — 3v3 with **two balls at once**. The regular ball
  scores normally but **nothing resets between goals**: no kickoff, no re-serve at centre, players
  hold position; the ball is spat back out of the mouth (with a short `_goalCd`) so it re-enters
  play from where it went in instead of scoring every frame. The second ball is the **snail** —
  ~4× more sluggish (`SNAIL.invMass` 0.11, `damp` 0.90), 1.5× radius, drawn as an amber spiral
  shell so it can't be confused with the ball. It **never resets position**, including at kickoff.
  Push it home and the match **ends instantly**, regardless of the scoreline: `w.forceWin` overrides
  both `endMatch`'s title and `recordResult`'s W/L (goals for/against stay the true tally).
  Only the primary ball is kickable, so the snail can only be shouldered — the Killer Queen
  tug-of-war. Covered by `tests/killerqueen.mjs` (22 assertions).
- [x] **Motion tells, VIDEOBALL-style** — two deliberately different shapes so a frozen frame reads:
  players leave a line of small, evenly **spaced dots**; the ball leaves a single thick **line**
  whose **length scales with how hard it was struck**, tinted with the striking team's colour
  (`ball.lastKickTeam`). Dots are spaced by distance travelled rather than per frame, so the count
  reflects speed and a player who stops loses their tail. The ball streak follows the recorded path,
  so a bounce bends it instead of cutting through a wall. Also a **charge arc** that fills with
  `chargeT` — the wind-up used to be visible only on the touch HUD, so a controller player had no
  warning of a big shot. Trails clear on match start and kickoff.
  _(An earlier version added aim-direction arrows on each disc; removed — too noisy, and Videoball
  conveys facing through the player shape itself.)_ Covered by `tests/tells.mjs` (pixel sampling).
- [x] **Unlocked customizations shown up top** — a summary pinned to the head of *Your Player*:
  overall progress bar + `have / total`, a per-category chip row (Caps · Countryballs · Animals ·
  Eyes) and a horizontally-scrolling strip of the items you've actually earned, with the worn one
  ringed. Tap any to wear it. `buildUnlocked()` reads the same `isUnlocked()` model the pickers use
  so counts can't drift, refreshes via `updatePreview()`, and the strip is deck-focusable.
  Covered by `tests/unlocked.mjs`.
- [x] **Name plates duck out of the way** — a label overlapping another disc or the ball fades to
  5% and returns once clear, cutting pitch noise without losing who's who. Rect-vs-circle test in
  **true screen space** (`screenPt` applies the deck quarter-turn), eased via `p._lblA` so it reads
  as a fade, self excluded. Covered by `tests/labels.mjs` in both pitch orientations.
- [x] **Deck pad ownership** — the menu could keep the controller during play three different ways:
  explicit navigation (gear/nav/`toMenu`) opened a panel that was still collapsed off-screen and
  looked dead, `startDrill` never handed the pad over at all, and Select silently did nothing when
  nothing was docked. `dockOrFull(id, build, auto)` now separates the shell re-docking itself from
  the player asking for a page; `deckSetMenuOpen()` is the single Select/B entry point;
  `deckMenuOwnsPad()` verifies the panel is really on screen. Earlier in the same area: A (KICK) used
  to reopen the menu on every shot, and opening the menu now pauses a live match.
- [x] **Pitch direction setting** (Settings → Display → **Pitch direction**) — Auto · ↕ Upright ·
  ↔ Sideways. Decouples the landscape pitch from the Steam Deck layout, so goals can be left/right
  on any device (and upright even on Deck). `pitchHorizontal()` drives both the camera quarter-turn
  and the control rotation; `applySeatRotation()` re-aligns live seats when it changes mid-match.
  Cocktail stays upright by design.
- [x] **Full-screen button** — ⛶ in the in-game top bar, a matching button in Settings → Display,
  and the **F** key. Label flips between Enter/Exit and the canvas re-fits on change. Browsers only
  grant full screen from a real gesture, so the controller path can't trigger it (documented in the
  hint text rather than failing silently).
- [x] **Steam Deck view** (Settings → Look → Layout → 🎮 Steam Deck) — landscape pitch (camera
  quarter-turn via `cam.rot`, applied as a canvas transform in `render()`, so physics and hit
  testing are untouched), menu docked on the left at any window size (`dockCapable()`), and the
  pitch auto-resizes to the free space (`uiPadLeft`). Fully controller-driven: **Select** toggles
  the menu, stick/d-pad moves a focus ring (`.deckfocus`), **A** activates, **B** closes, **LB/RB**
  jump card-to-card, left/right nudges sliders. Human input is rotated with the view
  (`rotQuarter=1`) so the stick stays screen-aligned. Discs/ball/name plates draw upright via
  `uprightAt()`.
- [x] **Kickoff rule** — soccer's kickoff formality: both teams hold their own half while the ball
  sits at centre, and the moment it's played everyone is free for the rest of the match. Gated on
  `state==='kickoff'` (that state ends on the first touch, so it *is* "until the ball is played").
  `applyKickoffLine` clamps at the halfway line; `resetKickoff` already lays both sides out legally
  so nobody is ever yanked. Bots obey it through their AI target clamp. The halfway line renders as
  a dashed gate with the far half tinted while the hold is on.
  Toggle: Match card → **Kickoff rule** (default On).
  _(Superseded an always-on possession-gated version + its `possTeam` model, both removed.)_
- [x] **N humans vs N AI on controllers** — new **Extra controllers** row (Versus · Co-op). In Co-op
  extra gamepads fill *your* team first, so 2v2 + 1 pad = 2 humans vs 2 AI, 3v3 + 2 pads = 3 v 3.
  Overflow spills to the opponent; seats without a pad stay bots. Versus keeps the old interleave.
- [x] **3D-looking rolling ball** — the ball is now a shaded sphere with rotating black pentagons
  (soccer pattern) instead of a flat disc; it visibly rolls (`b.rot` already advanced with speed,
  now also for multi-ball extras). Theme-aware via `TH.ball`/`TH.ballSpot` + translucent shading.
- [x] **Grass-cut patterns** — "Grass cut" row in the Match card: Stripes · Vertical · Check ·
  Diagonal · Rings · Solid (`sel.grass`, `drawGrass()`). Cosmetic only; updates live.
- [x] **Idle demo muted + move after goal** — the desktop background demo is silent (`world.demo`
  gate in `playSfx`); players are no longer frozen during the goal celebration.
- [x] **Multi-ball reworked to continuous scoring** — a potted ball now disappears and counts as one
  goal, and the match keeps playing (no kickoff freeze). "First to 3" = pot 3 balls; when all balls
  on the pitch are used up without a winner (e.g. 2-1), a fresh ball serves at centre. Reaching the
  target still freezes into the result. `scoreMultiBall` + `creditScorer`; verified end-to-end.
- [x] **Post-match overlay contrast** — the result screen used a semi-transparent scrim, so the frozen
  pitch bled through and (worse) a fixed dark scrim broke the Paper theme's dark award/button text.
  It now uses the opaque themed backdrop (`var(--bg-grad)`), same as the menus — legible on every theme.
- [x] **Career Stats screen** — 📈 nav tile / `#/stats`: an 18-tile grid of lifetime numbers (goals
  scored/conceded, GD, matches, W/L/D, win rate, per-game averages, streaks, biggest win, most in a
  match, clean sheets, drills, MMR, coins, rank). New tallies `bestWin`/`cleanSheets`/`goalsBest`.
- [x] **Field picker ordered by size** — tiles now sort by total pitch area (W×L), smallest → largest.
- [-] **Bots mirror your customization** — **reverted.** Dressing every bot in your look made all
  eight discs identical; the team ring alone was not enough to tell you from an opponent at a
  glance. Bots now get their own face/cap/eyes and a team-family colour, seeded off seat index so
  a match still looks the same frame to frame. Your disc is unchanged.
- [x] **Light-theme card definition** — 36 `rgba(255,255,255,…)` borders/fills (awards, shop, wallet,
  social posts, cocktail rows, leaderboard "you" row) were invisible on Paper's light panels. Card
  borders now use `var(--edge)`; subtle fills use a neutral `rgba(128,128,128,…)` that reads on both
  light and dark. Verified visually in shop + social.
- [x] **Overlay-eats-touch guard generalized** — the full-screen daily modal (z-index 40) is now
  closed on every real gameplay start (`startMatch` guarded by `!_startQuiet`, plus `startDrill`),
  so no modal can linger over the pitch and swallow input. The load-time idle demo is excluded so
  the day-1 reward still shows.
- [x] **Ball containment swept on all 30 fields** — hammered each field with repeated 40–100 speed
  blasts in random directions; the ball never escapes the side walls, only dips into the goal-net
  depth, never NaNs. (Re-run after any physics change.)
- [x] **Theme contrast pass (all AA)** — Paper (light) theme was inheriting dark-theme hardcodes
  (`#fff` text on light panels, `var(--text)` on a hardcoded dark input, white-on-gold kick pad).
  Added themed `--field` / `--on-accent` vars, routed inputs/chips/labels through `var(--text)`,
  and bumped the two low-contrast greens. Every text/bg pair now clears WCAG AA on all 6 themes
  (verified numerically); team red/blue stay distinguishable under protan/deutan/tritan.
- [x] **Drills use the standard controls** — `zoneForTouch` read `world.mode.twoP`, but drills build
  a world with no `mode` block, so the first touch threw and the player couldn't move. Guarded it.
  Also hardened `startDrill` to `closeDailyModal()` — a lingering full-screen modal (z-index 40)
  would otherwise sit over the pitch and silently swallow every touch. Verified end-to-end with
  real dispatched touch events (player moves in both the normal flow and the modal-open edge case).
- [x] Legibility overhaul — Kenney fonts, removed CRT glow/scanlines, contrast fixes (all UI text ≥4.5:1 AA).
- [x] Dockable menus + hash routing (Back/Forward + deep links).
- [x] Status toasts — reusable `toast()`; "Score saved · ±RP" each match.
- [x] Persistence — theme, player name, and all settings already save to `localStorage`
  (`magnetball.sel` / `magnetball.profile`) and restore on load. **Verified working.**

## 📋 Next — near-term, self-contained
- [x] **Reset scope option** — "Reset settings" now offers an opt-in second confirm to also reset
  the player name/appearance (colour, flag/animal, eyes, cap). Default still keeps your look;
  `resetSettings(alsoAppearance)` + `defaultProfile()`.
- [ ] **Shop "buying"** — the `💛 Coming soon` support button (`#shopSupport`) is a stub; either wire
  a real (non-purchase) action or keep as honest placeholder.
- [x] **Skins no longer lie** — the sprite options pointed at files that don't exist and silently
  did nothing. They now probe on demand (never on settings open, which would 404 every build) and
  render as disabled "needs art" once known missing, reverting any stale selection. *Shipping the
  art itself is still open — see "Now".*

## 🧹 Code health (from the review)
- [x] **Dead per-frame call removed** — `drawKickoffHint()` ran every rendered frame and did
  literally nothing (assigned two unused locals, returned undefined). Gone, with its call site.
- [x] **Tab no longer hijacked** — deck view bound Escape *and* Tab to the menu toggle, which broke
  keyboard navigation. Escape only now.
- [x] **Four dead functions** — `teamTint`, `randCap`, `randFlag`, `randEyes` are all called now:
  the bot-look fix uses them to give every bot its own face, cap, eyes and team-family colour.
- [ ] **`index.html` is 5,793 lines / 340 KB with ~300 functions.** The single-file rule is a
  deliberate constraint (see `CLAUDE.md`), not an accident — but navigating it is the main tax on
  every change. If it keeps growing, consider a documented section index at the top.
- [ ] **Two shipped "Coming soon" stubs** — `#shopSupport` and the Online-rooms card (`#roomCode`,
  disabled). Honest, but they're dead UI in a shipped build; decide keep-or-cut.

## 🚧 Parked — needs a decision or is blocked
- [-] **Leaderboard writes** — closed by design. No hosted backend (Google Sheet only, read via
  public gviz JSON). Writing scores/replays needs a hosted endpoint (Apps Script), which is ruled
  out, so the board is **read-only**: it shows only your local score + the offline sample.
  `lbSubmit`/`lbSubmitReplay` stay no-ops. Revisit only if the no-backend rule changes.
- [ ] **Online rooms (host / join by code)** — the Settings → Online card is a "coming soon" stub
  (`#roomCode` disabled). Real online play is an XL, backend-touching feature — see ROADMAP Tier 3.

## 🧪 Testing / infra
- [x] **Full-feature audit suite** (`tests/audit.mjs`) — asks two questions of every setting:
  is it **reachable** (a live control in the DOM, no console required) and is it **effective**
  (changing it moves world state or canvas pixels). Also walks every nav tile, every drill, every
  mode, and every Game Feel slider. Anything in `defaultSel()` with no entry in its control map is
  reported as *unaudited* rather than quietly passing. Currently: 0 unreachable, 0 ineffective,
  0 unaudited, 0 broken nav, all 6 drills and all modes run clean.

- [x] **Committed test suite** — `tests/` holds 35 headless Playwright suites driving the real page
  through `window.__magnet`, plus `tests/run.mjs` (`node tests/run.mjs [filter]`) and a README.
  Covers: smoke (dup IDs, every screen/picker/theme/drill/mode/party combo), ball containment across
  all fields, the kickoff rule, controller routing, deck layout/pad-ownership/menu, pitch direction,
  full screen. Playwright is dev-only — the page stays dependency-free.
  `tests/README.md` documents the two false-pass traps this project has actually hit.
- [ ] **CI** — run the suite on push (see "Now" above). The suite exists; nothing runs it automatically.
- [ ] **Console-error budget is strict** — suites fail on *any* console error, which already caught a
  self-inflicted 404 (eagerly probing missing skin art on every settings build). Keep it strict.
- [ ] After physics changes: re-verify **ball containment on every field**.
- [ ] After adding any flag/eye/cap: **render it once** to catch throwing draw fns.
- [ ] Watch for **duplicate element IDs** (breaks `$()` / `getElementById`) — e.g. the `id="clock"`
  collision already hit once.
- [ ] Check the console for errors after each change.
