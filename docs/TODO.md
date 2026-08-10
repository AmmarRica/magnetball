# Magnetball — TODO

Near-term, actionable task list. For the larger feature backlog (tiers, effort
estimates, community asks), see [`../ROADMAP.md`](../ROADMAP.md).

Status legend: `[ ]` open · `[~]` in progress / uncommitted · `[x]` done · `[-]` parked/won't-do

_Current build: **v20260806.0620PM** (shown under the title; bump `VERSION` in `index.html` on every change)._

---

## 🔺 Videoball arrowheads get a body
- [x] **The ring is the player.** The arrowhead was drawn alone and overhung the collision
  circle in every direction (nose 1.55r, wings 1.05r), so the shape on screen was a third
  bigger than the shape the physics used. A team-coloured ring at exactly `r`, triangle
  inscribed inside it.
- [x] ⚠️ Found doing it: `p.faceY || fallback` fired for a player facing exactly along x
  (`faceY === 0` is falsy), so the arrow pointed diagonally at nothing.
- [x] The outline was eating the tip at `r*0.10`; thinned to `r*0.06`.

## 🐌 The snail is kickable, and still heavy
- [x] `handleSnailKick` — its own shove, never `handleBallControl`: that path traps and
  carries, and walking the objective into the net is the whole match in one run.
- [x] ⚠️ Scaled by `SNAIL.kick`, not `invMass`. A kick sets velocity directly, so an unscaled
  one would send the snail off at ball speed — "kickable" quietly meaning "weightless".
- [x] Measured on Colossus: one kick moves the snail **22 units, twice** what a full-speed body
  check does, while the same kick sends the ball **453**. Peak speed 3.77 against the ball's
  5.67. Holding KICK is one shove, not a shove per frame.

## 🔎 Menu search, and recents rows
- [x] **Search** indexes 485 controls from the DOM — every section, setting, option tile and
  nav tile — filters as you type, says which card and pane each hit lives on, and jumping to
  one opens the card, switches the pane and flashes the control.
- [x] ⚠️ The index is rebuilt on every search, not once at boot: the pickers replace their
  tiles constantly, and a stale index holds detached nodes that `scrollIntoView` scrolls to
  nowhere while looking like it worked.
- [x] **Recents** on the four long faceplate pickers, built by the same `buildTilePicker` as
  the grid below so the lock badge and selected state cannot drift. ⚠️ Keyed per CATEGORY, not
  per slot: flags, animals and text share `profile.flag`, so a flag pick would otherwise show
  up in the animals row.

## 🎨 Drawn icons instead of emoji
- [x] Emoji render differently on every platform, sit on their own baseline so a row never lines
  up, and cannot take a colour from the theme. `ICONS` is 27 drawn glyphs on one 24×24 grid at
  one stroke weight in `currentColor`, through one `optGlyph()` that every tile already uses.
- [x] Difficulty is now a **ramp** — filled pips out of `DIFF`'s own length — instead of seven
  unrelated pictures. A row of tiles reads as "harder to the right", which it never did before.
- [x] ⚠️ Opting in is an `icon:` field, not an emoji lookup: ⚡ is both Quick and Elite.
- [x] ⚠️ Cosmetic tables stay on emoji, because there the emoji IS the item.
- [ ] **The Kenney `kenney_game-icons` pack is not in the repo** (only animal / flag /
  input-prompts / fonts / sports / mobile-controls are) and this environment's network policy
  blocks kenney.nl, so it could not be fetched. Commit
  `assets/Kenney/kenney_game-icons/Vector/` and swapping is a change to `iconSvg` alone.

## 🟨 Highlighter theme
- [x] Acid-yellow court, black lines, white surround, dithered — from a reference image.
- [x] ⚠️ "Players are white" and "two teams" are in tension: two white discs are the same disc,
  and hue cannot settle it in a yellow/black/white palette. The sides carry a black BAR,
  horizontal against vertical — a shape, which also survives 12 pixels and colour blindness.
- [x] `DYN_FIELDS.dither` — an ordered Bayer ramp, dense at the ends, clear at halfway. Built
  once into an offscreen canvas and stretched; per frame at a 4px cell it would be 17,500
  rects. Cached on the ink, since slots mix across palettes.
- [x] ⚠️ Tuned down from the first pass, which made the ends nearly solid and put a wall of
  texture between the player and the ball. A dither is a surface: it must lose every contest
  against a disc, the ball and the lines.
- [x] ⚠️ Bayer bug: the lowest matrix value is ZERO, so `dens > B/16` is true for one cell in
  sixteen at ANY density — the pitch stayed stippled at halfway where the ramp says clear.
  The threshold is `(B + 0.5)/16`.

## 🔍 UX review — measured, not guessed (390×844 phone unless stated)

Everything below was measured on the shipped page, not eyeballed. Ranked by how many
people it affects and how badly.

### A. Tap targets under the 44px floor — 6 kinds
The accessibility floor for a touch target is 44px. Measured heights:
- [ ] **`infobtn` — 20px**, and there are 14 of them. The worst by a distance, and it is the
  control that reveals the help text, so the thing a confused player reaches for is the
  hardest thing on the page to hit. Fix by padding the hit area, not the glyph.
- [ ] **`jumpchip` — 27px** (the section nav row) and **`subchip` — 30px** (the sub-tabs).
  Both are primary navigation and both are used constantly.
- [ ] **Map-vote thumbs — 47×31** on the result screen.
- [ ] **`#resetLook` — 26px.**
- [ ] **HUD pause / fullscreen — 40×40**, just under, and they sit next to a live ball.
- [ ] ⚠️ Check the range **sliders** separately: the element box measures 6px tall, but the
  browser gives the thumb its own hit area — measure the THUMB before changing anything, or
  this is a fix for a problem that isn't there.

### B. Two cards are still long enough to need tabs
Card height when open, in screenfuls: **Game Feel 1.9**, **Sound 1.8**, theme 1.1, player 0.8,
everything else ≤ 0.7. Player and Theme were fixed by tabbing them and the machinery already
exists (`SUBTABS`, `showSubTab`, sticky chip row).
- [ ] **Game Feel → tabs.** Natural groups already exist as subheads: Ball · Player controls ·
  Presentation.
- [ ] **Sound → tabs.** 40 controls, one long list.

### C. Landscape phone is the worst layout in the app
At 844×390 the entire first screen is logo + version + "right thumb moves" + the Record card —
**KICK OFF is below the fold**, on the screen whose whole job is starting a match.
- [ ] **Collapse the logo block in a short viewport.** The wordmark, the version line and the
  controls hint are ~200px of a 390px-tall screen.
- [ ] ⚠️ And once you scroll, the sticky stack (KICK OFF + chips) takes **31% of the height**.
  It is sized for a tall screen; it needs to shrink or drop the chips when the viewport is short.

### D. A brand-new player's first interaction is a retention modal
- [ ] Fresh storage, first ever load: the **Daily Reward** modal is up before the player has
  touched the ball — "Day 1 · 1-day streak · keep logging in!" over a menu they have not seen.
  It should wait until after the first match, or at least until the second visit: a streak
  counter means nothing to someone with nothing to keep.

### E. Still shipping two dead controls
- [ ] The Online card's **Host / Join** tiles both read "soon". Already listed further down;
  repeated here because it is the only thing in the menu that cannot be pressed.

### What the review found NOT to be a problem
Worth recording so nobody re-checks: **no horizontal overflow** anywhere in the menu; the pause
and result buttons are a uniform **260×55**; the result screen fits **one screen**; total
control count is 551 (player 226, theme 106, match 95) but all of it is now behind accordions,
tabs or search.

---

## 🧭 UI/UX pass (approved plan, one change at a time)
- [x] **4. Help text is progressive.** One component (`buildHintToggles`) folds every help
  paragraph behind an info toggle on its label. No copy deleted or rewritten — folded verbatim,
  3,963 characters still in the DOM. Gameplay-affecting help (`hint always`) stays open.
  Never persisted. ⚠️ Wired into `buildSettings()` too: six paragraphs are created there and a
  boot-only pass left them permanently expanded.
