# Magnetball — determinism audit (Phase 0)

Target: P2P WebRTC lockstep across phone / desktop browser / Linux browser, plus
reproducible replays re-renderable to video. No authoritative server.

Audited build: **v20260804.0146AM**, `index.html` (~6,850 lines, single file).
Nothing has been refactored — this is the report only.

---

> ## ✅ CLOSED — the bar is **same-engine reproducibility**, and it is met.
>
> The owner's decision (2026-08-06): replays and matches must reproduce **exactly on one
> browser engine**. Cross-engine bit-equality is explicitly **not** a goal, so §6's fixed-point
> work and Phases 2–3 below are **parked, not pending**. They are kept as a record of what the
> job would involve if peer-to-peer lockstep is ever wanted; nothing in the codebase is waiting
> on them.
>
> **What that buys, concretely.** A pinned seed plus the same inputs produce a bit-identical
> match in the same browser: that is what replays, the idle demo, saved clips and every
> determinism-sensitive test rely on, and all of them are single-engine by construction.
>
> **What it does not buy.** A match seed shared between Chrome and Firefox — or between Chrome
> on Android and Chrome on Linux — may diverge, because §3b's transcendentals are
> implementation-approximated. Do not build a feature that assumes otherwise. If P2P lockstep
> is ever on the table, this decision is the first thing to revisit.
>
> **What still binds, and is enforced by tests.** The seeded-PRNG rule: AI randomness goes
> through `w.rng`, and `Math.random` is never called from inside `step()`. `tests/botai.mjs`
> monkey-patches `Math.random` during a match and asserts the AI never reaches for it;
> `tests/determinism.mjs` hashes the whole world at frame 3,600 across two runs on one seed and
> requires them identical — Checkpoint 1 below, standing as a permanent regression guard rather
> than a one-off milestone. `tests/kqberry.mjs` holds the same line for berry spawns.
>
> Everything below §1 is the original Phase 0 report, unedited. It is still an accurate
> description of the engine; only the *plan* changed.

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

### Phase 1 — cheap wins (safe to do now, no netcode)  — item 1 done, 2–5 parked with Phase 2
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

### Phase 2 — fixed-point core  ⏸ PARKED (see §8.1)
6. Fixed-point primitives module (add/sub/mul/div/sqrt/sin/cos/atan2/clamp/vec).
7. Convert state to `Int32Array` SoA; convert integrator, collisions, magnet/trap,
   bot AI. Rendering converts at the boundary only.
8. Replace all 42 `Math.hypot` — most become squared-distance comparisons.

> **Checkpoint 2** — same seed + inputs give an identical hash on **Chrome desktop,
> Chrome Android and Firefox**, at frames 600 / 3,600 / 18,000. This is the one that
> actually proves cross-machine determinism.

### Phase 3 — lockstep readiness  ⏸ PARKED (see §8.1)
9. Per-frame input struct, frame-numbered, bit-packed (dx/dy quantised to 8 bits
   each + button bits ≈ 3 bytes/frame/player).
10. Configurable input delay buffer, default 2 frames.
11. Per-frame state checksum (FNV-1a over the Int32Array) exchanged every N frames;
    on mismatch, log the first divergent frame + both state dumps.

> **Checkpoint 3** — two tabs, artificial 120ms latency, 10,000 frames, zero desync;
> deliberately corrupting one peer's state is detected within N frames and names the
> exact frame.

### Phase 4 — replay  ⏸ PARKED (see §8.5)
12. Match log: `{seed, config, inputs[], snapshots[]}` with a full snapshot every
    ~2s for seeking and drift safety.
13. Headless entry point running the sim with no DOM, so frames can be piped to a
    renderer offline.

> **Checkpoint 4** — a recorded match replays to a byte-identical final state, and
> seeking to any snapshot then playing forward converges with the original.

**Rollback is not blocked by any of this**: SoA `Int32Array` state with a ring of
snapshots is exactly the shape rollback wants later.

---

## 8. Decisions taken

Settled 2026-08-06. Recorded here so the next person does not reopen them by accident.

1. **Determinism bar → same engine only.** Not bit-exact across Chrome / Firefox / Safari, and
   not across platforms within Chromium. Phase 2 is parked. This is the decision every other
   one below follows from.
2. **Juice in netplay → moot.** Slow-mo, hit-stop and `matchSpeed` change how many sim steps
   run per second, which would matter in lockstep. There is no lockstep, so they stay exactly
   as they are. If netplay ever happens, this is the second thing to fix after §3b.
3. **Bots in P2P → moot.** No P2P. Bots stay seeded and deterministic regardless, because
   replays and tests depend on it.
4. **The wear layer stays in `integrate()`.** It is cosmetic and stamping it from the sim costs
   nothing without netcode. Moving it would be pure churn.
5. **Replays stay snapshot-based.** `repBuf` records rendered snapshots and keeps doing so. An
   input-log format only pays for itself with lockstep or with cross-engine playback, and
   neither is a goal.
6. **Input delay → moot.** No rollback, no delay to configure.
7. **Q16.16 → moot.** No fixed-point conversion.
8. **The sim boundary holds where it is:** match state inside, progression (`recordResult`,
   RP, MMR, unlocks) strictly outside. That was already true and is worth keeping true.

### The one rule that survived all of this

**Never call `Math.random` from inside `step()`.** Everything the single-engine guarantee is
worth rests on that one line, and it is the only part of this document that is enforced rather
than merely written down.
