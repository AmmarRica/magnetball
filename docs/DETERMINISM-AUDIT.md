# Magnetball — determinism audit (Phase 0)

Target: P2P WebRTC lockstep across phone / desktop browser / Linux browser, plus
reproducible replays re-renderable to video. No authoritative server.

Audited build: **v20260804.0146AM**, `index.html` (~6,850 lines, single file).
Nothing has been refactored — this is the report only.

---

> **Status (updated).** Phase 1's headline item is **done**: the bot AI's `rand()` was
> `Math.random()` and is now `w.rng` — `mulberry32`, seeded per match from `w.seed`, set outside
> the sim at `startMatch` and pinnable with `setMatchSeed(n)`. `tests/botai.mjs` proves it by
> monkey-patching `Math.random` during a match and asserting the AI never reaches for it, and by
> replaying a pinned seed to a bit-identical input trace. **Everything else below still stands** —
> in particular §3b (transcendental math) is untouched, so this is *reproducible on one engine*,
> not yet bit-exact across engines. The eight decisions in §8 are still open.

## 1. Is the simulation separated from rendering?

**Partly. The timestep is already right; the boundary is not.**

The loop is already a fixed-timestep accumulator:

```js
let dt = (t - lastT) / 1000; lastT = t;
if (dt > 0.1) dt = 0.1;
acc += dt * slow * (sel.matchSpeed || 1);
while (acc >= STEP && steps < 5){ step(world); acc -= STEP; steps++; }
render();
```

`STEP = 1/60`, and `step(w)` takes no `dt` — every physics call uses the constant.
So the *movement math is not inside the draw call*, and that is a big head start.

The problem is that `step()` is **not a pure function of (state, inputs)**. Reachable
from inside a single sim step today:

| Category | Calls | Why it matters |
|---|---|---|
| DOM writes | `showBanner`, `updateClock`, `updateScoreUI`, `toast` | Sim can't run headless or in a worker |
| Audio | `playSfx('net' / 'wall' / 'kick')` | Side effect, harmless to state but blocks headless |
| Render state | `addShake`, `spawnKickFx`, `spawnTouchFx`, `ballSquash` | `spawnKickFx`/`spawnTouchFx` call `Math.random()` **from inside the sim** |
| Canvas | `noteWear(w, p)` in `integrate()` | The wear layer stamps an offscreen canvas from the physics step |
| UI state read | `deckMenuOwnsPad()` | **Sim behaviour depends on whether a menu panel is open** |
| Settings read | `sel.autoReplay`, `sel.juice`, `sel.matchSpeed`, `sel.pitch`, `sel.oneHand`, … | Read live from a global rather than passed in as match config |
| Persistence | `endMatch` → `recordResult` → `localStorage` | Sim step can write to disk |

`deckMenuOwnsPad()` is the one that would bite hardest: two peers with the same
inputs diverge if one of them has the settings menu open.

**Verdict:** no `sim` module exists. Extraction is real work, but it is *unpicking
side effects*, not rewriting the integrator.

---

## 2. Fixed or variable timestep?

**Fixed (`STEP = 1/60`), and physics never sees `dt`.** Three things still make the
number of steps per wall-second vary between machines:

1. **`steps < 5` clamp.** A slow machine silently *drops* sim steps to avoid a
   spiral of death. Under lockstep this must become "block and wait", never drop.
2. **`slow = 0.45` during a goal** (when `sel.juice` is on) and **`sel.matchSpeed`
   (0.5×–2×)** both scale the accumulator. Two peers with different settings would
   run different numbers of steps for the same wall-clock second.
3. **`hitStop`, `paused`, `replay.active`** each skip stepping entirely.

None of these break *step determinism*; they break *frame-count agreement*, which
lockstep needs. The fix is to drive the sim from an authoritative frame counter and
demote juice/slow-mo/match-speed to render-only effects (or lock them in netplay).

---

## 3. Every source of nondeterminism

### 3a. `Math.random()` — 16 call sites