- [x] **1. Touch players can start a match.** ⚠️ Confirmed a HARD block first, not assumed:
  in cocktail an engaged touch player never left the lobby in 90 simulated seconds, because
  the idle auto-start resets on movement. On-screen START, opt-in via a third Warm-up lobby
  option (`Controllers` / `Everyone` / `Skip`); the default is the old behaviour exactly.
  Routes through `lobbyStart()`, so it cannot disagree with the on-screen side preview.
- [ ] 2. Dead controls · 3. Leaderboard labels · 5. Preset vocabulary · 6. Rules/Presentation
- [ ] 7. Search: help text, synonyms, fuzzy · 10. Polish batch
- [ ] 8. Reduce motion — ⚠️ PARTLY DONE. `prefers-reduced-motion` switches the tilt parallax
  off, but nothing else honours it: screen shake, the goal camera, hit stop, the goal slow-mo,
  auto-replay and every animated field all still run. One helper the whole lot reads.
- [ ] 9. Match flow timers. Owner's answers: post-match timer STAYS wall-clock (the stats
  screen is a paused state, so stepping the sim behind it is risk with no determinism gain);
  post-match goes to DEMO, with a flashing DEMO tag bottom-right, keeping court and theme.

## 🦐 Shrimp theme, and a ring on every player
- [x] **Rockpool** — full bundle: a sand seabed with ripples and shells, an underwater palette,
  and **crabs against lobsters**.
- [x] **Three creatures in one `SEA` registry** — shrimp, crab and lobster — with `seaPair()`
  building the pairings. The theme fields crab vs lobster; Shrimp vs Lobster and Shrimp vs Crab
  are both still pickable in the Players slot. A pairing is now a two-line entry rather than a
  copy of a creature.
- [x] The sides differ by SILHOUETTE, measured off covered pixels rather than trusted from the
  drawing code. ⚠️ The discriminator has had to change with the pairing **twice** — "one is
  wider" worked for shrimp vs crab, not for shrimp vs lobster (both long, so it became claw
  span and curl), and now crab vs lobster is stubby-vs-long. That is the argument for measuring
  it instead of asserting it.
- [x] ⚠️ Three drawing bugs recorded on the way: the crab's legs crossed the guide ring; the
  lobster's abdomen was three wide strokes ALONG the axis, which draws bars ACROSS the body and
  made a ladder; and a pincer gap drawn as a dark disc over the claw greyed out the whole body.
- [x] ⚠️ And a TDZ: the legacy-key migration in `normalizeLook()` read `DISC_SKINS`, which is
  declared with the renderer far below, and took the page down with "Cannot access before
  initialization". It is a pure string swap now. Third incident of this shape.
- [x] **THE RULE, made structural: every skin gets a guide ring.** `drawOneDisc` strokes it
  after the skin paints, so a new skin cannot forget one. A player is a circle and that circle
  is what collides, however un-circular the art inside it.
- [x] ⚠️ **The ring had to become TWO tones.** The first version was one colour and Mono draws
  team 1 as a WHITE disc — a white ring on it vanished on 7 of 24 arcs. Dark outside, light
  inside, so one of the two always reads whatever the skin painted.
- [x] **Two-frame leg animation** on both creatures, on `p.gait` — distance travelled, not a
  clock. Stops dead when you do, speeds up when you do (16 flips slow vs 35 fast over the same
  90 steps), and a draw cannot advance it. Frame 0 is the rest pose. ⚠️ The shrimp's
  swimmerets first grew out of its BACK — they belong on the belly, the side the abdomen curls
  toward. And legs alternate by index and side: all six together is a star jump.
- [x] **Rotation is a per-player checkbox** (`profile.spin`, Your Player → Colour), not a
  property of the theme. One `discFace(p)` helper, so two skins cannot honour it differently.

## 🔍 Self-review of this session's code (2026-08-06)
Read back everything added this session looking for defects rather than for confirmation.
Three findings, two of them real bugs that shipped.

- [x] **The goal-box rule fired in the WARM-UP LOBBY and after the FULL-TIME WHISTLE.** It had
  no state gate at all, while `applyKickoffLine` — the rule it was modelled on — has one. The
  lobby is where you walk about, test controls and pick a side; being shoved off a spot there
  reads as the controls breaking. Measured before the fix: 3 players moved during the wind-down
  against 0 with the rule off. Now gated on `w.state === 'play'`.
  A wall CAN still form at kickoff — measured 4 in the box — and is ejected to 1 the instant
  play starts, which is the right trade: the kickoff line already restricts position there, and
  shoving people while they take up formation would look broken.
- [x] **`MIN_BODY_PX` was declared below `computeCam`, which reads it.** It only survived
  because `computeCam`'s one bootstrap-time caller is guarded by `if (world)` and `world` is
  still null there — luck, not design. Two TDZ incidents of exactly this shape are already
  recorded in `CLAUDE.md` (VJUI, GOALCAM). Moved above its reader.
- [x] Checked and **clean**: the new search box is a keyboard surface sitting next to a live
  docked match, but `pollKeys` already bails on `typingInField(document.activeElement)`, so
  typing "colossus" mid-match does not steer your player. `buildMenuSearch` runs once, so its
  document-level `pointerdown` listener does not stack. `w.boxLock` cannot hold a player from a
  previous roster — `discs.includes(owner)` drops it — and a new match gets a fresh world.
- [x] Added the missing coverage the review exposed: both state gates in `boxrule`, and the
  real click path in `menufind` (everything else drove `noteRecent` directly, which proves the
  store and not the wiring).

- [x] ⚠️ **`contrast`'s flakiness was a real borderline colour, not the probe.** Sorry!'s
  `green`/`cyan` (`#1f9f6f`) rendered as `#15694a` on a selected option tile — **4.44**
  against a 4.5 floor. Whether the scan reached that tile depended on which options
  happened to be selected when the screen was opened, so the same build passed and failed
  on alternating runs. Darkened to `#0f5c3f`, which needs no nudge at all. The sabotage
  probe in the output was a red herring: it is planted on purpose and is always there.
  Anything within a tenth of the floor will do this again — treat 4.4-4.5 as failing.
- [-] ⚠️ **First diagnosis of the flaky `contrast` suite, kept because it was WRONG.** A red
  run's captured output held exactly one entry — the suite's own sabotage probe — and the
  conclusion drawn was that the probe's exclusion was racing the scan. It was not: the probe
  is planted on purpose and is present on the passing runs too. The real cause is the entry
  above. The lesson is that "the only thing in the output" is not the same as "the cause".

## 🧤 Goal box: one keeper, one attacker
- [x] A team could park its whole defence on its own line, and the attack could bury the keeper
  under a scrum from the other side. One of each inside a goal box now (`sel.boxRule`, on by
  default, off-able like the kickoff rule). Eased out with the same shove-and-backstop shape as
  `applyKickoffLine` — being turned back reads as something acting on you.
- [x] The box is the region the pitch already **draws**, read from `w.bounds`. A rule enforced
  anywhere else is worse than no rule: you would be pushed off a line that is not there.
- [x] ⚠️ The slot is sticky. Recomputing "who is deepest" every step made two defenders trade it
  and shove each other out on alternate frames.
- [x] Measured effect on scoring: **22 goals vs 19** across eight 3-minute bot 4v4s, on vs off —
  it slightly *helps* scoring, because the goalmouth stops being a car park.

## 🐛 A lone player's side pick was thrown away
- [x] **Reported and fixed.** `lobbyPlan` auto-assigned team 0 whenever there was exactly one
  human, so a solo player could never end up on team 1 however far they walked into that half.
  Standing **on** the halfway line is not a pick (`LOBBY.neutral`) — walking into a half is.
