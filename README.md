# ⚽ Magnetball

A fast, **mobile-first, touch-first** physics soccer game — the classic style discs, built to be played
with two thumbs on a phone (and great on desktop and arcade "cocktail" setups too). It's a **single
self-contained `index.html`**: no build step, no dependencies, no server. Graphics are drawn on a
`<canvas>`, sound is synthesized with the Web Audio API, and it installs & runs offline as a PWA.

**Play:** open `index.html`, or host it anywhere static (GitHub Pages, Netlify, an S3 bucket…).

---

## Controls
- **Move:** drag anywhere on the right half — a joystick appears under your thumb (further = faster).
- **Kick / trap:** hold the **KICK** pad and run into the ball; it sticks to your feet briefly so you
  can aim, then release to shoot (longer hold = harder shot).
- **Desktop:** arrows/WASD move, **Space or X** kicks; gamepads work for every seat.
- Left-handed swap, stick sensitivity, and full controller rebinding are in Settings.

## Features
- **Play:** 1v1–4v4 vs bots across 7 difficulty tiers, local 2-player, duo, spectate.
- **30 pitches**, 4 ball presets, pitch surfaces (grass/ice/mud that **wear in** as you play),
  net physics, bouncy walls.
- **Bots that play football** — a four-layer AI (team phase → roles → decision → steering) with
  a goalie, an elastic formation, intercept prediction, lane-checked passing and bank shots off
  the boards. Fully deterministic: same seed, same match.
- **Modes:** Season/Cup ladder · **Gauntlet** roguelike run (lives + stacking perks) ·
  **Killer Lobsters** · 24 practice drills with ghost coaching · guided tutorial ·
  **party modifiers** (big ball / low-gravity / sudden-death / multi-ball).
- **Progression:** RP + Wood→Legend ranks, **Elo MMR**, and **210 cosmetics** —
  85 countryball flags, 48 text plates, 36 caps, 31 eye styles, 10 animals — most gated behind
  a play milestone.
- **Customize:** live "build your player" (colour + faceplate + eyes + cap) — players wear
  **shirt numbers** by default — plus 9 drawn ball looks. Everything is drawn, never a sprite.
- **Juice:** goal replays (skippable, one-tap clip share), screen shake, slow-mo, squash & stretch,
  confetti, crowd SFX, end-of-match awards.
- **Social / Watch:** an Instagram-style feed of goal clips (your saved goals + a mock field).
- **Leaderboard:** reads a live global board from a Google Sheet (no backend); optional score +
  replay submission via a tiny Apps Script (see below).
- **Themes:** 7 full palettes; every themed ink is contrast-checked to WCAG AA against the
  surface it lands on; colour-blind team markers on by default; PWA / installable / offline.
- **Display modes:** auto mobile/desktop, plus **cocktail** (flat screen with players around it —
  each controller rotates to the side they stand on). Settings can also live on their own
  `/settings` page, synced live with the game tab.

## Run locally
It's plain static files. Either:
```bash
# open directly
open index.html            # macOS  (or just double-click)
# …or serve (recommended, so the service worker + fetches behave like production)
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Deploy
Any static host. For **GitHub Pages**: push these files to the repo root, then
**Settings → Pages → Deploy from branch → `main` / root**.

## Live leaderboard (optional)
The board reads from a Google Sheet with zero backend, and can write scores/replays via a small
Google Apps Script. Full setup — sheet sharing, the script to paste, and mock data — is in
[`LEADERBOARD_SETUP.md`](./LEADERBOARD_SETUP.md). The script lives in [`leaderboard.gs`](./leaderboard.gs).

## Project structure
```
index.html            The entire game (HTML + CSS + JS + canvas engine)
sw.js                 Service worker (offline / PWA, network-first for HTML)
manifest.json         PWA manifest
icon.svg              App icon
assets/               Optional art (flags, animal faces, controller icons) — see assets/README.md
menu/                 The /menu route (the same document with the game switched off)
settings/             The old name of that route — a redirect to ../menu/
tests/                Headless Playwright suites — see tests/README.md
docs/                 TODO, terminology, and the audit reports
leaderboard.gs        Google Apps Script for the live leaderboard (paste into the Sheet)
LEADERBOARD_SETUP.md  How to wire up the Google Sheet leaderboard
mock-scores.tsv       Paste-in sample rows for the leaderboard sheet
ROADMAP.md            Shipped log + backlog
CLAUDE.md             Notes for working on this codebase with Claude Code
```

## Tech
Vanilla HTML/CSS/JS. Fixed-timestep physics (1/60s) with sub-stepped collisions; elastic
disc/wall/arc collisions; theme engine driving both CSS variables and the canvas palette;
`localStorage` for all saves. No frameworks, no bundler, no network required to play.

## Testing
The game exposes a debug hook when `window.__MAGNETDEBUG = true` (set before load) via
`window.__magnet`. **42 headless Playwright suites** drive the real page — `node tests/run.mjs`.
See [`tests/README.md`](./tests/README.md) for what each covers, and [`CLAUDE.md`](./CLAUDE.md)
for how to write one.

## Credits
Design & code: Ammar. Everything is programmatic — the pitch, the discs, the ball and every
cosmetic are drawn on the canvas, and all audio is synthesised at runtime. The only image assets
are optional: country flags and a few CC0 [Kenney](https://kenney.nl) packs (animal faces,
controller icons), each with a drawn fallback.
