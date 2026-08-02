# Magnetball — TODO

Near-term, actionable task list. For the larger feature backlog (tiers, effort
estimates, community asks), see [`../ROADMAP.md`](../ROADMAP.md).

Status legend: `[ ]` open · `[~]` in progress / uncommitted · `[x]` done · `[-]` parked/won't-do

_Current build: **v20260802.5** (shown under the title; bump `VERSION` in `index.html` on every change)._

---

## 🔜 Now — uncommitted, ready to ship
- [~] **Build version label** under the title (`v20260801.2`, static, replaces the earlier live clock).
- [~] **Settings reset button** — "↺ Reset all settings to default" at the foot of the settings cards.
  Resets `sel` (theme, display, skins, sound, game feel, controls, party mods); keeps player
  name/cosmetics and progression.
- [ ] **Commit & push** the above batch (version label + reset button).

## ✅ Recently done (committed)
- [x] **Theme contrast pass (all AA)** — Paper (light) theme was inheriting dark-theme hardcodes
  (`#fff` text on light panels, `var(--text)` on a hardcoded dark input, white-on-gold kick pad).
  Added themed `--field` / `--on-accent` vars, routed inputs/chips/labels through `var(--text)`,
  and bumped the two low-contrast greens. Every text/bg pair now clears WCAG AA on all 6 themes
  (verified numerically); team red/blue stay distinguishable under protan/deutan/tritan.
- [x] **Drills use the standard controls** — `zoneForTouch` read `world.mode.twoP`, but drills build
  a world with no `mode` block, so the first touch threw and the player couldn't move. Guarded it.
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

## 🧪 Testing reminders (from CLAUDE.md)
- [ ] After physics changes: re-verify **ball containment on every field**.
- [ ] After adding any flag/eye/cap: **render it once** to catch throwing draw fns.
- [ ] Watch for **duplicate element IDs** (breaks `$()` / `getElementById`) — e.g. the `id="clock"`
  collision already hit once.
- [ ] Check the console for errors after each change.