- [x] And the on-screen preview was computed separately from `lobbySideOf`, so it happily showed
  the player on the half they were standing in while Start put them on the other. It reads
  `lobbyPlan` now, which is what CLAUDE.md already claimed. The old test had encoded the bug.

## 🫐 Bots contest the berries
- [x] At most one runner a side, never the chaser or the goalie, never while defending, and only
  finishing a berry already within `BOT.berryLastLeg` of the hive.
- [x] ⚠️ **Three tunings to get the balance right**, recorded so it is not relitigated. Ungated,
  bots drove berries the length of the pitch and **7 of 8 matches ended on a full hive inside 90
  seconds**. A phase gate barely moved it. Raising the cell count only made the same foregone
  race longer. What worked was restricting bots to the LAST LEG and spawning berries in the
  middle third. Final: `BERRY.cells` 12 (two rows of 6), **4 of 8** matches decided on the hive
  at the default 5-minute length, all after 220 seconds, with goals per match **up** to 3.75.
- [x] ⚠️ A bot given the spot *behind* a berry walks up, stops one radius short and admires it —
  `botArrive` decelerates into its target. The target flips to the far side once lined up, which
  is exactly how the ball's strike waypoint works.
- [x] ⚠️ A runner promoted to chaser kept its berry and was invisible to the cap, so the side
  assigned a second. Counted across the whole squad now.

## 🔒 Determinism audit closed, and the rule made literal
- [x] **Decision: same-engine reproducibility.** A pinned seed reproduces a match bit-exactly in
  one browser; cross-engine equality is not a goal. Fixed-point work (Phases 2–3) parked, not
  pending. All eight §8 questions answered and recorded.
- [x] `tests/determinism.mjs` turns Checkpoint 1 into a permanent guard: the whole world hashed
  at frame 3,600 across two runs on one seed, in 4v4 and Killer Queen.
- [x] ⚠️ It immediately found two leaks, which is the point of a throwing stub over a counter:
  `spawnKickFx` and the audio noise fill both reached `Math.random` from inside `step()`. Both
  now have their own seeded stream (`fxRnd`, `audRnd`) — not `w.rng`, or how many sparks flew
  would perturb every bot decision after it. The rule is now literally true.

## 🔊 The noise() main-thread stall
- [x] **Fixed.** `noise()` filled a fresh `AudioBuffer` with `Math.random` on every call, and the
  loudest sounds call it most: the Ovation cheer is 27 calls. One pre-generated 3-second buffer,
  windowed with `start(when, offset, duration)`. **2.2ms → 0.2ms** median for the cheer's buffer
  work, with a different window each call so two noises in a row are not the same noise.

## 🐉 Leviathan, and courts you can actually see
- [x] **Leviathan** — 2640 × 4640, four times Colossus and sixteen times Giant. 20.3s to run its
  length. Zero ball escapes over 90 seconds.
- [x] **`cam.body` size floor.** At that scale the whole pitch still has to fit on screen, so a
  player disc came out **2.25 pixels** — every disc the same dot, nobody able to find their own
  player. Discs and the ball now floor at `MIN_BODY_PX` through one shared multiplier.
  ⚠️ Render only, and proven so: same seed, floor on vs forced to 1, world bit-identical.
  Exactly 1 on any ordinary court. Colossus benefits too (1.57×).

## 🫐 Killer Queen berries and the hive
- [x] **Six floaty purple berries** you shepherd into the end you attack. Light (`invMass 2.6`)
  and barely damped (`0.994`), so a shoulder barge sends one drifting a long way. Spawned
  mirrored top and bottom in a ring off the goals and off the centre spot.
- [x] **Each goal holds a hive** — `BERRY.cells` slots drawn in the net pocket, filling as
  berries bank. A berry crossing the line BANKS instead of scoring; fill every cell and the
  match is won outright, tagged `forceWinBy:'hive'` so the result screen doesn't say "snail".
- [x] ⚠️ **Being banked is a flag, not a parking spot.** The first build parked a banked berry
  at (99999, 99999) — how the code parks anything it wants ignored — and `clampBallInside`
  dragged it back onto the pitch to bank again. Honoured by `integrate`, the ball-vs-ball
  pass, `checkGoal` and the draw; sabotage-checked both ways in `kqberry`.
- [x] ⚠️ **Spawned after `botInit`**, which is where `w.rng` is seeded. Before it they fell
  back to `Math.random` and the opening layout differed every match. `placeBerry` now has no
  fallback at all, so that failure is loud rather than silent.
- [x] Balance-checked over eight bot-only matches: 3–4 cells typically fill in three minutes
  and one match in eight ends on a full hive — a live race, not a formality.
- [x] **Bots contest berries now** — one runner a side, last leg only. See the tuning record
  under "Bots contest the berries" above.

## 👁 Trails: the 3-second rule, reverted
- [-] **Reverted.** Trails were rebuilt as a claim about TIME — a 3-second window for the
  players, a pitch-relative streak plus a `BALL_HOLD` linger for the ball — so a screenshot
  would explain the last three seconds. On the pitch it read as a **tail**, not a tell: a
  streak most of a pitch long hanging off a ball that had already stopped.
- [x] Back to the short world-unit caps (`DOT_GAP` 9 × `DOT_MAX` 12, `BALL_LEN_MAX` 320) and
  round dots rather than dashes. `tests/trail3s.mjs` deleted; `tells` restored.
- [ ] If it's worth another go, the lesson is that the ball streak was the offender, not the
  player tails, and the linger was worse than the length.

## 🔺 Videoball is themed like Videoball
- [x] Cream banded court, arrowhead players pointing where they FACE (so a still frame shows
  intent), on the existing theme-slot mechanism.

---

## 🧱 Bits
- [x] **Colossus court** — 1320 × 2320, four times the AREA of Giant (every dimension
  doubled). Quadrupling the dimensions instead would be sixteen times the area: six times
  Classic end to end, which nobody could cross before the whistle.
- [x] **Replay came back sideways on a Steam Deck.** `render()` applies `cam.rot` and deck view
  turns the pitch a quarter-turn, but `drawReplayFrame` drew it un-rotated — so the replay was
  at ninety degrees to the match it was a replay OF. It applies the same transform now, with the
  REPLAY label outside it and placed through `screenPt` so the text stays upright.
- [x] **Goal zoom sliders** — amount (1.0×–8.0×) and speed (0.05s–3.00s), under Game Feel →
  Presentation. **1.0× is off** and the camera never latches. Clamped in one place, so a
  value synced across from /settings can't push it out of range.
- [x] **The Match chevron rotates its GLYPH, not the button.** Rotating the button spun its
  whole rounded rectangle, so a wide pill became a tall one and the header changed shape
  every time you opened the card.
- [x] ⚠️ `const GOALCAM` had to move up with the feel constants — the slider wiring reads it
  during the bootstrap, and declared down with the camera code it was in the TDZ and took
  the whole page down.

---

## 🎮 Joining a match already under way
- [x] **Seats were handed out exactly once**, in `startMatch`. A pad woken up after the
  whistle did nothing at all for the rest of the match — while the warm-up lobby's own
  help text had been promising "a controller can still join at any point by pressing a
  button" the whole time. It couldn't; that hint was describing the lobby.
- [x] ⚠️ **And the first fix was too blunt.** It took a bot over the instant any button
  went down, mid-play, with no way to pick a side and no say in when — a body appearing
  in the middle of a live ball.
- [x] **A touchline instead.** Plug a controller in and a body walks out beside the pitch.
  Walk to the half you want, press START, and you come on at the next goal, on that side.
  ⚠️ On CONNECTION, no press needed, because the waiting body is not in `w.players` and so
  cannot touch the ball or anybody else — that is exactly what makes connection enough.
  The press that matters is the START, and pressing it again cancels.
