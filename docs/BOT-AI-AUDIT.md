# Bot AI — Phase 0 audit

Read-only audit of the existing bot AI, ahead of the four-layer rework. **No code has
been changed.** Every number below is measured against the shipped build, not estimated.

Repro scripts used are throwaway; the two that matter are reproduced inline so you can
re-run them after any change.

---

## 1. Where the AI lives and how it's structured

| | |
|---|---|
| **Location** | `index.html`, one function: `runBot(w, p)` at ~line 5382. ~125 lines. |
| **Structure** | A flat if-chain, not an FSM. No states, no roles beyond one index parity test, no memory between ticks except `p.aiT` / `p.aiTarget` / `p.aiKick`. |
| **Call site** | `step(w)` → the input-gathering loop: `else if (p.ctrl==='bot') runBot(w, p);` — the same loop that calls `applyHumanInput` for humans. |
| **Per-bot state** | `mkPlayer` seeds `aiT:0, aiTarget:{x,y}, aiKick:false`. Nothing else. |

The whole decision tree is:

```
state === 'kickoff'  →  walk back to homeX/homeY, never kick
otherwise:
  iAmChaser (nearest teammate to the ball)?
    yes → standoff point behind the ball… unless dBall < 43, then charge forward
          + maybe pick a pass target (35% coin flip)
    no  → mates.indexOf(p) % 2 === 0 ? defender line : wide attacker
  + separation from teammates
  + kick if in range and roughly behind the ball
```

## 2. How bots produce input

**Mostly through the same fields as humans — with two exceptions.**

Bots write `p.inX`, `p.inY`, `p.faceX`, `p.faceY`, `p.kick`, which is exactly the set
`applyHumanInput` writes. `integrate()` then applies `p.inX/inY * accel` identically for
both. So movement is honest: no position or velocity writes, no teleports, no bot-only
forces. Good starting point.

The two exceptions:

1. **`handleBallControl` has a bot-only branch** (line 4936). Bots get an instant one-shot
   kick scaled by `w.diff.power` (0.72 → 1.15). They never trap, never charge, and never
   touch `chargeT` — the charge accumulator runs for them but the bot branch ignores it.
   Humans in the default (non-Pro) mode get tap-to-pass / hold-to-trap / release-to-shoot
   with a `CHARGE.bonus` of up to +90%.
2. **Bots set `faceX/faceY` directly** to their aim vector on the frame they kick. Humans
   can only set facing via the stick. This turns out to be *cosmetic*: the kick impulse
   direction (line 4940) is the **player→ball unit vector**, not the facing. Facing only
   feeds the ball-magnet target and the drawn sprite.

**Consequence that shapes the whole plan:** aiming is done purely by *where the bot stands
relative to the ball*. There is no aim input. "Kick at goal", "pass to a teammate" and
"bank off a wall" are all the same act — position yourself on the opposite side of the
ball from the target, then press KICK. That is a good fit for what you asked for, and it
means the standoff/tangent work in step 1 **is** the aiming system, not just pathing.

## 3. Tick rates

Physics and steering: **60 Hz** (`STEP = 1/60`, fixed-timestep accumulator).

Decision recompute is per-bot, gated by `p.aiT` and derived from `diff.react`:

| Difficulty | `react` | recompute period | rate |
|---|---|---|---|
| Rookie | 0.58 | 0.152 s | 6.6 Hz |
| Easy | 0.72 | 0.112 s | 8.9 Hz |
| Normal | 0.85 | 0.076 s | 13.2 Hz |
| Hard | 0.95 | 0.048 s | 20.8 Hz |
| Pro | 1.00 | 0.034 s | 29.4 Hz |
| Elite | 1.05 | 0.020 s | 50 Hz |
| Insane | 1.10 | 0.006 s | **60 Hz (every tick)** |

Three notes:

- Only the **target point** is throttled. `p.kick` is recomputed **every tick**, outside
  the throttle (deliberately — the comment says "or it doesn't connect").