| Site | In sim? | Notes |
|---|---|---|
| ~~`rand()` → bot AI aim error, pass choice~~ | **FIXED** | Now `brand(w)` → `w.rng` (`mulberry32`, seeded from `w.seed`). `rand()` is deleted. |
| `spawnKickFx`, `spawnTouchFx` (particles) | **Called from sim** | Only mutates `fx[]` (render), but is invoked inside `step()` |
| `shake` jitter in `render()` | No | Render only |
| Demo field pick, demo countries, rogue perk choice, `SYNC_ID` | Match setup | Must become seed-derived |
| Audio noise buffers, crowd cheer timings | No | Audio only |

~~Note `rand()` is literally `function rand(){ return Math.random(); }` with a comment
claiming it's fine~~ — **resolved.** The AI's stream is now seeded and the function is gone. One
wrinkle found doing it: seeding from `Date.now()` alone gave two matches started inside the same
millisecond the *same* bots, which the menu, the idle demo and the tests all do — the seed mixes in
a counter now.

**A seeded PRNG is already in the repo**: `mulberry32(a)` (used for the social feed).
It is `Math.imul`-based and integer-safe, so it is a valid Phase 1 drop-in.

### 3b. Transcendental math is **not bit-exact across engines** — the big one

ECMA-262 lets implementations approximate these; results are *not* required to be
identical across engines, versions, or platforms. V8 in particular routes some of
them to the platform's libm, so **the same Chrome on Android and on glibc Linux can
differ in the last bits**.

| Function | Uses | Spec status |
|---|---|---|
| `Math.hypot` | **42** | Implementation-approximated |
| `Math.sin` | 19 | Implementation-approximated |
| `Math.cos` | 17 | Implementation-approximated |
| `Math.atan2` | 5 | Implementation-approximated |
| `Math.pow` / `**` | 5 | Implementation-approximated |
| `Math.exp` | 3 | Implementation-approximated |
| `Math.sqrt` | 2 | **Exactly specified** (IEEE-754 correctly rounded) — safe |
| `abs/min/max/round/floor` | 211 | Exact — safe |

**This is the load-bearing argument for Phase 2.** Fixed timestep and a seeded PRNG
alone will *not* give you cross-device bit-equality while `Math.hypot` is on the hot
path 42 times. Also worth knowing: a large share of those `hypot` calls are pure
distance *comparisons* (`hypot(dx,dy) < r`) that can drop to squared distance and
avoid a root entirely.

### 3c. Input sampled off the render loop

- **Keyboard:** `pollKeys()` is called from `drawControls()`, which is called from
  `render()`. Keyboard state is therefore latched once per *rendered* frame, not per
  sim frame. On a 144Hz or a 30Hz display the sampling cadence differs.
- **Gamepad:** `gamepadPad(index)` calls `navigator.getGamepads()` **inside `step()`**,
  so the sim reads a live browser-owned buffer whose update timing is not ours.
- **Touch:** `pads.p1/p2` are mutated by DOM event handlers, asynchronously.

For lockstep all three must be latched into a per-frame input struct *before* the
frame runs, and the sim must read only that struct.

### 3d. Iteration order — **good news**