- [x] **ONE gate**, on the touchline beside the halfway line — where substitutions happen
  in the real game, and the only place a body can cross without walking through the play.
  The joiner, the bot added to even up and anyone leaving all use it, so a swap reads as a
  swap. Derived from the field, never stored: courts differ in width by a factor of three.
- [x] **The side is where you stand.** ⚠️ Deliberately not `lobbySideOf`, which answers −1
  for anything outside the touchline and so answers −1 for every single body out here.
  Undecided is a real third answer — it is what standing by the gate means — and it falls
  to what **Extra controllers** already means (Versus against you, Co-op alongside).
- [x] **The match GROWS to fit.** A 3v3 that gains a player is a 4v4, with a bot added to
  the other side. Arriving must never cost a body its place.
- [x] ⚠️ **`evenUpSides` is the ONE owner** of "both sides field the same number, and never
  fewer than the size it kicked off at". A join, an unplug and a swap all go through it, so
  a 4v3 cannot survive long enough to look like a bug in the bots. Only ever a **bot** is
  taken off — a human pulled off the pitch by a roster count is a controller that stops
  working for no reason its holder can see.
- [x] ⚠️ `subPer` moves only when a PERSON arrives or leaves, never off a bot count —
  otherwise "how big is this match" is answered by the very thing evenUpSides is fixing,
  and one dropped bot ratchets the match smaller for good.
- [x] ⚠️ The floor is the size the match KICKED OFF at, not `mode.per`: the lobby can put
  six a side on a 4v4, and a floor of 4 would have had evenUpSides quietly take two bots
  off each side the first time anybody's controller hiccupped. Captured once, at the
  whistle — by the time a substitution runs, the roster has already changed.
- [x] **Substitutions fire from ONE hook** in the goal branch of `step`, latched per goal,
  rather than a call at each of the five places that set the state. One of those five is
  always the one somebody forgets.
- [x] **Walking on and off** through the lobby's own `walkTo` — `_subTo` for bodies coming
  on, a two-hop `_subPath` (gate, then bench slot) for bodies going off. ⚠️ `_subTo` also
  suppresses the AI at the `runBot` call site: `walkTo` sets position directly, so a
  thinking bot fights it and jitters on the touchline.
- [x] **Unplugging** sends the body out through the same gate, keeping its name and stats.
  A pad that hiccups and comes back **reclaims its own body** rather than minting a P3 and
  stranding its half-match on the bench.
- [x] ⚠️ `matchRoster()` is what the result screen reads now. A controller unplugged at half
  time puts its body on the bench, and reading only `w.players` dropped that player's goals
  off the scoresheet and their name out of the awards, as though the half never happened.
- [x] An on-screen prompt per waiting body: which pad, which side it would get, what to
  press. ⚠️ Clamped inside the canvas — the body is outside the touchline by definition, so
  a label centred on it hangs off the edge and loses its last few words, which are the side.
- [x] Nothing about it may perturb the sim: `tests/dropin.mjs` hashes the whole world over
  600 steps with the machinery running and without it, and holds the cap, the floor, the
  gates and the timing (armed is not on — it must still be waiting through a stretch of
  play, or "they join between goals" is really "they join immediately").

---

## 🧭 Four reported items
- [x] **"The kick off button is still under other tabs."** Literal: the jump-to chip row sat
  ABOVE the Match card, so once both pinned, KICK OFF was underneath a row of nav chips. The
  stack is **KICK OFF → chips → section headers** now.
- [x] ⚠️ And `top:0` alone was not enough. Sticky is measured from the scroll container's
  PADDING box, so `.screen`'s 26px of top padding left a band above the pinned bar that every
  tile and chip scrolled through — the same bug wearing a different hat. The bar is pulled up by
  that padding and carries it itself, and `syncSticky` subtracts it when measuring or a 26px gap
  opens between the bar and the chips.
- [x] **Frame rate above the version**, while the debug readout is on. ⚠️ The one timer in the
  file that is deliberately NOT step-locked: the sim rate is pinned at 1/60 by design, so a
  step-locked counter would read a flat 60 on every machine and answer nothing. Drawn as the last
  row of the debug panel, because `drawDebug` runs after `drawBuildTag` and its plate would
  otherwise be painted straight over the line.
- [x] **The Theme card is tabbed — the bundle grid included.** Seven tile grids stacked is most
  of a phone screen each, and the bundle row is the tallest at 19 tiles, so leaving it outside
  the tabs meant scrolling past it to reach anything else. Card height on a phone: 1621px → 963.
  ⚠️ Both the chips and the panes come from one list (`['bundle']` + `SLOT_KEYS`), so a new slot
  cannot arrive with a pane and no chip. ⚠️ `buildSubTabs()` runs at the end of `buildSettings()`
  too — that function rebuilds the panes on every slot change, so the fresh ones have no `.on`
  class and the card showed nothing at all.
- [x] ⚠️ **And the chip row had to be made STICKY.** The first pass tabbed the slots but left the
  row scrolling away with the grid, which is only half a fix: you still had to scroll back up to
  change tab, so the vertical scrolling it exists to remove was still there. It pins under its
  own card's header now (`--sticky-top + --sec-h`).
- [x] ⚠️ **One row, scrolling sideways**, not wrapping. Two pinned rows put half the chips behind
  the section header and let the pane's tiles through the gap between them. Same idiom as
  `#jumpBar`, for the same reason.
- [x] **Warp is inverted: black court, white surround.** It shipped the other way round, which
  put the tunnel's stars on a white court — a starfield reads as a night sky, and a night sky is
  not white. The HUD and the thumb pads are the exception that goes dark, because they are the
  only marks over the white now.
- [x] **Sparks reverse colour across the touchline** (`flipFx` + `invertInk`). On a two-tone
  palette a spark keeps its colour and vanishes into whichever side matches it; drawing it as its
  own negative outside the court makes the crossing the effect. Opt-in per palette — turning an
  orange spark cyan on a full-colour theme is a bug, not an effect.
- [x] ⚠️ Which surfaced `padInk()`: the thumb markers were hardcoded WHITE, and Highlighter,
  Sorry!, Specimen and now Warp all letterbox in a light colour. A white ring at 0.16 alpha on a
  white surround is nothing at all — the resting controls were not there on four palettes.

---

## 🪤 Three test traps found while doing the above
- [x] **`applyBundle('classic')` does nothing** — there is no `classic` palette. Several suites
  call it believing it resets the theme, and it silently leaves the last one applied. Recorded in
  `tests/README.md`; new code uses a real key.
- [x] **`spawnKickFx` adds SHAKE**, and shake makes `render()` non-idempotent — so a block that
  spawns sparks has to decay it afterwards as well as before. Three unrelated blocks failed on
  this, none of whose messages pointed anywhere near the cause.
- [x] **`getImageData` outside the canvas returns zeros**, which reads as "that area is black".
  A world point past the touchline lands off the bitmap at some viewports; sample in screen space
  and clamp.

---

## 🥅 Goal box: half a second of grace
- [x] **Nothing touches you for the first half second.** Being shoved the instant you clipped
  the corner of the box made a run past the goal feel like the pitch was fighting you. No
  shove, no clamp, and no visual tell either — a tell in the free window says you are being
  stopped when you are not. Long enough to run THROUGH, nowhere near long enough to camp.
- [x] ⚠️ The clock is wound back to zero in `applyGoalBox` for everyone NOT being pushed, not
  in `easeOutOfBox` — that only ever hears about the players it pushes, so it can never be the
  place a timer resets.
- [x] ⚠️ **The hard backstop clamps to how deep you already were**, not to a fixed line. Half a
  second at pace puts a player ~98 units into the box on Classic (measured: 98.4) against a
  backstop of 16 — so clamping to `GOALBOX.hard` TELEPORTED them 80 units back the frame the
  clock expired. The cap is set from where they actually are and ratchets inward as the shove
  carries them out, so it is never a bypass and never a jerk.