- All bots initialise `aiT: 0` and nothing ever staggers them, so **every bot on the pitch
  recomputes on the same tick**. There is no phase offset.
- At Elite/Insane the throttle is below one tick, so it does nothing at all.

## 4. Where the oscillation comes from

**One condition, and it is a geometry bug, not a tuning problem.**

The chaser's target is computed twice in the same branch:

```js
// standoff point BEHIND the ball, on the goal side — the correct waypoint
target = { x: abx - toGoalX*(p.r+ball.r+2), y: aby - toGoalY*(p.r+ball.r+2) };   // 27 units from the ball
...
if (dB < p.r+ball.r+18){                                                          // 43 units from the ball
  target = { x: p.x + p.faceX*40, y: p.y + p.faceY*40 };                          // charge FORWARD instead
}
```

The standoff waypoint sits **27 units** from the ball centre. The condition that throws
that waypoint away triggers at **43 units**. The goal is inside the region where the goal
is discarded, so the bot can never arrive at it:

1. dBall > 43 → aim at the standoff point → bot closes in
2. dBall < 43 → target flips to "drive forward through the ball toward goal"
3. that drives it *away* from the standoff point → dBall grows past 43
4. → back to (1). Forever.

Measured, ball parked dead at centre, 1v1 Normal, bot starting 55 units on the wrong side:

```
t  0 dBall=  55  botVy=-0.36  target=(10,-24)     ← standoff point (behind the ball)
t 12 dBall=36.3  botVy=-0.80  target=(-3, 83)     ← flipped: charge forward
t 24 dBall=50.4  botVy= 2.32  target=( 9, 75)     ← now too far again
t 30 dBall=53.9  botVy=-0.44  target=( 7,-35)     ← flipped back
t 42 dBall=34.7  botVy=-0.85  target=(12, 72)
...repeats on a 30-tick cycle for the full 4 s, ball never moves
```

**16 velocity sign reversals in 4 seconds. The bot never reaches the ball.**

Four things make it worse, all secondary to the above:

- **No hysteresis anywhere.** One threshold, used for both entry and exit.
- **No dwell time.** The branch can flip on consecutive recomputes.
- **The side test is 1-D**: `behindOk = ((p.y - by) * attackDir < 4)` ignores `x`
  entirely, so a bot level with the ball but 200 units wide reads as "behind" it.
- **Fresh noise every recompute**: `(rand()-0.5) * diff.err * 1.4` is re-rolled into the
  target each time, which flips the branch on its own near the boundary.
- **No path around the ball.** Reaching a standoff point on the far side means walking
  through the ball, so `collideDiscs` shoves the ball, which moves the standoff point.

### The oscillation is worst at high difficulty, and it inverts the difficulty curve

60 s of self-play with the human parked motionless. `ballContact` = share of ticks with at
least one bot within kick range of the ball:

| Mode | Difficulty | reversals/bot/s | ball contact | score |
|---|---|---|---|---|
| 1v1 | Easy | 0.32 | **11 %** | 1–1 |
| 1v1 | Normal | 0.42 | **16 %** | 0–0 |
| 1v1 | Hard | 4.22 | **0 %** | 0–0 |
| 1v1 | Insane | 1.20 | **0 %** | 0–0 |
| 2v2 | Normal | 0.33 | 18 % | 0–0 |
| 2v2 | Hard | 2.73 | 2 % | 0–0 |
| 4v4 | Normal | 0.37 | 31 % | 0–0 |
| 4v4 | Hard | 1.22 | 2 % | 0–0 |
| 4v4 | Insane | 4.97 | 1 % | 0–0 |

Faster recompute tightens the limit cycle instead of loosening it, so **Hard and above
essentially never reach a loose ball**. Easy bots are measurably better at it than Insane
bots. It doesn't read that way in play only because a human keeps knocking the ball out of
the cycle. This has a direct consequence for your constraint 5 — see §8.

