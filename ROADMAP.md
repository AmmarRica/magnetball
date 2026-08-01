# Magnetball — Feature Roadmap

A backlog derived from what the HaxBall community most asks for
(github.com/haxball/haxball-issues, r/haxball, community threads), filtered to
what makes sense for a **mobile, touch-first** game. Each item notes rough
**effort** (S/M/L/XL) and **why** it's wanted.

Legend: ✅ done · 🎯 recommended next · effort S(hours) M(a day) L(days) XL(big)

---

## ✅ Shipped since
- **Roguelike "Gauntlet" mode** — a run of escalating matches vs rising bot tiers (1v1 → 2v2 →
  3v3). Start with **3 lives**; **win to descend** a depth and **pick 1 of 3 random upgrades**
  (Cannon, Sprint, Magnet, Beach Ball, Floaty, Stopwatch, Extra Life) that **stack** for the run;
  **lose to spend a life**. Run ends at 0 lives, and your **deepest run** is remembered. New
  ☠️ Gauntlet tile on the menu.
- **Content explosion (3×)** — tripled the unlockables, cosmetics and courts:
  **85 countryball flags** (was 29), **31 eye styles** (was 11), **36 caps** (was 12), and
  **30 pitches** (was 10 — new shapes/sizes like Giant, Marathon, Coliseum, Hexagon, Diamond,
  Pill, Penalty, Endless…). Every new cosmetic has an unlock requirement on the RP/wins/goals/
  streak/played/drills curve; all render verified with no errors and every field keeps the ball
  contained.
- **MMR (Elo rating)** — a proper skill rating (start 1000) updated per match against the bot
  tier's implied strength, shown on the menu Record card with your peak. Seeds future
  matchmaking / the belt.
- **Party modifiers** — toggle fun match twists in Match setup: **Big Ball** (1.8×), **Low Gravity**
  (floaty ball + slippery players), **Sudden Death** (first goal wins), and **Multi-Ball** (two extra
  fully-physical, scorable balls that bounce off each other and everything else — containment verified).
  Mix and match freely.
- **"Your clips" tab in Watch** — a new **Yours** filter in the Social feed shows only your own saved
  goals, each with a 🗑 delete button. Your Save-clip goals already land here automatically.
- **Main-menu redesign** — destinations no longer buried under long config cards. Now: logo → record
  → a big **KICK OFF**, then a compact **3×3 icon grid** (Season, Drills, Tutorial, Watch, Ranks,
  Daily, Shop, Settings, How) right at the top. The Match / Your Player / Controls / Online config
  cards are collapsed one-line sections by default; smaller icons and less text throughout.
- **Social / Watch feed (Instagram-style)** — a vertical feed of goal clips that each **autoplay a
  real mini re-simulation** (like a video), with **like** (double-tap too), **comment** (add your
  own), **save**, share, and **Today / This Month / All-time** filters. Seeded with mock posts for
  now; your own **Save clip** goals get pushed to the top of the feed for real (stored locally).
  Only visible cards animate (like IG autoplay). No backend.
- **Clarity + colour-blind pass** — the **colour-blind team markers** (solid ring vs dashed ring,
  hue-independent) are now **on by default** so teams are distinguishable by shape, not just colour
  (toggle in Settings). Lighter, higher-contrast muted text across all themes, and a bigger, crisper
  in-game player-name plate.
- **Save clip → sheet (replay data)** — "Save clip" now also posts the goal's **replay data**
  (the re-simulatable frame buffer, rounded + downsampled to fit one cell — not the video) to a
  **Replays** tab in the Google Sheet, created automatically by the Apps Script. The button shows
  **✓ Saved to sheet** / **⚠ Sheet not connected** so you know it landed. (Writing needs the Apps
  Script endpoint from LEADERBOARD_SETUP.md.)
- **Bot fairness** — bots no longer get a hidden magnet "stick" the player doesn't have; everyone
  plays with the same ball-magnet setting, so at magnet 0 the ball is a free puck for bots too.
- **Display modes (mobile / desktop / cocktail)** — a Display section in Settings. **Auto** picks
  mobile vs desktop by screen width; on desktop/cocktail the on-screen touch thumbsticks are hidden
  (keyboard + gamepad drive play instead). **Cocktail** is a new mode for a flat screen laid on its
  back with players standing around it: a configurable-first-time (remembered, resettable) screen
  where each of up to 8 seats (4v4) picks which side they stand on, and their controller input is
  rotated so "up" always points into the table from wherever they're standing.