- [x] ⚠️ The suite measures the free window as a **differential against the rule switched
  off**. `integrate` damps every player every step, so the first version of the check read vy
  falling from 3.2 to 2.9 and called ordinary damping a shove.

---

## 🫐 A stale berry latch, surfaced by the above
- [x] **A bot could escort a hole in the pitch.** `botAssignBerry` drops dead targets, but it
  only runs on the role tick — so between a berry banking and that tick a runner was still
  driving at a berry that had already been delivered. Cleared in `kqBerry` now, at the moment
  the berry stops existing, which is the event that invalidates the latch.
- [x] ⚠️ Found because the grace change perturbs every position slightly, and a 60-second bot
  simulation downstream of that hit a window the old timing never landed in. Worth recording:
  a physics change is a new random seed for every bot decision in the match.

---

## ⬆️ "Update available"
- [x] **An installed PWA has no reload button and no address bar**, so a player looking at the
  app had no way to pick up a new build except killing it from the app switcher.
- [x] ⚠️ **It compares `VERSION`, not the service worker.** A deploy here is a new index.html
  and sw.js barely ever changes, so `registration.update()` fires `updatefound` for almost none
  of them — an SW-based check would report "up to date" through every real release.
- [x] ⚠️ The regex must not match **its own source**: the page fetches itself, so the pattern's
  text is in the reply *before* the real declaration. Requiring a digit after the quote is what
  stops `\s*` being read as a version number.
- [x] ⚠️ `cache:'reload'`, not a `?v=` cache-buster — the worker caches whatever URL it
  fetched, so a query string adds a junk entry per check. Fetching the clean URL also refreshes
  the cached page, which is what makes the reload reliable.
- [x] **Never over a live match.** A modal landing mid-play steals the ball out of your hands;
  it waits for the menu, the pause screen or the result. The attract demo counts as the menu.
- [x] Declining silences the **automatic** checks only. Being asked twice about one build is
  what teaches people to dismiss update prompts unread — but a player pressing "Check for
  updates" is asking, and a button that knowingly answers nothing is worse.
- [x] A manual **Check for updates** button, always visible, because it is the only way to ASK
  inside an installed app.
- [x] ⚠️ Gated to `http(s)` and out of `/settings`: on a `file://` page the fetch throws "URL
  scheme file is not supported" into the console — which broke two unrelated suites that assert
  a clean console — and two windows prompting for one update is one too many.
- [x] ⚠️ **Offline it answers from the worker's CACHE.** That is correct rather than a hole: a
  reload falls back to the same copy, so a version found offline really is installable. The
  honest property is "never offers what a reload cannot deliver", not "says nothing".

---

## 📐 Tilt parallax on phones
- [x] ⚠️ **The on/off was too buried to find.** It was there from the start, in Game Feel,
  searchable by "parallax", "tilt" and "3d" — but 16th of 19 fields in that card, below two
  sliders, and it got reported as a MISSING feature. It sits directly under **Screen shake &
  effects** now: the two visual on/offs together, above the ranges, because a reader scanning
  a long card finds toggles grouped rather than scattered between sliders. The position is
  asserted, so it cannot drift back down.
- [x] **Four depths.** Turf, then the pitch MARKINGS, then the bodies, then the on-screen
  controls and the HUD nearest your eye — each shifting by a different amount. Layers moving
  by different amounts is what a parallax IS, and it is the only depth cue a top-down pitch
  has short of redrawing the game in perspective.
- [x] ⚠️ The stack has to stay **monotonic in depth** or it is not a parallax, it is four
  things sliding about. Checked as an ORDER rather than four magic numbers, so retuning the
  constants cannot quietly break the thing the constants are for.
- [x] ⚠️ The turf/markings gap is deliberately **tiny** (2.5px): the touchline is a marking
  and the grass is the turf beneath it, so a real gap between them stops reading as a bevel
  and starts reading as a misaligned pitch.
- [x] **The HUD is DOM**, so it moves by a CSS transform — which carries its BUTTONS' hit
  areas along with it. That is why a transform is right and redrawing at an offset would be
  wrong: a pause button drawn 9px from where it can be pressed is worse than one that does
  not move at all. Written only when the rounded value changes, because it runs every frame.
- [x] **The RESTING thumbstick marker and the KICK pad move; a LIVE thumbstick does not.** A
  control being touched is attached to your thumb and must not float away from it, while one
  at rest is ambient decoration. Both are indicators either way — the real hit area is a whole
  screen zone (`zoneForTouch`), which is what makes moving them safe at all.
- [x] ⚠️ **The shadow subtracts the lift**, so it stays where the player actually stands. A
  shadow that travels with the body is a sticker; the gap opening and closing between the two
  is the entire reason the effect reads as height.
- [x] ⚠️ **Render only**, the same argument the goal camera has to satisfy — nothing physical
  reads it, so a match played on a phone being waved about plays exactly like one on a desk.
  `tests/tilt.mjs` hashes the whole world over 600 steps with the tilt swinging.
- [x] ⚠️ **Step-locked** (`advanceTilt`, next to `decayJuice`). Both the smoothing and the
  recentring are per-step decays, so a draw-driven version would run 2.4× fast on a 144Hz
  screen and the effect would feel like a different setting on a different phone. The event
  handler stores a RAW reading and does no time-based maths at all — the sensor fires at its
  own rate, which is not the sim's.
- [x] ⚠️ **Neutral is wherever you are actually holding the phone.** The baseline drifts
  (~4s), and the first reading is adopted outright. Without that, "level" means flat on a
  table: play lying down and the effect sits pinned at full deflection forever, which is a
  crooked picture rather than a parallax.
- [x] ⚠️ The reading is rotated by the SCREEN's own angle. `beta`/`gamma` are fixed to the
  device, not to what you are looking at, so in landscape — which is where this game is often
  held, and always in deck view — an unrotated reading tilts the pitch sideways when you lean
  it forwards.
- [x] ⚠️ iOS 13+ will not deliver a single reading until asked, and will only be asked from
  inside a **user gesture** — so the request hangs off the first tap rather than off boot,
  where it is refused outright and the sensor stays silent for the whole session.
- [x] Off on desktop, off under **Reduce Motion** (a picture that swims when your hand moves
  is exactly what that setting asks not to happen), and off when the setting says so. ⚠️ The
  media query object is built ONCE — `tiltLift()` is called for every body on every frame, so
  a fresh `matchMedia` in there put a new object and a style question on each disc.

---

## 🧹 Two render-layer bugs found while building it
- [x] **The sparks aged inside `drawFx`.** `p.life -= STEP` and `p.x += p.vx` in a draw is the
  trails bug wearing a different hat: on a 144Hz screen every spark ran 2.4× fast and died in
  a third of the time it was given, so a kick looked punchier on a slow monitor. Moved to
  `advanceFx()` next to `decayJuice()`. It also meant two draws of one frame produced two
  different pictures — which is what a paused screen and every pixel test rely on not
  happening, and it is what made the tilt measurement impossible to take until it was fixed.
- [x] **`pitchXform(dx, dy)` is now the one pitch transform.** `render()` needs it twice (the
  ground pass and the body pass) and `drawReplayFrame` once; three hand-written copies of a
  translate-rotate-translate is how the replay came to be drawn at ninety degrees to the match
  it was a replay of in the first place.

---

## 〰️ Ball streak
- [x] **Longer** — 320 → 520 world units at full speed (~65% of a classic pitch), with the
  path buffer raised 40 → 90 samples. ⚠️ The buffer matters: the streak walks BACK along
  recorded positions, so one sized for a full-speed ball runs out of path on a ball ambling at
  a third of that, and the streak silently comes up short exactly when there is most of it to
  see.
- [x] ⚠️ Length is SPEED-driven, which is what makes a longer one safe: at rest it is still
  zero. The three-second, TIME-measured version that was reverted drew most of a pitch hanging
  off a **stationary** ball — that was the bug, not the length.