## 5. What the difficulty knobs actually change

`DIFF = { react, err, power, aggr }`:

| Knob | Used at | What it really does |
|---|---|---|
| `react` | line 5402 | Target-recompute period only. **Not** a reaction delay — there is no delay anywhere; a recompute applies on the same tick. Higher = tighter oscillation (see above). |
| `err` | 5424, 5466–67 | Two different things sharing one number: a ±`err`° aim rotation applied to *facing* (which the kick doesn't read, so it is nearly inert), and a ±`err*1.4` unit positional jitter on the target (which is the one that actually matters). |
| `power` | 4941 | Kick impulse multiplier in the bot-only `handleBallControl` branch, 0.72 → 1.15. |
| `aggr` | — | **Dead.** Declared for all seven tiers, never read anywhere in the file. The comment "Aggression scales how far up defenders push" sits above code that doesn't use it. |

So of four advertised knobs, one is dead, one is misnamed and partly inert, and one
(`react`) currently makes bots *worse* at the thing it claims to improve.

## 6. Existing team / role logic

Almost none.

- **Chaser** = nearest teammate to the ball by squared distance. Recomputed every tick,
  no hysteresis, so it flickers when two bots are near-equidistant.
- **Everyone else** = `mates.indexOf(p) % 2 === 0` → defender (sit 35–38 % along the line
  from own goal to the ball), else → wide attacker (150 units upfield of the ball, on the
  opposite touchline from it). Parity of an array index. Not a role assignment; it never
  reconsiders, and it doesn't know about the opposition.
- **No goalie.** Nothing stays home. In 4v4 the "defender" slot floats out to 38 % of the
  way to the ball, which is nowhere near the goal line.
- **Separation** exists already and is decent: a 64-unit repulsion from teammates blended
  into the stick at weight 0.55, applied after normalisation. It is the one piece worth
  keeping largely as-is.
- **Marking, covering, pressing, second-defender logic:** none. Every non-chaser ignores
  the opposition entirely.
- **Formation:** `layTeam` sets `homeX/homeY` at kickoff (spread ±140, depth 30 % / 55 %
  of the half). Used *only* to stand still during kickoff; never referenced again in play.

## 7. Is the AI inside the deterministic sim?

**Structurally yes, numerically no.**

- `runBot` is called from `step(w)`, inside the fixed-timestep accumulator. It reads only
  world state (`w.players`, `w.ball`, `w.field`, `w.diff`, `w.state`, `w.kickoffRule`).
  No DOM reads, no `sel` reads, no timers, no `Date.now`/`performance.now`.
- All iteration is over arrays (`w.players`, `filter` results) in stable order. **No
  unordered collection iteration.** Good.
- **But `rand()` is `Math.random()`** — line 5512, with a comment that says
  "Deterministic-ish PRNG so Math.random works fine here". It is not deterministic and it
  is called 3× per bot per recompute. This is already logged in
  `docs/DETERMINISM-AUDIT.md` as the top-priority sim non-determinism.

So the AI is *in the right place* but currently breaks lockstep and replay
reproducibility on its own. Seeding it is a prerequisite for everything else, not an
optional extra.

## 8. Where I need a decision from you

These are the points where the constraints you set conflict with each other or with the
code as it stands. I've stopped rather than guessed.

### 8a. Fixing the oscillation *will* make Hard+ much stronger — that is unavoidable

Constraint 1 says don't change tuning values. Constraint 5 says preserve difficulty
balance. Right now Hard/Pro/Elite/Insane get 0–2 % ball contact **because** of the bug. Fix
the bug and they will play enormously better at the same `DIFF` numbers. I cannot have
both without re-tuning the `DIFF` table.

Three options:

- **(A) Re-tune `DIFF` so measured strength lands where it is today.** I'd derive the new
  numbers from measured win-rate and ball-contact against a fixed scripted opponent, and
  show you before/after. Touches tuning values — needs your sign-off.
- **(B) Leave `DIFF` alone and accept that every tier above Normal gets harder.** Simplest,
  honest, but Insane becomes genuinely brutal and the RP/MMR ladder (`DIFF_RATING`) would
  be mis-calibrated.
- **(C) Keep `DIFF` and add a separate, defaulted-off "smooth AI" toggle** so today's
  behaviour stays reachable. Safest for balance, but it means shipping the bug on purpose
  and doubling the test surface.

**My recommendation: (A).** It is the only one that satisfies "feels like today, only
smoother". I'd want to agree the target metric first — win rate vs. a fixed opponent is
the honest one.

### 8b. Should bots use the human ball-interaction path?

Your constraint 2 says bots emit KICK "including hold-to-charge and release". They
currently don't — they have a bot-only instant kick with a `diff.power` multiplier. Moving
them onto the human path (tap = pass, hold = trap, release = shoot) would:

- satisfy constraint 2 properly and let bots dribble, which would look far better;
- **but** change gameplay (constraint 1) and difficulty (constraint 5), since `diff.power`
  would have to be replaced by charge-time behaviour.

Options: leave the bot branch alone (violates the spirit of constraint 2), or move bots to
the human path as an explicit, separately-checkpointed change. **My recommendation: leave
it for now, ship steps 1–9 on the existing kick, and treat "bots trap and charge like
humans" as its own approved change afterwards** — it's a big enough behavioural shift to
deserve its own before/after.

### 8c. Seeding the PRNG changes today's exact behaviour

Replacing `Math.random()` with a seeded stream is required by constraint 4 and is
Phase 1 of the determinism plan anyway. Bots will behave the same *in character* but not
*identically* to any given past match. Confirming this is fine.

Also: what seeds a match? Options are a fixed constant (every match identical — great for
tests, repetitive to play), the match start time passed in from outside the sim (varied,
still replayable if recorded), or a user-visible seed. **My recommendation: seed stored on
the world, set from outside the sim at `startMatch`, recorded in replays.**

### 8d. `diff.aggr` is dead — wire it up or delete it?

Wiring it up changes balance. Deleting it is a one-line cleanup. It's a natural knob for
"how far up defenders push" in the new formation layer, which is exactly what its comment
claims. **My recommendation: wire it into the formation layer as part of 8a's re-tune.**

### 8e. Bots hold KICK continuously, which halves their acceleration

`integrate()` applies `KICK_SLOW = 0.45` to anyone holding kick. Bots set `p.kick = true`
every tick they're in range and roughly behind the ball, so they crawl at 45 % accel
exactly when they most need to turn. Releasing kick when not actually committing to a
strike is an AI-only change (no mechanics touched) and would help the oscillation on its
own — but it makes bots slightly faster on the ball than today. Include it in step 1, or
hold it for the balance pass?

---

## 9. Proposed plan

Your build order is sound and I'd follow it. Two changes: a **step 0** for the seeded PRNG
(a hard prerequisite), and the balance decision from 8a resolved **before** step 1 lands,
since every later checkpoint is measured against it.

All new tuning lives in one `BOT` config block. Every checkpoint below is a suite you can
run yourself.

| Step | Change | Verifiable checkpoint |
|---|---|---|
| **0** | Seeded PRNG (`mulberry32` on `w.rng`), all AI randomness through it. Stagger `aiT` by bot index. | Two runs from the same seed produce byte-identical input traces; two different seeds differ. |
| **1** | Standoff waypoint that is never discarded, tangent path around the ball, enter/exit hysteresis (0.85 / 0.60), 12-tick dwell, commit flag. | Reversals/bot/s **< 0.5 at every difficulty**; ball contact **> 25 %** at Hard and Insane, i.e. the inversion in §4 is gone. The trace above must converge instead of cycling. |
| **2** | Intercept prediction (3–4 fixed iterations). Low tiers keep using current ball position — that becomes the honest meaning of `react`. | Time-to-ball on a moving ball drops measurably vs. step 1; low tiers unchanged. |
| **3** | Separation as a first-class steering primitive (the existing 64-unit repulsion, reworked and weighted). | `meanBotsOnBall` **< 1.3** in 4v4; no bot pair sustained under 40 units for > 1 s. |
| **4** | Ball-anchored elastic formation with per-role `ballInfluence`; a real goalie slot. | Mean distance from own goal line for the deepest defender stays inside a band; team shape stretches when attacking and compresses when defending, measured. |
| **5** | Aim/kick scoring: goal aperture via both posts, lane capsule checks vs. opponent radii, receiver score. **Aim = approach angle**, since the impulse is player→ball. | Shots taken through a blocked lane drop sharply; own-goal rate stays zero. |
| **6** | Support-spot grid (8×6 over the attacking half), one bot's grid per tick on rotation. | Cost stays flat with player count; support players occupy distinct high-score cells. |
| **7** | Role assignment every ~20 ticks with switch hysteresis; greedy cost matching. | Role changes/bot/minute below a threshold; chaser identity stops flickering. |
| **8** | Wall/bank candidates by mirroring, validated against the **actual** wall segments and restitution. | Bank kick lands within tolerance of the predicted point in a controlled setup. |
| **9** | Feel layer: reaction delay in ticks, seeded aim error as the primary difficulty knob, anticipation limit, single-presser rule. | Difficulty tiers land on their agreed target win rates from 8a. |

### Wall restitution — measured, not assumed

You asked me not to assume the bounce is a perfect mirror. It isn't, and it differs by
surface:

| Surface | `bCoef` | Behaviour |
|---|---|---|
| Boundary walls & corners | **0.90** | Near-elastic. Reflection angle is a true mirror (`v -= (1+e)·(v·n)·n`), but the normal component retains 90 %, so the outgoing path is *shallower* than the incoming one. Bank aim must correct for this. |
| Net (3 segments behind each goal) | **0.20** | Plus an extra `v *= 0.5` on the ball. Effectively dead — never a bank target. |
| Posts | 0.55 | Circles, not segments — mirror maths doesn't apply. |
| Rounded / chamfered corners | 0.90 | Arcs (`collideArc`) for rounded fields, straight segments for Octagon. Two different code paths; the candidate generator has to handle both. |
| `clampBallInside` backstop | **0.30** | Hard containment fallback. Should never fire in normal play — if a bank prediction relies on it, the prediction was wrong. |

Corner geometry varies per field (`corner: 0` on Classic, 120 on Rounded, 110 + `cut` on
Octagon), so mirror candidates must be generated from `w.walls` / `w.arcs` at runtime, not
from a hardcoded rectangle.

### Future suggestions (deliberately NOT implemented — each needs a mechanics change)

1. **Bots that trap and dribble** — needs the bot branch in `handleBallControl` removed
   (§8b). Biggest single visual upgrade available.
2. **Charge-aware shooting** — long-range shots by holding KICK. Same blocker as (1).
3. **A real aim input** — the kick impulse is player→ball, so a bot can only aim by
   walking around the ball. A facing-based or stick-based aim offset would allow first-time
   shots at angles that are currently impossible for anyone, human or bot. Mechanics change.
4. **Goalkeeper mechanics** — no dive, no catch, no goal area. A keeper role can only be a
   positioning heuristic today.
5. **Deliberate wall passes to a teammate** — possible with mirroring, but with `bCoef 0.9`
   and no aim input the accuracy will be poor. Better after (3).
6. **Stamina / pressing triggers** — no stamina exists.
7. **Fixing the `err` knob's dead half** — the ±`err`° facing rotation at line 5424 is
   almost inert because the kick ignores facing. Making it real changes difficulty.

---

*Audit only. Nothing above has been implemented.*
