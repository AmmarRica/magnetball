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
  ⚠️ It reads the pad every step, so setting `p.kick`/`p.inX` directly in a test gets overwritten —
  drive `pads.p1` or call `handleBallControl` instead.
- **Goal box:** the net pocket mirrored onto the pitch in front of each goal line — same
  mouth width, same depth — drawn OPEN (three sides; the goal line closes it) at
  `GOAL_BOX_A` alpha so the goal line stays the loudest mark down there.
  `tests/goalbox.mjs` checks the mirror is exact on all 30 fields by pixel sampling.
- **Motion tells:** short dot tails behind the players and one streak behind the ball,
  both capped in world units (`DOT_GAP`/`DOT_MAX`, `BALL_LEN_MAX`). ⚠️ A three-second,
  time-measured version of these was built and **reverted**: at the speed cap it drew a
  streak most of a pitch long that hung off a stationary ball, and it read as a tail
  rather than a tell. Length is deliberately short — the tells say *where someone just
  came from*, not what the whole possession looked like. Advanced in `advanceTrails`
  next to `step(world)`, never in a draw: at 144Hz the same match showed a 69-unit ball
  streak instead of 190.
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
- **Themes are a COLLECTION of slots**, not one key. `SLOTS` declares five — `palette`
  (page + pitch colours, a `THEMES` key), `field` (a `DYN_FIELDS` key or `none`), `discs`
  (a `DISC_SKINS` key or `none`), `ball` (a `BALL_LOOKS` key) and `sfx` (an `SFX_SETS` key).
  The first four live in `sel.look`; **the sound slot has no stored value at all** —
  `sfxSetKey()` derives it from `sel.snd`, which the Sound card already owns one category
  at a time. A **bundle** sets all five: every palette is one (`bundleSlots(k)`), and
  `THEME_BUNDLES` only lists the two that own more than colour. Names/emoji are read from
  `THEMES`, never copied.
  ⚠️ **"Custom" is DERIVED, never stored** — `currentBundle()` matches the live slots
  against the table, so rebuilding Pool by hand gets Pool's name back instead of leaving a
  lie on screen, and a stored `custom` can't go stale. Same reason `sel.theme`/`sel.ballLook`
  were dropped rather than kept alongside: `normalizeLook()` folds a legacy save in **once**,
  at load, so nothing downstream knows two shapes.
  `buildSlotPicker(slot, host)` is the one tile builder — the Theme card stacks all five and
  the Ball/Sound cards each show one again, so a card can't drift from the theme.
  The bundle row also carries a **Custom** tile: selected whenever the live slots match no
  bundle, painted from the mix you actually built (`drawSlotsSwatch`), and pressing it
  restores `sel.customLook` so Custom is somewhere you can go *back* to.
  `tests/themeslots.mjs`.
- **What a theme can OWN:** `DYN_FIELDS` entries (`{name, reset?, step?, paint}`) paint over
  the pitch surface; `DISC_SKINS` entries replace `drawOneDisc`'s body. `warp` = black-and-white
  with a starfield tunnel; `pool` = a pool table with numbered solids vs stripes;
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
- **Icons:** `ICONS` (one 24×24 grid, one stroke weight, `currentColor`) → `iconSvg(name)` →
  `optGlyph(entry)`, which every option tile and nav tile goes through. ⚠️ **Opting in is an
  `icon:` FIELD, never a lookup by emoji** — emoji are not unique across tables (⚡ is both the
  Quick match length and the Elite difficulty tier), so a by-emoji map puts a stopwatch on a
  difficulty tile. ⚠️ **Cosmetic tables are deliberately NOT converted**: in `CAPS`, `EYES`,
  `ANIMALS` and `TEXTS` the emoji IS the item — `paintCap` draws that exact glyph on the disc —
  so an icon there would show a picture of something other than what you picked. Anything with
  no `icon:` keeps its emoji. Difficulty is drawn as a **ramp** (`tierNofM`, filled pips) rather
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
- **Goal box occupancy (`sel.boxRule`):** one defender and one attacker inside a goal box at a
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
  the ball and eases back when the celebration ends. Render only — it moves `cam`, which no
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
`tests/run.mjs` runs all 60 suites; `tests/README.md` lists what each covers and the measurement
traps that have produced false results here before — read it before writing a new one.

Always: (1) render every new flag/eye/text/ball-look once to catch throwing draw fns, (2) re-verify
ball containment on all fields after physics changes, (3) check the console for errors, (4) assert
the thing you mean — several suites here have passed for the wrong reason.

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