---

## 🎥 Goal camera
- [x] **A 5% push, arriving in 0.10s** on whoever last touched the ball, and lerps the centre
  onto them. Eases back when the celebration ends.
- [x] ⚠️ It shipped as **5.0× over 1.15s**, which is two mistakes at once: 5× is most of the
  pitch gone, and 1.15s of a 1.8s goal state is spent travelling — so what read was the MOVE
  rather than the moment the ball crossed. 0.10s is six frames, so it lands at once. The
  slider still goes to 8× for anyone who wants the old behaviour, the label says `+5%` below
  1.5× (a "1.1×" label for a 5% push is a rounding error presented as a setting), and a save
  still holding exactly the old 500/115 is folded to the new defaults.
- [x] ⚠️ The suite's "it zoomed rather than panned" check was `cam.s > base * 2` — true only
  because the shipped default happened to be 5×, so it failed a camera working perfectly the
  moment the default changed. Measured against the DIAL now.
- [x] Render layer only, and proven so: same seed, 300 steps, bit-identical world.
- [x] ⚠️ Step-locked like the trails, so a 144Hz screen can't run it fast — and the goal
  slow-mo stretches it for free. Stands down while a replay owns the framing.

## 🎛 HUD + Custom theme tile
- [x] **Fullscreen top right, scorebug centred, pause left.** A 3-column grid, so the
  scorebug is centred on the SCREEN rather than among whatever buttons happen to be showing.
- [x] **Settings moved into the pause menu.** The HUD gear was one mis-tap from the ball
  while the match was live.
- [x] **A Custom tile in the Theme bundle row** — selected whenever the slots match no bundle,
  painted from the mix you actually built, and pressing it restores that mix.

---

## ⚪ Every ball looked white on the Pool theme
- [x] **1.18:1.** Pool pairs a `#f7f4ec` cue ball with a `#e8e2d2` spot, so every pattern was
  invisible and the ball — and every picker tile — read as plain white with only the 3D
  shading showing. The cue ball look is *plain*, so the spot was never exercised by the
  bundle that ships it. Every other palette is 10.6:1 or better.
- [x] The pattern colour is now **measured against the ball** through the same `readableInk`
  the themed text already uses. A readable spot is left alone; Pool goes 1.18 → 5.23.

## 🎩 Caps
- [x] **Bots don't wear them.** Cycling the whole CAPS table put a different hat on every
  disc — busy, and it made a cap read as decoration rather than as YOUR mark.
- [x] **Centred on the player**, not riding the top edge, and outlined in the opposite ink so
  it reads over a flag or a shirt number.
- [x] ⚠️ There were **two** cap draws with different offsets and different type scales — the
  pitch and the menu preview — so the mark you picked was never quite the one you played
  with. One `paintCap()` now.

---

## 🎱 The pool table's wood was in the wrong place
- [x] **Rails ran through both goal mouths** — a shot passed through solid timber to score.
  The cushion now breaks at each mouth, which is the one place the ball is meant to leave.
