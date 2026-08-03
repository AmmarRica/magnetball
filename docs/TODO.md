# Magnetball — TODO

Near-term, actionable task list. For the larger feature backlog (tiers, effort
estimates, community asks), see [`../ROADMAP.md`](../ROADMAP.md).

Status legend: `[ ]` open · `[~]` in progress / uncommitted · `[x]` done · `[-]` parked/won't-do

_Current build: **v20260802.7** (shown under the title; bump `VERSION` in `index.html` on every change)._

---

## 🔜 Now — uncommitted, ready to ship
- [~] **Build version label** under the title (`v20260801.2`, static, replaces the earlier live clock).
- [~] **Settings reset button** — "↺ Reset all settings to default" at the foot of the settings cards.
  Resets `sel` (theme, display, skins, sound, game feel, controls, party mods); keeps player
  name/cosmetics and progression.
- [ ] **Commit & push** the above batch (version label + reset button).

## ✅ Recently done (committed)
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
- [ ] **Skins are experimental** — sprite ball/player skins only render once image files land under
  `assets/` (see that folder's README). Ship art or hide the section.

## 🚧 Parked — needs a decision or is blocked
- [-] **Leaderboard writes** — closed by design. No hosted backend (Google Sheet only, read via
  public gviz JSON). Writing scores/replays needs a hosted endpoint (Apps Script), which is ruled
  out, so the board is **read-only**: it shows only your local score + the offline sample.
  `lbSubmit`/`lbSubmitReplay` stay no-ops. Revisit only if the no-backend rule changes.
- [ ] **Online rooms (host / join by code)** — the Settings → Online card is a "coming soon" stub
  (`#roomCode` disabled). Real online play is an XL, backend-touching feature — see ROADMAP Tier 3.

## 🧪 Testing / infra
- [ ] **No committed test suite or CI** — the drill-touch crash and the white-on-white Paper theme
  both shipped because nothing catches regressions. Commit a small Playwright suite (drill touch via
  dispatched events, render every theme/flag/eye, 30-field ball containment, console-error check) and
  a GitHub Action to run it on push. Highest-leverage item — it's the root reason the P0 bugs happened.
- [ ] After physics changes: re-verify **ball containment on every field**.
- [ ] After adding any flag/eye/cap: **render it once** to catch throwing draw fns.
- [ ] Watch for **duplicate element IDs** (breaks `$()` / `getElementById`) — e.g. the `id="clock"`
  collision already hit once.
- [ ] Check the console for errors after each change.