- **End-of-match awards** (Towerfall/CoD style) — everyone leaves with something. The match
  tracks per-player stats (goals, assists, saves, clearances, key passes, hardest shot, posts,
  touches) and the result screen slams up a ranked list of earned medals: **Golden Boot** (MVP),
  **Most Goals**, **Hat Trick**, **Most Saves**, **Most Assists**, **The Wall** (clearances),
  **Playmaker** (passes into shots), **Iron Boot** (hardest shot), **Comeback King** (won from
  2+ down) and a joke **Woodwork** (most posts hit). Ties break to you; a one-tap **Replay / Save
  clip** sits under the awards.
- **Game-feel: squash & slam** — the ball squashes and stretches along its impact axis on every
  kick and hard bounce, then springs back; the result title punches in with a scoreline "slam"
  animation. (On top of the existing shake / slow-mo / hit-stop / confetti / crowd juice.)
- **Shop (cosmetics-only, honest framing)** — a Shop screen that's up-front about monetisation:
  the game is free, nothing that touches gameplay is ever paid, no ads or loot boxes. Featured
  cosmetics show **Owned ✓** or their real unlock path (win N, score N, daily reward); owned items
  equip on tap. A soft coin balance is shown; buying isn't live yet, framed as "support by playing
  & sharing."
- **Real Google Sheet leaderboard** — the global board now reads live scores straight from a
  Google Sheet (via the public gviz JSON endpoint — no API key, works as soon as the sheet is
  shared "anyone with the link can view"). Finishing a match submits your RP through a tiny
  Google Apps Script Web App (upsert-by-name, keeps your best RP), so the sheet stays clean and
  human-readable if you just open it. The board shows **· live** vs **· offline sample**, has a
  ↻ Refresh, and always falls back to a local sample field so it's never empty. Setup steps +
  the script to paste live in `LEADERBOARD_SETUP.md` and `leaderboard.gs`.
- **Daily login rewards** — every calendar day you visit grants the next reward on a generous
  track (countryballs, caps, eye styles, RP; milestones at day 5/10/14, then endless RP). A
  first-visit popup shows today's unlock, your streak, and a roadmap of what's coming. Granted
  items unlock instantly on top of the milestone system; a 🎁 menu button reopens the track.
- **Players step outside the line** — boundary walls are now ball-only, so players can nudge
  ~20px past the pitch edge (HaxBall-style) to get around a ball hugging the wall; the ball is
  still fully contained (verified on all 10 fields).
- **Ball size** — trimmed the ball's render rim so it matches HaxBall's exact 3:2 player:ball
  radius ratio (player 15 / ball 10).
- **Removed the kick aim line** — the on-pitch charge arrow was misleading, so it's gone (the
  KICK-pad charge ring stays).
- **Controller button mapping** — a "press a button to bind it" flow: a Controller config
  screen (Controls → Configure buttons) where you rebind Up / Down / Left / Right / Kick by
  pressing them on your gamepad. Rebind-all walks all five; per-row rebinding; reset to
  default; the mapping (`sel.pad`) persists and drives gamepad input (analog stick still works).
- **Polish pass** — HaxBall-feel refinements: a **charge/aim arrow** that grows and turns
  yellow with kick power so shots are readable; **first-touch feedback** (a ring flash on a
  clean trap or sharp redirect); a **crowd swell** on shots toward goal and a **groan** on a
  post/near-miss (SFX only, no music); and **auto-replay of goals** in slow-motion with a
  Settings toggle. (Camera pass intentionally skipped; no music by request.)
- **Always-on desktop dock** — on wide screens a match auto-docks the Settings panel on the
  left with the pitch on the right (uses your screen real estate); toggle with the gear,
  remembered as a preference, auto-hides below 900px.
- **Mock global leaderboard** — a simulated global ranking (24 fake players with countryballs)
  with your real RP slotted in at the correct rank and highlighted.
- **Easy movement drills + coaching ghost** — 10 new beginner drills (straight, turns, U-turn,
  zig-zag, round-the-cone, box, long push, dribble-&-finish…) that are timed generously so the
  goal is just to finish. Each shows a **coaching ghost** — a dotted route plus a faded ghost
  player+ball looping the ideal path — so you can see the movement to copy.
- **More human bot AI** — bots now anticipate the ball, **pass** to open upfield teammates
  instead of always forcing it, and **flock/space out** (separation) instead of clumping.
- **Bouncy walls** — field walls are now near-elastic (~0.9 restitution) so the ball keeps its
  momentum off the boundary and you can pass to yourself off a wall; only the **net** kills
  momentum. (Ball containment still verified on all 10 fields.)