- [x] **Wood was inside the play area**, so the ball rolled across the cushion instead of
  bouncing off its face. The cushion face now sits exactly on the boundary the ball collides
  with, and the timber is beyond it (`bleed` opts a field out of `drawGrass`'s clip).
- [x] **It follows the field's own outline** — rounded, chamfered or square — instead of being
  a rectangle. On the 20-odd non-rectangular fields a straight rail left a band of baize
  outside the line that no ball could reach.
- [x] ⚠️ The helper that builds that outline **must not call `beginPath()`**: doing so wiped
  the enclosing rect out of the even-odd clip and inverted it, putting the wood back inside.

---

## 🚨 /settings never saw a deploy
- [x] **The real reason a fix "didn't work".** `/settings` pulls the page in with
  `fetch('../index.html')` — not a navigation, and `Accept: */*`. The service worker decided
  "is this HTML?" from mode/accept alone, so that request took the **cache-first** branch and
  the settings page was pinned to whatever `index.html` was precached at install. Every deploy
  since the route existed was invisible there. `{cache:'no-cache'}` does not bypass a worker.
  HTML is now decided by the URL too, `CACHE` bumped to v4 to evict the stale copy, and
  `tests/swupdate.mjs` proves it end to end (and was verified to fail on the old predicate).

## 🔔 Full time gets its own whistle
- [x] **A progressive triple** — BEE-BEE-BEEEEP: two short blasts and a long one that climbs
  and fades. A match does not end the way it starts, and `endMatch` was reusing the kickoff peep.
- [x] It is a **category**, not a one-off function, so the themed sound sets end their own
  matches too (pool racks out, space powers down). Five variants, all labelled and pickable.

---

## 🐛 /settings could not be scrolled
- [x] **Pre-existing, and total.** `html`/`body` lock the page down so the game canvas can
  never be scrolled off screen (`overflow:hidden`, `height:100%`, `touch-action:none`). In
  panel mode `#setup` is `position:static`, so it grew to its full content height and NOTHING
  scrolled — everything past the first viewport was unreachable on a page that is nothing but
  a stack of settings cards. `touch-action:none` blocked a swipe even where overflow didn't.
  Not caused by VJ Mode, but VJ Mode took the page from 1.5k px to 4.7k px and made it
  impossible to miss. Undone on the panel route only via an `html.panelroute` class set in
  `applyPanelMode`. `tests/panel.mjs` now scrolls to the bottom on desktop AND a phone
  viewport and checks the game page is still locked down.

## 🎬 The idle demo is a showcase
- [x] **Both benches at the top tier**, derived from the last key of `DIFF` rather than
  spelled, so a harder tier added later moves the demo up with it. It ignores the player's
  own difficulty — that setting is for matches they play.
- [x] **A real 3-minute match** that rolls straight into the next one. The
  `endMatch → finishMatch → startDemo` path already existed; the demo just had no clock.
- [x] ⚠️ **A level demo does not go to overtime.** It would hang on the menu until someone
  scored and throw OVERTIME! across the screen. Real matches still get sudden death.

---

## 🎧 VJ Mode — video decks + DJ decks
- [x] **Audit first: VJ Mode did not exist.** The brief described extending it; the repo had
  nothing — no `<video>`, no decks, no tap tempo, no crossfader. "VIDEOBALL" is a theme
  palette and the `Deck:` commits are Steam Deck. Built both halves from scratch.
- [x] **Five slots of a mixer, one AudioContext, in the GAME tab.** `sfxBus → mainMix →
  master → limiter`. Two contexts across two tabs cannot be mixed and drift within seconds,
  so `/settings` sends commands and receives meters and never holds a node.
- [x] **Two audio decks** on `MediaElementSource`: transport, cue point, 4 hot cues, manual
  and 1/2/4/8-beat auto-loops off the master clock, 3-band kill EQ (−40dB is a real kill),
  single-knob HP/LP sweep, ±8/16/50% pitch with key-lock, trim, fader, assign, VU.
  ⚠️ Sync is beat-matchable, **not** turntable-locked — `currentTime` is not sample-accurate,
  so phase is re-nudged rather than held. That was the chosen tradeoff; key-lock and sane
  memory are what it buys.
- [x] **Offline BPM + waveform**, once per file, cached: decode → envelope → onset pick →
  IOI histogram → best tempo in 70–180 + grid offset. Manual override and grid nudge, because
  detection is wrong sometimes.
- [x] **Two video decks** with opacity, fit, look, tint, rate and optional clip audio (off by
  default — video and music are fully decoupled), an independent video crossfader, and TAKE
  quantised to the master clock.
- [x] **ONE tempo system.** Tap tempo drives TAKE quantisation, auto-loops and deck sync.
- [x] **Guarantees are structural.** Video composites at one seam between the pitch surface
  and its markings; discs/ball/trails draw later, so no deck value can dim a player. Markings
  floor at 20%. Limiter always in the chain while live, and taken back out when off.
- [x] **Measured, then designed around it.** `ctx.filter` at full resolution cost 45.9ms/frame
  against 20.4ms for the same two draws — looks now render through a half-scale pass and tint
  is a composite op. Decks at zero opacity are not decoded.
- [x] **PANIC** on the game page (Shift+Esc), working with `/settings` closed or dead.
- [x] Presets carry the full board position and no media (649 bytes for a full board).
- [ ] **Headphone cue is built and flagged experimental.** Chromium-only `setSinkId`, and the
  MediaStream route puts cue ~20–100ms behind main — it is not sample-aligned. Judge it in situ.

---

## 🎨 Themes are a collection of slots
- [x] **A theme is a set of slots, not one key.** `SLOTS` declares Background (palette),
  Field, Players, Ball and Sound. The first four live in `sel.look`; the sound slot has
  **no stored value at all** — `sfxSetKey()` derives it from `sel.snd`, which the Sound
  card already owns one category at a time.
- [x] **Bundles set all five at once.** Every palette is a bundle (`bundleSlots`), and
  `THEME_BUNDLES` lists only the two that own more than colour. Picking **Pool** sets the
  pool table, pool-ball players, the cue ball, and a pool-hall sound set — ball-on-ball
  clacks, cushion thuds, a pocket drop, and the rack breaking for the kickoff whistle.
  **Warp** gets a Space set on the same mechanism.
- [x] **"Custom" is derived, never stored.** `currentBundle()` matches the live slots
  against the table, so changing one slot reads Custom and putting it back brings the
  name straight back — and assembling Pool by hand from a different bundle gets Pool.
  A stored `custom` could have gone stale; this can't.
- [x] **One tile builder.** `buildSlotPicker(slot, host)` paints any slot into any host,
  so the Ball card and the Sound card show the same state as the Theme card's slot rows
  rather than a second copy of it. `sel.theme`/`sel.ballLook` were dropped rather than
  kept alongside — `normalizeLook()` folds a legacy save in once, at load.
- [x] **The bundle tile shows the collection**, not the palette bands again: its field,
  its players and its ball, painted under its own palette. Two identical grids labelled
  "Bundle" and "Background" taught nothing. `tests/themeslots.mjs`, `tests/themetiles.mjs`.
- [x] **Section chevrons enlarged** — 22px glyph, and the Match card's is a 64px button.

---

## 💥 Kick off walls and players (optional)
- [x] **KICK stops being ball-only** when it's on: a wall, arc, post or body in range
  takes the hit and you take the reaction. A wall has nothing to give, so kicking one
  **launches you off it** — a real KICK press at the boards moves you 64 units.
- [x] Kicking a player shoves *them* and recoils *you*, weighted by inverse mass and
  along the line between you, with the recoil the smaller share.
- [x] Charge scales it on the same curve as a ball kick (−7.2 → −13.7 at full wind-up).
  One press is one launch, with a short cooldown so a fast tap isn't a rocket.
- [x] Never at kickoff (it would wreck the formation) or after the whistle, and the
  ball is untouched — it has its own kick path.
- [x] **Off by default**, in Match → Kick off walls & players, because it changes how
  the game plays rather than how it looks. Applies to everyone equally, bots included.

## 🏁 Game-over chooser, and sitting a match out
- [x] **The result screen offers two options: `↻ Restart` and `🧍 Warm-up`.** Restart is
  the default — the common case is "again, same teams". It deliberately does **not**
  call `startMatch()`, which re-runs seat assignment and would undo whoever picked
  which side; it resets the scoreline, stats, seed and pitch wear in place.
- [x] **Only Player 1 picks.** With four people round a table you don't want whoever
  mashes first deciding what happens next, so the chooser reads one pad and says so
  on screen. The match stats stay visible above it.
- [x] **Step outside the touchline in warm-up to sit the match out.** You keep your
  controller and can walk the sideline, but you're not in `w.players` — so you never
  touch the ball and **cannot walk back on mid-match**. Warm-up widens the step-out
  margin (20 → 74) so "outside" is a real place to stand; in play it's unchanged.
- [x] Two bugs the tests caught rather than my reading: the bench push-out resolved
  by the player's **current** sign, so walking left from `+x` popped them out at
  `-x` the moment they crossed the centre — straight through the pitch; and lining
  the bench up teleported a human who had just chosen where to stand (only reserve
  bots are lined up now).
- [x] Spare bots go to the bench instead of being dropped from the roster — they were
  vanishing, so every restart fielded fewer bodies than the last.
- [x] Team size is capped by the bodies that actually exist: filling 1+1 humans to a
  2v2 needs two spare bots, and with only one on the sheet the honest answer is 1v1,
  not 2v1. Equal sides beat matching the mode exactly.

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
- [x] **A full scoresheet under the awards** — per player, both teams, sorted by the same
  MVP score the awards use so the two panels can't disagree. Awards say who was best
  at one thing; this says what everyone actually did.
- [x] **It was unreadable on a phone, and reported as such.** Three faults compounding:
  eight ACRONYM columns (`G A SH SV CL KP PST TCH`); the key that decodes them at the
  very BOTTOM of the screen, which on a phone stacks the two panels and leaves the legend
  two screens below the headings it explains; and a grid that was mostly noughts — a 4v4
  is 8 players × 8 columns and **52 of those 64 cells read `0`**, so twelve real numbers
  hid among fifty-two zeros.
- [x] **Three spelled columns and a line of prose.** `STAT_COLS` is Goals / Assists /
  Saves; `STAT_MORE` + `statLine()` put the rest under the name in words, and **only when
  non-zero** — "5 shots · 2 clearances". Nothing was lost, so the acronym key is gone
  rather than left stale: there is no jargon left to decode.
- [x] A player who did nothing gets **no line at all** — five spelled zeros is longer
  *and* says less than silence. A `0` in a column is classed so it recedes.
- [x] ⚠️ **Touches is in neither list.** "5 touches" answers nothing anybody asks after a
  match, and being the one stat every player always has, it put a prose line on every
  single row — including the rows whose whole story is that nothing happened. It still
  feeds `mvpScore`; it just isn't worth a line.
- [x] `tests/matchstats.mjs` holds the three sides against each other: headings are words
  (checked on LENGTH), nothing non-zero is lost (number AND word, so "less info" can't
  become "lost info"), and a full 4v4 row fits **360px** without overflowing its panel.

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

- [-] **The frozen-legacy reference opponent is retired for good — do not rebuild it.** The idea
  was to keep a frozen copy of the old `runBot` in the suite and measure win rate against it.
  It cannot work: legacy steering on the *new* kick path traps and fires at full charge, scoring
  7.5 goals a match at Elite, which is behaviour it never had. The opponent it measures against
  is not the old bot, it is a chimera, and every number off it is meaningless.
- [x] **What replaced it, and it is a standing test rather than a one-off.** Balance is measured
  tier-vs-tier on current mechanics, which isolates the AI change, with **each pair played both
  ways round** — driving one side manually gives it about a 17-point edge, and a one-sided
  harness reported normal-vs-normal at 0.33 and made every other number suspect. In
  `tests/botai.mjs`, which enforces only the gaps the sample size can actually resolve and
  reports the rest.
- [x] **Re-measured after the goal-box rule landed** (2 modes × 4 seeds, both orientations):
  self-vs-self **0.50**, rookie<easy **0.81**, normal<hard **0.72**, rookie<insane **0.63**.
  Ordering intact and the harness still fair. rookie<normal reads 0.50 here against 0.66 before,
  which is inside the run-to-run spread already recorded for that pair (0.17–0.66) — it is the
  one gap this sample size cannot resolve, which is exactly why the suite reports it instead of
  asserting it.

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

- [x] **The `mates.indexOf(p) % 2` placement is gone.** It made two bots in a 4v4 compute an
  identical defender spot and two an identical attacker spot, so they hovered as pairs and only
  separation kept them apart. `botFormationSpot` is ball-anchored with a distinct slot per role.
- [x] **Steps 2 and 4–9 landed** — the four-layer AI (`botPhase` → `botAssignRoles` → the
  per-bot decision → Layer-0 steering), `botPickAim` scoring shot/pass/bank/clear through one
  function, `botIntercept`'s anticipation limit as a real difficulty axis, and every tuning
  value in the one `BOT` block.
- [-] **8a's frozen reference opponent is retired** — it cannot work, see the note under the
  checkpoint-B section. The `DIFF` balance is measured tier-vs-tier on current mechanics in
  `tests/botai.mjs` instead.

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
- [x] **Three ids exist in markup that nothing reads, and all three are accounted for** —
  `rankLine` is a layout wrapper (fine, kept), and `roomCode` / `shopPledge` belong to the two
  known "Coming soon" stubs below. Nothing else is orphaned; re-checked 2026-08-08. There is nothing
  to delete here until the keep-or-cut on those two stubs is decided, which is an owner call
  rather than housekeeping.

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
- [x] **Unreferenced art: KEPT, deliberately.** `assets/` is 36 MB / 7,170 files, of which
  `kenney_input-prompts_1.5` (21 MB), `mobile-controls-1` (7.1 MB) and `kenney_sports-pack`
  (2.7 MB) have **zero references** in `index.html`, `sw.js` or `manifest.json` — only the fonts,
  10 animal PNGs and the flag vectors are used. Nothing is shipped to the player either way; it
  only costs clone size. The owner's call is to keep it, so this is settled — don't re-propose
  deleting it.
- [x] **Sprite skins: removed, not shipped.** The Skins card is gone entirely; the ball has nine
  **drawn** looks (`BALL_LOOKS` / `paintBall`) and needs no PNGs. `tests/balllook.mjs` asserts
  no request is made for sprite art.
- [x] **CI** — `.github/workflows/tests.yml` runs `node tests/run.mjs` on every push and PR.
  Playwright is installed dev-only with `--no-save --no-package-lock`, so the repo still carries
  no `package.json` and no lockfile; the version is pinned in the workflow instead.

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

## 🎥 Goal camera, take three — done
Reported twice as "still bad". Interviewed rather than guessed at, so the spec below is
what was asked for and not a fourth tuning pass:
- [x] **Subject: the scorer.** Same as today — the camera follows whoever last touched the
  ball. Confirmed, so `goalCam.p` does not change.
- [x] **Motion: fast push, SLOW release.** `outSecs` 1.10s against `inSecs` 0.10s — eleven
  times, and asserted as a RATIO so a retune can move both without the check going quiet. The push is already six frames; the way out is
  not, and the way out is the half of it that currently reads as a lurch. `inSecs` and
  `outSecs` want to be genuinely different numbers, not one dial mirrored.
- [x] **Amount: strong, ~1.8×.** The shipped default is a 5% push, which was a correction
  for a 5.0× that swallowed the pitch — and it over-corrected into doing nothing visible.
  1.8× is the answer to both.
- [x] ⚠️ **TWO old default pairs to fold now**, not one — 500/115 and 105/10 — and the
  match is on the PAIR, because 105 beside a speed the player moved themselves is a
  deliberate 5% push and folding it would overwrite a choice.
- [x] ⚠️ **Found doing it: the release DRAGGED the view across the pitch.** `resetKickoff`
  teleports every body to its formation and the camera follows its subject's live
  position, so the scorer hauled the whole view with them mid-drift-out — measured at
  **704px**. Invisible at a 5% push; a lurch at 1.8× over 1.1s, and it would have read as
  the retune being wrong. The camera now lets go of the player and holds the spot.
- [x] ⚠️ Whatever lands, `normalizeGoalCam()` folds the old saved defaults forward, and
  `tests/goalcam.mjs` still has to show the world bit-identical with the camera running —
  it is render-only and that is not negotiable.

## 🧾 Asked for, not yet built (2026-08-10 list)
- [ ] **Multiple photos** — up to 100 saved faceplate photos, pick one to wear, and a delete
  flow that arms first (press Delete → tick the ones to go → confirm). ⚠️ `localStorage` is
  ~5MB and already holds the save; 100 × 128² photos belongs in IndexedDB alongside the
  replay library, not beside it.
- [ ] **Continents kick off the game** — first launch is on Grass with country flags, one
  continent against another, every player on a side from the same continent and never a
  continent against itself.
- [x] **Warm-up balls** — a ball at each half's centre, one more per player who joins, each
  confined to its own half by a `ballOnly` wall on halfway.
  - [x] ⚠️ **The real finding: the lobby's ball was FROZEN** (`integrate(w, true, ...)`), so
    the one control you most need to test before a match was the one you could not. Live now;
    `checkGoal` is gated on `state === 'play'`, so nothing in the lobby can reach the score.
  - [x] ⚠️ **Second finding: extras were never kickable.** `handleBallControl` was only ever
    handed `w.ball`, so every multiball extra was a thing you could bump and not kick.
    `nearestControlBall` — one ball per player per step, never a loop, because trap/kickUsed/
    charge are single-ball state.
  - [x] ⚠️ **Third: KICK was bound to Start in the lobby**, so pressing A to test a kick ended
    the warm-up. Reverses an earlier deliberate decision, for a reason that did not exist when
    it was made — the ball was frozen then, so A had no other job in there.
- [ ] **Per-name local stats** — track a player's record against the name they are using, and
  start a fresh record when the name changes.
- [ ] **Break-the-targets drill** — 60 seconds to score as many balls as you can into either
  goal, balls respawning at one of five fixed spots. A ball-control teacher, Smash Bros style.
- [ ] **Trapping turns the ball round you** — a trapped ball rotates about the player toward
  where you are aiming (6 o'clock swings to 12 to pass upfield), and another player can kick
  it off you while you hold it. ⚠️ The second half is the interesting one: `handleBallControl`
  currently owns a trapped ball outright.
- [-] **Cocktail calibration by touch** — reported here as a dead end and **it is not one**.
  The claim came from reading `beginCalibration` without driving it: `padFor` maps `human1`
  to `pads.p1`, which *is* the on-screen thumbstick, so holding a direction on the touch
  stick registers exactly as a pad's would. Driven end to end it completes both steps and
  the button goes back to START. Authorisation to "skip calibration on touch" was given on
  the strength of the wrong premise, so it was **not** acted on — removing it would delete
  the one thing that makes cocktail work, since players on different edges of a shared
  screen genuinely need different rotations. Pinned in `tests/touchstart.mjs` instead.

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
- [x] **`index.html` is 14844 lines, and there is a SECTION INDEX at the top of the script.**
  The single-file rule is a deliberate constraint (see `CLAUDE.md`), not an accident, but
  navigating the file was the main tax on every change. ⚠️ The index lists MARKER STRINGS,
  never line numbers: a line number is wrong the moment anybody edits above it, and wrong
  *silently*, which is worse than no map at all. 63 entries, and `tests/sectionindex.mjs`
  checks every one still resolves to exactly one place — plus that the index has not quietly
  grown a line number, which is the failure a reviewer would wave through. Splitting the file
  is still not on the table.
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
- [x] **CI** — the suite runs on every push and PR (`.github/workflows/tests.yml`).
- [ ] **Console-error budget is strict** — suites fail on *any* console error, which already caught a
  self-inflicted 404 (eagerly probing missing skin art on every settings build). Keep it strict.
- [ ] After physics changes: re-verify **ball containment on every field**.
- [ ] After adding any flag/eye/cap: **render it once** to catch throwing draw fns.
- [ ] Watch for **duplicate element IDs** (breaks `$()` / `getElementById`) — e.g. the `id="clock"`
  collision already hit once.
- [ ] Check the console for errors after each change.