Every per-step loop iterates **arrays**, not objects: `w.players`, `w.walls`,
`w.posts`, `w.arcs`, `w.extraBalls`, `w.gates`, `w.zones`, `w.cones`. Collision is
`for i / for j>i` over `discs`. No `for…in`, no `Set`/`Map` iteration, and no
`Object.keys` on the per-step path — those appear only in UI building, unlock counts
and match *setup* (`new Set([profile.name])` for name picking, `Object.keys(FIELDS)`
for the demo's random field).

**No ordering work is required inside the sim.** Setup-time key iteration needs
pinning only because it feeds seeded choices.

### 3e. Clocks in the sim — clean

`Date.now()` appears 11 times: sync liveness, social feed timestamps, double-tap
detection. **None on the per-step path.** `performance.now()` only reaches the sim as
the rAF timestamp feeding the accumulator. Timers inside the sim (`chargeT`, `tapT`,
`trapT`, `stateT`, `timeLeft`, `_koFx`) all advance by the `STEP` constant.

---

## 4. Where floats are load-bearing

| Quantity | Where | Sensitivity |
|---|---|---|
| Position `x, y` | ball(s), players, posts, cones | Highest — feeds every collision test |
| Velocity `vx, vy` | same | High — damped every step, so error compounds |
| Collision response | `collideDiscs` (inverse-mass weighted elastic), `collideWall`, `collideArc` | **Highest** — normalises by `hypot`, divides by distance |
| Damping | `p.vx *= pdamp` (0.85–0.998), `ball.damp` | Compounding multiply, 60×/s — a 1-ulp difference grows |
| Magnet | spring `k = mag*0.14` toward a point ahead of the feet, plus velocity easing | Small deltas, ~1e-3 magnitudes |
| Trap / carry | ball pinned to `p.x + fx*hold`, `hold = r_sum + 2`; spin from turn cross-product | Direct position writes |
| Kick | `power * dir + p.v * KICK_CARRY`, charge bonus `1 + chargeT/max*0.9` | Impulse, one-shot |
| Bot AI | aim error, target clamp, `hypot` distance ranking, threat test | Drives *choices*, so a tiny difference flips a branch |
| Ball sub-stepping | `moveBall` splits fast motion into sub-steps | Sub-step **count** derived from speed — a float compare picks the count |

The two amplifiers are (a) 60Hz compounding damping and (b) branch flips: bot target
selection and sub-step counts turn a 1-ulp difference into a completely different
match within seconds.

---

## 5. Measured ranges (for sizing fixed-point)

Measured on the largest field (`giant`, 660×1160, net 82) with maxed feel settings
(accel 90, ball cap 60, kick 120, glide 998), 4v4 + big ball + low gravity +
multi-ball, 4,000 steps, re-blasting the ball at speed 90 every second:

| Quantity | Structural max | Observed max |
|---|---|---|
| Coordinate \|x\|, \|y\| | **702** (half-length 580 + net 82 + 20 step-out) | 600 |
| Ball velocity per step | cap 60, plus impulse overshoot | **61.4** |
| Player velocity per step | — | 38.7 |
| Ball spin | accrues only on human trap-redirect | 0 in bot play |
| Damping factors | 0.85 … 0.998 | — |
| Smallest meaningful accel | 0.10 | — |

So: **positions need ±1024, velocities ±64**, and the smallest force that must not
quantise to zero is around 1e-3 (magnet spring on a near-stationary ball).

---

## 6. Fixed-point recommendation

**Q16.16 stored in `Int32Array`** — 16 integer bits, 16 fractional bits.

- **Range** ±32,768 vs a needed ±1,024 → 32× headroom for intermediate overshoot
  before clamping.
- **Resolution** 1/65,536 ≈ 1.53e-5 vs a smallest meaningful force of ~1e-3 → about
  65× finer than anything the sim needs to represent.
- Velocities (±64) use only 7 integer bits, leaving huge multiply headroom.

**Do the multiply in doubles, not BigInt.** IEEE-754 double multiplication *is*
exactly specified, and doubles represent every integer up to 2^53 exactly. The worst
case product here is position × velocity in fixed units:
`(702 × 65536) × (64 × 65536) ≈ 1.9e14`, comfortably under 2^53 ≈ 9.0e15. So

```js
const mulFix = (a, b) => (a * b) / 65536 | 0;   // exact and identical on every engine
```

is both deterministic and fast, with no 64-bit emulation. **Overflow guard:** the
product must stay under 2^53 *before* the shift — that means `|a| * |b| < 2.1e9` in
world units. Every sim quantity is far below that, but squared-distance on the
largest field (702² = 492,804) must be computed in *world* units or with an early
shift, not as two Q16.16 values multiplied raw. That is the one place to assert.

`Math.sqrt` is safe to keep (correctly rounded by spec); it needs a deterministic
round at the boundary. `sin`/`cos`/`atan2` need LUTs — a 4,096-entry quarter-wave
table with linear interpolation is more than enough given a 1.5e-5 resolution.

**Alternative considered:** Q20.12 (range ±524k, resolution 2.4e-4). Rejected —
2.4e-4 is only 4× finer than the smallest magnet force, which is too tight once
damping compounds it 60 times a second.

---

## 7. Phased plan with independently verifiable checkpoints

### Phase 1 — cheap wins (safe to do now, no netcode)
1. ✅ **Done.** Seeded PRNG: `mulberry32` promoted to the sim, `w.rng` threaded through `runBot`
   and match setup. Record the seed at kickoff.
2. Pull the side effects out of `step()`: it emits an **event list** (`goal`, `wall`,
   `net`, `banner`) that the caller drains and turns into audio/DOM/FX. Removes
   `playSfx`, `showBanner`, `updateClock`, `updateScoreUI`, `toast`, `addShake`,
   `spawnKickFx`, `noteWear` from the sim.
3. Pass match config **into** the sim instead of reading `sel.*` live; kill the
   `deckMenuOwnsPad()` read by latching inputs before the frame.
4. Latch inputs once per sim frame (move `pollKeys` off the render path).
5. Frame counter drives the sim; juice/slow-mo/`matchSpeed`/`hitStop` become render
   concerns; the `steps < 5` drop becomes a configurable "block, don't drop".

> **Checkpoint 1** — same seed + a scripted input log produce an identical state
> hash at frame 3,600 across two runs in the same browser, and the existing 30-suite
> test run stays green. Verifiable by you: `node tests/run.mjs` plus a new
> `determinism` suite printing the frame-3600 hash.

### Phase 2 — fixed-point core
6. Fixed-point primitives module (add/sub/mul/div/sqrt/sin/cos/atan2/clamp/vec).
7. Convert state to `Int32Array` SoA; convert integrator, collisions, magnet/trap,
   bot AI. Rendering converts at the boundary only.
8. Replace all 42 `Math.hypot` — most become squared-distance comparisons.

> **Checkpoint 2** — same seed + inputs give an identical hash on **Chrome desktop,
> Chrome Android and Firefox**, at frames 600 / 3,600 / 18,000. This is the one that
> actually proves cross-machine determinism.

### Phase 3 — lockstep readiness
9. Per-frame input struct, frame-numbered, bit-packed (dx/dy quantised to 8 bits
   each + button bits ≈ 3 bytes/frame/player).
10. Configurable input delay buffer, default 2 frames.
11. Per-frame state checksum (FNV-1a over the Int32Array) exchanged every N frames;
    on mismatch, log the first divergent frame + both state dumps.

> **Checkpoint 3** — two tabs, artificial 120ms latency, 10,000 frames, zero desync;
> deliberately corrupting one peer's state is detected within N frames and names the
> exact frame.

### Phase 4 — replay
12. Match log: `{seed, config, inputs[], snapshots[]}` with a full snapshot every
    ~2s for seeking and drift safety.
13. Headless entry point running the sim with no DOM, so frames can be piped to a
    renderer offline.

> **Checkpoint 4** — a recorded match replays to a byte-identical final state, and
> seeking to any snapshot then playing forward converges with the original.

**Rollback is not blocked by any of this**: SoA `Int32Array` state with a ring of
snapshots is exactly the shape rollback wants later.

---

## 8. Decisions needed from you

1. **Determinism bar.** Bit-exact across *engines* (Chrome + Firefox + Safari) means
   Phase 2 is mandatory. If every peer is Chromium you *might* survive on floats —
   but not reliably, because V8 delegates some transcendentals to the platform libm,
   so Android and Linux can still differ. My recommendation is to do Phase 2.
2. **Juice in netplay.** Slow-mo, hit-stop and `matchSpeed` currently change how many
   sim steps run per second. Make them render-only, or disable them in multiplayer?
3. **Bots in P2P matches.** They're deterministic once seeded — do you want them in
   netplay at all, or humans only?
4. **The wear layer** (mud churn / ice cuts) is stamped from `integrate()` into a
   canvas. It's purely cosmetic — I'd move it to the render side and drive it from
   the emitted event list. Confirm that's fine.
5. **Existing replays.** `repBuf` currently records rendered *snapshots*. Keep it as
   the "instant replay" feature and add the input-log format alongside, or replace
   it outright?
6. **Input delay default.** 2 frames (~33ms) as you suggested — fixed, or exposed as
   a per-match setting?
7. **Q16.16** — confirm, or say if you'd rather trade resolution for range.
8. **Scope of the sim boundary.** Does the sim own match state only (score, clock,
   state machine), or also progression side effects like `recordResult`? I'd keep
   progression strictly outside.
