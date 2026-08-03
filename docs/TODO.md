# Magnetball — TODO

Near-term, actionable task list. For the larger feature backlog (tiers, effort
estimates, community asks), see [`../ROADMAP.md`](../ROADMAP.md).

Status legend: `[ ]` open · `[~]` in progress / uncommitted · `[x]` done · `[-]` parked/won't-do

_Current build: **v20260803.1148PM** (shown under the title; bump `VERSION` in `index.html` on every change)._

---

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

- [ ] **Pitch surface is invisible** — Grass / Ice / Mud genuinely change grip
  (`pAccel` 0.40 / 0.26 / 0.34, verified) but the court is **pixel-identical** on all three, so a
  player has no way to tell which surface they're on until they move. Either tint the court per
  surface or say so in the picker. *(This is the one audited feature that affects the game but
  not its visuals — left as a design call rather than changing the look unasked.)*
- [ ] **Three ids exist in markup that nothing reads** — `rankLine` (a layout wrapper, fine),
  `roomCode` (the disabled Online stub) and `shopPledge` (the "Coming soon" support card). The
  latter two are the known dead-UI stubs below; nothing else is orphaned.

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

- [x] **Committed test suite** — `tests/` holds 27 headless Playwright suites driving the real page
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