- **Onboarding tutorial** — a short guided first match (move → reach → kick → score) with
  coaching tips that advance as you complete each step.
- **Season / Cup** (#10) — a single-player ladder of 5 rounds vs rising difficulty (Easy →
  Pro, 1v1 → 2v2); win to advance, lose to retry, lift the trophy at the end. Progress and
  cup count persist.
- **Dribble Maze drill** — dribble the ball through winding lanes and gaps to the end circle
  (interior drill walls are now drawn — also fixes 3 older wall drills that were invisible).
- **Collapsible menu** — the long setup screen is now accordion sections (Your Player / Match /
  Controls / Online), remembered between visits, with an **Online (coming soon)** section stub.
- **Esc closes Settings** — same as the Back button (works for the desktop dock too).
- **Juice pass** — game-feel polish: screen shake (scaled by kick power, hard wall/net hits,
  and big on goals), a brief hit-stop freeze-frame and dramatic slow-mo on goals, a coloured
  goal flash (scorer's team), and a bigger confetti burst. All gated by a **Screen shake &
  effects** toggle in Settings (accessibility — off makes every effect a no-op).
- **Desktop live-settings dock** — on wide screens the full Settings panel docks on the left
  as a persistent sidebar so you can tweak theme / sound / feel while the match keeps playing;
  the pitch camera insets so it's never hidden. Mobile keeps the fullscreen overlay.
- **Wider difficulty range** — 7 bot tiers now: Rookie, Easy, Normal, Hard, Pro, Elite, Insane
  (RP rewards scale across the range).
- **Unlockables + Countryballs + player builder** (#4, #8) — 51 unlockable cosmetics: 29
  **countryball** flag skins for your disc, 10 **eye styles**, and 12 **caps**, each gated
  behind a milestone (RP, wins, goals, win-streak, matches played, or drills finished). A
  live-preview "build your own player" in the setup screen (colour + flag + eyes + cap);
  locked items show their requirement. Bots wear random flags/eyes for personality. The
  actual match ball is never skinned — only players.
- **Goal replay + clip share** (#9) — a rolling 6-second snapshot buffer is frozen on every
  goal and re-rendered as an instant replay (offline, theme-aware). A **Save clip** button
  records that playback with `MediaRecorder` and opens the native share sheet
  (`navigator.share`), falling back to a file download. No external libraries.
- **Kick feel + Pro preset** — one-shot kicks now carry the striker's momentum, so a
  running shot is stronger and more directional than a standing one (HaxBall-like). New
  **Casual / Pro** feel presets in Settings: Pro is authentic — no magnet, no trap (instant
  kick), floatier acceleration and a higher ball-speed cap for a raw, high-skill feel.
- **Themes** (#17) — a full theme engine: palettes drive both the CSS and the canvas, so a
  theme reskins the entire game. 6 built-in looks — **Neon** (the CRT default), **Flat**,
  **Grass**, **Mono**, **Paper** (light), **Videoball** (flat vivid, geometric) — picked live
  from Settings. Player colours still customise the disc core on top of any theme.
- **Sound & SFX** (#2) — programmatic Web Audio (no files): whistle on kickoff/reset, crowd on
  goal, pass/kick, wall-bounce and net sounds. **3 selectable variants per sound**, tap-to-hear,
  master mute + volume — all in an in-game **Settings** screen (⚙ in the HUD).
- **Game-feel sliders** (#17-ish) — live-tunable player acceleration, player float, kick power,
  max ball speed, ball glide, ball magnet, and stick sensitivity. Reset-to-default button.
- **Field variety** — 10 pitch shapes/sizes (Classic, Big, Small, Wide, Long, Huge, Rounded,
  Stadium, **Octagon** (chamfered corners), Futsal).
- **Net physics** — the ball loses momentum (halved) hitting the net so it settles inside the goal.
- **Kickoff hold** — the ball stays on the spot until a human actually kicks near it (bots hold
  their formation), so play only starts when you touch it.
- **Practice / drills challenge mode** — 12+ drills (incl. Y-passing and an angled free-kick
  through a wall gap) with best-time tracking and a quick reset.
- **Pitch surface** (#18) — Grass / Ice (slide) / Mud (sluggish), scaling player grip
- **Spectator / Watch** (#15) — hand your seat to the AI and watch
- **Colour-blind team markers** (#7) — solid vs dashed white rings, hue-independent
- (Theme switched to a ZX Spectrum / MSX dark-neon look per request)

## ✅ Shipped earlier
- **Charge-kick power meter** (#1) — hold KICK to wind up power (pad ring fills)
- **Local stats + Rank/ELO ladder** (#3, #8) — RP, Wood→Legend ranks, W/L/D, goals, streaks
- **Golden-goal overtime** (#5) — tied timed matches go to sudden death
- **Training mode** (#11) — free practice, no clock/opponents
- **Control tuning** (#6) — left-handed swap + stick sensitivity
- **Ball presets** (#17) — Normal / Big / Heavy / Bouncy

## ✅ Already in Magnetball
- Mobile-native, touch dual-thumb controls — *the single most-requested platform gap*
- 1v1 / 2v2 / 3v3 / 4v4 vs bots, difficulty tiers
- Player customization: name, colour, cap
- Ball Magnet (0–100) — adjustable ball control
- Magnet-charged kicks (hold-close → further shot)
- Gamepad support (up to 4v4)
- Multiple fields, PWA/offline, Amiga visual theme

---

## 🎯 Tier 1 — Quick wins (S–M, high delight)
1. **Charge-kick power meter** (M) — hold KICK to build power, release to shoot; ring/bar shows charge.
   *Top gameplay ask ("variable pass/kick power, FIFA/PES-style").* Extends the magnet-charge you already have.
2. **Sound & music** (M) — kick/goal/whistle SFX + optional chiptune loop and crowd; mute toggle.
   *Community wants audio/commentary.* Fits the Amiga theme.
3. **Local stats** (S–M) — goals, assists, wins/losses, win streak, per-session totals in localStorage.
   *Stats tracking is a perennial request.*
4. **Avatars & flags** (S) — emoji or initial avatar on the disc, optional country flag.
   *Requested: disc avatars, country flags, custom colours.*
5. **Match rules** (S) — overtime / golden goal, and a **penalty shootout** on draws.
6. **Left-handed / swap-thumbs toggle & control tuning** (S) — joystick sensitivity, deadzone, kick keybind.
   *Configurable controls / keybinds are requested.*
7. **Colourblind-friendly team markers** (S) — shapes/patterns in addition to red/blue.

## 🎯 Tier 2 — Progression & replay (M–L)
8. **Rank / ELO ladder vs bots** (M) — climb divisions by beating higher difficulties; title/prefix by rank.
   *Ranked/ELO + rank prefixes are heavily requested.*
9. **Goal replays & clip share** (L) — record the last few seconds, instant-replay a goal, export/share a clip/GIF.
   *Replays & clip export (HBR-style) are wanted.*
10. **Career / season mode** (L) — play a fixture list or bracket **tournament**, track a table.
    *In-client tournaments / championships.*
11. **Training mode** (M) — free practice, shooting drills, magnet/kick sandbox.

## 🎯 Tier 3 — Online & rooms (L–XL)
12. **Phone-as-controller (local WebRTC)** (L) — shared screen + phones as pads via room code/QR.
    *Answers "permanent room links" + mobile multiplayer.* (Design already scoped.)
13. **Online 1v1/2v2 rooms by code** (XL) — WebRTC peer play with a lightweight signaling broker.
    *Real accounts/rooms are the biggest structural ask; room-code links are the practical version.*
14. **Room presets / favourites** (S) — save & pin match setups (mode, field, magnet, length).
    *Favourite/pinned rooms request.*
15. **Spectator view** (M) — watch a bot-vs-bot match; useful for demos and streams.

## 🎯 Tier 4 — Creation & variety (L–XL)
16. **Stadium editor** (XL) — draw pitches with **curves, gradients, RGBA/transparency**, custom goals; save/share via link.
    *Mapmakers' top wishes: higher vertex limits, curves, gradients, alpha.* Biggest lift, biggest community pull.
17. **Field & ball themes** (S–M) — grass patterns, night/retro/ice skins; heavier/lighter/bouncier ball presets.
    *Different grass patterns; configurable disc physics.*
18. **Fun modifiers / party modes** (M) — big-ball, low-gravity, multi-ball, power-ups, sudden-death.
19. **AI formations & roles** (M) — pick a formation; smarter positioning, marking, and passing between bots.

---

## Suggested first slice
Ship **Tier 1** as a "juice & feel" update (charge kick, sound, stats, avatars, shootout) — all self-contained,
no backend — then tackle **rank ladder (#8)** and **phone-as-controller (#12)**. The stadium editor (#16) is the
crowd-pleaser to save for a dedicated push.
